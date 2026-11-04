/**
 * Vanguard Vault — Journal de Transactions & Reprise Sécurisée (vaultJournal.ts)
 * 
 * Gestionnaire append-only du journal de transactions :
 * - Traitement du contenu du journal comme NON FIABLE (altérations, corruptions, injections)
 * - Règle stricte de confidentialité : ZÉRO nom de fichier original, ZÉRO chemin source,
 *   ZÉRO clé, ZÉRO hash en clair, ZÉRO contenu ou métadonnée sensible utilisateur.
 * - Validation stricte de schéma (longueur max de ligne 1024B, regex UUID, regex blobId 32 hex).
 * - Reconstruction sécurisée des chemins sur disque : interdiction des chemins relatifs bruts
 *   issus du journal (prévention stricte de Path Traversal / liens symboliques).
 * - Règle absolue de non-destruction : un blob référencé par un index valide n'est JAMAIS détruit,
 *   même si le journal prétend qu'un import a été interrompu.
 */

import fs from 'fs';
import path from 'path';

export type JournalOpType = 'IMPORT_PAYLOAD' | 'COMMIT_INDEX' | 'DELETE_PAYLOAD';

export type JournalTxState = 
  | 'STAGING_PAYLOAD'
  | 'PAYLOAD_PUBLISHED'
  | 'INDEX_STAGED'
  | 'INDEX_COMMITTED'
  | 'PAYLOAD_DELETED'
  | 'TX_ABORTED';

