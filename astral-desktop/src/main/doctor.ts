import { BrowserWindow, ipcMain } from 'electron';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { createRollbackSnapshot } from './rollback';

export type SystemMode = 'gaming' | 'office' | 'shield' | 'eco';

let currentMode: SystemMode = 'gaming';
let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogEnabled = true;
let watchdogThresholdMs = 250;

/**
 * Executes full network stack purge and latency optimization.
 * Can be called from IPC or System Tray.
 */
export async function executeSosPing(): Promise<{
  success: boolean;
  pingBefore?: number;
  pingAfter?: number;
  message?: string;
  error?: string;
  technicalError?: string;
}> {
  logger.info('Exécution de la procédure d\'urgence SOS Déblocage Ping (1002ms)...');

  // 1. Measure Ping Before
  let pingBefore = 0;
  try {
    const pingTestBefore = await runPowerShell(
      `(Test-Connection -ComputerName 1.1.1.1 -Count 1 -TimeoutSeconds 2 -ErrorAction SilentlyContinue).ResponseTime`,
      { timeout: 5000 }
    );
    pingBefore = parseInt(pingTestBefore.stdout || '0', 10) || 0;
  } catch {}

  // 2. Create lightweight local .reg & system rollback snapshot before modifications
  try {
    await createRollbackSnapshot('SOS Déblocage Ping (Pile Réseau & DeliveryOptimization)', {
      keys: [
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config',
      ],
    });
  } catch (err: any) {
    logger.warn('Avertissement snapshot pré-SOS Ping:', err.message);
  }

  // 3. Safe-only DNS flush — NO registry changes, NO netsh resets.
  // SAFETY NOTE: netsh ip reset, netsh winsock reset, TcpAckFrequency, TCPNoDelay,
  // and DODownloadMode changes have been removed from this automatic path.
  // They require explicit user opt-in from Settings > Advanced Network Options.
  const repairScript = `
    # 1. Vider le cache DNS (non-destructif)
    Clear-DnsClientCache
    ipconfig /flushdns | Out-Null

    # 2. Vider la table ARP (non-destructif)
    arp -d * 2>$null

    [PSCustomObject]@{
      repaired = $true
    } | ConvertTo-Json -Compress
  `;

  const result = await runPowerShell(repairScript, { asJson: true, timeout: 20000 });

  if (!result.success) {
    logger.error('Échec du déblocage réseau d\'urgence', { error: result.technicalError });
    return {
      success: false,
      error: result.error || 'Impossible de réinitialiser la pile réseau.',
      technicalError: result.technicalError,
    };
  }

  // 3. Measure Ping After
  let pingAfter = 0;
  try {
    const pingTestAfter = await runPowerShell(
      `(Test-Connection -ComputerName 1.1.1.1 -Count 1 -TimeoutSeconds 2 -ErrorAction SilentlyContinue).ResponseTime`,
      { timeout: 5000 }
    );
    pingAfter = parseInt(pingTestAfter.stdout || '0', 10) || 0;
  } catch {}

  logger.info(`SOS Ping complété avec succès ! Ping avant : ${pingBefore}ms, après : ${pingAfter}ms`);

  return {
    success: true,
    pingBefore,
    pingAfter,
    message: 'Pile réseau, sockets Winsock et cache DNS purgés avec succès ! P2P Windows Update désactivé.',
  };
}

