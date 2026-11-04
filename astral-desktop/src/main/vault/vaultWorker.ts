/**
 * Vanguard Vault — Worker Cryptographique & Gestionnaire de Session
 * 
 * Exécuté dans un Worker Thread Node.js dédié :
 * - Propriétaire exclusif de la session cryptographique active (VaultSession).
 * - Maintient les clés en mémoire vive hors de portée du thread Renderer et du Main.
 * - Traite les commandes asynchrones via messages typés et bornés.
 * - Gère l'annulation d'opérations longues (AbortController) et l'émission de progression.
 * - Efface les clés et libère le verrou exclusif à la fermeture ou sur incident.
 */

import { parentPort } from 'node:worker_threads';
import {
  initSodium,
  createVault,
  openVault,
  closeVault,
  importFile,
  extractFile,
  deleteFile,
  changePassword,
  configureRecovery,
  exportVaultStorage,
  importVaultArchive,
  type VaultSession,
} from './index.ts';

import type {
  VaultWorkerRequest,
  VaultWorkerResponse,
  VaultStatusDTO,
} from './vaultProtocol.ts';

if (!parentPort) {
  throw new Error('Ce script doit être exécuté dans un Worker Thread Node.js.');
}

const port = parentPort;

let currentSession: VaultSession | null = null;
let currentAbortController: AbortController | null = null;
let currentOpName: string | undefined = undefined;

/**
 * Construit un DTO d'état sans aucune fuite de clé
 */
function buildStatusDTO(session: VaultSession | null, isBusy = false, currentOperation?: string): VaultStatusDTO {
  if (!session || !session.isOpen) {
    return {
      isOpen: false,
      vaultRoot: null,
      vaultId: null,
      hasRecoverySlot: false,
      recoveryStatus: 'CLOSED',
      unreconciledBlobs: [],
      filesCount: 0,
      totalSizeBytes: 0,
      files: [],
      isBusy: false,
    };
  }

  const files = session.index.files.map(f => ({
    id: f.id,
    virtualPath: f.virtualPath,
    size: f.size,
    sha256: f.sha256,
    createdAt: f.createdAt,
    modifiedAt: f.modifiedAt,
  }));

  const totalSizeBytes = files.reduce((acc, f) => acc + f.size, 0);

  return {
    isOpen: true,
    vaultRoot: session.vaultRoot,
    vaultId: session.vaultId,
    hasRecoverySlot: Boolean(session.header.recoverySlot),
    recoveryStatus: session.indexRecoveryStatus,
    unreconciledBlobs: session.unreconciledBlobs || [],
    filesCount: files.length,
    totalSizeBytes,
    files,
    isBusy,
    currentOperation,
  };
}

/**
 * Envoie une réponse structurée au processus parent
 */
function sendResponse(response: VaultWorkerResponse): void {
  port.postMessage(response);
}

/**
 * Dispatcher principal des requêtes entrantes
 */
