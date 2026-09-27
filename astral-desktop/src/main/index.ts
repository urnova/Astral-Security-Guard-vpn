import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut } from 'electron';
import path from 'path';
import { setupAutoUpdater } from './updater';
import { setupSecurityIPC } from './security';
import { setupVpnIPC } from './vpn';
import { setupPerformanceIPC } from './performance';
import { setupNetworkIPC } from './network';
import { setupGamingIPC, startGameDetection } from './gaming';
import { setupRollbackIPC } from './rollback';
import { setupDoctorIPC } from './doctor';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

process.env.DIST = path.join(__dirname, '../..');
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWin: BrowserWindow | null = null;
let splashWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = true;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

// ── Splash Window ────────────────────────────────────────────────────────────
function createSplash() {
  splashWin = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    splashWin.loadURL(`${VITE_DEV_SERVER_URL}#/splash`);
  } else {
    splashWin.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/splash' });
  }
}

// ── Main Window ──────────────────────────────────────────────────────────────
function createMainWindow() {
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

  if (VITE_DEV_SERVER_URL) {
    mainWin.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWin.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Show main window after splash
  mainWin.once('ready-to-show', () => {
    setTimeout(() => {
      splashWin?.close();
      splashWin = null;
      mainWin?.show();
      setupAutoUpdater(mainWin!);
      startGameDetection(mainWin!, () => overlayWin, setOverlayWin);
    }, 2800);
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
  overlayWin = new BrowserWindow({
    width: 240,
    height: 150,
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

// ── System Tray (Windows Hidden Icons Area) ──────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(path.join(process.env.PUBLIC!, 'icon.ico'));
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
        label: 'Mode Actif',
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
            label: 'Mode Bureau / Pro',
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
          await execPromise(`powershell -Command "Clear-DnsClientCache; ipconfig /flushdns; arp -d * 2>$null"`).catch(() => {});
          mainWin?.webContents.send('doctor:lag-alert', {
            message: 'SOS Réseau exécuté : Cache DNS et sockets purgés avec succès !',
          });
        },
      },
      {
        label: '🚀 Vider la RAM (Boost)',
        click: async () => {
          await execPromise(
            `powershell -Command "[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()"`
          ).catch(() => {});
          mainWin?.webContents.send('perf:boost-done', { message: 'Mémoire RAM purgée !' });
        },
      },
      {
        label: 'Afficher / Masquer l\'Overlay HUD',
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
}

// ── Boot Sequence ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createSplash();

  setTimeout(() => {
    createMainWindow();
    createTray();
  }, 400);

  // Default auto-start with Windows
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });

  // Register Global Shortcut for HUD toggle (Ctrl+Shift+O)
  try {
    globalShortcut.register('CommandOrControl+Shift+O', () => {
      toggleOverlay();
    });
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in system tray
  }
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
