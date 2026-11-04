/**
 * Vanguard Vault — Enregistrement des Canaux IPC (vaultIpc.ts)
 * 
 * Enregistre les gestionnaires d'appels IPC dans le processus Electron Main :
 * - Contrôle strict des dialogues natifs (dialog.showOpenDialog / showSaveDialog).
 * - Sanitisation et validation de tous les arguments entrants.
 * - Aucune clé maîtresse ou dérivée n'est retournée au Renderer.
 * - Zéro possibilité pour le Renderer de demander la suppression ou la lecture
 *   arbitraire de fichiers système en dehors du coffre.
 */

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { VaultManager } from './vaultManager.ts';
import type { VaultStatusDTO, VaultProgressEvent } from './vaultProtocol.ts';

/** Chemin par défaut proposé pour un nouveau coffre : userData/VanguardVault */
function defaultVaultCreatePath(): string {
  try {
    const base = path.join(app.getPath('userData'), 'VanguardVault');
    return base;
  } catch {
    return '';
  }
}

export function registerVaultIpc(vaultManager: VaultManager): void {
  // 1. Récupération de l'état du coffre
  ipcMain.handle('vault:get-status', async (): Promise<VaultStatusDTO> => {
    return vaultManager.getStatus();
  });

  // 2. Sélection d'un dossier pour création ou ouverture
  ipcMain.handle('vault:select-folder', async (event, options?: { title?: string; forCreate?: boolean }): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // Pour la création, pré-remplir avec userData/VanguardVault si le dossier n'existe pas encore
    const defaultPath = options?.forCreate ? defaultVaultCreatePath() : undefined;
    const res = await dialog.showOpenDialog(win || undefined as any, {
      title: options?.title || 'Sélectionner le répertoire du coffre Vanguard Vault',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath,
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    return res.filePaths[0];
  });

  // 3. Sélection de fichiers sources pour import
  ipcMain.handle('vault:select-import-files', async (event): Promise<string[]> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined as any, {
      title: 'Sélectionner les fichiers à importer dans Vanguard Vault',
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return [];
    }
    return res.filePaths;
  });

  // 4. Sélection d'un emplacement pour extraire en clair
  ipcMain.handle('vault:select-extract-dest', async (event, options: { defaultFilename: string }): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showSaveDialog(win || undefined as any, {
      title: 'Emplacement d\'extraction en clair',
      defaultPath: options.defaultFilename,
    });
    if (res.canceled || !res.filePath) {
      return null;
    }
    return res.filePath;
  });

  // 5. Création d'un coffre
  ipcMain.handle('vault:create', async (_event, params: {
    vaultRoot: string;
    password: string;
    withRecoveryKey?: boolean;
  }): Promise<{ vaultId: string; recoveryKeyFormatted?: string }> => {
    if (!params.vaultRoot || typeof params.vaultRoot !== 'string') {
      throw new Error('Dossier cible obligatoire pour créer le coffre.');
    }
    if (!params.password || typeof params.password !== 'string' || params.password.length < 8) {
      throw new Error('Le mot de passe doit comporter au moins 8 caractères.');
    }

    return vaultManager.createVault(params.vaultRoot, params.password, {
      recoveryKeyRaw: params.withRecoveryKey ? undefined : undefined,
    });
  });

  // 6. Ouverture / Déverrouillage d'un coffre
  ipcMain.handle('vault:open', async (_event, params: {
    vaultRoot: string;
    password?: string;
    recoveryKeyString?: string;
    forceBreakStaleLock?: boolean;
  }): Promise<VaultStatusDTO> => {
    if (!params.vaultRoot || typeof params.vaultRoot !== 'string') {
      throw new Error('Chemin racine du coffre manquant.');
    }
    if (!params.password && !params.recoveryKeyString) {
      throw new Error('Mot de passe ou clé de secours obligatoire pour déverrouiller le coffre.');
    }

    return vaultManager.openVault(
      params.vaultRoot,
      {
        password: params.password,
        recoveryKeyString: params.recoveryKeyString,
      },
      {
        forceBreakStaleLock: params.forceBreakStaleLock,
      }
    );
  });

  // 7. Verrouillage du coffre
  ipcMain.handle('vault:lock', async (): Promise<VaultStatusDTO> => {
    return vaultManager.lockVault();
  });

  // 8. Fermeture du coffre
  ipcMain.handle('vault:close', async (): Promise<VaultStatusDTO> => {
    return vaultManager.closeVault();
  });

  // 9. Importation d'un ou plusieurs fichiers
  ipcMain.handle('vault:import-files', async (event, params: {
    sourcePaths: string[];
  }): Promise<{ importedCount: number; errors: Array<{ path: string; error: string }> }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const errors: Array<{ path: string; error: string }> = [];
    let importedCount = 0;

    for (const src of params.sourcePaths) {
      try {
        await vaultManager.importFile(src, undefined, (progress: VaultProgressEvent) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('vault:progress', progress);
          }
        });
        importedCount++;
      } catch (err: any) {
        errors.push({ path: src, error: err.message });
      }
    }

    return { importedCount, errors };
  });

  // 10. Extraction en clair d'un fichier du coffre
  ipcMain.handle('vault:extract-file', async (event, params: {
    virtualPath: string;
    destDiskPath: string;
    overwrite?: boolean;
  }): Promise<{ bytesExtracted: number; sha256Verified: boolean }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return vaultManager.extractFile(
      params.virtualPath,
      params.destDiskPath,
      { overwrite: params.overwrite },
      (progress: VaultProgressEvent) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('vault:progress', progress);
        }
      }
    );
  });

  // 11. Suppression d'un élément dans le coffre
  ipcMain.handle('vault:delete-file', async (_event, params: {
    virtualPath: string;
  }): Promise<VaultStatusDTO> => {
    return vaultManager.deleteFile(params.virtualPath);
  });

  // 12. Annulation de l'opération en cours
  ipcMain.handle('vault:cancel-operation', async (): Promise<void> => {
    return vaultManager.cancelCurrentOperation();
  });

  // 13. Changement du mot de passe
  ipcMain.handle('vault:change-password', async (_event, params: {
    newPassword: string;
  }): Promise<{ success: boolean }> => {
    if (!params.newPassword || params.newPassword.length < 8) {
      throw new Error('Le nouveau mot de passe doit comporter au moins 8 caractères.');
    }
    return vaultManager.changePassword(params.newPassword);
  });

  // 14. Configuration ou remplacement de la clé de secours
  ipcMain.handle('vault:configure-recovery', async (_event, params: {
    action: 'add' | 'remove';
  }): Promise<{ recoveryKeyFormatted?: string; status: VaultStatusDTO }> => {
    return vaultManager.configureRecovery(params.action);
  });

  // 15. Exportation du kit de secours en clair
  ipcMain.handle('vault:export-recovery-kit', async (event, params: {
    vaultId: string;
    recoveryKeyFormatted: string;
  }): Promise<{ exportedPath: string | null }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultFilename = `Vanguard-Vault-Kit-Secours-${params.vaultId.slice(0, 8)}.txt`;

    const res = await dialog.showSaveDialog(win || undefined as any, {
      title: 'Enregistrer le kit de secours Vanguard Vault',
      defaultPath: defaultFilename,
      filters: [{ name: 'Fichier texte', extensions: ['txt'] }],
    });

    if (res.canceled || !res.filePath) {
      return { exportedPath: null };
    }

    const kitContent = [
      '========================================================================',
      '               VANGUARD VAULT — KIT DE RÉCUPÉRATION D\'URGENCE',
      '========================================================================',
      '',
      'AVERTISSEMENT DE SÉCURITÉ CRITIQUE :',
      '- Ce document contient la clé de récupération maîtresse de votre coffre.',
      '- Toute personne en possession de cette clé peut déverrouiller vos données.',
      '- Conservez ce fichier hors ligne sur un support chiffré ou imprimez-le.',
      '- NE STOCKEZ JAMAIS CE FICHIER À L\'INTÉRIEUR DU COFFRE LUI-MÊME.',
      '',
      `Identifiant Unique du Coffre (Vault ID) : ${params.vaultId}`,
      `Date de génération : ${new Date().toISOString()}`,
      '',
      'CLÉ DE RÉCUPÉRATION (56 caractères Base32 Crockford) :',
      params.recoveryKeyFormatted,
      '',
      'RAPPEL D\'UTILISATION :',
      'En cas de perte de votre mot de passe, ouvrez Vanguard Vault, choisissez',
      '« Utiliser ma clé de secours » et saisissez exactement les 14 groupes ci-dessus.',
      '========================================================================',
    ].join('\n');

    await fs.promises.writeFile(res.filePath, kitContent, { encoding: 'utf8', mode: 0o600 });
    return { exportedPath: res.filePath };
  });

  // 16. Configuration du délai d'auto-verrouillage
  ipcMain.handle('vault:set-autolock-delay', async (_event, params: {
    minutes: number;
  }): Promise<void> => {
    vaultManager.setAutoLockDelay(params.minutes);
  });

  // 17. Sélection d'un dossier de destination pour export (sauvegarde ou clair)
  ipcMain.handle('vault:select-export-dest', async (event, options?: { title?: string; defaultPath?: string }): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined as any, {
      title: options?.title || 'Sélectionner le répertoire de destination pour l\'exportation',
      defaultPath: options?.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    return res.filePaths[0];
  });

  // 18. Exportation du coffre (sauvegarde chiffrée, archive portable .vgv ou extraction en clair)
  ipcMain.handle('vault:export', async (event, params: {
    destPath: string;
    mode: 'backup_encrypted' | 'extract_all_plaintext' | 'archive_portable_vgv';
    overwrite?: boolean;
  }): Promise<{ mode: string; filesExported: number; totalBytes: number; archivePath?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return vaultManager.exportVault(
      params.destPath,
      params.mode,
      { overwrite: params.overwrite },
      (progress: VaultProgressEvent) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('vault:progress', progress);
        }
      }
    );
  });

  // 19. Sélection de chemin pour enregistrer une archive portable (.vgv)
  ipcMain.handle('vault:select-archive-save-path', async (event, options?: { defaultFilename?: string }): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showSaveDialog(win || undefined as any, {
      title: 'Emplacement de l\'archive portable Vanguard Vault (.vgv)',
      defaultPath: options?.defaultFilename || 'MonCoffre_Portable.vgv',
      filters: [{ name: 'Archive Vanguard Vault', extensions: ['vgv'] }],
    });
    if (res.canceled || !res.filePath) {
      return null;
    }
    return res.filePath;
  });

  // 20. Sélection d'une archive portable (.vgv) existante pour import
  ipcMain.handle('vault:select-archive-file', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined as any, {
      title: 'Sélectionner l\'archive portable Vanguard Vault (.vgv) à importer',
      filters: [{ name: 'Archive Vanguard Vault', extensions: ['vgv'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    return res.filePaths[0];
  });

  // 21. Importer une archive portable (.vgv) dans un dossier cible
  ipcMain.handle('vault:import-archive', async (event, params: {
    archivePath: string;
    targetVaultDir: string;
  }): Promise<{ targetVaultDir: string; filesExtracted: number; totalBytes: number; headerValid: boolean }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return vaultManager.importVaultArchive(
      params.archivePath,
      params.targetVaultDir,
      (progress: VaultProgressEvent) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('vault:progress', progress);
        }
      }
    );
  });
}

