/**
 * Vanguard Vault — Secretstream Framing & Cryptographic Streaming
 * 
 * Implémentation du chiffrement de flux par blocs basé sur libsodium-wrappers-sumo :
 * - Chiffrement authentifié de flux : crypto_secretstream_xchacha20poly1305
 * - Découpage en blocs de 64 Ko (CHUNK_SIZE = 65536 octets)
 * - Constantes officielles : HEADERBYTES = 24, ABYTES = 17, TAG_MESSAGE = 0, TAG_FINAL = 3
 * - Format de trame : [Header (24 octets)] suivi de blocs [Longueur (4 octets uint32be)] [Chiffré (Longueur octets)]
 * - AAD contextuel obligatoire (35 octets) :
 *     vaultId (16 octets) || fileId (16 octets) || objectType (1 octet: 0x01 payload, 0x02 index) || formatVersion (2 octets)
 * - Règle anti-substitution : interdiction absolue d'intervertir des données entre fichiers ou entre coffres
 * - Gestion unitaire des fichiers vides : 1 bloc unique de 0 octet avec TAG_FINAL
 * - Détection stricte des flux tronqués (absence de TAG_FINAL) et des données surnuméraires après TAG_FINAL
 * - Transactions atomiques sur fichiers : écriture vers staging temporaire, fsync obligatoire, renommage atomique
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSodium, CRYPTO_SIZES, initSodium } from './cryptoPrimitives.ts';

export const STREAM_CONSTANTS = {
  CHUNK_SIZE: 65536, // 64 Ko
  HEADER_BYTES: 24,
  ABYTES: 17,
  TAG_MESSAGE: 0,
  TAG_PUSH: 1,
  TAG_REKEY: 2,
  TAG_FINAL: 3,
  OBJECT_TYPE_PAYLOAD: 0x01,
  OBJECT_TYPE_INDEX: 0x02,
  AAD_SIZE: 35,
  FRAME_LENGTH_PREFIX_SIZE: 4,
  MIN_CHUNK_CIPHERTEXT: 17, // 0 octet plaintext + 17 octets MAC/Tag
  MAX_CHUNK_CIPHERTEXT: 65536 + 17, // 65553 octets
  FORMAT_VERSION: 1,
};

export class DestinationConflictError extends Error {
  constructor(targetPath: string) {
    super(`Conflit de destination : la cible existe déjà ou est apparue pendant l'opération (${targetPath}).`);
    this.name = 'DestinationConflictError';
  }
}

/**
 * Publie un fichier temporaire vers sa destination en respectant la politique d'écrasement
 */
async function publishDecryptedFile(
  tempPath: string,
  destPath: string,
  overwrite: boolean
): Promise<void> {
  if (overwrite) {
    await fs.promises.rename(tempPath, destPath);
    return;
  }

  // Si overwrite est faux : refus strict d'écraser la cible et protection anti-TOCTOU
  if (fs.existsSync(destPath)) {
    throw new DestinationConflictError(destPath);
  }

  // Publication atomique exclusive via lien matériel
  try {
    await fs.promises.link(tempPath, destPath);
    await fs.promises.unlink(tempPath);
  } catch (linkErr: any) {
    if (linkErr.code === 'EEXIST') {
      throw new DestinationConflictError(destPath);
    }
    // Repli si les liens matériels ne sont pas supportés : création avec drapeau O_EXCL
    let exclusiveHandle: fs.promises.FileHandle | null = null;
    try {
      exclusiveHandle = await fs.promises.open(
        destPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600
      );
      const data = await fs.promises.readFile(tempPath);
      await exclusiveHandle.write(data);
      await exclusiveHandle.sync();
      await exclusiveHandle.close();
      exclusiveHandle = null;
      await fs.promises.unlink(tempPath);
    } catch (exclErr: any) {
      if (exclusiveHandle) {
        try { await exclusiveHandle.close(); } catch {}
      }
      if (exclErr.code === 'EEXIST') {
        throw new DestinationConflictError(destPath);
      }
      throw exclErr;
    }
  }
}

/**
 * Convertit une chaîne UUID (avec ou sans tirets) en Uint8Array de 16 octets
 */
