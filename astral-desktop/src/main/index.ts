import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { isAdmin, getWindowsBuildInfo, relaunchElevated } from './adminHelper';
import { setupAutoUpdater } from './updater';
import { setupSecurityIPC } from './security';
import { setupVpnIPC, cleanupAstralFirewallRules } from './vpn';
import { setupPerformanceIPC } from './performance';
import { setupNetworkIPC } from './network';
import { setupGamingIPC, startGameDetection } from './gaming';
import { gamingManager } from './gamingManager';
import { setupRollbackIPC } from './rollback';
import { setupDoctorIPC, executeSosPing } from './doctor';
import { setupDownloadScannerIPC } from './downloadScanner';
import { setupProfileIPC, loadPreferences, savePreferences } from './profile';
import { executePrivilegedAction } from './privilegedHelper';

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


import { showAvastStyleToast } from './notificationWindow';

// ── Avast-Style & Native Windows Notification Dispatcher ─────────────────────
export function notifyUser(title: string, body: string, isCritical = false) {
  let desktopToastShown = false;
  try {
    showAvastStyleToast({
      title,
      message: body,
      type: isCritical ? 'threat' : 'info',
      onClickFocus: () => {
        if (mainWin && !mainWin.isDestroyed()) {
          if (mainWin.isMinimized()) mainWin.restore();
          mainWin.show();
          mainWin.focus();
        }
      },
    });
    desktopToastShown = true;
  } catch (err: any) {
    logger.warn('[Notification] Error showing Avast-style popup, falling back:', err.message);
  }

  // Fallback to in-app bottom toaster ONLY if desktop toast could not be shown
  if (!desktopToastShown && mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('notification:trigger', {
      type: isCritical ? 'threat' : 'info',
      title,
      message: body,
      critical: isCritical,
    });
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
    backgroundColor: '#131518',
    icon: path.join(process.env.PUBLIC!, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWin.setMenu(null);

  // Security Hardening: Deny opening new windows by default (Phase 1)
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn(`[Security] Rejet ouverture de fenêtre externe non autorisée : ${url}`);
    return { action: 'deny' };
  });

  // Security Hardening: Restrict navigations to local bundle or designated dev server
  mainWin.webContents.on('will-navigate', (event, url) => {
    const isAllowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://');
    if (!isAllowed) {
      event.preventDefault();
      logger.warn(`[Security] Rejet navigation non autorisée : ${url}`);
    }
  });

  mainWin.webContents.on('will-redirect', (event, url) => {
    const isAllowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://');
    if (!isAllowed) {
      event.preventDefault();
      logger.warn(`[Security] Rejet redirection non autorisée : ${url}`);
    }
  });

  // Diagnostics: Catch any renderer loading errors or crashed states
  mainWin.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    logger.error(`[App] Failed to load "${validatedURL}": ${errorDescription} (code: ${errorCode})`);
  });

  mainWin.webContents.on('render-process-gone', (_e, details) => {
    logger.error(`[App] Renderer process gone: ${details.reason} (exitCode: ${details.exitCode})`);
  });

  mainWin.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      logger.warn(`[Renderer] [L${line}] ${message} (${sourceId})`);
    }
  });

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

  let windowShown = false;
  const revealWindow = () => {
    if (windowShown || !mainWin || mainWin.isDestroyed()) return;
    windowShown = true;
    logger.info('[App] Revealing main window...');
    mainWin.show();
    setupAutoUpdater(mainWin);
    startGameDetection(mainWin, () => overlayWin, setOverlayWin);

    // Check elevation and broadcast status
    const admin = isAdmin();
    const osInfo = getWindowsBuildInfo();
    logger.info(`[App] Running with admin rights: ${admin}, OS: ${osInfo.edition} (${osInfo.buildNumber})`);
    mainWin.webContents.send('admin:status', { isAdmin: admin, osInfo });
  };

  mainWin.once('ready-to-show', () => {
    logger.info('[App] Main window ready-to-show fired.');
    revealWindow();
  });

  // Safety fallback: Reveal window after 2000ms if ready-to-show is delayed
  setTimeout(() => {
    if (!windowShown && mainWin && !mainWin.isDestroyed()) {
      logger.info('[App] Fallback reveal triggered.');
      revealWindow();
    }
  }, 2000);

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
    width: 310,
    height: 40,
    x: 32,
    y: 32,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  // Allow dragging and clicking close button on the HUD pill
  overlayWin.setIgnoreMouseEvents(false);

  overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlayWin.webContents.on('will-navigate', (e) => e.preventDefault());
  overlayWin.webContents.on('will-redirect', (e) => e.preventDefault());

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
let trayGamingActive = false;
let trayRealTimeShield = true;
let trayVpnConnected = false;
let trayVpnNodeName = '';

