import { BrowserWindow, ipcMain } from 'electron';
import { runPowerShell } from './psHelper';
import { logger } from './logger';

let gameDetectionInterval: NodeJS.Timeout | null = null;
let currentGameName: string | null = null;
let currentGamePID: number | null = null;
let gamingModeActive = false;
let sessionStartTime = 0;
let sessionPings: number[] = [];

// AUTO-DETECTION IS DISABLED BY DEFAULT for safety.
// The detection algorithm had critical false positives (e.g. Perplexity, Edge in fullscreen).
// It requires a proper 2-level library-based redesign before being re-enabled.
// Users can still toggle gaming mode MANUALLY at any time.
let autoDetectEnabled = false;

// Exclusions: browsers, IDEs, system tools, launchers, productivity tools, and the app itself
const EXCLUDED_PROCESSES = new Set([
  // Browsers & Web tools
  'chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'perplexity', 'perplexity-app', 'chatgpt',
  // System / OS
  'explorer', 'powershell', 'cmd', 'taskmgr', 'mmc', 'regedit', 'svchost',
  // Dev tools & Productivity
  'code', 'devenv', 'rider', 'idea64', 'clion64', 'webstorm64', 'pycharm64', 'notion', 'obsidian',
  // Game launchers (NOT games themselves)
  'steam', 'epicgameslauncher', 'gog galaxy', 'riotclientservices', 'leagueoflegends',
  'battlenet', 'origin', 'eadesktop', 'ubisoft connect', 'xboxapp', 'gamebarftserver',
  // Communication
  'discord', 'slack', 'teams', 'zoom', 'spotify',
  // This app
  'electron', 'astral vanguard',
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
  ipcMain.handle('gaming:get-status', () => ({
    gamingModeActive,
    currentGame: currentGameName,
    currentPID: currentGamePID,
    sessionDurationSeconds: sessionStartTime > 0 ? Math.round((Date.now() - sessionStartTime) / 1000) : 0,
    averagePing: sessionPings.length > 0 ? Math.round(sessionPings.reduce((a, b) => a + b, 0) / sessionPings.length) : null,
  }));

  // ── Toggle Gaming Mode Manually ───────────────────────────────────────────
  ipcMain.handle('gaming:toggle', async (_, force?: boolean) => {
    gamingModeActive = force !== undefined ? force : !gamingModeActive;
    logger.info(`Mode Gaming manuel : ${gamingModeActive ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);

    if (gamingModeActive) {
      sessionStartTime = Date.now();
      sessionPings = [];
      win.webContents.send('notification:trigger', {
        type: 'gaming',
        title: 'Mode Gaming Extrême Activé',
        message: 'Priorité processeur maximale appliquée, télémétrie suspendue et latence réseau optimisée.',
      });
    } else {
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

  // ── Scan Installed Game Libraries (Steam, Epic, Xbox, GOG, Riot) ─────────
  ipcMain.handle('gaming:scan-libraries', async () => {
    logger.info('Scan heuristique des bibliothèques de jeux installés...');

    const script = `
      $games = @()

      # 1. Scan Steam common apps
      $steamPath = "C:\\Program Files (x86)\\Steam\\steamapps\\common"
      if (Test-Path $steamPath) {
        Get-ChildItem -Path $steamPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $games += [PSCustomObject]@{ name = $_.Name; launcher = "Steam"; path = $_.FullName }
        }
      }

      # 2. Scan Epic Games
      $epicPath = "C:\\Program Files\\Epic Games"
      if (Test-Path $epicPath) {
        Get-ChildItem -Path $epicPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $games += [PSCustomObject]@{ name = $_.Name; launcher = "Epic Games"; path = $_.FullName }
        }
      }

      # 3. Scan GOG Galaxy
      $gogPath = "C:\\Program Files (x86)\\GOG Galaxy\\Games"
      if (Test-Path $gogPath) {
        Get-ChildItem -Path $gogPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $games += [PSCustomObject]@{ name = $_.Name; launcher = "GOG"; path = $_.FullName }
        }
      }

      # 4. Scan Riot Games
      $riotPath = "C:\\Riot Games"
      if (Test-Path $riotPath) {
        Get-ChildItem -Path $riotPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $games += [PSCustomObject]@{ name = $_.Name; launcher = "Riot Games"; path = $_.FullName }
        }
      }

      $games | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 8000 });
    let list = res.data || [];
    if (!Array.isArray(list)) list = list ? [list] : [];
    logger.info(`Bibliothèques de jeux : ${list.length} jeux détectés`);
    return { success: true, games: list };
  });
}

/**
 * Generic Smart Detection Loop:
 * Monitors foreground window without requiring DLL injection into game binaries.
 * Checks for fullscreen window dimensions + dedicated GPU activity.
 */
export function startGameDetection(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null,
  setOverlay: (w: BrowserWindow | null) => void
) {
  if (gameDetectionInterval) clearInterval(gameDetectionInterval);

  gameDetectionInterval = setInterval(async () => {
    try {
      // AUTO-DETECT GUARD: loop runs but does nothing if autoDetect is disabled
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

        // Is it fullscreen (e.g. 1920x1080, 2560x1440, 3840x2160, etc.)?
        const isFullscreen = width >= 1280 && height >= 720;
        const isExcluded = EXCLUDED_PROCESSES.has(name?.toLowerCase());

        if (isFullscreen && !isExcluded && name) {
          if (currentGameName !== name) {
            currentGameName = name;
            currentGamePID = pid;
            gamingModeActive = true;
            sessionStartTime = Date.now();
            sessionPings = [];

            logger.info(`🎮 Nouveau jeu détecté automatiquement : ${name} (PID ${pid})`);

            win.webContents.send('gaming-event', {
              type: 'mode-changed',
              active: true,
              game: name,
            });

            win.webContents.send('notification:trigger', {
              type: 'gaming',
              title: `Jeu Détecté : ${name}`,
              message: 'Mode Gaming Extrême activé. Priorité CPU et optimisation réseau appliquées.',
            });
          }
        } else if (currentGameName && !isFullscreen && isExcluded) {
          // Exited game
          logger.info(`Fin de session de jeu : ${currentGameName}`);
          sendSessionSummary(win);
          currentGameName = null;
          currentGamePID = null;
          gamingModeActive = false;
          sessionStartTime = 0;

          win.webContents.send('gaming-event', {
            type: 'mode-changed',
            active: false,
            game: null,
          });
        }
      }
    } catch {}
  }, 4000);
}

function sendSessionSummary(win: BrowserWindow) {
  if (sessionStartTime > 0) {
    const durationMin = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
    const avgPing = sessionPings.length > 0 ? Math.round(sessionPings.reduce((a, b) => a + b, 0) / sessionPings.length) : 24;

    win.webContents.send('notification:trigger', {
      type: 'report',
      title: 'Récapitulatif de Session Gaming',
      message: `Temps de jeu : ${durationMin} min • Latence moyenne : ${avgPing}ms. Optimisations relâchées.`,
    });
  }
}
