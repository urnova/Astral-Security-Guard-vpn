/**
 * Vanguard Vault — Module Cryptographique & Sérialisation
 * 
 * Point d'entrée centralisé pour les primitives cryptographiques et le stockage du coffre :
 * - Primitives libsodium (Argon2id, XChaCha20-Poly1305, KDF)
 * - Gestion des clés de récupération Crockford Base32 + Checksum CRC-32 (20 bits)
 * - Enveloppes d'en-tête découplées et versionnées (VGV1)
 * - Chiffrement en flux Secretstream par blocs de 64 Ko avec liaison contextuelle AAD
 * - Verrouillage exclusif d'instance (.lock)
 * - Journal de transactions et reprise d'intégrité (vaultJournal)
 * - Moteur de stockage transactionnel partitionné (vaultStorage)
 */

export * from './recoveryKey.ts';
export * from './cryptoPrimitives.ts';
export * from './envelopeSerializer.ts';
export * from './streamBinding.ts';
export * from './vaultLock.ts';
export * from './vaultJournal.ts';
export * from './vaultStorage.ts';
