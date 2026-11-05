/**
 * Astral Vanguard - Auto-Updater Module
 * Handles GitHub Releases check, background download, progress streaming,
 * and coordinated restart installation compatible with electron-builder <= v26 and v27+.
 */

import electronUpdaterPkg from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';

const autoUpdater = (electronUpdaterPkg as any).autoUpdater || (electronUpdaterPkg as any).default?.autoUpdater || electronUpdaterPkg;
import { BrowserWindow, ipcMain, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.ts';
import { loadPreferences, savePreferences } from './profile.ts';
import { notificationManager } from './notificationManager.ts';
import { checkFallbackReleases } from './updateFallback.ts';

export type InstallStage = 'idle' | 'downloaded' | 'preparing' | 'closing' | 'launching' | 'failed';

export function getDownloadedInstallerPath(): string | null {
  const pendingDir = path.join(process.env.LOCALAPPDATA || '', 'vanguard-core-updater', 'pending');
  try {
    if (fs.existsSync(pendingDir)) {
      const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.exe'));
      if (files.length > 0) {
        return path.join(pendingDir, files[0]);
      }
    }
  } catch {}
  return null;
}

export interface UpdaterState {
  currentVersion: string;
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error';
  updateInfo: UpdateInfo | null;
  progressPercent: number;
  bytesPerSecond: number;
  transferredBytes: number;
  totalBytes: number;
  error: string | null;
  autoInstallCountdown?: number | null;
  isDeferred?: boolean;
  installStage?: InstallStage;
  installError?: string | null;
  downloadedInstallerPath?: string | null;
}

let updaterState: UpdaterState = {
  currentVersion: app ? app.getVersion() : '0.1.8',
  status: 'idle',
  updateInfo: null,
  progressPercent: 0,
  bytesPerSecond: 0,
  transferredBytes: 0,
  totalBytes: 0,
  error: null,
  autoInstallCountdown: null,
  isDeferred: false,
  installStage: 'idle',
  installError: null,
  downloadedInstallerPath: null,
};

let mainWindow: BrowserWindow | null = null;

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state-changed', updaterState);
  }
}

export interface QuitPreparerDetails {
  success: boolean;
  error?: string;
  details?: any;
}
export type QuitPreparerResult = QuitPreparerDetails | void;
let onPrepareForQuitCallback: (() => Promise<QuitPreparerResult> | QuitPreparerResult) | null = null;

export function registerQuitPreparer(cb: () => Promise<QuitPreparerResult> | QuitPreparerResult) {
  onPrepareForQuitCallback = cb;
}

let autoInstallTimer: NodeJS.Timeout | null = null;
let autoInstallDelayMs = 30000; // 30 secondes d'avertissement avec possibilité de report
let isAutoInstallPending = false;

export function setAutoInstallDelayMsForTesting(delayMs: number) {
  autoInstallDelayMs = delayMs;
}

/**
 * Reporte l'installation automatique programmée (action utilisateur ou sécurité)
 */
export function deferAutoUpdate(): { success: boolean; deferred: boolean } {
  logger.info('[AutoUpdater] Demande de report de la mise à jour...');
  if (autoInstallTimer) {
    clearTimeout(autoInstallTimer);
    autoInstallTimer = null;
  }
  isAutoInstallPending = false;
  updaterState.autoInstallCountdown = null;
  updaterState.isDeferred = true;
  broadcastState();

  notificationManager.emit({
    category: 'updater',
    severity: 'info',
    title: 'Mise à jour reportée',
    message: 'L\'installation automatique a été décalée. Vous pourrez l\'appliquer depuis les paramètres ou au prochain redémarrage.',
    dedupKey: 'update-deferred-by-user',
    actionTarget: { tab: 'settings' },
  });

  return { success: true, deferred: true };
}

/**
 * Exécute la préparation ordonnée des opérations sensibles (Vault et VPN).
 * Règle stricte : si le délai (6000ms) expire ou si l'un des composants
 * sensibles n'est pas confirmé clos, la préparation est réputée ÉCHOUÉE.
 */
