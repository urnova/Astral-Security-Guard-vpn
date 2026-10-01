import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification } from 'electron';
import path from 'path';
import { logger } from './logger';
import { isAdmin, getWindowsBuildInfo, relaunchElevated } from './adminHelper';
import { setupAutoUpdater } from './updater';
import { setupSecurityIPC } from './security';
import { setupVpnIPC, cleanupAstralFirewallRules } from './vpn';
import { setupPerformanceIPC } from './performance';
import { setupNetworkIPC } from './network';
import { setupGamingIPC, startGameDetection } from './gaming';
import { setupRollbackIPC } from './rollback';
import { setupDoctorIPC, executeSosPing } from './doctor';
import { setupDownloadScannerIPC } from './downloadScanner';
import { setupProfileIPC, loadPreferences, savePreferences } from './profile';

// ── Single Instance Lock ───────────────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  logger.info('[App] Another instance of Astral Vanguard is already running. Quitting duplicate instance.');
  app.quit();
  process.exit(0);
}

// Set Application User Model ID for Windows toast notifications & taskbar grouping
app.setAppUserModelId('com.astral.vanguard');

process.env.DIST = path.join(__dirname, '../..');
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = loadPreferences().minimizeToTray;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];


// ── Native Windows Notification Dispatcher ────────────────────────────────────
export function notifyUser(title: string, body: string, isCritical = false) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('notification:trigger', {
      type: isCritical ? 'threat' : 'info',
      title,
      message: body,
      critical: isCritical,
    });
  }

  // Windows native notification - always dispatch to Windows Action Center
  if (Notification.isSupported()) {
    try {
      const iconPath = process.env.PUBLIC ? path.join(process.env.PUBLIC, 'icon.ico') : undefined;
      const n = new Notification({
        title,
        body,
        icon: iconPath,
        urgency: isCritical ? 'critical' : 'normal',
      });
      n.on('click', () => {
        if (mainWin && !mainWin.isDestroyed()) {
          if (mainWin.isMinimized()) mainWin.restore();
          mainWin.show();
          mainWin.focus();
        }
      });
      n.show();
    } catch (err: any) {
      logger.warn('[Notification] Failed to show native notification:', err.message);
    }
  }
}

