import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { runPowerShell } from './psHelper';
import { loadPreferences, savePreferences, MaintenanceSchedule } from './profile';
import { BrowserWindow } from 'electron';
import { notificationManager } from './notificationManager';

export interface StorageCategoryScan {
  id: string; label: string; bytes: number; size: string; sizeDisplay: string;
  fileCount: number; desc: string; selected: boolean; inaccessible?: boolean;
  requiresConfirmation?: boolean;
}
export interface CleanupReport {
  success: boolean; partial?: boolean; categoriesCleaned: string[];
  deletedFilesCount: number; deletedBytes: number; skippedFilesCount: number;
  errors: string[]; observedFreeDeltaBytes: number; durationMs: number;
  freedDisplay: string; timestamp: string;
}
let isMaintenanceRunning = false;
export function isMaintenanceBusy(): boolean { return isMaintenanceRunning; }

export function getSafeDirSize(dirPath: string): { bytes: number; fileCount: number; inaccessible: boolean } {
  let bytes = 0;
  let fileCount = 0;
  let inaccessible = false;
  try {
    const root = fs.lstatSync(dirPath);
    if (root.isSymbolicLink() || !root.isDirectory()) return { bytes, fileCount, inaccessible };
  } catch (error: any) {
    return { bytes, fileCount, inaccessible: error?.code !== 'ENOENT' };
  }
  try { fs.readdirSync(dirPath); }
  catch { return { bytes, fileCount, inaccessible: true }; }
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile()) { bytes += stat.size; fileCount++; }
      } catch {}
    }
  };
  walk(dirPath);
  return { bytes, fileCount, inaccessible };
}

export function cleanSafeDir(dirPath: string, onProgress?: (filename: string) => void): {
  deletedBytes: number; deletedCount: number; skippedCount: number; errors: string[];
} {
  const result = { deletedBytes: 0, deletedCount: 0, skippedCount: 0, errors: [] as string[] };
  if (!dirPath || !path.isAbsolute(dirPath) || path.resolve(dirPath) === path.parse(path.resolve(dirPath)).root) {
    result.errors.push('Cible de nettoyage invalide.');
    return result;
  }
  try {
    const root = fs.lstatSync(dirPath);
    if (root.isSymbolicLink() || !root.isDirectory()) {
      result.errors.push('Le dossier de nettoyage doit être un répertoire local non lié.');
      return result;
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') result.errors.push(`Accès impossible au répertoire (${error?.code || 'erreur'}).`);
    return result;
  }
  const removeContents = (current: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch (error: any) { result.errors.push(`Lecture impossible (${error?.code || 'erreur'}).`); return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const stat = fs.lstatSync(full);
        // Preserve links and junctions; never traverse or delete their targets.
        if (stat.isSymbolicLink()) { result.skippedCount++; continue; }
        if (stat.isDirectory()) {
          removeContents(full);
          try { fs.rmdirSync(full); } catch { result.skippedCount++; }
        } else if (stat.isFile()) {
          onProgress?.(entry.name);
          fs.unlinkSync(full);
          result.deletedBytes += stat.size;
          result.deletedCount++;
        }
      } catch { result.skippedCount++; }
    }
  };
  removeContents(dirPath);
  return result;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Mo';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export async function analyzeStorageCategories(): Promise<StorageCategoryScan[]> {
  const userTempPath = process.env.TEMP || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local', 'Temp');
  const paths = {
    userTemp: userTempPath,
    winTemp: 'C:\\Windows\\Temp',
    winLogs: 'C:\\Windows\\Logs',
    dxCache: path.join(process.env.LOCALAPPDATA || 'C:\\', 'D3DSCache'),
  };
  const uTemp = getSafeDirSize(paths.userTemp);
  const wTemp = getSafeDirSize(paths.winTemp);
  const wLogs = getSafeDirSize(paths.winLogs);
  const dxCache = getSafeDirSize(paths.dxCache);
  let rbBytes = 0;
  let rbCount = 0;
  let rbUnavailable = true;
  try {
    const response = await runPowerShell<any>(`
      $ErrorActionPreference = 'Stop'
      $sh = New-Object -ComObject Shell.Application
      $rb = $sh.Namespace(10)
      if ($null -eq $rb) { throw 'Corbeille inaccessible' }
      $items = $rb.Items()
      $total = 0
      foreach ($i in $items) { $total += $i.Size }
      [PSCustomObject]@{ count = $items.Count; bytes = $total } | ConvertTo-Json -Compress
    `, { asJson: true, timeout: 6000 });
    if (response.success && response.data) {
      const bytes = Number(response.data.bytes);
      const count = Number(response.data.count);
      if (Number.isFinite(bytes) && bytes >= 0 && Number.isFinite(count) && count >= 0) {
        rbBytes = bytes; rbCount = count; rbUnavailable = false;
      }
    }
  } catch {}
  const category = (id: string, label: string, scan: ReturnType<typeof getSafeDirSize>, desc: string, selected: boolean): StorageCategoryScan => ({
    id, label, bytes: scan.bytes, fileCount: scan.fileCount, desc,
    size: scan.inaccessible ? 'Analyse incomplète' : formatBytes(scan.bytes),
    sizeDisplay: scan.inaccessible ? 'Analyse incomplète' : formatBytes(scan.bytes),
    selected: selected && !scan.inaccessible, inaccessible: scan.inaccessible,
  });
  return [
    category('userTemp', 'Fichiers temporaires utilisateur (%TEMP%)', uTemp, 'Fichiers temporaires de la session utilisateur.', true),
    category('winTemp', 'Fichiers temporaires système (C:\\Windows\\Temp)', wTemp, "Données temporaires du système et des installations.", wTemp.bytes > 0),
    category('winLogs', 'Journaux système (C:\\Windows\\Logs)', wLogs, 'Journaux de diagnostic Windows. Nettoyage facultatif.', false),
    { ...category('dxCache', 'Cache de shaders DirectX (D3DSCache)', dxCache, 'Cache régénéré par les applications. Le premier lancement peut être plus lent.', false), requiresConfirmation: true },
    {
      id: 'recycleBin', label: 'Corbeille Windows', bytes: rbBytes, fileCount: rbCount,
      size: rbUnavailable ? 'Analyse indisponible' : formatBytes(rbBytes),
      sizeDisplay: rbUnavailable ? 'Analyse indisponible' : rbBytes > 0 ? formatBytes(rbBytes) : 'Vide',
      desc: 'Suppression définitive du contenu de la Corbeille.', selected: false,
      inaccessible: rbUnavailable, requiresConfirmation: true,
    },
  ];
}

