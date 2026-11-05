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

const EMPTY_SCAN = { bytes: 0, fileCount: 0, inaccessible: true };

function absoluteEnv(name: string): string | null {
  const value = process.env[name];
  return value && path.isAbsolute(value) ? path.resolve(value) : null;
}

/** Fixed cleanup targets, resolved from the environment. A target that cannot be resolved is null: no drive is ever assumed. */
export function resolveCleanupTargets(): Record<'userTemp' | 'winTemp' | 'winLogs' | 'dxCache', string | null> {
  const home = absoluteEnv('USERPROFILE');
  let userTemp = absoluteEnv('TEMP') || (home ? path.join(home, 'AppData', 'Local', 'Temp') : null);
  // Never treat a drive root or the profile folder itself as a temporary directory.
  if (userTemp && (userTemp === path.parse(userTemp).root || userTemp === home)) userTemp = null;
  const systemRoot = absoluteEnv('SystemRoot') || absoluteEnv('windir');
  const localAppData = absoluteEnv('LOCALAPPDATA');
  return {
    userTemp,
    winTemp: systemRoot ? path.join(systemRoot, 'Temp') : null,
    winLogs: systemRoot ? path.join(systemRoot, 'Logs') : null,
    dxCache: localAppData ? path.join(localAppData, 'D3DSCache') : null,
  };
}

function scanTarget(target: string | null) {
  return target ? getSafeDirSize(target) : EMPTY_SCAN;
}

