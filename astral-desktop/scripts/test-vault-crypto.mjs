/**
 * Vanguard Vault — Test Suite Cryptographique & Framing Secretstream (Sous-Lot 1)
 * 
 * Valide exhaustivement :
 * 1. Initialisation libsodium & constantes de dimensionnement
 * 2. Encodage Crockford Base32 (256 bits = 52 car. + 4 car. CRC-32 = 56 car.)
 * 3. Allers-retours avec zéros initiaux, octets 0xFF et aléatoires
 * 4. Normalisation stricte Crockford (O->0, I/L->1, casse, tirets, espaces)
 * 5. Détection de fautes de frappe UI via CRC-32 (20 bits)
 * 6. Dérivation Argon2id & enveloppement mot de passe (XChaCha20-Poly1305)
 * 7. Rejet immédiat sur mauvais mot de passe
 * 8. Déverrouillage par clé de secours
 * 9. Indépendance absolue des slots AAD (ré-enveloppement mot de passe sans toucher la récupération)
 * 10. Rejet sur altération d'en-tête (bit flip AAD / ciphertext)
 * 11. Protection Anti-DoS sur paramètres KDF (opslimit & memlimit)
 * 12. Séparation de domaine KDF (vgv_meta vs vgv_data)
 * 13. Secretstream mémoire : fichier vide (0 octet)
 * 14. Secretstream mémoire : multi-blocs (> 128 Ko)
 * 15. Règle anti-substitution contextuelle AAD (FileId, VaultId, ObjectType, Version)
 * 16. Rejet de flux tronqué et de données surnuméraires
 * 17. Streaming fichier (encryptFile / decryptFile) avec fsync et staging
 * 18. Fichier vide sur disque
 * 19. Nettoyage garanti du staging en cas d'altération fichier
 * 20. Effacement sécurisé en mémoire (secureZero)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import {
  initSodium,
  getSodium,
  generateVaultMasterKey,
  deriveKeyFromPassword,
  deriveKeyFromRecoveryKey,
  wrapMasterKey,
  unwrapMasterKey,
  deriveSubkey,
  secureZero,
  validateKdfParameters,
  validateCreationKdfParameters,
  KDF_BOUNDS,
  VANGUARD_KDF_POLICY,
  CRYPTO_SIZES,
} from '../src/main/vault/cryptoPrimitives.ts';

import {
  generateRecoveryKey,
  formatRecoveryKey,
  parseRecoveryKey,
  validateRecoveryKeyString,
  CROCKFORD_ALPHABET,
} from '../src/main/vault/recoveryKey.ts';

import {
  FORMAT_CONSTANTS,
  buildSlotAad,
  buildHeaderPrefix,
  serializeVaultHeader,
  deserializeVaultHeader,
} from '../src/main/vault/envelopeSerializer.ts';

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
} from '../src/main/vault/streamBinding.ts';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failed++;
  }
}

async function main() {
  console.log('=== Vanguard Vault : Suite de Tests Cryptographiques (Sous-Lot 1) ===\n');

  // 1. Initialisation libsodium
  await runTest('1. Initialisation libsodium WebAssembly & symboles requis', async () => {
    await initSodium();
    const s = getSodium();
    assert.ok(s, 'Instance libsodium non disponible');
    assert.strictEqual(typeof s.crypto_secretstream_xchacha20poly1305_init_push, 'function');
    assert.strictEqual(typeof s.crypto_pwhash, 'function');
    assert.strictEqual(typeof s.crypto_aead_xchacha20poly1305_ietf_encrypt, 'function');
  });

  // 2. Format de clé de secours Crockford (56 caractères : 52 + 4)
  await runTest('2. Format clé de secours : 52 caractères Base32 + 4 caractères CRC-32 (14 groupes de 4)', async () => {
    const rawKey = generateRecoveryKey();
    assert.strictEqual(rawKey.length, 32);

    const formatted = formatRecoveryKey(rawKey);
    // 56 caractères utiles + 13 tirets = 69 caractères
    assert.strictEqual(formatted.length, 69);
    const groups = formatted.split('-');
    assert.strictEqual(groups.length, 14);
    for (const g of groups) {
      assert.strictEqual(g.length, 4);
      assert.ok(/^[0-9A-Z]{4}$/.test(g));
    }
  });

  // 3. Allers-retours avec cas extrêmes (zéros initiaux, 0xFF, aléatoire)
  await runTest('3. Allers-retours de clé de secours : zéros initiaux, 0xFF et aléatoires', async () => {
    // Cas zéros initiaux
    const zeroKey = new Uint8Array(32);
    zeroKey[31] = 0x01; // presque tout zéro
    const zeroFmt = formatRecoveryKey(zeroKey);
    const zeroParsed = parseRecoveryKey(zeroFmt);
    assert.deepStrictEqual(zeroParsed, zeroKey);

    // Cas tout zéro
    const allZeros = new Uint8Array(32);
    const allZerosFmt = formatRecoveryKey(allZeros);
    const allZerosParsed = parseRecoveryKey(allZerosFmt);
    assert.deepStrictEqual(allZerosParsed, allZeros);

    // Cas tout 0xFF
    const allFF = new Uint8Array(32).fill(0xFF);
    const allFFFmt = formatRecoveryKey(allFF);
    const allFFParsed = parseRecoveryKey(allFFFmt);
    assert.deepStrictEqual(allFFParsed, allFF);

    // Cas aléatoires
    for (let i = 0; i < 5; i++) {
      const randKey = generateRecoveryKey();
      const fmt = formatRecoveryKey(randKey);
      const parsed = parseRecoveryKey(fmt);
      assert.deepStrictEqual(parsed, randKey);
    }
  });

  // 4. Normalisation Crockford stricte
  await runTest('4. Normalisation Crockford : minuscules, O->0, I/L->1, espaces et tirets tolérés', async () => {
    const key = generateRecoveryKey();
    const standardStr = formatRecoveryKey(key);

    // Remplacer des 0 par des O/o, et des 1 par des I/i/L/l
    let modified = standardStr.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
    // Insérer des espaces et tirets arbitraires
    modified = modified.replace(/-/g, ' - ');

    const parsed = parseRecoveryKey(modified);
    assert.deepStrictEqual(parsed, key);
  });

  // 5. Détection de fautes de frappe UI via CRC-32 (20 bits)
  await runTest('5. Détection de fautes de frappe UI via CRC-32 sans exécuter KDF', async () => {
    const key = generateRecoveryKey();
    const str = formatRecoveryKey(key);

    // 1. Chaîne valide
    assert.strictEqual(validateRecoveryKeyString(str).valid, true);

    // 2. Altération d'un caractère dans le secret
    const chars = str.split('');
    const firstChar = chars[0];
    chars[0] = (firstChar === 'A') ? 'B' : 'A';
    const corruptedBody = chars.join('');
    const resBody = validateRecoveryKeyString(corruptedBody);
    assert.strictEqual(resBody.valid, false);
    assert.ok(resBody.error?.includes('Somme de contrôle') || resBody.error?.includes('contrôle'));

    // 3. Altération d'un caractère dans le checksum (dernier groupe)
    const charsCrc = str.split('');
    charsCrc[charsCrc.length - 1] = (charsCrc[charsCrc.length - 1] === '0') ? '1' : '0';
    const corruptedCrc = charsCrc.join('');
    const resCrc = validateRecoveryKeyString(corruptedCrc);
    assert.strictEqual(resCrc.valid, false);

    // 4. Longueur tronquée
    const truncated = str.slice(0, 50);
    const resTrunc = validateRecoveryKeyString(truncated);
    assert.strictEqual(resTrunc.valid, false);
    assert.ok(resTrunc.error?.includes('Longueur'));
  });

  // 6. Dérivation Argon2id & Enveloppement Mot de Passe
  await runTest('6. Dérivation Argon2id & enveloppement mot de passe (XChaCha20-Poly1305)', async () => {
    const masterKey = generateVaultMasterKey();
    const salt = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
    const nonce = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
    const aad = crypto.randomBytes(59); // Simule HeaderPrefix(32) + SlotMetadata(27)

    const password = 'MonMotDePasseTresSecurise!2026';
    const kek = deriveKeyFromPassword(password, salt, 2, 64 * 1024 * 1024);
    assert.strictEqual(kek.length, 32);

    const wrapped = wrapMasterKey(masterKey, kek, nonce, aad);
    assert.strictEqual(wrapped.length, CRYPTO_SIZES.WRAPPED_KEY_BYTES);

    // Déballage nominal
    const unwrapped = unwrapMasterKey(wrapped, kek, nonce, aad);
    assert.deepStrictEqual(unwrapped, masterKey);
  });

  // 7. Rejet immédiat sur mauvais mot de passe
  await runTest('7. Rejet formel sur mauvais mot de passe (échec AEAD sans fuite de clé)', async () => {
    const masterKey = generateVaultMasterKey();
    const salt = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
    const nonce = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
    const aad = crypto.randomBytes(59);

    const correctKek = deriveKeyFromPassword('CorrectPass123', salt, 1, 8192);
    const wrongKek = deriveKeyFromPassword('WrongPass456', salt, 1, 8192);

    const wrapped = wrapMasterKey(masterKey, correctKek, nonce, aad);

    assert.throws(() => {
      unwrapMasterKey(wrapped, wrongKek, nonce, aad);
    }, /Échec d'authentification de l'enveloppe/);
  });

  // 8. Déverrouillage par clé de secours
  await runTest('8. Enveloppement et déverrouillage via clé de secours Crockford', async () => {
    const masterKey = generateVaultMasterKey();
    const recoveryKey = generateRecoveryKey();
    const salt = crypto.randomBytes(CRYPTO_SIZES.SALT_BYTES);
    const nonce = crypto.randomBytes(CRYPTO_SIZES.AEAD_NONCE_BYTES);
    const aad = crypto.randomBytes(59);

    const recoveryKek = deriveKeyFromRecoveryKey(recoveryKey, salt, 1, 8192);
    const wrapped = wrapMasterKey(masterKey, recoveryKek, nonce, aad);

    const unwrapped = unwrapMasterKey(wrapped, recoveryKek, nonce, aad);
    assert.deepStrictEqual(unwrapped, masterKey);
  });

  // 9. Indépendance des AAD & ré-enveloppement découplé
  await runTest('9. Indépendance des AAD : changement de mot de passe sans altérer l\'enveloppe de secours', async () => {
    const masterKey = generateVaultMasterKey();
    const vaultId = crypto.randomBytes(16);
    const headerPrefix = buildHeaderPrefix(vaultId, 0x03, 1);

    // 1. Initialiser slot mot de passe
    const saltPass1 = crypto.randomBytes(16);
    const noncePass1 = crypto.randomBytes(24);
    const kekPass1 = deriveKeyFromPassword('PassInitial', saltPass1, 1, 8192);
    const slotPass1 = {
      slotType: FORMAT_CONSTANTS.SLOT_TYPE_PASSWORD,
      kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
      opslimit: 1,
      memlimit: 8192,
      salt: saltPass1,
      aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
      nonce: noncePass1,
      wrappedKey: new Uint8Array(48),
    };
    const aadPass1 = buildSlotAad(headerPrefix, slotPass1);
    slotPass1.wrappedKey = wrapMasterKey(masterKey, kekPass1, noncePass1, aadPass1);

    // 2. Initialiser slot de récupération
    const recKey = generateRecoveryKey();
    const saltRec = crypto.randomBytes(16);
    const nonceRec = crypto.randomBytes(24);
    const kekRec = deriveKeyFromRecoveryKey(recKey, saltRec, 1, 8192);
    const slotRec = {
      slotType: FORMAT_CONSTANTS.SLOT_TYPE_RECOVERY,
      kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
      opslimit: 1,
      memlimit: 8192,
      salt: saltRec,
      aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
      nonce: nonceRec,
      wrappedKey: new Uint8Array(48),
    };
    const aadRecInitial = buildSlotAad(headerPrefix, slotRec);
    slotRec.wrappedKey = wrapMasterKey(masterKey, kekRec, nonceRec, aadRecInitial);

    // 3. Changement courant du mot de passe
    const saltPass2 = crypto.randomBytes(16);
    const noncePass2 = crypto.randomBytes(24);
    const kekPass2 = deriveKeyFromPassword('NouveauPassSecurise', saltPass2, 1, 8192);
    const slotPass2 = {
      ...slotPass1,
      salt: saltPass2,
      nonce: noncePass2,
    };
    const aadPass2 = buildSlotAad(headerPrefix, slotPass2);
    slotPass2.wrappedKey = wrapMasterKey(masterKey, kekPass2, noncePass2, aadPass2);

    // 4. Vérifier que l'AAD du slot de récupération et son enveloppe sont rigoureusement intacts
    const aadRecApresChangementMotDePasse = buildSlotAad(headerPrefix, slotRec);
    assert.deepStrictEqual(aadRecApresChangementMotDePasse, aadRecInitial);

    // Déverrouillage par clé de secours toujours 100% fonctionnel
    const unwrappedRec = unwrapMasterKey(slotRec.wrappedKey, kekRec, slotRec.nonce, aadRecApresChangementMotDePasse);
    assert.deepStrictEqual(unwrappedRec, masterKey);

    // Déverrouillage par nouveau mot de passe fonctionnel
    const unwrappedPass2 = unwrapMasterKey(slotPass2.wrappedKey, kekPass2, slotPass2.nonce, aadPass2);
    assert.deepStrictEqual(unwrappedPass2, masterKey);
  });

  // 10. Rejet sur altération d'en-tête (bit flip AAD / ciphertext)
  await runTest('10. Rejet sur altération d\'un bit (en-tête, slot ou ciphertext)', async () => {
    const masterKey = generateVaultMasterKey();
    const vaultId = crypto.randomBytes(16);
    const prefix = buildHeaderPrefix(vaultId, 0x01, 1);
    const salt = crypto.randomBytes(16);
    const nonce = crypto.randomBytes(24);
    const kek = deriveKeyFromPassword('Pass123', salt, 1, 8192);

    const slot = {
      slotType: FORMAT_CONSTANTS.SLOT_TYPE_PASSWORD,
      kdfAlg: FORMAT_CONSTANTS.KDF_ALG_ARGON2ID,
      opslimit: 1,
      memlimit: 8192,
      salt,
      aeadAlg: FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305,
      nonce,
      wrappedKey: new Uint8Array(48),
    };
    const aad = buildSlotAad(prefix, slot);
    slot.wrappedKey = wrapMasterKey(masterKey, kek, nonce, aad);

    // 1. Bit flip dans l'AAD (ex: modifier vaultId)
    const corruptedPrefix = new Uint8Array(prefix);
    corruptedPrefix[10] ^= 0x01;
    const corruptedAad = buildSlotAad(corruptedPrefix, slot);
    assert.throws(() => {
      unwrapMasterKey(slot.wrappedKey, kek, nonce, corruptedAad);
    }, /Échec d'authentification/);

    // 2. Bit flip dans le wrappedKey
    const corruptedWrapped = new Uint8Array(slot.wrappedKey);
    corruptedWrapped[5] ^= 0x01;
    assert.throws(() => {
      unwrapMasterKey(corruptedWrapped, kek, nonce, aad);
    }, /Échec d'authentification/);
  });

  // 11. Protection Anti-DoS KDF
  await runTest('11. Bornes strictes Anti-DoS sur paramètres KDF (opslimit & memlimit)', async () => {
    const salt = crypto.randomBytes(16);

    // opslimit hors bornes (< 1 ou > 5)
    assert.throws(() => {
      deriveKeyFromPassword('test', salt, 0, 8192);
    }, /opslimit hors bornes/);
    assert.throws(() => {
      deriveKeyFromPassword('test', salt, 6, 8192);
    }, /opslimit hors bornes/);

    // memlimit hors bornes (< 8 Ko ou > 256 Mo)
    assert.throws(() => {
      deriveKeyFromPassword('test', salt, 1, 4096);
    }, /memlimit hors bornes/);
    assert.throws(() => {
      deriveKeyFromPassword('test', salt, 1, 300 * 1024 * 1024);
    }, /memlimit hors bornes/);
  });

  // 12. Séparation de domaine KDF (vgv_meta vs vgv_data)
  await runTest('12. Séparation de domaine KDF (crypto_kdf_derive_from_key)', async () => {
    const masterKey = generateVaultMasterKey();

    const metaKey = deriveSubkey(masterKey, 1, 'vgv_meta');
    const dataKey = deriveSubkey(masterKey, 1, 'vgv_data');

    assert.strictEqual(metaKey.length, 32);
    assert.strictEqual(dataKey.length, 32);
    assert.notDeepStrictEqual(metaKey, dataKey);
    assert.notDeepStrictEqual(metaKey, masterKey);

    // Contexte invalide (longueur != 8)
    assert.throws(() => {
      deriveSubkey(masterKey, 1, 'short');
    }, /8 caractères ASCII/);
  });

  // 13. Secretstream mémoire : fichier vide (0 octet)
  await runTest('13. Secretstream mémoire : bloc unique 0 octet avec TAG_FINAL', async () => {
    const key = generateVaultMasterKey();
    const vaultId = crypto.randomBytes(16);
    const fileId = crypto.randomBytes(16);
    const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

    const empty = new Uint8Array(0);
    const encrypted = encryptBuffer(empty, key, aad);

    // 24 (header) + 4 (len) + 17 (chunk) = 45 octets
    assert.strictEqual(encrypted.length, 45);

    const decrypted = decryptBuffer(encrypted, key, aad);
    assert.strictEqual(decrypted.length, 0);
  });

  // 14. Secretstream mémoire : multi-blocs (> 128 Ko)
  await runTest('14. Secretstream mémoire : round-trip multi-blocs (150 Ko)', async () => {
    const key = generateVaultMasterKey();
    const vaultId = crypto.randomBytes(16);
    const fileId = crypto.randomBytes(16);
    const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

    // Buffer de 150 Ko avec contenu aléatoire
    const plaintext = crypto.randomBytes(150 * 1024);
    const encrypted = encryptBuffer(plaintext, key, aad);

    const decrypted = decryptBuffer(encrypted, key, aad);
    assert.deepStrictEqual(decrypted, new Uint8Array(plaintext));
  });

  // 15. Règle anti-substitution contextuelle AAD (FileId, VaultId, ObjectType, Version)
  await runTest('15. Règle anti-substitution : rejet si FileId, VaultId ou ObjectType intervertis', async () => {
    const key = generateVaultMasterKey();
    const vaultA = crypto.randomBytes(16);
    const vaultB = crypto.randomBytes(16);
    const file1 = crypto.randomBytes(16);
    const file2 = crypto.randomBytes(16);

    const aadFile1 = buildStreamAad(vaultA, file1, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);
    const aadFile2 = buildStreamAad(vaultA, file2, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);
    const aadVaultB = buildStreamAad(vaultB, file1, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);
    const aadIndex = buildStreamAad(vaultA, file1, STREAM_CONSTANTS.OBJECT_TYPE_INDEX, 1);

    const plaintext = Buffer.from('Secret data for file 1 in Vault A');
    const encrypted = encryptBuffer(plaintext, key, aadFile1);

    // 1. Tenter de déchiffrer pour file2 (substitution de fichier dans le même coffre)
    assert.throws(() => {
      decryptBuffer(encrypted, key, aadFile2);
    }, /Échec d'authentification Secretstream/);

    // 2. Tenter de déchiffrer avec Vault B (substitution de coffre)
    assert.throws(() => {
      decryptBuffer(encrypted, key, aadVaultB);
    }, /Échec d'authentification Secretstream/);

    // 3. Tenter de déchiffrer un payload comme un index
    assert.throws(() => {
      decryptBuffer(encrypted, key, aadIndex);
    }, /Échec d'authentification Secretstream/);
  });

  // 16. Rejet de flux tronqué et de données surnuméraires
  await runTest('16. Détection stricte de flux tronqué et de données surnuméraires après TAG_FINAL', async () => {
    const key = generateVaultMasterKey();
    const vaultId = crypto.randomBytes(16);
    const fileId = crypto.randomBytes(16);
    const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

    const plaintext = crypto.randomBytes(80 * 1024); // 2 blocs : 64 Ko + 16 Ko
    const encrypted = encryptBuffer(plaintext, key, aad);

    // 1. Données surnuméraires : ajout d'octets après le bloc final
    const withExtra = new Uint8Array(encrypted.length + 10);
    withExtra.set(encrypted, 0);
    withExtra.fill(0xAA, encrypted.length);
    assert.throws(() => {
      decryptBuffer(withExtra, key, aad);
    }, /Données surnuméraires détectées après le bloc final/);

    // 2. Flux tronqué : suppression du dernier bloc
    // Trouvons la fin du premier bloc
    const firstChunkLen = (
      (encrypted[24] << 24) |
      (encrypted[25] << 16) |
      (encrypted[26] << 8) |
      encrypted[27]
    ) >>> 0;
    const truncated = encrypted.subarray(0, 24 + 4 + firstChunkLen);
    assert.throws(() => {
      decryptBuffer(truncated, key, aad);
    }, /Flux tronqué/);
  });

  // 17. Streaming fichier (encryptFile / decryptFile) avec fsync et staging
  await runTest('17. Streaming fichier (encryptFile / decryptFile) avec fsync et staging atomique', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    try {
      const srcFile = path.join(testDir, 'source.dat');
      const encFile = path.join(testDir, 'source.dat.enc');
      const decFile = path.join(testDir, 'decrypted.dat');

      // Générer 180 Ko de données pseudo-aléatoires
      const originalData = crypto.randomBytes(180 * 1024);
      await fs.promises.writeFile(srcFile, originalData);

      const key = generateVaultMasterKey();
      const vaultId = crypto.randomBytes(16);
      const fileId = crypto.randomBytes(16);
      const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

      // Chiffrement fichier
      const encResult = await encryptFile(srcFile, encFile, key, aad);
      assert.strictEqual(encResult.plaintextBytes, 180 * 1024);
      assert.ok(fs.existsSync(encFile));

      // Déchiffrement fichier
      const decResult = await decryptFile(encFile, decFile, key, aad);
      assert.strictEqual(decResult.plaintextBytes, 180 * 1024);
      assert.ok(fs.existsSync(decFile));

      // Vérification intégrité binaire
      const decryptedData = await fs.promises.readFile(decFile);
      assert.deepStrictEqual(decryptedData, originalData);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 18. Fichier vide sur disque
  await runTest('18. Streaming fichier vide (0 octet) : round-trip nominal', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-empty-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    try {
      const srcFile = path.join(testDir, 'empty.dat');
      const encFile = path.join(testDir, 'empty.dat.enc');
      const decFile = path.join(testDir, 'empty.dec.dat');

      await fs.promises.writeFile(srcFile, Buffer.alloc(0));

      const key = generateVaultMasterKey();
      const vaultId = crypto.randomBytes(16);
      const fileId = crypto.randomBytes(16);
      const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

      await encryptFile(srcFile, encFile, key, aad);
      await decryptFile(encFile, decFile, key, aad);

      const decryptedData = await fs.promises.readFile(decFile);
      assert.strictEqual(decryptedData.length, 0);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 19. Nettoyage garanti du staging en cas d'altération fichier
  await runTest('19. Nettoyage garanti du staging temporaire en cas de corruption sur disque', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-corrupt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    try {
      const srcFile = path.join(testDir, 'source.dat');
      const encFile = path.join(testDir, 'source.dat.enc');
      const decFile = path.join(testDir, 'destination.dat');

      await fs.promises.writeFile(srcFile, crypto.randomBytes(70 * 1024));

      const key = generateVaultMasterKey();
      const vaultId = crypto.randomBytes(16);
      const fileId = crypto.randomBytes(16);
      const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

      await encryptFile(srcFile, encFile, key, aad);

      // Altérer 1 octet dans le fichier chiffré
      const encBytes = await fs.promises.readFile(encFile);
      encBytes[50] ^= 0xFF;
      await fs.promises.writeFile(encFile, encBytes);

      // Tenter le déchiffrement -> doit échouer
      await assert.rejects(async () => {
        await decryptFile(encFile, decFile, key, aad);
      }, /Échec d'authentification Secretstream/);

      // Vérifier que le fichier destination n'a PAS été créé
      assert.strictEqual(fs.existsSync(decFile), false);

      // Vérifier qu'aucun fichier temporaire .tmp ne subsiste dans le répertoire
      const dirContents = await fs.promises.readdir(testDir);
      const tmpFiles = dirContents.filter(f => f.includes('.tmp'));
      assert.strictEqual(tmpFiles.length, 0);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 20. Effacement sécurisé en mémoire (secureZero)
  await runTest('20. Effacement sécurisé en mémoire vive (secureZero / sodium.memzero)', async () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    secureZero(buf);
    for (let i = 0; i < buf.length; i++) {
      assert.strictEqual(buf[i], 0);
    }
  });

  // 21. Sérialisation d'en-tête avec offsets exacts attendus (Spécification v1)
  await runTest('21. Sérialisation binaire avec offsets exacts attendus (32B prefix + 99B slots)', async () => {
    const vaultId = new Uint8Array(16);
    for (let i = 0; i < 16; i++) vaultId[i] = i + 1; // 0x01..0x10

    const salt1 = new Uint8Array(16).fill(0xAA);
    const nonce1 = new Uint8Array(24).fill(0xBB);
    const wrapped1 = new Uint8Array(48).fill(0xCC);

    const salt2 = new Uint8Array(16).fill(0xDD);
    const nonce2 = new Uint8Array(24).fill(0xEE);
    const wrapped2 = new Uint8Array(48).fill(0xFF);

    const header = {
      formatVersion: 1,
      vaultId,
      flags: 0x03,
      passwordSlot: {
        slotType: 0x01,
        kdfAlg: 0x02,
        opslimit: 2,
        memlimit: 67108864, // 64 Mo = 0x04000000
        salt: salt1,
        aeadAlg: 0x01,
        nonce: nonce1,
        wrappedKey: wrapped1,
      },
      recoverySlot: {
        slotType: 0x02,
        kdfAlg: 0x02,
        opslimit: 3,
        memlimit: 134217728, // 128 Mo = 0x08000000
        salt: salt2,
        aeadAlg: 0x01,
        nonce: nonce2,
        wrappedKey: wrapped2,
      },
    };

    const raw = serializeVaultHeader(header);
    assert.strictEqual(raw.length, 230); // 32 + 99 + 99

    // Vérification byte-par-byte des offsets exacts de la spécification
    // Offset 0..3 : 'VGV1'
    assert.strictEqual(raw[0], 0x56);
    assert.strictEqual(raw[1], 0x47);
    assert.strictEqual(raw[2], 0x56);
    assert.strictEqual(raw[3], 0x31);
    // Offset 4..5 : Format Version = 1 (uint16be)
    assert.strictEqual(raw[4], 0x00);
    assert.strictEqual(raw[5], 0x01);
    // Offset 6..21 : VaultId (16 octets)
    for (let i = 0; i < 16; i++) {
      assert.strictEqual(raw[6 + i], i + 1);
    }
    // Offset 22 : Flags = 0x03
    assert.strictEqual(raw[22], 0x03);
    // Offset 23..31 : Reserved = 0x00 (9 octets)
    for (let i = 23; i < 32; i++) {
      assert.strictEqual(raw[i], 0x00);
    }

    // Slot 1 (Mot de passe) à l'offset 32 (longueur 99 octets : 32..130)
    assert.strictEqual(raw[32], 0x01); // Type
    assert.strictEqual(raw[33], 0x02); // KdfAlg Argon2id
    // Opslimit = 2 (uint32be : 0x00000002)
    assert.strictEqual(raw[34], 0x00);
    assert.strictEqual(raw[35], 0x00);
    assert.strictEqual(raw[36], 0x00);
    assert.strictEqual(raw[37], 0x02);
    // Memlimit = 64 Mo (uint32be : 0x04000000)
    assert.strictEqual(raw[38], 0x04);
    assert.strictEqual(raw[39], 0x00);
    assert.strictEqual(raw[40], 0x00);
    assert.strictEqual(raw[41], 0x00);
    // Sel (offset 42..57)
    for (let i = 0; i < 16; i++) assert.strictEqual(raw[42 + i], 0xAA);
    // AeadAlg = 0x01 (offset 58)
    assert.strictEqual(raw[58], 0x01);
    // Nonce (offset 59..82, 24 octets)
    for (let i = 0; i < 24; i++) assert.strictEqual(raw[59 + i], 0xBB);
    // WrappedKey (offset 83..130, 48 octets)
    for (let i = 0; i < 48; i++) assert.strictEqual(raw[83 + i], 0xCC);

    // Slot 2 (Récupération) à l'offset 131 (longueur 99 octets : 131..229)
    assert.strictEqual(raw[131], 0x02); // Type
    assert.strictEqual(raw[132], 0x02); // KdfAlg Argon2id
    // Opslimit = 3 (uint32be : 0x00000003)
    assert.strictEqual(raw[133], 0x00);
    assert.strictEqual(raw[134], 0x00);
    assert.strictEqual(raw[135], 0x00);
    assert.strictEqual(raw[136], 0x03);
    // Memlimit = 128 Mo (uint32be : 0x08000000)
    assert.strictEqual(raw[137], 0x08);
    assert.strictEqual(raw[138], 0x00);
    assert.strictEqual(raw[139], 0x00);
    assert.strictEqual(raw[140], 0x00);
    // Sel (offset 141..156)
    for (let i = 0; i < 16; i++) assert.strictEqual(raw[141 + i], 0xDD);
    // AeadAlg = 0x01 (offset 157)
    assert.strictEqual(raw[157], 0x01);
    // Nonce (offset 158..181, 24 octets)
    for (let i = 0; i < 24; i++) assert.strictEqual(raw[158 + i], 0xEE);
    // WrappedKey (offset 182..229, 48 octets)
    for (let i = 0; i < 48; i++) assert.strictEqual(raw[182 + i], 0xFF);
  });

  // 22. Contextes KDF de 8 octets stricts et rejet des contextes invalides
  await runTest('22. Contextes KDF de 8 octets ASCII stricts (vgv_meta, vgv_data)', async () => {
    const masterKey = generateVaultMasterKey();

    // Contextes officiels autorisés
    const metaKey = deriveSubkey(masterKey, 1, 'vgv_meta');
    const dataKey = deriveSubkey(masterKey, 1, 'vgv_data');
    assert.strictEqual(metaKey.length, 32);
    assert.strictEqual(dataKey.length, 32);

    // Rejet contextes non ASCII ou de longueur != 8
    assert.throws(() => deriveSubkey(masterKey, 1, 'vgv'), /exactement 8 caractères ASCII/);
    assert.throws(() => deriveSubkey(masterKey, 1, 'vgv_metal'), /exactement 8 caractères ASCII/);
    assert.throws(() => deriveSubkey(masterKey, 1, 'vgv_méta'), /exactement 8 caractères ASCII/); // non-ASCII UTF-8
    assert.throws(() => deriveSubkey(masterKey, -1, 'vgv_meta'), /Identifiant de sous-clé invalide/);
    assert.throws(() => deriveSubkey(masterKey, 1.5, 'vgv_meta'), /Identifiant de sous-clé invalide/);
  });

  // 23. Bornes KDF : types non finis, non entiers, NaN, et politique de création
  await runTest('23. Bornes KDF : validation stricte anti-NaN, entiers finis et politique de création', async () => {
    const salt = crypto.randomBytes(16);

    // validateKdfParameters : Rejet NaN, Infinity, floats, négatifs
    assert.throws(() => validateKdfParameters(NaN, 64 * 1024 * 1024), /opslimit hors bornes/);
    assert.throws(() => validateKdfParameters(Infinity, 64 * 1024 * 1024), /opslimit hors bornes/);
    assert.throws(() => validateKdfParameters(2.5, 64 * 1024 * 1024), /opslimit hors bornes/);
    assert.throws(() => validateKdfParameters(2, NaN), /memlimit hors bornes/);
    assert.throws(() => validateKdfParameters(2, -8192), /memlimit hors bornes/);

    // validateCreationKdfParameters : Interdiction de paramètres faibles à la création
    assert.throws(() => validateCreationKdfParameters(1, 64 * 1024 * 1024), /opslimit minimum 2 requis/);
    assert.throws(() => validateCreationKdfParameters(2, 32 * 1024 * 1024), /memlimit minimum/);
    // Paramètres création valides
    validateCreationKdfParameters(VANGUARD_KDF_POLICY.RECOMMENDED_OPSLIMIT, VANGUARD_KDF_POLICY.RECOMMENDED_MEMLIMIT);
  });

  // 24. Framing Secretstream : tailles impossibles et limites exactes (64 Ko, multiples)
  await runTest('24. Framing Secretstream : rejet longueurs anormales & limites exactes 64 Ko / 128 Ko', async () => {
    const key = generateVaultMasterKey();
    const vaultId = crypto.randomBytes(16);
    const fileId = crypto.randomBytes(16);
    const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

    // 1. Plaintext exactement 64 Ko (65536 octets)
    const exact64k = crypto.randomBytes(65536);
    const enc64k = encryptBuffer(exact64k, key, aad);
    // 24 (header) + 4 (len) + 65553 (cipher) = 65581 octets
    assert.strictEqual(enc64k.length, 65581);
    const dec64k = decryptBuffer(enc64k, key, aad);
    assert.deepStrictEqual(dec64k, new Uint8Array(exact64k));

    // 2. Plaintext exactement 128 Ko (131072 octets)
    const exact128k = crypto.randomBytes(131072);
    const enc128k = encryptBuffer(exact128k, key, aad);
    // 24 + (4 + 65553) + (4 + 65553) = 131138 octets
    assert.strictEqual(enc128k.length, 131138);
    const dec128k = decryptBuffer(enc128k, key, aad);
    assert.deepStrictEqual(dec128k, new Uint8Array(exact128k));

    // 3. Rejet longueur de bloc annoncée trop petite (< 17)
    const corruptedSmall = new Uint8Array(enc64k);
    corruptedSmall[24] = 0x00;
    corruptedSmall[25] = 0x00;
    corruptedSmall[26] = 0x00;
    corruptedSmall[27] = 0x05; // 5 octets
    assert.throws(() => decryptBuffer(corruptedSmall, key, aad), /Taille de bloc invalide/);

    // 4. Rejet longueur de bloc annoncée trop grande (> 65553)
    const corruptedBig = new Uint8Array(enc64k);
    corruptedBig[24] = 0x00;
    corruptedBig[25] = 0x02; // > 65553
    corruptedBig[26] = 0x00;
    corruptedBig[27] = 0x00;
    assert.throws(() => decryptBuffer(corruptedBig, key, aad), /Taille de bloc invalide/);

    // 5. Rejet longueur annoncée dépassant les octets restants
    const corruptedOvershoot = new Uint8Array(enc64k.subarray(0, 100)); // tronqué à 100 octets
    // mais bloc annonce 65553 octets
    assert.throws(() => decryptBuffer(corruptedOvershoot, key, aad), /dépasse les données restantes/);
  });

  // 25. Conflit d'extraction, protection anti-écrasement et race condition
  await runTest('25. Protection extraction anti-écrasement & détection de conflit (TOCTOU)', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-conflict-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    try {
      const srcFile = path.join(testDir, 'source.dat');
      const encFile = path.join(testDir, 'source.dat.enc');
      const destFile = path.join(testDir, 'extracted.dat');

      await fs.promises.writeFile(srcFile, Buffer.from('Contenu secret à extraire'));

      const key = generateVaultMasterKey();
      const vaultId = crypto.randomBytes(16);
      const fileId = crypto.randomBytes(16);
      const aad = buildStreamAad(vaultId, fileId, STREAM_CONSTANTS.OBJECT_TYPE_PAYLOAD, 1);

      await encryptFile(srcFile, encFile, key, aad);

      // Cas 1 : destination existe déjà avant extraction -> refus immédiat (overwrite: false par défaut)
      await fs.promises.writeFile(destFile, Buffer.from('Fichier tiers préexistant'));
      await assert.rejects(async () => {
        await decryptFile(encFile, destFile, key, aad, { overwrite: false });
      }, (err) => {
        assert.ok(err instanceof DestinationConflictError);
        return true;
      });
      // Vérifier que le fichier tiers est resté strictement intact
      assert.strictEqual((await fs.promises.readFile(destFile, 'utf8')), 'Fichier tiers préexistant');

      // Cas 2 : avec overwrite: true explicite -> écrasement autorisé
      await decryptFile(encFile, destFile, key, aad, { overwrite: true });
      assert.strictEqual((await fs.promises.readFile(destFile, 'utf8')), 'Contenu secret à extraire');
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  console.log('-------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur non rattrapée dans la suite de tests :', err);
  process.exit(1);
});
