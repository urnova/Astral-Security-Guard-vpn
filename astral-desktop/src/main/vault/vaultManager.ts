/**
 * Vanguard Vault — Gestionnaire de Coffre Processus Principal (vaultManager.ts)
 * 
 * Orchestrateur s'exécutant dans le processus Electron Main :
 * - Pilote le Worker Thread cryptographique dédié.
 * - Files d'attente d'opérations et file unique pour éviter toute collision transactionnelle.
 * - Minuteur d'auto-verrouillage sur inactivité configurable.
 * - Verrouillage automatique sur mise en veille ou verrouillage de session Windows (powerMonitor).
 * - Intégration à l'orchestrateur de fermeture propre (lifecycle.ts).
 * - Contrôle strict des chemins et dialogues de sélection natifs (zéro écriture/suppression arbitraire côté Renderer).
 */

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

import type {
  VaultWorkerRequest,
  VaultWorkerResponse,
  VaultStatusDTO,
  VaultProgressEvent,
} from './vaultProtocol.ts';

export interface VaultManagerOptions {
  workerScriptPath?: string;
  autoLockTimeoutMs?: number; // Défaut : 15 min (0 = désactivé)
  onStatusChanged?: (status: VaultStatusDTO) => void;
  onProgress?: (progress: VaultProgressEvent) => void;
}

export class VaultManager {
  private worker: Worker | null = null;
  private workerScriptPath: string;
  private pendingRequests = new Map<string, {
    resolve: (data: any) => void;
    reject: (err: any) => void;
    onProgress?: (p: VaultProgressEvent) => void;
  }>();

  private cachedStatus: VaultStatusDTO = {
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

  private autoLockTimeoutMs: number;
  private autoLockTimer: NodeJS.Timeout | null = null;
  private onStatusChanged?: (status: VaultStatusDTO) => void;
  private onProgressCallback?: (progress: VaultProgressEvent) => void;
  private operationQueue: Promise<any> = Promise.resolve();
  private isShuttingDown = false;

  constructor(options?: VaultManagerOptions) {
    this.workerScriptPath = options?.workerScriptPath || this.resolveWorkerScriptPath();
    this.autoLockTimeoutMs = options?.autoLockTimeoutMs ?? 15 * 60 * 1000;
    this.onStatusChanged = options?.onStatusChanged;
    this.onProgressCallback = options?.onProgress;

    this.initWorker();
    this.setupPowerMonitor();
  }

  /**
   * Résout l'emplacement du script Worker selon l'environnement (Vite dev, prod, ou test Node)
   */
  private resolveWorkerScriptPath(): string {
    // 1. Si fichier compilé dans dist-electron/main/vaultWorker.js
    const compiledPath = path.join(__dirname, 'vaultWorker.js');
    if (fs.existsSync(compiledPath)) {
      return compiledPath;
    }

    // 2. Si source TypeScript directe (Node 24 strip types ou test script)
    const tsPath = path.join(__dirname, 'vaultWorker.ts');
    if (fs.existsSync(tsPath)) {
      return tsPath;
    }

    // 3. Fallback relatif standard (selon que cwd est la racine du projet ou astral-desktop)
    const directRel = path.resolve('src/main/vault/vaultWorker.ts');
    if (fs.existsSync(directRel)) {
      return directRel;
    }
    return path.resolve('astral-desktop/src/main/vault/vaultWorker.ts');
  }

  /**
   * Initialise ou réinitialise le Worker Thread
   */
  private initWorker(): void {
    if (this.worker) {
      try { this.worker.terminate(); } catch {}
      this.worker = null;
    }

    this.worker = new Worker(this.workerScriptPath);

    this.worker.on('message', (response: VaultWorkerResponse) => {
      this.handleWorkerMessage(response);
    });

    this.worker.on('error', (err: any) => {
      console.error('[VaultManager] Erreur critique dans le Worker :', err);
      this.handleWorkerFailure(err instanceof Error ? err : new Error(String(err)));
    });

    this.worker.on('exit', (code) => {
      if (code !== 0 && !this.isShuttingDown) {
        console.warn(`[VaultManager] Worker terminé inopinément avec code ${code}`);
        this.handleWorkerFailure(new Error(`Worker terminé avec code ${code}`));
      }
    });
  }

  /**
   * Traitement des messages renvoyés par le Worker
   */
  private handleWorkerMessage(response: VaultWorkerResponse): void {
    const pending = this.pendingRequests.get(response.reqId);

    if (response.type === 'PROGRESS') {
      if (response.progress) {
        if (pending?.onProgress) {
          pending.onProgress(response.progress);
        }
        if (this.onProgressCallback) {
          this.onProgressCallback(response.progress);
        }
      }
      return;
    }

    if (!pending) return;
    this.pendingRequests.delete(response.reqId);

    if (response.type === 'SUCCESS') {
      if (response.data && typeof response.data === 'object') {
        if ('isOpen' in response.data) {
          this.updateStatus(response.data as VaultStatusDTO);
        } else if (response.data.status && typeof response.data.status === 'object' && 'isOpen' in response.data.status) {
          this.updateStatus(response.data.status as VaultStatusDTO);
        }
      }
      pending.resolve(response.data);
    } else {
      const err = new Error(response.error?.message || 'Erreur inconnue dans le Worker');
      (err as any).code = response.error?.code;
      (err as any).details = response.error?.details;
      pending.reject(err);
    }
  }

  /**
   * Gestion d'un crash du worker
   */
  private handleWorkerFailure(err: Error): void {
    // Rejeter toutes les requêtes en vol
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(`Interruption du Worker Vault : ${err.message}`));
    }
    this.pendingRequests.clear();

