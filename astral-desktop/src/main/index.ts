import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { isAdmin, getWindowsBuildInfo, relaunchElevated, ensurePersistentAdminTask, getAdminPrivilegeRecord } from './adminHelper';
import { setupAutoUpdater } from './updater';
import { setupSecurityIPC } from './security';
import { setupVpnIPC, cleanupAstralFirewallRules, performVpnConnect, performVpnDisconnect, isVpnConnected, getActiveVpnNodeName } from './vpn';
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
let gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // If this launch was triggered by an auto-update restart, allow a brief retry window
  const isUpdateRestart = process.argv.some(arg => arg.includes('--updated') || arg.includes('--update-restart'));
  if (isUpdateRestart) {
    logger.info('[App] Update restart detected. Waiting for terminating instance to release mutex...');
    const cp = require('child_process');
    for (let i = 0; i < 8; i++) {
      try {
        cp.spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 250'], { windowsHide: true });
      } catch {}
      gotSingleInstanceLock = app.requestSingleInstanceLock();
      if (gotSingleInstanceLock) {
        logger.info('[App] Single-instance lock acquired successfully after waiting.');
        break;
      }
    }
  }
  if (!gotSingleInstanceLock) {
    logger.info('[App] Another instance of Vanguard Core is already running. Quitting duplicate instance.');
    app.quit();
    process.exit(0);
  }
}

// Set Application User Model ID for Windows toast notifications & taskbar grouping
app.setAppUserModelId('com.astral.vanguardcore');

process.env.DIST = path.join(__dirname, '../..');
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = loadPreferences().minimizeToTray;
let isQuitting = false;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];


import { showAvastStyleToast } from './notificationWindow';

// ── Avast-Style & Native Windows Notification Dispatcher ─────────────────────
export function notifyUser(
  title: string,
  body: string,
  options?: {
    isCritical?: boolean;
    type?: 'info' | 'threat' | 'gaming' | 'success' | 'network' | 'ping' | 'stability' | 'vpn' | 'performance' | 'security';
    soundEnabled?: boolean;
    volume?: number;
  } | boolean
) {
  let isCritical = false;
  let notifType: 'info' | 'threat' | 'gaming' | 'success' | 'network' | 'ping' | 'stability' | 'vpn' | 'performance' | 'security' = 'info';

  if (typeof options === 'boolean') {
    isCritical = options;
    notifType = isCritical ? 'threat' : 'info';
  } else if (options && typeof options === 'object') {
    isCritical = Boolean(options.isCritical);
    notifType = options.type || (isCritical ? 'threat' : 'info');
  }

  const prefs = loadPreferences();
  if (prefs.notificationsEnabled === false) return;

  const soundEnabled = prefs.soundEnabled ?? true;
  const volume = typeof (prefs as any).soundVolume === 'number' ? (prefs as any).soundVolume / 100 : 0.8;

  let desktopToastShown = false;
  try {
    showAvastStyleToast({
      title,
      message: body,
      type: notifType,
      soundEnabled,
      volume,
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

  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('notification:trigger', {
      type: notifType,
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
    title: 'Vanguard Core',
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
  setupVpnIPC(mainWin, (opts) => updateTrayState(opts));
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
    setupAutoUpdater(mainWin, () => {
      logger.info('[App] Preparing clean shutdown for update installation...');
      isQuitting = true;
      minimizeToTray = false;
      try {
        tray?.destroy();
        tray = null;
      } catch {}
      try {
        app.releaseSingleInstanceLock();
        logger.info('[App] Released single-instance mutex ahead of installer execution.');
      } catch (err: any) {
        logger.warn('[App] Error releasing single instance lock:', err?.message);
      }
      try {
        cleanupAstralFirewallRules();
      } catch {}
    });
    startGameDetection(mainWin, () => overlayWin, setOverlayWin);

    // Check elevation and broadcast status
    const admin = isAdmin();
    const osInfo = getWindowsBuildInfo();
    logger.info(`[App] Running with admin rights: ${admin}, OS: ${osInfo.edition} (${osInfo.buildNumber})`);
    
    if (admin) {
      ensurePersistentAdminTask().catch((err) => {
        logger.warn('[App] ensurePersistentAdminTask error:', err);
      });
    } else {
      const record = getAdminPrivilegeRecord();
      if (!record && app.isPackaged) {
        logger.info('[App] First run without administrator privileges: requesting initial UAC elevation...');
        relaunchElevated();
      }
    }
    mainWin.webContents.send('admin:status', {
      isAdmin: admin,
      isPersistent: Boolean(admin || getAdminPrivilegeRecord()?.granted),
      osInfo,
    });
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
    if (minimizeToTray && !isQuitting) {
      e.preventDefault();
      mainWin?.hide();
    }
  });
}

// ── Gaming Overlay ────────────────────────────────────────────────────────────
function setOverlayWin(w: BrowserWindow | null) {
  overlayWin = w;
}

let hudEnabled = false;

function broadcastHudState() {
  const payload = { active: hudEnabled, enabled: hudEnabled };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('hud:state-changed', payload);
      win.webContents.send('overlay:state-changed', payload);
    }
  }
}

export function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return;
  logger.info('[App] Creating gaming HUD overlay window...');
  overlayWin = new BrowserWindow({
    width: 360,
    height: 38,
    x: 32,
    y: 32,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
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
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');

  overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlayWin.webContents.on('will-navigate', (e) => e.preventDefault());
  overlayWin.webContents.on('will-redirect', (e) => e.preventDefault());

  if (VITE_DEV_SERVER_URL) {
    overlayWin.loadURL(`${VITE_DEV_SERVER_URL}#/overlay`);
  } else {
    overlayWin.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/overlay' });
  }

  hudEnabled = true;
  broadcastHudState();

  overlayWin.on('closed', () => {
    overlayWin = null;
    hudEnabled = false;
    broadcastHudState();
  });
}

export function destroyOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.close();
    overlayWin = null;
  }
  hudEnabled = false;
  broadcastHudState();
}

