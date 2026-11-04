import { BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as electron from 'electron';
const app = (electron as any)?.app || (electron as any)?.default?.app;
import https from 'https';
import dns from 'dns';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { detectThirdPartyVpn } from './vpn';
import { executePrivilegedAction } from './privilegedHelper';
import { measureTcpProbe } from './nativePing';
import { loadPreferences, savePreferences } from './profile';
import { SpeedtestExecutor } from './speedtestEngine';

const speedtestExecutor = new SpeedtestExecutor();
let currentRunToken = 0;

export function setupNetworkIPC(win: BrowserWindow) {
  // ── Annulation immédiate du Speedtest ──────────────────────────────────────
  ipcMain.handle('network:cancel-speedtest', () => {
    currentRunToken++;
    speedtestExecutor.cancel();
    logger.info('[Network] Speedtest annulé par l\'utilisateur et sockets fermés.');
    try {
      win.webContents.send('network-event', { type: 'speedtest-cancelled' });
    } catch {}
    return { success: true };
  });

  // ── High-Fidelity Speed Test via SpeedtestExecutor ─────────────────────────
  ipcMain.handle('network:speedtest', async () => {
    if (speedtestExecutor.getRunning()) {
      return {
        success: false,
        error: 'Un test de débit est déjà en cours d\'exécution.',
        result: null,
      };
    }

    const runToken = ++currentRunToken;
    logger.info('[Network] Démarrage du Speed Test multi-flux via exécuteur...');
    try {
      win.webContents.send('network-event', { type: 'speedtest-start' });
    } catch {}

    const outcome = await speedtestExecutor.run({
      onProgress: (event) => {
        // Ignorer les événements d'une exécution obsolète ou annulée
        if (runToken !== currentRunToken) return;
        try {
          win.webContents.send('network-event', event);
        } catch {}
      },
      checkCancelled: () => runToken !== currentRunToken,
    });

    if (runToken !== currentRunToken || outcome.cancelled) {
      try {
        win.webContents.send('network-event', { type: 'speedtest-cancelled' });
      } catch {}
      return { success: false, cancelled: true, result: null };
    }

    if (!outcome.success || !outcome.result) {
      try {
        win.webContents.send('network-event', {
          type: 'speedtest-error',
          error: outcome.error || 'Test de débit indisponible.',
        });
      } catch {}
      return {
        success: false,
        error: outcome.error || 'Test de débit indisponible.',
        result: null,
      };
    }

    // Sauvegarde du résultat réel dans le profil utilisateur uniquement si non annulé
    try {
      savePreferences({ lastSpeedResult: outcome.result });
    } catch (err: any) {
      logger.warn('[Network] Erreur sauvegarde lastSpeedResult:', err.message);
    }

    try {
      win.webContents.send('network-event', {
        type: 'speedtest-complete',
        result: outcome.result,
      });
    } catch {}

    return outcome;
  });

  // ── TCP Stack Status & Telemetry (Sans aucune valeur inventée) ─────────────
  ipcMain.handle('network:get-stack-status', async () => {
    try {
      const script = `
        $tcp = netsh int tcp show global
        $dnsCount = (Get-DnsClientCache -ErrorAction SilentlyContinue | Measure-Object).Count
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        [PSCustomObject]@{
          autotuning = if ($tcp -match 'Receive Window Auto-Tuning Level\\s*:\\s*(.+)') { $matches[1].Trim() } else { $null }
          rss = if ($tcp -match 'Receive-Side Scaling State\\s*:\\s*(.+)') { $matches[1].Trim() } else { $null }
          heuristics = if ($tcp -match 'RFC 1323 Timestamps\\s*:\\s*(.+)') { $matches[1].Trim() } else { $null }
          dnsCacheEntries = $dnsCount
          isElevated = $isAdmin
        } | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell(script, { asJson: true, timeout: 4000 });
      if (res.success && res.data) {
        return {
          success: true,
          stack: res.data,
        };
      }
      return {
        success: false,
        error: res.error || 'Impossible de lire les paramètres de la pile TCP/IP Windows.',
        stack: null,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Échec de la commande de diagnostic TCP/IP.',
        stack: null,
      };
    }
  });

  // ── Network Optimization (Sauvegarde préalable, vérification élévation) ────
  ipcMain.handle('network:optimize', async () => {
    logger.info('[Network] Exécution des optimisations réseau (Stack TCP/IP, DNS)...');
    try {
      const readScript = `
        $tcp = netsh int tcp show global
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        [PSCustomObject]@{
          autotuning = if ($tcp -match 'Receive Window Auto-Tuning Level\\s*:\\s*(.+)') { $matches[1].Trim() } else { 'normal' }
          rss = if ($tcp -match 'Receive-Side Scaling State\\s*:\\s*(.+)') { $matches[1].Trim() } else { 'enabled' }
          heuristics = if ($tcp -match 'RFC 1323 Timestamps\\s*:\\s*(.+)') { $matches[1].Trim() } else { 'disabled' }
          isElevated = $isAdmin
        } | ConvertTo-Json -Compress
      `;
      const curRes = await runPowerShell(readScript, { asJson: true, timeout: 4000 });
      const curData = curRes.data || {};

      if (!curData.isElevated) {
        return {
          success: false,
          error: 'Élévation administrateur requise pour calibrer les paramètres TCP/IP globaux Windows.',
        };
      }

      const currentPrefs = loadPreferences();
      if (!currentPrefs.network?.tcpBackup) {
        savePreferences({
          network: {
            ...(currentPrefs.network || {}),
            tcpBackup: {
              autotuning: curData.autotuning || 'normal',
              rss: curData.rss || 'enabled',
              heuristics: curData.heuristics || 'disabled',
              backedUpAt: new Date().toISOString(),
            },
          },
        });
        logger.info('[Network] Sauvegarde de la pile TCP/IP créée dans user-profile.json.');
      }

      const applyScript = `
        $errs = @()
        try { netsh int tcp set global autotuninglevel=normal } catch { $errs += $_.Exception.Message }
        try { netsh int tcp set global rss=enabled } catch { $errs += $_.Exception.Message }
        try { netsh int tcp set heuristics disabled } catch { $errs += $_.Exception.Message }
        try { Clear-DnsClientCache -ErrorAction SilentlyContinue } catch {}
        try { ipconfig /flushdns | Out-Null } catch {}
        [PSCustomObject]@{
          success = ($errs.Count -eq 0)
          errors = $errs
        } | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell(applyScript, { asJson: true, timeout: 6000 });
      if (res.data?.success) {
        try {
          const pCurrent = loadPreferences();
          savePreferences({
            network: {
              ...(pCurrent.network || {}),
              lastAppliedTcp: {
                autotuning: 'normal',
                rss: 'enabled',
                heuristics: 'disabled',
                appliedAt: new Date().toISOString(),
              },
            },
          });
        } catch {}
        return {
          success: true,
          message: 'Optimisation réseau réussie : autotuning normal, RSS activé, cache DNS purgé.',
        };
      } else {
        return {
          success: false,
          error: res.data?.errors?.join(', ') || res.error || 'Erreur lors du calibrage TCP.',
        };
      }
    } catch (err: any) {
      logger.warn('[Network] Erreur lors de l\'optimisation réseau :', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Restauration de la pile TCP/IP d'origine (Protection anti-conflit) ──────
  ipcMain.handle('network:restore-tcp-stack', async (_, opts?: { force?: boolean }) => {
    logger.info('[Network] Restauration de la pile TCP/IP d\'origine...');
    try {
      const prefs = loadPreferences();
      const backup = prefs.network?.tcpBackup;

      if (!backup) {
        return {
          success: false,
          error: 'Aucune sauvegarde TCP/IP trouvée dans le profil.',
        };
      }

      // Lecture préalable de l'état actuel pour détecter une modification extérieure
      const detectCurScript = `
        $tcp = netsh int tcp show global
        $autotuning = if ($tcp -match 'Receive Window Auto-Tuning Level\\s*:\\s*(\\w+)') { $matches[1].ToLower() } else { 'unknown' }
        $rss = if ($tcp -match 'Receive-Side Scaling State\\s*:\\s*(\\w+)') { $matches[1].ToLower() } else { 'unknown' }
        $heuristics = if ($tcp -match 'RFC 1323 Timestamps\\s*:\\s*(\\w+)') { $matches[1].ToLower() } else { 'unknown' }
        [PSCustomObject]@{ autotuning = $autotuning; rss = $rss; heuristics = $heuristics } | ConvertTo-Json -Compress
      `;
      const curTcpRes = await runPowerShell(detectCurScript, { asJson: true, timeout: 3500 });
      const curTcpData = curTcpRes.data;

      if (!curTcpData || curTcpData.autotuning === 'unknown') {
        if (!opts?.force) {
          return {
            success: false,
            conflict: true,
            reason: 'read_failed',
            message: 'Impossible de lire les paramètres TCP/IP actuels. Restauration suspendue par précaution sans confirmation explicite.',
          };
        }
      } else {
        const lastApplied = prefs.network?.lastAppliedTcp;
        if (lastApplied && !opts?.force) {
          const hasConflict = curTcpData.autotuning !== lastApplied.autotuning ||
            curTcpData.rss !== lastApplied.rss ||
            curTcpData.heuristics !== lastApplied.heuristics;

          if (hasConflict) {
            return {
              success: false,
              conflict: true,
              reason: 'external_mutation',
              current: curTcpData,
              lastApplied,
              initialBackup: backup,
              message: 'Conflit détecté : les paramètres de la pile TCP/IP ont été modifiés en dehors de Vanguard.',
            };
          }
        }
      }

      const targetAutotuning = backup?.autotuning || 'normal';
      const targetRss = backup?.rss || 'enabled';
      const targetHeuristics = backup?.heuristics || 'disabled';

      const script = `
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if (-not $isAdmin) {
          [PSCustomObject]@{ success = $false; error = 'Élévation requise' } | ConvertTo-Json -Compress
          exit
        }
        $errs = @()
        try { netsh int tcp set global autotuninglevel=${targetAutotuning} } catch { $errs += $_.Exception.Message }
        try { netsh int tcp set global rss=${targetRss} } catch { $errs += $_.Exception.Message }
        try { netsh int tcp set heuristics ${targetHeuristics} } catch { $errs += $_.Exception.Message }
        try { Clear-DnsClientCache -ErrorAction SilentlyContinue } catch {}
        [PSCustomObject]@{
          success = ($errs.Count -eq 0)
          errors = $errs
        } | ConvertTo-Json -Compress
      `;

      const res = await runPowerShell(script, { asJson: true, timeout: 6000 });
      if (res.data?.error === 'Élévation requise') {
        return {
          success: false,
          error: 'Élévation administrateur requise pour restaurer la pile TCP/IP Windows.',
        };
      }

      if (res.data?.success) {
        try {
          const pCurrent = loadPreferences();
          savePreferences({
            network: {
              ...(pCurrent.network || {}),
              lastAppliedTcp: {
                autotuning: targetAutotuning,
                rss: targetRss,
                heuristics: targetHeuristics,
                appliedAt: new Date().toISOString(),
              },
            },
          });
        } catch {}
        return {
          success: true,
          message: `Pile TCP/IP restaurée avec succès (Autotuning: ${targetAutotuning}, RSS: ${targetRss}).`,
        };
      } else {
        return {
          success: false,
          error: res.data?.errors?.join(', ') || 'Erreur lors de la restauration TCP.',
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Purge immédiate du cache DNS ──────────────────────────────────────────
  ipcMain.handle('network:flush-dns-cache', async () => {
    logger.info('[Network] Purge immédiate du cache DNS Windows...');
    try {
      try {
        const helperRes = await executePrivilegedAction('FLUSH_DNS', {});
        if (helperRes.success) {
          return { success: true, message: 'Cache de résolution DNS Windows purgé via Helper.' };
        }
      } catch {}

      const script = `
        Clear-DnsClientCache -ErrorAction SilentlyContinue
        ipconfig /flushdns | Out-Null
        [PSCustomObject]@{ flushed = $true } | ConvertTo-Json -Compress
      `;
      await runPowerShell(script, { asJson: true, timeout: 3500 });
      return { success: true, message: 'Cache de résolution DNS Windows purgé avec succès.' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Network Adapters Info ─────────────────────────────────────────────────
  ipcMain.handle('network:get-adapters', async () => {
    const script = `
      Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } |
        Select-Object Name, InterfaceDescription, LinkSpeed, MacAddress | ConvertTo-Json -Compress
    `;
    const res = await runPowerShell(script, { asJson: true });
    let adapters = res.data || [];
    if (!Array.isArray(adapters)) adapters = adapters ? [adapters] : [];
    return { success: true, adapters };
  });

  // ── Real Wi-Fi Diagnostics ─────────────────────────────────────────────────
  const handleWifiDiag = async () => {
    const script = `
      $current = netsh wlan show interfaces
      $networks = netsh wlan show networks mode=bssid

      [PSCustomObject]@{
        currentInterface = ($current | Out-String)
        visibleNetworks = ($networks | Out-String)
      } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true });
    if (!res.success || !res.data) {
      return {
        success: false,
        error: 'Aucune interface Wi-Fi active détectée (connexion Ethernet ou Wi-Fi désactivé).',
      };
    }

    const currentText: string = res.data.currentInterface || '';
    const networksText: string = res.data.visibleNetworks || '';

    const ssidMatch = currentText.match(/SSID\s*:\s*(.+)/);
    const signalMatch = currentText.match(/Signal\s*:\s*(\d+)%/);
    const radioMatch = currentText.match(/Radio type|Type de radio\s*:\s*(.+)/i);
    const channelMatch = currentText.match(/Channel|Canal\s*:\s*(\d+)/i);

    if (!ssidMatch) {
      return {
        success: false,
        error: 'Interface Wi-Fi non connectée ou inactive.',
      };
    }

    const ssid = ssidMatch[1].trim();
    const signalPercent = signalMatch ? parseInt(signalMatch[1], 10) : 0;
    const radioType = radioMatch ? radioMatch[1].trim() : 'Inconnu';
    const currentChannel = channelMatch ? parseInt(channelMatch[1], 10) : 0;

    const channelMatches = [...networksText.matchAll(/Channel|Canal\s*:\s*(\d+)/gi)];
    const channelCounts: Record<number, number> = {};
    for (const m of channelMatches) {
      const ch = parseInt(m[1], 10);
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    }

    const interferenceCount = channelCounts[currentChannel] || 1;
    let recommendedChannel = currentChannel > 14 ? 36 : 1;
    let minCongestion = 999;
    const candidateChannels = currentChannel > 14 ? [36, 40, 44, 48, 149] : [1, 6, 11];

    for (const c of candidateChannels) {
      const count = channelCounts[c] || 0;
      if (count < minCongestion) {
        minCongestion = count;
        recommendedChannel = c;
      }
    }

    const diagData = {
      ssid,
      signalPercent,
      channel: currentChannel,
      currentChannel,
      radioType,
      interferenceCount: Math.max(0, interferenceCount - 1),
      recommendedChannel,
      isOptimal: currentChannel === recommendedChannel,
      isInterfering: interferenceCount > 3,
      recommendation: currentChannel === recommendedChannel
        ? 'Canal optimal détecté'
        : `Basculez sur le canal ${recommendedChannel} pour réduire les interférences`,
    };

    return {
      success: true,
      diag: diagData,
      data: diagData,
    };
  };

  ipcMain.handle('network:get-wifi-diag', handleWifiDiag);
  ipcMain.handle('network:wifi-interference', handleWifiDiag);

  // ── Live DNS Benchmark (Vraie résolution DNS UDP requête A + Poignée TCP) ──
  const handleDnsBenchmark = async () => {
    logger.info('[Network] Mesure de la résolution DNS réelle (requête A UDP standard)...');

    const providers = [
      { id: 'cloudflare', name: 'Cloudflare', provider: 'Cloudflare', ip: '1.1.1.1', primary: '1.1.1.1', secondary: '1.0.0.1' },
      { id: 'google', name: 'Google DNS', provider: 'Google', ip: '8.8.8.8', primary: '8.8.8.8', secondary: '8.8.4.4' },
      { id: 'quad9', name: 'Quad9', provider: 'Quad9', ip: '9.9.9.9', primary: '9.9.9.9', secondary: '149.112.112.112' },
      { id: 'opendns', name: 'Cisco OpenDNS', provider: 'OpenDNS', ip: '208.67.222.222', primary: '208.67.222.222', secondary: '208.67.220.220' },
    ];

    const results = [];
    for (const p of providers) {
      let resolutionMs: number | null = null;
      let tcpConnectMs: number | null = null;
      let status: 'fastest' | 'good' | 'slow' | 'unreachable';

      // 1. Vrai test de résolution DNS requête A via Resolver Node.js
      try {
        const resolver = new dns.promises.Resolver({ timeout: 1500, tries: 1 });
        resolver.setServers([p.primary]);
        const start = performance.now();
        await resolver.resolve4('cloudflare.com');
        resolutionMs = Math.round(performance.now() - start);
      } catch {
        resolutionMs = null;
      }

      // 2. Poignée de main TCP sur port 53 (accessibilité transport)
      const tcpProbe = await measureTcpProbe(p.primary, 53, 1000);
      tcpConnectMs = tcpProbe.latencyMs;

      if (resolutionMs === null && tcpConnectMs === null) {
        status = 'unreachable';
      } else if ((resolutionMs ?? tcpConnectMs ?? 999) < 25) {
        status = 'fastest';
      } else if ((resolutionMs ?? tcpConnectMs ?? 999) < 60) {
        status = 'good';
      } else {
        status = 'slow';
      }

      results.push({
        ...p,
        latencyMs: resolutionMs,
        resolutionMs,
        tcpConnectMs,
        status,
        reachable: resolutionMs !== null || tcpProbe.success,
        method: 'Résolution DNS standard (requête A)',
      });
    }

    results.sort((a, b) => {
      if (a.resolutionMs === null) return 1;
      if (b.resolutionMs === null) return -1;
      return a.resolutionMs - b.resolutionMs;
    });

    return { success: true, results, data: results };
  };

  ipcMain.handle('network:test-dns-latencies', handleDnsBenchmark);
  ipcMain.handle('network:dns-benchmark', handleDnsBenchmark);

  // ── Configuration DNS avec sauvegarde préalable (Anti-écrasement) ───────────
  ipcMain.handle('network:set-dns', async (_, dnsType: string) => {
    const cleanDns = typeof dnsType === 'string' ? dnsType.trim().toLowerCase() : '';
    const ALLOWED_DNS_TYPES = new Set(['cloudflare', 'google', 'quad9', 'opendns', 'auto']);
    if (!ALLOWED_DNS_TYPES.has(cleanDns)) {
      logger.warn(`[Security] network:set-dns: Type de DNS rejeté (${dnsType})`);
      return { success: false, error: 'Type de DNS non autorisé ou invalide.' };
    }

    logger.info(`[Network] Application du résolveur DNS : ${cleanDns}`);

    try {
      const prefs = loadPreferences();
      if (!prefs.network?.dnsBackup) {
        const detectScript = `
          $a = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and
            $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
            $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
          } | Select-Object -First 1
          if ($a) {
            $dns = (Get-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses
            [PSCustomObject]@{
              adapterName = $a.Name
              interfaceIndex = $a.InterfaceIndex
              dnsServers = if ($dns) { @($dns) } else { @() }
              isDhcp = ($dns.Count -eq 0)
              family = 'IPv4'
            } | ConvertTo-Json -Compress
          }
        `;
        const detectRes = await runPowerShell(detectScript, { asJson: true, timeout: 3500 });
        if (detectRes.data) {
          savePreferences({
            network: {
              ...(prefs.network || {}),
              dnsBackup: {
                adapterName: detectRes.data.adapterName,
                isDhcp: Boolean(detectRes.data.isDhcp),
                dnsServers: detectRes.data.dnsServers || [],
                backedUpAt: new Date().toISOString(),
              },
            },
          });
          logger.info('[Network] Configuration DNS originale sauvegardée dans le profil.');
        }
      }
    } catch (err: any) {
      logger.warn('[Network] Erreur lors de la capture du backup DNS:', err.message);
    }

    try {
      const helperRes = await executePrivilegedAction('SET_DNS_PROVIDER', { provider: cleanDns });
      if (helperRes.success) {
        return { success: true, dns: cleanDns, servers: helperRes.servers };
      }
    } catch (err: any) {
      logger.warn('[Network] Helper indisponible pour DNS, passage en secours direct:', err.message);
    }

    const vpnCoex = await detectThirdPartyVpn();

    let primary = '1.1.1.1';
    let secondary = '1.0.0.1';

    if (cleanDns === 'google') {
      primary = '8.8.8.8';
      secondary = '8.8.4.4';
    } else if (cleanDns === 'quad9') {
      primary = '9.9.9.9';
      secondary = '149.112.112.112';
    } else if (cleanDns === 'opendns') {
      primary = '208.67.222.222';
      secondary = '208.67.220.220';
    }

    const isAuto = cleanDns === 'auto';
    const script = isAuto
      ? `
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
          $_.Status -eq 'Up' -and
          $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
          $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
        }
        foreach ($a in $adapters) {
          Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ResetServerAddresses -ErrorAction SilentlyContinue
        }
        Clear-DnsClientCache -ErrorAction SilentlyContinue
        ipconfig /flushdns | Out-Null
        [PSCustomObject]@{ applied = $true; adapterCount = @($adapters).Count } | ConvertTo-Json -Compress
      `
      : `
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
          $_.Status -eq 'Up' -and
          $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
          $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
        }
        foreach ($a in $adapters) {
          Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ServerAddresses ('${primary}', '${secondary}') -ErrorAction SilentlyContinue
        }
        Clear-DnsClientCache -ErrorAction SilentlyContinue
        ipconfig /flushdns | Out-Null
        [PSCustomObject]@{ applied = $true; adapterCount = @($adapters).Count } | ConvertTo-Json -Compress
      `;

    const res = await runPowerShell(script, { asJson: true, timeout: 5000 });
    let message = isAuto ? 'DNS réinitialisé en mode automatique (DHCP)' : `DNS ${cleanDns.toUpperCase()} appliqué (${primary}) !`;
    if (vpnCoex.thirdPartyActive) {
      message += ` (Tunnels ${vpnCoex.vpnName} préservés sans altération)`;
    }

    if (res.success) {
      try {
        const pCurrent = loadPreferences();
        savePreferences({
          network: {
            ...(pCurrent.network || {}),
            lastAppliedDns: {
              adapterName: '',
              isDhcp: isAuto,
              dnsServers: isAuto ? [] : [primary, secondary],
              appliedAt: new Date().toISOString(),
            },
          },
        });
      } catch {}
    }

    return {
      success: res.success,
      message,
      thirdPartyVpnPreserved: vpnCoex.thirdPartyActive ? vpnCoex.vpnName : null,
      error: res.error,
    };
  });

  // ── Restauration fidèle des serveurs DNS précédents (Protection anti-conflit) 
  ipcMain.handle('network:restore-previous-dns', async (_, opts?: { force?: boolean }) => {
    logger.info('[Network] Restauration des serveurs DNS précédents...');
    try {
      const prefs = loadPreferences();
      const backup = prefs.network?.dnsBackup;

      if (!backup) {
        return {
          success: false,
          error: 'Aucune sauvegarde de configuration DNS d\'origine n\'a été trouvée dans le profil.',
        };
      }

      // Lecture préalable de l'état actuel pour détecter une modification extérieure
      const detectCurScript = `
        $a = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
          $_.Status -eq 'Up' -and
          $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
          $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
        } | Select-Object -First 1
        if ($a) {
          $dns = (Get-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses
          [PSCustomObject]@{
            adapterName = $a.Name
            interfaceIndex = $a.InterfaceIndex
            dnsServers = if ($dns) { @($dns) } else { @() }
            isDhcp = ($dns.Count -eq 0)
          } | ConvertTo-Json -Compress
        }
      `;
      const curRes = await runPowerShell(detectCurScript, { asJson: true, timeout: 3500 });
      const curData = curRes.data;

      if (!curData) {
        if (!opts?.force) {
          return {
            success: false,
            conflict: true,
            reason: 'read_failed',
            message: 'Impossible de lire avec certitude l\'état DNS actuel. Restauration suspendue par précaution.',
          };
        }
      } else {
        const lastApplied = prefs.network?.lastAppliedDns;
        if (lastApplied && !opts?.force) {
          const currentDhcp = Boolean(curData.isDhcp);
          const lastDhcp = Boolean(lastApplied.isDhcp);
          const currentServers = Array.isArray(curData.dnsServers) ? curData.dnsServers : [];
          const lastServers = Array.isArray(lastApplied.dnsServers) ? lastApplied.dnsServers : [];

          const matchesDhcp = currentDhcp === lastDhcp;
          const matchesServers = currentServers.length === lastServers.length &&
            currentServers.every((s: string, idx: number) => s === lastServers[idx]);

          if (!matchesDhcp || !matchesServers) {
            return {
              success: false,
              conflict: true,
              reason: 'external_mutation',
              current: { isDhcp: currentDhcp, dnsServers: currentServers },
              lastApplied: { isDhcp: lastDhcp, dnsServers: lastServers },
              initialBackup: { isDhcp: Boolean(backup.isDhcp), dnsServers: backup.dnsServers || [] },
              message: 'Conflit détecté : les serveurs DNS ont été modifiés en dehors de Vanguard. Restauration annulée pour éviter d\'écraser vos paramètres.',
            };
          }
        }
      }

      let script = '';
      if (!backup.isDhcp && backup.dnsServers && backup.dnsServers.length > 0) {
        const serversList = backup.dnsServers.map((s: string) => `'${s}'`).join(', ');
        script = `
          $target = '${backup.adapterName || ''}'
          $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and
            ($target -eq '' -or $_.Name -eq $target) -and
            $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
            $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
          }
          foreach ($a in $adapters) {
            Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ServerAddresses (@(${serversList})) -ErrorAction SilentlyContinue
          }
          Clear-DnsClientCache -ErrorAction SilentlyContinue
          ipconfig /flushdns | Out-Null
          [PSCustomObject]@{ restored = $true; mode = 'static'; servers = @(${serversList}) } | ConvertTo-Json -Compress
        `;
      } else {
        script = `
          $target = '${backup.adapterName || ''}'
          $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and
            ($target -eq '' -or $_.Name -eq $target) -and
            $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
            $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
          }
          foreach ($a in $adapters) {
            Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ResetServerAddresses -ErrorAction SilentlyContinue
          }
          Clear-DnsClientCache -ErrorAction SilentlyContinue
          ipconfig /flushdns | Out-Null
          [PSCustomObject]@{ restored = $true; mode = 'dhcp' } | ConvertTo-Json -Compress
        `;
      }

      const res = await runPowerShell(script, { asJson: true, timeout: 5000 });
      if (res.success) {
        try {
          const pCurrent = loadPreferences();
          savePreferences({
            network: {
              ...(pCurrent.network || {}),
              lastAppliedDns: {
                adapterName: backup.adapterName || '',
                isDhcp: Boolean(backup.isDhcp),
                dnsServers: backup.dnsServers || [],
                appliedAt: new Date().toISOString(),
              },
            },
          });
        } catch {}
      }

      return {
        success: res.success,
        message: backup.isDhcp
          ? 'Configuration DNS d\'origine restaurée en mode automatique (DHCP).'
          : `Configuration DNS d'origine restaurée avec succès (${backup.dnsServers?.join(', ')}).`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Active Network Processes ───────────────────────────────────────────────
  ipcMain.handle('network:get-processes', async () => {
    const script = `
      $connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Select-Object -First 25
      $results = @()
      foreach ($c in $connections) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p) {
          $results += [PSCustomObject]@{
            pid = $c.OwningProcess
            name = $p.ProcessName
            localPort = $c.LocalPort
            remoteAddress = $c.RemoteAddress
            remotePort = $c.RemotePort
            state = $c.State.ToString()
          }
        }
      }
      $results | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true });
    let list = res.data || [];
    if (!Array.isArray(list)) list = list ? [list] : [];
    return { success: true, processes: list };
  });

  // ── Gaming Network Priority Mode (Honnêteté produit : non implémenté) ──────
  ipcMain.handle('network:gaming-mode-on', async () => {
    logger.info('[Network] Priorité réseau gaming demandée mais non implémentée dans cette version.');
    return {
      success: false,
      status: 'unimplemented',
      message: 'La priorisation dynamique de paquets gaming n\'est pas implémentée dans cette version.',
    };
  });

  ipcMain.handle('network:gaming-mode-off', async () => {
    return { success: true, active: false };
  });

  // ── Network Diagnostics (Sans aucune valeur inventée) ──────────────────────
  ipcMain.handle('network:get-diagnostics', async () => {
    try {
      const script = `
        $adapter = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
          $_.Status -eq 'Up' -and
          $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|Loopback' -and
          $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
        } | Select-Object -First 1

        if (-not $adapter) {
          $adapter = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
        }

        $ip = $null
        $gw = $null
        $dns = @()
        $ipv6Active = $false
        if ($adapter) {
          $ipObj = Get-NetIPAddress -InterfaceAlias $adapter.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254*' } | Select-Object -First 1
          if ($ipObj) { $ip = $ipObj.IPAddress }
          $gwObj = Get-NetRoute -InterfaceAlias $adapter.Name -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($gwObj) { $gw = $gwObj.NextHop }
          $dnsAddresses = Get-DnsClientServerAddress -InterfaceAlias $adapter.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue
          if ($dnsAddresses -and $dnsAddresses.ServerAddresses) {
            $dns = $dnsAddresses.ServerAddresses
          }
          $v6Binding = Get-NetAdapterBinding -InterfaceAlias $adapter.Name -ComponentID 'ms_tcpip6' -ErrorAction SilentlyContinue
          $ipv6State = 'unknown'
          if ($v6Binding) {
            $ipv6State = if ($v6Binding.Enabled) { 'enabled' } else { 'disabled' }
          }
        }

        $dnsStr = ($dns -join ', ')
        $friendlyDns = 'Automatique (DHCP)'
        if ($dnsStr -match '8\\.8\\.8\\.8') { $friendlyDns = 'Google Public DNS (8.8.8.8)' }
        elseif ($dnsStr -match '1\\.1\\.1\\.1') { $friendlyDns = 'Cloudflare DNS (1.1.1.1)' }
        elseif ($dnsStr -match '9\\.9\\.9\\.9') { $friendlyDns = 'Quad9 (9.9.9.9)' }
        elseif ($dnsStr -match '208\\.67') { $friendlyDns = 'Cisco OpenDNS' }
        elseif ($dnsStr) { $friendlyDns = $dnsStr }
        else { $friendlyDns = 'Non configuré' }

        [PSCustomObject]@{
          adapterName = if ($adapter) { $adapter.Name } else { 'Inconnu' }
          description = if ($adapter) { $adapter.InterfaceDescription } else { '' }
          macAddress  = if ($adapter) { $adapter.MacAddress } else { '' }
          type        = if ($adapter) { if ($adapter.InterfaceDescription -match 'Wi-Fi|Wireless|802\\.11') { 'Wi-Fi' } else { 'Ethernet' } } else { 'Inconnu' }
          localIp     = $ip
          gateway     = $gw
          dnsServers  = $dnsStr
          friendlyDns = $friendlyDns
          ipv6State   = $ipv6State
          ipv6Active  = ($ipv6State -eq 'enabled')
        } | ConvertTo-Json -Compress
      `;

      const res = await runPowerShell(script, { asJson: true, timeout: 4000 });
      const d = res.data || {};

      let isp = '';
      let externalIp = '';
      try {
        await new Promise<void>((resolve) => {
          const req = https.get('https://speed.cloudflare.com/cdn-cgi/trace', { timeout: 2000 }, (r) => {
            let body = '';
            r.on('data', chunk => body += chunk);
            r.on('end', () => {
              const ipMatch = body.match(/ip=([^\\r\\n]+)/);
              if (ipMatch) externalIp = ipMatch[1].trim();
              const locMatch = body.match(/loc=([^\\r\\n]+)/);
              const coloMatch = body.match(/colo=([^\\r\\n]+)/);
              if (coloMatch) {
                isp = `Point Edge ${coloMatch[1].trim()} (${locMatch ? locMatch[1].trim() : 'FR'})`;
              }
              resolve();
            });
          });
          req.on('error', () => resolve());
          req.on('timeout', () => { req.destroy(); resolve(); });
        });
      } catch {}

      // Sondes distinctes vers cibles identifiées
      let gwProbeResult: { status: 'ok' | 'unavailable' | 'none'; latencyMs: number | null; detail: string } = {
        status: 'none',
        latencyMs: null,
        detail: 'Passerelle non configurée',
      };

      if (d.gateway && d.gateway !== '—' && d.gateway !== '') {
        const pGw = await measureTcpProbe(d.gateway, 80, 500);
        if (pGw.success) {
          gwProbeResult = { status: 'ok', latencyMs: pGw.latencyMs, detail: `Port 80 TCP accessible (${pGw.latencyMs} ms)` };
        } else {
          const pGwDns = await measureTcpProbe(d.gateway, 53, 500);
          if (pGwDns.success) {
            gwProbeResult = { status: 'ok', latencyMs: pGwDns.latencyMs, detail: `Port 53 TCP accessible (${pGwDns.latencyMs} ms)` };
          } else {
            gwProbeResult = {
              status: 'unavailable',
              latencyMs: null,
              detail: 'Ports TCP 80/53 fermés ou filtrés par la box (service local indisponible)',
            };
          }
        }
      }

      const pCloudflare = await measureTcpProbe('1.1.1.1', 443, 600);
      const pGoogle = await measureTcpProbe('8.8.8.8', 53, 600);

      return {
        success: true,
        adapterName: d.adapterName || 'Interface active',
        interface: d.description ? `${d.adapterName} (${d.description})` : (d.adapterName || 'Interface active'),
        localIp: d.localIp || '—',
        externalIp: externalIp || undefined,
        gateway: d.gateway || '—',
        dns: d.friendlyDns || 'Non configuré',
        dnsServer: d.dnsServers || '',
        isp: isp || 'Non résolu',
        provider: isp || 'Non résolu',
        macAddress: d.macAddress || '—',
        connectionType: d.type || 'Ethernet',
        type: d.type || 'Ethernet',
        ipv6State: (d.ipv6State as 'enabled' | 'disabled' | 'unknown') || 'unknown',
        ipv6Active: d.ipv6State === 'enabled' || Boolean(d.ipv6Active),
        probes: {
          gateway: gwProbeResult,
          gatewayMs: gwProbeResult.latencyMs,
          cloudflare: {
            target: '1.1.1.1:443',
            protocol: 'TCP Handshake',
            latencyMs: pCloudflare.latencyMs,
            success: pCloudflare.success,
          },
          cloudflareMs: pCloudflare.latencyMs,
          google: {
            target: '8.8.8.8:53',
            protocol: 'TCP Handshake',
            latencyMs: pGoogle.latencyMs,
            success: pGoogle.success,
          },
          googleMs: pGoogle.latencyMs,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        adapterName: 'Non disponible',
        localIp: '—',
        gateway: '—',
        dns: 'Non détecté',
        isp: 'Non détecté',
      };
    }
  });
  // ── QoS par application avec registre de possession et protection anti-collision ──
  // RÈGLE FORMELLE : Vanguard ne supprime et ne modifie QUE les politiques qu'il a lui-même créées.
  // Toute politique préexistante (créée avant Vanguard, par Windows ou GPO) est sanctuarisée.
  const ownedQosPolicies = new Set<string>();
  const preExistingQosPolicies = new Set<string>();
  let qosOwnershipInitialized = false;

  function getQosRegistryPath(): string {
    try {
      const userData = app?.getPath ? app.getPath('userData') : os.tmpdir();
      return path.join(userData, 'vanguard_qos_registry.json');
    } catch {
      return path.join(os.tmpdir(), 'vanguard_qos_registry.json');
    }
  }

  function loadQosRegistry(): void {
    try {
      const p = getQosRegistryPath();
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(data)) {
          for (const name of data) {
            if (typeof name === 'string' && name.trim()) ownedQosPolicies.add(name.trim());
          }
        }
      }
    } catch (e: any) {
      logger.warn('[QoS] Erreur lecture registre QoS :', e.message);
    }
  }

  function saveQosRegistry(): void {
    try {
      const p = getQosRegistryPath();
      fs.writeFileSync(p, JSON.stringify(Array.from(ownedQosPolicies), null, 2), 'utf8');
    } catch (e: any) {
      logger.warn('[QoS] Erreur écriture registre QoS :', e.message);
    }
  }

  async function ensureQosOwnershipInitialized(): Promise<void> {
    if (qosOwnershipInitialized) return;
    qosOwnershipInitialized = true;
    loadQosRegistry();

    // Snapshot des politiques système actuelles : celles absentes de notre registre sont préexistantes
    try {
      const script = `
        try {
          (Get-NetQosPolicy -ErrorAction Stop | Select-Object -ExpandProperty Name) -join ','
        } catch { '' }
      `;
      const res = await runPowerShell<string>(script, { timeout: 4000 });
      if (res?.data && typeof res.data === 'string') {
        const names = res.data.split(',').map(s => s.trim()).filter(Boolean);
        for (const n of names) {
          if (!ownedQosPolicies.has(n)) {
            preExistingQosPolicies.add(n);
          }
        }
        logger.info(`[QoS] Initialisation possession : ${ownedQosPolicies.size} politique(s) Vanguard, ${preExistingQosPolicies.size} politique(s) préexistante(s) sanctuarisée(s).`);
      }
    } catch (err: any) {
      logger.warn('[QoS] Impossible de capturer le snapshot des politiques préexistantes :', err.message);
    }
  }

  ipcMain.handle('network:set-qos', async (_, opts: { name: string; appPath: string; throttleKbps: number }) => {
    try {
      const { name, appPath, throttleKbps } = opts;
      if (!name || !appPath || throttleKbps < 0) {
        return { success: false, error: 'Paramètres invalides (nom, chemin ou débit manquant).' };
      }

      await ensureQosOwnershipInitialized();

      // Vérifier la disponibilité de Get-NetQosPolicy (Windows 10+)
      const checkScript = `
        try { Get-Command Get-NetQosPolicy -ErrorAction Stop | Out-Null; Write-Output 'ok' }
        catch { Write-Output 'unsupported' }
      `;
      const checkRes = await runPowerShell<string>(checkScript, { timeout: 3000 });
      if (!checkRes?.data?.includes('ok')) {
        return { success: false, error: 'Get-NetQosPolicy non disponible sur ce système (Windows 10+ requis).', unsupported: true };
      }

      const policyName = `Vanguard-${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;

      // Détection de collision : refus formel d'écraser une politique préexistante
      if (preExistingQosPolicies.has(policyName)) {
        logger.warn(`[QoS] Collision détectée : ${policyName} préexiste hors Vanguard. Création refusée.`);
        return {
          success: false,
          error: `Une politique réseau préexistante porte déjà le nom "${policyName}". Modification refusée pour éviter un conflit système.`
        };
      }

      const bitsPerSec = throttleKbps * 1000;
      const script = `
        $policyName = '${policyName}'
        $appPath = '${appPath.replace(/'/g, "''")}'
        $bps = ${bitsPerSec}
        $existing = Get-NetQosPolicy -Name $policyName -ErrorAction SilentlyContinue
        if ($existing) { Remove-NetQosPolicy -Name $policyName -Confirm:$false -ErrorAction SilentlyContinue }
        New-NetQosPolicy -Name $policyName -AppPathNameMatchCondition $appPath -ThrottleRateActionBitsPerSecond $bps -ErrorAction Stop | Out-Null
        [PSCustomObject]@{ ok=$true; policy=$policyName } | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 10000 });
      if (res?.data?.ok) {
        ownedQosPolicies.add(policyName);
        saveQosRegistry();
        logger.info(`[QoS] Politique créée et enregistrée sous possession Vanguard : ${policyName} — ${throttleKbps} Kbps`);
        return { success: true, policyName };
      }
      return { success: false, error: 'Échec création de la politique QoS (droits administrateur requis).' };
    } catch (err: any) {
      logger.warn('[QoS] Erreur set-qos :', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('network:remove-qos', async (_, name: string) => {
    try {
      await ensureQosOwnershipInitialized();
      const policyName = `Vanguard-${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;

      // Refus de supprimer une politique non possédée
      if (preExistingQosPolicies.has(policyName)) {
        logger.warn(`[QoS] Tentative de suppression d'une politique préexistante non possédée : ${policyName}`);
        return { success: false, error: 'Suppression refusée : cette politique n\'appartient pas à Vanguard.' };
      }

      const script = `
        $policyName = '${policyName}'
        $existing = Get-NetQosPolicy -Name $policyName -ErrorAction SilentlyContinue
        if ($existing) {
          Remove-NetQosPolicy -Name $policyName -Confirm:$false -ErrorAction Stop
          [PSCustomObject]@{ ok=$true; removed=$policyName } | ConvertTo-Json -Compress
        } else {
          [PSCustomObject]@{ ok=$true; removed=$null } | ConvertTo-Json -Compress
        }
      `;
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 8000 });
      ownedQosPolicies.delete(policyName);
      saveQosRegistry();
      logger.info(`[QoS] Politique possédée supprimée : ${policyName}`);
      return { success: true, removed: res?.data?.removed ?? null };
    } catch (err: any) {
      logger.warn('[QoS] Erreur remove-qos :', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('network:get-qos-status', async () => {
    try {
      await ensureQosOwnershipInitialized();
      const script = `
        try {
          $policies = Get-NetQosPolicy -ErrorAction Stop | Where-Object { $_.Name -like 'Vanguard-*' } |
            Select-Object Name, AppPathNameMatchCondition, ThrottleRateActionBitsPerSecond
          $policies | ConvertTo-Json -Compress
        } catch { '[]' }
      `;
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 8000 });
      const policies = Array.isArray(res?.data) ? res.data : (res?.data ? [res.data] : []);
      // Retourner uniquement les politiques possédées par Vanguard
      return {
        success: true,
        supported: true,
        policies: policies
          .filter((p: any) => ownedQosPolicies.has(String(p.Name || '')) && !preExistingQosPolicies.has(String(p.Name || '')))
          .map((p: any) => ({
            name: String(p.Name || ''),
            appPath: String(p.AppPathNameMatchCondition || ''),
            throttleKbps: Math.round((Number(p.ThrottleRateActionBitsPerSecond) || 0) / 1000),
            isOwned: true,
          })),
      };
    } catch (err: any) {
      return { success: true, supported: false, policies: [] };
    }
  });

  ipcMain.handle('network:remove-all-vanguard-qos', async () => {
    try {
      await ensureQosOwnershipInitialized();
      if (ownedQosPolicies.size === 0) {
        return { success: true, removed: 0, message: 'Aucune politique QoS possédée par Vanguard à supprimer.' };
      }
      const targets = Array.from(ownedQosPolicies);
      const namesList = targets.map(t => `'${t}'`).join(',');
      const script = `
        $targets = @(${namesList})
        $removed = @()
        foreach ($t in $targets) {
          $existing = Get-NetQosPolicy -Name $t -ErrorAction SilentlyContinue
          if ($existing) {
            Remove-NetQosPolicy -Name $t -Confirm:$false -ErrorAction SilentlyContinue
            $removed += $t
          }
        }
        [PSCustomObject]@{ ok=$true; count=$removed.Count; names=$removed } | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 10000 });
      const count = res?.data?.count ?? 0;
      ownedQosPolicies.clear();
      saveQosRegistry();
      logger.info(`[QoS] ${count} politique(s) possédée(s) par Vanguard supprimée(s). Politiques préexistantes sanctuarisées.`);
      return { success: true, removed: count };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

}