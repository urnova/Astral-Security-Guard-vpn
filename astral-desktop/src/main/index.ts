import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification } from 'electron';
import path from 'path';
import { logger } from './logger';
import { isAdmin, getWindowsBuildInfo, relaunchElevated } from './adminHelper';
import { setupAutoUpdater } from './updater';
import { setupSecurityIPC } from './security';
import { setupVpnIPC } from './vpn';
import { setupPerformanceIPC } from './performance';
import { setupNetworkIPC } from './network';
import { setupGamingIPC, startGameDetection } from './gaming';
import { setupRollbackIPC } from './rollback';
import { setupDoctorIPC, executeSosPing } from './doctor';
import { setupDownloadScannerIPC } from './downloadScanner';
import { setupProfileIPC } from './profile';

process.env.DIST = path.join(__dirname, '../..');
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = true;

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

  // Windows native notification when main window is hidden or minimized
  if (Notification.isSupported() && (!mainWin || !mainWin.isVisible() || mainWin.isMinimized())) {
    try {
      const n = new Notification({
        title,
        body,
        icon: path.join(process.env.PUBLIC!, 'icon.ico'),
      });
      n.on('click', () => {
        if (mainWin) {
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

    const updateMenu = (activeMode = 'gaming') => {
      const menu = Menu.buildFromTemplate([
        {
          label: 'Ouvrir Astral Vanguard',
          click: () => {
            mainWin?.show();
            mainWin?.focus();
          },
        },
        { type: 'separator' },
        {
          label: 'Mode Système',
          submenu: [
            {
              label: 'Mode Gaming (Faible Latence)',
              type: 'radio',
              checked: activeMode === 'gaming',
              click: () => {
                mainWin?.webContents.send('doctor:set-mode', 'gaming');
                updateMenu('gaming');
              },
            },
            {
              label: 'Mode Bureau / Standard',
              type: 'radio',
              checked: activeMode === 'office',
              click: () => {
                mainWin?.webContents.send('doctor:set-mode', 'office');
                updateMenu('office');
              },
            },
            {
              label: 'Mode Cyber-Shield (Sécurité Max)',
              type: 'radio',
              checked: activeMode === 'shield',
              click: () => {
                mainWin?.webContents.send('doctor:set-mode', 'shield');
                updateMenu('shield');
              },
            },
            {
              label: 'Mode Éco / Silencieux',
              type: 'radio',
              checked: activeMode === 'eco',
              click: () => {
                mainWin?.webContents.send('doctor:set-mode', 'eco');
                updateMenu('eco');
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: '⚡ SOS Déblocage Ping (1002ms)',
          click: async () => {
            logger.info('[Tray] User triggered SOS Déblocage Ping from tray');
            const res = await executeSosPing();
            mainWin?.webContents.send('doctor:lag-alert', {
              message: res.success ? res.message : `Erreur SOS: ${res.error}`,
            });
          },
        },
        {
          label: 'Afficher / Masquer l\'Overlay HUD (Ctrl+Shift+O)',
          click: () => toggleOverlay(),
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
    };

    updateMenu('gaming');
    tray.setToolTip('Astral Vanguard - Protection & Optimisation active');
    tray.on('double-click', () => {
      mainWin?.show();
      mainWin?.focus();
    });
  } catch (err: any) {
    logger.warn('[Tray] Could not initialize system tray:', err.message);
  }
}

// ── Boot Sequence ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // Auto-start with Windows
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });

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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in system tray on Windows
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

// Settings IPC
ipcMain.handle('settings:get', () => {
  const loginSettings = app.getLoginItemSettings();
  return {
    openAtLogin: loginSettings.openAtLogin,
    minimizeToTray,
    overlayActive: Boolean(overlayWin),
  };
});

ipcMain.handle('settings:set-autostart', (_, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled, path: app.getPath('exe') });
  return { success: true, openAtLogin: enabled };
});

ipcMain.handle('settings:set-minimize-tray', (_, enabled: boolean) => {
  minimizeToTray = enabled;
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