export async function executeSafeShutdownForUpdate(): Promise<{ success: boolean; reason?: string }> {
  logger.info('[AutoUpdater] Coordination et vérification de la fermeture des opérations sensibles (délai max 6000ms)...');

  if (!onPrepareForQuitCallback) {
    logger.info('[AutoUpdater] Aucun préparateur spécifique enregistré, préparation acceptée.');
    return { success: true };
  }

  let prepResult: QuitPreparerResult = undefined;
  let timedOut = false;

  try {
    await Promise.race([
      (async () => {
        prepResult = await onPrepareForQuitCallback!();
      })(),
      new Promise((resolve) => setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, 6000)),
    ]);
  } catch (err: any) {
    logger.warn('[AutoUpdater] Exception levée pendant la préparation d\'arrêt :', err?.message);
    return { success: false, reason: err?.message || 'Erreur pendant la fermeture des opérations sensibles' };
  }

  if (timedOut) {
    logger.warn('[AutoUpdater] Délai de coordination (6000ms) dépassé sans confirmation des opérations sensibles.');
    return { success: false, reason: 'timeout_exceeded' };
  }

  const resultObj = prepResult as QuitPreparerDetails | undefined;
  if (resultObj && typeof resultObj === 'object' && resultObj.success === false) {
    logger.warn('[AutoUpdater] Préparation incomplète ou rejetée :', resultObj.error);
    return { success: false, reason: resultObj.error || 'sensitive_operations_not_confirmed' };
  }

  logger.info('[AutoUpdater] Clôture des opérations sensibles vérifiée avec succès.');
  return { success: true };
}

/**
 * Handles quitAndInstall with coordination of sensitive operations.
 */
export async function quitAndInstallUpdate(isSilent = false, isForceRunAfter = true): Promise<boolean> {
  logger.info(`[AutoUpdater] Invoking coordinated quitAndInstall (isSilent=${isSilent}, isForceRunAfter=${isForceRunAfter})`);

  updaterState.installStage = 'preparing';
  updaterState.status = 'installing';
  updaterState.installError = null;
  broadcastState();

  const prep = await executeSafeShutdownForUpdate();
  if (!prep.success) {
    logger.warn(`[AutoUpdater] Arrêt annulé : préparation non confirmée (${prep.reason}). quitAndInstall() NE SERA PAS APPELÉ.`);
    updaterState.status = 'downloaded';
    updaterState.installStage = 'failed';
    updaterState.installError = prep.reason || 'Préparation de la fermeture non confirmée.';
    broadcastState();
    notificationManager.emit({
      category: 'updater',
      severity: 'warning',
      title: 'Mise à jour automatique reportée',
      message: 'La fermeture sécurisée du coffre ou la déconnexion VPN n\'a pas pu être confirmée à temps. L\'installation est reportée pour éviter toute perte.',
      dedupKey: 'update-postponed-sensitive-ops',
      actionTarget: { tab: 'settings' },
    });
    return false;
  }

  updaterState.installStage = 'closing';
  broadcastState();

  // Ensure single instance mutex is immediately freed so the newly launched installer/app is never rejected
  try {
    app.releaseSingleInstanceLock();
    logger.info('[AutoUpdater] Single instance mutex released.');
  } catch {}

  updaterState.installStage = 'launching';
  broadcastState();

  let launchSucceeded = false;
  try {
    const fn = (autoUpdater as any).quitAndInstall;
    if (typeof fn === 'function' && fn.length === 1) {
      logger.info('[AutoUpdater] Using electron-builder v27+ destructured object syntax');
      (autoUpdater as any).quitAndInstall({ isSilent, isForceRunAfter });
      launchSucceeded = true;
    } else {
      logger.info('[AutoUpdater] Using electron-builder <= v26 positional argument syntax');
      (autoUpdater as any).quitAndInstall(isSilent, isForceRunAfter);
      launchSucceeded = true;
    }
  } catch (err: any) {
    logger.warn('[AutoUpdater] Primary quitAndInstall invocation threw, attempting alternative syntax:', err);
    try {
      (autoUpdater as any).quitAndInstall(isSilent, isForceRunAfter);
      launchSucceeded = true;
    } catch (fallbackErr: any) {
      try {
        (autoUpdater as any).quitAndInstall({ isSilent, isForceRunAfter });
        launchSucceeded = true;
      } catch (finalErr: any) {
        logger.error('[AutoUpdater] All quitAndInstall invocations failed:', finalErr);
        updaterState.status = 'downloaded';
        updaterState.installStage = 'failed';
        updaterState.installError = finalErr?.message || 'Échec de lancement de l\'installateur';
        broadcastState();
        return false;
      }
    }
  }

  if (launchSucceeded) {
    // Graceful process exit fallback to avoid locking files against the launched installer
    const exitTimer = setTimeout(() => {
      logger.info('[AutoUpdater] Exiting process after successful installer handoff');
      if (app && typeof app.exit === 'function') {
        app.exit(0);
      }
    }, 1200);
    if (exitTimer && typeof exitTimer.unref === 'function') {
      exitTimer.unref();
    }
  }

  return true;
}

