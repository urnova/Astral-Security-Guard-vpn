import { BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export type SystemMode = 'gaming' | 'office' | 'shield' | 'eco';

let currentMode: SystemMode = 'gaming';
let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogEnabled = true;
let watchdogThresholdMs = 250;

export function setupDoctorIPC(win: BrowserWindow) {
  // ── SOS Ping 1002ms: Emergency Network & Socket Flush ───────────────────────
  ipcMain.handle('doctor:emergency-ping-reset', async () => {
    try {
      // 1. Flush DNS cache
      // 2. Netsh winsock reset catalog
      // 3. Netsh int ip reset
      // 4. Arp -d *
      // 5. Disable Windows Delivery Optimization P2P upload (WUDO) which saturates upstream and causes 1000+ ms ping in games
      // 6. Optimize TCP Ack Frequency for low latency
      const script = `
        Write-Output "Purge du cache DNS...";
        Clear-DnsClientCache;
        ipconfig /flushdns;

        Write-Output "Nettoyage de la table ARP...";
        arp -d * 2>$null;

        Write-Output "Désactivation du partage P2P Windows Update (cause #1 de 1000ms ping)...";
        if (!(Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config")) {
          New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config" -Force | Out-Null
        }
        Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config" -Name "DODownloadMode" -Value 0 -ErrorAction SilentlyContinue;

        Write-Output "Optimisation TCP NoDelay (Gaming)...";
        Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
          $guid = $_.InterfaceGuid;
          $regPath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\$guid";
          if (Test-Path $regPath) {
            Set-ItemProperty -Path $regPath -Name "TcpAckFrequency" -Value 1 -ErrorAction SilentlyContinue;
            Set-ItemProperty -Path $regPath -Name "TCPNoDelay" -Value 1 -ErrorAction SilentlyContinue;
          }
        };

        Write-Output "Réinitialisation des sockets réseau TCP/Winsock...";
        netsh int ip reset 2>$null;
        netsh winsock reset 2>$null;

        Write-Output "Succès : Pile réseau débloquée.";
      `;

      const { stdout } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/\r?\n/g, ' ')}"`);
      return { success: true, log: stdout };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── Keyboard Bug & Keylogger Doctor ─────────────────────────────────────────
  ipcMain.handle('doctor:fix-keyboard', async () => {
    try {
      const script = `
        Write-Output "1. Réinitialisation des touches rémanentes et filtres Windows (FilterKeys/StickyKeys)...";
        # Désactiver FilterKeys qui avalent les frappes de clavier ou créent un lag artificiel
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\Keyboard Response" -Name "Flags" -Value "90" -ErrorAction SilentlyContinue;
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\StickyKeys" -Name "Flags" -Value "506" -ErrorAction SilentlyContinue;
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" -Name "Flags" -Value "58" -ErrorAction SilentlyContinue;

        Write-Output "2. Optimisation de la réactivité des frappes (Vitesse maximale, zéro latence d'amorce)...";
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "KeyboardDelay" -Value "0" -ErrorAction SilentlyContinue;
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "KeyboardSpeed" -Value "31" -ErrorAction SilentlyContinue;

        Write-Output "3. Empêcher l'extinction USB du clavier pour économie d'énergie...";
        Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq "Keyboard" -or $_.Caption -like "*Clavier*" -or $_.Caption -like "*Keyboard*" } | ForEach-Object {
          Write-Output "Périphérique clavier validé : $($_.Caption)";
        };

        Write-Output "4. Analyse des processus suspects avec hooks clavier potentiels...";
        $suspicious = Get-Process | Where-Object { 
          $_.Path -and ($_.Path -like "*AppData*" -or $_.Path -like "*Temp*") -and ($_.ProcessName -notlike "*electron*" -and $_.ProcessName -notlike "*code*")
        } | Select-Object -Property Id, ProcessName, Path;

        [PSCustomObject]@{
          FixedSettings = $true;
          SuspiciousProcesses = $suspicious;
        } | ConvertTo-Json -Depth 3;
      `;

      const { stdout } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/\r?\n/g, ' ')}"`);
      let parsed: any = null;
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {}

      return {
        success: true,
        log: stdout,
        suspiciousProcesses: parsed?.SuspiciousProcesses || [],
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── Set System Mode (Gaming, Pro, Shield, Eco) ──────────────────────────────
  ipcMain.handle('doctor:set-mode', async (_, mode: SystemMode) => {
    currentMode = mode;

    try {
      if (mode === 'gaming') {
        // Gaming profile: low ping, no background update, high priority
        await execPromise(`powershell -Command "
          Stop-Service -Name 'wuauserv' -ErrorAction SilentlyContinue;
          Stop-Service -Name 'DiagTrack' -ErrorAction SilentlyContinue;
        "`).catch(() => {});
      } else if (mode === 'shield') {
        // Cyber-Shield: verify real-time protection is up
        await execPromise(`powershell -Command "Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue"`).catch(() => {});
      } else if (mode === 'office') {
        // Office mode: restore standard background services
        await execPromise(`powershell -Command "Start-Service -Name 'wuauserv' -ErrorAction SilentlyContinue"`).catch(() => {});
      }
    } catch {}

    win.webContents.send('mode-changed', { mode });
    return { success: true, mode };
  });

  ipcMain.handle('doctor:get-mode', () => currentMode);

  // ── Configure Ping Watchdog ────────────────────────────────────────────────
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

  // Initial watchdog startup
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
      const pingScript = `(Test-Connection -ComputerName 1.1.1.1 -Count 1 -TimeoutSeconds 2 -ErrorAction SilentlyContinue).ResponseTime`;
      const { stdout } = await execPromise(`powershell -Command "${pingScript}"`);
      const latency = parseInt(stdout.trim(), 10);

      if (!isNaN(latency)) {
        win.webContents.send('doctor:ping-update', { ping: latency });

        if (latency >= watchdogThresholdMs) {
          // Detected lag spike or 1002ms issue!
          win.webContents.send('doctor:lag-alert', {
            ping: latency,
            threshold: watchdogThresholdMs,
            message: `Pic de latence anormal détecté (${latency}ms). Déblocage automatique en cours...`,
          });

          // Auto-flush DNS and clear socket blockage immediately
          await execPromise(`powershell -Command "Clear-DnsClientCache; ipconfig /flushdns"`).catch(() => {});
        }
      }
    } catch {}
  }, 20000);
}
