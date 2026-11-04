import { app } from 'electron';
import cp from 'child_process';
import os from 'os';
import { runPowerShell } from './psHelper.ts';
import { logger } from './logger.ts';

export interface WindowsBuildInfo {
  edition: string;
  buildNumber: number;
  isWindows11: boolean;
}

let cachedIsAdmin: boolean | null = null;
let cachedOSInfo: WindowsBuildInfo | null = null;

/**
 * Synchronous elevation check via `net session`.
 * On Windows, `net session` returns exit code 0 if elevated, 2 if standard user.
 */
export function isAdmin(forceRefresh = false): boolean {
  if (!forceRefresh && cachedIsAdmin !== null) return cachedIsAdmin;
  try {
    const res = cp.spawnSync('net', ['session'], { windowsHide: true, stdio: 'ignore' });
    cachedIsAdmin = res.status === 0;
  } catch {
    cachedIsAdmin = false;
  }
  return cachedIsAdmin;
}

export async function checkIsAdmin(forceRefresh = false): Promise<boolean> {
  return isAdmin(forceRefresh);
}

/**
 * Detects Windows 10 vs 11 build number.
 * Windows 11 begins at build 22000.
 */
export function getWindowsBuildInfo(): WindowsBuildInfo {
  if (cachedOSInfo) return cachedOSInfo;

  const release = os.release(); // e.g. "10.0.26100" or "10.0.19045"
  const parts = release.split('.');
  const buildNumber = parts.length >= 3 ? parseInt(parts[2], 10) : 19041;
  const isWindows11 = buildNumber >= 22000;

  cachedOSInfo = {
    edition: isWindows11 ? 'Windows 11' : 'Windows 10',
    buildNumber,
    isWindows11,
  };

  logger.info(`[OS] Detected ${cachedOSInfo.edition} (Build: ${buildNumber})`);
  return cachedOSInfo;
}

import fs from 'fs';
import path from 'path';

export const getWindowsVersion = getWindowsBuildInfo;

const TASK_NAME = 'VanguardCore_Elevated';
const LEGACY_TASK_NAME = 'AstralVanguard_Elevated';

const ADMIN_MARKER_PATH = path.join(app.getPath('appData'), 'AstralVanguard', 'admin-privileges.json');

export interface AdminPrivilegeRecord {
  granted: boolean;
  grantedAt: string;
  exePath: string;
  version: number;
}

export function getAdminPrivilegeRecord(): AdminPrivilegeRecord | null {
  try {
    if (fs.existsSync(ADMIN_MARKER_PATH)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_MARKER_PATH, 'utf-8'));
      if (data && data.granted) return data;
    }
  } catch {}
  return null;
}

