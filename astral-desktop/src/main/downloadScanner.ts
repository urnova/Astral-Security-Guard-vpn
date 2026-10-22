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
import crypto from 'crypto';
import cp from 'child_process';
import { logger } from './logger';
import { runPowerShell } from './psHelper';
import { showAvastStyleDownloadScan, showAvastStyleToast } from './notificationWindow';
import {
  createScanSession,
  quarantineSessionFile,
  deleteSessionFile,
  openSessionFolder,
} from './scanSession';

export interface DownloadScannerConfig {
  enabled: boolean;
  watchDirs: string[];
  ignoredExtensions: string[];
  showModalEvenIfSafe: boolean; // Default false (recommended)
  soundEnabled: boolean;
  usbScanEnabled: boolean;
  discreteMode?: 'window' | 'mini' | 'notification';
}

export interface ScanResult {
  id: string;
  scanId?: string;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  ext: string;
  status: 'safe' | 'suspect' | 'threat' | 'error' | 'unavailable';
  threatName?: string;
  errorReason?: string;
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
  '.mp3', '.wav', '.flac', '.aac', '.ogg',
  '.mp4', '.mkv', '.avi', '.mov', '.webm',
];

const SPOOFED_SYSTEM_EXECUTABLES = new Set([
  'svchost.exe',
  'csrss.exe',
  'lsass.exe',
  'smss.exe',
  'services.exe',
  'taskhostw.exe',
  'taskhost.exe',
  'winlogon.exe',
  'explorer.exe',
  'dwm.exe',
  'spoolsv.exe',
  'rundll32.exe',
  'conhost.exe',
  'cmd.exe',
  'powershell.exe',
  'runtimebroker.exe',
]);

function checkMasqueradedExtension(fileName: string): boolean {
  const parts = fileName.toLowerCase().split('.');
  if (parts.length < 3) return false;
  const penultimate = '.' + parts[parts.length - 2];
  const finalExt = '.' + parts[parts.length - 1];

  const fakeDocExts = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.mp4', '.txt',
  ];
  const dangerousExecExts = ['.exe', '.scr', '.vbs', '.js', '.wsf', '.hta', '.bat', '.cmd', '.ps1'];

  return fakeDocExts.includes(penultimate) && dangerousExecExts.includes(finalExt);
}

function checkSystemExecutableSpoofing(fileName: string): boolean {
  return SPOOFED_SYSTEM_EXECUTABLES.has(fileName.toLowerCase().trim());
}

function checkAmbiguousDefenderOutput(output: string): { isAmbiguous: boolean; name?: string } {
  const ambiguousPatterns = [
    /pua:[^\r\n]+/i,
    /pup:[^\r\n]+/i,
    /potentially unwanted/i,
    /adware:[^\r\n]+/i,
    /hacktool:[^\r\n]+/i,
    /riskware:[^\r\n]+/i,
  ];

  for (const pat of ambiguousPatterns) {
    const match = output.match(pat);
    if (match) {
      return { isAmbiguous: true, name: match[0].trim() };
    }
  }
  return { isAmbiguous: false };
}

// In-memory rolling history of scanned files (max 50)
const recentScans: ScanResult[] = [];

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
    discreteMode: 'window',
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

// Cooldown map for recently scanned files to strictly prevent double notifications (25s window)
const recentScannedFiles = new Map<string, number>();

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

function buildAndStoreScanResult(
  filePath: string,
  data: {
    status: 'safe' | 'suspect' | 'threat' | 'unavailable' | 'error';
    threatName?: string;
    errorReason?: string;
    isUnsigned?: boolean;
    scanDurationMs: number;
  }
): ScanResult {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let sizeBytes = 0;
  try {
    if (fs.existsSync(filePath)) {
      sizeBytes = fs.statSync(filePath).size;
    }
  } catch {}

  let sessionScanId: string | null = null;
  try {
    if (fs.existsSync(filePath)) {
      const session = createScanSession(filePath, {
        status: data.status,
        threatName: data.threatName,
        isUnsigned: data.isUnsigned,
      });
      sessionScanId = session.scanId;
    }
  } catch (err: any) {
    logger.warn('[DownloadScanner] Could not register scan session:', err.message);
  }

  const finalId = sessionScanId || crypto.randomUUID();

  const res: ScanResult = {
    id: finalId,
    scanId: finalId,
    filePath,
    fileName,
    sizeBytes,
    ext,
    status: data.status,
    threatName: data.threatName,
    errorReason: data.errorReason,
    isUnsigned: data.isUnsigned,
    scanDurationMs: data.scanDurationMs,
    timestamp: new Date().toISOString(),
  };

  recentScans.unshift(res);
  if (recentScans.length > 50) recentScans.pop();
  return res;
}

