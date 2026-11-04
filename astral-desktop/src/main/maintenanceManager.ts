import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { runPowerShell } from './psHelper';
import { loadPreferences, savePreferences, MaintenanceSchedule } from './profile';
import { BrowserWindow } from 'electron';

export interface StorageCategoryScan {
  id: string;
  label: string;
  bytes: number;
  size: string;
  sizeDisplay: string;
  fileCount: number;
  desc: string;
  selected: boolean;
  inaccessible?: boolean;
  requiresConfirmation?: boolean;
}

export interface CleanupReport {
  success: boolean;
  categoriesCleaned: string[];
  deletedFilesCount: number;
  deletedBytes: number;
  skippedFilesCount: number;
  errors: string[];
  observedFreeDeltaBytes: number;
  durationMs: number;
  freedDisplay: string;
  timestamp: string;
}

let isMaintenanceRunning = false;

export function isMaintenanceBusy(): boolean {
  return isMaintenanceRunning;
}

/**
 * Calcule la taille réelle d'un répertoire sans jamais suivre de jonction ou lien symbolique (sécurité anti-fuite).
 */
export function getSafeDirSize(dirPath: string): { bytes: number; fileCount: number; inaccessible: boolean } {
  let bytes = 0;
  let fileCount = 0;

  if (!fs.existsSync(dirPath)) {
    return { bytes: 0, fileCount: 0, inaccessible: false };
  }

  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) {
      return { bytes: 0, fileCount: 0, inaccessible: false };
    }
  } catch {
    return { bytes: 0, fileCount: 0, inaccessible: true };
  }

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const lst = fs.lstatSync(full);
        if (lst.isSymbolicLink()) continue; // Sécurité : ne jamais suivre de jonction ou lien hors périmètre
      } catch {
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(full);
          bytes += st.size;
          fileCount++;
        } catch {}
      }
    }
  }

  try {
    walk(dirPath);
    return { bytes, fileCount, inaccessible: false };
  } catch {
    return { bytes: 0, fileCount: 0, inaccessible: true };
  }
}

/**
 * Supprime récursivement les fichiers d'un dossier sans suivre de lien symbolique et en gérant les verrous Windows (EBUSY/EPERM).
 */
export function cleanSafeDir(
  dirPath: string,
  onProgress?: (filename: string) => void
): { deletedBytes: number; deletedCount: number; skippedCount: number; errors: string[] } {
  let deletedBytes = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return { deletedBytes, deletedCount, skippedCount, errors };
  }

  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) return { deletedBytes, deletedCount, skippedCount, errors };
  } catch {
    return { deletedBytes, deletedCount, skippedCount, errors: [`Accès refusé au répertoire ${dirPath}`] };
  }

  function removeContents(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e: any) {
      errors.push(`Lecture impossible : ${current} (${e.code || e.message})`);
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const lst = fs.lstatSync(full);
        if (lst.isSymbolicLink()) {
          // Sécurité anti-fuite : ne jamais suivre de jonction ou lien symbolique vers l'extérieur
          try {
            if (lst.isDirectory()) {
              fs.rmdirSync(full);
            } else {
              fs.unlinkSync(full);
            }
          } catch {}
          continue;
        }
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        removeContents(full);
        // Tenter de supprimer le dossier vide
        try {
          fs.rmdirSync(full);
        } catch {
          skippedCount++;
        }
      } else if (entry.isFile()) {
        onProgress?.(entry.name);
        try {
          const st = fs.statSync(full);
          const size = st.size;
          fs.unlinkSync(full);
          deletedBytes += size;
          deletedCount++;
        } catch (err: any) {
          // Fichier verrouillé par un processus actif ou droit d'accès insuffisant
          skippedCount++;
        }
      }
    }
  }

  removeContents(dirPath);
  return { deletedBytes, deletedCount, skippedCount, errors };
}

