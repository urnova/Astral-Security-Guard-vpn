import { BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { getOpenVpnPath } from './binHelper';
import https from 'https';

const execPromise = util.promisify(exec);

// Known game executables (sample list — expand as needed)
const KNOWN_GAMES = new Set([
  'cs2', 'csgo', 'valorant', 'fortnite', 'r5apex', 'RainbowSix', 'leagueoflengends',
  'Overwatch', 'cod', 'ModernWarfare', 'WARZONE', 'destiny2', 'dota2', 'TslGame',
  'EscapeFromTarkov', 'RustClient', 'GTA5', 'gtav', 'eldenring', 'sekiro',
  'Cyberpunk2077', 'witcher3', 'farcry', 'assassins', 'FIFA', 'fc25',
  'rocketleague', 'DayZ', 'ark', 'NMS', 'minecraft', 'javaw', 'steam',
  'epicgameslauncher', 'Battle.net', 'upc', 'riotclient', 'gog', 'origin',
]);

let gameDetectionInterval: NodeJS.Timeout | null = null;
let currentGamePID: number | null = null;
let currentGameName: string | null = null;
let gamingModeActive = false;

// Game profiles: per-game settings memory
const gameProfiles: Record<string, { networkPriority: boolean; perfMode: boolean }> = {};

export function setupGamingIPC(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null
) {
  // ── Get Active Game ───────────────────────────────────────────────────────
  ipcMain.handle('gaming:get-status', () => ({
    gamingModeActive,
    currentGame: currentGameName,
    currentPID: currentGamePID,
  }));

  // ── Toggle Gaming Mode Manually ───────────────────────────────────────────
  ipcMain.handle('gaming:toggle', async (_, force?: boolean) => {
    if (force !== undefined) {
      gamingModeActive = force;
    } else {
      gamingModeActive = !gamingModeActive;
    }
    win.webContents.send('gaming-event', { type: 'mode-changed', active: gamingModeActive, game: currentGameName });
    return { success: true, active: gamingModeActive };
  });

  // ── Game Profiles ─────────────────────────────────────────────────────────
  ipcMain.handle('gaming:get-profiles', () => ({ success: true, profiles: gameProfiles }));

  ipcMain.handle('gaming:save-profile', (_, gameName: string, settings: any) => {
    gameProfiles[gameName] = settings;
    return { success: true };
  });

  // ── Overlay Toggle ────────────────────────────────────────────────────────
  ipcMain.handle('gaming:overlay-toggle', (_, show: boolean) => {
    if (show) {
      win.webContents.send('overlay:show');
    } else {
      win.webContents.send('overlay:hide');
    }
    return { success: true };
  });
}

// ── Auto Game Detection ───────────────────────────────────────────────────────
export function startGameDetection(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null,
  setOverlay: (w: BrowserWindow | null) => void
) {
  if (gameDetectionInterval) return;

  gameDetectionInterval = setInterval(async () => {
    try {
      const { stdout } = await execPromise(`powershell -Command "
        Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.CPU -gt 5 } |
        Select-Object Id,Name,CPU,WorkingSet | ConvertTo-Json -Depth 2
      "`);

      let procs: any[] = [];
      try { procs = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(procs)) procs = procs ? [procs] : [];

      // Check if a known game is running
      const foundGame = procs.find((p) => {
        const name = (p.Name || '').toLowerCase();
        return [...KNOWN_GAMES].some((g) => name.includes(g.toLowerCase()));
      });

      if (foundGame && !gamingModeActive) {
        // Game started!
        currentGamePID = foundGame.Id;
        currentGameName = foundGame.Name;
        gamingModeActive = true;

        win.webContents.send('gaming-event', {
          type: 'game-detected',
          game: currentGameName,
          pid: currentGamePID,
        });

        // Activate gaming boosts via IPC (triggers perf+network modules)
        win.webContents.send('gaming-event', { type: 'mode-changed', active: true, game: currentGameName });

        // Create overlay
        if (!getOverlay()) {
          const { createOverlay } = await import('./index');
          createOverlay();
        }

        // Set process priority
        await execPromise(`powershell -Command "
          (Get-Process -Id ${currentGamePID} -ErrorAction SilentlyContinue).PriorityClass = 'High'
        "`).catch(() => {});

      } else if (!foundGame && gamingModeActive && currentGameName) {
        // Game stopped
        const stoppedGame = currentGameName;
        currentGamePID = null;
        currentGameName = null;
        gamingModeActive = false;

        win.webContents.send('gaming-event', {
          type: 'game-stopped',
          game: stoppedGame,
        });
        win.webContents.send('gaming-event', { type: 'mode-changed', active: false });

        // Destroy overlay
        const { destroyOverlay } = await import('./index');
        destroyOverlay();
      }

      // Update overlay with live metrics
      const overlay = getOverlay();
      if (overlay && gamingModeActive) {
        const { stdout: metricsOut } = await execPromise(`powershell -Command "
          $cpu = (Get-CimInstance -ClassName CIM_Processor | Measure-Object -Property LoadPercentage -Average).Average
          $mem = Get-CimInstance -ClassName CIM_OperatingSystem
          [PSCustomObject]@{
            cpu = [int]$cpu
            ramPercent = [int](($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize * 100)
          } | ConvertTo-Json
        "`).catch(() => ({ stdout: '{}' }));

        try {
          const metrics = JSON.parse(metricsOut);
          overlay.webContents.send('overlay-metrics', metrics);
        } catch {}
      }
    } catch (e) {
      // Silently ignore polling errors
    }
  }, 5000); // Check every 5 seconds
}