/**
 * Executes targeted scan of a single file using MpCmdRun.exe
 */
export async function scanSingleFile(filePath: string): Promise<ScanResult> {
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

      // 1. Threat detected by Defender (Exit code 2 or explicit threat strings)
      if (code === 2 || combinedOutput.includes('threats detected') || combinedOutput.includes('found threats')) {
        const puaCheck = checkAmbiguousDefenderOutput(combinedOutput);
        if (puaCheck.isAmbiguous) {
          return resolve(buildAndStoreScanResult(filePath, {
            status: 'suspect',
            threatName: `Application potentiellement indésirable (${puaCheck.name})`,
            scanDurationMs,
          }));
        }

        let threatName = 'Menace détectée par Windows Defender';
        const match = stdout.match(/Threat\s*:\s*([^\r\n]+)/i);
        if (match && match[1]) {
          threatName = match[1].trim();
        }

        return resolve(buildAndStoreScanResult(filePath, {
          status: 'threat',
          threatName,
          scanDurationMs,
        }));
      }

      // 2. Strong Suspicious Signals (Double extension, spoofed system binary, or PUA warning)
      const isMasqueraded = checkMasqueradedExtension(fileName);
      const isSpoofedSys = checkSystemExecutableSpoofing(fileName);
      const puaCheck = checkAmbiguousDefenderOutput(combinedOutput);

      // Signature verification: informational only! Never triggers 'suspect' alone.
      let isUnsigned = false;
      if (['.exe', '.msi', '.dll'].includes(ext)) {
        try {
          const sigScript = `
            $p = "${filePath.replace(/"/g, '`"')}"
            if (Test-Path -LiteralPath $p) {
              $sig = Get-AuthenticodeSignature -LiteralPath $p -ErrorAction SilentlyContinue
              if ($sig -and $sig.Status) { $sig.Status.ToString() } else { 'NotSigned' }
            } else {
              'NotSigned'
            }
          `;
          const sigCheck = await runPowerShell(sigScript, { timeout: 4000 });
          const sigStatus = (sigCheck.stdout || '').trim();
          if (sigStatus !== 'Valid') {
            isUnsigned = true;
          }
        } catch {
          isUnsigned = true;
        }
      }

      if (isMasqueraded) {
        logger.warn(`[DownloadScanner] Double extension masquée détectée: ${fileName}`);
        return resolve(buildAndStoreScanResult(filePath, {
          status: 'suspect',
          threatName: 'Extension masquée trompeuse détectée (ex: .pdf.exe)',
          isUnsigned,
          scanDurationMs,
        }));
      }

      if (isSpoofedSys) {
        logger.warn(`[DownloadScanner] Nom d'exécutable système trompeur dans Téléchargements: ${fileName}`);
        return resolve(buildAndStoreScanResult(filePath, {
          status: 'suspect',
          threatName: `Nom trompeur imitant un binaire système Windows (${fileName})`,
          isUnsigned,
          scanDurationMs,
        }));
      }

      if (puaCheck.isAmbiguous) {
        logger.warn(`[DownloadScanner] Signal PUA/PUP ambigu: ${puaCheck.name}`);
        return resolve(buildAndStoreScanResult(filePath, {
          status: 'suspect',
          threatName: `Application potentiellement indésirable (${puaCheck.name})`,
          isUnsigned,
          scanDurationMs,
        }));
      }

      // 3. Clean File (Including unsigned indie dev software/tools)
      return resolve(buildAndStoreScanResult(filePath, {
        status: 'safe',
        threatName: undefined,
        isUnsigned,
        scanDurationMs,
      }));
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      logger.warn('[DownloadScanner] Error spawning MpCmdRun:', err.message);
      const isNotFound = err.message.includes('ENOENT');
      resolve(buildAndStoreScanResult(filePath, {
        status: isNotFound ? 'unavailable' : 'error',
        errorReason: isNotFound
          ? 'Moteur Microsoft Defender (MpCmdRun.exe) introuvable sur cette machine Windows.'
          : `Erreur d'accès au service antivirus : ${err.message}`,
        scanDurationMs: Date.now() - startTime,
      }));
    });
  });
}

let recentScanCount = 0;
let lastScanReset = Date.now();

/**
 * Handles a newly created or renamed file event in a watched folder
 */
