/**
 * Astral Vanguard - Real-Time Download Scanner & Passive USB Sentinel
 * Native Windows FileSystemWatcher on %USERPROFILE%\Downloads and custom directories.
 * Targeted file scans via Microsoft Defender (MpCmdRun.exe -ScanType 3),
 * write stabilization detection, zero polling CPU overhead, and in-memory caching.
 */

import { BrowserWindow, ipcMain, shell, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import { logger } from './logger';
import { runPowerShell } from './psHelper';

export interface DownloadScannerConfig {
  enabled: boolean;
  watchDirs: string[];
  ignoredExtensions: string[];
  showModalEvenIfSafe: boolean; // Default false (recommended)
  soundEnabled: boolean;
  usbScanEnabled: boolean;
}

export interface ScanResult {
  id: string;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  ext: string;
  status: 'safe' | 'suspect' | 'threat';
  threatName?: string;
  isUnsigned?: boolean;
  scanDurationMs: number;
  timestamp: string;
}

const TEMP_DOWNLOAD_EXTS = new Set([
  '.crdownload', // Chrome, Edge, Brave, Opera
  '.part',       // Firefox
  '.opdownload', // Opera
  '.tmp',        // Windows / Browser Temp
  '.download',   // Generic
  '.partial',    // Generic
]);

const DEFAULT_IGNORED_EXTS = [
  '.txt', '.log', '.md',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
  '.mp3', '.wav', '.flac', '.aac', '.ogg',
  '.mp4', '.mkv', '.avi', '.mov', '.webm',
  '.pdf',
];

function getConfigPath(): string {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'AstralVanguard', 'scanner_config.json');
}

function getDefaultDownloadsDir(): string {
  const userProfile = process.env.USERPROFILE || os.homedir();
  const def = path.join(userProfile, 'Downloads');
  if (fs.existsSync(def)) return def;
  return path.join(os.homedir(), 'Downloads');
}

function loadConfig(): DownloadScannerConfig {
  const configPath = getConfigPath();
  const defaultConfig: DownloadScannerConfig = {
    enabled: true,
    watchDirs: [getDefaultDownloadsDir()],
    ignoredExtensions: DEFAULT_IGNORED_EXTS,
    showModalEvenIfSafe: false, // Default recommended: non-intrusive
    soundEnabled: true,
    usbScanEnabled: true,
  };

  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        ...defaultConfig,
        ...data,
        watchDirs: Array.isArray(data.watchDirs) && data.watchDirs.length > 0 ? data.watchDirs : defaultConfig.watchDirs,
      };
    }
  } catch (err: any) {
    logger.warn('[DownloadScanner] Could not read scanner_config.json, using defaults:', err.message);
  }
  return defaultConfig;
}

function saveConfig(cfg: DownloadScannerConfig) {
  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err: any) {
    logger.error('[DownloadScanner] Failed to save scanner_config.json:', err.message);
  }
}

/**
 * Resolves the path to MpCmdRun.exe across Windows 10 and 11
 */