/**
 * Formate un nombre d'octets en chaîne lisible.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 Mo';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

/**
 * Analyse réelle de l'espace récupérable sur les catégories prévues, sans valeurs fictives.
 */
export async function analyzeStorageCategories(): Promise<StorageCategoryScan[]> {
  const userTempPath = process.env.TEMP || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local', 'Temp');
  const winTempPath = 'C:\\Windows\\Temp';
  const winLogsPath = 'C:\\Windows\\Logs';
  const dxCachePath = path.join(process.env.LOCALAPPDATA || 'C:\\', 'D3DSCache');

  const uTemp = getSafeDirSize(userTempPath);
  const wTemp = getSafeDirSize(winTempPath);
  const wLogs = getSafeDirSize(winLogsPath);
  const dxCache = getSafeDirSize(dxCachePath);

  // Mesure réelle de la Corbeille via Shell COM
  let rbBytes = 0;
  let rbCount = 0;
  try {
    const rbScript = `
      $sh = New-Object -ComObject Shell.Application
      $rb = $sh.Namespace(10)
      $items = $rb.Items()
      $total = 0
      foreach ($i in $items) { $total += $i.Size }
      [PSCustomObject]@{ count = $items.Count; bytes = $total } | ConvertTo-Json -Compress
    `;
    const res = await runPowerShell<any>(rbScript, { asJson: true, timeout: 6000 });
    if (res.success && res.data) {
      rbBytes = Number(res.data.bytes || 0);
      rbCount = Number(res.data.count || 0);
    }
  } catch {}

  const categories: StorageCategoryScan[] = [
    {
      id: 'userTemp',
      label: 'Fichiers temporaires utilisateur (%TEMP%)',
      bytes: uTemp.bytes,
      size: formatBytes(uTemp.bytes),
      sizeDisplay: formatBytes(uTemp.bytes),
      fileCount: uTemp.fileCount,
      desc: "Caches d'applications et données temporaires créées durant votre session Windows.",
      selected: true,
      inaccessible: uTemp.inaccessible,
    },
    {
      id: 'winTemp',
      label: 'Fichiers temporaires système (C:\\Windows\\Temp)',
      bytes: wTemp.bytes,
      size: wTemp.inaccessible ? 'Accès restreint (Admin)' : formatBytes(wTemp.bytes),
      sizeDisplay: wTemp.inaccessible ? 'Accès restreint' : formatBytes(wTemp.bytes),
      fileCount: wTemp.fileCount,
      desc: "Données résiduelles générées par le système et les programmes d'installation.",
      selected: !wTemp.inaccessible && wTemp.bytes > 0,
      inaccessible: wTemp.inaccessible,
    },
    {
      id: 'winLogs',
      label: 'Journaux et traces résiduelles (C:\\Windows\\Logs)',
      bytes: wLogs.bytes,
      size: wLogs.inaccessible ? 'Accès restreint (Admin)' : formatBytes(wLogs.bytes),
      sizeDisplay: wLogs.inaccessible ? 'Accès restreint' : formatBytes(wLogs.bytes),
      fileCount: wLogs.fileCount,
      desc: "Rapports de plantages archivés, journaux CBS et traces d'événements obsolètes.",
      selected: true,
      inaccessible: wLogs.inaccessible,
    },
    {
      id: 'dxCache',
      label: 'Cache Shaders DirectX & GPU (D3DSCache)',
      bytes: dxCache.bytes,
      size: formatBytes(dxCache.bytes),
      sizeDisplay: formatBytes(dxCache.bytes),
      fileCount: dxCache.fileCount,
      desc: 'Caches de compilation graphique pouvant être régénérés automatiquement en jeu. Sélectionnable.',
      selected: false, // Non obligatoire, explicite
      inaccessible: dxCache.inaccessible,
      requiresConfirmation: true,
    },
    {
      id: 'recycleBin',
      label: 'Corbeille Windows',
      bytes: rbBytes,
      size: rbBytes > 0 ? formatBytes(rbBytes) : '0 Mo (Vide)',
      sizeDisplay: rbBytes > 0 ? formatBytes(rbBytes) : 'Vide',
      fileCount: rbCount,
      desc: 'Vidage définitif des éléments supprimés placés dans la corbeille. Sélectionnable avec confirmation.',
      selected: false, // Non obligatoire, explicite
      requiresConfirmation: true,
    },
  ];

  return categories;
}