export async function executeStorageCleanup(
  selectedCategoryIds: string[], win?: BrowserWindow | null,
  _notifyFn?: (title: string, body: string, opts?: any) => void
): Promise<CleanupReport> {
  if (isMaintenanceRunning) throw new Error('Une opération de maintenance est déjà en cours.');
  const names: Record<string, string> = {
    userTemp: 'Fichiers temporaires utilisateur', winTemp: 'Fichiers temporaires système',
    winLogs: 'Journaux système', dxCache: 'Cache DirectX', recycleBin: 'Corbeille Windows',
  };
  if (!Array.isArray(selectedCategoryIds) || selectedCategoryIds.length === 0 ||
      selectedCategoryIds.some(id => typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(names, id))) {
    throw new Error('Sélectionnez uniquement des catégories de nettoyage reconnues.');
  }
  const selected = [...new Set(selectedCategoryIds)];
  const targets: Record<string, string> = {
    userTemp: process.env.TEMP || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local', 'Temp'),
    winTemp: 'C:\\Windows\\Temp', winLogs: 'C:\\Windows\\Logs',
    dxCache: path.join(process.env.LOCALAPPDATA || 'C:\\', 'D3DSCache'),
  };
  isMaintenanceRunning = true;
  const startTime = Date.now();
  const categoriesCleaned: string[] = [];
  const errors: string[] = [];
  let totalDeletedBytes = 0;
  let totalDeletedCount = 0;
  let totalSkippedCount = 0;
  const freeBytes = (): number | null => {
    try { const stat = fs.statfsSync('C:\\'); return Number(stat.bfree) * Number(stat.bsize); }
    catch { return null; }
  };
  const sendProgress = (percent: number, category: string, message: string) => {
    try {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('perf:maintenance-progress', { percent, category, message });
      }
    } catch (error: any) { logger.warn('[Maintenance] Progression non transmise :', error?.message); }
  };
  try {
    const before = freeBytes();
    for (let index = 0; index < selected.length; index++) {
      const id = selected[index];
      sendProgress(Math.round(index / selected.length * 100), names[id], `Nettoyage : ${names[id]}…`);
      if (id === 'recycleBin') {
        try {
          const result = await runPowerShell(`Clear-RecycleBin -Force -ErrorAction Stop`, { timeout: 15000 });
          if (result.success) categoriesCleaned.push(id);
          else errors.push('Le vidage de la Corbeille n’a pas été confirmé.');
        } catch (error: any) { errors.push(`Corbeille : ${error?.message || 'échec du vidage'}`); }
      } else {
        const result = cleanSafeDir(targets[id]);
        totalDeletedBytes += result.deletedBytes;
        totalDeletedCount += result.deletedCount;
        totalSkippedCount += result.skippedCount;
        errors.push(...result.errors.map(error => `${names[id]} : ${error}`));
        if (result.errors.length === 0) categoriesCleaned.push(id);
      }
      // Give the main process an opportunity to handle pending IPC between categories.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    const after = freeBytes();
    const partial = errors.length > 0 || totalSkippedCount > 0;
    const report: CleanupReport = {
      success: errors.length === 0, partial, categoriesCleaned,
      deletedFilesCount: totalDeletedCount, deletedBytes: totalDeletedBytes,
      skippedFilesCount: totalSkippedCount, errors,
      observedFreeDeltaBytes: before !== null && after !== null ? after - before : 0,
      durationMs: Date.now() - startTime,
      // Only counted file deletions are attributed to this operation.
      freedDisplay: formatBytes(totalDeletedBytes), timestamp: new Date().toISOString(),
    };
    if (report.success) {
      try {
        const prefs = loadPreferences();
        if (prefs.maintenanceSchedule) savePreferences({ maintenanceSchedule: { ...prefs.maintenanceSchedule, lastRun: report.timestamp } });
      } catch (error: any) { logger.warn('[Maintenance] Date non enregistrée :', error?.message); }
    }
    sendProgress(100, '', partial ? 'Nettoyage terminé avec des éléments ignorés ou des erreurs.' : 'Nettoyage terminé.');
    try {
      notificationManager.emit({
        category: 'maintenance', severity: partial ? 'warning' : 'info',
        title: partial ? 'Nettoyage à vérifier' : 'Nettoyage terminé',
        message: `${totalDeletedCount} fichier(s) supprimé(s), ${report.freedDisplay} comptabilisés. ${totalSkippedCount} élément(s) ignoré(s), ${errors.length} erreur(s).${selected.includes('recycleBin') ? ' Le volume de la Corbeille est exclu de ce compteur.' : ''}`,
        actionTarget: { tab: 'performance' },
      });
    } catch (error: any) { logger.warn('[Maintenance] Activité non enregistrée :', error?.message); }
    return report;
  } finally { isMaintenanceRunning = false; }
}