/**
 * Traite la fin du téléchargement d'une mise à jour :
 * avertissement, possibilité de report, et déclenchement automatique
 * si l'utilisateur a choisi le mode automatique.
 */
export function handleUpdateDownloaded(info: UpdateInfo) {
  logger.info(`[AutoUpdater] Update v${info.version} downloaded and verified.`);
  updaterState.status = 'downloaded';
  updaterState.installStage = 'downloaded';
  updaterState.installError = null;
  updaterState.downloadedInstallerPath = getDownloadedInstallerPath();
  updaterState.updateInfo = info;
  updaterState.progressPercent = 100;
  broadcastState();

  const prefs = loadPreferences();
  const autoUpdateActive = prefs.autoUpdateEnabled ?? true;

  if (autoUpdateActive) {
    isAutoInstallPending = true;
    updaterState.autoInstallCountdown = Math.round(autoInstallDelayMs / 1000);
    broadcastState();

    logger.info(`[AutoUpdater] Mode automatique actif : compte à rebours de ${updaterState.autoInstallCountdown}s avant installation.`);

    notificationManager.emit({
      category: 'updater',
      severity: 'info',
      title: 'Mise à jour prête — Redémarrage prévu',
      message: `Vanguard Core v${info.version} a été téléchargé. Redémarrage et installation automatique dans ${updaterState.autoInstallCountdown} secondes (cliquez sur Reporter pour différer).`,
      dedupKey: `update-downloaded-auto-${info.version}`,
      actionTarget: { tab: 'settings' },
    });

    if (autoInstallTimer) {
      clearTimeout(autoInstallTimer);
    }

    autoInstallTimer = setTimeout(async () => {
      if (!isAutoInstallPending) return;
      logger.info('[AutoUpdater] Échéance du compte à rebours : déclenchement automatique de l\'installation...');
      isAutoInstallPending = false;
      updaterState.autoInstallCountdown = null;
      updaterState.status = 'installing';
      broadcastState();

      const installed = await quitAndInstallUpdate(false, true);
      if (!installed) {
        logger.info('[AutoUpdater] Installation automatique suspendue suite au refus de la préparation.');
      }
    }, autoInstallDelayMs);

    if (autoInstallTimer && typeof (autoInstallTimer as any).unref === 'function') {
      (autoInstallTimer as any).unref();
    }
  } else {
    // Mode notification seule
    notificationManager.emit({
      category: 'updater',
      severity: 'info',
      title: 'Mise à jour prête',
      message: `Vanguard Core v${info.version} a été téléchargé et vérifié. Prêt à l'installation.`,
      dedupKey: `update-downloaded-manual-${info.version}`,
      actionTarget: { tab: 'settings' },
    });
  }
}