export function saveAdminPrivilegeRecord(exePath: string): void {
  try {
    const dir = path.dirname(ADMIN_MARKER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const record: AdminPrivilegeRecord = {
      granted: true,
      grantedAt: new Date().toISOString(),
      exePath,
      version: 1,
    };
    fs.writeFileSync(ADMIN_MARKER_PATH, JSON.stringify(record, null, 2), 'utf-8');
    logger.info('[Admin] Admin privilege record saved to file:', ADMIN_MARKER_PATH);
  } catch (err: any) {
    logger.warn('[Admin] Failed to save admin privilege record:', err.message);
  }
}

/**
 * Ensures the persistent elevated scheduled task is registered and Windows compatibility flag is set.
 * Similar to Wallpaper Engine architecture:
 * Once elevated rights are granted, registering this task and the registry flag allows
 * launching with highest administrator privileges on logon or shortcut
 * without prompting UAC repeatedly.
 */
export async function ensurePersistentAdminTask(): Promise<boolean> {
  if (!isAdmin()) return false;
  try {
    const exePath = app.getPath('exe');
    if (exePath.includes('node_modules') || exePath.includes('electron.exe')) {
      return false; // Skip in pure dev runner
    }

    // 1. Save marker file in AppData
    saveAdminPrivilegeRecord(exePath);

    // 2. Register persistent scheduled tasks (highest privilege)
    const cleanExe = exePath.replace(/"/g, '`"');
    const script = `
      schtasks /create /tn "${TASK_NAME}" /tr "\`"${cleanExe}\`"" /sc ONLOGON /rl HIGHEST /f 2>$null
      schtasks /create /tn "${LEGACY_TASK_NAME}" /tr "\`"${cleanExe}\`"" /sc ONLOGON /rl HIGHEST /f 2>$null

      # Set Windows AppCompatFlags so normal shortcut launches execute elevated
      $regHKCU = "HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers"
      if (-not (Test-Path $regHKCU)) { New-Item -Path $regHKCU -Force | Out-Null }
      Set-ItemProperty -Path $regHKCU -Name "${cleanExe}" -Value "~ RUNASADMIN" -Force | Out-Null

      $regHKLM = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers"
      if (Test-Path $regHKLM) {
        Set-ItemProperty -Path $regHKLM -Name "${cleanExe}" -Value "~ RUNASADMIN" -Force | Out-Null
      }
    `;
    const res = await runPowerShell(script, { timeout: 5000 });
    logger.info(`[Admin] Persistent admin tasks and registry flags registered: ${res.success}`);
    return res.success;
  } catch (err: any) {
    logger.warn('[Admin] Failed to register persistent admin task:', err.message);
    return false;
  }
}

/**
 * Attempts silent elevation via existing scheduled task (0 UAC prompt).
 * Returns true if the elevated task was triggered, false otherwise.
 */
export async function trySilentTaskElevation(): Promise<boolean> {
  if (isAdmin()) return false;
  try {
    const exePath = app.getPath('exe');
    if (exePath.includes('node_modules') || exePath.includes('electron.exe')) {
      return false;
    }
    // Check if task exists
    const checkTask = await runPowerShell(`schtasks /query /tn "${TASK_NAME}" 2>$null`, { timeout: 2000 });
    if (checkTask.success && checkTask.stdout && checkTask.stdout.includes(TASK_NAME)) {
      logger.info('[Admin] Triggering existing persistent scheduled task for silent elevation...');
      await runPowerShell(`schtasks /run /tn "${TASK_NAME}"`, { timeout: 3000 });
      return true;
    }
  } catch {}
  return false;
}

/**
 * Relaunches current executable with UAC prompt (RunAs) or via task.
 */
export async function relaunchElevated(): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  logger.info('[UAC] Requesting elevated relaunch...');
  const exePath = app.getPath('exe');

  // 1. Tenter d'abord la tâche planifiée existante (si déjà enregistrée)
  const silentSuccess = await trySilentTaskElevation();
  if (silentSuccess) {
    logger.info('[UAC] Silent elevation task triggered successfully. Exiting current instance.');
    app.exit(0);
    return { success: true };
  }

  // 2. Lancement interactif RunAs avec détection d'annulation utilisateur
  const script = `
    try {
      Start-Process -FilePath "${exePath.replace(/"/g, '`"')}" -Verb RunAs -ErrorAction Stop
      Write-Output "LAUNCHED"
    } catch {
      Write-Error $_ 
      exit 1
    }
  `;

  try {
    const res = await runPowerShell(script);
    if (res.success && res.stdout?.includes('LAUNCHED')) {
      logger.info('[UAC] Elevated instance spawned successfully. Closing standard instance.');
      app.exit(0);
      return { success: true };
    } else {
      logger.warn('[UAC] Elevation prompt was cancelled or failed:', res.error || res.technicalError);
      return { success: false, cancelled: true, error: res.error || 'Annulé par l\'utilisateur' };
    }
  } catch (err: any) {
    logger.warn('[UAC] Unexpected error during RunAs request:', err?.message);
    return { success: false, cancelled: true, error: err?.message };
  }
}