function getMpCmdRunPath(): string {
  const defaultPath = path.join(
    process.env.ProgramFiles || 'C:\\Program Files',
    'Windows Defender',
    'MpCmdRun.exe'
  );
  if (fs.existsSync(defaultPath)) return defaultPath;

  const platformDir = path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'Microsoft',
    'Windows Defender',
    'Platform'
  );
  if (fs.existsSync(platformDir)) {
    try {
      const subdirs = fs.readdirSync(platformDir).sort().reverse();
      for (const sub of subdirs) {
        const candidate = path.join(platformDir, sub, 'MpCmdRun.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {}
  }
  return defaultPath;
}

// In-memory cache to prevent duplicate scans
const scannedCache = new Map<string, { result: ScanResult; timestamp: number }>();

// Active native watchers map
const activeWatchers = new Map<string, fs.FSWatcher>();

// Pending stabilization files set to avoid duplicate queues
const pendingStabilization = new Set<string>();

let currentConfig: DownloadScannerConfig = loadConfig();
let activeMainWindow: BrowserWindow | null = null;
let usbWatchInterval: NodeJS.Timeout | null = null;
const knownRemovableDrives = new Set<string>();

/**
 * Waits until file write is completely finished and file is closed
 */
async function waitForFileStabilization(filePath: string, maxWaitMs = 20000): Promise<boolean> {
  const start = Date.now();
  let lastSize = -1;
  let stableReadings = 0;

  while (Date.now() - start < maxWaitMs) {
    if (!fs.existsSync(filePath)) return false;

    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 0 && stat.size === lastSize) {
        stableReadings++;
        // If file size remained identical across 2 checks, verify write lock is released
        if (stableReadings >= 2) {
          try {
            const fd = fs.openSync(filePath, 'r');
            fs.closeSync(fd);
            return true;
          } catch {
            // Still locked by browser
            stableReadings = 0;
          }
        }
      } else {
        stableReadings = 0;
        lastSize = stat.size;
      }
    } catch {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  return fs.existsSync(filePath);
}

/**
 * Executes targeted scan of a single file using MpCmdRun.exe
 */
export async function scanSingleFile(filePath: string): Promise<ScanResult> {
  const id = Date.now().toString() + Math.random().toString().slice(2, 6);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(filePath).size;
  } catch {}

  const startTime = Date.now();
  logger.info(`[DownloadScanner] Initiating targeted Defender scan on: ${filePath} (${Math.round(sizeBytes / 1024)} KB)`);

  const mpCmdRun = getMpCmdRunPath();

  return new Promise<ScanResult>((resolve) => {
    const proc = cp.spawn(mpCmdRun, ['-Scan', '-ScanType', '3', '-File', filePath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    // 25 second timeout safeguard
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch {}
    }, 25000);

    proc.on('close', async (code) => {
      clearTimeout(timeout);
      const scanDurationMs = Date.now() - startTime;
      const combinedOutput = `${stdout}\n${stderr}`.toLowerCase();

      logger.info(`[DownloadScanner] Scan completed in ${scanDurationMs}ms (exit code ${code})`);

      // Code 2 or threat detected
      if (code === 2 || combinedOutput.includes('threats detected') || combinedOutput.includes('found threats')) {
        let threatName = 'Menace détectée par Windows Defender';
        const match = stdout.match(/Threat\s*:\s*([^\r\n]+)/i);
        if (match && match[1]) {
          threatName = match[1].trim();
        }

        const res: ScanResult = {
          id,
          filePath,
          fileName,
          sizeBytes,
          ext,
          status: 'threat',
          threatName,
          scanDurationMs,
          timestamp: new Date().toISOString(),
        };
        return resolve(res);
      }

      // Check double-extension masquerade (e.g. report.pdf.exe)
      const baseWithoutExt = path.parse(path.parse(filePath).name).ext;
      const isMasqueraded = ['.pdf', '.png', '.jpg', '.doc', '.xlsx', '.mp4'].includes(baseWithoutExt.toLowerCase());

      // Executables signature check
      let isUnsigned = false;
      let isSuspect = isMasqueraded;

      if (['.exe', '.msi', '.bat', '.cmd', '.ps1', '.vbs', '.scr', '.dll'].includes(ext)) {
        try {
          const sigCheck = await runPowerShell(
            `(Get-AuthenticodeSignature -FilePath "${filePath.replace(/"/g, '`"')}").Status`,
            { timeout: 4000 }
          );
          const sigStatus = (sigCheck.stdout || '').trim();
          if (sigStatus !== 'Valid') {
            isUnsigned = true;
            if (isMasqueraded || ext === '.scr' || ext === '.vbs') {
              isSuspect = true;
            }
          }
        } catch {}
      }

      const status: ScanResult['status'] = isSuspect ? 'suspect' : 'safe';
      const res: ScanResult = {
        id,
        filePath,
        fileName,
        sizeBytes,
        ext,
        status,
        threatName: isSuspect ? 'Exécutable suspect / Non vérifié' : undefined,
        isUnsigned,
        scanDurationMs,
        timestamp: new Date().toISOString(),
      };
      resolve(res);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      logger.warn('[DownloadScanner] Error spawning MpCmdRun:', err.message);
      resolve({
        id,
        filePath,
        fileName,
        sizeBytes,
        ext,
        status: 'safe',
        scanDurationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    });
  });
}

/**
 * Handles a newly created or renamed file event in a watched folder
 */
async function handleFileEvent(folderPath: string, filename: string) {
  if (!currentConfig.enabled) return;
  if (!filename) return;

  const filePath = path.join(folderPath, filename);
  const ext = path.extname(filename).toLowerCase();

  // 1. Ignore temporary download chunks
  if (TEMP_DOWNLOAD_EXTS.has(ext)) return;
  if (filename.startsWith('.') || filename.startsWith('~') || filename.startsWith('Unconfirmed ')) return;

  // 2. Ignore configured ignored extensions (.txt, .jpg, etc.)
  const ignored = currentConfig.ignoredExtensions.map((e) => e.toLowerCase().trim());
  if (ignored.includes(ext)) {
    return;
  }

  // Prevent multiple simultaneous queues for the same file
  if (pendingStabilization.has(filePath)) return;
  pendingStabilization.add(filePath);

  try {
    // 3. Wait for file write stabilization
    const stabilized = await waitForFileStabilization(filePath);
    if (!stabilized || !fs.existsSync(filePath)) {
      return;
    }

    // 4. Check cache by path + mtime + size
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) return;
    } catch {
      return;
    }

    const cacheKey = `${filePath}:${stat.mtimeMs}:${stat.size}`;
    const cached = scannedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      logger.info(`[DownloadScanner] File ${filename} already verified recently, skipping.`);
      return;
    }

    // 5. Notify renderer of scan starting
    if (activeMainWindow && !activeMainWindow.isDestroyed()) {
      activeMainWindow.webContents.send('download-scanner:scan-start', {
        filePath,
        fileName: filename,
        sizeBytes: stat.size,
        ext,
      });
    }

    // 6. Execute targeted scan
    const result = await scanSingleFile(filePath);

    // Save in cache
    scannedCache.set(cacheKey, { result, timestamp: Date.now() });

    // 7. Send scan result to renderer
    if (activeMainWindow && !activeMainWindow.isDestroyed()) {
      // Determine if modal should be shown:
      // - ALWAYS if threat or suspect
      // - IF safe: only if showModalEvenIfSafe is enabled
      const shouldDisplayModal =
        result.status === 'threat' ||
        result.status === 'suspect' ||
        currentConfig.showModalEvenIfSafe;

      activeMainWindow.webContents.send('download-scanner:scan-complete', {
        ...result,
        shouldDisplayModal,
        soundEnabled: currentConfig.soundEnabled,
      });

      // If threat detected, trigger high-priority notification toast
      if (result.status === 'threat') {
        activeMainWindow.webContents.send('notification:trigger', {
          type: 'threat',
          title: '🚨 Menace détectée dans un téléchargement',
          message: `Fichier dangereux identifié : ${filename} (${result.threatName || 'Malware'}). Mise en quarantaine recommandée.`,
          critical: true,
        });
      } else if (result.status === 'suspect') {
        activeMainWindow.webContents.send('notification:trigger', {
          type: 'info',
          title: '⚠️ Téléchargement suspect non signé',
          message: `Fichier : ${filename}. Aucun certificat valide détecté.`,
          critical: false,
        });
      }
    }
  } finally {
    pendingStabilization.delete(filePath);
  }
}

/**
 * Initializes or updates directory watchers
 */
function updateWatchers() {
  // Close existing watchers
  for (const [dir, watcher] of activeWatchers.entries()) {
    try {
      watcher.close();
    } catch {}
    activeWatchers.delete(dir);
  }

  if (!currentConfig.enabled) {
    logger.info('[DownloadScanner] Real-time scanner is disabled.');
    return;
  }

  for (const dir of currentConfig.watchDirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }

    if (fs.existsSync(dir)) {
      try {
        const watcher = fs.watch(dir, { recursive: false }, (eventType, filename) => {
          if (filename) {
            handleFileEvent(dir, filename.toString()).catch((err) => {
              logger.warn(`[DownloadScanner] Error handling file event on ${filename}:`, err.message);
            });
          }
        });

        watcher.on('error', (err) => {
          logger.warn(`[DownloadScanner] Watcher error on directory ${dir}:`, err.message);
        });

        activeWatchers.set(dir, watcher);
        logger.info(`[DownloadScanner] Watching folder: ${dir}`);
      } catch (err: any) {
        logger.error(`[DownloadScanner] Failed to attach watcher to ${dir}:`, err.message);
      }
    }
  }
}

/**
 * Passive & Discreet USB Sentinel:
 * Detects plugged USB removable drives and performs silent root check
 */
function setupUsbSentinel() {
  if (usbWatchInterval) {
    clearInterval(usbWatchInterval);
    usbWatchInterval = null;
  }

  if (!currentConfig.usbScanEnabled || !currentConfig.enabled) return;

  // Initial populate of existing removable drives
  runPowerShell(
    `Get-CimInstance -ClassName Win32_LogicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 2 } | Select-Object -ExpandProperty DeviceID`,
    { timeout: 3000 }
  ).then((res) => {
    const drives = (res.stdout || '').split(/\r?\n/).map((d) => d.trim()).filter(Boolean);
    drives.forEach((d) => knownRemovableDrives.add(d.toUpperCase()));
  });

  // Check every 12 seconds with minimal resource usage
  usbWatchInterval = setInterval(async () => {
    if (!currentConfig.usbScanEnabled || !currentConfig.enabled) return;
    try {
      const res = await runPowerShell(
        `Get-CimInstance -ClassName Win32_LogicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 2 } | Select-Object -ExpandProperty DeviceID`,
        { timeout: 3000 }
      );
      const currentDrives = (res.stdout || '')
        .split(/\r?\n/)
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);

      for (const drive of currentDrives) {
        if (!knownRemovableDrives.has(drive)) {
          knownRemovableDrives.add(drive);
          logger.info(`[UsbSentinel] New USB drive connected: ${drive}`);

          // Trigger discreet notification
          if (activeMainWindow && !activeMainWindow.isDestroyed()) {
            activeMainWindow.webContents.send('notification:trigger', {
              type: 'info',
              title: '🔌 Support amovible connecté',
              message: `Lecteur ${drive} détecté. Analyse passive de sécurité en cours...`,
              critical: false,
            });
          }

          // Scan root for autorun.inf or suspicious executables
          const autorunPath = path.join(drive, 'autorun.inf');
          if (fs.existsSync(autorunPath)) {
            logger.warn(`[UsbSentinel] autorun.inf detected on USB drive ${drive}! Scanning...`);
            scanSingleFile(autorunPath).then((scanRes) => {
              if (activeMainWindow && !activeMainWindow.isDestroyed()) {
                activeMainWindow.webContents.send('download-scanner:scan-complete', {
                  ...scanRes,
                  shouldDisplayModal: true,
                  soundEnabled: currentConfig.soundEnabled,
                });
              }
            });
          }
        }
      }

      // Cleanup removed drives from memory
      for (const known of Array.from(knownRemovableDrives)) {
        if (!currentDrives.includes(known)) {
          knownRemovableDrives.delete(known);
        }
      }
    } catch {}
  }, 12000);
}

export function setupDownloadScannerIPC(win: BrowserWindow) {
  activeMainWindow = win;

  // Start watching configured directories
  updateWatchers();
  setupUsbSentinel();

  // ── Get Config ───────────────────────────────────────────────────────────
  ipcMain.handle('download-scanner:get-config', () => {
    return { success: true, config: currentConfig };
  });

  // ── Save Config ──────────────────────────────────────────────────────────
  ipcMain.handle('download-scanner:save-config', (_, newConfig: Partial<DownloadScannerConfig>) => {
    currentConfig = { ...currentConfig, ...newConfig };
    saveConfig(currentConfig);
    updateWatchers();
    setupUsbSentinel();
    logger.info('[DownloadScanner] Configuration updated successfully.');
    return { success: true, config: currentConfig };
  });

  // ── Select Custom Directory Dialog ───────────────────────────────────────
  ipcMain.handle('download-scanner:select-folder', async () => {
    if (!win) return { success: false };
    const res = await dialog.showOpenDialog(win, {
      title: 'Sélectionner un dossier à surveiller',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (!res.canceled && res.filePaths.length > 0) {
      return { success: true, folderPath: res.filePaths[0] };
    }
    return { success: false };
  });

  // ── Trigger Manual Single File Scan ──────────────────────────────────────
  ipcMain.handle('download-scanner:scan-file', async (_, targetPath: string) => {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Fichier introuvable.' };
    }
    const result = await scanSingleFile(targetPath);
    return { success: true, result };
  });

  // ── Action: Delete File ──────────────────────────────────────────────────
  ipcMain.handle('download-scanner:delete-file', async (_, targetPath: string) => {
    logger.info(`[DownloadScanner] Deleting infected/suspicious file: ${targetPath}`);
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        return { success: true, message: 'Fichier supprimé définitivement.' };
      }
      return { success: false, error: 'Fichier introuvable ou déjà supprimé.' };
    } catch (err: any) {
      // If permission denied, attempt elevated PowerShell delete
      try {
        const res = await runPowerShell(
          `Remove-Item -Path "${targetPath.replace(/"/g, '`"')}" -Force -ErrorAction Stop`
        );
        if (res.success) {
          return { success: true, message: 'Fichier supprimé avec succès.' };
        }
      } catch {}
      logger.error(`[DownloadScanner] Failed to delete file ${targetPath}:`, err.message);
      return { success: false, error: `Erreur lors de la suppression : ${err.message}` };
    }
  });

  // ── Action: Quarantine File ──────────────────────────────────────────────
  ipcMain.handle('download-scanner:quarantine-file', async (_, targetPath: string) => {
    logger.info(`[DownloadScanner] Quarantining file: ${targetPath}`);
    try {
      if (!fs.existsSync(targetPath)) {
        return { success: false, error: 'Fichier introuvable.' };
      }
      const quarantineDir = path.join(
        process.env.APPDATA || 'C:\\',
        'AstralVanguard',
        'quarantine'
      );
      if (!fs.existsSync(quarantineDir)) {
        fs.mkdirSync(quarantineDir, { recursive: true });
      }

      const dest = path.join(
        quarantineDir,
        `${Date.now()}_${path.basename(targetPath)}.vanguard_locked`
      );
      fs.renameSync(targetPath, dest);

      return {
        success: true,
        message: 'Fichier isolé et placé dans le dossier de quarantaine sécurisé de Vanguard.',
        quarantinePath: dest,
      };
    } catch (err: any) {
      logger.error(`[DownloadScanner] Quarantine failed for ${targetPath}:`, err.message);
      return { success: false, error: `Échec de la mise en quarantaine : ${err.message}` };
    }
  });

  // ── Action: Open File Location in Windows Explorer ────────────────────────
  ipcMain.handle('download-scanner:open-folder', (_, targetPath: string) => {
    try {
      if (fs.existsSync(targetPath)) {
        shell.showItemInFolder(targetPath);
        return { success: true };
      }
      return { success: false, error: 'Fichier introuvable.' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
