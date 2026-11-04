/**
 * Vanguard Vault — Architecture de Stockage Transactionnel (vaultStorage.ts)
 * 
 * Gestionnaire transactionnel de coffre local :
 * - Création, ouverture exclusive (.lock) et fermeture sécurisée
 * - Arborescence partitionnée : blobs chiffrés par identifiants opaques aléatoires (blobs/xx/*.enc)
 * - Index chiffré (index.enc, sous-clé vgv_meta) avec double copie de sécurité (index.enc.bak)
 * - Machine d'état transactionnelle avec journal sans fuite de métadonnées (journal.log)
 * - Protection anti-écrasement à l'extraction (DestinationConflictError / TOCTOU)
 * - Vérification d'intégrité de bout en bout (Poly1305 + SHA-256 dans l'index chiffré)
 * - Protection anti-traversée de chemin (Path Traversal) et contrôle des liens symboliques
 * - Effacement mémoire des clés de session lors de la fermeture
 * - Qualification d'état d'index à 4 niveaux et conservation des blobs orphelins non réconciliés
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
  initSodium,
  generateVaultMasterKey,
  deriveKeyFromPassword,
  deriveKeyFromRecoveryKey,
  wrapMasterKey,
  unwrapMasterKey,
  deriveSubkey,
  secureZero,
  validateCreationKdfParameters,
  validateKdfParameters,
  VANGUARD_KDF_POLICY,
  KDF_BOUNDS,
  CRYPTO_SIZES,
} from './cryptoPrimitives.ts';

import {
  generateRecoveryKey,
  formatRecoveryKey,
  parseRecoveryKey,
} from './recoveryKey.ts';

import type {
  VaultHeader,
  VaultSlot,
} from './envelopeSerializer.ts';

import {
  FORMAT_CONSTANTS,
  buildSlotAad,
  buildHeaderPrefix,
  serializeVaultHeader,
  deserializeVaultHeader,
} from './envelopeSerializer.ts';

import {
  STREAM_CONSTANTS,
  DestinationConflictError,
  uuidToBytes,
  bytesToUuid,
  buildStreamAad,
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
} from './streamBinding.ts';

import type {
  VaultLockHandle,
} from './vaultLock.ts';

import {
  acquireVaultLock,
  VaultLockedError,
} from './vaultLock.ts';

import type {
  JournalRecord,
  JournalOpType,
} from './vaultJournal.ts';

import {
  appendJournalRecord,
  readJournalRecords,
  planSafeRecovery,
  compactJournal,
} from './vaultJournal.ts';

export interface VaultFileEntry {
  id: string;             // Opaque blobId (32 hex characters)
  virtualPath: string;    // Chemin relatif virtuel normalisé dans le coffre
  size: number;           // Taille originale en octets
  sha256: string;         // Hash SHA-256 du contenu en clair
  createdAt: string;      // Horodatage ISO
  modifiedAt: string;     // Horodatage ISO
}

export interface VaultIndexData {
  formatVersion: number;
  vaultId: string;
  generation: number;     // Numéro de génération strictement croissant
  lastTxId: string;       // Identifiant de la dernière transaction commise
  updatedAt: string;
  files: VaultFileEntry[];
}

export type IndexRecoveryStatus =
  | 'PRIMARY_OK'
  | 'RESTORED_FROM_BACKUP_CONSISTENT'
  | 'DEGRADED_UNRECONCILED_BACKUP'
  | 'BACKUP_MISSING_BLOBS'
  | 'UNRECOVERABLE_INDEX';

export interface VaultSession {
  vaultRoot: string;
  vaultId: string;
  vaultIdBytes: Uint8Array;
  header: VaultHeader;
  masterKey: Uint8Array;
  metaKey: Uint8Array;
  dataKey: Uint8Array;
  index: VaultIndexData;
  indexRecoveryStatus: IndexRecoveryStatus;
  unreconciledBlobs: string[];
  lockHandle: VaultLockHandle;
  instanceId: string;
  isOpen: boolean;
}

/**
 * Assainit et normalise un chemin virtuel pour empêcher toute traversée de répertoire (Path Traversal)
 */
export function sanitizeVirtualPath(vPath: string): string {
  if (!vPath || typeof vPath !== 'string') {
    throw new Error('Chemin virtuel invalide : chaîne non vide requise.');
  }
  const normalized = path.posix.normalize(vPath.replace(/\\/g, '/'));
  if (
    normalized.startsWith('../') ||
    normalized === '..' ||
    path.isAbsolute(normalized) ||
    normalized.includes('/../')
  ) {
    throw new Error(`Tentative d'accès hors limites (Path Traversal) rejetée : "${vPath}"`);
  }
  return normalized.replace(/^\/+/, '');
}

/**
 * Énumère tous les blobIds opaques physiquement présents dans blobs/xx/*.enc
 */
