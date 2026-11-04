/**
 * Vanguard Vault — Header & Envelope Serializer
 * 
 * Format binaire structuré et versionné pour le fichier d'en-tête (vault.header) :
 * 
 * 1. En-tête Prefix (32 octets) :
 *    - Magic (4 octets) : 0x56 0x47 0x56 0x31 ('VGV1')
 *    - Format Version (2 octets) : 0x0001 (uint16 big-endian)
 *    - Vault UUID (16 octets) : Identifiant binaire unique du coffre
 *    - Flags (1 octet) : bit 0 = Slot Mot de passe présent (1), bit 1 = Slot Récupération présent (0 ou 1)
 *    - Reserved (9 octets) : zéros de remplissage pour alignement à 32 octets
 * 
 * 2. Slot de Déverrouillage (99 octets par slot) :
 *    - Slot Type (1 octet) : 0x01 (Mot de passe) ou 0x02 (Récupération)
 *    - KDF Algorithme (1 octet) : 0x02 (Argon2id v1.3)
 *    - Opslimit (4 octets) : uint32 big-endian
 *    - Memlimit (4 octets) : uint32 big-endian
 *    - Salt (16 octets) : Sel aléatoire KDF
 *    - AEAD Algorithme (1 octet) : 0x01 (XChaCha20-Poly1305-IETF)
 *    - Nonce (24 octets) : Nonce aléatoire AEAD
 *    - Wrapped Key (48 octets) : Clé maîtresse chiffrée (32 octets) + MAC Poly1305 (16 octets)
 * 
 * Découplage de l'AAD garanti :
 * AAD = HeaderPrefix (32 octets) || SlotMetadata (27 octets de paramètres KDF/AEAD spécifiques au slot).
 * Un changement de mot de passe modifie Slot 1 sans altérer l'enveloppe ni l'AAD du Slot 2 (récupération).
 */

export const FORMAT_CONSTANTS = {
  MAGIC_BYTES: new Uint8Array([0x56, 0x47, 0x56, 0x31]), // 'VGV1'
  FORMAT_VERSION: 1,
  HEADER_PREFIX_SIZE: 32,
  SLOT_METADATA_SIZE: 27, // Type(1) + KdfAlg(1) + Ops(4) + Mem(4) + Salt(16) + AeadAlg(1)
  SLOT_SIZE: 99,          // 27 + Nonce(24) + WrappedKey(48)
  SLOT_TYPE_PASSWORD: 0x01,
  SLOT_TYPE_RECOVERY: 0x02,
  KDF_ALG_ARGON2ID: 0x02,
  AEAD_ALG_XCHACHA20_POLY1305: 0x01,
};

export interface VaultSlot {
  slotType: number; // 0x01 = Password, 0x02 = Recovery
  kdfAlg: number;
  opslimit: number;
  memlimit: number;
  salt: Uint8Array; // 16 bytes
  aeadAlg: number;
  nonce: Uint8Array; // 24 bytes
  wrappedKey: Uint8Array; // 48 bytes
}

export interface VaultHeader {
  formatVersion: number;
  vaultId: Uint8Array; // 16 bytes
  flags: number;
  passwordSlot: VaultSlot;
  recoverySlot?: VaultSlot;
}

/**
 * Construit les Données Authentifiées Associées (AAD) spécifiques à un slot (59 octets).
 * 
 * Règle de découplage et d'indépendance des enveloppes :
 * Le préfixe d'authentification du slot lie le slot au format ('VGV1'), à la version (1),
 * et au Vault UUID (16 octets) pour interdire tout transfert d'enveloppe entre coffres.
 * Les drapeaux de conteneur (flags à l'offset 22) sont STRICTEMENT neutralisés à 0x00 dans l'AAD
 * pour éviter qu'ajouter ou retirer une clé de secours n'invalide l'enveloppe du mot de passe (ou vice-versa).
 */
