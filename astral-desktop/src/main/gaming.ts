import { BrowserWindow, ipcMain } from 'electron';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { gamingManager } from './gamingManager';
import { presentMonEngine, PresentMonMetrics } from './presentmonEngine';

let gameDetectionInterval: NodeJS.Timeout | null = null;
let currentGameName: string | null = null;
let currentGamePID: number | null = null;
let gamingModeActive = false;
let sessionStartTime = 0;
let sessionPings: number[] = [];

// AUTO-DETECTION IS DISABLED BY DEFAULT for safety.
// Can be enabled explicitly by the user.
let autoDetectEnabled = false;

// Exclusions: browsers, IDEs, system tools, launchers, productivity tools, media players, and this app
const EXCLUDED_PROCESSES = new Set([
  // Browsers & Web tools
  'chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'perplexity', 'perplexity-app', 'chatgpt',
  // System / OS / Shell
  'explorer', 'powershell', 'cmd', 'taskmgr', 'mmc', 'regedit', 'svchost', 'dwm', 'csrss', 'lsass', 'runtimebroker',
  // Dev tools & Productivity
  'code', 'devenv', 'rider', 'idea64', 'clion64', 'webstorm64', 'pycharm64', 'notion', 'obsidian', 'antigravity',
  'winword', 'excel', 'powerpnt', 'outlook', 'onenote', 'acrobat', 'acrord32',
  // Media players & viewers
  'vlc', 'mpc-hc', 'mpc-hc64', 'potplayer', 'wmplayer', 'spotify', 'foobar2000',
  // Game launchers (NOT games themselves)
  'steam', 'steamservice', 'epicgameslauncher', 'gog galaxy', 'riotclientservices',
  'battlenet', 'origin', 'eadesktop', 'ubisoft connect', 'xboxapp', 'gamebarftserver',
  // Communication & Streaming
  'discord', 'slack', 'teams', 'zoom', 'obs64', 'streamlabs obs',
  // This app
  'electron', 'astral vanguard', 'astral vanguard setup',
]);

// Saved per-game profiles
const gameProfiles: Record<string, {
  networkPriority: boolean;
  dnsProvider: string;
  ecoGpu: boolean;
}> = {};