export async function analyzeStorageCategories(): Promise<StorageCategoryScan[]> {
  const paths = resolveCleanupTargets();
  const uTemp = scanTarget(paths.userTemp);
  const wTemp = scanTarget(paths.winTemp);
  const wLogs = scanTarget(paths.winLogs);
  const dxCache = scanTarget(paths.dxCache);
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
    category('winTemp', `Fichiers temporaires système (${paths.winTemp ?? 'Windows\\Temp'})`, wTemp, "Données temporaires du système et des installations.", wTemp.bytes > 0),
    category('winLogs', `Journaux système (${paths.winLogs ?? 'Windows\\Logs'})`, wLogs, 'Journaux de diagnostic Windows. Nettoyage facultatif.', false),
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
  const targets = resolveCleanupTargets();
  isMaintenanceRunning = true;
  const startTime = Date.now();
  const categoriesCleaned: string[] = [];
  const errors: string[] = [];
  let totalDeletedBytes = 0;
  let totalDeletedCount = 0;
  let totalSkippedCount = 0;
  // Free space is observed only on the volumes that hold the selected targets.
  const volumes = [...new Set(selected.filter(id => id !== 'recycleBin')
    .map(id => (targets as Record<string, string | null>)[id])
    .filter((target): target is string => Boolean(target))
    .map(target => path.parse(target).root))];
  const freeBytes = (): number | null => {
    if (volumes.length === 0) return null;
    try {
      return volumes.reduce((sum, volume) => { const stat = fs.statfsSync(volume); return sum + Number(stat.bfree) * Number(stat.bsize); }, 0);
    } catch { return null; }
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
        const target = (targets as Record<string, string | null>)[id];
        const result = target
          ? cleanSafeDir(target)
          : { deletedBytes: 0, deletedCount: 0, skippedCount: 0, errors: ['Emplacement introuvable sur cette machine.'] };
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

// ── Per-drive cleanup ────────────────────────────────────────────────────────
// A drive is only ever cleaned through an explicit letter. Known cache locations are cleaned on the
// volume that holds them; every other volume offers its own Recycle Bin and nothing else. Game
// libraries, download folders and arbitrary "Temp"/"tmp" folders are never touched.

export interface DriveJunkCategory {
  id: string; label: string; desc: string; sizeBytes: number; sizeMB: number; sizeDisplay: string;
  safeToClean: boolean; unavailable?: boolean;
}
export interface DriveJunkScan {
  success: boolean; driveLetter: string; totalBytes: number; totalMB: number; totalFormatted: string;
  categories: DriveJunkCategory[]; summary: string; errorMessage?: string;
}
export interface DriveCleanupResult {
  success: boolean; partial: boolean; driveLetter: string; categoriesCleaned: string[];
  deletedFilesCount: number; deletedBytes: number; skippedFilesCount: number; errors: string[];
  freedDisplay: string; message: string; error?: string;
}

/** Strict parser: exactly one letter, optionally followed by a colon. No default drive. */
export function parseDriveLetter(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const match = /^([A-Za-z]):?$/.exec(input.trim());
  return match ? match[1].toUpperCase() : null;
}

function driveOf(target: string): string {
  return path.parse(target).root.slice(0, 1).toUpperCase();
}

interface DriveDirTarget { id: string; label: string; desc: string; dirs: string[] }

function getDriveDirTargets(letter: string): DriveDirTarget[] {
  const targets = resolveCleanupTargets();
  const localAppData = absoluteEnv('LOCALAPPDATA');
  const candidates: DriveDirTarget[] = [
    { id: 'userTemp', label: 'Fichiers temporaires de session (%TEMP%)', desc: 'Fichiers de travail créés par les applications.', dirs: targets.userTemp ? [targets.userTemp] : [] },
    {
      id: 'dxCache', label: 'Caches de shaders DirectX / GPU', desc: 'Caches régénérés par les applications ; le premier lancement d’un jeu peut être plus lent.',
      dirs: [targets.dxCache, localAppData ? path.join(localAppData, 'NVIDIA', 'DXCache') : null].filter((d): d is string => Boolean(d)),
    },
    { id: 'crashDumps', label: 'Rapports d’erreurs applicatives', desc: 'Vidages .dmp d’anciens plantages.', dirs: localAppData ? [path.join(localAppData, 'CrashDumps')] : [] },
  ];
  return candidates
    .map(candidate => ({ ...candidate, dirs: candidate.dirs.filter(dir => driveOf(dir) === letter) }))
    .filter(candidate => candidate.dirs.length > 0);
}

function isUsableDrive(letter: string): boolean {
  try { return fs.statSync(`${letter}:\\`).isDirectory(); } catch { return false; }
}

async function measureRecycleBin(letter: string): Promise<{ bytes: number; count: number } | null> {
  try {
    const response = await runPowerShell<any>(`
      $ErrorActionPreference = 'Stop'
      $rb = (New-Object -ComObject Shell.Application).Namespace(10)
      if ($null -eq $rb) { throw 'Corbeille inaccessible' }
      $total = 0; $count = 0
      foreach ($i in $rb.Items()) { if ($i.Path -like '${letter}:*') { $total += $i.Size; $count++ } }
      [PSCustomObject]@{ count = $count; bytes = $total } | ConvertTo-Json -Compress
    `, { asJson: true, timeout: 8000 });
    if (!response.success || !response.data) return null;
    const bytes = Number(response.data.bytes);
    const count = Number(response.data.count);
    return Number.isFinite(bytes) && bytes >= 0 && Number.isFinite(count) ? { bytes, count } : null;
  } catch { return null; }
}

export async function scanDriveJunk(driveInput: unknown): Promise<DriveJunkScan> {
  const letter = parseDriveLetter(driveInput);
  const fail = (message: string): DriveJunkScan => ({
    success: false, driveLetter: letter ? `${letter}:` : '', totalBytes: 0, totalMB: 0, totalFormatted: '—',
    categories: [], summary: `Analyse indisponible : ${message}`, errorMessage: message,
  });
  if (!letter) return fail('lecteur non précisé ou invalide.');
  if (!isUsableDrive(letter)) return fail(`le lecteur ${letter}: est introuvable.`);
  const toCategory = (id: string, label: string, desc: string, bytes: number, unavailable = false): DriveJunkCategory => ({
    id, label, desc, sizeBytes: bytes, sizeMB: Math.round(bytes / (1024 * 1024) * 10) / 10,
    sizeDisplay: unavailable ? 'Analyse indisponible' : formatBytes(bytes), safeToClean: !unavailable, unavailable,
  });
  const categories: DriveJunkCategory[] = [];
  for (const target of getDriveDirTargets(letter)) {
    const sizes = target.dirs.map(getSafeDirSize);
    const incomplete = sizes.some(size => size.inaccessible);
    const bytes = sizes.reduce((sum, size) => sum + size.bytes, 0);
    if (bytes > 0 || incomplete) categories.push(toCategory(target.id, target.label, target.desc, bytes, incomplete && bytes === 0));
  }
  const bin = await measureRecycleBin(letter);
  categories.push(toCategory('recycleBin', `Corbeille du lecteur ${letter}:`,
    'Suppression définitive des éléments de la Corbeille situés sur ce lecteur.', bin?.bytes ?? 0, bin === null));
  const totalBytes = categories.filter(c => !c.unavailable).reduce((sum, c) => sum + c.sizeBytes, 0);
  return {
    success: true, driveLetter: `${letter}:`, totalBytes, totalMB: Math.round(totalBytes / (1024 * 1024) * 10) / 10,
    totalFormatted: formatBytes(totalBytes), categories,
    summary: totalBytes > 0
      ? `${formatBytes(totalBytes)} de caches et fichiers temporaires identifiés sur ${letter}:.`
      : `Aucun cache ni fichier temporaire connu à nettoyer sur ${letter}:.`,
  };
}

export async function cleanDriveJunk(driveInput: unknown, options?: { emptyRecycleBin?: boolean }): Promise<DriveCleanupResult> {
  // Emptying a Recycle Bin is irreversible and needs its own explicit consent; scanning or choosing a drive is not consent.
  const emptyRecycleBin = options?.emptyRecycleBin === true;
  const letter = parseDriveLetter(driveInput);
  const empty = (error: string): DriveCleanupResult => ({
    success: false, partial: false, driveLetter: letter ? `${letter}:` : '', categoriesCleaned: [],
    deletedFilesCount: 0, deletedBytes: 0, skippedFilesCount: 0, errors: [error], freedDisplay: '0 Mo', message: error, error,
  });
  if (!letter) return empty('Lecteur non précisé ou invalide : aucun nettoyage effectué.');
  if (!isUsableDrive(letter)) return empty(`Le lecteur ${letter}: est introuvable : aucun nettoyage effectué.`);
  if (isMaintenanceRunning) return empty('Une opération de maintenance est déjà en cours.');
  isMaintenanceRunning = true;
  try {
    const errors: string[] = [];
    const categoriesCleaned: string[] = [];
    let deletedBytes = 0; let deletedFilesCount = 0; let skippedFilesCount = 0;
    for (const target of getDriveDirTargets(letter)) {
      let clean = true;
      for (const dir of target.dirs) {
        const result = cleanSafeDir(dir);
        deletedBytes += result.deletedBytes; deletedFilesCount += result.deletedCount; skippedFilesCount += result.skippedCount;
        errors.push(...result.errors.map(error => `${target.label} : ${error}`));
        if (result.errors.length > 0) clean = false;
      }
      if (clean) categoriesCleaned.push(target.id);
    }
    if (emptyRecycleBin) try {
      const result = await runPowerShell(`Clear-RecycleBin -DriveLetter '${letter}' -Force -ErrorAction Stop`, { timeout: 20000 });
      if (result.success) categoriesCleaned.push('recycleBin');
      else errors.push(`Corbeille ${letter}: : le vidage n’a pas été confirmé.`);
    } catch (error: any) { errors.push(`Corbeille ${letter}: : ${error?.message || 'échec du vidage'}`); }
    const partial = errors.length > 0 || skippedFilesCount > 0;
    const freedDisplay = formatBytes(deletedBytes);
    const message = `${letter}: — ${deletedFilesCount} fichier(s) supprimé(s), ${freedDisplay} comptabilisés (hors Corbeille, ${emptyRecycleBin ? 'vidée' : 'non vidée'}), ${skippedFilesCount} ignoré(s), ${errors.length} erreur(s).`;
    try {
      notificationManager.emit({
        category: 'maintenance', severity: partial ? 'warning' : 'info',
        title: partial ? `Nettoyage du lecteur ${letter}: à vérifier` : `Nettoyage du lecteur ${letter}: terminé`,
        message, actionTarget: { tab: 'performance' },
      });
    } catch (error: any) { logger.warn('[Maintenance] Activité non enregistrée :', error?.message); }
    return {
      success: errors.length === 0, partial, driveLetter: `${letter}:`, categoriesCleaned, deletedFilesCount, deletedBytes,
      skippedFilesCount, errors, freedDisplay, message,
    };
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
