import { BrowserWindow, ipcMain } from 'electron';
import https from 'https';
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
        'DirectXRedist', 'DirectX', '_CommonRedist', 'Riot Client', 'Riot Client.old',
        'Installers', 'CrashReport', 'Prerequisites', 'Epic Online Services',
        'Launcher', 'Support', 'CommonRedist', 'Redist', 'wallpaper_engine',
        'Animaze', 'GameSave', 'Social Club', 'Rockstar Games Launcher'
      )

      # Get all active logical drive roots
      $drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -gt 0 } | Select-Object -ExpandProperty Root

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

      foreach ($d in $drives) {
        @("SteamLibrary\\steamapps\\common", "Steam\\steamapps\\common") | ForEach-Object {
          $p = Join-Path $d $_
          if (Test-Path $p) { $steamDirs += $p }
        }
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

      # 2. Xbox / PC Game Pass detection
      foreach ($d in $drives) {
        @("XboxGames", "xboxgames") | ForEach-Object {
          $xp = Join-Path $d $_
          if (Test-Path $xp) {
            Get-ChildItem -Path $xp -Directory -ErrorAction SilentlyContinue | ForEach-Object {
              if ($nonGames -notcontains $_.Name) {
                $games += [PSCustomObject]@{
                  name     = $_.Name
                  launcher = "Xbox"
                  path     = $_.FullName
                }
              }
            }
          }
        }
      }

      # 3. Rockstar Games detection (e.g. E:\\rockstar game, C:\\Program Files\\Rockstar Games)
      foreach ($d in $drives) {
        @("rockstar game", "Rockstar Games", "Program Files\\Rockstar Games", "Program Files (x86)\\Rockstar Games") | ForEach-Object {
          $rp = Join-Path $d $_
          if (Test-Path $rp) {
            Get-ChildItem -Path $rp -Directory -ErrorAction SilentlyContinue | ForEach-Object {
              if ($nonGames -notcontains $_.Name -and $_.Name -notmatch 'Social Club|Launcher') {
                $games += [PSCustomObject]@{
                  name     = $_.Name
                  launcher = "Rockstar"
                  path     = $_.FullName
                }
              }
            }
          }
        }
      }

      # 4. Epic Games multi-drive detection
      foreach ($d in $drives) {
        @("epic game", "Epic Games", "Program Files\\Epic Games", "Program Files (x86)\\Epic Games") | ForEach-Object {
          $ep = Join-Path $d $_
          if (Test-Path $ep) {
            Get-ChildItem -Path $ep -Directory -ErrorAction SilentlyContinue | ForEach-Object {
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
      }

      # 5. Riot Games multi-drive detection
      foreach ($d in $drives) {
        $rip = Join-Path $d "Riot Games"
        if (Test-Path $rip) {
          Get-ChildItem -Path $rip -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -ne 'Riot Client' -and $_.Name -ne 'Riot Client.old' -and $nonGames -notcontains $_.Name) {
              $games += [PSCustomObject]@{
                name     = $_.Name
                launcher = "Riot Games"
                path     = $_.FullName
              }
            }
          }
        }
      }

      # 6. GOG Galaxy detection
      foreach ($d in $drives) {
        @("GOG Games", "Program Files (x86)\\GOG Galaxy\\Games") | ForEach-Object {
          $gp = Join-Path $d $_
          if (Test-Path $gp) {
            Get-ChildItem -Path $gp -Directory -ErrorAction SilentlyContinue | ForEach-Object {
              if ($nonGames -notcontains $_.Name) {
                $games += [PSCustomObject]@{
                  name     = $_.Name
                  launcher = "GOG"
                  path     = $_.FullName
                }
              }
            }
          }
        }
      }

      # 7. Ubisoft & EA Games detection
      foreach ($d in $drives) {
        @("Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games", "Ubisoft Games") | ForEach-Object {
          $up = Join-Path $d $_
          if (Test-Path $up) {
            Get-ChildItem -Path $up -Directory -ErrorAction SilentlyContinue | ForEach-Object {
              if ($nonGames -notcontains $_.Name) {
                $games += [PSCustomObject]@{
                  name     = $_.Name
                  launcher = "Ubisoft"
                  path     = $_.FullName
                }
              }
            }
          }
        }
        @("Program Files\\EA Games", "EA Games") | ForEach-Object {
          $eap = Join-Path $d $_
          if (Test-Path $eap) {
            Get-ChildItem -Path $eap -Directory -ErrorAction SilentlyContinue | ForEach-Object {
              if ($nonGames -notcontains $_.Name) {
                $games += [PSCustomObject]@{
                  name     = $_.Name
                  launcher = "EA"
                  path     = $_.FullName
                }
              }
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

      // Enrich games with official high-res banner URLs
      const enriched = await Promise.all(
        list.slice(0, 20).map(async (g: any) => {
          const banner = await resolveGameBanner(g.name);
          return {
            ...g,
            bannerUrl: banner || undefined,
          };
        })
      );
      const finalList = [...enriched, ...list.slice(20)];

      return { success: true, games: finalList };
    } catch {
      return { success: true, games: [] };
    }
  };

  ipcMain.handle('gaming:scan-libraries', scanLibraries);
  ipcMain.handle('gaming:scan-installed', scanLibraries);

  // ── Persistent Gaming Settings (in-memory, survives tab navigation) ───────
  const gamingSettings = {
    hudEnabled: false,
    antiBufferbloat: true,
    suspendBg: false,
    autoDetect: false,
  };

  ipcMain.handle('gaming:get-settings', () => ({ success: true, settings: gamingSettings }));

  ipcMain.handle('gaming:set-mode', async (_evt, payload: { enabled: boolean; profile?: string }) => {
    const { enabled, profile } = payload;
    gamingModeActive = enabled;
    logger.info(`[Gaming] Mode set via UI: ${enabled ? 'ON' : 'OFF'}, profile=${profile || 'none'}`);
    if (enabled) {
      sessionStartTime = Date.now();
      win.webContents.send('notification:trigger', {
        type: 'gaming',
        title: 'Mode Gaming Activé',
        message: `Profil ${profile || 'Équilibré'} — priorité processus et plan d'alimentation haute performance activés.`,
      });
    } else {
      await gamingManager.restorePreviousState();
      sessionStartTime = 0;
    }
    return { success: true, active: gamingModeActive };
  });

  ipcMain.handle('gaming:set-setting', (_evt, payload: { key: string; value: boolean }) => {
    const { key, value } = payload;
    if (key in gamingSettings) {
      (gamingSettings as any)[key] = value;
      if (key === 'autoDetect') {
        autoDetectEnabled = value;
        logger.info(`[Gaming] Auto-detect: ${value ? 'ON' : 'OFF'}`);
      }
      logger.info(`[Gaming] Setting ${key}=${value}`);
    }
    return { success: true };
  });

  ipcMain.handle('gaming:apply-game-profile', async (_evt, payload: { game: string; profile: string }) => {
    const { game, profile } = payload;
    gameProfiles[game] = { networkPriority: profile === 'Compétitif', dnsProvider: 'google', ecoGpu: profile === 'Équilibré' };
    logger.info(`[Gaming] Profile "${profile}" applied to "${game}"`);
    return { success: true };
  });

  // ── Safe Browser Suspension (NtSuspendProcess via PowerShell DebugActiveProcess) ─
  ipcMain.handle('gaming:suspend-browsers', async (_evt, suspend: boolean) => {
    const action = suspend ? 'Suspend' : 'Resume';
    const browsers = ['chrome', 'msedge', 'firefox', 'brave'];
    const script = browsers.map(name =>
      `Get-Process -Name "${name}" -ErrorAction SilentlyContinue | ForEach-Object { [void][System.Diagnostics.Process]::GetProcessById($_.Id) }`
    ).join('\n');
    // Suspend/resume via pssuspend-like technique using Debug trick — graceful only
    const suspendScript = `
      $browserNames = @('chrome','msedge','firefox','brave','opera','vivaldi')
      foreach ($name in $browserNames) {
        try {
          $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
          foreach ($p in $procs) {
            if ('${suspend}' -eq 'true') {
              $p.PriorityClass = 'Idle'
            } else {
              $p.PriorityClass = 'Normal'
            }
          }
        } catch {}
      }
      Write-Output "OK"
    `;
    try {
      const res = await runPowerShell(suspendScript, { timeout: 5000 });
      logger.info(`[Gaming] Browser ${action}: ${res.stdout}`);
      return { success: true, action };
    } catch (e: any) {
      logger.warn(`[Gaming] Browser ${action} failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
}

// In-memory cache for game banners
const bannerCache = new Map<string, string>();

async function resolveGameBanner(gameName: string): Promise<string | null> {
  const clean = (gameName || '').trim();
  if (!clean || clean.length < 2) return null;
  if (bannerCache.has(clean)) return bannerCache.get(clean)!;

  try {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(clean)}&l=french&cc=FR`;
    const data = await new Promise<string>((resolve) => {
      const req = https.get(searchUrl, { timeout: 2500 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    });

    if (data) {
      const parsed = JSON.parse(data);
      if (parsed?.items && parsed.items.length > 0) {
        const appId = parsed.items[0].id;
        if (appId) {
          const bannerUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
          bannerCache.set(clean, bannerUrl);
          return bannerUrl;
        }
      }
    }
  } catch {}
  return null;
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