export function setupGamingIPC(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null
) {
  // ── Status ────────────────────────────────────────────────────────────────
  ipcMain.handle('gaming:get-status', () => {
    const mgrStatus = gamingManager.getStatus();
    return {
      gamingModeActive: gamingModeActive || mgrStatus.isGamingActive,
      currentGame: currentGameName || mgrStatus.activeGameName,
      currentPID: currentGamePID || mgrStatus.activeGamePid,
      sessionDurationSeconds: sessionStartTime > 0 ? Math.round((Date.now() - sessionStartTime) / 1000) : 0,
      averagePing: sessionPings.length > 0 ? Math.round(sessionPings.reduce((a, b) => a + b, 0) / sessionPings.length) : null,
      presentMon: mgrStatus.presentMon,
    };
  });

  // ── PresentMon Availability & Metrics ──────────────────────────────────────
  ipcMain.handle('gaming:get-presentmon-status', () => {
    return { success: true, ...presentMonEngine.getAvailability() };
  });

  ipcMain.handle('gaming:get-hud-metrics', () => {
    return { success: true, metrics: presentMonEngine.getCurrentMetrics() };
  });

  // ── Restauration explicite des paramètres système ──────────────────────────
  ipcMain.handle('gaming:restore-system-state', async () => {
    logger.info('[Gaming] Demande de restauration explicite des paramètres système');
    const res = await gamingManager.restorePreviousState();
    return res;
  });

  // ── Toggle Gaming Mode Manually ───────────────────────────────────────────
  ipcMain.handle('gaming:toggle', async (_, force?: boolean) => {
    const nextState = force !== undefined ? force : !gamingModeActive;
    gamingModeActive = nextState;
    logger.info(`Mode Gaming manuel : ${gamingModeActive ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);

    if (gamingModeActive) {
      sessionStartTime = Date.now();
      sessionPings = [];

      // Si un PID est connu, appliquer l'optimisation réversible
      if (currentGamePID && currentGameName) {
        try {
          await gamingManager.enableGamingOptimizations(currentGamePID, currentGameName);
        } catch (e: any) {
          logger.warn('[Gaming] Erreur application optimisations :', e.message);
        }
      }

      win.webContents.send('notification:trigger', {
        type: 'gaming',
        title: 'Mode Gaming Activé',
        message: 'Optimisation de priorité processus (AboveNormal) et plan d\'alimentation réversible activés.',
      });
    } else {
      await gamingManager.restorePreviousState();
      sendSessionSummary(win);
      sessionStartTime = 0;
    }

    win.webContents.send('gaming-event', {
      type: 'mode-changed',
      active: gamingModeActive,
      game: currentGameName || 'Manuel',
    });

    return { success: true, active: gamingModeActive };
  });

  // ── Profiles ─────────────────────────────────────────────────────────────
  ipcMain.handle('gaming:get-profiles', () => ({ success: true, profiles: gameProfiles }));

  ipcMain.handle('gaming:save-profile', (_, gameName: string, settings: any) => {
    gameProfiles[gameName] = settings;
    logger.info(`Profil de jeu sauvegardé pour [${gameName}]`, settings);
    return { success: true };
  });

  // ── Enable/Disable Auto-Detection ─────────────────────────────────────────
  ipcMain.handle('gaming:set-auto-detect', (_, enabled: boolean) => {
    autoDetectEnabled = enabled;
    logger.info(`Détection automatique de jeux : ${enabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
    return { success: true, autoDetectEnabled };
  });

  ipcMain.handle('gaming:get-auto-detect', () => ({ autoDetectEnabled }));

  // ── Scan Installed Game Libraries (Multi-drive Steam, Epic, GOG, Riot) ──
  const scanLibraries = async () => {
    logger.info('Scan heuristique approfondi des jeux installés multi-disques...');

    const script = `
      $games = @()
      $nonGames = @(
        'Steamworks Shared', 'SteamVR', 'Steam Controller Configs',
        'DirectXRedist', 'DirectX', '_CommonRedist', 'Riot Client',
        'Installers', 'CrashReport', 'Prerequisites', 'Epic Online Services',
        'Launcher', 'Support', 'CommonRedist', 'Redist', 'wallpaper_engine',
        'Animaze'
      )

      # 1. Multi-Drive Steam Libraries detection
      $steamDirs = @("C:\\Program Files (x86)\\Steam\\steamapps\\common")
      $vdf = "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf"
      if (Test-Path $vdf) {
        $lines = Get-Content $vdf -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
          if ($line -match '"path"\\s+"([^"]+)"') {
            $rawPath = $matches[1].Replace('\\\\', '\\')
            $commonPath = Join-Path $rawPath "steamapps\\common"
            if (Test-Path $commonPath) {
              $steamDirs += $commonPath
            }
          }
        }
      }

      # Common Steam fallback paths across drives
      @("D:\\SteamLibrary\\steamapps\\common", "E:\\SteamLibrary\\steamapps\\common", "F:\\SteamLibrary\\steamapps\\common", "D:\\Steam\\steamapps\\common") | ForEach-Object {
        if (Test-Path $_) { $steamDirs += $_ }
      }

      foreach ($sd in ($steamDirs | Select-Object -Unique)) {
        Get-ChildItem -Path $sd -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $isTool = ($nonGames -contains $_.Name) -or ($_.Name -match 'Steamworks|SteamVR|Controller|DirectX|Redist|_CommonRedist|Launcher|Prerequisites|CrashReport')
          if (-not $isTool) {
            $games += [PSCustomObject]@{
              name     = $_.Name
              launcher = "Steam"
              path     = $_.FullName
            }
          }
        }
      }

      # 2. Epic Games multi-drive detection
      @("C:\\Program Files\\Epic Games", "D:\\Epic Games", "E:\\Epic Games", "F:\\Epic Games") | ForEach-Object {
        if (Test-Path $_) {
          Get-ChildItem -Path $_ -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $isTool = ($nonGames -contains $_.Name) -or ($_.Name -match 'Launcher|DirectX|Prerequisites|Redist')
            if (-not $isTool) {
              $games += [PSCustomObject]@{
                name     = $_.Name
                launcher = "Epic Games"
                path     = $_.FullName
              }
            }
          }
        }
      }

      # 3. Riot Games multi-drive detection (excluding Riot Client launcher)
      @("C:\\Riot Games", "D:\\Riot Games", "E:\\Riot Games") | ForEach-Object {
        if (Test-Path $_) {
          Get-ChildItem -Path $_ -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -ne 'Riot Client' -and $nonGames -notcontains $_.Name) {
              $games += [PSCustomObject]@{
                name     = $_.Name
                launcher = "Riot Games"
                path     = $_.FullName
              }
            }
          }
        }
      }

      # 4. GOG Galaxy detection
      @("C:\\Program Files (x86)\\GOG Galaxy\\Games", "C:\\GOG Games", "D:\\GOG Games") | ForEach-Object {
        if (Test-Path $_) {
          Get-ChildItem -Path $_ -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $games += [PSCustomObject]@{
              name     = $_.Name
              launcher = "GOG"
              path     = $_.FullName
            }
          }
        }
      }

      # Deduplicate games by name
      $uniqueGames = $games | Group-Object -Property name | ForEach-Object { $_.Group[0] }
      $uniqueGames | ConvertTo-Json -Compress
    `;

    try {
      const res = await runPowerShell(script, { asJson: true, timeout: 10000 });
      let list = res.data || [];
      if (!Array.isArray(list)) list = list ? [list] : [];
      logger.info(`Bibliothèques de jeux : ${list.length} jeux réels détectés sur les disques.`);
      return { success: true, games: list };
    } catch {
      return { success: true, games: [] };
    }
  };

  ipcMain.handle('gaming:scan-libraries', scanLibraries);
  ipcMain.handle('gaming:scan-installed', scanLibraries);
}

// Gaming Session States: 'none' | 'proposed' | 'active' | 'background' | 'finished'
let gamingSessionState: 'none' | 'proposed' | 'active' | 'background' | 'finished' = 'none';

/**
 * Generic Smart Detection Loop:
 * Monitors foreground window without requiring DLL injection into game binaries.
 * Guarded by autoDetectEnabled (OFF by default).
 * Distinguishes active vs background state so Alt-Tab does not loop settings.
 */
export function startGameDetection(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null,
  setOverlay: (w: BrowserWindow | null) => void
) {
  if (gameDetectionInterval) clearInterval(gameDetectionInterval);

  gameDetectionInterval = setInterval(async () => {
    try {
      // AUTO-DETECT GUARD: loop runs but does nothing if autoDetect is disabled and no game active
      if (!autoDetectEnabled && !gamingModeActive) return;

      // If gaming mode is active with a tracked PID, check if the process is still running (instant native check)
      if (currentGamePID !== null) {
        let isAlive = false;
        try {
          process.kill(currentGamePID, 0);
          isAlive = true;
        } catch (e: any) {
          isAlive = e.code === 'EPERM';
        }

        if (!isAlive) {
          // Process terminated
          logger.info(`Processus de jeu terminé (PID ${currentGamePID} : ${currentGameName})`);
          gamingSessionState = 'finished';

          // Restauration automatique et propre des paramètres d'origine
          await gamingManager.restorePreviousState();

          sendSessionSummary(win);
          currentGameName = null;
          currentGamePID = null;
          gamingModeActive = false;
          sessionStartTime = 0;

          win.webContents.send('gaming-event', {
            type: 'mode-changed',
            state: 'finished',
            active: false,
            game: null,
          });
          return;
        }
      }

      if (!autoDetectEnabled) return;

      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class WinCheck {
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")]
            public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
            [DllImport("user32.dll")]
            public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            [StructLayout(LayoutKind.Sequential)]
            public struct RECT {
              public int Left;
              public int Top;
              public int Right;
              public int Bottom;
            }
          }
"@ -ErrorAction SilentlyContinue

        $hwnd = [WinCheck]::GetForegroundWindow()
        if ($hwnd -ne [IntPtr]::Zero) {
          $pidOut = 0
          [WinCheck]::GetWindowThreadProcessId($hwnd, [ref]$pidOut) | Out-Null
          if ($pidOut -gt 0) {
            $proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
            $rect = New-Object WinCheck+RECT
            [WinCheck]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

            $width = [Math]::Abs($rect.Right - $rect.Left)
            $height = [Math]::Abs($rect.Bottom - $rect.Top)

            [PSCustomObject]@{
              pid = $pidOut
              name = $proc.ProcessName
              width = $width
              height = $height
            } | ConvertTo-Json -Compress
          }
        }
      `;

      const res = await runPowerShell(script, { asJson: true, timeout: 3000 });
      if (res.success && res.data) {
        const { pid, name, width, height } = res.data;
        const procName = String(name || '').toLowerCase();

        // Safety: Strict Exclusions Check
        if (EXCLUDED_PROCESSES.has(procName)) {
          // If a game is active and user Alt-Tabs to an excluded app, don't tear down immediately
          if (gamingSessionState === 'active' && currentGamePID !== null && currentGamePID !== pid) {
            gamingSessionState = 'background';
            win.webContents.send('gaming-event', {
              type: 'state-changed',
              state: 'background',
              active: true,
              game: currentGameName,
            });
          }
          return;
        }

        // Fullscreen check
        const isFullscreen = width >= 1280 && height >= 720;

        if (isFullscreen && name) {
          if (currentGamePID === pid) {
            // Returned to the game from background
            if (gamingSessionState === 'background') {
              gamingSessionState = 'active';
              win.webContents.send('gaming-event', {
                type: 'state-changed',
                state: 'active',
                active: true,
                game: currentGameName,
              });
            }
            return;
          }

          // New game candidate
          if (currentGameName !== name) {
            currentGameName = name;
            currentGamePID = pid;
            gamingModeActive = true;
            gamingSessionState = 'active';
            sessionStartTime = Date.now();
            sessionPings = [];

            logger.info(`🎮 Nouveau jeu détecté : ${name} (PID ${pid})`);

            // Application des optimisations réversibles mesurables
            try {
              await gamingManager.enableGamingOptimizations(pid, name);
            } catch (e: any) {
              logger.warn('[Gaming] Erreur application optimisations :', e.message);
            }

            win.webContents.send('gaming-event', {
              type: 'mode-changed',
              state: 'active',
              active: true,
              game: name,
            });

            win.webContents.send('notification:trigger', {
              type: 'gaming',
              title: `Jeu Détecté : ${name}`,
              message: 'Mode Gaming engagé : priorité AboveNormal appliquée. Restauration automatique garantie à la fermeture.',
            });
          }
        }
      }
    } catch {}
  }, 4000);
}

function sendSessionSummary(win: BrowserWindow) {
  if (sessionStartTime > 0) {
    const durationMin = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
    const avgPing = sessionPings.length > 0 ? Math.round(sessionPings.reduce((a, b) => a + b, 0) / sessionPings.length) : null;

    win.webContents.send('notification:trigger', {
      type: 'report',
      title: 'Récapitulatif de Session Gaming',
      message: avgPing !== null
        ? `Temps de jeu : ${durationMin} min • Latence moyenne : ${avgPing}ms.`
        : `Temps de jeu : ${durationMin} min • Mesure de latence moyenne non disponible.`,
    });
  }
}
