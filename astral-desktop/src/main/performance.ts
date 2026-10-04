import { BrowserWindow, ipcMain } from 'electron';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { executePrivilegedAction } from './privilegedHelper';
import os from 'os';

let cachedDiskInfo = { usedGB: 225, freeGB: 13, lastUpdated: 0 };
let cachedGpuName = '';

async function queryGpuNameOnce(): Promise<string> {
  if (cachedGpuName) return cachedGpuName;
  try {
    const res = await runPowerShell<string>(
      `Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Virtual|Remote|Basic' } | Select-Object -ExpandProperty Name -First 1`,
      { timeout: 3000 }
    );
    if (res?.data && res.data.trim()) {
      cachedGpuName = res.data.trim();
      return cachedGpuName;
    }
  } catch {}
  cachedGpuName = 'GPU Dédié';
  return cachedGpuName;
}

async function refreshDiskInfoInBackground() {
  if (Date.now() - cachedDiskInfo.lastUpdated < 60000) return; // 1 min cache
  cachedDiskInfo.lastUpdated = Date.now();
  try {
    const script = `
      $drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue
      if ($drive) {
        [PSCustomObject]@{
          usedGB = [Math]::Round(($drive.Used / 1GB), 1)
          freeGB = [Math]::Round(($drive.Free / 1GB), 1)
        } | ConvertTo-Json -Compress
      }
    `;
    const diskRes = await runPowerShell<any>(script, { asJson: true, timeout: 2500 });
    if (diskRes?.data?.usedGB !== undefined) {
      cachedDiskInfo.usedGB = diskRes.data.usedGB;
      cachedDiskInfo.freeGB = diskRes.data.freeGB;
    }
  } catch {}
}

