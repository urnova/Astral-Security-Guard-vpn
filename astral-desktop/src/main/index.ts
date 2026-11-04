import { lifecycleOrchestrator } from './lifecycle';
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { isAdmin, getWindowsBuildInfo, relaunchElevated, ensurePersistentAdminTask, getAdminPrivilegeRecord } from './adminHelper';
import { setupAutoUpdater } from './updater';
import { setupSecurityIPC } from './security';
import { setupVpnIPC, performVpnConnect, performVpnDisconnect, isVpnConnected, getActiveVpnNodeName } from './vpn';
import { setupPerformanceIPC } from './performance';
import { setupNetworkIPC } from './network';
import { setupGamingIPC, startGameDetection } from './gaming';
import { gamingManager } from './gamingManager';
import { setupRollbackIPC } from './rollback';
import { setupDoctorIPC, executeSosPing } from './doctor';
import { setupDownloadScannerIPC, stopDownloadScanner } from './downloadScanner';
import { communityVpnEngine } from './communityVpnEngine';
import { setupProfileIPC, loadPreferences, savePreferences } from './profile';
import { executePrivilegedAction } from './privilegedHelper';
import { startMaintenanceScheduler, stopMaintenanceScheduler } from './maintenanceScheduler';
import { VaultManager } from './vault/vaultManager';
import { registerVaultIpc } from './vault/vaultIpc';
import { notificationManager, setupNotificationIPC, NotificationCategory, NotificationSeverity } from './notificationManager';

let lastVaultIsOpen = false;
export const vaultManager = new VaultManager({
  onStatusChanged: (status) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('vault:status-changed', status);
    }
    updateTrayState({ vaultOpen: status.isOpen, vaultConfigured: Boolean(status.vaultRoot) });
    if (!status.isOpen && lastVaultIsOpen) {
      notificationManager.emit({
        category: 'vault',
        severity: 'info',
        title: 'Coffre Vanguard verrouillé',
        message: 'Le coffre local a été verrouillé pour préserver la sécurité de vos données.',
        dedupKey: 'vault-autolocked',
        actionTarget: { tab: 'vault' },
      });
    }
    lastVaultIsOpen = status.isOpen;
  },
});

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

// Permit Web Audio autoplay in transparent popups and background windows without requiring user gestures
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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