export function toggleOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) {
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
      label: `⚡ Vanguard Core v${currentAppVersion} (Bêta)`,
      enabled: false,
    },
    {
      label: 'Ouvrir Vanguard Core',
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
            performVpnConnect('Paris · Core Alpha #1', mainWin ?? undefined);
          },
        },
        {
          label: '🇩🇪 Francfort · DE-CIX Ultra (15ms)',
          click: () => {
            performVpnConnect('Francfort · DE-CIX Ultra', mainWin ?? undefined);
          },
        },
        {
          label: '🇳🇱 Amsterdam · AMS-IX Gigabit (17ms)',
          click: () => {
            performVpnConnect('Amsterdam · AMS-IX Gigabit', mainWin ?? undefined);
          },
        },
        {
          label: '🇨🇭 Zurich · Bunker Privacy (22ms)',
          click: () => {
            performVpnConnect('Zurich · Bunker Privacy', mainWin ?? undefined);
          },
        },
        {
          label: '🇺🇸 New York · NYIIX Core (86ms)',
          click: () => {
            performVpnConnect('New York · NYIIX Core', mainWin ?? undefined);
          },
        },
        { type: 'separator' },
        {
          label: '🔴 Déconnecter le VPN',
          enabled: trayVpnConnected,
          click: () => {
            performVpnDisconnect(mainWin ?? undefined);
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
      label: 'Quitter Définitivement Vanguard Core',
      click: () => {
        minimizeToTray = false;
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip('Vanguard Core');
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
  isQuitting = true;
  minimizeToTray = false;
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
  const admin = isAdmin();
  const record = getAdminPrivilegeRecord();
  return {
    isAdmin: admin,
    isPersistent: Boolean(admin || record?.granted),
    grantedAt: record?.grantedAt || null,
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
ipcMain.handle('hud:get-state', () => ({ active: hudEnabled, enabled: hudEnabled }));
ipcMain.handle('hud:toggle', () => {
  toggleOverlay();
  return { active: hudEnabled, enabled: hudEnabled };
});
ipcMain.handle('hud:set-state', (_event, enabled: boolean) => {
  if (enabled) createOverlay();
  else destroyOverlay();
  return { active: hudEnabled, enabled: hudEnabled };
});
ipcMain.on('overlay:set-ignore-mouse-events', (_event, ignore: boolean, options?: any) => {
  try {
    overlayWin?.setIgnoreMouseEvents(ignore, options);
  } catch {}
});
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
ipcMain.handle('notification:test', (_, payload: any) => {
  const title = payload?.title || 'Vanguard Protection';
  const body = payload?.body || 'Test de notification réussi.';
  const type = payload?.type || 'info';
  notifyUser(title, body, { type });
  return { success: true };
});

ipcMain.handle('notification:send', (_, payload: any) => {
  const title = payload?.title || 'Vanguard Protection';
  const body = payload?.body || '';
  const critical = Boolean(payload?.critical);
  const type = payload?.type || (critical ? 'threat' : 'info');
  notifyUser(title, body, { isCritical: critical, type });
  return { success: true };
});