export function buildSlotAad(headerPrefixOrVaultId: Uint8Array, slot: VaultSlot, version: number = FORMAT_CONSTANTS.FORMAT_VERSION): Uint8Array {
  const aad = new Uint8Array(FORMAT_CONSTANTS.HEADER_PREFIX_SIZE + FORMAT_CONSTANTS.SLOT_METADATA_SIZE);
  
  if (headerPrefixOrVaultId.length === FORMAT_CONSTANTS.HEADER_PREFIX_SIZE) {
    // Si un HeaderPrefix complet de 32 octets est passé, on recopie la signature, version et Vault UUID,
    // mais on masque expressément les flags (offset 22) et réservés à 0x00 pour l'invariant AAD.
    aad.set(headerPrefixOrVaultId, 0);
    for (let i = 22; i < FORMAT_CONSTANTS.HEADER_PREFIX_SIZE; i++) {
      aad[i] = 0x00;
    }
  } else if (headerPrefixOrVaultId.length === 16) {
    // Si un Vault UUID de 16 octets est passé directement
    aad.set(FORMAT_CONSTANTS.MAGIC_BYTES, 0);
    aad[4] = (version >>> 8) & 0xFF;
    aad[5] = version & 0xFF;
    aad.set(headerPrefixOrVaultId, 6);
    // 22..31 restent initialisés à 0x00
  } else {
    throw new Error('Identifiant de coffre ou préfixe d\'en-tête invalide (attendu 16 ou 32 octets).');
  }

  // 2. Métadonnées propres au slot (27 octets)
  let offset = FORMAT_CONSTANTS.HEADER_PREFIX_SIZE;
  aad[offset++] = slot.slotType;
  aad[offset++] = slot.kdfAlg;

  // Opslimit (uint32be)
  aad[offset++] = (slot.opslimit >>> 24) & 0xFF;
  aad[offset++] = (slot.opslimit >>> 16) & 0xFF;
  aad[offset++] = (slot.opslimit >>> 8) & 0xFF;
  aad[offset++] = slot.opslimit & 0xFF;

  // Memlimit (uint32be)
  aad[offset++] = (slot.memlimit >>> 24) & 0xFF;
  aad[offset++] = (slot.memlimit >>> 16) & 0xFF;
  aad[offset++] = (slot.memlimit >>> 8) & 0xFF;
  aad[offset++] = slot.memlimit & 0xFF;

  // Sel (16 octets)
  aad.set(slot.salt, offset);
  offset += 16;

  // AEAD Alg (1 octet)
  aad[offset++] = slot.aeadAlg;

  return aad;
}

/**
 * Construit le préfixe d'en-tête de 32 octets
 */
export function buildHeaderPrefix(vaultId: Uint8Array, flags: number, version: number = FORMAT_CONSTANTS.FORMAT_VERSION): Uint8Array {
  if (vaultId.length !== 16) {
    throw new Error('Le Vault UUID doit comporter exactement 16 octets.');
  }
  const prefix = new Uint8Array(FORMAT_CONSTANTS.HEADER_PREFIX_SIZE);
  prefix.set(FORMAT_CONSTANTS.MAGIC_BYTES, 0); // 0..3
  prefix[4] = (version >>> 8) & 0xFF;          // 4
  prefix[5] = version & 0xFF;                 // 5
  prefix.set(vaultId, 6);                     // 6..21 (16 octets)
  prefix[22] = flags & 0xFF;                  // 22 (flags)
  // 23..31 : zéros réservés
  return prefix;
}

/**
 * Sérialise un slot dans un buffer binaire
 */
function serializeSlot(slot: VaultSlot): Uint8Array {
  const buf = new Uint8Array(FORMAT_CONSTANTS.SLOT_SIZE);
  let offset = 0;
  buf[offset++] = slot.slotType;
  buf[offset++] = slot.kdfAlg;

  buf[offset++] = (slot.opslimit >>> 24) & 0xFF;
  buf[offset++] = (slot.opslimit >>> 16) & 0xFF;
  buf[offset++] = (slot.opslimit >>> 8) & 0xFF;
  buf[offset++] = slot.opslimit & 0xFF;

  buf[offset++] = (slot.memlimit >>> 24) & 0xFF;
  buf[offset++] = (slot.memlimit >>> 16) & 0xFF;
  buf[offset++] = (slot.memlimit >>> 8) & 0xFF;
  buf[offset++] = slot.memlimit & 0xFF;

  buf.set(slot.salt, offset);
  offset += 16;

  buf[offset++] = slot.aeadAlg;

  buf.set(slot.nonce, offset);
  offset += 24;

  buf.set(slot.wrappedKey, offset);
  offset += 48;

  return buf;
}

/**
 * Sérialise l'en-tête complet du coffre en un flux binaire déterministe
 */
export function serializeVaultHeader(header: VaultHeader): Uint8Array {
  const hasRecovery = Boolean(header.recoverySlot);
  const flags = (header.flags & 0xFC) | 0x01 | (hasRecovery ? 0x02 : 0x00);
  const prefix = buildHeaderPrefix(header.vaultId, flags, header.formatVersion);

  const totalSize = FORMAT_CONSTANTS.HEADER_PREFIX_SIZE + FORMAT_CONSTANTS.SLOT_SIZE + (hasRecovery ? FORMAT_CONSTANTS.SLOT_SIZE : 0);
  const out = new Uint8Array(totalSize);

  out.set(prefix, 0);
  let offset = FORMAT_CONSTANTS.HEADER_PREFIX_SIZE;

  out.set(serializeSlot(header.passwordSlot), offset);
  offset += FORMAT_CONSTANTS.SLOT_SIZE;

  if (hasRecovery && header.recoverySlot) {
    out.set(serializeSlot(header.recoverySlot), offset);
  }

  return out;
}

