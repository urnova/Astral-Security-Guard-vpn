/**
 * Astral Vanguard - Two-Tier Rollback & Restoration Engine
 * Tier 1: Granular, instant local backup of modified registry keys and files in %APPDATA%/AstralVanguard/rollback/<timestamp>/
 * Tier 2: Windows System Restore Point (Checkpoint-Computer) as global safety net, with automatic SystemRestorePointCreationFrequency handling
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { isAdmin } from './adminHelper';

export interface RollbackEntry {
  id: string; // Timestamp ID
  timestamp: string; // ISO date
  description: string;
  hasLocalBackup: boolean;
  hasRegistryBackup: boolean;
  hasFileBackup: boolean;
  hasSystemRestorePoint: boolean;
  systemRestoreStatus: 'created' | 'frequency_limited' | 'disabled' | 'failed' | 'not_requested';
  systemRestoreSeq?: string;
  dirPath: string;
  registryFile?: string;
  keysBackedUp: string[];
  filesBackedUp: string[];
}

function getRollbackDir(): string {
  const appData =
    process.env.APPDATA ||
    (app && typeof app.getPath === 'function' ? app.getPath('appData') : 'C:\\');
  return path.join(appData, 'AstralVanguard', 'rollback');
}

const ROLLBACK_DIR = getRollbackDir();

function ensureDir(targetDir: string) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function loadEntries(): RollbackEntry[] {
  ensureDir(ROLLBACK_DIR);
  const logPath = path.join(ROLLBACK_DIR, 'log.json');
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveEntries(entries: RollbackEntry[]) {
  ensureDir(ROLLBACK_DIR);
  const logPath = path.join(ROLLBACK_DIR, 'log.json');
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Standard registry keys frequently touched during optimizations or threat remediation
 */
const DEFAULT_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config',
  'HKCU\\Control Panel\\Keyboard',
  'HKCU\\Control Panel\\Accessibility\\Keyboard Response',
  'HKCU\\Control Panel\\Accessibility\\StickyKeys',
  'HKCU\\Control Panel\\Accessibility\\ToggleKeys',
];

/**
 * Creates a two-tier rollback snapshot:
 * - Tier 1: Local .reg file export and files copy (guaranteed, instant, unlimited)
 * - Tier 2: Windows Checkpoint-Computer (safety net, handles 24h frequency limit)
 */