export function calculateNextMaintenanceRun(schedule?: MaintenanceSchedule): {
  nextRunDate: Date | null; formattedText: string; isOverdue: boolean;
} {
  if (!schedule || !schedule.enabled) return { nextRunDate: null, formattedText: 'Désactivée', isOverdue: false };
  const [targetH, targetM] = (schedule.time || '04:00').split(':').map((n: string) => parseInt(n, 10) || 0);
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetH, targetM, 0, 0);
  const freq = schedule.frequency || 'weekly';
  if (freq === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (freq === 'weekly') {
    const targetDay = typeof schedule.dayOfWeek === 'number' ? schedule.dayOfWeek : 0;
    let daysToAdd = (targetDay - next.getDay() + 7) % 7;
    if (daysToAdd === 0 && next <= now) daysToAdd = 7;
    next.setDate(next.getDate() + daysToAdd);
  } else if (freq === 'monthly') {
    const targetDom = Math.max(1, Math.min(31, schedule.dayOfMonth || 1));
    next.setDate(targetDom);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }
  let isOverdue = false;
  if (schedule.lastRun) {
    const periodMs = freq === 'daily' ? 86400000 : freq === 'weekly' ? 7 * 86400000 : 30 * 86400000;
    isOverdue = now.getTime() - new Date(schedule.lastRun).getTime() > periodMs * 1.2;
  }
  const daysFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthsFr = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const timeStr = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
  return { nextRunDate: next, formattedText: `${daysFr[next.getDay()]} ${next.getDate()} ${monthsFr[next.getMonth()]} à ${timeStr}`, isOverdue };
}
