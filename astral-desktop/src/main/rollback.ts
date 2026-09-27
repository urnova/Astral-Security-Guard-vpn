import { BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const execPromise = util.promisify(exec);

interface RollbackEntry {
  id: string;
  timestamp: string;
  description: string;
  type: 'system-restore' | 'registry-backup' | 'file-backup';
  data?: string; // path to backup or restore point ID
}

const ROLLBACK_DIR = path.join(app.getPath('userData'), 'rollback');

function ensureDir() {
  if (!fs.existsSync(ROLLBACK_DIR)) fs.mkdirSync(ROLLBACK_DIR, { recursive: true });
}

export function setupRollbackIPC(win: BrowserWindow) {
  // ── Create System Restore Point ───────────────────────────────────────────
  ipcMain.handle('rollback:create-restore-point', async (_, description: string) => {
    try {
      await execPromise(`powershell -Command "
        Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue
        Checkpoint-Computer -Description 'Astral Vanguard: ${description}' -RestorePointType 'MODIFY_SETTINGS'
      "`);

      const entry: RollbackEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        description,
        type: 'system-restore',
      };

      saveEntry(entry);
      return { success: true, entry };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // ── Backup Registry Keys ──────────────────────────────────────────────────
  ipcMain.handle('rollback:backup-registry', async (_, keys: string[], description: string) => {
    try {
      ensureDir();
      const id = Date.now().toString();
      const backupPath = path.join(ROLLBACK_DIR, `registry_${id}.reg`);

      for (const key of keys) {
        await execPromise(`reg export "${key}" "${backupPath}.part" /y`).catch(() => {});
      }

      const entry: RollbackEntry = {
        id,
        timestamp: new Date().toISOString(),
        description,
        type: 'registry-backup',
        data: backupPath,
      };

      saveEntry(entry);
      return { success: true, entry };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // ── List Rollback Entries ─────────────────────────────────────────────────
  ipcMain.handle('rollback:list', () => {
    try {
      const entries = loadEntries();
      return { success: true, entries: entries.reverse() };
    } catch {
      return { success: true, entries: [] };
    }
  });

  // ── Restore From Point ────────────────────────────────────────────────────
  ipcMain.handle('rollback:restore', async (_, entryId: string) => {
    try {
      const entries = loadEntries();
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return { success: false, error: 'Entrée introuvable' };

      if (entry.type === 'system-restore') {
        // Trigger system restore (requires UAC)
        await execPromise(`powershell -Command "
          Start-Process 'rstrui.exe' -Verb RunAs
        "`);
        return { success: true, message: 'Fenêtre de restauration système ouverte.' };
      } else if (entry.type === 'registry-backup' && entry.data) {
        await execPromise(`reg import "${entry.data}"`);
        return { success: true };
      }

      return { success: false, error: 'Type de restauration non supporté' };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // ── List Windows Restore Points ───────────────────────────────────────────
  ipcMain.handle('rollback:list-system', async () => {
    try {
      const { stdout } = await execPromise(`powershell -Command "
        Get-ComputerRestorePoint | Select-Object Description,CreationTime,SequenceNumber | ConvertTo-Json
      "`);
      let points = [];
      try { points = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(points)) points = [points];
      return { success: true, points };
    } catch {
      return { success: true, points: [] };
    }
  });
}

function saveEntry(entry: RollbackEntry) {
  ensureDir();
  const logPath = path.join(ROLLBACK_DIR, 'log.json');
  const entries = loadEntries();
  entries.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}

function loadEntries(): RollbackEntry[] {
  ensureDir();
  const logPath = path.join(ROLLBACK_DIR, 'log.json');
  if (!fs.existsSync(logPath)) return [];
  try { return JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch { return []; }
}
