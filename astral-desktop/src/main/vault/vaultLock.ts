/**
 * Vanguard Vault — Verrouillage Exclusif d'Instance (.lock)
 * 
 * Gestionnaire de verrou de session garantissant l'accès exclusif au coffre :
 * - Création exclusive atomique via O_CREAT | O_EXCL | O_RDWR
 * - Maintien du descripteur ouvert (file handle) pendant toute la durée de la session
 * - Métadonnées enrichies : vaultId, PID, instanceId (UUID), horodatage ISO, hostname, username
 * - Règle anti-suppression aveugle : aucun déverrouillage automatique si l'état d'abandon ne peut être prouvé avec certitude
 * - Portée limitée aux systèmes de fichiers locaux (NTFS, ReFS, APFS, ext4).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface LockMetadata {
  vaultId: string;
  pid: number;
  instanceId: string;
  acquiredAt: string;
  hostname: string;
  user: string;
}

export class VaultLockedError extends Error {
  public lockInfo?: LockMetadata;
  public reasonCode: 'ACTIVE_PROCESS' | 'FOREIGN_HOST' | 'HANDLE_BUSY' | 'STALE_UNVERIFIED';

  constructor(message: string, reasonCode: 'ACTIVE_PROCESS' | 'FOREIGN_HOST' | 'HANDLE_BUSY' | 'STALE_UNVERIFIED', lockInfo?: LockMetadata) {
    super(message);
    this.name = 'VaultLockedError';
    this.reasonCode = reasonCode;
    this.lockInfo = lockInfo;
  }
}

export interface VaultLockHandle {
  lockPath: string;
  metadata: LockMetadata;
  release: () => Promise<void>;
}

/**
 * Tente d'acquérir le verrou exclusif sur un coffre local
 */
export async function acquireVaultLock(
  vaultRoot: string,
  vaultId: string,
  instanceId: string,
  options?: { forceBreakStaleLock?: boolean }
): Promise<VaultLockHandle> {
  const lockPath = path.join(vaultRoot, '.lock');

  const metadata: LockMetadata = {
    vaultId,
    pid: process.pid,
    instanceId,
    acquiredAt: new Date().toISOString(),
    hostname: os.hostname(),
    user: os.userInfo().username || 'unknown',
  };

  let fileHandle: fs.promises.FileHandle | null = null;

  try {
    // 1. Tentative d'ouverture exclusive
    fileHandle = await fs.promises.open(
      lockPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR,
      0o600
    );

    // Écriture des métadonnées
    const data = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
    await fileHandle.write(data);
    await fileHandle.sync();

    let released = false;

    return {
      lockPath,
      metadata,
      release: async () => {
        if (released) return;
        released = true;
        if (fileHandle) {
          try {
            await fileHandle.close();
          } catch {}
          fileHandle = null;
        }
        try {
          // Vérification que le verrou sur disque correspond toujours à cette instance
          if (fs.existsSync(lockPath)) {
            const curRaw = await fs.promises.readFile(lockPath, 'utf8');
            const curMeta = JSON.parse(curRaw);
            if (curMeta && curMeta.instanceId === metadata.instanceId) {
              await fs.promises.unlink(lockPath);
            }
          }
        } catch {}
      },
    };
  } catch (err: any) {
    if (fileHandle) {
      try { await fileHandle.close(); } catch {}
    }

    if (err.code !== 'EEXIST') {
      throw err;
    }

    // 2. Le verrou existe déjà : diagnostic de l'état
    let existingMeta: LockMetadata | undefined;
    try {
      const raw = await fs.promises.readFile(lockPath, 'utf8');
      existingMeta = JSON.parse(raw);
    } catch (readErr: any) {
      if (readErr.code === 'EBUSY' || readErr.code === 'EPERM') {
        throw new VaultLockedError(
          'Coffre verrouillé : le fichier de verrou est activement détenu par un autre processus.',
          'HANDLE_BUSY'
        );
      }
    }

    if (!existingMeta) {
      throw new VaultLockedError(
        'Coffre verrouillé : un fichier .lock existe mais son contenu est inaccessible ou corrompu.',
        'STALE_UNVERIFIED'
      );
    }

    // Contrôle d'hôte
    if (existingMeta.hostname && existingMeta.hostname !== os.hostname()) {
      throw new VaultLockedError(
        `Coffre verrouillé par un hôte distant (${existingMeta.hostname}). Suppression automatique interdite.`,
        'FOREIGN_HOST',
        existingMeta
      );
    }

    // Contrôle du processus local
    let isPidAlive = false;
    try {
      process.kill(existingMeta.pid, 0);
      isPidAlive = true;
    } catch (killErr: any) {
      if (killErr.code === 'ESRCH') {
        isPidAlive = false; // Le processus n'existe plus
      } else {
        isPidAlive = true;  // EPERM : le processus existe sous un autre compte
      }
    }

    const isSelfPid = existingMeta.pid === process.pid;

    if (isPidAlive && !isSelfPid) {
      // Un AUTRE processus actif détient ce coffre : interdiction absolue de forcer le verrou
      throw new VaultLockedError(
        `Coffre actuellement ouvert par le processus local PID ${existingMeta.pid} (Instance ${existingMeta.instanceId}, acquis le ${existingMeta.acquiredAt}).`,
        'ACTIVE_PROCESS',
        existingMeta
      );
    }

    // Ici : soit le PID est inactif (processus tiers éteint),
    // soit le PID est notre propre processus hôte (thread worker précédent crashé).
    if (!options?.forceBreakStaleLock) {
      if (isPidAlive && isSelfPid) {
        throw new VaultLockedError(
          `Coffre actuellement verrouillé par une session précédente de ce processus (PID ${existingMeta.pid}, Instance ${existingMeta.instanceId}). Décision explicite requise.`,
          'ACTIVE_PROCESS',
          existingMeta
        );
      }

      // Le PID est éteint, mais sous Windows un PID peut avoir été recyclé.
      // Règle stricte : on ne supprime PAS automatiquement sans décision explicite (forceBreakStaleLock)
      throw new VaultLockedError(
        `Verrou abandonné détecté (PID ${existingMeta.pid} inactif). Pour éviter tout risque de concurrence, suppression automatique refusée par défaut. Utilisez l'option explicite de reprise après confirmation.`,
        'STALE_UNVERIFIED',
        existingMeta
      );
    }

    // Suppression explicite demandée (forceBreakStaleLock = true) sur un verrou orphelin ou résiduel
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.promises.unlink(lockPath);
        break;
      } catch (unlinkErr: any) {
        if (attempt < 4) {
          await new Promise(r => setTimeout(r, 60));
        } else {
          throw new VaultLockedError(
            `Impossible de libérer le verrou : ${unlinkErr.message}`,
            'HANDLE_BUSY',
            existingMeta
          );
        }
      }
    }

    // Ré-acquisition
    return acquireVaultLock(vaultRoot, vaultId, instanceId, { forceBreakStaleLock: false });
  }
}

