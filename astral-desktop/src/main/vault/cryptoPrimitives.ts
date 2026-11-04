/**
 * Vanguard Vault — Cryptographic Primitives (libsodium-wrappers-sumo)
 * 
 * Gestion centralisée des primitives cryptographiques reconnues :
 * - Dérivation de mot de passe : Argon2id (crypto_pwhash_ALG_ARGON2ID13)
 * - Bornes strictes Anti-DoS sur opslimit (1 à 5) et memlimit (8 Ko à 256 Mo)
 * - Chiffrement authentifié des clés maîtresses : AEAD XChaCha20-Poly1305-IETF
 * - Séparation de domaines par dérivation de sous-clés : crypto_kdf_derive_from_key
 * - Effacement mémoire sécurisé : sodium.memzero
 */

import sodium from 'libsodium-wrappers-sumo';

// Bornes strictes de sécurité pour la dérivation KDF (protection Anti-DoS en lecture d'en-tête)
export const KDF_BOUNDS = {
  MIN_OPSLIMIT: 1,
  MAX_OPSLIMIT: 5,
  DEFAULT_OPSLIMIT: 2, // INTERACTIVE

  MIN_MEMLIMIT: 8192,             // 8 Ko (plancher strict d'intégrité)
  MAX_MEMLIMIT: 256 * 1024 * 1024, // 256 Mo
  DEFAULT_MEMLIMIT: 64 * 1024 * 1024, // 64 Mo
};

// Politique stricte de Vanguard lors de la création d'un coffre (interdiction de paramètres affaiblis)
export const VANGUARD_KDF_POLICY = {
  RECOMMENDED_OPSLIMIT: 2,
  MIN_CREATE_OPSLIMIT: 2,
  MAX_CREATE_OPSLIMIT: 4,
  RECOMMENDED_MEMLIMIT: 64 * 1024 * 1024, // 64 Mo
  MIN_CREATE_MEMLIMIT: 64 * 1024 * 1024,  // 64 Mo
  MAX_CREATE_MEMLIMIT: 256 * 1024 * 1024, // 256 Mo
};

export const CRYPTO_SIZES = {
  MASTER_KEY_BYTES: 32,
  SALT_BYTES: 16,
  AEAD_NONCE_BYTES: 24,
  AEAD_ABYTES: 16,
  WRAPPED_KEY_BYTES: 48, // 32 bytes ciphertext + 16 bytes Poly1305 MAC
  STREAM_HEADER_BYTES: 24,
  STREAM_ABYTES: 17,
  CHUNK_SIZE: 65536, // 64 Ko
};

let isReady = false;

/**
 * Initialise le runtime Libsodium WebAssembly
 */
export async function initSodium(): Promise<void> {
  if (isReady) return;
  await sodium.ready;
  isReady = true;
}

export function getSodium() {
  if (!isReady) {
    throw new Error('Libsodium n\'a pas été initialisé. Appelez initSodium() au préalable.');
  }
  return sodium;
}

/**
 * Génère des octets aléatoires cryptographiquement sûrs
 */
export function generateRandomBytes(length: number): Uint8Array {
  const s = getSodium();
  return s.randombytes_buf(length);
}

/**
 * Génère une nouvelle clé maîtresse aléatoire de 32 octets (256 bits)
 */
export function generateVaultMasterKey(): Uint8Array {
  return generateRandomBytes(CRYPTO_SIZES.MASTER_KEY_BYTES);
}

/**
 * Valide les paramètres KDF par rapport aux bornes de sécurité (lecture d'en-tête existant / protection anti-DoS)
 */