// ── Avast-Style & Native Windows Notification Dispatcher (Centralized) ────────
export function notifyUser(
  title: string,
  body: string,
  options?: {
    isCritical?: boolean;
    type?: 'info' | 'threat' | 'gaming' | 'success' | 'network' | 'ping' | 'stability' | 'vpn' | 'performance' | 'security';
    soundEnabled?: boolean;
    volume?: number;
    category?: NotificationCategory;
    actionTarget?: { tab: 'dashboard' | 'security' | 'performance' | 'gaming' | 'network' | 'vpn' | 'vault' | 'settings' };
  } | boolean
) {
  let isCritical = false;
  let notifType: 'info' | 'threat' | 'gaming' | 'success' | 'network' | 'ping' | 'stability' | 'vpn' | 'performance' | 'security' = 'info';
  let category: NotificationCategory = 'system';
  let actionTarget = undefined;

  if (typeof options === 'boolean') {
    isCritical = options;
    notifType = isCritical ? 'threat' : 'info';
    category = isCritical ? 'security' : 'system';
  } else if (options && typeof options === 'object') {
    isCritical = Boolean(options.isCritical);
    notifType = options.type || (isCritical ? 'threat' : 'info');
    if (options.category) {
      category = options.category;
    } else {
      if (['threat', 'security'].includes(notifType)) category = 'security';
      else if (['vpn'].includes(notifType)) category = 'vpn';
      else if (['network', 'ping', 'stability'].includes(notifType)) category = 'network';
      else if (['performance'].includes(notifType)) category = 'maintenance';
      else if (['gaming'].includes(notifType)) category = 'system';
      else category = 'system';
    }
    actionTarget = options.actionTarget;
  }

  const severity: NotificationSeverity = isCritical ? 'critical' : (['threat'].includes(notifType) ? 'alert' : 'info');

  notificationManager.emit({
    category,
    severity,
    title,
    message: body,
    actionTarget,
  });
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
  setupNotificationIPC(mainWin);
  setupSecurityIPC(mainWin, notifyUser);
  setupVpnIPC(mainWin, (opts) => updateTrayState(opts), notifyUser);
  setupPerformanceIPC(mainWin, notifyUser);
  setupNetworkIPC(mainWin);
  setupGamingIPC(mainWin, () => overlayWin);
  setupRollbackIPC(mainWin);
  setupDoctorIPC(mainWin);
  setupDownloadScannerIPC(mainWin);
  setupProfileIPC();
  registerVaultIpc(vaultManager);

  // M2: Start the automated maintenance scheduler after all IPC handlers are registered
  startMaintenanceScheduler(mainWin, notifyUser);

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
    setupAutoUpdater(mainWin, async () => {
      logger.info('[App] Preparing clean shutdown for update installation...');
      isQuitting = true;
      minimizeToTray = false;
      try {
        const shutdownRes = await gracefulShutdown({ skipAppQuit: true, forceExitTimeoutMs: 6000 });
        if (!shutdownRes.success || !shutdownRes.vaultClosed || !shutdownRes.vpnDisconnected) {
          logger.warn('[App] Shutdown ordonné incomplet pour mise à jour :', shutdownRes);
          return {
            success: false,
            error: 'Opérations sensibles (Vault ou VPN) non confirmées closes.',
            details: shutdownRes,
          };
        }
      } catch (err: any) {
        logger.warn('[App] Error during graceful shutdown for updater:', err?.message);
        return { success: false, error: err?.message };
      }
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
      return { success: true };
    });
    startGameDetection(mainWin, () => overlayWin, setOverlayWin);

    // Check elevation and broadcast status
    const admin = isAdmin();
    const osInfo = getWindowsBuildInfo();
    logger.info(`[App] Running with admin rights: ${admin}, OS: ${osInfo.edition} (${osInfo.buildNumber})`);
    
    if (!admin) {
      logger.info('[App] Running with standard user privileges. Advanced actions will prompt elevation on demand.');
    }
    mainWin.webContents.send('admin:status', {
      isAdmin: admin,
      isPersistent: false,
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
    if (minimizeToTray && !lifecycleOrchestrator.getIsQuitting()) {
      e.preventDefault();
      mainWin?.hide();
    } else if (!lifecycleOrchestrator.isShutdownCompleted()) {
      e.preventDefault();
      gracefulShutdown();
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
let trayVaultOpen = false;
let trayVaultConfigured = false;

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
  vaultOpen?: boolean;
  vaultConfigured?: boolean;
}) {
  if (opts.gamingActive !== undefined) trayGamingActive = opts.gamingActive;
  if (opts.realTimeShield !== undefined) trayRealTimeShield = opts.realTimeShield;
  if (opts.vpnConnected !== undefined) trayVpnConnected = opts.vpnConnected;
  if (opts.vpnNodeName !== undefined) trayVpnNodeName = opts.vpnNodeName;
  if (opts.vaultOpen !== undefined) trayVaultOpen = opts.vaultOpen;
  if (opts.vaultConfigured !== undefined) trayVaultConfigured = opts.vaultConfigured;

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
      label: `⚡ Vanguard Core v${currentAppVersion}`,
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
          label: `Protection Defender : ${trayRealTimeShield ? 'Active' : 'Attention requise'}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: '🔍 Lancer une analyse rapide',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('navigation:go-to', 'security');
            mainWin?.webContents.send('action:trigger-scan');
          },
        },
        {
          label: 'Ouvrir le module Sécurité',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('navigation:go-to', 'security');
          },
        },
      ],
    },
    {
      label: '🔒 Vanguard Vault',
      submenu: [
        {
          label: `Statut : ${trayVaultOpen ? 'Coffre déverrouillé' : (trayVaultConfigured ? 'Coffre verrouillé' : 'Aucun coffre actif')}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Ouvrir Vanguard Vault',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('navigation:go-to', 'vault');
          },
        },
        ...(trayVaultOpen ? [{
          label: '🔒 Verrouiller le Coffre',
          click: async () => {
            try {
              await vaultManager.lockVault();
            } catch (err: any) {
              logger.warn('[Tray] Erreur lors du verrouillage du coffre :', err?.message);
            }
          },
        }] : []),
      ],
    },
    {
      label: '🌐 Vanguard VPN',
      submenu: [
        {
          label: `Statut : ${trayVpnConnected ? `Connecté (${trayVpnNodeName || 'Relais actif'})` : 'Déconnecté'}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Ouvrir le module VPN',
          click: () => {
            showAndFocus();
            mainWin?.webContents.send('navigation:go-to', 'vpn');
          },
        },
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
      label: '🚀 Centre de Maintenance',
      click: () => {
        showAndFocus();
        mainWin?.webContents.send('navigation:go-to', 'performance');
      },
    },
    {
      label: `🎮 Afficher / masquer le HUD : ${hudEnabled ? 'Affiché' : 'Masqué'} (Ctrl+Shift+O)`,
      click: () => toggleOverlay(),
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
      label: 'Quitter Vanguard Core',
      click: () => {
        gracefulShutdown();
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

lifecycleOrchestrator.registerHandlers({
  stopScheduler: () => stopMaintenanceScheduler(),
  stopScanner: () => stopDownloadScanner(),
  disconnectVpn: () => communityVpnEngine.disconnect(),
  closeVault: () => vaultManager.shutdown(),
  restoreGaming: () => gamingManager.restorePreviousState(),
  destroyTray: () => { tray?.destroy(); tray = null; },
  destroyOverlay: () => destroyOverlay(),
});

export const gracefulShutdown = (options?: { forceExitTimeoutMs?: number; skipAppQuit?: boolean }) =>
  lifecycleOrchestrator.gracefulShutdown(options);

app.on('before-quit', (e) => {
  if (!lifecycleOrchestrator.isShutdownCompleted()) {
    e.preventDefault();
    isQuitting = true;
    minimizeToTray = false;
    gracefulShutdown();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    tray?.destroy();
    tray = null;
  } catch {}
  gamingManager.restorePreviousState();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in system tray on Windows if minimizeToTray is enabled
    if (!minimizeToTray && !lifecycleOrchestrator.isShutdownCompleted()) {
      gracefulShutdown();
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

ipcMain.handle('admin:relaunch-elevated', async () => {
  logger.info('[App] User requested elevated relaunch');
  const result = await relaunchElevated();
  return result;
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
  // Return state AFTER the toggle, not the pre-change value
  const newState = { active: hudEnabled, enabled: hudEnabled };
  return newState;
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
ipcMain.handle('app:quit', async () => {
  await gracefulShutdown();
  return { success: true };
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
ipcMain.handle('app:close', async () => {
  if (minimizeToTray) {
    mainWin?.hide();
  } else {
    minimizeToTray = false;
    await gracefulShutdown();
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