/**
 * Désérialise et valide un flux d'en-tête binaire
 */
export function deserializeVaultHeader(raw: Uint8Array): { header: VaultHeader; prefixBytes: Uint8Array } {
  if (!raw || raw.length < FORMAT_CONSTANTS.HEADER_PREFIX_SIZE + FORMAT_CONSTANTS.SLOT_SIZE) {
    throw new Error('Fichier d\'en-tête corrompu ou incomplet (taille insuffisante).');
  }

  // 1. Vérification Magic Bytes ('VGV1')
  for (let i = 0; i < 4; i++) {
    if (raw[i] !== FORMAT_CONSTANTS.MAGIC_BYTES[i]) {
      throw new Error('Format de coffre non reconnu : signature magique invalide (attendu VGV1).');
    }
  }

  // 2. Version
  const version = (raw[4] << 8) | raw[5];
  if (version !== FORMAT_CONSTANTS.FORMAT_VERSION) {
    throw new Error(`Version de format non prise en charge : ${version} (attendu ${FORMAT_CONSTANTS.FORMAT_VERSION}).`);
  }

  // 3. Vault ID & Flags
  const vaultId = raw.slice(6, 22);
  const flags = raw[22];
  const hasPasswordSlot = Boolean(flags & 0x01);
  const hasRecoverySlot = Boolean(flags & 0x02);

  if (!hasPasswordSlot) {
    throw new Error('En-tête invalide : slot mot de passe obligatoire manquant.');
  }

  const prefixBytes = raw.slice(0, FORMAT_CONSTANTS.HEADER_PREFIX_SIZE);

  // 4. Lecture Slot 1 (Mot de passe)
  let offset = FORMAT_CONSTANTS.HEADER_PREFIX_SIZE;
  const passwordSlot = parseSlot(raw.slice(offset, offset + FORMAT_CONSTANTS.SLOT_SIZE), FORMAT_CONSTANTS.SLOT_TYPE_PASSWORD);
  offset += FORMAT_CONSTANTS.SLOT_SIZE;

  // 5. Lecture Slot 2 (Récupération si présent)
  let recoverySlot: VaultSlot | undefined;
  if (hasRecoverySlot) {
    if (raw.length < offset + FORMAT_CONSTANTS.SLOT_SIZE) {
      throw new Error('En-tête corrompu : le drapeau indique un slot de secours mais les données sont tronquées.');
    }
    recoverySlot = parseSlot(raw.slice(offset, offset + FORMAT_CONSTANTS.SLOT_SIZE), FORMAT_CONSTANTS.SLOT_TYPE_RECOVERY);
  }

  return {
    header: {
      formatVersion: version,
      vaultId,
      flags,
      passwordSlot,
      recoverySlot,
    },
    prefixBytes,
  };
}

function parseSlot(buf: Uint8Array, expectedType: number): VaultSlot {
  if (buf.length !== FORMAT_CONSTANTS.SLOT_SIZE) {
    throw new Error('Taille de slot invalide.');
  }

  let offset = 0;
  const slotType = buf[offset++];
  if (slotType !== expectedType) {
    throw new Error(`Type de slot inattendu : ${slotType} (attendu ${expectedType}).`);
  }

  const kdfAlg = buf[offset++];
  if (kdfAlg !== FORMAT_CONSTANTS.KDF_ALG_ARGON2ID) {
    throw new Error(`Algorithme KDF non pris en charge : ${kdfAlg}`);
  }

  const opslimit = ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
  offset += 4;

  const memlimit = ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
  offset += 4;

  const salt = buf.slice(offset, offset + 16);
  offset += 16;

  const aeadAlg = buf[offset++];
  if (aeadAlg !== FORMAT_CONSTANTS.AEAD_ALG_XCHACHA20_POLY1305) {
    throw new Error(`Algorithme AEAD non pris en charge : ${aeadAlg}`);
  }

  const nonce = buf.slice(offset, offset + 24);
  offset += 24;

  const wrappedKey = buf.slice(offset, offset + 48);
  offset += 48;

  return {
    slotType,
    kdfAlg,
    opslimit,
    memlimit,
    salt,
    aeadAlg,
    nonce,
    wrappedKey,
  };
}