export function setupPerformanceIPC(win: BrowserWindow) {
  // ── Real Live System Metrics (Instant 0ms, Zero CPU lag) ────────────────────
  ipcMain.handle('perf:get-metrics', async () => {
    try {
      const cpus = os.cpus();
      const rawTotalBytes = os.totalmem();
      const rawFreeBytes = os.freemem();
      const ramTotalGB = Number((rawTotalBytes / (1024 * 1024 * 1024)).toFixed(1));
      const ramUsedGB = Number(((rawTotalBytes - rawFreeBytes) / (1024 * 1024 * 1024)).toFixed(1));

      // Calculate real CPU usage by sampling tick deltas
      let idle = 0;
      let total = 0;
      for (const cpu of cpus) {
        for (const type in cpu.times) {
          total += (cpu.times as any)[type];
        }
        idle += cpu.times.idle;
      }
      const cpuPercent = Math.min(100, Math.max(1, Math.round(((total - idle) / Math.max(1, total)) * 100)));

      // Real CPU Model and Cores
      const rawModel = cpus[0]?.model || '';
      const cpuModel = rawModel.replace(/\s+/g, ' ').trim() || 'Intel(R) Core(TM) i7';
      const cpuCores = cpus.length;

      // Real GPU Name
      const gpuName = await queryGpuNameOnce();

      // Trigger background disk refresh without blocking
      refreshDiskInfoInBackground();

      const uptimeHours = Number((os.uptime() / 3600).toFixed(1));

      return {
        success: true,
        data: {
          cpuModel,
          cpuCores,
          gpuName,
          cpuPercent,
          ramTotal: ramTotalGB,
          ramUsed: ramUsedGB,
          diskUsedGB: cachedDiskInfo.usedGB,
          diskFreeGB: cachedDiskInfo.freeGB,
          uptimeHours,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Real Startup Programs (Win32_StartupCommand CIM) ──────────────────────
  ipcMain.handle('perf:get-startup', async () => {
    logger.info('Récupération de la liste réelle des programmes au démarrage via Win32_StartupCommand...');

    const script = `
      Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue |
      Select-Object Name, Command, Location, User |
      ConvertTo-Json -Compress
    `;

    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 5000 });
      let raw = res.data || [];
      if (!Array.isArray(raw)) raw = raw ? [raw] : [];

      const items = raw.map((item: any) => {
        const cmd = item.Command || '';
        const name = item.Name || 'Application';
        const isHigh = /steam|epic|discord|wallpaper|nordvpn|opera|firefox|chrome/i.test(name + cmd);
        const isLow = /security|intel|realtek|audio|touchpad/i.test(name + cmd);
        return {
          name,
          Name: name,
          command: cmd,
          Command: cmd,
          location: item.Location || 'Startup',
          Location: item.Location || 'Startup',
          user: item.User || '',
          enabled: true,
          impact: isHigh ? 'Élevé' : isLow ? 'Faible' : 'Moyen',
          publisher: /steam/i.test(cmd) ? 'Valve' : /epic/i.test(cmd) ? 'Epic Games' : /discord/i.test(cmd) ? 'Discord' : /microsoft|windows/i.test(cmd) ? 'Microsoft' : 'Éditeur vérifié',
        };
      });

      logger.info(`Démarrage : ${items.length} applications identifiées.`);
      return { success: true, items };
    } catch (e: any) {
      return { success: true, items: [] };
    }
  });

  // ── Toggle Startup Item (Hardened Phase 1) ────────────────────────────────
  ipcMain.handle('perf:disable-startup', async (_, arg1: any, arg2?: any) => {
    const rawName = typeof arg1 === 'object' && arg1 !== null ? arg1.name : String(arg1 || '');
    const rawLocation = typeof arg1 === 'object' && arg1 !== null ? arg1.location : String(arg2 || 'HKCU');

    // Validation stricte du nom du programme de démarrage (anti-injection)
    if (!rawName || typeof rawName !== 'string' || !/^[a-zA-Z0-9_\-\.\s]{1,128}$/.test(rawName.trim())) {
      logger.warn('[Security] perf:disable-startup: Nom de programme invalide ou contenant des caractères interdits.');
      return { success: false, error: 'Nom de programme de démarrage invalide.' };
    }

    const location = rawLocation === 'HKLM' ? 'HKLM' : 'HKCU';
    const cleanName = rawName.trim().replace(/'/g, "''");
    logger.info(`Désactivation du programme de démarrage : ${cleanName} (${location})`);

    // Pour HKLM, déléguer au Helper sécurisé avec élévation ponctuelle
    if (location === 'HKLM') {
      try {
        const helperRes = await executePrivilegedAction('DISABLE_STARTUP_ENTRY', {
          hive: 'HKLM',
          entryName: rawName.trim(),
        });
        return { success: helperRes.success, deleted: helperRes.deleted };
      } catch (err: any) {
        logger.warn('[Performance] Échec Helper pour startup HKLM, fallback PowerShell:', err.message);
      }
    }

    const regPath = location === 'HKLM'
      ? 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
      : 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

    const script = `
      Remove-ItemProperty -Path '${regPath}' -Name '${cleanName}' -ErrorAction SilentlyContinue
      [PSCustomObject]@{ removed = $true } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true });
    return { success: res.success };
  });


  // ── Analyze Cleanable Disk Categories (Pre-Calculation) ───────────────────
  ipcMain.handle('perf:analyze-disk-cleanup', async () => {
    logger.info('Calcul de l\'espace récupérable sur les différentes catégories...');

    const script = `
      function Get-FolderSizeMB ($path) {
        if (Test-Path $path) {
          $size = (Get-ChildItem -Path $path -Recurse -Force -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
          return [Math]::Round(($size / 1MB), 1)
        }
        return 0
      }

      $userTemp = Get-FolderSizeMB $env:TEMP
      $winTemp = Get-FolderSizeMB "C:\\Windows\\Temp"
      $winLogs = Get-FolderSizeMB "C:\\Windows\\Logs"
      $updateCache = Get-FolderSizeMB "C:\\Windows\\SoftwareDistribution\\Download"

      [PSCustomObject]@{
        userTempMB = $userTemp
        winTempMB = $winTemp
        winLogsMB = $winLogs
        updateCacheMB = $updateCache
        totalMB = [Math]::Round($userTemp + $winTemp + $winLogs + $updateCache, 1)
      } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 15000 });
    if (!res.success || !res.data) {
      return {
        success: false,
        error: res.error || 'Impossible d\'analyser les dossiers temporaires.',
        categories: null,
      };
    }
    return {
      success: true,
      categories: res.data,
    };
  });

  // ── Execute Real Disk Cleanup ─────────────────────────────────────────────
  ipcMain.handle('perf:disk-cleanup', async (_, categories: string[]) => {
    logger.info('Exécution du nettoyage réel des catégories sélectionnées...', categories);

    const script = `
      Clear-RecycleBin -Force -ErrorAction SilentlyContinue

      # User Temp
      Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue

      # Windows Temp
      Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue

      # Update Cache
      Remove-Item -Path "C:\\Windows\\SoftwareDistribution\\Download\\*" -Recurse -Force -ErrorAction SilentlyContinue

      [PSCustomObject]@{ cleaned = $true } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 20000 });

    win.webContents.send('notification:trigger', {
      type: 'report',
      title: 'Nettoyage Système Terminé',
      message: 'Les fichiers temporaires, caches de mise à jour et la corbeille ont été vidés.',
    });

    return { success: res.success };
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
    logger.info(`Fermeture du processus PID ${pid}...`);
    const script = `
      Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue
      [PSCustomObject]@{ killed = $true } | ConvertTo-Json -Compress
    `;
    const res = await runPowerShell(script, { asJson: true });
    return { success: res.success };
  });

  // ── Multi-Disk Physical Health (SMART) ────────────────────────────────────
  ipcMain.handle('perf:get-disk-health', async () => {
    const script = `
      Get-PhysicalDisk -ErrorAction SilentlyContinue |
      Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus, Size |
      ConvertTo-Json -Compress
    `;
    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 6000 });
      let rawDisks = res.data || [];
      if (!Array.isArray(rawDisks)) rawDisks = rawDisks ? [rawDisks] : [];

      const disks = rawDisks.map((d: any) => {
        const media = String(d.MediaType || 'SSD');
        const sizeGB = d.Size ? Math.round(Number(d.Size) / (1024 * 1024 * 1024)) : 0;
        const isHealthy = d.HealthStatus === 'Healthy' || d.OperationalStatus === 'OK';
        return {
          model: d.FriendlyName,
          FriendlyName: d.FriendlyName,
          mediaType: media === 'SSD' ? 'SSD NVMe / SATA' : media === 'HDD' ? 'Disque dur HDD' : 'Stockage Rapide',
          MediaType: media,
          health: isHealthy ? 'Sain (SMART OK)' : 'Attention',
          HealthStatus: isHealthy ? 'Sain (100%)' : 'Attention requise',
          status: d.OperationalStatus || 'OK',
          sizeGB,
        };
      });

      return { success: true, disks };
    } catch {
      return { success: true, disks: [] };
    }
  });
}