export function setupAutoUpdater(win: BrowserWindow, onPrepareForQuit?: () => Promise<QuitPreparerResult> | QuitPreparerResult) {
  mainWindow = win;
  if (onPrepareForQuit) {
    onPrepareForQuitCallback = onPrepareForQuit;
  }
  updaterState.currentVersion = app ? app.getVersion() : '0.1.8';

  // Configure logger for autoUpdater
  autoUpdater.logger = {
    info: (msg: any) => logger.info(`[autoUpdater] ${msg}`),
    warn: (msg: any) => logger.warn(`[autoUpdater] ${msg}`),
    error: (msg: any) => logger.error(`[autoUpdater] ${msg}`),
    debug: (msg: any) => logger.debug(`[autoUpdater] ${msg}`),
  };

  // Public repository (urnova/Astral-Security-Guard-vpn)
  if (process.env.GH_TOKEN) {
    autoUpdater.requestHeaders = { Authorization: `token ${process.env.GH_TOKEN}` };
  } else {
    autoUpdater.requestHeaders = {};
  }

  const prefs = loadPreferences();
  const autoUpdateActive = prefs.autoUpdateEnabled ?? true;
  autoUpdater.autoDownload = autoUpdateActive;
  autoUpdater.autoInstallOnAppQuit = true;

  // Prerelease channel enabled by default for preview/beta releases
  autoUpdater.allowPrerelease = prefs.previewChannel ?? true;
  logger.info(`[AutoUpdater] Canal préversion (bêta) : ${autoUpdater.allowPrerelease ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
  logger.info(`[AutoUpdater] Mises à jour automatiques : ${autoUpdateActive ? 'ACTIVÉES' : 'DÉSACTIVÉES'}`);

  autoUpdater.on('checking-for-update', () => {
    logger.info('[AutoUpdater] Checking for updates on GitHub Releases...');
    updaterState.status = 'checking';
    updaterState.error = null;
    broadcastState();
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`[AutoUpdater] Update available: v${info.version} (current: v${updaterState.currentVersion})`);
    updaterState.status = 'available';
    updaterState.updateInfo = info;
    updaterState.error = null;
    broadcastState();

    notificationManager.emit({
      category: 'updater',
      severity: 'info',
      title: 'Nouvelle version disponible',
      message: `Vanguard Core v${info.version} est disponible au téléchargement.`,
      dedupKey: `update-available-${info.version}`,
      actionTarget: { tab: 'settings' },
    });

    const currentPrefs = loadPreferences();
    if (currentPrefs.autoUpdateEnabled ?? true) {
      logger.info('[AutoUpdater] Mises à jour automatiques actives : déclenchement du téléchargement en arrière-plan...');
      autoUpdater.downloadUpdate().catch((err: any) => {
        logger.warn('[AutoUpdater] Auto-download note:', err?.message);
      });
    }
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(`[AutoUpdater] App is up to date (v${info.version})`);
    updaterState.status = 'not-available';
    updaterState.updateInfo = info;
    updaterState.error = null;
    broadcastState();
  });

  autoUpdater.on('download-progress', (progressObj: any) => {
    updaterState.status = 'downloading';
    updaterState.progressPercent = Math.round(progressObj.percent);
    updaterState.bytesPerSecond = progressObj.bytesPerSecond;
    updaterState.transferredBytes = progressObj.transferred;
    updaterState.totalBytes = progressObj.total;
    broadcastState();
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    handleUpdateDownloaded(info);
  });

  autoUpdater.on('error', (err: Error) => {
    logger.error('[AutoUpdater] Update error encountered:', err.message);
    updaterState.status = 'error';
    updaterState.error = err.message || 'Erreur lors de la mise à jour';
    broadcastState();

    // Déclenchement passif du secours informatif en cas d'erreur de recherche
    checkFallbackReleases({
      currentVersion: updaterState.currentVersion,
      allowPrerelease: Boolean(autoUpdater.allowPrerelease),
    }).catch((e: any) => {
      logger.debug('[AutoUpdater] Notice vérification de secours :', e?.message);
    });
  });

  // Register IPC handlers
  ipcMain.handle('updater:get-state', () => {
    return updaterState;
  });

  ipcMain.handle('updater:defer', async () => {
    return deferAutoUpdate();
  });

  ipcMain.handle('updater:check', async () => {
    try {
      logger.info('[AutoUpdater] User triggered update check');
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (err: any) {
      logger.error('[AutoUpdater] Failed to check for updates:', err);
      updaterState.status = 'error';
      updaterState.error = err.message || 'Impossible de contacter le serveur de mise à jour';
      broadcastState();

      // Déclenchement du secours informatif sur action manuelle
      const fallback = await checkFallbackReleases({
        currentVersion: updaterState.currentVersion,
        allowPrerelease: Boolean(autoUpdater.allowPrerelease),
        forceRefresh: true,
      });

      return { success: false, error: updaterState.error, fallback };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      logger.info('[AutoUpdater] User initiated update download');
      updaterState.status = 'downloading';
      updaterState.progressPercent = 0;
      broadcastState();
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      logger.error('[AutoUpdater] Failed to download update:', err);
      updaterState.status = 'error';
      updaterState.error = err.message || 'Échec du téléchargement de la mise à jour';
      broadcastState();
      return { success: false, error: updaterState.error };
    }
  });

  ipcMain.handle('updater:install', async () => {
    logger.info('[AutoUpdater] User confirmed installation manually, checking sensitive operations');
    if (autoInstallTimer) {
      clearTimeout(autoInstallTimer);
      autoInstallTimer = null;
    }
    isAutoInstallPending = false;

    updaterState.installStage = 'preparing';
    updaterState.status = 'installing';
    updaterState.installError = null;
    updaterState.downloadedInstallerPath = getDownloadedInstallerPath();
    broadcastState();

    const prep = await executeSafeShutdownForUpdate();
    if (!prep.success) {
      logger.warn('[AutoUpdater] Manuel : préparation non confirmée :', prep.reason);
      updaterState.status = 'downloaded';
      updaterState.installStage = 'failed';
      updaterState.installError = prep.reason || 'Préparation non confirmée';
      broadcastState();
      notificationManager.emit({
        category: 'updater',
        severity: 'warning',
        title: 'Installation manuelle suspendue',
        message: 'Le coffre-fort ou la connexion VPN n\'a pas pu être clôturé de manière vérifiée. Fermez vos documents ou réessayez.',
        dedupKey: 'update-manual-prep-failed',
      });
      return { success: false, error: prep.reason };
    }

    updaterState.installStage = 'closing';
    broadcastState();

    setTimeout(async () => {
      await quitAndInstallUpdate(false, true);
    }, 400);
    return { success: true };
  });

  ipcMain.handle('updater:open-installer-folder', async () => {
    const installerPath = getDownloadedInstallerPath();
    if (installerPath && fs.existsSync(installerPath)) {
      try {
        shell.showItemInFolder(installerPath);
        return { success: true, path: installerPath };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    }
    return { success: false, error: 'Fichier d\'installation introuvable dans le dossier temporaire.' };
  });

  ipcMain.handle('updater:set-auto-update', async (_, enabled: boolean) => {
    try {
      savePreferences({ autoUpdateEnabled: enabled });
      autoUpdater.autoDownload = enabled;
      logger.info(`[AutoUpdater] Mises à jour automatiques changées : ${enabled ? 'ACTIVÉES' : 'DÉSACTIVÉES'}`);
      if (enabled && updaterState.status === 'available') {
        logger.info('[AutoUpdater] Téléchargement immédiat de la mise à jour disponible...');
        autoUpdater.downloadUpdate().catch((err: any) => {
          logger.warn('[AutoUpdater] Erreur auto-download post-activation:', err?.message);
        });
      }
      return { success: true, autoUpdateEnabled: enabled };
    } catch (err: any) {
      logger.error('[AutoUpdater] Failed to set autoUpdateEnabled:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:get-auto-update', () => {
    const prefs = loadPreferences();
    return { autoUpdateEnabled: prefs.autoUpdateEnabled ?? true };
  });

  ipcMain.handle('updater:set-preview-channel', async (_, enabled: boolean) => {
    try {
      autoUpdater.allowPrerelease = enabled;
      savePreferences({ previewChannel: enabled });
      logger.info(`[AutoUpdater] Canal préversion (bêta) changé : ${enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
      return { success: true, previewChannel: enabled };
    } catch (err: any) {
      logger.error('[AutoUpdater] Failed to toggle preview channel:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:get-preview-channel', () => {
    return { previewChannel: autoUpdater.allowPrerelease };
  });

  // Check for updates shortly after launch in production (or if forced via env)
  if (app && (app.isPackaged || process.env.CHECK_UPDATE_DEV === '1')) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e: any) => logger.warn('[AutoUpdater] Initial check error:', e?.message));
    }, 5000);

    // Periodic check every 30 minutes in background
    setInterval(() => {
      logger.info('[AutoUpdater] Vérification périodique des mises à jour en arrière-plan...');
      autoUpdater.checkForUpdates().catch((e: any) => logger.debug('[AutoUpdater] Periodic check error:', e?.message));
    }, 30 * 60 * 1000);
  }
}