const VALID_OPS = new Set<JournalOpType>(['IMPORT_PAYLOAD', 'COMMIT_INDEX', 'DELETE_PAYLOAD']);
const VALID_STATES = new Set<JournalTxState>([
  'STAGING_PAYLOAD',
  'PAYLOAD_PUBLISHED',
  'INDEX_STAGED',
  'INDEX_COMMITTED',
  'PAYLOAD_DELETED',
  'TX_ABORTED',
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOB_ID_REGEX = /^[0-9a-f]{32}$/i;
const MAX_JOURNAL_LINE_BYTES = 1024;

export interface JournalRecord {
  txId: string;
  op: JournalOpType;
  state: JournalTxState;
  blobId?: string;          // Opaque random ID (32 hex chars)
  stagingRelPath?: string;  // Chemin relatif dans le coffre, ex: "staging/tmp-xxx.tmp"
  targetRelPath?: string;   // Chemin relatif dans le coffre, ex: "blobs/3a/3a8f...enc"
  timestamp: number;        // Epoch ms
}

/**
 * Valide un enregistrement de journal avant prise en compte
 */
export function validateJournalRecord(rec: any): JournalRecord | null {
  if (!rec || typeof rec !== 'object') return null;
  if (!rec.txId || typeof rec.txId !== 'string' || !UUID_REGEX.test(rec.txId)) return null;
  if (!rec.op || typeof rec.op !== 'string' || !VALID_OPS.has(rec.op)) return null;
  if (!rec.state || typeof rec.state !== 'string' || !VALID_STATES.has(rec.state)) return null;
  if (rec.blobId && (typeof rec.blobId !== 'string' || !BLOB_ID_REGEX.test(rec.blobId))) return null;
  if (typeof rec.timestamp !== 'number' || !Number.isFinite(rec.timestamp)) return null;

  return {
    txId: rec.txId,
    op: rec.op,
    state: rec.state,
    blobId: rec.blobId ? rec.blobId.toLowerCase() : undefined,
    timestamp: rec.timestamp,
  };
}

/**
 * Reconstruit de façon sécurisée le chemin absolu d'un staging payload dans le coffre
 */
export function buildSafeStagingPayloadPath(vaultRoot: string, txId: string): string {
  if (!UUID_REGEX.test(txId)) {
    throw new Error(`txId invalide pour reconstruction de chemin staging : ${txId}`);
  }
  const rootResolved = path.resolve(vaultRoot);
  const stagingPath = path.resolve(rootResolved, 'staging', `${txId}.payload.tmp`);
  if (!stagingPath.startsWith(path.join(rootResolved, 'staging'))) {
    throw new Error(`Chemin staging hors confinement autorisé : ${stagingPath}`);
  }
  return stagingPath;
}

/**
 * Reconstruit de façon sécurisée le chemin absolu d'un blob chiffré dans le coffre
 */
export function buildSafeBlobPath(vaultRoot: string, blobId: string): string {
  if (!BLOB_ID_REGEX.test(blobId)) {
    throw new Error(`blobId invalide pour reconstruction de chemin blob : ${blobId}`);
  }
  const cleanId = blobId.toLowerCase();
  const rootResolved = path.resolve(vaultRoot);
  const blobPath = path.resolve(rootResolved, 'blobs', cleanId.slice(0, 2), `${cleanId}.enc`);
  if (!blobPath.startsWith(path.join(rootResolved, 'blobs'))) {
    throw new Error(`Chemin blob hors confinement autorisé : ${blobPath}`);
  }
  return blobPath;
}

/**
 * Ajoute un enregistrement d'état dans le journal de transaction avec synchronisation physique
 */
export async function appendJournalRecord(
  vaultRoot: string,
  record: JournalRecord
): Promise<void> {
  const journalPath = path.join(vaultRoot, 'journal.log');
  const line = JSON.stringify(record) + '\n';
  const handle = await fs.promises.open(journalPath, 'a', 0o600);
  try {
    await handle.write(Buffer.from(line, 'utf8'));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Lit et assainit l'historique des transactions du journal (tolérance aux lignes tronquées / altérées)
 */
export async function readJournalRecords(vaultRoot: string): Promise<JournalRecord[]> {
  const journalPath = path.join(vaultRoot, 'journal.log');
  if (!fs.existsSync(journalPath)) {
    return [];
  }

  const raw = await fs.promises.readFile(journalPath, 'utf8');
  const lines = raw.split('\n');
  const records: JournalRecord[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (Buffer.byteLength(line, 'utf8') > MAX_JOURNAL_LINE_BYTES) {
      // Ligne anormalement longue -> ignorer par sécurité
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      const validated = validateJournalRecord(parsed);
      if (validated) {
        records.push(validated);
      }
    } catch {
      // Ligne JSON tronquée suite à une coupure brutale : on ignore la ligne corrompue
      continue;
    }
  }

  return records;
}

/**
 * Actions de reprise déduites après réconciliation avec les blobs actuellement indexés
 */
export interface SafeRecoveryPlan {
  stagingFilesToPurge: string[]; // Chemins sûrs de staging à supprimer
  orphanedBlobsToPurge: string[]; // Chemins sûrs de blobs orphelins non indexés à supprimer
  unreconciledErrors: string[];  // Ambiguïtés ou incohérences détectées
}

/**
 * Analyse le journal en confrontant ses mentions à la liste réelle des blobs indexés dans index.enc
 */
export function planSafeRecovery(
  vaultRoot: string,
  records: JournalRecord[],
  validBlobIds: Set<string>
): SafeRecoveryPlan {
  interface TxSummary {
    txId: string;
    op: JournalOpType;
    blobId?: string;
    hasIndexCommitted: boolean;
    hasPayloadPublished: boolean;
    hasPayloadDeleted: boolean;
    lastState: JournalTxState;
  }

  const txMap = new Map<string, TxSummary>();
  for (const r of records) {
    let summary = txMap.get(r.txId);
    if (!summary) {
      summary = {
        txId: r.txId,
        op: r.op,
        blobId: r.blobId,
        hasIndexCommitted: false,
        hasPayloadPublished: false,
        hasPayloadDeleted: false,
        lastState: r.state,
      };
      txMap.set(r.txId, summary);
    } else {
      if (!summary.blobId && r.blobId) {
        summary.blobId = r.blobId;
      }
      if (summary.op === 'COMMIT_INDEX' && r.op !== 'COMMIT_INDEX') {
        summary.op = r.op;
      }
      summary.lastState = r.state;
    }

    if (r.state === 'INDEX_COMMITTED') summary.hasIndexCommitted = true;
    if (r.state === 'PAYLOAD_PUBLISHED') summary.hasPayloadPublished = true;
    if (r.state === 'PAYLOAD_DELETED') summary.hasPayloadDeleted = true;
  }

  const stagingFilesToPurge: string[] = [];
  const orphanedBlobsToPurge: string[] = [];
  const unreconciledErrors: string[] = [];

  for (const [, tx] of txMap) {
    const stagingPath = buildSafeStagingPayloadPath(vaultRoot, tx.txId);

    if (tx.op === 'IMPORT_PAYLOAD') {
      const blobId = tx.blobId;

      if (blobId && validBlobIds.has(blobId)) {
        // CAS CRITIQUE : Le journal prétend que l'import est en cours (STAGING ou PUBLISHED),
        // MAIS l'index valide contient déjà le blob !
        // -> L'index a été atomiquement commis avant la coupure. Le blob est LÉGITIME et NE DOIT PAS ÊTRE SUPPRIMÉ.
        // On purge uniquement l'éventuel fichier temporaire de staging.
        if (fs.existsSync(stagingPath)) {
          stagingFilesToPurge.push(stagingPath);
        }
      } else {
        // Le blob n'est PAS dans l'index valide
        if (tx.hasIndexCommitted) {
          // Incohérence anormale : le journal dit index commis mais l'index ne contient pas le blob
          unreconciledErrors.push(`Transaction ${tx.txId} marquée commise mais blob ${blobId} absent de l'index.`);
        } else {
          // L'index n'a pas été commis : c'est un import abandonné.
          if (fs.existsSync(stagingPath)) {
            stagingFilesToPurge.push(stagingPath);
          }
          if (blobId) {
            const blobPath = buildSafeBlobPath(vaultRoot, blobId);
            if (fs.existsSync(blobPath)) {
              orphanedBlobsToPurge.push(blobPath);
            }
          }
        }
      }
    } else if (tx.op === 'DELETE_PAYLOAD') {
      const blobId = tx.blobId;
      if (blobId) {
        const blobPath = buildSafeBlobPath(vaultRoot, blobId);
        if (validBlobIds.has(blobId)) {
          // L'index valide référence encore le blob ! La suppression n'a pas été commise dans l'index.
          // RÈGLE ABSOLUE : interdiction de supprimer le blob !
        } else {
          // L'index valide ne référence plus le blob. Si le blob subsiste encore sur disque, on termine la suppression.
          if (fs.existsSync(blobPath)) {
            orphanedBlobsToPurge.push(blobPath);
          }
        }
      }
    }
  }

  return {
    stagingFilesToPurge,
    orphanedBlobsToPurge,
    unreconciledErrors,
  };
}

/**
 * Réinitialise le journal après clôture propre de toutes les transactions
 */
export async function compactJournal(vaultRoot: string): Promise<void> {
  const journalPath = path.join(vaultRoot, 'journal.log');
  const tempPath = path.join(vaultRoot, `journal.log.tmp.${Date.now()}`);
  
  const handle = await fs.promises.open(tempPath, 'w', 0o600);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(tempPath, journalPath);
}