export function validateKdfParameters(opslimit: number, memlimit: number): void {
  if (
    typeof opslimit !== 'number' ||
    !Number.isFinite(opslimit) ||
    !Number.isInteger(opslimit) ||
    opslimit < KDF_BOUNDS.MIN_OPSLIMIT ||
    opslimit > KDF_BOUNDS.MAX_OPSLIMIT
  ) {
    throw new Error(`Paramètre KDF opslimit hors bornes autorisées (${KDF_BOUNDS.MIN_OPSLIMIT} - ${KDF_BOUNDS.MAX_OPSLIMIT}) : ${opslimit}`);
  }

  if (
    typeof memlimit !== 'number' ||
    !Number.isFinite(memlimit) ||
    !Number.isInteger(memlimit) ||
    memlimit < KDF_BOUNDS.MIN_MEMLIMIT ||
    memlimit > KDF_BOUNDS.MAX_MEMLIMIT
  ) {
    throw new Error(`Paramètre KDF memlimit hors bornes autorisées (${KDF_BOUNDS.MIN_MEMLIMIT} - ${KDF_BOUNDS.MAX_MEMLIMIT}) : ${memlimit}`);
  }
}

/**
 * Valide les paramètres KDF selon la politique de création de Vanguard (interdiction de paramètres faibles)
 */
export function validateCreationKdfParameters(opslimit: number, memlimit: number): void {
  validateKdfParameters(opslimit, memlimit);

  if (opslimit < VANGUARD_KDF_POLICY.MIN_CREATE_OPSLIMIT) {
    throw new Error(`Politique de création Vanguard : opslimit minimum ${VANGUARD_KDF_POLICY.MIN_CREATE_OPSLIMIT} requis (fourni : ${opslimit}).`);
  }

  if (memlimit < VANGUARD_KDF_POLICY.MIN_CREATE_MEMLIMIT) {
    throw new Error(`Politique de création Vanguard : memlimit minimum ${VANGUARD_KDF_POLICY.MIN_CREATE_MEMLIMIT} octets requis (fourni : ${memlimit}).`);
  }
}

/**
 * Dérivation de clé à partir d'un mot de passe utilisateur via Argon2id
 */
export function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  opslimit: number = KDF_BOUNDS.DEFAULT_OPSLIMIT,
  memlimit: number = KDF_BOUNDS.DEFAULT_MEMLIMIT
): Uint8Array {
  const s = getSodium();
  if (!password || typeof password !== 'string') {
    throw new Error('Le mot de passe doit être une chaîne non vide.');
  }
  if (!salt || salt.length !== CRYPTO_SIZES.SALT_BYTES) {
    throw new Error(`Le sel KDF doit comporter exactement ${CRYPTO_SIZES.SALT_BYTES} octets.`);
  }

  validateKdfParameters(opslimit, memlimit);

  try {
    return s.crypto_pwhash(
      CRYPTO_SIZES.MASTER_KEY_BYTES,
      password,
      salt,
      opslimit,
      memlimit,
      s.crypto_pwhash_ALG_ARGON2ID13
    );
  } catch (err: any) {
    throw new Error(`Échec de dérivation Argon2id (mémoire insuffisante ou paramètre invalide) : ${err?.message}`);
  }
}

/**
 * Dérivation de clé à partir de la clé de secours brute (32 octets) via Argon2id
 */
export function deriveKeyFromRecoveryKey(
  recoveryKeyBytes: Uint8Array,
  salt: Uint8Array,
  opslimit: number = KDF_BOUNDS.DEFAULT_OPSLIMIT,
  memlimit: number = KDF_BOUNDS.DEFAULT_MEMLIMIT
): Uint8Array {
  const s = getSodium();
  if (!recoveryKeyBytes || recoveryKeyBytes.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error(`La clé de secours doit comporter exactement ${CRYPTO_SIZES.MASTER_KEY_BYTES} octets.`);
  }
  if (!salt || salt.length !== CRYPTO_SIZES.SALT_BYTES) {
    throw new Error(`Le sel KDF doit comporter exactement ${CRYPTO_SIZES.SALT_BYTES} octets.`);
  }

  validateKdfParameters(opslimit, memlimit);

  try {
    return s.crypto_pwhash(
      CRYPTO_SIZES.MASTER_KEY_BYTES,
      recoveryKeyBytes,
      salt,
      opslimit,
      memlimit,
      s.crypto_pwhash_ALG_ARGON2ID13
    );
  } catch (err: any) {
    throw new Error(`Échec de dérivation Argon2id pour clé de secours : ${err?.message}`);
  }
}