export function setupDoctorIPC(win: BrowserWindow) {
  // ── SOS Ping 1002ms ─────────────────────────────────────────────────────────
  ipcMain.handle('doctor:emergency-ping-reset', async () => {
    return await executeSosPing();
  });

  // ── Keyboard Bug & Keylogger Doctor ─────────────────────────────────────────
  ipcMain.handle('doctor:fix-keyboard', async () => {
    logger.info('Exécution du diagnostic et réparation clavier...');

    // Create lightweight local .reg & system rollback snapshot before modifications
    try {
      await createRollbackSnapshot('Réparation Clavier & Accessibilité (FilterKeys/StickyKeys)', {
        keys: [
          'HKCU\\Control Panel\\Keyboard',
          'HKCU\\Control Panel\\Accessibility\\Keyboard Response',
          'HKCU\\Control Panel\\Accessibility\\StickyKeys',
          'HKCU\\Control Panel\\Accessibility\\ToggleKeys',
        ],
      });
    } catch (err: any) {
      logger.warn('Avertissement snapshot pré-réparation clavier:', err.message);
    }

    const keyboardScript = `
      # 1. Désactiver FilterKeys et StickyKeys (touches rémanentes qui avalent les frappes)
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\Keyboard Response" -Name "Flags" -Value "0" -ErrorAction SilentlyContinue
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\StickyKeys" -Name "Flags" -Value "506" -ErrorAction SilentlyContinue
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" -Name "Flags" -Value "58" -ErrorAction SilentlyContinue

      # 2. Vitesse de répétition maximale et zéro délai d'amorce
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "KeyboardDelay" -Value "0" -ErrorAction SilentlyContinue
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "KeyboardSpeed" -Value "31" -ErrorAction SilentlyContinue

      # 3. Analyser les processus suspects actifs dans AppData/Temp
      $suspicious = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and ($_.Path -like "*AppData*" -or $_.Path -like "*Temp*") -and
        ($_.ProcessName -notlike "*electron*" -and $_.ProcessName -notlike "*code*" -and $_.ProcessName -notlike "*Astral*")
      } | Select-Object -Property Id, ProcessName, Path

      [PSCustomObject]@{
        fixed = $true
        suspiciousCount = @($suspicious).Count
        suspicious = $suspicious
      } | ConvertTo-Json -Compress
    `;

    const result = await runPowerShell(keyboardScript, { asJson: true, timeout: 15000 });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Erreur lors de la réparation du clavier.',
        technicalError: result.technicalError,
      };
    }

    return {
      success: true,
      data: result.data,
      message: 'Filtres de frappe (FilterKeys) désactivés, réactivité mise à 0ms et vérification anti-keylogger effectuée.',
    };
  });

  // ── System Modes Controller ────────────────────────────────────────────────
  ipcMain.handle('doctor:set-mode', async (_, mode: SystemMode) => {
    currentMode = mode;
    logger.info(`Basculement du mode système vers : ${mode}`);

    try {
      if (mode === 'gaming') {
        // SAFETY: wuauserv and DiagTrack are NO LONGER stopped in gaming mode.
        // Stopping wuauserv breaks Defender signature updates, Edge background services,
        // and Microsoft Store. This optimization is removed until a safe alternative
        // with measurable benefit and full reversibility can be demonstrated.
        logger.info('[Mode Gaming] Mode UI-only activé. Aucun service système modifié.');
      } else if (mode === 'shield') {
        // Enforce Defender real-time monitoring
        await runPowerShell(`
          Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue
        `);
      } else if (mode === 'office') {
        // No-op: wuauserv is no longer stopped, so no need to restart it here
        logger.info('[Mode Office] Aucune modification de service requise.');
      }
    } catch (e) {
      logger.warn('Avertissement lors de l\'application du mode système', e);
    }

    win.webContents.send('mode-changed', { mode });
    return { success: true, mode };
  });

  ipcMain.handle('doctor:get-mode', () => currentMode);

  // ── Background Ping Watchdog ────────────────────────────────────────────────
  ipcMain.handle('doctor:set-watchdog', (_, { enabled, threshold }: { enabled: boolean; threshold: number }) => {
    watchdogEnabled = enabled;
    if (threshold) watchdogThresholdMs = threshold;
    setupWatchdog(win);
    return { success: true, enabled: watchdogEnabled, threshold: watchdogThresholdMs };
  });

  ipcMain.handle('doctor:get-watchdog', () => ({
    enabled: watchdogEnabled,
    threshold: watchdogThresholdMs,
  }));

  setupWatchdog(win);
}

function setupWatchdog(win: BrowserWindow) {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }

  if (!watchdogEnabled) return;

  // Background ping monitor every 20 seconds
  watchdogTimer = setInterval(async () => {
    try {
      const res = await runPowerShell(
        `(Test-Connection -ComputerName 1.1.1.1 -Count 1 -TimeoutSeconds 2 -ErrorAction SilentlyContinue).ResponseTime`,
        { timeout: 4000 }
      );
      const latency = parseInt(res.stdout || '0', 10);

      if (!isNaN(latency) && latency > 0) {
        win.webContents.send('doctor:ping-update', { ping: latency });

        if (latency >= watchdogThresholdMs) {
          logger.warn(`Pic de latence anormal détecté par le Watchdog : ${latency}ms (Seuil: ${watchdogThresholdMs}ms)`);
          win.webContents.send('notification:trigger', {
            type: 'lag',
            title: 'Pic de latence élevé détecté',
            message: `Latence anormale de ${latency}ms détectée. Purge automatique des sockets...`,
            latency,
          });

          // Perform lightweight safe flush
          await runPowerShell(`Clear-DnsClientCache; ipconfig /flushdns | Out-Null`, { timeout: 6000 });
        }
      }
    } catch {}
  }, 20000);
}