async function handleRequest(req: VaultWorkerRequest): Promise<void> {
  const reqId = req.reqId;

  try {
    switch (req.type) {
      case 'PING': {
        sendResponse({ reqId, type: 'SUCCESS', data: { pong: true } });
        break;
      }

      case 'CREATE_VAULT': {
        await initSodium();
        const res = await createVault(req.vaultRoot, req.password, {
          recoveryKey: req.recoveryKeyRaw,
        });
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: {
            vaultId: res.vaultId,
            recoveryKeyFormatted: res.recoveryKeyFormatted,
          },
        });
        break;
      }

      case 'OPEN_VAULT': {
        await initSodium();
        if (currentSession && currentSession.isOpen) {
          await closeVault(currentSession);
          currentSession = null;
        }

        const session = await openVault(
          req.vaultRoot,
          {
            password: req.password,
            recoveryKeyString: req.recoveryKeyString,
          },
          {
            forceBreakStaleLock: req.forceBreakStaleLock,
          }
        );

        currentSession = session;
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: buildStatusDTO(currentSession),
        });
        break;
      }

      case 'GET_STATUS': {
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: buildStatusDTO(currentSession, Boolean(currentAbortController), currentOpName),
        });
        break;
      }

      case 'IMPORT_FILE': {
        if (!currentSession || !currentSession.isOpen) {
          throw new Error('Aucun coffre ouvert pour effectuer l\'import.');
        }

        currentOpName = `Import de ${req.virtualPath}`;
        currentAbortController = new AbortController();

        try {
          const entry = await importFile(
            currentSession,
            req.sourcePath,
            req.virtualPath,
            {
              abortSignal: currentAbortController.signal,
              onProgress: (processed, total) => {
                const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100;
                sendResponse({
                  reqId,
                  type: 'PROGRESS',
                  progress: {
                    reqId,
                    stage: 'ENCRYPTING',
                    bytesProcessed: processed,
                    totalBytes: total,
                    percent,
                  },
                });
              },
            }
          );

          sendResponse({
            reqId,
            type: 'SUCCESS',
            data: {
              entry,
              status: buildStatusDTO(currentSession),
            },
          });
        } finally {
          currentAbortController = null;
          currentOpName = undefined;
        }
        break;
      }

      case 'EXTRACT_FILE': {
        if (!currentSession || !currentSession.isOpen) {
          throw new Error('Aucun coffre ouvert pour effectuer l\'extraction.');
        }

        currentOpName = `Extraction de ${req.virtualPath}`;
        currentAbortController = new AbortController();

        try {
          const result = await extractFile(
            currentSession,
            req.virtualPath,
            req.destDiskPath,
            {
              overwrite: req.overwrite,
              abortSignal: currentAbortController.signal,
              onProgress: (processed, total) => {
                const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100;
                sendResponse({
                  reqId,
                  type: 'PROGRESS',
                  progress: {
                    reqId,
                    stage: 'DECRYPTING',
                    bytesProcessed: processed,
                    totalBytes: total,
                    percent,
                  },
                });
              },
            }
          );

          sendResponse({
            reqId,
            type: 'SUCCESS',
            data: result,
          });
        } finally {
          currentAbortController = null;
          currentOpName = undefined;
        }
        break;
      }

      case 'DELETE_FILE': {
        if (!currentSession || !currentSession.isOpen) {
          throw new Error('Aucun coffre ouvert pour effectuer la suppression.');
        }

        await deleteFile(currentSession, req.virtualPath);
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: buildStatusDTO(currentSession),
        });
        break;
      }

      case 'CHANGE_PASSWORD': {
        if (!currentSession || !currentSession.isOpen) {
          throw new Error('Aucun coffre ouvert pour changer le mot de passe.');
        }

        await changePassword(currentSession, req.newPassword);
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: { success: true },
        });
        break;
      }

      case 'CONFIGURE_RECOVERY': {
        if (!currentSession || !currentSession.isOpen) {
          throw new Error('Aucun coffre ouvert pour modifier la clé de secours.');
        }

        const res = await configureRecovery(currentSession, req.action, {
          recoveryKeyRaw: req.recoveryKeyRaw,
        });

        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: {
            action: req.action,
            recoveryKeyFormatted: res.recoveryKeyFormatted,
            status: buildStatusDTO(currentSession),
          },
        });
        break;
      }

      case 'EXPORT_VAULT': {
        if (!currentSession || !currentSession.isOpen) {
          throw new Error('Aucun coffre ouvert pour effectuer l\'exportation.');
        }

        currentOpName = `Exportation du coffre (${req.mode})`;
        currentAbortController = new AbortController();

        try {
          const res = await exportVaultStorage(
            currentSession,
            req.destPath,
            req.mode,
            {
              overwrite: req.overwrite,
              abortSignal: currentAbortController.signal,
              onProgress: (processed, total) => {
                const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100;
                sendResponse({
                  reqId,
                  type: 'PROGRESS',
                  progress: {
                    reqId,
                    stage: req.mode === 'extract_all_plaintext' ? 'DECRYPTING' : 'READING',
                    bytesProcessed: processed,
                    totalBytes: total,
                    percent,
                  },
                });
              },
            }
          );

          sendResponse({
            reqId,
            type: 'SUCCESS',
            data: res,
          });
        } finally {
          currentAbortController = null;
          currentOpName = undefined;
        }
        break;
      }

      case 'IMPORT_VAULT_ARCHIVE': {
        currentOpName = 'Importation d\'archive .vgv';
        currentAbortController = new AbortController();
        try {
          const res = await importVaultArchive(
            req.archivePath,
            req.targetVaultDir,
            {
              abortSignal: currentAbortController.signal,
              onProgress: (processed, total) => {
                const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100;
                sendResponse({
                  reqId,
                  type: 'PROGRESS',
                  progress: {
                    reqId,
                    stage: 'COMMITTING',
                    bytesProcessed: processed,
                    totalBytes: total,
                    percent,
                  },
                });
              },
            }
          );
          sendResponse({
            reqId,
            type: 'SUCCESS',
            data: res,
          });
        } finally {
          currentAbortController = null;
          currentOpName = undefined;
        }
        break;
      }

      case 'CLOSE_VAULT': {
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        if (currentSession && currentSession.isOpen) {
          await closeVault(currentSession);
          currentSession = null;
        }
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: buildStatusDTO(null),
        });
        break;
      }

      case 'CANCEL_CURRENT': {
        if (currentAbortController) {
          currentAbortController.abort();
        }
        sendResponse({
          reqId,
          type: 'SUCCESS',
          data: { cancelled: true },
        });
        break;
      }

      default: {
        throw new Error(`Commande Worker inconnue : ${(req as any).type}`);
      }
    }
  } catch (err: any) {
    sendResponse({
      reqId,
      type: 'ERROR',
      error: {
        message: err?.message || 'Erreur inconnue dans le worker vault',
        code: err?.reasonCode || err?.code || 'WORKER_OPERATION_FAILED',
        details: err?.details || undefined,
      },
    });
  }
}

// Nettoyage en cas d'arrêt du worker
async function cleanupOnExit(): Promise<void> {
  if (currentSession && currentSession.isOpen) {
    try {
      await closeVault(currentSession);
    } catch {}
    currentSession = null;
  }
}

process.on('beforeExit', cleanupOnExit);
process.on('SIGINT', cleanupOnExit);
process.on('SIGTERM', cleanupOnExit);

port.on('message', (msg: VaultWorkerRequest) => {
  handleRequest(msg).catch(err => {
    sendResponse({
      reqId: msg.reqId || 'unknown',
      type: 'ERROR',
      error: {
        message: err.message,
        code: 'UNHANDLED_WORKER_ERROR',
      },
    });
  });
});