    // Mettre l'état à fermé
    this.updateStatus({
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
    });

    // Relancer un nouveau worker pour les demandes futures
    if (!this.isShuttingDown) {
      this.initWorker();
    }
  }

  /**
   * Envoi d'une requête au worker avec promesse
   */
  private sendRequest<T = any>(
    type: VaultWorkerRequest['type'],
    payload: Record<string, any> = {},
    onProgress?: (p: VaultProgressEvent) => void
  ): Promise<T> {
    if (!this.worker) {
      this.initWorker();
    }

    const reqId = crypto.randomUUID();
    const req: VaultWorkerRequest = {
      reqId,
      type,
      ...payload,
    } as VaultWorkerRequest;

    this.resetInactivityTimer();

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject, onProgress });
      this.worker!.postMessage(req);
    });
  }

  /**
   * Exécute une opération sérialisée dans la file d'attente
   */
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(op, op);
    this.operationQueue = next.catch(() => {});
    return next;
  }

  /**
   * Met à jour le cache d'état et notifie les observateurs
   */
  private updateStatus(newStatus: VaultStatusDTO): void {
    this.cachedStatus = newStatus;
    if (this.onStatusChanged) {
      this.onStatusChanged(newStatus);
    }
  }

  /**
   * Réinitialise le minuteur d'inactivité
   */
  public resetInactivityTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    if (this.autoLockTimeoutMs > 0 && this.cachedStatus.isOpen) {
      this.autoLockTimer = setTimeout(() => {
        this.lockVault().catch(() => {});
      }, this.autoLockTimeoutMs);
    }
  }

  /**
   * Configuration de la surveillance de mise en veille OS (powerMonitor)
   */
  private async setupPowerMonitor(): Promise<void> {
    try {
      const electron = await import('electron');
      const pm = electron.powerMonitor;
      if (pm) {
        pm.on('suspend', () => {
          if (this.cachedStatus.isOpen) {
            this.lockVault().catch(() => {});
          }
        });
        pm.on('lock-screen', () => {
          if (this.cachedStatus.isOpen) {
            this.lockVault().catch(() => {});
          }
        });
      }
    } catch {}
  }

  // ==========================================
  // API PUBLIQUE (Invoquée par IPC ou scripts)
  // ==========================================

  public getStatus(): VaultStatusDTO {
    return this.cachedStatus;
  }

  public setAutoLockDelay(timeoutMinutes: number): void {
    this.autoLockTimeoutMs = Math.max(0, timeoutMinutes * 60 * 1000);
    this.resetInactivityTimer();
  }

  /**
   * Pour tests de résilience uniquement : termine brutalement le worker thread.
   */
  public async terminateWorkerForTesting(): Promise<number> {
    if (this.worker) {
      return this.worker.terminate();
    }
    return 0;
  }

  public async createVault(
    vaultRoot: string,
    password: string,
    options?: { recoveryKeyRaw?: Uint8Array }
  ): Promise<{ vaultId: string; recoveryKeyFormatted?: string }> {
    if (!vaultRoot || typeof vaultRoot !== 'string' || vaultRoot.trim() === '') {
      throw new Error('Chemin de coffre invalide.');
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Le mot de passe doit comporter au moins 8 caractères.');
    }
    return this.enqueue(async () => {
      const res = await this.sendRequest<{ vaultId: string; recoveryKeyFormatted?: string }>(
        'CREATE_VAULT',
        {
          vaultRoot,
          password,
          recoveryKeyRaw: options?.recoveryKeyRaw,
        }
      );
      return res;
    });
  }

  public async openVault(
    vaultRoot: string,
    credentials: { password?: string; recoveryKeyString?: string },
    options?: { forceBreakStaleLock?: boolean }
  ): Promise<VaultStatusDTO> {
    if (!vaultRoot || typeof vaultRoot !== 'string' || vaultRoot.trim() === '') {
      throw new Error('Chemin de coffre invalide.');
    }
    return this.enqueue(async () => {
      const status = await this.sendRequest<VaultStatusDTO>(
        'OPEN_VAULT',
        {
          vaultRoot,
          password: credentials.password,
          recoveryKeyString: credentials.recoveryKeyString,
          forceBreakStaleLock: options?.forceBreakStaleLock,
        }
      );
      this.resetInactivityTimer();
      return status;
    });
  }

  public async lockVault(): Promise<VaultStatusDTO> {
    return this.enqueue(async () => {
      if (!this.cachedStatus.isOpen) {
        return this.cachedStatus;
      }
      const res = await this.sendRequest<VaultStatusDTO>('CLOSE_VAULT');
      if (this.autoLockTimer) {
        clearTimeout(this.autoLockTimer);
        this.autoLockTimer = null;
      }
      return res;
    });
  }

  public async closeVault(): Promise<VaultStatusDTO> {
    return this.lockVault();
  }

  public async importFile(
    sourcePath: string,
    virtualPath?: string,
    onProgress?: (p: VaultProgressEvent) => void
  ): Promise<{ entry: any; status: VaultStatusDTO }> {
    return this.enqueue(async () => {
      const targetVirtualPath = virtualPath || path.basename(sourcePath);
      const res = await this.sendRequest<{ entry: any; status: VaultStatusDTO }>(
        'IMPORT_FILE',
        {
          sourcePath,
          virtualPath: targetVirtualPath,
        },
        onProgress
      );
      this.resetInactivityTimer();
      return res;
    });
  }

  public async extractFile(
    virtualPath: string,
    destDiskPath: string,
    options?: { overwrite?: boolean },
    onProgress?: (p: VaultProgressEvent) => void
  ): Promise<{ bytesExtracted: number; sha256Verified: boolean }> {
    return this.enqueue(async () => {
      const res = await this.sendRequest<{ bytesExtracted: number; sha256Verified: boolean }>(
        'EXTRACT_FILE',
        {
          virtualPath,
          destDiskPath,
          overwrite: options?.overwrite,
        },
        onProgress
      );
      this.resetInactivityTimer();
      return res;
    });
  }

  public async deleteFile(virtualPath: string): Promise<VaultStatusDTO> {
    return this.enqueue(async () => {
      const status = await this.sendRequest<VaultStatusDTO>(
        'DELETE_FILE',
        { virtualPath }
      );
      this.resetInactivityTimer();
      return status;
    });
  }

  public async changePassword(newPassword: string): Promise<{ success: boolean }> {
    return this.enqueue(async () => {
      const res = await this.sendRequest<{ success: boolean }>(
        'CHANGE_PASSWORD',
        { newPassword }
      );
      this.resetInactivityTimer();
      return res;
    });
  }

  public async configureRecovery(
    action: 'add' | 'remove',
    options?: { recoveryKeyRaw?: Uint8Array }
  ): Promise<{ recoveryKeyFormatted?: string; status: VaultStatusDTO }> {
    return this.enqueue(async () => {
      const res = await this.sendRequest<{ recoveryKeyFormatted?: string; status: VaultStatusDTO }>(
        'CONFIGURE_RECOVERY',
        {
          action,
          recoveryKeyRaw: options?.recoveryKeyRaw,
        }
      );
      this.resetInactivityTimer();
      return res;
    });
  }

  public async exportVault(
    destPath: string,
    mode: 'backup_encrypted' | 'extract_all_plaintext' | 'archive_portable_vgv',
    options?: { overwrite?: boolean },
    onProgress?: (p: VaultProgressEvent) => void
  ): Promise<{ mode: string; filesExported: number; totalBytes: number; archivePath?: string }> {
    return this.enqueue(async () => {
      const res = await this.sendRequest<{ mode: string; filesExported: number; totalBytes: number; archivePath?: string }>(
        'EXPORT_VAULT',
        {
          destPath,
          mode,
          overwrite: options?.overwrite,
        },
        onProgress
      );
      this.resetInactivityTimer();
      return res;
    });
  }

  public async importVaultArchive(
    archivePath: string,
    targetVaultDir: string,
    onProgress?: (p: VaultProgressEvent) => void
  ): Promise<{ targetVaultDir: string; filesExtracted: number; totalBytes: number; headerValid: boolean }> {
    return this.enqueue(async () => {
      const res = await this.sendRequest<{ targetVaultDir: string; filesExtracted: number; totalBytes: number; headerValid: boolean }>(
        'IMPORT_VAULT_ARCHIVE',
        {
          archivePath,
          targetVaultDir,
        },
        onProgress
      );
      return res;
    });
  }

  public async cancelCurrentOperation(): Promise<void> {
    await this.sendRequest('CANCEL_CURRENT', {});
  }

  /**
   * Arrêt ordonné du gestionnaire de coffre lors de la fermeture de Vanguard
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    if (this.worker) {
      try {
        // Demander l'annulation d'une éventuelle opération en cours
        await Promise.race([
          this.cancelCurrentOperation(),
          new Promise(r => setTimeout(r, 500)),
        ]).catch(() => {});

        // Fermer la session proprement
        if (this.cachedStatus.isOpen) {
          await Promise.race([
            this.sendRequest('CLOSE_VAULT', {}),
            new Promise(r => setTimeout(r, 1500)),
          ]).catch(() => {});
        }
      } finally {
        await this.worker.terminate().catch(() => {});
        this.worker = null;
      }
    }
  }
}
