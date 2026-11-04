import { BrowserWindow } from 'electron';
import { logger } from './logger';
import { loadPreferences, savePreferences, MaintenanceSchedule } from './profile';
import { executeStorageCleanup, calculateNextMaintenanceRun, isMaintenanceBusy } from './maintenanceManager';

// ── Scheduler state ────────────────────────────────────────────────────────────
let schedulerTimer: NodeJS.Timeout | null = null;
let started = false;
let overdueNotifiedThisSession = false;

let _win: BrowserWindow | null = null;
let _notifyFn: ((title: string, body: string, opts?: any) => void) | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start the maintenance scheduler. Called once when the app is ready.
 * Idempotent — safe to call multiple times.
 */
export function startMaintenanceScheduler(
  win: BrowserWindow,
  notifyFn: (title: string, body: string, opts?: any) => void
): void {
  if (started) return;
  started = true;
  _win = win;
  _notifyFn = notifyFn;
  logger.info('[MaintenanceScheduler] Démarrage du scheduler de maintenance automatique.');
  scheduleNextCheck();
}

/**
 * Stop the scheduler cleanly. Called when the app is about to quit.
 */
export function stopMaintenanceScheduler(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  started = false;
  logger.info('[MaintenanceScheduler] Scheduler arrêté proprement.');
}

/**
 * Re-read configuration and reschedule. Call after the user saves new settings.
 */
export function notifyScheduleChanged(): void {
  if (!started) return;
  logger.info('[MaintenanceScheduler] Paramètres modifiés — recalcul de la prochaine échéance.');
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  overdueNotifiedThisSession = false;
  scheduleNextCheck();
}

// ── Internal logic ─────────────────────────────────────────────────────────────

/**
 * Arm a timer to fire at the next scheduled maintenance time.
 * Does NOT use a fixed interval — respects the user-configured hour and day.
 * Minimum check interval: 60 seconds to avoid busy-polling.
 */
function scheduleNextCheck(): void {
  const prefs = loadPreferences();
  const schedule = prefs.maintenanceSchedule;

  if (!schedule || !schedule.enabled) {
    logger.info('[MaintenanceScheduler] Maintenance programmée désactivée — scheduler en veille.');
    return;
  }

  const { nextRunDate, isOverdue } = calculateNextMaintenanceRun(schedule);

  // Handle overdue: propose rattrapage once per session, no retry loop
  if (isOverdue && !overdueNotifiedThisSession) {
    overdueNotifiedThisSession = true;
    logger.info('[MaintenanceScheduler] Échéance manquée détectée — lancement du rattrapage.');
    handleOverdue(schedule);
    return; // handleOverdue calls scheduleNextCheck after completion
  }

  if (!nextRunDate) {
    logger.warn('[MaintenanceScheduler] Impossible de calculer la prochaine échéance.');
    return;
  }

  const delayMs = Math.max(60_000, nextRunDate.getTime() - Date.now());
  logger.info(
    `[MaintenanceScheduler] Prochaine maintenance dans ${Math.round(delayMs / 60_000)} min ` +
    `(${nextRunDate.toLocaleString('fr-FR')}).`
  );

  schedulerTimer = setTimeout(() => {
    schedulerTimer = null;
    runScheduledMaintenance();
  }, delayMs);
}

/**
 * Handle a missed maintenance window.
 * Runs cleanup once with the configured categories.
 * Does NOT retry on failure. Does NOT repeat on every app launch.
 * Records lastRun even if categories are empty, to avoid overdue loop.
 */
async function handleOverdue(schedule: MaintenanceSchedule): Promise<void> {
  const categories = schedule.categories;

  if (!categories || categories.length === 0) {
    logger.warn('[MaintenanceScheduler] Échéance manquée, mais aucune catégorie configurée — rattrapage annulé.');
    markLastRunNow(schedule);
    scheduleNextCheck();
    return;
  }

  logger.info('[MaintenanceScheduler] Rattrapage de l\'échéance manquée (une seule fois).');
  await runMaintenance(categories, 'rattrapage');
}

/**
 * Triggered at the exact scheduled moment.
 */
async function runScheduledMaintenance(): Promise<void> {
  const prefs = loadPreferences();
  const schedule = prefs.maintenanceSchedule;

  if (!schedule || !schedule.enabled) {
    logger.info('[MaintenanceScheduler] Maintenance désactivée au moment du déclenchement — abandon.');
    scheduleNextCheck();
    return;
  }

  const categories = schedule.categories;
  if (!categories || categories.length === 0) {
    logger.warn('[MaintenanceScheduler] Déclenchement sans catégories configurées — annulé.');
    markLastRunNow(schedule);
    scheduleNextCheck();
    return;
  }

  await runMaintenance(categories, 'programmée');
}

/**
 * Execute cleanup with the given categories.
 * Respects the shared running lock. On lock conflict, defers once by 10 minutes (not a retry loop).
 * On failure, records lastRun to avoid overdue loops.
 */
async function runMaintenance(categories: string[], reason: string): Promise<void> {
  if (isMaintenanceBusy()) {
    logger.info(`[MaintenanceScheduler] Maintenance (${reason}) différée : opération manuelle en cours.`);
    // One deferred attempt — not a retry loop
    schedulerTimer = setTimeout(() => {
      schedulerTimer = null;
      runScheduledMaintenance();
    }, 10 * 60_000);
    return;
  }

  logger.info(`[MaintenanceScheduler] Déclenchement maintenance ${reason} : [${categories.join(', ')}].`);

  try {
    const report = await executeStorageCleanup(
      categories,
      _win && !_win.isDestroyed() ? _win : null,
      _notifyFn ?? undefined
    );
    logger.info(
      `[MaintenanceScheduler] Maintenance ${reason} terminée : ` +
      `${report.deletedFilesCount} fichiers supprimés, ${report.freedDisplay} libérés, ` +
      `${report.skippedFilesCount} ignorés, ${report.errors.length} erreurs, ` +
      `durée ${report.durationMs}ms.`
    );
    // lastRun is already saved by executeStorageCleanup
  } catch (err: any) {
    logger.error(`[MaintenanceScheduler] Erreur maintenance ${reason} : ${err.message}`);
    // Record lastRun even on failure to prevent endless overdue loop
    const prefs = loadPreferences();
    if (prefs.maintenanceSchedule) {
      markLastRunNow(prefs.maintenanceSchedule);
    }
  }

  scheduleNextCheck();
}

/**
 * Persist the current time as lastRun without running any cleanup.
 */
function markLastRunNow(schedule: MaintenanceSchedule): void {
  try {
    savePreferences({
      maintenanceSchedule: {
        ...schedule,
        lastRun: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    logger.warn('[MaintenanceScheduler] Impossible de sauvegarder lastRun :', err.message);
  }
}
