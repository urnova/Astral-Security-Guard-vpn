/**
 * Astral Vanguard - Auto-Updater Module
 * Handles GitHub Releases check, background download, progress streaming,
 * and silent/force restart installation compatible with electron-builder <= v26 and v27+.
 */

import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, ipcMain, app } from 'electron';
import { logger } from './logger';
import { loadPreferences, savePreferences } from './profile';

export interface UpdaterState {
  currentVersion: string;
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  updateInfo: UpdateInfo | null;
  progressPercent: number;
  bytesPerSecond: number;
  transferredBytes: number;
  totalBytes: number;
  error: string | null;
}

let updaterState: UpdaterState = {
  currentVersion: app.getVersion(),
  status: 'idle',
  updateInfo: null,
  progressPercent: 0,
  bytesPerSecond: 0,
  transferredBytes: 0,
  totalBytes: 0,
  error: null,
};

let mainWindow: BrowserWindow | null = null;

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state-changed', updaterState);
  }
}

let onPrepareForQuitCallback: (() => void) | null = null;

export function registerQuitPreparer(cb: () => void) {
  onPrepareForQuitCallback = cb;
}

/**
 * Handles quitAndInstall cleanly.
 * Using non-silent mode (isSilent = false) on Windows NSIS is required so that:
 * 1. The Windows UAC elevation prompt is presented to the user.
 * 2. The user visibly sees the installer window rather than having the application close silently with no feedback.
 */
export function quitAndInstallUpdate(isSilent = false, isForceRunAfter = true): void {
  logger.info(`[AutoUpdater] Invoking quitAndInstall (isSilent=${isSilent}, isForceRunAfter=${isForceRunAfter})`);
  
  if (onPrepareForQuitCallback) {
    try {
      onPrepareForQuitCallback();
    } catch (err: any) {
      logger.warn('[AutoUpdater] onPrepareForQuitCallback threw:', err.message);
    }
  }

  try {
    const fn = (autoUpdater as any).quitAndInstall;
    if (typeof fn === 'function' && fn.length === 1) {
      logger.info('[AutoUpdater] Using electron-builder v27+ destructured object syntax');
      (autoUpdater as any).quitAndInstall({ isSilent, isForceRunAfter });
    } else {
      logger.info('[AutoUpdater] Using electron-builder <= v26 positional argument syntax (matches package.json 24.9.1)');
      (autoUpdater as any).quitAndInstall(isSilent, isForceRunAfter);
    }
  } catch (err: any) {
    logger.warn('[AutoUpdater] Primary quitAndInstall invocation threw, attempting alternative syntax:', err);
    try {
      (autoUpdater as any).quitAndInstall(isSilent, isForceRunAfter);
    } catch {
      (autoUpdater as any).quitAndInstall({ isSilent, isForceRunAfter });
    }
  }

  // Safety fallback: if app hasn't terminated within 3.5s, exit directly to free installer file lock
  setTimeout(() => {
    logger.info('[AutoUpdater] Forcing application exit to release single-instance mutex for installer');
    app.exit(0);
  }, 3500);
}

export function setupAutoUpdater(win: BrowserWindow, onPrepareForQuit?: () => void) {
  mainWindow = win;
  if (onPrepareForQuit) {
    onPrepareForQuitCallback = onPrepareForQuit;
  }
  updaterState.currentVersion = app.getVersion();

  // Configure logger for autoUpdater
  autoUpdater.logger = {
    info: (msg: any) => logger.info(`[autoUpdater] ${msg}`),
    warn: (msg: any) => logger.warn(`[autoUpdater] ${msg}`),
    error: (msg: any) => logger.error(`[autoUpdater] ${msg}`),
    debug: (msg: any) => logger.debug(`[autoUpdater] ${msg}`),
  };

  // The repository is public (urnova/Astral-Security-Guard-vpn).
  // DO NOT send invalid placeholder Bearer/token headers, which cause 401 Unauthorized errors on GitHub API.
  if (process.env.GH_TOKEN) {
    autoUpdater.requestHeaders = { Authorization: `token ${process.env.GH_TOKEN}` };
  } else {
    autoUpdater.requestHeaders = {};
  }

  autoUpdater.autoDownload = false; // Give user choice or trigger via UI
  autoUpdater.autoInstallOnAppQuit = true;

  // Configure preview/beta channel based on user preferences
  const prefs = loadPreferences();
  autoUpdater.allowPrerelease = prefs.previewChannel;
  logger.info(`[AutoUpdater] Canal prévision (bêta) : ${prefs.previewChannel ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);

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
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(`[AutoUpdater] App is up to date (v${info.version})`);
    updaterState.status = 'not-available';
    updaterState.updateInfo = info;
    updaterState.error = null;
    broadcastState();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    updaterState.status = 'downloading';
    updaterState.progressPercent = Math.round(progressObj.percent);
    updaterState.bytesPerSecond = progressObj.bytesPerSecond;
    updaterState.transferredBytes = progressObj.transferred;
    updaterState.totalBytes = progressObj.total;
    broadcastState();
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(`[AutoUpdater] Update v${info.version} downloaded and verified.`);
    updaterState.status = 'downloaded';
    updaterState.updateInfo = info;
    updaterState.progressPercent = 100;
    broadcastState();
  });

  autoUpdater.on('error', (err: Error) => {
    logger.error('[AutoUpdater] Update error encountered:', err.message);
    updaterState.status = 'error';
    updaterState.error = err.message || 'Erreur lors de la mise à jour';
    broadcastState();
  });

  // Register IPC handlers
  ipcMain.handle('updater:get-state', () => {
    return updaterState;
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
      return { success: false, error: updaterState.error };
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
    logger.info('[AutoUpdater] User confirmed installation, proceeding with quitAndInstall');
    quitAndInstallUpdate(false, true);
    return { success: true };
  });

  ipcMain.handle('updater:set-preview-channel', async (_, enabled: boolean) => {
    try {
      autoUpdater.allowPrerelease = enabled;
      savePreferences({ previewChannel: enabled });
      logger.info(`[AutoUpdater] Canal prévision (bêta) changé : ${enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
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
  if (app.isPackaged || process.env.CHECK_UPDATE_DEV === '1') {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => logger.warn('[AutoUpdater] Initial check error:', e.message));
    }, 5000);
  }
}