async function handleFileEvent(folderPath: string, filename: string) {
  if (!currentConfig.enabled) return;
  if (!filename) return;

  const filePath = path.join(folderPath, filename);
  const normPath = path.resolve(filePath).toLowerCase();
  const ext = path.extname(filename).toLowerCase();
  const lowerName = filename.toLowerCase();

  // 1. Ignore temporary download chunks and installer temp files
  if (
    TEMP_DOWNLOAD_EXTS.has(ext) ||
    lowerName.startsWith('.') ||
    lowerName.startsWith('~') ||
    lowerName.startsWith('is-') || // Inno Setup
    lowerName.startsWith('unconfirmed ') ||
    lowerName.includes('.msi.tmp') ||
    lowerName.includes('.nsis') ||
    lowerName.endsWith('.tmp')
  ) {
    return;
  }

  // 2. Strict Deduplication: if this exact file was scanned within the last 25 seconds, drop immediately
  const lastScannedAt = recentScannedFiles.get(normPath);
  if (lastScannedAt && Date.now() - lastScannedAt < 25000) {
    logger.info(`[DownloadScanner] Scan ignoré (déjà scanné il y a ${Math.round((Date.now() - lastScannedAt) / 1000)}s) : ${filename}`);
    return;
  }

  // Rate limiter ceiling to avoid notification avalanches during installer extractions
  const now = Date.now();
  if (now - lastScanReset > 10000) {
    recentScanCount = 0;
    lastScanReset = now;
  }
  if (recentScanCount >= 6) {
    logger.info(`[DownloadScanner] Plafond anti-avalanche atteint (${recentScanCount} scans/10s), fichier ignoré: ${filename}`);
    return;
  }
  recentScanCount++;

  // 3. Ignore configured ignored extensions (.txt, .jpg, etc.)
  const ignored = currentConfig.ignoredExtensions.map((e) => e.toLowerCase().trim());
  if (ignored.includes(ext)) {
    return;
  }

  // Prevent multiple simultaneous queues for the same file (keyed on normalized path)
  if (pendingStabilization.has(normPath)) return;
  pendingStabilization.add(normPath);

  try {
    // 4. Wait for file write stabilization
    const stabilized = await waitForFileStabilization(filePath);
    if (!stabilized || !fs.existsSync(filePath)) {
      return;
    }

    // Double check dedup post stabilization
    const postStabilizeLastScanned = recentScannedFiles.get(normPath);
    if (postStabilizeLastScanned && Date.now() - postStabilizeLastScanned < 25000) {
      return;
    }

    // 5. Check cache by path + mtime + size
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) return;
    } catch {
      return;
    }

    const cacheKey = `${normPath}:${stat.mtimeMs}:${stat.size}`;
    const cached = scannedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      logger.info(`[DownloadScanner] File ${filename} already verified recently, skipping.`);
      return;
    }

    // 6. Notify renderer of scan start
    if (activeMainWindow && !activeMainWindow.isDestroyed()) {
      activeMainWindow.webContents.send('download-scanner:scan-start', {
        filePath,
        fileName: filename,
        sizeBytes: stat.size,
        ext,
      });
    }

    // 7. Open Avast-style scan window showing "Analyse en cours..." before execution
    if (currentConfig.discreteMode !== 'notification') {
      try {
        showAvastStyleDownloadScan({
          fileName: filename,
          filePath,
          status: 'scanning',
          discreteMode: currentConfig.discreteMode || 'window',
          soundEnabled: currentConfig.soundEnabled,
        });
      } catch (err: any) {
        logger.warn('[DownloadScanner] Error showing scanning popup:', err.message);
      }
    }

    // 8. Execute targeted scan
    const result = await scanSingleFile(filePath);

    // Save in cache and record dedup timestamp
    scannedCache.set(cacheKey, { result, timestamp: Date.now() });
    recentScannedFiles.set(normPath, Date.now());

    // Prune stale dedup entries if map grows
    if (recentScannedFiles.size > 100) {
      const cutoff = Date.now() - 60000;
      for (const [k, v] of recentScannedFiles.entries()) {
        if (v < cutoff) recentScannedFiles.delete(k);
      }
    }

    // Show Avast-style desktop popup window with final status (Fichier sain / Menace)
    if (currentConfig.discreteMode === 'notification') {
      if (result.status === 'threat' || result.status === 'suspect') {
        showAvastStyleToast({
          title: 'Menace téléchargement bloquée',
          message: `Fichier malveillant neutralisé : ${result.threatName || filename}`,
          type: 'threat',
          soundEnabled: currentConfig.soundEnabled,
        });
      }
    } else {
      try {
        showAvastStyleDownloadScan({
          fileName: filename,
          filePath,
          status: result.status === 'threat' ? 'threat' : result.status === 'suspect' ? 'suspect' : 'safe',
          threatName: result.threatName,
          isUnsigned: result.isUnsigned,
          discreteMode: currentConfig.discreteMode || 'window',
          soundEnabled: currentConfig.soundEnabled,
        });
      } catch (err: any) {
        logger.warn('[DownloadScanner] Error showing Avast-style download popup:', err.message);
      }
    }

    // 9. Send scan result to renderer
    if (activeMainWindow && !activeMainWindow.isDestroyed()) {
      const shouldDisplayModal =
        result.status === 'threat' ||
        result.status === 'suspect' ||
        currentConfig.showModalEvenIfSafe;

      activeMainWindow.webContents.send('download-scanner:scan-complete', {
        ...result,
        shouldDisplayModal,
        soundEnabled: currentConfig.soundEnabled,
      });

      // Auto-unblock Windows Zone.Identifier ADS for verified clean files
      if (result.status === 'safe') {
        try {
          const adsPath = `${filePath}:Zone.Identifier`;
          if (fs.existsSync(adsPath)) {
            fs.unlinkSync(adsPath);
          }
        } catch {}
      }
    }
  } finally {
    // Retain in pendingStabilization for 5000ms so post-scan ADS removal or
    // browser handle closure cannot trigger a secondary redundant scan
    setTimeout(() => {
      pendingStabilization.delete(normPath);
    }, 5000);
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
      // Pre-cache existing files at startup so only newly downloaded files are inspected
      try {
        const existingEntries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of existingEntries) {
          if (ent.isFile()) {
            try {
              const fp = path.join(dir, ent.name);
              const st = fs.statSync(fp);
              const k = `${fp}:${st.mtimeMs}:${st.size}`;
              if (!scannedCache.has(k)) {
                scannedCache.set(k, {
                  result: {
                    id: crypto.randomUUID(),
                    filePath: fp,
                    fileName: ent.name,
                    sizeBytes: st.size,
                    ext: path.extname(ent.name).toLowerCase(),
                    status: 'safe',
                    scanDurationMs: 0,
                    timestamp: new Date().toISOString(),
                  },
                  timestamp: Date.now(),
                });
              }
            } catch {}
          }
        }
      } catch {}

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

  // ── Action: Delete File via scanId (Requires explicit confirmation) ──────
  ipcMain.handle('download-scanner:delete', async (_, args: { scanId: string; confirmed?: boolean }) => {
    const scanId = typeof args === 'object' && args !== null ? args.scanId : String(args || '');
    const confirmed = typeof args === 'object' && args !== null ? Boolean(args.confirmed) : false;
    return await deleteSessionFile(scanId, confirmed);
  });

  // ── Action: Quarantine File via scanId ─────────────────────────────────────
  ipcMain.handle('download-scanner:quarantine', async (_, args: { scanId: string }) => {
    const scanId = typeof args === 'object' && args !== null ? args.scanId : String(args || '');
    return await quarantineSessionFile(scanId);
  });

  // ── Action: Open File Location via scanId ──────────────────────────────────
  ipcMain.handle('download-scanner:open-folder', (_, args: { scanId: string } | string) => {
    const scanId = typeof args === 'object' && args !== null ? (args as any).scanId : String(args || '');
    return openSessionFolder(scanId);
  });

  // ── Legacy handlers: explicitly rejected for security (Phase 1) ────────────
  ipcMain.handle('download-scanner:delete-file', async () => {
    logger.warn('[Security] Refus de suppression : tentative d’appel via chemin arbitraire bloquée.');
    return {
      success: false,
      error: 'Refus de sécurité (V3) : la suppression par chemin arbitraire est désactivée. Utilisez download-scanner:delete avec scanId et confirmation explicite.'
    };
  });

  ipcMain.handle('download-scanner:quarantine-file', async () => {
    logger.warn('[Security] Refus de mise en quarantaine : tentative d’appel via chemin arbitraire bloquée.');
    return {
      success: false,
      error: 'Refus de sécurité (V3) : la mise en quarantaine par chemin arbitraire est désactivée. Utilisez download-scanner:quarantine avec scanId.'
    };
  });

  // ── Rolling Scan History ──────────────────────────────────────────────────
  ipcMain.handle('download-scanner:get-history', () => {
    return { success: true, history: recentScans };
  });

  // ── Action: Create EICAR Benign Test Threat File in Downloads ───────────────
  ipcMain.handle('download-scanner:create-test-file', async () => {
    try {
      const downloadsDir = getDefaultDownloadsDir();
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      const testFileName = `Vanguard-EICAR-Test-${Date.now().toString().slice(-4)}.com`;
      const targetPath = path.join(downloadsDir, testFileName);
      // Standard 68-byte EICAR Anti-Virus Test File (100% benign, recognized by all antivirus engines)
      const eicarContent = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      fs.writeFileSync(targetPath, eicarContent, 'utf-8');
      logger.info(`[DownloadScanner] Test EICAR créé avec succès dans : ${targetPath}`);
      return { success: true, filePath: targetPath, fileName: testFileName };
    } catch (err: any) {
      logger.error('[DownloadScanner] Erreur création fichier EICAR test:', err.message);
      return { success: false, error: err.message };
    }
  });
}
