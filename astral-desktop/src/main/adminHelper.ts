import { app } from 'electron';
import cp from 'child_process';
import os from 'os';
import { runPowerShell } from './psHelper';
import { logger } from './logger';

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
export function isAdmin(): boolean {
  if (cachedIsAdmin !== null) return cachedIsAdmin;
  try {
    const res = cp.spawnSync('net', ['session'], { windowsHide: true, stdio: 'ignore' });
    cachedIsAdmin = res.status === 0;
  } catch {
    cachedIsAdmin = false;
  }
  return cachedIsAdmin;
}

export async function checkIsAdmin(): Promise<boolean> {
  return isAdmin();
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

export const getWindowsVersion = getWindowsBuildInfo;

const TASK_NAME = 'AstralVanguard_Elevated';

/**
 * Ensures the persistent elevated scheduled task is registered.
 * Similar to Wallpaper Engine / Razer Synapse architecture:
 * Once elevated rights are granted, registering this task allows
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
    const script = `
      schtasks /create /tn "${TASK_NAME}" /tr "\`"${exePath.replace(/"/g, '`"')}\`"" /sc ONLOGON /rl HIGHEST /f 2>$null
    `;
    const res = await runPowerShell(script, { timeout: 4000 });
    logger.info(`[Admin] Persistent admin task registered: ${res.success}`);
    return res.success;
  } catch (err: any) {
    logger.warn('[Admin] Failed to register persistent admin task:', err.message);
    return false;
  }
}

/**
 * Relaunches current executable with UAC prompt (RunAs).
 */
export async function relaunchElevated(): Promise<void> {
  logger.info('[UAC] Requesting elevated relaunch via Start-Process RunAs...');
  const exePath = app.getPath('exe');

  // Try launching via existing elevated scheduled task first (zero UAC)
  try {
    const checkTask = await runPowerShell(`schtasks /query /tn "${TASK_NAME}" 2>$null`, { timeout: 2500 });
    if (checkTask.success && checkTask.stdout && checkTask.stdout.includes(TASK_NAME)) {
      logger.info('[UAC] Launching elevated via registered scheduled task (zero UAC)...');
      await runPowerShell(`schtasks /run /tn "${TASK_NAME}"`, { timeout: 3000 });
      app.exit(0);
      return;
    }
  } catch {}

  const script = `
    Start-Process -FilePath "${exePath.replace(/"/g, '`"')}" -Verb RunAs
  `;

  await runPowerShell(script).catch(() => {});
  app.exit(0);
}