export async function listAllBlobIds(vaultRoot: string): Promise<string[]> {
  const blobsDir = path.join(vaultRoot, 'blobs');
  if (!fs.existsSync(blobsDir)) return [];
  const prefixes = await fs.promises.readdir(blobsDir);
  const blobIds: string[] = [];

  for (const prefix of prefixes) {
    const subDir = path.join(blobsDir, prefix);
    const stat = await fs.promises.stat(subDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const files = await fs.promises.readdir(subDir);
    for (const f of files) {
      if (f.endsWith('.enc')) {
        blobIds.push(f.slice(0, -4).toLowerCase());
      }
    }
  }
  return blobIds;
}

/**
 * Crée un nouveau coffre-fort local partitionné
 */
export async function createVault(
  vaultRoot: string,
  password: string,
  options?: {
    recoveryKey?: Uint8Array;
    opslimit?: number;
    memlimit?: number;
  }
): Promise<{ vaultId: string; recoveryKeyFormatted?: string }> {
  await initSodium();

  if (!vaultRoot || typeof vaultRoot !== 'string') {
    throw new Error('Le chemin racine du coffre est invalide.');
  }

  // Vérification de répertoire cible
  if (fs.existsSync(vaultRoot)) {
    const entries = await fs.promises.readdir(vaultRoot);
    if (entries.length > 0) {
      throw new Error(`Le dossier cible n'est pas vide : ${vaultRoot}`);
    }
  } else {
    await fs.promises.mkdir(vaultRoot, { recursive: true });
  }

  const opslimit = options?.opslimit ?? VANGUARD_KDF_POLICY.RECOMMENDED_OPSLIMIT;
  const memlimit = options?.memlimit ?? VANGUARD_KDF_POLICY.RECOMMENDED_MEMLIMIT;
  validateCreationKdfParameters(opslimit, memlimit);

  // Génération des identifiants et clés
  const vaultIdBytes = crypto.randomBytes(16);
  const vaultId = bytesToUuid(vaultIdBytes);
  const masterKey = generateVaultMasterKey();

  const hasRecovery = Boolean(options?.recoveryKey);
  const recoveryRaw = options?.recoveryKey;
  const flags = 0x01 | (hasRecovery ? 0x02 : 0x00);

  const headerPrefix = buildHeaderPrefix(vaultIdBytes, flags, FORMAT_CONSTANTS.FORMAT_VERSION);

  // 1. Slot Mot de Passe
  const saltPass = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
  const noncePass = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
  const kekPass = deriveKeyFromPassword(password, saltPass, opslimit, memlimit);

  const passwordSlot: VaultSlot = {
    slotType: FORMAT_CONSTANTS.SLOT_TYPE_PASSWORD,
    kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
    opslimit,
    memlimit,
    salt: saltPass,
    aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
    nonce: noncePass,
    wrappedKey: new Uint8Array(CRYPTO_SIZES.WRAPPED_KEY_BYTES),
  };
  const aadPass = buildSlotAad(headerPrefix, passwordSlot);
  passwordSlot.wrappedKey = wrapMasterKey(masterKey, kekPass, noncePass, aadPass);

  // 2. Slot Récupération (si demandé)
  let recoverySlot: VaultSlot | undefined;
  let recoveryKeyFormatted: string | undefined;

  if (hasRecovery && recoveryRaw) {
    if (recoveryRaw.length !== 32) {
      throw new Error('La clé de secours doit comporter exactement 32 octets.');
    }
    const saltRec = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
    const nonceRec = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
    const kekRec = deriveKeyFromRecoveryKey(recoveryRaw, saltRec, opslimit, memlimit);

    recoverySlot = {
      slotType: FORMAT_CONSTANTS.SLOT_TYPE_RECOVERY,
      kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
      opslimit,
      memlimit,
      salt: saltRec,
      aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
      nonce: nonceRec,
      wrappedKey: new Uint8Array(CRYPTO_SIZES.WRAPPED_KEY_BYTES),
    };
    const aadRec = buildSlotAad(headerPrefix, recoverySlot);
    recoverySlot.wrappedKey = wrapMasterKey(masterKey, kekRec, nonceRec, aadRec);
    recoveryKeyFormatted = formatRecoveryKey(recoveryRaw);
  }

  const vaultHeader: VaultHeader = {
    formatVersion: FORMAT_CONSTANTS.FORMAT_VERSION,
    vaultId: vaultIdBytes,
    flags,
    passwordSlot,
    recoverySlot,
  };

  // Sérialisation et écriture de vault.header avec staging et fsync
  await persistVaultHeader(vaultRoot, vaultHeader);

  // Création des répertoires de stockage
  await fs.promises.mkdir(path.join(vaultRoot, 'blobs'), { recursive: true });
  await fs.promises.mkdir(path.join(vaultRoot, 'staging'), { recursive: true });

  // Initialisation du journal
  const jHandle = await fs.promises.open(path.join(vaultRoot, 'journal.log'), 'w', 0o600);
  await jHandle.close();

  // Création de l'index initial vide
  const metaKey = deriveSubkey(masterKey, 1, 'vgv_meta');
  const initialIndex: VaultIndexData = {
    formatVersion: 1,
    vaultId,
    generation: 1,
    lastTxId: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    files: [],
  };

  const indexAad = buildStreamAad(vaultIdBytes, vaultIdBytes, STREAM_CONSTANTS.OBJECT_TYPE_INDEX, 1);
  const indexEncrypted = encryptBuffer(
    Buffer.from(JSON.stringify(initialIndex), 'utf8'),
    metaKey,
    indexAad
  );

  const indexPath = path.join(vaultRoot, 'index.enc');
  const indexBakPath = path.join(vaultRoot, 'index.enc.bak');
  const tempIndexPath = path.join(vaultRoot, `index.enc.tmp.${Date.now()}`);

  const iHandle = await fs.promises.open(tempIndexPath, 'w', 0o600);
  try {
    await iHandle.write(indexEncrypted);
    await iHandle.sync();
  } finally {
    await iHandle.close();
  }
  await fs.promises.rename(tempIndexPath, indexPath);
  await fs.promises.copyFile(indexPath, indexBakPath);

  // Nettoyage mémoire des clés volatiles
  secureZero(masterKey);
  secureZero(metaKey);

  return {
    vaultId,
    recoveryKeyFormatted,
  };
}

/**
 * Ouvre une session active sur un coffre local avec verrou exclusif et déchiffrement de l'index
 */
export async function openVault(
  vaultRoot: string,
  credentials: {
    password?: string;
    recoveryKeyString?: string;
  },
  options?: {
    forceBreakStaleLock?: boolean;
  }
): Promise<VaultSession> {
  await initSodium();

  if (!fs.existsSync(vaultRoot)) {
    throw new Error(`Le dossier du coffre est introuvable : ${vaultRoot}`);
  }

  const headerPath = path.join(vaultRoot, 'vault.header');
  const headerBakPath = path.join(vaultRoot, 'vault.header.bak');

  if (!fs.existsSync(headerPath) && !fs.existsSync(headerBakPath)) {
    throw new Error(`Fichier d'en-tête du coffre introuvable dans ${vaultRoot}`);
  }

  // Lecture de l'en-tête (avec secours sur header.bak si corrompu)
  let rawHeader: Buffer;
  try {
    rawHeader = await fs.promises.readFile(headerPath);
  } catch {
    rawHeader = await fs.promises.readFile(headerBakPath);
  }

  let parsed: { header: VaultHeader; prefixBytes: Uint8Array };
  try {
    parsed = deserializeVaultHeader(new Uint8Array(rawHeader));
  } catch (err: any) {
    if (fs.existsSync(headerBakPath)) {
      const bakRaw = await fs.promises.readFile(headerBakPath);
      parsed = deserializeVaultHeader(new Uint8Array(bakRaw));
    } else {
      throw err;
    }
  }

  const header = parsed.header;
  const vaultIdBytes = header.vaultId;
  const vaultId = bytesToUuid(vaultIdBytes);
  const instanceId = crypto.randomUUID();

  // 1. Acquisition du verrou exclusif
  const lockHandle = await acquireVaultLock(vaultRoot, vaultId, instanceId, {
    forceBreakStaleLock: options?.forceBreakStaleLock,
  });

  try {
    // 2. Déverrouillage de la clé maîtresse
    let masterKey: Uint8Array | null = null;

    if (credentials.password) {
      const slot = header.passwordSlot;
      validateKdfParameters(slot.opslimit, slot.memlimit);
      const kek = deriveKeyFromPassword(credentials.password, slot.salt, slot.opslimit, slot.memlimit);
      const aad = buildSlotAad(parsed.prefixBytes, slot);
      masterKey = unwrapMasterKey(slot.wrappedKey, kek, slot.nonce, aad);
    } else if (credentials.recoveryKeyString) {
      if (!header.recoverySlot) {
        throw new Error('Ce coffre ne dispose pas de slot de récupération.');
      }
      const rawRec = parseRecoveryKey(credentials.recoveryKeyString);
      const slot = header.recoverySlot;
      validateKdfParameters(slot.opslimit, slot.memlimit);
      const kek = deriveKeyFromRecoveryKey(rawRec, slot.salt, slot.opslimit, slot.memlimit);
      const aad = buildSlotAad(parsed.prefixBytes, slot);
      masterKey = unwrapMasterKey(slot.wrappedKey, kek, slot.nonce, aad);
    } else {
      throw new Error('Mot de passe ou clé de secours obligatoire pour ouvrir le coffre.');
    }

    // 3. Dérivation des sous-clés spécialisées
    const metaKey = deriveSubkey(masterKey, 1, 'vgv_meta');
    const dataKey = deriveSubkey(masterKey, 1, 'vgv_data');

    // 4. Chargement et diagnostic rigoureux de l'index chiffré EN PREMIER
    const loadedIndex = await loadEncryptedIndex(vaultRoot, vaultIdBytes, metaKey);

    // 5. Exécution de la reprise basée sur le journal et confrontée à l'index valide
    await recoverFromJournal(vaultRoot, loadedIndex.index);

    return {
      vaultRoot,
      vaultId,
      vaultIdBytes,
      header,
      masterKey,
      metaKey,
      dataKey,
      index: loadedIndex.index,
      indexRecoveryStatus: loadedIndex.status,
      unreconciledBlobs: loadedIndex.unreconciledBlobs,
      lockHandle,
      instanceId,
      isOpen: true,
    };
  } catch (err) {
    // En cas d'erreur de déverrouillage, libération immédiate du verrou
    await lockHandle.release();
    throw err;
  }
}

/**
 * Charge, déchiffre et qualifie l'index avec diagnostic en 4 états et préservation des copies corrompues
 */
export async function loadEncryptedIndex(
  vaultRoot: string,
  vaultIdBytes: Uint8Array,
  metaKey: Uint8Array
): Promise<{ index: VaultIndexData; status: IndexRecoveryStatus; unreconciledBlobs: string[] }> {
  const indexPath = path.join(vaultRoot, 'index.enc');
  const indexBakPath = path.join(vaultRoot, 'index.enc.bak');
  const expectedVaultIdStr = bytesToUuid(vaultIdBytes);

  const aad = buildStreamAad(vaultIdBytes, vaultIdBytes, STREAM_CONSTANTS.OBJECT_TYPE_INDEX, 1);

  // 1. Tentative sur l'index principal
  if (fs.existsSync(indexPath)) {
    try {
      const encrypted = await fs.promises.readFile(indexPath);
      const decrypted = decryptBuffer(new Uint8Array(encrypted), metaKey, aad);
      const parsed = JSON.parse(Buffer.from(decrypted).toString('utf8')) as VaultIndexData;

      if (parsed.vaultId === expectedVaultIdStr) {
        return {
          index: parsed,
          status: 'PRIMARY_OK',
          unreconciledBlobs: [],
        };
      }
    } catch (err: any) {
      // Index principal corrompu : on le préserve sous index.enc.corrupt.<timestamp> pour analyse
      const corruptPreservePath = path.join(vaultRoot, `index.enc.corrupt.${Date.now()}`);
      try {
        await fs.promises.copyFile(indexPath, corruptPreservePath);
      } catch {}
    }
  }

  // 2. Examen de la sauvegarde index.enc.bak
  if (fs.existsSync(indexBakPath)) {
    let parsedBak: VaultIndexData;
    try {
      const encryptedBak = await fs.promises.readFile(indexBakPath);
      const decryptedBak = decryptBuffer(new Uint8Array(encryptedBak), metaKey, aad);
      parsedBak = JSON.parse(Buffer.from(decryptedBak).toString('utf8')) as VaultIndexData;
    } catch {
      throw new Error('Index principal et sauvegarde index.enc.bak tous deux corrompus (UNRECOVERABLE_INDEX).');
    }

    if (parsedBak.vaultId !== expectedVaultIdStr) {
      throw new Error('Sauvegarde index.enc.bak n\'appartient pas à ce coffre (Vault ID mismatch).');
    }

    // Contrôle que tous les blobs référencés par la sauvegarde existent bien sur disque
    for (const f of parsedBak.files) {
      const bPath = path.join(vaultRoot, 'blobs', f.id.slice(0, 2), `${f.id}.enc`);
      if (!fs.existsSync(bPath)) {
        throw new Error(`Sauvegarde d'index incohérente : le blob référencé "${f.id}" (${f.virtualPath}) est manquant sur disque (BACKUP_MISSING_BLOBS).`);
      }
    }

    // Détection des blobs présents sur disque mais absents de la sauvegarde
    const diskBlobs = await listAllBlobIds(vaultRoot);
    const backupBlobIds = new Set(parsedBak.files.map(f => f.id.toLowerCase()));
    const extraBlobs = diskBlobs.filter(b => !backupBlobIds.has(b));

    // Rétablissement de l'index principal
    await fs.promises.copyFile(indexBakPath, indexPath);

    if (extraBlobs.length > 0) {
      // Des blobs plus récents existent sur disque mais ne sont pas dans la sauvegarde.
      // RÈGLE : on ne les supprime pas ! Mode dégradé avec blobs non réconciliés.
      return {
        index: parsedBak,
        status: 'DEGRADED_UNRECONCILED_BACKUP',
        unreconciledBlobs: extraBlobs,
      };
    }

    return {
      index: parsedBak,
      status: 'RESTORED_FROM_BACKUP_CONSISTENT',
      unreconciledBlobs: [],
    };
  }

  throw new Error('Index principal introuvable ou corrompu, et aucune sauvegarde index.enc.bak disponible (UNRECOVERABLE_INDEX).');
}

/**
 * Enregistre et publie une mise à jour d'index chiffré de manière transactionnelle
 */
async function persistEncryptedIndex(
  vaultRoot: string,
  vaultIdBytes: Uint8Array,
  metaKey: Uint8Array,
  indexData: VaultIndexData,
  txId: string,
  options?: {
    op?: JournalOpType;
    blobId?: string;
    faultInjection?: 'FAIL_BEFORE_INDEX_RENAME' | 'FAIL_BEFORE_BACKUP_COPY' | 'FAIL_DURING_STAGING_WRITE';
  }
): Promise<void> {
  // Incrément strict de la génération
  indexData.generation = (indexData.generation || 1) + 1;
  indexData.lastTxId = txId;
  indexData.updatedAt = new Date().toISOString();

  if (options?.faultInjection === 'FAIL_DURING_STAGING_WRITE') {
    throw new Error('FaultInjection: Échec simulé d\'écriture de staging index');
  }

  const rawJson = Buffer.from(JSON.stringify(indexData), 'utf8');
  const aad = buildStreamAad(vaultIdBytes, vaultIdBytes, STREAM_CONSTANTS.OBJECT_TYPE_INDEX, 1);
  const encrypted = encryptBuffer(rawJson, metaKey, aad);

  const stagingIndexPath = path.join(vaultRoot, 'staging', `${txId}.index.tmp`);
  const indexPath = path.join(vaultRoot, 'index.enc');
  const indexBakPath = path.join(vaultRoot, 'index.enc.bak');

  // 1. Écriture staging et fsync
  const handle = await fs.promises.open(stagingIndexPath, 'w', 0o600);
  try {
    await handle.write(encrypted);
    await handle.sync();
  } finally {
    await handle.close();
  }

  await appendJournalRecord(vaultRoot, {
    txId,
    op: options?.op ?? 'COMMIT_INDEX',
    state: 'INDEX_STAGED',
    blobId: options?.blobId,
    stagingRelPath: path.relative(vaultRoot, stagingIndexPath),
    targetRelPath: 'index.enc',
    timestamp: Date.now(),
  });

  if (options?.faultInjection === 'FAIL_BEFORE_BACKUP_COPY') {
    throw new Error('FaultInjection: Échec simulé avant copie de sauvegarde index');
  }

  // 2. Sauvegarde de sécurité de l'index actuel avant remplacement
  if (fs.existsSync(indexPath)) {
    await fs.promises.copyFile(indexPath, indexBakPath);
  }

  if (options?.faultInjection === 'FAIL_BEFORE_INDEX_RENAME') {
    throw new Error('FaultInjection: Échec simulé avant renommage atomique index');
  }

  // 3. Remplacement atomique de l'index (POINT DE COMMIT EFFECTIF)
  await fs.promises.rename(stagingIndexPath, indexPath);

  await appendJournalRecord(vaultRoot, {
    txId,
    op: options?.op ?? 'COMMIT_INDEX',
    state: 'INDEX_COMMITTED',
    blobId: options?.blobId,
    targetRelPath: 'index.enc',
    timestamp: Date.now(),
  });
}

/**
 * Importe un fichier source local dans le coffre virtuel de manière transactionnelle
 */
export async function importFile(
  session: VaultSession,
  sourcePath: string,
  virtualPath: string,
  options?: {
    faultInjection?: 'FAIL_BEFORE_INDEX_RENAME' | 'FAIL_BEFORE_JOURNAL_COMMIT' | 'FAIL_DURING_PAYLOAD_WRITE';
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<VaultFileEntry> {
  if (!session.isOpen) {
    throw new Error('La session du coffre est fermée.');
  }

  if (session.indexRecoveryStatus === 'DEGRADED_UNRECONCILED_BACKUP') {
    throw new Error('Écriture bloquée : le coffre est en mode dégradé (blobs non réconciliés détectés sur disque).');
  }

  const vPath = sanitizeVirtualPath(virtualPath);

  // Vérifier si le chemin virtuel est déjà utilisé
  const existing = session.index.files.find(f => f.virtualPath === vPath);
  if (existing) {
    throw new Error(`Un fichier portant le chemin virtuel "${vPath}" existe déjà dans le coffre.`);
  }

  // Contrôle du fichier source (interdiction de symlinks vers dossiers ou récursifs)
  const lstat = await fs.promises.lstat(sourcePath);
  if (lstat.isSymbolicLink()) {
    const real = await fs.promises.realpath(sourcePath);
    const realStat = await fs.promises.stat(real);
    if (!realStat.isFile()) {
      throw new Error(`Le lien symbolique ne pointe pas vers un fichier régulier : ${sourcePath}`);
    }
  } else if (!lstat.isFile()) {
    throw new Error(`Le chemin source n'est pas un fichier régulier : ${sourcePath}`);
  }

  const sourceStat = await fs.promises.stat(sourcePath);
  const originalSize = sourceStat.size;

  // Calcul du SHA-256 du fichier original en streaming
  const hashSum = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const s = fs.createReadStream(sourcePath);
    s.on('data', chunk => hashSum.update(chunk));
    s.on('end', () => resolve());
    s.on('error', err => reject(err));
  });
  const contentHash = hashSum.digest('hex');

  // Génération d'un identifiant de blob opaque aléatoire (16 octets / 32 hex)
  const blobIdBytes = crypto.randomBytes(16);
  const blobId = blobIdBytes.toString('hex');
  const blobPrefix = blobId.slice(0, 2);

  const partitionDir = path.join(session.vaultRoot, 'blobs', blobPrefix);
  await fs.promises.mkdir(partitionDir, { recursive: true });

  const finalBlobPath = path.join(partitionDir, `${blobId}.enc`);
  const txId = crypto.randomUUID();
  const stagingPayloadPath = path.join(session.vaultRoot, 'staging', `${txId}.payload.tmp`);

  // AAD contextuel liant le payload à son BlobId et son VaultId
  const aad = buildStreamAad(session.vaultIdBytes, blobIdBytes, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

  // 1. Journalisation début import
  await appendJournalRecord(session.vaultRoot, {
    txId,
    op: 'IMPORT_PAYLOAD',
    state: 'STAGING_PAYLOAD',
    blobId,
    stagingRelPath: path.relative(session.vaultRoot, stagingPayloadPath),
    targetRelPath: path.relative(session.vaultRoot, finalBlobPath),
    timestamp: Date.now(),
  });

  try {
    if (options?.faultInjection === 'FAIL_DURING_PAYLOAD_WRITE') {
      throw new Error('FaultInjection: Échec simulé d\'écriture de payload');
    }

    // 2. Chiffrement du payload vers staging avec fsync
    await encryptFile(sourcePath, stagingPayloadPath, session.dataKey, aad, {
      onProgress: options?.onProgress,
      abortSignal: options?.abortSignal,
    });

    // 3. Publication du payload vers son emplacement blobs/xx/
    await fs.promises.rename(stagingPayloadPath, finalBlobPath);

    await appendJournalRecord(session.vaultRoot, {
      txId,
      op: 'IMPORT_PAYLOAD',
      state: 'PAYLOAD_PUBLISHED',
      blobId,
      targetRelPath: path.relative(session.vaultRoot, finalBlobPath),
      timestamp: Date.now(),
    });

    // 4. Préparation et publication du nouvel index
    const newEntry: VaultFileEntry = {
      id: blobId,
      virtualPath: vPath,
      size: originalSize,
      sha256: contentHash,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };

    const newIndex: VaultIndexData = {
      ...session.index,
      files: [...session.index.files, newEntry],
    };

    // Point de commit
    await persistEncryptedIndex(
      session.vaultRoot,
      session.vaultIdBytes,
      session.metaKey,
      newIndex,
      txId,
      {
        op: 'IMPORT_PAYLOAD',
        blobId,
        faultInjection: options?.faultInjection === 'FAIL_BEFORE_INDEX_RENAME' ? 'FAIL_BEFORE_INDEX_RENAME' : undefined,
      }
    );

    // Mise à jour de l'index en mémoire
    session.index = newIndex;

    if (options?.faultInjection === 'FAIL_BEFORE_JOURNAL_COMMIT') {
      throw new Error('FaultInjection: Crash simulé après publication index mais avant mise à jour du journal');
    }

    // Purge périodique du journal après commit
    await compactJournal(session.vaultRoot);

    return newEntry;
  } catch (err) {
    // Si l'index N'A PAS été mis à jour, on nettoie les résidus temporaires
    const isCommittedInIndex = session.index.files.some(f => f.id === blobId);
    if (!isCommittedInIndex) {
      try { await fs.promises.unlink(stagingPayloadPath); } catch {}
      try { await fs.promises.unlink(finalBlobPath); } catch {}
    }
    throw err;
  }
}

/**
 * Extrait un fichier chiffré du coffre vers un fichier en clair sur le disque de destination
 */
export async function extractFile(
  session: VaultSession,
  virtualPath: string,
  destDiskPath: string,
  options?: {
    overwrite?: boolean;
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<{ bytesExtracted: number; sha256Verified: boolean }> {
  if (!session.isOpen) {
    throw new Error('La session du coffre est fermée.');
  }

  const vPath = sanitizeVirtualPath(virtualPath);
  const entry = session.index.files.find(f => f.virtualPath === vPath);
  if (!entry) {
    throw new Error(`Fichier introuvable dans le coffre : "${vPath}"`);
  }

  const blobPrefix = entry.id.slice(0, 2);
  const blobPath = path.join(session.vaultRoot, 'blobs', blobPrefix, `${entry.id}.enc`);

  if (!fs.existsSync(blobPath)) {
    throw new Error(`Payload chiffré introuvable sur le disque pour "${vPath}" (${entry.id})`);
  }

  const blobIdBytes = Buffer.from(entry.id, 'hex');
  const aad = buildStreamAad(session.vaultIdBytes, new Uint8Array(blobIdBytes), STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

  // Déchiffrement streaming avec vérification anti-écrasement
  const { plaintextBytes } = await decryptFile(
    blobPath,
    destDiskPath,
    session.dataKey,
    aad,
    {
      overwrite: options?.overwrite,
      onProgress: options?.onProgress,
      abortSignal: options?.abortSignal,
    }
  );

  // Vérification de bout en bout du hash SHA-256 sur le fichier extrait
  const hashSum = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const s = fs.createReadStream(destDiskPath);
    s.on('data', chunk => hashSum.update(chunk));
    s.on('end', () => resolve());
    s.on('error', err => reject(err));
  });
  const extractedHash = hashSum.digest('hex');

  if (extractedHash !== entry.sha256) {
    // Si la somme de contrôle de bout en bout échoue : suppression immédiate du fichier extrait corrompu
    try { await fs.promises.unlink(destDiskPath); } catch {}
    throw new Error(`Somme de contrôle SHA-256 incohérente pour "${vPath}" : données en clair altérées.`);
  }

  return {
    bytesExtracted: plaintextBytes,
    sha256Verified: true,
  };
}

/**
 * Supprime un fichier du coffre selon l'ordre strict : mise à jour de l'index d'abord, puis destruction du blob
 */
export async function deleteFile(
  session: VaultSession,
  virtualPath: string,
  options?: {
    faultInjection?: 'FAIL_BEFORE_BLOB_UNLINK' | 'FAIL_BEFORE_INDEX_RENAME';
  }
): Promise<void> {
  if (!session.isOpen) {
    throw new Error('La session du coffre est fermée.');
  }

  const vPath = sanitizeVirtualPath(virtualPath);
  const entryIndex = session.index.files.findIndex(f => f.virtualPath === vPath);
  if (entryIndex === -1) {
    throw new Error(`Fichier à supprimer introuvable dans le coffre : "${vPath}"`);
  }

  const entry = session.index.files[entryIndex];
  const blobPrefix = entry.id.slice(0, 2);
  const blobPath = path.join(session.vaultRoot, 'blobs', blobPrefix, `${entry.id}.enc`);
  const txId = crypto.randomUUID();

  // 1. Journalisation début suppression
  await appendJournalRecord(session.vaultRoot, {
    txId,
    op: 'DELETE_PAYLOAD',
    state: 'INDEX_STAGED',
    blobId: entry.id,
    targetRelPath: path.relative(session.vaultRoot, blobPath),
    timestamp: Date.now(),
  });

  // 2. Préparation et publication du nouvel index SANS la référence (POINT DE COMMIT EFFECTIF)
  const newFiles = session.index.files.filter((_, idx) => idx !== entryIndex);
  const newIndex: VaultIndexData = {
    ...session.index,
    files: newFiles,
  };

  await persistEncryptedIndex(
    session.vaultRoot,
    session.vaultIdBytes,
    session.metaKey,
    newIndex,
    txId,
    {
      op: 'DELETE_PAYLOAD',
      blobId: entry.id,
      faultInjection: options?.faultInjection === 'FAIL_BEFORE_INDEX_RENAME' ? 'FAIL_BEFORE_INDEX_RENAME' : undefined,
    }
  );
  session.index = newIndex;

  if (options?.faultInjection === 'FAIL_BEFORE_BLOB_UNLINK') {
    throw new Error('FaultInjection: Crash simulé après commit index mais avant suppression physique du blob');
  }

  // 3. SEULEMENT MAINTENANT : suppression physique du payload sur disque
  try {
    await fs.promises.unlink(blobPath);
  } catch (unlinkErr: any) {
    if (unlinkErr.code !== 'ENOENT') {
      throw unlinkErr;
    }
  }

  await appendJournalRecord(session.vaultRoot, {
    txId,
    op: 'DELETE_PAYLOAD',
    state: 'PAYLOAD_DELETED',
    blobId: entry.id,
    timestamp: Date.now(),
  });

  await compactJournal(session.vaultRoot);
}

/**
 * Exécute la procédure de reprise d'intégrité après incident basée sur le journal et l'index valide
 */
export async function recoverFromJournal(
  vaultRoot: string,
  validIndex: VaultIndexData
): Promise<{ recoveredCount: number; errors: string[] }> {
  const records = await readJournalRecords(vaultRoot);
  if (records.length === 0) {
    return { recoveredCount: 0, errors: [] };
  }

  const validBlobIds = new Set(validIndex.files.map(f => f.id.toLowerCase()));
  const plan = planSafeRecovery(vaultRoot, records, validBlobIds);
  let actionsTaken = 0;

  // 1. Purge des fichiers de staging orphelins confirmés
  for (const stagingPath of plan.stagingFilesToPurge) {
    try {
      if (fs.existsSync(stagingPath)) {
        await fs.promises.unlink(stagingPath);
        actionsTaken++;
      }
    } catch {}
  }

  // 2. Purge des blobs orphelins non référencés par l'index valide
  for (const orphanBlobPath of plan.orphanedBlobsToPurge) {
    try {
      if (fs.existsSync(orphanBlobPath)) {
        await fs.promises.unlink(orphanBlobPath);
        actionsTaken++;
      }
    } catch {}
  }

  // Réinitialisation du journal nettoyé
  await compactJournal(vaultRoot);

  return {
    recoveredCount: actionsTaken,
    errors: plan.unreconciledErrors,
  };
}

/**
 * Persiste de manière atomique l'en-tête du coffre avec staging, fsync et copie de secours
 */
export async function persistVaultHeader(vaultRoot: string, header: VaultHeader): Promise<void> {
  const headerBytes = serializeVaultHeader(header);
  const tempHeaderPath = path.join(vaultRoot, `vault.header.tmp.${Date.now()}`);
  const headerPath = path.join(vaultRoot, 'vault.header');
  const headerBakPath = path.join(vaultRoot, 'vault.header.bak');

  const hHandle = await fs.promises.open(tempHeaderPath, 'w', 0o600);
  try {
    await hHandle.write(headerBytes);
    await hHandle.sync();
  } finally {
    await hHandle.close();
  }
  await fs.promises.rename(tempHeaderPath, headerPath);
  await fs.promises.copyFile(headerPath, headerBakPath);
}

/**
 * Modifie le mot de passe d'accès au coffre en réécrivant l'enveloppe du Slot 1
 */
export async function changePassword(
  session: VaultSession,
  newPassword: string,
  options?: { opslimit?: number; memlimit?: number }
): Promise<void> {
  if (!session.isOpen) {
    throw new Error('La session du coffre est fermée.');
  }

  const opslimit = options?.opslimit ?? VANGUARD_KDF_POLICY.RECOMMENDED_OPSLIMIT;
  const memlimit = options?.memlimit ?? VANGUARD_KDF_POLICY.RECOMMENDED_MEMLIMIT;
  validateCreationKdfParameters(opslimit, memlimit);

  const saltPass = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
  const noncePass = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
  const kekPass = deriveKeyFromPassword(newPassword, saltPass, opslimit, memlimit);

  const newPasswordSlot: VaultSlot = {
    slotType: FORMAT_CONSTANTS.SLOT_TYPE_PASSWORD,
    kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
    opslimit,
    memlimit,
    salt: saltPass,
    aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
    nonce: noncePass,
    wrappedKey: new Uint8Array(CRYPTO_SIZES.WRAPPED_KEY_BYTES),
  };

  const aadPass = buildSlotAad(session.vaultIdBytes, newPasswordSlot);
  newPasswordSlot.wrappedKey = wrapMasterKey(session.masterKey, kekPass, noncePass, aadPass);
  secureZero(kekPass);

  const updatedHeader: VaultHeader = {
    ...session.header,
    passwordSlot: newPasswordSlot,
  };

  await persistVaultHeader(session.vaultRoot, updatedHeader);
  session.header = updatedHeader;
}

/**
 * Configure ou retire la clé de secours Crockford du coffre
 */
export async function configureRecovery(
  session: VaultSession,
  action: 'add' | 'remove',
  options?: { recoveryKeyRaw?: Uint8Array; opslimit?: number; memlimit?: number }
): Promise<{ recoveryKeyFormatted?: string }> {
  if (!session.isOpen) {
    throw new Error('La session du coffre est fermée.');
  }

  if (action === 'remove') {
    if (!session.header.recoverySlot) {
      throw new Error('Aucun slot de secours n\'est configuré sur ce coffre.');
    }
    const updatedHeader: VaultHeader = {
      ...session.header,
      flags: session.header.flags & ~0x02,
      recoverySlot: undefined,
    };
    await persistVaultHeader(session.vaultRoot, updatedHeader);
    session.header = updatedHeader;
    return {};
  }

  // action === 'add'
  const recoveryRaw = options?.recoveryKeyRaw ?? generateRecoveryKey();
  if (recoveryRaw.length !== 32) {
    throw new Error('La clé de secours doit comporter exactement 32 octets.');
  }

  const opslimit = options?.opslimit ?? VANGUARD_KDF_POLICY.RECOMMENDED_OPSLIMIT;
  const memlimit = options?.memlimit ?? VANGUARD_KDF_POLICY.RECOMMENDED_MEMLIMIT;
  validateCreationKdfParameters(opslimit, memlimit);

  const saltRec = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
  const nonceRec = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
  const kekRec = deriveKeyFromRecoveryKey(recoveryRaw, saltRec, opslimit, memlimit);

  const newRecoverySlot: VaultSlot = {
    slotType: FORMAT_CONSTANTS.SLOT_TYPE_RECOVERY,
    kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
    opslimit,
    memlimit,
    salt: saltRec,
    aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
    nonce: nonceRec,
    wrappedKey: new Uint8Array(CRYPTO_SIZES.WRAPPED_KEY_BYTES),
  };

  const aadRec = buildSlotAad(session.vaultIdBytes, newRecoverySlot);
  newRecoverySlot.wrappedKey = wrapMasterKey(session.masterKey, kekRec, nonceRec, aadRec);
  secureZero(kekRec);

  const updatedHeader: VaultHeader = {
    ...session.header,
    flags: session.header.flags | 0x02,
    recoverySlot: newRecoverySlot,
  };

  await persistVaultHeader(session.vaultRoot, updatedHeader);
  session.header = updatedHeader;

  return {
    recoveryKeyFormatted: formatRecoveryKey(recoveryRaw),
  };
}

/**
 * Ferme proprement une session active de coffre, libère le verrou et efface les clés en mémoire
 */
export async function closeVault(session: VaultSession): Promise<void> {
  if (!session.isOpen) return;

  session.isOpen = false;

  // 1. Libération du verrou exclusif
  if (session.lockHandle) {
    await session.lockHandle.release();
  }

  // 2. Effacement sécurisé des clés en mémoire vive
  secureZero(session.masterKey);
  secureZero(session.metaKey);
  secureZero(session.dataKey);

  // Vider les buffers
  session.masterKey = new Uint8Array(0);
  session.metaKey = new Uint8Array(0);
  session.dataKey = new Uint8Array(0);
}

/**
 * Exporte l'intégralité d'un coffre ouvert :
 * - mode 'backup_encrypted' : copie intégrale et vérifiée du coffre chiffré (header, index, blobs)
 * - mode 'extract_all_plaintext' : extraction complète de chaque fichier en clair avec vérification SHA-256
 */
export async function exportVaultStorage(
  session: VaultSession,
  destPath: string,
  mode: 'backup_encrypted' | 'extract_all_plaintext' | 'archive_portable_vgv',
  options?: {
    overwrite?: boolean;
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<{ mode: string; filesExported: number; totalBytes: number; archivePath?: string }> {
  if (!session.isOpen) {
    throw new Error('Le coffre doit être ouvert pour exporter ses données.');
  }

  if (!destPath || typeof destPath !== 'string') {
    throw new Error('Répertoire de destination invalide.');
  }

  if (mode === 'archive_portable_vgv') {
    const res = await exportVaultArchive(session, destPath, options);
    return {
      mode: 'archive_portable_vgv',
      filesExported: res.filesCount,
      totalBytes: res.totalBytes,
      archivePath: res.archivePath,
    };
  }

  const resolvedSrc = path.resolve(session.vaultRoot).toLowerCase();
  const resolvedDst = path.resolve(destPath).toLowerCase();

  if (resolvedDst === resolvedSrc || resolvedDst.startsWith(resolvedSrc + path.sep)) {
    throw new Error('La destination ne peut pas être située à l\'intérieur du répertoire du coffre source.');
  }

  if (mode === 'backup_encrypted') {
    if (!fs.existsSync(destPath)) {
      await fs.promises.mkdir(destPath, { recursive: true });
    }

    const filesToCopy: Array<{ src: string; dst: string; size: number }> = [];

    // Fichiers d'en-tête (vault.header et secours)
    for (const hName of ['vault.header', 'vault.header.bak']) {
      const hPath = path.join(session.vaultRoot, hName);
      if (fs.existsSync(hPath)) {
        filesToCopy.push({ src: hPath, dst: path.join(destPath, hName), size: fs.statSync(hPath).size });
      }
    }

    // Fichiers d'index chiffré (index.enc et secours)
    for (const iName of ['index.enc', 'index.enc.bak']) {
      const iPath = path.join(session.vaultRoot, iName);
      if (fs.existsSync(iPath)) {
        filesToCopy.push({ src: iPath, dst: path.join(destPath, iName), size: fs.statSync(iPath).size });
      }
    }

    const blobsDir = path.join(session.vaultRoot, 'blobs');
    if (fs.existsSync(blobsDir)) {
      const walkBlobs = (dir: string, rel: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullSrc = path.join(dir, e.name);
          const fullDst = path.join(destPath, 'blobs', rel, e.name);
          if (e.isDirectory()) {
            walkBlobs(fullSrc, path.join(rel, e.name));
          } else if (e.isFile() && e.name.endsWith('.enc')) {
            filesToCopy.push({ src: fullSrc, dst: fullDst, size: fs.statSync(fullSrc).size });
          }
        }
      };
      walkBlobs(blobsDir, '');
    }

    const totalBytes = filesToCopy.reduce((sum, f) => sum + f.size, 0);
    let bytesProcessed = 0;

    for (const f of filesToCopy) {
      if (options?.abortSignal?.aborted) {
        throw new Error('Exportation du coffre annulée.');
      }
      const dirDst = path.dirname(f.dst);
      if (!fs.existsSync(dirDst)) await fs.promises.mkdir(dirDst, { recursive: true });
      await fs.promises.copyFile(f.src, f.dst);
      bytesProcessed += f.size;
      options?.onProgress?.(bytesProcessed, totalBytes);
    }

    return {
      mode: 'backup_encrypted',
      filesExported: filesToCopy.length,
      totalBytes,
    };
  } else {
    if (!fs.existsSync(destPath)) {
      await fs.promises.mkdir(destPath, { recursive: true });
    }

    const fileEntries: VaultFileEntry[] = Array.isArray(session.index.files)
      ? session.index.files
      : Object.values(session.index.files as Record<string, VaultFileEntry>);
    const totalBytes = fileEntries.reduce((sum, f) => sum + f.size, 0);
    let bytesProcessed = 0;
    let filesExported = 0;

    for (const entry of fileEntries) {
      if (options?.abortSignal?.aborted) {
        throw new Error('Extraction complète annulée.');
      }

      const safeRel = entry.virtualPath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
      const outPath = path.join(destPath, safeRel);
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) {
        await fs.promises.mkdir(outDir, { recursive: true });
      }

      await extractFile(
        session,
        entry.virtualPath,
        outPath,
        {
          overwrite: options?.overwrite,
          abortSignal: options?.abortSignal,
        }
      );

      bytesProcessed += entry.size;
      filesExported++;
      options?.onProgress?.(bytesProcessed, totalBytes);
    }

    return {
      mode: 'extract_all_plaintext',
      filesExported,
      totalBytes,
    };
  }
}

/**
 * Empaquette le coffre-fort dans une archive portable unique (.vgv).
 * Contient EXCLUSIVEMENT les composants déjà chiffrés :
 * - vault.header (et vault.header.bak si présent)
 * - index.enc
 * - blobs/xx/*.enc
 * Ne contient AUCUN fichier en clair, aucun script, aucun exécutable, aucune clé.
 */
export async function exportVaultArchive(
  session: VaultSession,
  archivePath: string,
  options?: {
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<{ archivePath: string; filesCount: number; totalBytes: number }> {
  if (!session.isOpen) {
    throw new Error('Le coffre doit être ouvert pour exporter une archive portable.');
  }

  const normSource = path.resolve(session.vaultRoot).toLowerCase();
  let finalArchivePath = archivePath;
  if (!finalArchivePath.toLowerCase().endsWith('.vgv')) {
    finalArchivePath += '.vgv';
  }
  const normDest = path.resolve(finalArchivePath).toLowerCase();

  // Protection anti-récursion
  if (normDest.startsWith(normSource + path.sep) || normDest === normSource) {
    throw new Error('Destination invalide : l\'archive .vgv ne peut pas être créée à l\'intérieur du coffre source.');
  }

  const filesToPack: { relPath: string; fullPath: string; size: number }[] = [];

  // 1. Header files
  for (const hName of ['vault.header', 'vault.header.bak']) {
    const hPath = path.join(session.vaultRoot, hName);
    if (fs.existsSync(hPath)) {
      filesToPack.push({ relPath: hName, fullPath: hPath, size: fs.statSync(hPath).size });
    }
  }

  // 2. Index file
  const indexPath = path.join(session.vaultRoot, 'index.enc');
  if (fs.existsSync(indexPath)) {
    filesToPack.push({ relPath: 'index.enc', fullPath: indexPath, size: fs.statSync(indexPath).size });
  }

  // 3. Encrypted blobs
  const blobsDir = path.join(session.vaultRoot, 'blobs');
  if (fs.existsSync(blobsDir)) {
    const walkBlobs = (dir: string, rel: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const fullSrc = path.join(dir, e.name);
        const relSrc = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          walkBlobs(fullSrc, relSrc);
        } else if (e.isFile() && e.name.endsWith('.enc')) {
          filesToPack.push({ relPath: `blobs/${relSrc}`.replace(/\\/g, '/'), fullPath: fullSrc, size: fs.statSync(fullSrc).size });
        }
      }
    };
    walkBlobs(blobsDir, '');
  }

  const totalPayloadBytes = filesToPack.reduce((sum, f) => sum + f.size, 0);

  // Write to temporary archive first, then rename atomically
  const tempArchivePath = `${finalArchivePath}.tmp_${Date.now()}`;
  const outDir = path.dirname(finalArchivePath);
  if (!fs.existsSync(outDir)) {
    await fs.promises.mkdir(outDir, { recursive: true });
  }

  const fd = await fs.promises.open(tempArchivePath, 'w');
  let bytesProcessed = 0;

  try {
    // Magic: 8 bytes 'VGV1\0\0\0\0'
    const magicBuf = Buffer.from('VGV1\0\0\0\0', 'ascii');
    // Version: uint32 BE = 1
    // File count: uint32 BE
    const headerBuf = Buffer.alloc(16);
    magicBuf.copy(headerBuf, 0, 0, 8);
    headerBuf.writeUInt32BE(1, 8);
    headerBuf.writeUInt32BE(filesToPack.length, 12);
    await fd.write(headerBuf);

    for (const file of filesToPack) {
      if (options?.abortSignal?.aborted) {
        throw new Error('Exportation de l\'archive annulée.');
      }

      const relPathBuf = Buffer.from(file.relPath, 'utf-8');
      const fileData = await fs.promises.readFile(file.fullPath);
      const sha256 = crypto.createHash('sha256').update(fileData).digest();

      // Record header: pathLen (4B) + relPath (N bytes) + fileSize (8B BigUInt64) + sha256 (32B)
      const recHeader = Buffer.alloc(4 + relPathBuf.length + 8 + 32);
      recHeader.writeUInt32BE(relPathBuf.length, 0);
      relPathBuf.copy(recHeader, 4);
      recHeader.writeBigUInt64BE(BigInt(fileData.length), 4 + relPathBuf.length);
      sha256.copy(recHeader, 4 + relPathBuf.length + 8);

      await fd.write(recHeader);
      await fd.write(fileData);

      bytesProcessed += file.size;
      options?.onProgress?.(bytesProcessed, totalPayloadBytes);
    }

    // Footer
    const footerBuf = Buffer.from('VGV_END\0', 'ascii');
    await fd.write(footerBuf);
    await fd.sync();
  } catch (err) {
    await fd.close();
    try { await fs.promises.unlink(tempArchivePath); } catch {}
    throw err;
  }

  await fd.close();

  // Atomically replace target archive
  try {
    if (fs.existsSync(finalArchivePath)) {
      await fs.promises.unlink(finalArchivePath);
    }
    await fs.promises.rename(tempArchivePath, finalArchivePath);
  } catch (renameErr) {
    try {
      await fs.promises.copyFile(tempArchivePath, finalArchivePath);
      await fs.promises.unlink(tempArchivePath);
    } catch (copyErr) {
      throw renameErr;
    }
  }

  return {
    archivePath: finalArchivePath,
    filesCount: filesToPack.length,
    totalBytes: totalPayloadBytes,
  };
}

/**
 * Importe un coffre-fort depuis une archive portable (.vgv).
 * Décompresse les composants chiffrés dans un nouveau répertoire cible
 * et valide l'intégrité de l'en-tête de coffre.
 */
export async function importVaultArchive(
  archivePath: string,
  targetVaultDir: string,
  options?: {
    onProgress?: (bytesProcessed: number, totalBytes: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<{ targetVaultDir: string; filesExtracted: number; totalBytes: number; headerValid: boolean }> {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive introuvable : ${archivePath}`);
  }

  const normTarget = path.resolve(targetVaultDir);

  // Anti-écrasement et vérification de cible
  if (fs.existsSync(normTarget)) {
    const existingEntries = await fs.promises.readdir(normTarget);
    if (existingEntries.length > 0) {
      throw new Error(`Le dossier cible (${normTarget}) n'est pas vide. L'importation requiert un dossier vide ou inexistant.`);
    }
  } else {
    await fs.promises.mkdir(normTarget, { recursive: true });
  }

  const fd = await fs.promises.open(archivePath, 'r');
  const stat = await fd.stat();
  const fileSize = stat.size;

  let offset = 0;
  // Read magic + version + count (16 bytes)
  const headerBuf = Buffer.alloc(16);
  await fd.read(headerBuf, 0, 16, offset);
  offset += 16;

  const magic = headerBuf.subarray(0, 8).toString('ascii');
  if (!magic.startsWith('VGV1')) {
    await fd.close();
    throw new Error('Fichier archive non reconnu ou format incompatible (magic VGV1 manquant).');
  }

  const version = headerBuf.readUInt32BE(8);
  if (version !== 1) {
    await fd.close();
    throw new Error(`Version d'archive non supportée : ${version}`);
  }

  const fileCount = headerBuf.readUInt32BE(12);
  let filesExtracted = 0;
  let totalBytesExtracted = 0;

  try {
    for (let i = 0; i < fileCount; i++) {
      if (options?.abortSignal?.aborted) {
        throw new Error('Importation de l\'archive annulée.');
      }

      // Read pathLength (4 bytes)
      const pathLenBuf = Buffer.alloc(4);
      await fd.read(pathLenBuf, 0, 4, offset);
      offset += 4;
      const pathLen = pathLenBuf.readUInt32BE(0);

      // Read relPath
      const pathBuf = Buffer.alloc(pathLen);
      await fd.read(pathBuf, 0, pathLen, offset);
      offset += pathLen;
      const relPath = pathBuf.toString('utf-8');

      // Strict security check: no traversal, no absolute, only authorized files
      if (relPath.includes('..') || path.isAbsolute(relPath) || relPath.startsWith('/') || relPath.startsWith('\\')) {
        throw new Error(`Chemin malveillant détecté dans l'archive : ${relPath}`);
      }

      const isAllowedFile =
        relPath === 'vault.header' ||
        relPath === 'vault.header.bak' ||
        relPath === 'index.enc' ||
        (relPath.startsWith('blobs/') && relPath.endsWith('.enc'));

      if (!isAllowedFile) {
        throw new Error(`Composant non autorisé dans l'archive sécurisée : ${relPath}`);
      }

      // Read fileSize (8B) + sha256 (32B)
      const metaBuf = Buffer.alloc(40);
      await fd.read(metaBuf, 0, 40, offset);
      offset += 40;

      const fileDataSize = Number(metaBuf.readBigUInt64BE(0));
      const expectedSha256 = metaBuf.subarray(8, 40);

      // Read payload
      const fileData = Buffer.alloc(fileDataSize);
      await fd.read(fileData, 0, fileDataSize, offset);
      offset += fileDataSize;

      // Verify SHA256 integrity
      const actualSha256 = crypto.createHash('sha256').update(fileData).digest();
      if (!actualSha256.equals(expectedSha256)) {
        throw new Error(`Échec d'intégrité SHA-256 sur le composant chiffré : ${relPath}`);
      }

      // Write to target vault directory
      const outFilePath = path.join(normTarget, ...relPath.split('/'));
      const outDir = path.dirname(outFilePath);
      if (!fs.existsSync(outDir)) {
        await fs.promises.mkdir(outDir, { recursive: true });
      }

      await fs.promises.writeFile(outFilePath, fileData);
      filesExtracted++;
      totalBytesExtracted += fileDataSize;
      options?.onProgress?.(offset, fileSize);
    }
  } finally {
    await fd.close();
  }

  // Validate extracted header
  const headerPath = path.join(normTarget, 'vault.header');
  if (!fs.existsSync(headerPath)) {
    throw new Error('Archive corrompue : composant vault.header absent après extraction.');
  }

  // Test reading the header
  const rawHdr = await fs.promises.readFile(headerPath);
  const parsedHdr = deserializeVaultHeader(new Uint8Array(rawHdr));
  const headerValid = Boolean(parsedHdr && parsedHdr.header && parsedHdr.header.vaultId);

  return {
    targetVaultDir: normTarget,
    filesExtracted,
    totalBytes: totalBytesExtracted,
    headerValid,
  };
}
