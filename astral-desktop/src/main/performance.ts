import { BrowserWindow, ipcMain } from 'electron';
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { executePrivilegedAction } from './privilegedHelper';
import { getFullSystemTelemetry, CRITICAL_SYSTEM_PROCESSES } from './telemetry';
import {
  analyzeStorageCategories,
  executeStorageCleanup,
  scanDriveJunk,
  cleanDriveJunk,
  calculateNextMaintenanceRun,
  formatBytes,
} from './maintenanceManager';
import { loadPreferences, savePreferences } from './profile';
import { notifyScheduleChanged } from './maintenanceScheduler';
import os from 'os';

export function setupPerformanceIPC(win: BrowserWindow, notifyFn?: (title: string, body: string, opts?: any) => void) {
  // ── Real Live System Metrics (Differential CPU, Real RAM, StatFS, Real GPU) ──
  ipcMain.handle('perf:get-metrics', async () => {
    try {
      const telemetry = await getFullSystemTelemetry();
      const primaryDisk = telemetry.disks.find((d) => d.drive.toUpperCase().startsWith('C')) ||
        telemetry.disks[0] || { usedGB: 0, freeGB: 0 };

      return {
        success: true,
        data: {
          cpuModel: telemetry.cpu.cpuModel,
          cpuCores: telemetry.cpu.logicalCores,
          gpuName: telemetry.gpu.gpuName,
          cpuPercent: telemetry.cpu.overallPercent,
          cpuSpeedMHz: telemetry.cpu.cpuSpeedMHz,
          coresPercent: telemetry.cpu.coresPercent,
          ramTotal: telemetry.memory.totalGB,
          ramUsed: telemetry.memory.usedGB,
          ramFree: telemetry.memory.freeGB,
          ramPercent: telemetry.memory.usedPercent,
          diskUsedGB: primaryDisk.usedGB,
          diskFreeGB: primaryDisk.freeGB,
          disks: telemetry.disks,
          gpuUtilization: telemetry.gpu.utilizationPercent,
          gpuTemp: telemetry.gpu.temperatureC,
          gpuVramUsedMB: telemetry.gpu.vramUsedMB,
          gpuVramTotalMB: telemetry.gpu.vramTotalMB,
          gpuStatus: telemetry.gpu.status,
          uptimeHours: Number((telemetry.uptimeSeconds / 3600).toFixed(1)),
          topProcesses: telemetry.topProcesses,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('perf:get-telemetry-snapshot', async () => {
    return {
      success: true,
      data: await getFullSystemTelemetry(),
    };
  });

  // ── Fast Native & Registry Startup Programs ────────────────────────────────
  let cachedStartupItems: any[] | null = null;
  let lastStartupFetch = 0;

  const queryRegKey = (key: string): Array<{ name: string; command: string; location: string }> => {
    try {
      const out = cp.execFileSync('reg.exe', ['query', key], { encoding: 'utf8', windowsHide: true });
      const lines = out.split('\r\n');
      const results: Array<{ name: string; command: string; location: string }> = [];
      for (const line of lines) {
        const match = line.match(/^\s{4}([^\s].*?)\s{4,}(REG_\w+)\s{4,}(.*)$/);
        if (match) {
          results.push({ name: match[1].trim(), command: match[3].trim(), location: key });
        }
      }
      return results;
    } catch {
      return [];
    }
  };

  const cleanStartupMeta = (name: string, cmd: string): { displayName: string; publisher: string; impact: 'h' | 'm' | 'l' | 'u' } => {
    const full = (name + ' ' + cmd).toLowerCase();
    if (full.includes('discord')) return { displayName: 'Discord', publisher: 'Discord Inc.', impact: 'h' };
    if (full.includes('steam')) return { displayName: 'Steam Client Bootstrapper', publisher: 'Valve Corporation', impact: 'h' };
    if (full.includes('wallpaper')) return { displayName: 'Wallpaper Engine', publisher: 'Wallpaper Engine Team', impact: 'h' };
    if (full.includes('signalrgb') || full.includes('vortxengine')) return { displayName: 'SignalRGB', publisher: 'WhirlwindFX', impact: 'h' };
    if (full.includes('perplexity')) return { displayName: 'Perplexity AI', publisher: 'Perplexity Inc.', impact: 'm' };
    if (full.includes('lghub')) return { displayName: 'Logitech G HUB', publisher: 'Logitech Inc.', impact: 'm' };
    if (full.includes('nordvpn')) return { displayName: 'NordVPN Background Service', publisher: 'Nord Security', impact: 'm' };
    if (full.includes('astral vanguard') || full.includes('com.astral.vanguard')) return { displayName: 'Astral Vanguard', publisher: 'Astral Security', impact: 'm' };
    if (full.includes('canva')) return { displayName: 'Canva Desktop Agent', publisher: 'Canva Pty Ltd', impact: 'l' };
    if (full.includes('opera') && full.includes('assistant')) return { displayName: 'Opera GX Assistant', publisher: 'Opera Software', impact: 'l' };
    if (full.includes('opera')) return { displayName: 'Opera GX Browser', publisher: 'Opera Software', impact: 'h' };
    if (full.includes('roblox')) return { displayName: 'Roblox Player Tray', publisher: 'Roblox Corporation', impact: 'm' };
    if (full.includes('msedge') || full.includes('edge')) return { displayName: 'Microsoft Edge Startup Boost', publisher: 'Microsoft Corporation', impact: 'l' };
    if (full.includes('onedrive')) return { displayName: 'Microsoft OneDrive', publisher: 'Microsoft Corporation', impact: 'm' };
    if (full.includes('securityhealth')) return { displayName: 'Notification Sécurité Windows', publisher: 'Microsoft Windows', impact: 'l' };
    if (full.includes('dubbingai')) return { displayName: 'Dubbing AI Voice Engine', publisher: 'Dubbing AI Inc.', impact: 'm' };
    if (full.includes('steelseries')) return { displayName: 'SteelSeries GG Engine', publisher: 'SteelSeries ApS', impact: 'm' };
    if (full.includes('comet')) return { displayName: 'Comet Launcher', publisher: 'Comet Software', impact: 'l' };

    return {
      displayName: name.replace(/^electron\.app\./i, '').replace(/^com\./i, ''),
      publisher: /microsoft/i.test(cmd) ? 'Microsoft Corporation' : 'Éditeur non répertorié',
      impact: 'u' as const,
    };
  };

  ipcMain.handle('perf:get-startup', async () => {
    const now = Date.now();
    if (cachedStartupItems && (now - lastStartupFetch < 8000)) {
      return { success: true, items: cachedStartupItems };
    }

    logger.info('Récupération native instantanée des programmes au démarrage (Registre + Dossiers de démarrage)...');
    try {
      const regHkcu = queryRegKey('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
      const regHklm = queryRegKey('HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
      const regHklmWow = queryRegKey('HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run');

      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const progData = process.env.ProgramData || 'C:\\ProgramData';
      const uStartup = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      const cStartup = path.join(progData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');

      const shortcuts: Array<{ name: string; command: string; location: string }> = [];
      if (fs.existsSync(uStartup)) {
        try {
          const files = fs.readdirSync(uStartup);
          for (const f of files) {
            if (f.toLowerCase().endsWith('.lnk') && !f.toLowerCase().includes('desktop.ini')) {
              shortcuts.push({
                name: f.replace(/\.lnk$/i, ''),
                command: path.join(uStartup, f),
                location: 'Startup (Utilisateur)',
              });
            }
          }
        } catch {}
      }
      if (fs.existsSync(cStartup)) {
        try {
          const files = fs.readdirSync(cStartup);
          for (const f of files) {
            if (f.toLowerCase().endsWith('.lnk') && !f.toLowerCase().includes('desktop.ini')) {
              shortcuts.push({
                name: f.replace(/\.lnk$/i, ''),
                command: path.join(cStartup, f),
                location: 'Startup (Commun)',
              });
            }
          }
        } catch {}
      }

      const allRaw = [...regHkcu, ...regHklm, ...regHklmWow, ...shortcuts];
      const seen = new Set<string>();
      const items: any[] = [];

      for (const item of allRaw) {
        const cmd = item.command || '';
        const rawName = item.name || 'Application';
        const meta = cleanStartupMeta(rawName, cmd);

        const key = meta.displayName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const impactLabel =
          meta.impact === 'h' ? 'ÉLEVÉ' :
          meta.impact === 'm' ? 'MOYEN' :
          meta.impact === 'l' ? 'FAIBLE' : 'NON DÉTERMINÉ';

        items.push({
          rawName,
          name: meta.displayName,
          Name: meta.displayName,
          command: cmd,
          Command: cmd,
          location: item.location.includes('HKLM') ? 'HKLM' : item.location.includes('HKCU') ? 'HKCU' : item.location,
          Location: item.location.includes('HKLM') ? 'HKLM' : item.location.includes('HKCU') ? 'HKCU' : item.location,
          user: item.location.includes('HKLM') ? 'Système' : 'Utilisateur',
          enabled: true,
          impact: meta.impact,
          impactLabel,
          publisher: meta.publisher,
        });
      }

      cachedStartupItems = items;
      lastStartupFetch = now;
      logger.info(`Démarrage : ${items.length} applications identifiées instantanément.`);
      return { success: true, items };
    } catch (e: any) {
      logger.warn('Erreur lecture native startup:', e.message);
      return { success: true, items: cachedStartupItems || [] };
    }
  });

  const DISABLED_STARTUP_PATH = path.join(process.env.APPDATA || 'C:\\', 'AstralVanguard', 'disabled-startup.json');
  function loadDisabledStartup(): Record<string, { rawName: string; name: string; command: string; location: string; regType?: string; publisher?: string; impact?: 'h' | 'm' | 'l' | 'u' }> {
    try {
      if (fs.existsSync(DISABLED_STARTUP_PATH)) {
        return JSON.parse(fs.readFileSync(DISABLED_STARTUP_PATH, 'utf-8'));
      }
    } catch {}
    return {};
  }
  function saveDisabledStartup(map: Record<string, any>) {
    try {
      const d = path.dirname(DISABLED_STARTUP_PATH);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(DISABLED_STARTUP_PATH, JSON.stringify(map, null, 2), 'utf-8');
    } catch {}
  }

  // ── Set / Toggle Startup Item with Restoration ────────────────────────────
  ipcMain.handle('perf:set-startup-app', async (_, opts: { name: string; rawName?: string; location?: string; enabled: boolean; command?: string }) => {
    const rawName = String(opts.rawName || opts.name || '').trim();
    const location = (opts.location || 'HKCU').includes('HKLM') ? 'HKLM' : 'HKCU';
    const enabled = Boolean(opts.enabled);

    if (!rawName || !/^[a-zA-Z0-9_\-\.\s]{1,128}$/.test(rawName)) {
      return { success: false, error: 'Nom de programme de démarrage invalide.' };
    }

    const disabledMap = loadDisabledStartup();
    const key = rawName.toLowerCase();

    if (!enabled) {
      let cmd = opts.command || '';
      if (!cmd && cachedStartupItems) {
        const found = cachedStartupItems.find((i: any) => (i.rawName || i.name).toLowerCase() === key);
        if (found) cmd = found.command;
      }
      // Read the real registry value type before deletion to preserve it for restoration
      // (e.g. REG_EXPAND_SZ entries use env var expansion — hardcoding REG_SZ would break them)
      let detectedRegType = 'REG_SZ'; // conservative fallback
      const regPath = location === 'HKLM'
        ? 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
        : 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      try {
        const queryOut = cp.execFileSync('reg.exe', ['query', regPath, '/v', rawName], { encoding: 'utf8', windowsHide: true });
        const typeMatch = queryOut.match(/\s+(REG_\w+)\s+/);
        if (typeMatch) detectedRegType = typeMatch[1];
      } catch { /* fallback to REG_SZ */ }

      disabledMap[key] = {
        rawName,
        name: opts.name || rawName,
        command: cmd,
        location,
        regType: detectedRegType,
      };

      try {
        cp.execFileSync('reg.exe', ['delete', regPath, '/v', rawName, '/f'], { windowsHide: true });
      } catch (err: any) {
        logger.warn(`[Startup] Échec suppression registre (${location}):`, err.message);
        return {
          success: false,
          error: location === 'HKLM'
            ? 'Droits administrateur requis pour désactiver une entrée système (HKLM).'
            : `Erreur de modification du registre : ${err.message}`
        };
      }
      saveDisabledStartup(disabledMap);
      cachedStartupItems = null;
      return { success: true, enabled: false };
    } else {
      const saved = disabledMap[key];
      const cmdToRestore = opts.command || saved?.command;

      if (cmdToRestore) {
        const regPath = location === 'HKLM'
          ? 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
          : 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
        try {
          cp.execFileSync('reg.exe', ['add', regPath, '/v', rawName, '/t', saved?.regType || 'REG_SZ', '/d', cmdToRestore, '/f'], { windowsHide: true });
        } catch (err: any) {
          logger.warn(`[Startup] Échec restauration registre (${location}):`, err.message);
          return {
            success: false,
            error: location === 'HKLM'
              ? 'Droits administrateur requis pour restaurer une entrée système (HKLM).'
              : `Erreur d'écriture dans le registre : ${err.message}`
          };
        }
      }
      delete disabledMap[key];
      saveDisabledStartup(disabledMap);
      cachedStartupItems = null;
      return { success: true, enabled: true };
    }
  });

  // Alias for backward compatibility
  ipcMain.handle('perf:disable-startup', async (_, arg1: any, arg2?: any) => {
    const rawName = typeof arg1 === 'object' && arg1 !== null ? (arg1.rawName || arg1.name) : String(arg1 || '');
    const rawLocation = typeof arg1 === 'object' && arg1 !== null ? arg1.location : String(arg2 || 'HKCU');
    return ipcMain.emit('perf:set-startup-app', null, { rawName, location: rawLocation, enabled: false });
  });

  // ── Real Disk Storage Analysis (Calcul exact, sans valeurs fictives) ─────
  ipcMain.handle('perf:analyze-disk-cleanup', async () => {
    try {
      const items = await analyzeStorageCategories();
      const totalBytes = items.filter(i => !i.inaccessible).reduce((s, i) => s + i.bytes, 0);
      return {
        success: true,
        items,
        totalBytes,
        totalDisplay: formatBytes(totalBytes),
      };
    } catch (err: any) {
      logger.error('[Performance] Erreur lors de l\'analyse du stockage :', err);
      return { success: false, items: [], error: err.message };
    }
  });

  // ── Execute Real Disk Cleanup & Maintenance (Mesure réelle fs.statfs) ──────
  ipcMain.handle('perf:disk-cleanup', async (_, payload?: { items?: string[] }) => {
    // Aucune sélection implicite : l'appelant doit désigner explicitement les catégories à nettoyer.
    const selected = Array.isArray(payload?.items) ? payload.items : [];
    logger.info('[Performance] Lancement de la maintenance sur les catégories :', selected);
    try {
      const report = await executeStorageCleanup(selected, win, notifyFn);
      return report;
    } catch (err: any) {
      logger.error('[Performance] Échec de la maintenance :', err);
      return {
        success: false,
        error: err.message,
        categoriesCleaned: [],
        deletedFilesCount: 0,
        deletedBytes: 0,
        skippedFilesCount: 0,
        errors: [err.message],
        observedFreeDeltaBytes: 0,
        durationMs: 0,
        freedDisplay: '0 Mo',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // ── Scheduled Maintenance Settings & Next Run Calculation ─────────────────
  ipcMain.handle('perf:get-maintenance-schedule', async () => {
    try {
      const prefs = loadPreferences();
      const schedule = prefs.maintenanceSchedule;
      const nextRun = calculateNextMaintenanceRun(schedule);
      return {
        success: true,
        schedule,
        nextRun,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('perf:save-maintenance-schedule', async (_, newSchedule: any) => {
    try {
      const updated = savePreferences({ maintenanceSchedule: newSchedule });
      const nextRun = calculateNextMaintenanceRun(updated.maintenanceSchedule);
      // Notify the scheduler to re-read settings and reschedule immediately
      notifyScheduleChanged();
      return {
        success: true,
        schedule: updated.maintenanceSchedule,
        nextRun,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Per-Disk cleanup : lettre explicite obligatoire, aucune cible implicite, Corbeille + caches connus uniquement ──
  ipcMain.handle('perf:scan-disk-junk', async (_, driveLetter: unknown) => {
    try { return await scanDriveJunk(driveLetter); }
    catch (e: any) {
      logger.error('[Performance] Analyse du lecteur impossible :', e);
      return { success: false, driveLetter: '', totalBytes: 0, totalMB: 0, totalFormatted: '—', categories: [], summary: 'Analyse indisponible.', errorMessage: e?.message || 'erreur inattendue lors de l\'analyse du disque.' };
    }
  });

  ipcMain.handle('perf:clean-disk-junk', async (_, driveLetter: unknown, options?: { emptyRecycleBin?: boolean }) => {
    logger.info('[Performance] Nettoyage ciblé du lecteur demandé :', typeof driveLetter === 'string' ? driveLetter : '(invalide)');
    try { return await cleanDriveJunk(driveLetter, { emptyRecycleBin: options?.emptyRecycleBin === true }); }
    catch (e: any) {
      logger.error('[Performance] Nettoyage du lecteur impossible :', e);
      return { success: false, partial: false, driveLetter: '', categoriesCleaned: [], deletedFilesCount: 0, deletedBytes: 0, skippedFilesCount: 0, errors: [e?.message || 'erreur'], freedDisplay: '0 Mo', message: '', error: e?.message || 'erreur inattendue' };
    }
  });

  // ── Clean RAM (Suppression de la fausse purge GC.Collect - Phase 2) ──────────
  ipcMain.handle('perf:clean-ram', async () => {
    logger.info('[Performance] Purge RAM désactivée : [System.GC]::Collect() supprimé. EmptyWorkingSet requiert le service privilégié Phase 3/7.');
    return {
      success: false,
      status: 'unavailable',
      message: 'Purge RAM non disponible — La fausse purge [System.GC]::Collect() a été supprimée. Une purge réelle (EmptyWorkingSet) requiert le service privilégié de la Phase 3/7.',
      freedMb: 0,
    };
  });

  // ── EmptyWorkingSet Expérimental (Lot 2 / Phase 9) ──────────────────────────
  ipcMain.handle('perf:empty-working-set', async (_, opts?: { userConsent?: boolean }) => {
    const userConsent = Boolean(opts?.userConsent);
    if (!userConsent) {
      logger.info('[Performance] perf:empty-working-set : Refusé sans consentement explicite.');
      return {
        success: false,
        status: 'consent_required',
        message: 'Opération expérimentale. Le consentement explicite de l\'utilisateur est requis car vider le working set déplace les pages mémoire vers le swap et peut générer des micro-ralentissements (page faults).',
        workingSetReducedMB: 0,
      };
    }

    logger.info('[Performance] Exécution contrôlée de EmptyWorkingSet avec consentement utilisateur...');
    const freeBefore = os.freemem();

    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32Mem {
          [DllImport("psapi.dll")]
          public static extern int EmptyWorkingSet(IntPtr hwProc);
        }
"@ -ErrorAction SilentlyContinue

      $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Id -gt 4 -and
        $_.ProcessName -notmatch '^(csrss|dwm|lsass|smss|services|svchost|system|wininit|winlogon|astral-vanguard)$'
      }

      $count = 0
      foreach ($p in $procs) {
        try {
          $res = [Win32Mem]::EmptyWorkingSet($p.Handle)
          if ($res -ne 0) { $count++ }
        } catch {}
      }
      [PSCustomObject]@{ processed = $count } | ConvertTo-Json -Compress
    `;

    try {
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 8000 });
      const freeAfter = os.freemem();
      const reducedMB = Math.max(0, Math.round((freeAfter - freeBefore) / (1024 * 1024)));

      return {
        success: true,
        status: 'completed',
        workingSetReducedMB: reducedMB,
        pageFaultWarning: 'Avertissement : la réduction du jeu de travail (working set) transfère les données inactives vers le fichier d\'échange. Des défauts de page (page faults) surviendront lors du réaccès aux applications.',
        honestNote: 'Réduction ponctuelle du jeu de travail (non qualifiée d\'optimisation permanente).',
        processedProcesses: res?.data?.processed || 0,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'error',
        message: err.message,
        workingSetReducedMB: 0,
      };
    }
  });

  // ── Process Manager (List & Kill non-system process) ───────────────────────
  ipcMain.handle('perf:get-processes', async () => {
    const script = `
      Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CPU -gt 0 -or $_.WorkingSet64 -gt 10MB } |
        Sort-Object WorkingSet64 -Descending |
        Select-Object -First 35 -Property Id, ProcessName,
          @{Name="MemoryMB"; Expression={[Math]::Round($_.WorkingSet64 / 1MB, 1)}},
          @{Name="CpuTime"; Expression={[Math]::Round($_.CPU, 1)}} |
        ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 6000 });
    let procs = res.data || [];
    if (!Array.isArray(procs)) procs = procs ? [procs] : [];
    return { success: true, processes: procs };
  });

  ipcMain.handle('perf:kill-process', async (_, pid: number) => {
    // Validation stricte du PID : entier strictement positif raisonnable (Phase 1)
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 4 || pid > 65535) {
      logger.warn(`[Security] perf:kill-process: PID invalide rejeté (${pid})`);
      return { success: false, error: 'Identifiant de processus (PID) invalide.' };
    }

    // Protection des processus système critiques (Lot 2 / Phase 9)
    try {
      const checkScript = `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`;
      const checkRes = await runPowerShell<string>(checkScript, { timeout: 2000 });
      const procName = (checkRes?.data || '').toLowerCase().trim();
      if (procName && (CRITICAL_SYSTEM_PROCESSES.has(procName) || CRITICAL_SYSTEM_PROCESSES.has(`${procName}.exe`))) {
        logger.warn(`[Security] perf:kill-process: Tentative d'arrêt d'un processus système critique refusée (${procName}, PID ${pid})`);
        return {
          success: false,
          error: `Le processus système critique [${procName}] ne peut pas être arrêté pour préserver la stabilité de Windows.`,
        };
      }
    } catch {}

    logger.info(`Fermeture du processus PID ${pid}...`);
    const script = `
      Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue
      [PSCustomObject]@{ killed = $true } | ConvertTo-Json -Compress
    `;
    const res = await runPowerShell(script, { asJson: true });
    return { success: res.success };
  });

  // ── Multi-Disk Physical Health (SMART) Ordered by Windows Disk Number ───────
  // ── Multi-Disk Physical Health (SMART) Ordered by Windows Disk Number ───────
  ipcMain.handle('perf:get-disk-health', async () => {
    const script = `
      $disks = Get-Disk -ErrorAction SilentlyContinue | Sort-Object Number
      $phys = Get-PhysicalDisk -ErrorAction SilentlyContinue

      $out = foreach ($d in $disks) {
        $p = $phys | Where-Object { $_.DeviceId -eq [string]$d.Number -or $_.FriendlyName -eq $d.FriendlyName } | Select-Object -First 1
        $parts = if ($d) { Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue } else { @() }
        
        $volList = foreach ($part in $parts) {
          if ($part.DriveLetter) {
            $vol = $part | Get-Volume -ErrorAction SilentlyContinue
            if ($vol) {
              [PSCustomObject]@{
                drive = "$($part.DriveLetter):"
                label = [string]$vol.FileSystemLabel
                fileSystem = [string]$vol.FileSystem
                sizeGB = [math]::Round($vol.Size / 1GB, 1)
                freeGB = [math]::Round($vol.SizeRemaining / 1GB, 1)
                usedGB = [math]::Round(($vol.Size - $vol.SizeRemaining) / 1GB, 1)
                usedPct = if ($vol.Size -gt 0) { [math]::Round((($vol.Size - $vol.SizeRemaining) / $vol.Size) * 100, 1) } else { 0 }
                health = [string]$vol.HealthStatus
              }
            }
          }
        }

        $letters = ($parts | Where-Object { $_.DriveLetter } | ForEach-Object { "$($_.DriveLetter):" }) -join ', '
        $isBoot = [bool]($parts | Where-Object { $_.IsBoot })

        $media = if ($p -and $p.MediaType -and $p.MediaType -ne 'Unspecified') {
          $p.MediaType
        } elseif ($d.BusType -eq 'NVMe') {
          'SSD'
        } elseif ($d.BusType -eq 'USB') {
          'USB'
        } else {
          'SSD'
        }

        $op = if ($p) { [string]$p.OperationalStatus } else { [string]$d.OperationalStatus }
        $hs = if ($p) { [string]$p.HealthStatus } else { [string]$d.HealthStatus }

        [PSCustomObject]@{
          number = $d.Number
          friendlyName = if ($p) { $p.FriendlyName } else { $d.FriendlyName }
          busType = [string]$d.BusType
          mediaType = [string]$media
          partitionStyle = [string]$d.PartitionStyle
          driveLetters = $letters
          isSystemDisk = $isBoot
          healthStatus = $hs
          operationalStatus = $op
          totalSizeGB = [math]::Round($d.Size / 1GB, 1)
          volumes = $volList
        }
      }
      $out | ConvertTo-Json -Depth 4 -Compress
    `;
    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 9000 });
      let rawDisks = res.data || [];
      if (!Array.isArray(rawDisks)) rawDisks = rawDisks ? [rawDisks] : [];

      const disks = rawDisks.map((d: any) => {
        const media = String(d.mediaType || 'SSD');
        const bus = String(d.busType || '');
        const totalGB = typeof d.totalSizeGB === 'number' ? d.totalSizeGB : 0;
        const isHealthy = d.healthStatus === 'Healthy' || d.operationalStatus === 'OK' || d.operationalStatus === 'Online';
        const diskNum = typeof d.number === 'number' ? d.number : 0;
        const isSystem = Boolean(d.isSystemDisk);
        const driveLetters = d.driveLetters ? String(d.driveLetters).trim() : '';

        let rawVols = d.volumes || [];
        if (!Array.isArray(rawVols)) rawVols = rawVols ? [rawVols] : [];

        let totalUsedGB = 0;
        let totalFreeGB = 0;
        let primaryLabel = '';

        for (const v of rawVols) {
          totalUsedGB += Number(v.usedGB || 0);
          totalFreeGB += Number(v.freeGB || 0);
          if (v.label && !primaryLabel) primaryLabel = v.label;
        }

        totalUsedGB = Math.round(totalUsedGB * 10) / 10;
        totalFreeGB = Math.round(totalFreeGB * 10) / 10;
        const usedPercent = totalGB > 0 ? Math.min(100, Math.round((totalUsedGB / totalGB) * 100)) : 0;

        let typeLabel = 'SSD SATA';
        if (bus === 'NVMe' || media.includes('NVMe')) typeLabel = 'SSD NVMe M.2';
        else if (media === 'HDD') typeLabel = 'Disque dur HDD';
        else if (bus === 'USB') typeLabel = 'Disque Externe USB';
        else if (media === 'SSD') typeLabel = 'SSD Flash SATA';

        // Qualification rigoureuse : état de santé Windows (Storage Management API) vs compteurs SMART réels
        const windowsHealthText = isHealthy ? 'Sain (rapporté par Windows Storage Management)' : 'Attention requise (signalé par Windows)';
        const smartDetailText = 'Compteurs détaillés S.M.A.R.T. : restreints (nécessite élévation administrateur via root\\wmi)';

        const fsSummary = rawVols.length > 0
          ? rawVols.map((v: any) => `${v.drive} (${v.fileSystem || 'NTFS'})`).join(', ')
          : 'Non alloué';

        return {
          diskNumber: diskNum,
          model: `Disque ${diskNum} · ${d.friendlyName || 'Stockage'}`,
          FriendlyName: d.friendlyName,
          mediaType: typeLabel,
          MediaType: media,
          busType: bus,
          partitionStyle: d.partitionStyle || 'GPT',
          driveLetters,
          volumeLabel: primaryLabel,
          isSystemDisk: isSystem,
          health: isHealthy ? 'Sain' : 'Attention',
          windowsHealth: windowsHealthText,
          smartDetail: smartDetailText,
          smartHealth: windowsHealthText,
          HealthStatus: windowsHealthText,
          healthStatusText: windowsHealthText,
          fileSystemStatus: fsSummary,
          status: d.operationalStatus || 'OK',
          sizeGB: totalGB,
          usedGB: totalUsedGB,
          freeGB: totalFreeGB,
          usedPercent,
          volumes: rawVols,
        };
      });

      // Ordre stable : disque Windows en premier, puis lettre de lecteur croissante, puis disques sans lettre par numéro.
      const firstLetter = (d: any) => (String(d.driveLetters || '').match(/[A-Z]/i)?.[0] || '~').toUpperCase();
      disks.sort((a: any, b: any) =>
        Number(b.isSystemDisk) - Number(a.isSystemDisk) ||
        firstLetter(a).localeCompare(firstLetter(b)) ||
        (a.diskNumber ?? 0) - (b.diskNumber ?? 0));

      return { success: true, disks };
    } catch {
      return { success: true, disks: [] };
    }
  });
}