/**
 * Exécute le nettoyage réel sur les catégories explicitement choisies par l'utilisateur.
 */
export async function executeStorageCleanup(
  selectedCategoryIds: string[],
  win?: BrowserWindow | null,
  notifyFn?: (title: string, body: string, opts?: any) => void
): Promise<CleanupReport> {
  if (isMaintenanceRunning) {
    throw new Error('Une opération de maintenance est déjà en cours.');
  }

  isMaintenanceRunning = true;
  const startTime = Date.now();
  const categoriesCleaned: string[] = [];
  let totalDeletedBytes = 0;
  let totalDeletedCount = 0;
  let totalSkippedCount = 0;
  const errors: string[] = [];

  // 1. Mesure de l'espace libre avant nettoyage
  let freeBefore = 0;
  try {
    const st = fs.statfsSync('C:\\');
    freeBefore = Number(st.bfree) * Number(st.bsize);
  } catch {}

  const sendProgress = (step: number, totalSteps: number, catName: string, detail: string) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('perf:maintenance-progress', {
        step,
        totalSteps,
        category: catName,
        message: detail,
        percent: Math.round((step / totalSteps) * 100),
      });
    }
  };

  const selectedSet = new Set(selectedCategoryIds || []);
  const activeSteps: Array<{ id: string; name: string }> = [];

  if (selectedSet.has('userTemp')) activeSteps.push({ id: 'userTemp', name: '%TEMP% utilisateur' });
  if (selectedSet.has('winTemp')) activeSteps.push({ id: 'winTemp', name: 'Windows Temp' });
  if (selectedSet.has('winLogs')) activeSteps.push({ id: 'winLogs', name: 'Journaux système' });
  if (selectedSet.has('dxCache')) activeSteps.push({ id: 'dxCache', name: 'Shaders DirectX' });
  if (selectedSet.has('recycleBin')) activeSteps.push({ id: 'recycleBin', name: 'Corbeille Windows' });

  const totalSteps = Math.max(1, activeSteps.length);
  let currentStep = 0;

  try {
    for (const s of activeSteps) {
      currentStep++;
      sendProgress(currentStep, totalSteps, s.name, `Purge de la catégorie : ${s.name}…`);

      if (s.id === 'userTemp') {
        const p = process.env.TEMP || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local', 'Temp');
        const res = cleanSafeDir(p);
        totalDeletedBytes += res.deletedBytes;
        totalDeletedCount += res.deletedCount;
        totalSkippedCount += res.skippedCount;
        errors.push(...res.errors);
        categoriesCleaned.push('userTemp');
      } else if (s.id === 'winTemp') {
        const res = cleanSafeDir('C:\\Windows\\Temp');
        totalDeletedBytes += res.deletedBytes;
        totalDeletedCount += res.deletedCount;
        totalSkippedCount += res.skippedCount;
        errors.push(...res.errors);
        categoriesCleaned.push('winTemp');
      } else if (s.id === 'winLogs') {
        const res = cleanSafeDir('C:\\Windows\\Logs');
        totalDeletedBytes += res.deletedBytes;
        totalDeletedCount += res.deletedCount;
        totalSkippedCount += res.skippedCount;
        errors.push(...res.errors);
        categoriesCleaned.push('winLogs');
      } else if (s.id === 'dxCache') {
        const p = path.join(process.env.LOCALAPPDATA || 'C:\\', 'D3DSCache');
        const res = cleanSafeDir(p);
        totalDeletedBytes += res.deletedBytes;
        totalDeletedCount += res.deletedCount;
        totalSkippedCount += res.skippedCount;
        errors.push(...res.errors);
        categoriesCleaned.push('dxCache');
      } else if (s.id === 'recycleBin') {
        try {
          const rbScript = `Clear-RecycleBin -Force -ErrorAction SilentlyContinue`;
          await runPowerShell(rbScript, { timeout: 15000 });
          categoriesCleaned.push('recycleBin');
        } catch (err: any) {
          errors.push(`Erreur vidage corbeille : ${err.message}`);
        }
      }
    }
  } finally {
    isMaintenanceRunning = false;
  }

  // 2. Mesure de l'espace libre après nettoyage
  let freeAfter = freeBefore;
  try {
    const st = fs.statfsSync('C:\\');
    freeAfter = Number(st.bfree) * Number(st.bsize);
  } catch {}

  const observedFreeDeltaBytes = Math.max(0, freeAfter - freeBefore);
  const durationMs = Date.now() - startTime;
  const freedDisplay = formatBytes(totalDeletedBytes > 0 ? totalDeletedBytes : observedFreeDeltaBytes);

  // Mettre à jour la date du dernier passage dans le profil
  try {
    const prefs = loadPreferences();
    if (prefs.maintenanceSchedule) {
      savePreferences({
        maintenanceSchedule: {
          ...prefs.maintenanceSchedule,
          lastRun: new Date().toISOString(),
        },
      });
    }
  } catch {}

  if (notifyFn) {
    notifyFn('Maintenance système terminée', `${freedDisplay} d'espace récupéré sur vos disques.`, {
      type: 'performance',
    });
  }

  return {
    success: true,
    categoriesCleaned,
    deletedFilesCount: totalDeletedCount,
    deletedBytes: totalDeletedBytes,
    skippedFilesCount: totalSkippedCount,
    errors,
    observedFreeDeltaBytes,
    durationMs,
    freedDisplay,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calcule l'horodatage exact et le libellé de la prochaine exécution de la maintenance programmée
 * en se basant sur les réglages réels de l'utilisateur (sans horaire arbitraire).
 */
export function calculateNextMaintenanceRun(schedule?: MaintenanceSchedule): {
  nextRunDate: Date | null;
  formattedText: string;
  isOverdue: boolean;
} {
  if (!schedule || !schedule.enabled) {
    return { nextRunDate: null, formattedText: 'Désactivée', isOverdue: false };
  }

  const [targetH, targetM] = (schedule.time || '04:00').split(':').map((n: string) => parseInt(n, 10) || 0);
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetH, targetM, 0, 0);

  const freq = schedule.frequency || 'weekly';

  if (freq === 'daily') {
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (freq === 'weekly') {
    const targetDay = typeof schedule.dayOfWeek === 'number' ? schedule.dayOfWeek : 0; // 0=Dimanche
    const currentDay = next.getDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0 && next <= now) {
      daysToAdd = 7;
    }
    next.setDate(next.getDate() + daysToAdd);
  } else if (freq === 'monthly') {
    const targetDom = Math.max(1, Math.min(31, schedule.dayOfMonth || 1));
    next.setDate(targetDom);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  // Vérifier si la dernière échéance était dépassée (ex: PC éteint lors de l'horaire prévu)
  let isOverdue = false;
  if (schedule.lastRun) {
    const lastRunTime = new Date(schedule.lastRun).getTime();
    // Si la dernière exécution remonte à plus d'une période
    const periodMs = freq === 'daily' ? 86400000 : freq === 'weekly' ? 7 * 86400000 : 30 * 86400000;
    if (now.getTime() - lastRunTime > periodMs * 1.2) {
      isOverdue = true;
    }
  }

  const daysFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthsFr = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const timeStr = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
  const dayName = daysFr[next.getDay()];
  const formattedText = `${dayName} ${next.getDate()} ${monthsFr[next.getMonth()]} à ${timeStr}`;

  return { nextRunDate: next, formattedText, isOverdue };
}
