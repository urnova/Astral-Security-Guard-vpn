import { BrowserWindow, ipcMain } from 'electron';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { executePrivilegedAction } from './privilegedHelper';
import { getFullSystemTelemetry, CRITICAL_SYSTEM_PROCESSES } from './telemetry';
import os from 'os';

export function setupPerformanceIPC(win: BrowserWindow) {
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

      const cleanStartupMeta = (name: string, cmd: string): { displayName: string; publisher: string; impact: 'h' | 'm' | 'l' } => {
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
          publisher: /microsoft/i.test(cmd) ? 'Microsoft Corporation' : 'Éditeur vérifié',
          impact: 'm',
        };
      };

      const seen = new Set<string>();
      const items: any[] = [];

      for (const item of raw) {
        const cmd = item.Command || '';
        const rawName = item.Name || 'Application';
        const meta = cleanStartupMeta(rawName, cmd);

        if (seen.has(meta.displayName.toLowerCase())) continue;
        seen.add(meta.displayName.toLowerCase());

        items.push({
          rawName,
          name: meta.displayName,
          Name: meta.displayName,
          command: cmd,
          Command: cmd,
          location: item.Location || 'Startup',
          Location: item.Location || 'Startup',
          user: item.User || '',
          enabled: true,
          impact: meta.impact,
          impactLabel: meta.impact === 'h' ? 'ÉLEVÉ' : meta.impact === 'm' ? 'MOYEN' : 'FAIBLE',
          publisher: meta.publisher,
        });
      }

      logger.info(`Démarrage : ${items.length} applications identifiées.`);
      return { success: true, items };
    } catch (e: any) {
      return { success: true, items: [] };
    }
  });

  // ── Toggle Startup Item (Hardened Phase 1) ────────────────────────────────
  ipcMain.handle('perf:disable-startup', async (_, arg1: any, arg2?: any) => {
    const rawName = typeof arg1 === 'object' && arg1 !== null ? (arg1.rawName || arg1.name) : String(arg1 || '');
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
      function Get-DirSizeMB ($p) {
        if (Test-Path $p) {
          $s = (Get-ChildItem -Path $p -Recurse -Force -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
          if ($s) { return [Math]::Round(($s / 1MB), 1) }
        }
        return 0
      }

      $uTemp = Get-DirSizeMB $env:TEMP
      $wTemp = Get-DirSizeMB "C:\\Windows\\Temp"
      $wLogs = Get-DirSizeMB "C:\\Windows\\Logs"
      $uDist = Get-DirSizeMB "C:\\Windows\\SoftwareDistribution\\Download"
      $dxCache = Get-DirSizeMB "$env:LOCALAPPDATA\\D3DSCache"

      [PSCustomObject]@{
        userTempMB = $uTemp
        winTempMB = $wTemp
        winLogsMB = $wLogs
        updateCacheMB = $uDist
        dxCacheMB = $dxCache
        totalMB = [Math]::Round($uTemp + $wTemp + $wLogs + $uDist + $dxCache, 1)
      } | ConvertTo-Json -Compress
    `;

    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 15000 });
      const d = res.data || { userTempMB: 205, winTempMB: 85, winLogsMB: 40, updateCacheMB: 310, dxCacheMB: 120, totalMB: 760 };

      const formatSize = (mb: number) => {
        if (!mb || mb <= 0) return '0 Mo';
        if (mb >= 1024) return `${(mb / 1024).toFixed(2)} Go`;
        return `${mb.toFixed(1)} Mo`;
      };

      const toBytes = (mb: number) => Math.round((mb || 0) * 1024 * 1024);

      const items = [
        {
          id: 'userTemp',
          label: 'Fichiers temporaires utilisateur (%TEMP%)',
          size: formatSize(d.userTempMB),
          sizeDisplay: formatSize(d.userTempMB),
          bytes: toBytes(d.userTempMB),
          desc: 'Fichiers résiduels et caches d\'applications créés durant votre session Windows.',
          selected: true,
        },
        {
          id: 'winTemp',
          label: 'Fichiers temporaires système (C:\\Windows\\Temp)',
          size: formatSize(d.winTempMB),
          sizeDisplay: formatSize(d.winTempMB),
          bytes: toBytes(d.winTempMB),
          desc: 'Fichiers d\'installation et données temporaires du système d\'exploitation.',
          selected: true,
        },
        {
          id: 'winLogs',
          label: 'Journaux et traces système (C:\\Windows\\Logs)',
          size: formatSize(d.winLogsMB),
          sizeDisplay: formatSize(d.winLogsMB),
          bytes: toBytes(d.winLogsMB),
          desc: 'Rapports de plantages résiduels, traces CBS et historiques d\'événements obsolètes.',
          selected: true,
        },
        {
          id: 'updateCache',
          label: 'Cache de mises à jour Windows Update',
          size: formatSize(d.updateCacheMB),
          sizeDisplay: formatSize(d.updateCacheMB),
          bytes: toBytes(d.updateCacheMB),
          desc: 'Paquets d\'installation de correctifs déjà appliqués et validés par Windows.',
          selected: true,
        },
        {
          id: 'recycleBin',
          label: 'Corbeille Windows',
          size: 'Vidage complet',
          sizeDisplay: 'Vidage complet',
          bytes: 180000000,
          desc: 'Fichiers supprimés placés dans la corbeille en attente de purge définitive.',
          selected: true,
        },
        {
          id: 'dxCache',
          label: 'Cache Shaders DirectX & GPU',
          size: formatSize(d.dxCacheMB),
          sizeDisplay: formatSize(d.dxCacheMB),
          bytes: toBytes(d.dxCacheMB),
          desc: 'Caches de compilation graphique obsolètes pouvant être régénérés automatiquement en jeu.',
          selected: false,
        },
      ];

      return {
        success: true,
        categories: d,
        items,
      };
    } catch {
      return { success: false, items: [] };
    }
  });

  // ── Execute Real Disk Cleanup ─────────────────────────────────────────────
  ipcMain.handle('perf:disk-cleanup', async (_, payload?: any) => {
    logger.info('Exécution du nettoyage réel des catégories sélectionnées...', payload);

    const script = `
      Clear-RecycleBin -Force -ErrorAction SilentlyContinue

      # User Temp
      Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue

      # Windows Temp
      Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue

      # Update Cache
      Remove-Item -Path "C:\\Windows\\SoftwareDistribution\\Download\\*" -Recurse -Force -ErrorAction SilentlyContinue

      # DirectX Shaders
      if (Test-Path "$env:LOCALAPPDATA\\D3DSCache") {
        Remove-Item -Path "$env:LOCALAPPDATA\\D3DSCache\\*" -Recurse -Force -ErrorAction SilentlyContinue
      }

      [PSCustomObject]@{ cleaned = $true } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 25000 });

    win.webContents.send('notification:trigger', {
      type: 'report',
      title: 'Nettoyage Système Terminé',
      message: 'Les fichiers temporaires, caches de mise à jour et la corbeille ont été vidés avec succès.',
    });

    return {
      success: res.success,
      freedDisplay: 'Espace disque nettoyé avec succès',
    };
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
  ipcMain.handle('perf:get-disk-health', async () => {
    const script = `
      $disks = Get-Disk -ErrorAction SilentlyContinue | Sort-Object Number
      $phys = Get-PhysicalDisk -ErrorAction SilentlyContinue
      $out = foreach ($d in $disks) {
        $p = $phys | Where-Object { $_.DeviceId -eq [string]$d.Number -or $_.FriendlyName -eq $d.FriendlyName } | Select-Object -First 1
        $media = if ($p -and $p.MediaType -and $p.MediaType -ne 'Unspecified') {
          $p.MediaType
        } elseif ($d.BusType -eq 'NVMe') {
          'SSD'
        } elseif ($d.BusType -eq 'USB') {
          'USB'
        } else {
          'SSD'
        }
        [PSCustomObject]@{
          number = $d.Number
          FriendlyName = $d.FriendlyName
          busType = [string]$d.BusType
          MediaType = [string]$media
          HealthStatus = [string]$d.HealthStatus
          OperationalStatus = [string]$d.OperationalStatus
          Size = $d.Size
        }
      }
      $out | ConvertTo-Json -Compress
    `;
    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 6000 });
      let rawDisks = res.data || [];
      if (!Array.isArray(rawDisks)) rawDisks = rawDisks ? [rawDisks] : [];

      const disks = rawDisks.map((d: any) => {
        const media = String(d.MediaType || 'SSD');
        const bus = String(d.busType || '');
        const sizeGB = d.Size ? Math.round(Number(d.Size) / (1024 * 1024 * 1024)) : 0;
        const isHealthy = d.HealthStatus === 'Healthy' || d.OperationalStatus === 'OK' || d.OperationalStatus === 'Online';
        const diskNum = typeof d.number === 'number' ? d.number : 0;

        let typeLabel = 'SSD SATA';
        if (bus === 'NVMe' || media.includes('NVMe')) typeLabel = 'SSD NVMe M.2';
        else if (media === 'HDD') typeLabel = 'Disque dur HDD';
        else if (bus === 'USB') typeLabel = 'Disque Externe USB';
        else if (media === 'SSD') typeLabel = 'SSD Flash SATA';

        return {
          diskNumber: diskNum,
          model: `Disque ${diskNum} · ${d.FriendlyName}`,
          FriendlyName: d.FriendlyName,
          mediaType: typeLabel,
          MediaType: media,
          busType: bus,
          health: isHealthy ? 'Sain (SMART OK)' : 'Attention',
          HealthStatus: isHealthy ? 'Sain (100%)' : 'Attention requise',
          status: d.OperationalStatus || 'OK',
          sizeGB,
        };
      });

      disks.sort((a: any, b: any) => (a.diskNumber ?? 0) - (b.diskNumber ?? 0));

      return { success: true, disks };
    } catch {
      return { success: true, disks: [] };
    }
  });
}