export function uuidToBytes(uuidStr: string): Uint8Array {
  if (!uuidStr || typeof uuidStr !== 'string') {
    throw new Error('L\'identifiant UUID doit être une chaîne non vide.');
  }
  const cleanHex = uuidStr.replace(/-/g, '').toLowerCase();
  if (cleanHex.length !== 32 || !/^[0-9a-f]{32}$/.test(cleanHex)) {
    throw new Error(`Format UUID invalide : ${uuidStr} (attendu 32 caractères hexadécimaux).`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convertit un Uint8Array de 16 octets en chaîne UUID formatée standard (8-4-4-4-12)
 */
export function bytesToUuid(bytes: Uint8Array): string {
  if (!bytes || bytes.length !== 16) {
    throw new Error('Les octets UUID doivent comporter exactement 16 octets.');
  }
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Construit les Données Authentifiées Associées (AAD) contextuelles obligatoires
 * AAD = vaultId (16B) || fileId (16B) || objectType (1B) || formatVersion (2B uint16be)
 */
export function buildStreamAad(
  vaultId: Uint8Array | string,
  fileId: Uint8Array | string,
  objectType: number,
  formatVersion: number = STREAM_CONSTANTS.FORMAT_VERSION
): Uint8Array {
  const vId = typeof vaultId === 'string' ? uuidToBytes(vaultId) : vaultId;
  const fId = typeof fileId === 'string' ? uuidToBytes(fileId) : fileId;

  if (!vId || vId.length !== 16) {
    throw new Error('Identifiant Vault ID invalide (attendu 16 octets).');
  }
  if (!fId || fId.length !== 16) {
    throw new Error('Identifiant File ID invalide (attendu 16 octets).');
  }
  if (
    objectType !== STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD &&
    objectType !== STREAM_CONSTANTS.OBJECT_TYPE_INDEX
  ) {
    throw new Error(`Type d'objet invalide : ${objectType} (attendu 0x01 payload ou 0x02 index).`);
  }
  if (typeof formatVersion !== 'number' || formatVersion < 1 || formatVersion > 65535) {
    throw new Error(`Version de format invalide pour l'AAD : ${formatVersion}`);
  }

  const aad = new Uint8Array(STREAM_CONSTANTS.AAD_SIZE);
  aad.set(vId, 0);              // 0..15 (16B)
  aad.set(fId, 16);             // 16..31 (16B)
  aad[32] = objectType & 0xFF;  // 32 (1B)
  aad[33] = (formatVersion >>> 8) & 0xFF; // 33 (1B)
  aad[34] = formatVersion & 0xFF;        // 34 (1B)

  return aad;
}

/**
 * Chiffre un buffer en mémoire avec framing Secretstream
 */
export function encryptBuffer(
  plaintext: Uint8Array,
  subkey: Uint8Array,
  aad: Uint8Array
): Uint8Array {
  const s = getSodium();
  if (subkey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error(`Taille de sous-clé invalide (${subkey.length} octets, attendu ${CRYPTO_SIZES.MASTER_KEY_BYTES}).`);
  }
  if (aad.length !== STREAM_CONSTANTS.AAD_SIZE) {
    throw new Error(`Taille d'AAD contextuel invalide (${aad.length} octets, attendu ${STREAM_CONSTANTS.AAD_SIZE}).`);
  }

  const pushState = s.crypto_secretstream_xchacha20poly1305_init_push(subkey);
  const header = pushState.header; // 24 octets

  // Cas fichier vide : bloc unique de 0 octet avec TAG_FINAL
  if (plaintext.length === 0) {
    const cipherChunk = s.crypto_secretstream_xchacha20poly1305_push(
      pushState.state,
      new Uint8Array(0),
      aad,
      STREAM_CONSTANTS.TAG_FINAL
    );
    const out = new Uint8Array(STREAM_CONSTANTS.HEADER_BYTES + STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + cipherChunk.length);
    out.set(header, 0);
    const len = cipherChunk.length;
    out[STREAM_CONSTANTS.HEADER_BYTES] = (len >>> 24) & 0xFF;
    out[STREAM_CONSTANTS.HEADER_BYTES + 1] = (len >>> 16) & 0xFF;
    out[STREAM_CONSTANTS.HEADER_BYTES + 2] = (len >>> 8) & 0xFF;
    out[STREAM_CONSTANTS.HEADER_BYTES + 3] = len & 0xFF;
    out.set(cipherChunk, STREAM_CONSTANTS.HEADER_BYTES + STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE);
    return out;
  }

  // Découpage en blocs de 64 Ko
  const chunks: Uint8Array[] = [];
  let totalCipherBytes = 0;
  const totalLength = plaintext.length;

  for (let offset = 0; offset < totalLength; offset += STREAM_CONSTANTS.CHUNK_SIZE) {
    const isLast = (offset + STREAM_CONSTANTS.CHUNK_SIZE >= totalLength);
    const tag = isLast ? STREAM_CONSTANTS.TAG_FINAL : STREAM_CONSTANTS.TAG_MESSAGE;
    const end = Math.min(offset + STREAM_CONSTANTS.CHUNK_SIZE, totalLength);
    const chunkPlain = plaintext.subarray(offset, end);

    const cipherChunk = s.crypto_secretstream_xchacha20poly1305_push(
      pushState.state,
      chunkPlain,
      aad,
      tag
    );

    chunks.push(cipherChunk);
    totalCipherBytes += STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + cipherChunk.length;
  }

  const out = new Uint8Array(STREAM_CONSTANTS.HEADER_BYTES + totalCipherBytes);
  out.set(header, 0);
  let writeOffset = STREAM_CONSTANTS.HEADER_BYTES;

  for (const cChunk of chunks) {
    const len = cChunk.length;
    out[writeOffset++] = (len >>> 24) & 0xFF;
    out[writeOffset++] = (len >>> 16) & 0xFF;
    out[writeOffset++] = (len >>> 8) & 0xFF;
    out[writeOffset++] = len & 0xFF;
    out.set(cChunk, writeOffset);
    writeOffset += len;
  }

  return out;
}

/**
 * Déchiffre un buffer en mémoire avec vérification stricte du framing Secretstream
 */
export function decryptBuffer(
  ciphertext: Uint8Array,
  subkey: Uint8Array,
  aad: Uint8Array
): Uint8Array {
  const s = getSodium();
  if (subkey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error(`Taille de sous-clé invalide (${subkey.length} octets, attendu ${CRYPTO_SIZES.MASTER_KEY_BYTES}).`);
  }
  if (aad.length !== STREAM_CONSTANTS.AAD_SIZE) {
    throw new Error(`Taille d'AAD contextuel invalide (${aad.length} octets, attendu ${STREAM_CONSTANTS.AAD_SIZE}).`);
  }

  const minExpectedSize = STREAM_CONSTANTS.HEADER_BYTES + STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + STREAM_CONSTANTS.MIN_CHUNK_CIPHERTEXT;
  if (!ciphertext || ciphertext.length < minExpectedSize) {
    throw new Error('Données chiffrées corrompues ou incomplètes (taille insuffisante).');
  }

  const header = ciphertext.subarray(0, STREAM_CONSTANTS.HEADER_BYTES);
  let pullState: any;
  try {
    pullState = s.crypto_secretstream_xchacha20poly1305_init_pull(header, subkey);
  } catch (err: any) {
    throw new Error(`Échec d'initialisation Secretstream pull : ${err?.message}`);
  }

  let readOffset = STREAM_CONSTANTS.HEADER_BYTES;
  const decryptedChunks: Uint8Array[] = [];
  let totalPlainBytes = 0;
  let hasReceivedFinalTag = false;

  while (readOffset < ciphertext.length) {
    if (hasReceivedFinalTag) {
      throw new Error('Données surnuméraires détectées après le bloc final.');
    }

    if (readOffset + STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE > ciphertext.length) {
      throw new Error('Flux tronqué : longueur de trame incomplète.');
    }

    const chunkLen = (
      (ciphertext[readOffset] << 24) |
      (ciphertext[readOffset + 1] << 16) |
      (ciphertext[readOffset + 2] << 8) |
      ciphertext[readOffset + 3]
    ) >>> 0;
    readOffset += STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE;

    if (
      chunkLen < STREAM_CONSTANTS.MIN_CHUNK_CIPHERTEXT ||
      chunkLen > STREAM_CONSTANTS.MAX_CHUNK_CIPHERTEXT
    ) {
      throw new Error(`Taille de bloc invalide : ${chunkLen} octets (autorisé : ${STREAM_CONSTANTS.MIN_CHUNK_CIPHERTEXT}-${STREAM_CONSTANTS.MAX_CHUNK_CIPHERTEXT}).`);
    }

    if (readOffset + chunkLen > ciphertext.length) {
      throw new Error(`Flux tronqué : bloc annoncé de ${chunkLen} octets dépasse les données restantes (${ciphertext.length - readOffset} octets).`);
    }

    const cipherChunk = ciphertext.subarray(readOffset, readOffset + chunkLen);
    readOffset += chunkLen;

    const res = s.crypto_secretstream_xchacha20poly1305_pull(pullState, cipherChunk, aad);
    if (res === false || !res) {
      throw new Error('Échec d\'authentification Secretstream : bloc altéré, clé invalide ou AAD incorrect.');
    }

    decryptedChunks.push(res.message);
    totalPlainBytes += res.message.length;

    if (res.tag === STREAM_CONSTANTS.TAG_FINAL) {
      hasReceivedFinalTag = true;
    } else if (res.tag !== STREAM_CONSTANTS.TAG_MESSAGE) {
      throw new Error(`Tag Secretstream non pris en charge : ${res.tag}`);
    }
  }

  if (!hasReceivedFinalTag) {
    throw new Error('Flux tronqué : fin de fichier inattendue sans bloc TAG_FINAL.');
  }

  const out = new Uint8Array(totalPlainBytes);
  let writeOffset = 0;
  for (const chunk of decryptedChunks) {
    out.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return out;
}

/**
 * Lit exactement `count` octets depuis un file descriptor asynchrone
 */
async function readExact(
  handle: fs.promises.FileHandle,
  buf: Buffer,
  count: number
): Promise<void> {
  let bytesReadTotal = 0;
  while (bytesReadTotal < count) {
    const { bytesRead } = await handle.read(
      buf,
      bytesReadTotal,
      count - bytesReadTotal,
      null
    );
    if (bytesRead === 0) {
      throw new Error(`Fin de flux inattendue (${bytesReadTotal}/${count} octets lus).`);
    }
    bytesReadTotal += bytesRead;
  }
}

/**
 * Chiffre un fichier source vers un fichier destination avec streaming par blocs,
 * staging temporaire, fsync et renommage atomique.
 */
export async function encryptFile(
  sourcePath: string,
  destPath: string,
  subkey: Uint8Array,
  aad: Uint8Array,
  options?: {
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<{ bytesWritten: number; plaintextBytes: number }> {
  const s = getSodium();
  if (subkey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error(`Taille de sous-clé invalide (${subkey.length} octets).`);
  }
  if (aad.length !== STREAM_CONSTANTS.AAD_SIZE) {
    throw new Error(`Taille d'AAD contextuel invalide (${aad.length} octets).`);
  }

  const sourceStat = await fs.promises.stat(sourcePath);
  const totalPlainBytes = sourceStat.size;

  const destDir = path.dirname(destPath);
  await fs.promises.mkdir(destDir, { recursive: true });

  const tempDestPath = `${destPath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

  let readHandle: fs.promises.FileHandle | null = null;
  let writeHandle: fs.promises.FileHandle | null = null;
  let totalCipherBytesWritten = 0;
  let totalPlainBytesRead = 0;

  try {
    readHandle = await fs.promises.open(sourcePath, 'r');
    writeHandle = await fs.promises.open(tempDestPath, 'w', 0o600);

    const pushState = s.crypto_secretstream_xchacha20poly1305_init_push(subkey);
    await writeHandle.write(pushState.header);
    totalCipherBytesWritten += STREAM_CONSTANTS.HEADER_BYTES;

    // Cas fichier vide (0 octet)
    if (totalPlainBytes === 0) {
      if (options?.abortSignal?.aborted) throw new Error('OPERATION_CANCELLED');
      const cipherChunk = s.crypto_secretstream_xchacha20poly1305_push(
        pushState.state,
        new Uint8Array(0),
        aad,
        STREAM_CONSTANTS.TAG_FINAL
      );
      const prefixBuf = Buffer.alloc(STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE);
      prefixBuf.writeUInt32BE(cipherChunk.length, 0);
      await writeHandle.write(prefixBuf);
      await writeHandle.write(cipherChunk);
      totalCipherBytesWritten += STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + cipherChunk.length;
      options?.onProgress?.(0, 0);
    } else {
      // Streaming par blocs de 64 Ko
      const readBuf = Buffer.alloc(STREAM_CONSTANTS.CHUNK_SIZE);
      let pendingChunk: Buffer | null = null;

      while (true) {
        if (options?.abortSignal?.aborted) throw new Error('OPERATION_CANCELLED');

        const { bytesRead } = await readHandle.read(readBuf, 0, STREAM_CONSTANTS.CHUNK_SIZE, null);
        totalPlainBytesRead += bytesRead;

        if (bytesRead === 0) {
          // EOF : le bloc en attente était le dernier
          if (pendingChunk) {
            const cipherChunk = s.crypto_secretstream_xchacha20poly1305_push(
              pushState.state,
              pendingChunk,
              aad,
              STREAM_CONSTANTS.TAG_FINAL
            );
            const prefixBuf = Buffer.alloc(STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE);
            prefixBuf.writeUInt32BE(cipherChunk.length, 0);
            await writeHandle.write(prefixBuf);
            await writeHandle.write(cipherChunk);
            totalCipherBytesWritten += STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + cipherChunk.length;
            pendingChunk = null;
            options?.onProgress?.(totalPlainBytes, totalPlainBytes);
          }
          break;
        }

        // Si nous avions un bloc précédent, il n'était pas final -> TAG_MESSAGE
        if (pendingChunk) {
          const cipherChunk = s.crypto_secretstream_xchacha20poly1305_push(
            pushState.state,
            pendingChunk,
            aad,
            STREAM_CONSTANTS.TAG_MESSAGE
          );
          const prefixBuf = Buffer.alloc(STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE);
          prefixBuf.writeUInt32BE(cipherChunk.length, 0);
          await writeHandle.write(prefixBuf);
          await writeHandle.write(cipherChunk);
          totalCipherBytesWritten += STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + cipherChunk.length;
          options?.onProgress?.(totalPlainBytesRead - bytesRead, totalPlainBytes);
        }

        pendingChunk = Buffer.from(readBuf.subarray(0, bytesRead));
      }
    }

    // Synchronisation physique des blocs sur disque
    await writeHandle.sync();
    await writeHandle.close();
    writeHandle = null;

    await readHandle.close();
    readHandle = null;

    // Remplacement atomique de la cible
    await fs.promises.rename(tempDestPath, destPath);

    return {
      bytesWritten: totalCipherBytesWritten,
      plaintextBytes: totalPlainBytes,
    };
  } catch (err) {
    if (writeHandle) {
      try { await writeHandle.close(); } catch {}
    }
    if (readHandle) {
      try { await readHandle.close(); } catch {}
    }
    try { await fs.promises.unlink(tempDestPath); } catch {}
    throw err;
  }
}

/**
 * Déchiffre un fichier source vers un fichier destination avec streaming par blocs,
 * staging temporaire, fsync et renommage atomique.
 */
export async function decryptFile(
  sourcePath: string,
  destPath: string,
  subkey: Uint8Array,
  aad: Uint8Array,
  options?: {
    overwrite?: boolean;
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<{ bytesRead: number; plaintextBytes: number }> {
  const s = getSodium();
  if (subkey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error(`Taille de sous-clé invalide (${subkey.length} octets).`);
  }
  if (aad.length !== STREAM_CONSTANTS.AAD_SIZE) {
    throw new Error(`Taille d'AAD contextuel invalide (${aad.length} octets).`);
  }

  // Refus immédiat si la cible existe et qu'aucun écrasement n'est autorisé
  const allowOverwrite = Boolean(options?.overwrite);
  if (!allowOverwrite && fs.existsSync(destPath)) {
    throw new DestinationConflictError(destPath);
  }

  const sourceStat = await fs.promises.stat(sourcePath);
  const totalSourceBytes = sourceStat.size;

  const minExpectedSize = STREAM_CONSTANTS.HEADER_BYTES + STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE + STREAM_CONSTANTS.MIN_CHUNK_CIPHERTEXT;
  if (totalSourceBytes < minExpectedSize) {
    throw new Error(`Fichier chiffré incomplet ou corrompu (taille ${totalSourceBytes}B inférieure au minimum requis de ${minExpectedSize}B).`);
  }

  const destDir = path.dirname(destPath);
  await fs.promises.mkdir(destDir, { recursive: true });

  const tempDestPath = `${destPath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

  let readHandle: fs.promises.FileHandle | null = null;
  let writeHandle: fs.promises.FileHandle | null = null;
  let totalPlainBytesDecrypted = 0;
  let totalCipherBytesConsumed = 0;

  try {
    readHandle = await fs.promises.open(sourcePath, 'r');
    writeHandle = await fs.promises.open(tempDestPath, 'w', 0o600);

    const headerBuf = Buffer.alloc(STREAM_CONSTANTS.HEADER_BYTES);
    await readExact(readHandle, headerBuf, STREAM_CONSTANTS.HEADER_BYTES);
    totalCipherBytesConsumed += STREAM_CONSTANTS.HEADER_BYTES;

    let pullState: any;
    try {
      pullState = s.crypto_secretstream_xchacha20poly1305_init_pull(headerBuf, subkey);
    } catch (err: any) {
      throw new Error(`Échec d'initialisation Secretstream pull : ${err?.message}`);
    }

    let hasReceivedFinalTag = false;
    const lenBuf = Buffer.alloc(STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE);

    while (totalCipherBytesConsumed < totalSourceBytes) {
      if (options?.abortSignal?.aborted) throw new Error('OPERATION_CANCELLED');

      if (hasReceivedFinalTag) {
        throw new Error('Données surnuméraires détectées après le bloc final.');
      }

      const { bytesRead: lenRead } = await readHandle.read(lenBuf, 0, STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE, null);
      if (lenRead < STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE) {
        throw new Error('Flux tronqué : longueur de trame incomplète.');
      }
      totalCipherBytesConsumed += STREAM_CONSTANTS.FRAME_LENGTH_PREFIX_SIZE;

      const chunkLen = lenBuf.readUInt32BE(0);
      if (
        chunkLen < STREAM_CONSTANTS.MIN_CHUNK_CIPHERTEXT ||
        chunkLen > STREAM_CONSTANTS.MAX_CHUNK_CIPHERTEXT
      ) {
        throw new Error(`Taille de bloc invalide : ${chunkLen} octets (autorisé : ${STREAM_CONSTANTS.MIN_CHUNK_CIPHERTEXT}-${STREAM_CONSTANTS.MAX_CHUNK_CIPHERTEXT}).`);
      }

      const remainingInFile = totalSourceBytes - totalCipherBytesConsumed;
      if (chunkLen > remainingInFile) {
        throw new Error(`Flux tronqué : bloc annoncé de ${chunkLen} octets dépasse les données restantes du fichier (${remainingInFile} octets).`);
      }

      const chunkBuf = Buffer.alloc(chunkLen);
      await readExact(readHandle, chunkBuf, chunkLen);
      totalCipherBytesConsumed += chunkLen;

      const res = s.crypto_secretstream_xchacha20poly1305_pull(pullState, chunkBuf, aad);
      if (res === false || !res) {
        throw new Error('Échec d\'authentification Secretstream : bloc altéré, clé invalide ou AAD incorrect.');
      }

      await writeHandle.write(res.message);
      totalPlainBytesDecrypted += res.message.length;
      options?.onProgress?.(totalPlainBytesDecrypted, totalSourceBytes);

      if (res.tag === STREAM_CONSTANTS.TAG_FINAL) {
        hasReceivedFinalTag = true;
      } else if (res.tag !== STREAM_CONSTANTS.TAG_MESSAGE) {
        throw new Error(`Tag de bloc inattendu : ${res.tag}`);
      }
    }

    if (!hasReceivedFinalTag) {
      throw new Error('Flux tronqué : fin de fichier inattendue sans bloc TAG_FINAL.');
    }

    // Vérification finale anti-surnuméraire
    const extraCheckBuf = Buffer.alloc(1);
    const { bytesRead: extraRead } = await readHandle.read(extraCheckBuf, 0, 1, null);
    if (extraRead > 0) {
      throw new Error('Données surnuméraires détectées après le bloc final.');
    }

    await writeHandle.sync();
    await writeHandle.close();
    writeHandle = null;

    await readHandle.close();
    readHandle = null;

    // Publication contrôlée selon la politique d'écrasement avec protection anti-TOCTOU
    await publishDecryptedFile(tempDestPath, destPath, allowOverwrite);

    return {
      bytesRead: totalCipherBytesConsumed,
      plaintextBytes: totalPlainBytesDecrypted,
    };
  } catch (err) {
    if (writeHandle) {
      try { await writeHandle.close(); } catch {}
    }
    if (readHandle) {
      try { await readHandle.close(); } catch {}
    }
    try { await fs.promises.unlink(tempDestPath); } catch {}
    throw err;
  }
}
