/**
 * Astral Vanguard - Rollback & System Restore Module
 * Automates Windows System Restore Point creation and registry backups
 * before any aggressive system optimizations or threat removals.
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { isAdmin } from './adminHelper';

export interface RollbackEntry {
  id: string;
  timestamp: string;
  description: string;
  type: 'system-restore' | 'registry-backup';
  data?: string; // Path to backup file or sequence number
}

const ROLLBACK_DIR = path.join(app.getPath('userData'), 'rollback');

function ensureDir() {
  if (!fs.existsSync(ROLLBACK_DIR)) {
    fs.mkdirSync(ROLLBACK_DIR, { recursive: true });
  }
}

function loadEntries(): RollbackEntry[] {
  ensureDir();
  const logPath = path.join(ROLLBACK_DIR, 'log.json');
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveEntry(entry: RollbackEntry) {
  ensureDir();
  const logPath = path.join(ROLLBACK_DIR, 'log.json');
  const entries = loadEntries();
  entries.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf-8');
}

export function setupRollbackIPC(_win: BrowserWindow) {
  // ── Create System Restore Point ───────────────────────────────────────────
  ipcMain.handle('rollback:create-restore-point', async (_, description: string) => {
    logger.info(`[Rollback] Creating restore point: "${description}"`);
    if (!isAdmin()) {
      return {
        success: false,
        error: 'Privilèges administrateur requis pour créer un point de restauration système.',
      };
    }

    try {
      // 1. Ensure SystemRestore service / frequency registry allows creation
      const regFix = `
        try {
          Set-ItemProperty -Path 'HKLM:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -Name 'SystemRestorePointCreationFrequency' -Value 0 -ErrorAction SilentlyContinue
          Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue
        } catch {}
      `;
      await runPowerShell(regFix);

      // 2. Create checkpoint
      const cleanDesc = (description || 'Astral Vanguard Checkpoint').replace(/['"]/g, ' ');
      const psCommand = `
        Checkpoint-Computer -Description 'Astral Vanguard: ${cleanDesc}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
        (Get-ComputerRestorePoint | Select-Object -Last 1).SequenceNumber
      `;
      const result = await runPowerShell<number>(psCommand);

      const entry: RollbackEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        description: `Astral Vanguard: ${cleanDesc}`,
        type: 'system-restore',
        data: result.data ? String(result.data).trim() : undefined,
      };

      saveEntry(entry);
      logger.info(`[Rollback] Restore point created successfully (Seq: ${entry.data})`);
      return { success: true, entry };
    } catch (err: any) {
      logger.error('[Rollback] Failed to create restore point:', err.message);
      return {
        success: false,
        error: err.message || 'Impossible de créer le point de restauration Windows.',
      };
    }
  });

  // ── Backup Specific Registry Keys ─────────────────────────────────────────
  ipcMain.handle('rollback:backup-registry', async (_, keys: string[], description: string) => {
    logger.info(`[Rollback] Backing up registry keys: ${keys.join(', ')}`);
    try {
      ensureDir();
      const id = Date.now().toString();
      const backupPath = path.join(ROLLBACK_DIR, `reg_backup_${id}.reg`);

      for (const key of keys) {
        await runPowerShell(`reg export "${key}" "${backupPath}" /y`).catch(() => {});
      }

      const entry: RollbackEntry = {
        id,
        timestamp: new Date().toISOString(),
        description: description || 'Sauvegarde Registre',
        type: 'registry-backup',
        data: backupPath,
      };

      saveEntry(entry);
      return { success: true, entry };
    } catch (err: any) {
      logger.error('[Rollback] Failed to backup registry:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── List Vanguard Rollback Entries ────────────────────────────────────────
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