// ── Main Window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  logger.info('[App] Creating Main window...');
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#07071a',
      symbolColor: '#a78bfa',
      height: 36,
    },
    backgroundColor: '#07071a',
    icon: path.join(process.env.PUBLIC!, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWin.setMenu(null);

  // Setup all IPC modules
  setupSecurityIPC(mainWin);
  setupVpnIPC(mainWin);
  setupPerformanceIPC(mainWin);
  setupNetworkIPC(mainWin);
  setupGamingIPC(mainWin, () => overlayWin);
  setupRollbackIPC(mainWin);
  setupDoctorIPC(mainWin);
  setupDownloadScannerIPC(mainWin);
  setupProfileIPC();

  if (VITE_DEV_SERVER_URL) {
    mainWin.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWin.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Show main window directly without separate popup window or artificial delay
  mainWin.once('ready-to-show', () => {
    logger.info('[App] Main window ready-to-show. Revealing main window...');
    mainWin?.show();
    setupAutoUpdater(mainWin!);
    startGameDetection(mainWin!, () => overlayWin, setOverlayWin);

    // Check elevation and broadcast status
    const admin = isAdmin();
    const osInfo = getWindowsBuildInfo();
    logger.info(`[App] Running with admin rights: ${admin}, OS: ${osInfo.edition} (${osInfo.buildNumber})`);
    mainWin?.webContents.send('admin:status', { isAdmin: admin, osInfo });
  });

  mainWin.on('close', (e) => {
    if (minimizeToTray) {
      e.preventDefault();
      mainWin?.hide();
    }
  });
}

// ── Gaming Overlay ────────────────────────────────────────────────────────────
function setOverlayWin(w: BrowserWindow | null) {
  overlayWin = w;
}

export function createOverlay() {
  if (overlayWin) return;
  logger.info('[App] Creating gaming HUD overlay window...');
  overlayWin = new BrowserWindow({
    width: 260,
    height: 160,
    x: 24,
    y: 24,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  if (VITE_DEV_SERVER_URL) {
    overlayWin.loadURL(`${VITE_DEV_SERVER_URL}#/overlay`);
  } else {
    overlayWin.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/overlay' });
  }

  overlayWin.on('closed', () => {
    overlayWin = null;
  });
}

export function destroyOverlay() {
  overlayWin?.close();
  overlayWin = null;
}

export function toggleOverlay() {
  if (overlayWin) {
    destroyOverlay();
  } else {
    createOverlay();
  }
}

// ── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  try {
    const iconPath = path.join(process.env.PUBLIC!, 'icon.ico');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const updateMenu = (gamingActive = false) => {
      const menu = Menu.buildFromTemplate([
        {
          label: 'Ouvrir Astral Vanguard',
          click: () => {
            if (mainWin) {
              if (mainWin.isMinimized()) mainWin.restore();
              mainWin.show();
              mainWin.focus();
            }
          },
        },
        { type: 'separator' },
        {
          label: '🛡️ Lancer une analyse rapide Defender',
          click: () => {
            if (mainWin) {
              if (mainWin.isMinimized()) mainWin.restore();
              mainWin.show();
              mainWin.focus();
              mainWin.webContents.send('action:trigger-scan');
            }
          },
        },
        {
          label: gamingActive ? '🎮 Désactiver le mode Gaming' : '🎮 Activer le mode Gaming manuel',
          click: () => {
            mainWin?.webContents.send('gaming:toggle-manual');
          },
        },
        {
          label: '🖥️ Afficher / Masquer HUD (Ctrl+Shift+O)',
          click: () => toggleOverlay(),
        },
        {
          label: '⚙️ Paramètres',
          click: () => {
            if (mainWin) {
              if (mainWin.isMinimized()) mainWin.restore();
              mainWin.show();
              mainWin.focus();
              mainWin.webContents.send('navigation:go-to', 'settings');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Quitter Définitivement',
          click: () => {
            minimizeToTray = false;
            app.exit(0);
          },
        },
      ]);

      tray?.setContextMenu(menu);
      tray?.setToolTip(`Astral Vanguard — ${gamingActive ? 'Mode Gaming Actif' : 'Protection résidente active'}`);
    };

    updateMenu(false);

    tray.on('double-click', () => {
      if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
      }
    });
  } catch (err: any) {
    logger.warn('[Tray] Could not initialize system tray:', err.message);
  }
}

// ── Second Instance Handler ──────────────────────────────────────────────────
app.on('second-instance', () => {
  logger.info('[App] Second instance attempted. Focusing existing window.');
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    if (!mainWin.isVisible()) mainWin.show();
    mainWin.setAlwaysOnTop(true);
    mainWin.focus();
    mainWin.setAlwaysOnTop(false);
  }
});

// ── Boot Sequence ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Purge any stale firewall rules left by prior sessions or crashes
  await cleanupAstralFirewallRules();

  createMainWindow();
  createTray();

  const prefs = loadPreferences();

  // Auto-start with Windows (per saved preferences)
  app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, path: app.getPath('exe') });

  // Register Global Shortcut for HUD toggle (Ctrl+Shift+O)
  try {
    globalShortcut.register('CommandOrControl+Shift+O', () => {
      toggleOverlay();
    });
  } catch (err: any) {
    logger.warn('[App] Could not register global shortcut:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  cleanupAstralFirewallRules();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cleanupAstralFirewallRules();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in system tray on Windows if minimizeToTray is enabled
    if (!minimizeToTray) {
      app.quit();
    }
  }
});

// Admin Elevation IPC
ipcMain.handle('admin:get-status', () => {
  return {
    isAdmin: isAdmin(),
    osInfo: getWindowsBuildInfo(),
  };
});

ipcMain.handle('admin:relaunch-elevated', () => {
  logger.info('[App] User requested elevated relaunch');
  relaunchElevated();
  return { success: true };
});

// IPC: overlay & window control
ipcMain.handle('overlay:show', () => createOverlay());
ipcMain.handle('overlay:hide', () => destroyOverlay());
ipcMain.handle('overlay:toggle', () => toggleOverlay());
ipcMain.handle('overlay:status', () => Boolean(overlayWin));
ipcMain.handle('app:quit', () => {
  minimizeToTray = false;
  app.exit(0);
});
ipcMain.handle('app:minimize', () => mainWin?.minimize());
ipcMain.handle('app:hide-to-tray', () => mainWin?.hide());

// Settings IPC
ipcMain.handle('settings:get', () => {
  const prefs = loadPreferences();
  return {
    ...prefs,
    openAtLogin: prefs.openAtLogin,
    minimizeToTray: prefs.minimizeToTray,
    overlayActive: Boolean(overlayWin),
  };
});

ipcMain.handle('settings:set-autostart', (_, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled, path: app.getPath('exe') });
  savePreferences({ openAtLogin: enabled });
  return { success: true, openAtLogin: enabled };
});

ipcMain.handle('settings:set-minimize-tray', (_, enabled: boolean) => {
  minimizeToTray = enabled;
  savePreferences({ minimizeToTray: enabled });
  return { success: true, minimizeToTray };
});


// Native Notification IPC
ipcMain.handle('notification:test', (_, { title, body }: { title: string; body: string }) => {
  notifyUser(title || 'Vanguard Protection', body || 'Test de notification native Windows réussi.');
  return { success: true };
});

ipcMain.handle('notification:send', (_, { title, body, critical }: { title: string; body: string; critical?: boolean }) => {
  notifyUser(title, body, Boolean(critical));
  return { success: true };
});

