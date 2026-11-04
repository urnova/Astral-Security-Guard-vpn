/**
 * Vanguard Vault — Recovery Key Encoder & Checksum Validator
 * 
 * Encodage et décodage de la clé de secours (256 bits / 32 octets) :
 * - Alphabet Base32 Crockford normalisé (32 symboles : 0-9, A-H, J-K, M-N, P-T, V-Z)
 * - 32 octets = 256 bits -> 52 caractères Base32 (260 bits avec 4 zéros de bourrage)
 * - Somme de contrôle : CRC-32 (IEEE 802.3) tronqué à 20 bits -> 4 caractères Crockford
 * - Longueur totale : 56 caractères, regroupés en 14 groupes de 4 (XXXX-XXXX-XXXX-...)
 * - Rôle du checksum : détection précoce des fautes de frappe de l'utilisateur avant le calcul lourd KDF.
 *   (Ce n'est PAS un tag d'authentification cryptographique du coffre).
 * - Préservation stricte des zéros initiaux et aller-retour garanti sans perte ni troncature.
 */

import crypto from 'crypto';

export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CROCKFORD_MAP: Record<string, number> = {};
for (let i = 0; i < CROCKFORD_ALPHABET.length; i++) {
  CROCKFORD_MAP[CROCKFORD_ALPHABET[i]] = i;
}

/**
 * Calcul de la somme de contrôle CRC-32 (IEEE 802.3, poly 0xEDB88320)
 */
export function calculateCrc32(buf: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Normalisation stricte de la chaîne saisie par l'utilisateur :
 * - Suppression des tirets et espaces
 * - Conversion en majuscules
 * - Substitutions Crockford documentées : O/o -> 0, I/i/L/l -> 1
 */
export function normalizeRecoveryKeyString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[-\s]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Encode une clé brute de 32 octets en chaîne de secours formatée (56 caractères / 14 groupes)
 */
export function encodeRecoveryKey(keyBytes: Uint8Array): string {
  if (!keyBytes || keyBytes.length !== 32) {
    throw new Error('La clé de récupération doit comporter exactement 32 octets (256 bits).');
  }

  // 1. Encodage des 32 octets (256 bits) en 52 caractères Base32 (260 bits)
  let bits = 0;
  let bitCount = 0;
  let payloadChars = '';

  for (let i = 0; i < keyBytes.length; i++) {
    bits = (bits << 8) | keyBytes[i];
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      const idx = (bits >>> bitCount) & 0x1F;
      payloadChars += CROCKFORD_ALPHABET[idx];
    }
  }

  // 4 bits restants + 1 bit de bourrage zéro -> 52e caractère
  if (bitCount > 0) {
    const idx = (bits << (5 - bitCount)) & 0x1F;
    payloadChars += CROCKFORD_ALPHABET[idx];
  }

  if (payloadChars.length !== 52) {
    throw new Error(`Erreur interne d'encodage : 52 caractères attendus, obtenu ${payloadChars.length}`);
  }

  // 2. Calcul du checksum CRC-32 tronqué à 20 bits (4 caractères Crockford)
  const fullCrc = calculateCrc32(keyBytes);
  const crc20 = (fullCrc >>> 12) & 0xFFFFF; // 20 bits de poids fort

  const c1 = (crc20 >>> 15) & 0x1F;
  const c2 = (crc20 >>> 10) & 0x1F;
  const c3 = (crc20 >>> 5) & 0x1F;
  const c4 = crc20 & 0x1F;

  const checksumChars =
    CROCKFORD_ALPHABET[c1] +
    CROCKFORD_ALPHABET[c2] +
    CROCKFORD_ALPHABET[c3] +
    CROCKFORD_ALPHABET[c4];

  const fullCode = payloadChars + checksumChars; // 56 caractères

  // 3. Regroupement visuel en 14 groupes de 4 caractères séparés par des tirets
  const groups: string[] = [];
  for (let i = 0; i < fullCode.length; i += 4) {
    groups.push(fullCode.slice(i, i + 4));
  }

  return groups.join('-');
}

/**
 * Décode et valide une clé de secours saisie par l'utilisateur :
 * - Normalise les caractères
 * - Vérifie la longueur (56 caractères)
 * - Décode les 32 octets de secret
 * - Vérifie la concordance du checksum 20 bits
 */
export function decodeRecoveryKey(formatted: string): Uint8Array {
  const norm = normalizeRecoveryKeyString(formatted);

  if (norm.length !== 56) {
    throw new Error(`Longueur de clé de secours invalide : 56 caractères attendus (obtenu ${norm.length}).`);
  }

  const payloadChars = norm.slice(0, 52);
  const checksumChars = norm.slice(52, 56);

  // 1. Décodage des 52 caractères vers 32 octets
  let bits = 0;
  let bitCount = 0;
  const raw: number[] = [];

  for (let i = 0; i < payloadChars.length; i++) {
    const c = payloadChars[i];
    const val = CROCKFORD_MAP[c];
    if (val === undefined) {
      throw new Error(`Caractère non autorisé détecté dans la clé : '${c}'`);
    }
    bits = (bits << 5) | val;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      raw.push((bits >>> bitCount) & 0xFF);
    }
  }

  if (raw.length < 32) {
    throw new Error('Décodage incomplet des octets de la clé.');
  }

  const keyBytes = new Uint8Array(raw.slice(0, 32));

  // 2. Décodage du checksum 20 bits
  let extractedChecksum = 0;
  for (let i = 0; i < 4; i++) {
    const c = checksumChars[i];
    const val = CROCKFORD_MAP[c];
    if (val === undefined) {
      throw new Error(`Caractère non autorisé dans la somme de contrôle : '${c}'`);
    }
    extractedChecksum = (extractedChecksum << 5) | val;
  }

  // 3. Vérification de cohérence du checksum
  const expectedCrc = (calculateCrc32(keyBytes) >>> 12) & 0xFFFFF;
  if (extractedChecksum !== expectedCrc) {
    throw new Error('Somme de contrôle de la clé de secours invalide : erreur de saisie détectée.');
  }

  return keyBytes;
}

/**
 * Génère une nouvelle clé de secours aléatoire de 32 octets (256 bits)
 */
export function generateRecoveryKey(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(32));
}

export const formatRecoveryKey = encodeRecoveryKey;
export const parseRecoveryKey = decodeRecoveryKey;

/**
 * Valide une chaîne de clé de secours sans lever d'exception (pour les contrôles d'interface UI)
 */
export function validateRecoveryKeyString(formatted: string): { valid: boolean; error?: string } {
  try {
    decodeRecoveryKey(formatted);
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}