/**
 * Enveloppe authentifiée de la clé maîtresse via AEAD XChaCha20-Poly1305-IETF
 */
export function wrapMasterKey(
  masterKey: Uint8Array,
  wrappingKey: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array
): Uint8Array {
  const s = getSodium();
  if (masterKey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error('Taille de clé maîtresse invalide.');
  }
  if (wrappingKey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error('Taille de clé d\'enveloppement invalide.');
  }
  if (nonce.length !== CRYPTO_SIZES.AEAD_NONCE_BYTES) {
    throw new Error('Taille de nonce AEAD invalide.');
  }

  // crypto_aead_xchacha20poly1305_ietf_encrypt
  return s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    masterKey,
    aad,
    null,
    nonce,
    wrappingKey
  );
}

/**
 * Déverrouille et extrait la clé maîtresse via AEAD XChaCha20-Poly1305-IETF
 */
export function unwrapMasterKey(
  wrappedKey: Uint8Array,
  wrappingKey: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array
): Uint8Array {
  const s = getSodium();
  if (wrappedKey.length !== CRYPTO_SIZES.WRAPPED_KEY_BYTES) {
    throw new Error(`Taille d'enveloppe invalide (${wrappedKey.length} octets, attendu ${CRYPTO_SIZES.WRAPPED_KEY_BYTES}).`);
  }
  if (wrappingKey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error('Taille de clé d\'enveloppement invalide.');
  }
  if (nonce.length !== CRYPTO_SIZES.AEAD_NONCE_BYTES) {
    throw new Error('Taille de nonce AEAD invalide.');
  }

  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      wrappedKey,
      aad,
      nonce,
      wrappingKey
    );
  } catch {
    throw new Error('Échec d\'authentification de l\'enveloppe : mot de passe incorrect ou données altérées.');
  }
}

/**
 * Dérivation de sous-clés spécialisées avec séparation de domaine
 * via crypto_kdf_derive_from_key (contexte fixe de 8 caractères ASCII)
 */
export function deriveSubkey(
  masterKey: Uint8Array,
  subkeyId: number,
  context: string
): Uint8Array {
  const s = getSodium();
  if (!masterKey || masterKey.length !== CRYPTO_SIZES.MASTER_KEY_BYTES) {
    throw new Error('Taille de clé maîtresse invalide (attendu 32 octets).');
  }
  if (
    typeof subkeyId !== 'number' ||
    !Number.isFinite(subkeyId) ||
    !Number.isInteger(subkeyId) ||
    subkeyId < 0
  ) {
    throw new Error(`Identifiant de sous-clé invalide : ${subkeyId} (entier positif requis).`);
  }
  if (
    !context ||
    typeof context !== 'string' ||
    context.length !== 8 ||
    Buffer.byteLength(context, 'ascii') !== 8 ||
    !/^[\x20-\x7E]{8}$/.test(context)
  ) {
    throw new Error(`Le contexte KDF doit comporter exactement 8 caractères ASCII 7-bit imprimables (fourni : "${context}").`);
  }

  return s.crypto_kdf_derive_from_key(
    CRYPTO_SIZES.MASTER_KEY_BYTES,
    subkeyId,
    context,
    masterKey
  );
}

/**
 * Effacement sécurisé d'un buffer sensible en mémoire vive
 */
export function secureZero(buf: Uint8Array): void {
  try {
    const s = getSodium();
    s.memzero(buf);
  } catch {
    buf.fill(0);
  }
}