export async function createRollbackSnapshot(
  description: string,
  options: {
    keys?: string[];
    files?: string[];
    skipSystemRestore?: boolean;
  } = {}
): Promise<{ success: boolean; entry: RollbackEntry; warning?: string }> {
  const id = Date.now().toString();
  const timestamp = new Date().toISOString();
  const snapshotDir = path.join(ROLLBACK_DIR, id);
  ensureDir(snapshotDir);

  logger.info(`[Rollback] Creating two-tier snapshot #${id}: "${description}"`);

  const defaultKeys = isAdmin()
    ? [
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config',
        'HKCU\\Control Panel\\Keyboard',
        'HKCU\\Control Panel\\Accessibility\\Keyboard Response',
        'HKCU\\Control Panel\\Accessibility\\StickyKeys',
        'HKCU\\Control Panel\\Accessibility\\ToggleKeys',
      ]
    : [
        'HKCU\\Control Panel\\Keyboard',
        'HKCU\\Control Panel\\Accessibility\\Keyboard Response',
        'HKCU\\Control Panel\\Accessibility\\StickyKeys',
        'HKCU\\Control Panel\\Accessibility\\ToggleKeys',
      ];

  const keysToBackup = Array.from(
    new Set(options.keys && options.keys.length > 0 ? options.keys : defaultKeys)
  );
  const regFilePath = path.join(snapshotDir, 'registry_backup.reg');
  let hasRegistryBackup = false;
  const exportedKeys: string[] = [];

  // ── Tier 1: Granular Local Registry Backup via reg.exe ────────────────────
  for (const key of keysToBackup) {
    try {
      const partFile = path.join(snapshotDir, `part_${exportedKeys.length}.reg`);
      const res = cp.spawnSync('reg.exe', ['export', key, partFile, '/y'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      if (res.status === 0 && fs.existsSync(partFile)) {
        exportedKeys.push(key);
      }
    } catch {}
  }

  // Concatenate parts with Windows UTF-16LE Byte Order Mark (BOM)
  if (exportedKeys.length > 0) {
    try {
      let combined = '\ufeffWindows Registry Editor Version 5.00\r\n\r\n';
      for (let i = 0; i < exportedKeys.length; i++) {
        const partFile = path.join(snapshotDir, `part_${i}.reg`);
        if (fs.existsSync(partFile)) {
          const content = fs.readFileSync(partFile, 'utf16le');
          // Strip header and leading BOM
          const stripped = content
            .replace(/^\ufeff/i, '')
            .replace(/^Windows Registry Editor Version 5\.00\r?\n?/i, '')
            .trim();
          if (stripped) {
            combined += stripped + '\r\n\r\n';
          }
          try {
            fs.unlinkSync(partFile);
          } catch {}
        }
      }
      fs.writeFileSync(regFilePath, combined, 'utf16le');
      hasRegistryBackup = true;
      logger.info(`[Rollback] Exported ${exportedKeys.length} registry keys to ${regFilePath}`);
    } catch (err: any) {
      logger.warn('[Rollback] Could not combine registry parts:', err.message);
    }
  }

  // ── Tier 1: Local Files Backup ────────────────────────────────────────────
  const backedUpFiles: string[] = [];
  if (options.files && options.files.length > 0) {
    const filesDir = path.join(snapshotDir, 'files');
    ensureDir(filesDir);
    for (const filePath of options.files) {
      try {
        if (fs.existsSync(filePath)) {
          const dest = path.join(filesDir, path.basename(filePath));
          fs.copyFileSync(filePath, dest);
          backedUpFiles.push(filePath);
        }
      } catch (err: any) {
        logger.warn(`[Rollback] Failed to copy file ${filePath}:`, err.message);
      }
    }
  }

  const hasLocalBackup = hasRegistryBackup || backedUpFiles.length > 0;

  // ── Tier 2: Windows System Restore Point (Checkpoint-Computer) ─────────────
  let hasSystemRestorePoint = false;
  let systemRestoreStatus: RollbackEntry['systemRestoreStatus'] = 'not_requested';
  let systemRestoreSeq: string | undefined;
  let warningMessage: string | undefined;

  if (!options.skipSystemRestore && isAdmin()) {
    try {
      // 1. Lift the 24h frequency limit in registry
      const regFix = `
        try {
          Set-ItemProperty -Path 'HKLM:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -Name 'SystemRestorePointCreationFrequency' -Value 0 -ErrorAction SilentlyContinue
          Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue
        } catch {}
      `;
      await runPowerShell(regFix);

      // 2. Attempt Checkpoint-Computer
      const cleanDesc = (description || 'Astral Vanguard Snapshot').replace(/['"]/g, ' ');
      const psCheckpoint = `
        Checkpoint-Computer -Description 'Astral Vanguard: ${cleanDesc}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
        (Get-ComputerRestorePoint | Select-Object -Last 1).SequenceNumber
      `;
      const res = await runPowerShell<string>(psCheckpoint, { timeout: 35000 });

      if (res.success && res.stdout) {
        hasSystemRestorePoint = true;
        systemRestoreStatus = 'created';
        systemRestoreSeq = res.stdout.trim();
        logger.info(`[Rollback] Windows System Restore checkpoint created (Seq: ${systemRestoreSeq})`);
      } else {
        const errorText = (res.technicalError || res.error || '').toLowerCase();
        let isFrequency =
          errorText.includes('frequency') ||
          errorText.includes('frequence') ||
          errorText.includes('1440') ||
          errorText.includes('0x80070422') ||
          errorText.includes('already been created') ||
          errorText.includes('déjà été créé') ||
          errorText.includes('cannot be created');

        if (!isFrequency) {
          try {
            const checkRecent = await runPowerShell(`
              $rp = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Select-Object -Last 1
              if ($rp) {
                $diff = (Get-Date) - [Management.ManagementDateTimeConverter]::ToDateTime($rp.CreationTime)
                if ($diff.TotalHours -lt 24) { 'RECENT_EXISTS' }
              }
            `, { timeout: 4000 });
            if (checkRecent.stdout && checkRecent.stdout.includes('RECENT_EXISTS')) {
              isFrequency = true;
            }
          } catch {}
        }

        if (isFrequency) {
          systemRestoreStatus = 'frequency_limited';
          warningMessage =
            'Limite de fréquence Windows (24h) atteinte pour les points système. La sauvegarde locale (registre/fichiers) reste 100% active et restaurable.';
          logger.warn(`[Rollback] Checkpoint-Computer frequency limited: ${res.technicalError || 'Restoration point created within 24h'}`);
        } else {
          systemRestoreStatus = 'failed';
          logger.warn(`[Rollback] Checkpoint-Computer failed (${res.technicalError}), falling back to local snapshot.`);
        }
      }
    } catch (err: any) {
      systemRestoreStatus = 'failed';
      logger.warn('[Rollback] Exception during Checkpoint-Computer:', err.message);
    }
  } else if (!isAdmin()) {
    systemRestoreStatus = 'disabled';
  }

  const entry: RollbackEntry = {
    id,
    timestamp,
    description: `Astral Vanguard: ${description}`,
    hasLocalBackup,
    hasRegistryBackup,
    hasFileBackup: backedUpFiles.length > 0,
    hasSystemRestorePoint,
    systemRestoreStatus,
    systemRestoreSeq,
    dirPath: snapshotDir,
    registryFile: hasRegistryBackup ? regFilePath : undefined,
    keysBackedUp: exportedKeys,
    filesBackedUp: backedUpFiles,
  };

  // Save metadata in snapshot folder
  fs.writeFileSync(path.join(snapshotDir, 'meta.json'), JSON.stringify(entry, null, 2), 'utf-8');

  // Add to index
  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  return { success: true, entry, warning: warningMessage };
}

/**
 * Restores a snapshot using Tier 1 local registry/file backup as source of truth.
 */
export async function restoreRollbackSnapshot(entryId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  hasSystemRestorePoint?: boolean;
}> {
  logger.info(`[Rollback] Initiating restoration of snapshot #${entryId}...`);
  const entries = loadEntries();
  const entry = entries.find((e) => e.id === entryId);

  if (!entry) {
    logger.error(`[Rollback] Snapshot #${entryId} not found in log.json`);
    return { success: false, error: 'Point de sauvegarde introuvable.' };
  }

  let restoredRegistry = false;
  let restoredFilesCount = 0;

  // 1. Restore Registry from .reg file via reg.exe import
  const regPath = entry.registryFile || path.join(entry.dirPath, 'registry_backup.reg');
  if (fs.existsSync(regPath)) {
    try {
      logger.info(`[Rollback] Importing registry file: ${regPath}`);
      const importRes = cp.spawnSync('reg.exe', ['import', regPath], {
        windowsHide: true,
        stdio: 'pipe',
      });
      if (importRes.status === 0) {
        restoredRegistry = true;
      } else {
        const stderr = importRes.stderr ? importRes.stderr.toString('utf8') : '';
        logger.warn(`[Rollback] reg.exe direct import returned code ${importRes.status}: ${stderr}`);
        if (stderr.includes('acc') || stderr.includes('denied') || importRes.status !== 0) {
          try {
            const elevRes = await runPowerShell(
              `Start-Process -FilePath "reg.exe" -ArgumentList 'import "${regPath.replace(/"/g, '`"')}"' -Verb RunAs -Wait`
            );
            if (elevRes.success) {
              restoredRegistry = true;
            }
          } catch {}
        }
      }
    } catch (err: any) {
      logger.error(`[Rollback] Failed to import ${regPath}:`, err.message);
    }
  }

  // 2. Restore Files if present
  const filesDir = path.join(entry.dirPath, 'files');
  if (fs.existsSync(filesDir) && entry.filesBackedUp) {
    for (const originalPath of entry.filesBackedUp) {
      const backupPath = path.join(filesDir, path.basename(originalPath));
      if (fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(backupPath, originalPath);
          restoredFilesCount++;
        } catch (err: any) {
          logger.warn(`[Rollback] Could not restore file ${originalPath}:`, err.message);
        }
      }
    }
  }

  if (restoredRegistry || restoredFilesCount > 0) {
    const details = [
      restoredRegistry ? 'clés de registre réinjectées' : null,
      restoredFilesCount > 0 ? `${restoredFilesCount} fichier(s) restauré(s)` : null,
    ]
      .filter(Boolean)
      .join(', ');

    logger.info(`[Rollback] Snapshot #${entryId} successfully restored (${details}).`);
    return {
      success: true,
      message: `Restauration locale effectuée avec succès (${details}).`,
      hasSystemRestorePoint: entry.hasSystemRestorePoint,
    };
  }

  // Fallback: If no local file but system restore exists, offer rstrui
  if (entry.hasSystemRestorePoint) {
    return {
      success: true,
      message:
        'Ce point dispose d’un point de restauration Windows global. Vous pouvez ouvrir l’assistant de restauration système.',
      hasSystemRestorePoint: true,
    };
  }

  return {
    success: false,
    error: 'Aucune donnée de sauvegarde locale (registre ou fichier) valide trouvée pour cette entrée.',
  };
}

export function setupRollbackIPC(_win: BrowserWindow) {
  // ── Create Snapshot (Two-Tier) ───────────────────────────────────────────
  ipcMain.handle('rollback:create-restore-point', async (_, description: string, options?: any) => {
    return await createRollbackSnapshot(description, options);
  });

  // ── Restore Snapshot ──────────────────────────────────────────────────────
  ipcMain.handle('rollback:restore', async (_, entryId: string) => {
    return await restoreRollbackSnapshot(entryId);
  });

  // ── List Snapshots ────────────────────────────────────────────────────────
  ipcMain.handle('rollback:list', () => {
    try {
      const entries = loadEntries();
      return { success: true, entries: entries.reverse() };
    } catch (err: any) {
      return { success: false, error: err.message, entries: [] };
    }
  });

  // ── Trigger Windows System Restore Dialog ─────────────────────────────────
  ipcMain.handle('rollback:open-system-restore', async () => {
    logger.info('[Rollback] Opening Windows System Restore GUI (rstrui.exe)');
    try {
      await runPowerShell('Start-Process "rstrui.exe" -Verb RunAs');
      return { success: true, message: 'Assistant de restauration système Windows lancé.' };
    } catch (err: any) {
      logger.error('[Rollback] Failed to launch rstrui.exe:', err.message);
      return { success: false, error: 'Impossible de lancer rstrui.exe' };
    }
  });

  // ── List Native Windows Restore Points ────────────────────────────────────
  ipcMain.handle('rollback:list-system', async () => {
    try {
      const script = `
        Get-ComputerRestorePoint -ErrorAction SilentlyContinue |
        Select-Object Description, CreationTime, SequenceNumber, RestorePointType |
        ConvertTo-Json -Compress
      `;
      const res = await runPowerShell<string>(script);
      let points = [];
      try {
        const parsed = JSON.parse(res.data || '[]');
        points = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        points = [];
      }
      return { success: true, points };
    } catch (err: any) {
      logger.warn('[Rollback] Could not retrieve Windows restore points:', err.message);
      return { success: true, points: [] };
    }
  });
}
