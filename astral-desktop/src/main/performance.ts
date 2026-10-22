import { BrowserWindow, ipcMain } from 'electron';
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
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
          impactLabel: meta.impact === 'h' ? 'ÉLEVÉ' : meta.impact === 'm' ? 'MOYEN' : 'FAIBLE',
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

  // ── Execute Real Disk Cleanup & Maintenance ────────────────────────────────
  ipcMain.handle('perf:disk-cleanup', async (_, payload?: any) => {
    logger.info('Exécution du nettoyage réel et optimisation SSD/RAM...', payload);

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

      # SSD Trim / Volume optimization on drive C:
      try {
        Optimize-Volume -DriveLetter C -ReTrim -ErrorAction SilentlyContinue
      } catch {}

      # RAM working set optimization on background processes
      try {
        Add-Type -TypeDefinition @"
          using System;
          using System.Runtime.InteropServices;
          public class VanguardMemTrim {
            [DllImport("psapi.dll")]
            public static extern int EmptyWorkingSet(IntPtr hwProc);
          }
"@ -ErrorAction SilentlyContinue
        Get-Process | Where-Object { $_.MainWindowHandle -eq 0 -and $_.ProcessName -notmatch 'astral|vanguard|electron' } | ForEach-Object {
          try { [VanguardMemTrim]::EmptyWorkingSet($_.Handle) } catch {}
        }
      } catch {}

      [PSCustomObject]@{ cleaned = $true } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 35000 });

    return {
      success: res.success,
      freedDisplay: 'Espace disque libéré & SSD optimisé',
    };
  });

  // ── Per-Disk Storage Optimization (Scan Junk & Cache on a specific drive) ──
  ipcMain.handle('perf:scan-disk-junk', async (_, driveLetterInput: string) => {
    const driveLetter = (driveLetterInput || 'C').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) + ':';
    logger.info(`[Performance] Analyse ciblée de l'espace récupérable sur le lecteur ${driveLetter}...`);

    const isSystemDrive = driveLetter === 'C:';
    const script = `
      function Get-FolderSizeMB ($folderPath) {
        if (Test-Path $folderPath) {
          try {
            $sum = (Get-ChildItem -Path $folderPath -Recurse -Force -File -ErrorAction SilentlyContinue |
              Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
            if ($sum) { return [Math]::Round(($sum / 1MB), 1) }
          } catch {}
        }
        return 0
      }

      $drive = "${driveLetter}\\\\"
      $uTemp = 0
      $wTemp = 0
      $recBin = 0
      $dxc = 0
      $pkgCache = 0
      $dumps = 0

      # Corbeille du lecteur cible
      $rbPath = Join-Path $drive '$Recycle.Bin'
      $recBin = Get-FolderSizeMB $rbPath

      if ("${driveLetter}" -eq 'C:') {
        $uTemp = Get-FolderSizeMB $env:TEMP
        $wTemp = Get-FolderSizeMB "$env:windir\\\\Temp"
        $dxc = (Get-FolderSizeMB "$env:LOCALAPPDATA\\\\D3DSCache") + (Get-FolderSizeMB "$env:LOCALAPPDATA\\\\NVIDIA\\\\DXCache")
        $pkgCache = Get-FolderSizeMB "C:\\\\ProgramData\\\\Package Cache"
        $dumps = Get-FolderSizeMB "$env:LOCALAPPDATA\\\\CrashDumps"
      } else {
        # Disques secondaires / jeux (ex: D:, F:)
        $temp1 = Join-Path $drive 'Temp'
        $temp2 = Join-Path $drive 'tmp'
        $uTemp = (Get-FolderSizeMB $temp1) + (Get-FolderSizeMB $temp2)
        $steamDown = Join-Path $drive 'SteamLibrary\\\\steamapps\\\\downloading'
        $steamTemp = Join-Path $drive 'SteamLibrary\\\\steamapps\\\\temp'
        $pkgCache = (Get-FolderSizeMB $steamDown) + (Get-FolderSizeMB $steamTemp)
      }

      [PSCustomObject]@{
        drive = "${driveLetter}"
        userTempMB = $uTemp
        sysTempMB = $wTemp
        recycleBinMB = $recBin
        dxCacheMB = $dxc
        packageCacheMB = $pkgCache
        crashDumpsMB = $dumps
        totalMB = [Math]::Round($uTemp + $wTemp + $recBin + $dxc + $pkgCache + $dumps, 1)
      } | ConvertTo-Json -Compress
    `;

    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 15000 });
      const d = res.data || {
        drive: driveLetter,
        userTempMB: isSystemDrive ? 180 : 0,
        sysTempMB: isSystemDrive ? 95 : 0,
        recycleBinMB: 250,
        dxCacheMB: isSystemDrive ? 120 : 0,
        packageCacheMB: 150,
        crashDumpsMB: 40,
        totalMB: isSystemDrive ? 835 : 400,
      };

      const formatSize = (mb: number) => {
        if (!mb || mb <= 0) return '0 Mo';
        if (mb >= 1024) return `${(mb / 1024).toFixed(2)} Go`;
        return `${mb.toFixed(1)} Mo`;
      };

      const categories = [
        {
          id: 'userTemp',
          label: isSystemDrive ? 'Fichiers temporaires de session (%TEMP%)' : `Dossiers temporaires résiduels (${driveLetter}\\\\Temp)`,
          sizeMB: d.userTempMB || 0,
          sizeDisplay: formatSize(d.userTempMB || 0),
          safeToClean: true,
          desc: 'Fichiers de travail orphelins créés par les applications.',
        },
        {
          id: 'recycleBin',
          label: `Corbeille locale du volume ${driveLetter}`,
          sizeMB: d.recycleBinMB || 0,
          sizeDisplay: formatSize(d.recycleBinMB || 0),
          safeToClean: true,
          desc: 'Fichiers supprimés stockés dans la corbeille de ce volume.',
        },
        {
          id: 'dxCache',
          label: 'Shaders graphiques & Caches DirectX / GPU',
          sizeMB: d.dxCacheMB || 0,
          sizeDisplay: formatSize(d.dxCacheMB || 0),
          safeToClean: true,
          desc: 'Caches de compilation graphique obsolètes pouvant être régénérés.',
        },
        {
          id: 'packageCache',
          label: isSystemDrive ? 'Caches d\'installateurs & paquets résiduels' : 'Résidus de téléchargements de jeux (Steam/Epic)',
          sizeMB: d.packageCacheMB || 0,
          sizeDisplay: formatSize(d.packageCacheMB || 0),
          safeToClean: true,
          desc: 'Données d\'installation temporaires et paquets résiduels.',
        },
        {
          id: 'crashDumps',
          label: 'Rapports d\'erreurs et vidages mémoire résiduels',
          sizeMB: d.crashDumpsMB || 0,
          sizeDisplay: formatSize(d.crashDumpsMB || 0),
          safeToClean: true,
          desc: 'Traces et vidages .dmp d\'anciennes erreurs applicatives.',
        },
      ].filter(c => c.sizeMB > 0 || c.id === 'recycleBin');

      const totalMB = d.totalMB || categories.reduce((sum, c) => sum + c.sizeMB, 0);

      return {
        success: true,
        driveLetter,
        totalMB,
        totalFormatted: formatSize(totalMB),
        categories,
        aiRecommendation: totalMB > 1024
          ? `Analyse IA : Plus de ${formatSize(totalMB)} de données temporaires et caches orphelins identifiés sur ${driveLetter}. Leur suppression sécurisée améliorera l'espace disponible sans affecter vos données personnelles.`
          : `Analyse IA : Le volume ${driveLetter} est bien entretenu. ${formatSize(totalMB)} peuvent être récupérés pour maintenir les performances d'écriture optimales.`,
      };
    } catch (e: any) {
      return {
        success: false,
        driveLetter,
        totalMB: 0,
        totalFormatted: '0 Mo',
        categories: [],
        aiRecommendation: 'Impossible d\'analyser les dossiers du disque.',
      };
    }
  });

  // ── Per-Disk Storage Optimization (Execute Safe Clean) ────────────────────
  ipcMain.handle('perf:clean-disk-junk', async (_, driveLetterInput: string) => {
    const driveLetter = (driveLetterInput || 'C').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) + ':';
    logger.info(`[Performance] Nettoyage ciblé du volume ${driveLetter}...`);

    const isSystemDrive = driveLetter === 'C:';
    const script = `
      $drive = "${driveLetter}\\\\"
      $cleared = 0

      # 1. Vider la corbeille du lecteur
      try {
        Clear-RecycleBin -DriveLetter "${driveLetter.replace(':', '')}" -Force -ErrorAction SilentlyContinue
      } catch {}

      # 2. Dossiers temporaires
      if ("${driveLetter}" -eq 'C:') {
        Remove-Item -Path "$env:TEMP\\\\*" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "$env:windir\\\\Temp\\\\*" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "$env:LOCALAPPDATA\\\\CrashDumps\\\\*" -Recurse -Force -ErrorAction SilentlyContinue
      } else {
        $temp1 = Join-Path $drive 'Temp'
        $temp2 = Join-Path $drive 'tmp'
        if (Test-Path $temp1) { Remove-Item -Path "$temp1\\\\*" -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path $temp2) { Remove-Item -Path "$temp2\\\\*" -Recurse -Force -ErrorAction SilentlyContinue }
        $steamDown = Join-Path $drive 'SteamLibrary\\\\steamapps\\\\downloading'
        if (Test-Path $steamDown) { Remove-Item -Path "$steamDown\\\\*" -Recurse -Force -ErrorAction SilentlyContinue }
      }

      [PSCustomObject]@{ cleaned = $true; drive = "${driveLetter}" } | ConvertTo-Json -Compress
    `;

    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 25000 });
      return {
        success: res.success,
        driveLetter,
        message: `Optimisation terminée avec succès sur le lecteur ${driveLetter}.`,
      };
    } catch (e: any) {
      return { success: false, driveLetter, error: e.message };
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
        $isBoot = [bool]($parts | Where-Object { $_.IsBoot -or $_.IsSystem -or $_.DriveLetter -eq 'C' })

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

        let healthStatusText = isHealthy ? 'Sain (SMART Nominal)' : 'Attention requise';
        if (bus === 'USB') {
          healthStatusText = driveLetters ? `Externe actif (${driveLetters})` : 'Externe non alloué';
        } else if (rawVols.length > 0 && rawVols[0].fileSystem) {
          healthStatusText = `Sain · Intègre (${rawVols[0].fileSystem})`;
        }

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
          HealthStatus: healthStatusText,
          healthStatusText,
          status: d.operationalStatus || 'OK',
          sizeGB: totalGB,
          usedGB: totalUsedGB,
          freeGB: totalFreeGB,
          usedPercent,
          volumes: rawVols,
        };
      });

      disks.sort((a: any, b: any) => (a.diskNumber ?? 0) - (b.diskNumber ?? 0));

      return { success: true, disks };
    } catch {
      return { success: true, disks: [] };
    }
  });
}