function getTrayIconImage(): Electron.NativeImage {
  const possiblePaths = [
    path.join(__dirname, '../../dist/icon.ico'),
    path.join(__dirname, '../../public/icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar/dist/icon.ico'),
    path.join(process.resourcesPath || '', 'dist/icon.ico'),
    path.join(process.resourcesPath || '', 'public/icon.ico'),
    path.join(process.env.PUBLIC || '', 'icon.ico'),
    path.join(process.env.DIST || '', 'icon.ico'),
    path.join(__dirname, '../../dist/logo.png'),
    path.join(__dirname, '../../public/logo.png'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img;
      } catch {}
    }
  }
  return nativeImage.createEmpty();
}

export function updateTrayState(opts: {
  gamingActive?: boolean;
  realTimeShield?: boolean;
  vpnConnected?: boolean;
  vpnNodeName?: string;
}) {
  if (opts.gamingActive !== undefined) trayGamingActive = opts.gamingActive;
  if (opts.realTimeShield !== undefined) trayRealTimeShield = opts.realTimeShield;
  if (opts.vpnConnected !== undefined) trayVpnConnected = opts.vpnConnected;
  if (opts.vpnNodeName !== undefined) trayVpnNodeName = opts.vpnNodeName;

  if (!tray) return;

  const showAndFocus = () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
    }
  };

  const currentAppVersion = app.getVersion();

  const menu = Menu.buildFromTemplate([
    {
      label: `⚡ Astral Vanguard v${currentAppVersion} (Bêta Pré-release)`,
      enabled: false,
    },
    {
      label: 'Ouvrir Astral Vanguard',
      click: showAndFocus,
    },
    { type: 'separator' },
    {
      label: '🛡️ Sécurité & Antivirus',
      submenu: [
        {
          label: trayRealTimeShield
            ? '✓ Bouclier Temps Réel : ACTIF (Suspendre)'
            : '⚠ Bouclier Temps Réel : SUSPENDU (Réactiver)',
          click: () => {
            trayRealTimeShield = !trayRealTimeShield;
            mainWin?.webContents.send('security:status-changed', {
              realTimeProtection: trayRealTimeShield,
              antivirusEnabled: trayRealTimeShield,
            });
            updateTrayState({ realTimeShield: trayRealTimeShield });
          },
        },
        { type: 'separator' },
        {
          label: '⚡ Lancer une Analyse Rapide',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('navigation:go-to', 'security');
            mainWin?.webContents.send('action:trigger-scan', 'quick');
          },
        },
        {
          label: '🔍 Lancer une Analyse Approfondie Multi-Disques',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('navigation:go-to', 'security');
            mainWin?.webContents.send('action:trigger-scan', 'full');
          },
        },
      ],
    },
    {
      label: '🌐 VPN & Anonymat',
      submenu: [
        {
          label: `Statut : ${trayVpnConnected ? `Connecté (${trayVpnNodeName || 'Tunnel Chiffré'})` : 'Déconnecté'}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: '⚡ Connexion Rapide (Paris · Core Alpha #1)',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('vpn:quick-connect', 'Paris · Core Alpha #1');
          },
        },
        {
          label: '🇩🇪 Francfort · DE-CIX Ultra (15ms)',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('vpn:quick-connect', 'Francfort · DE-CIX Ultra');
          },
        },
        {
          label: '🇳🇱 Amsterdam · AMS-IX Gigabit (17ms)',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('vpn:quick-connect', 'Amsterdam · AMS-IX Gigabit');
          },
        },
        {
          label: '🇨🇭 Zurich · Bunker Privacy (22ms)',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('vpn:quick-connect', 'Zurich · Bunker Privacy');
          },
        },
        {
          label: '🇺🇸 New York · NYIIX Core (86ms)',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('vpn:quick-connect', 'New York · NYIIX Core');
          },
        },
        { type: 'separator' },
        {
          label: '🔴 Déconnecter le VPN',
          enabled: trayVpnConnected,
          click: () => {
            mainWin?.webContents.send('vpn:quick-disconnect');
          },
        },
      ],
    },
    {
      label: trayGamingActive ? '🎮 Désactiver le Mode Gaming' : '🎮 Activer le Mode Gaming',
      click: () => {
        mainWin?.webContents.send('gaming:toggle-manual');
      },
    },
    {
      label: '👁️ Afficher / Masquer HUD (Ctrl+Shift+O)',
      click: () => toggleOverlay(),
    },
    {
      label: '🚀 Lancer la Maintenance & Nettoyage Système',
      click: () => {
        showAndFocus();
        mainWin?.webContents.send('navigation:go-to', 'performance');
      },
    },
    {
      label: '💾 Purger la Mémoire RAM & le Cache',
      click: () => {
        mainWin?.webContents.send('perf:trigger-clean-ram');
      },
    },
    { type: 'separator' },
    {
      label: '⚙️ Paramètres',
      click: () => {
        showAndFocus();
        mainWin?.webContents.send('navigation:go-to', 'settings');
      },
    },
    {
      label: 'Quitter Définitivement Astral Vanguard',
      click: () => {
        minimizeToTray = false;
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip('Astral Vanguard');
}

function createTray() {
  try {
    const icon = getTrayIconImage();
    tray = new Tray(icon);

    updateTrayState({});

    tray.on('click', () => {
      if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        if (!mainWin.isVisible()) mainWin.show();
        mainWin.focus();
      }
    });

    tray.on('double-click', () => {
      if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        if (!mainWin.isVisible()) mainWin.show();
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

  // Enforce Restrictive Content Security Policy (CSP) & Security Headers (Phase 1)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = Boolean(VITE_DEV_SERVER_URL);
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' ws: http: https:;"
      : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https: http:;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    });
  });

  // Récupération de l'état système précédent en cas de crash intempestif
  await gamingManager.recoverFromPreviousCrash();

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
  try {
    tray?.destroy();
    tray = null;
  } catch {}
  gamingManager.restorePreviousState();
  cleanupAstralFirewallRules();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    tray?.destroy();
    tray = null;
  } catch {}
  gamingManager.restorePreviousState();
  cleanupAstralFirewallRules();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in system tray on Windows if minimizeToTray is enabled
    if (!minimizeToTray) {
      try {
        tray?.destroy();
        tray = null;
      } catch {}
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

// Privileged Helper IPC (Phase 3)
ipcMain.handle('helper:get-status', async () => {
  return await executePrivilegedAction('GET_HELPER_STATUS');
});

// IPC: overlay & window control
ipcMain.handle('overlay:show', () => createOverlay());
ipcMain.handle('overlay:hide', () => destroyOverlay());
ipcMain.handle('overlay:toggle', () => toggleOverlay());
ipcMain.handle('overlay:status', () => Boolean(overlayWin));
ipcMain.handle('app:quit', () => {
  minimizeToTray = false;
  try {
    tray?.destroy();
    tray = null;
  } catch {}
  app.exit(0);
});
ipcMain.handle('app:minimize', () => mainWin?.minimize());
ipcMain.handle('app:toggle-maximize', () => {
  if (!mainWin) return false;
  if (mainWin.isMaximized()) {
    mainWin.unmaximize();
    return false;
  } else {
    mainWin.maximize();
    return true;
  }
});
ipcMain.handle('app:close', () => {
  if (minimizeToTray) {
    mainWin?.hide();
  } else {
    minimizeToTray = false;
    try {
      tray?.destroy();
      tray = null;
    } catch {}
    app.exit(0);
  }
});
ipcMain.handle('app:hide-to-tray', () => mainWin?.hide());
ipcMain.handle('app:open-external', async (_, url: string) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false };
});

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

