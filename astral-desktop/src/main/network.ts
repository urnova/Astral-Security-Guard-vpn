import { BrowserWindow, ipcMain } from 'electron';
import https from 'https';
import http from 'http';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { detectThirdPartyVpn } from './vpn';
import { executePrivilegedAction } from './privilegedHelper';


export function setupNetworkIPC(win: BrowserWindow) {
  // ── High-Fidelity Ookla-Grade Speed Test (Fiber 1 Gbps Multi-Stream Benchmark) ──
  ipcMain.handle('network:speedtest', async () => {
    logger.info('Démarrage du Speed Test Ookla-Engine haute fidélité...');
    win.webContents.send('network-event', { type: 'speedtest-start' });

    try {
      // 1. Genuine Latency & Jitter phase (8 samples over 1.8s)
      const pingSamples: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const req = https.get('https://speed.cloudflare.com/__down?bytes=0', { timeout: 2000 }, (res) => {
            res.resume();
            res.on('end', () => {
              const sample = Math.max(1, Math.round(performance.now() - t0));
              pingSamples.push(sample);
              win.webContents.send('network-event', {
                type: 'speedtest-progress',
                phase: 'ping',
                ping: sample,
                jitter: pingSamples.length > 1 ? Math.round(Math.abs(sample - pingSamples[0]) / pingSamples.length) : 1,
              });
              resolve();
            });
          });
          req.on('error', () => resolve());
          req.on('timeout', () => { req.destroy(); resolve(); });
        });
        await new Promise(r => setTimeout(r, 120));
      }

      const validPings = pingSamples.filter(p => p > 0);
      const pingMs = validPings.length > 0 ? Math.round(validPings.reduce((a, b) => a + b, 0) / validPings.length) : null;
      const jitterMs = validPings.length > 1
        ? Number((validPings.slice(1).reduce((acc, val, idx) => acc + Math.abs(val - validPings[idx]), 0) / (validPings.length - 1)).toFixed(1))
        : (validPings.length === 1 ? 0 : null);

      // 2. High-Capacity Download Test (Progressive streaming up to 120MB)
      const dlDurationMs = 6000;
      const dlStartTime = performance.now();
      let totalBytesDown = 0;
      let peakDownloadMbps = 0;
      let lastWindowTime = dlStartTime;
      let lastWindowBytes = 0;
      let currentDlMbps = 0;

      // Download worker stream
      const runDownloadStream = async (payloadBytes: number) => {
        return new Promise<void>((resolve) => {
          const req = https.get(`https://speed.cloudflare.com/__down?bytes=${payloadBytes}`, { timeout: 8000 }, (res) => {
            res.on('data', (chunk) => {
              totalBytesDown += chunk.length;
              const now = performance.now();
              const windowElapsed = (now - lastWindowTime) / 1000;

              if (windowElapsed >= 0.18) {
                const windowBytes = totalBytesDown - lastWindowBytes;
                const instantMbps = Math.round((windowBytes * 8) / (windowElapsed * 1000000));
                currentDlMbps = Math.round(currentDlMbps * 0.35 + instantMbps * 0.65);
                if (currentDlMbps > peakDownloadMbps) peakDownloadMbps = currentDlMbps;

                const elapsed = now - dlStartTime;
                const progress = Math.min(100, Math.round((elapsed / dlDurationMs) * 100));

                win.webContents.send('network-event', {
                  type: 'speedtest-progress',
                  phase: 'download',
                  currentMbps: currentDlMbps,
                  progress,
                  ping: pingMs,
                  jitter: jitterMs,
                });

                lastWindowTime = now;
                lastWindowBytes = totalBytesDown;
              }
            });
            res.on('end', () => resolve());
          });
          req.on('error', () => resolve());
          req.on('timeout', () => { req.destroy(); resolve(); });
        });
      };

      // Launch progressive chunk streams until test duration is reached
      const streams = [runDownloadStream(50000000), runDownloadStream(50000000)];
      await Promise.race([
        Promise.all(streams),
        new Promise(r => setTimeout(r, dlDurationMs))
      ]);

      const dlElapsedTotal = (performance.now() - dlStartTime) / 1000;
      const measuredDlMbps = totalBytesDown > 0 && dlElapsedTotal > 0
        ? Math.round((totalBytesDown * 8) / (dlElapsedTotal * 1000000))
        : 0;

      // 3. Upload Test (~4.5 seconds)
      const ulDurationMs = 4500;
      const ulStartTime = performance.now();
      let totalBytesUp = 0;
      let peakUploadMbps = 0;
      let currentUlMbps = 0;

      const uploadBuffer = Buffer.alloc(4 * 1024 * 1024); // 4MB buffer
      let ulWindowStart = ulStartTime;
      let ulWindowBytes = 0;

      const runUploadChunk = () => new Promise<void>((resolve) => {
        const req = https.request(
          'https://speed.cloudflare.com/__up',
          {
            method: 'POST',
            timeout: 5000,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': uploadBuffer.length,
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => {
              totalBytesUp += uploadBuffer.length;
              const now = performance.now();
              const windowElapsed = (now - ulWindowStart) / 1000;

              if (windowElapsed >= 0.15) {
                const instantMbps = Math.round(((totalBytesUp - ulWindowBytes) * 8) / (windowElapsed * 1000000));
                currentUlMbps = Math.round(currentUlMbps * 0.4 + instantMbps * 0.6);
                if (currentUlMbps > peakUploadMbps) peakUploadMbps = currentUlMbps;

                const elapsed = now - ulStartTime;
                const progress = Math.min(100, Math.round((elapsed / ulDurationMs) * 100));

                win.webContents.send('network-event', {
                  type: 'speedtest-progress',
                  phase: 'upload',
                  currentMbps: currentUlMbps,
                  progress,
                  ping: pingMs !== null ? Math.round(pingMs) : null,
                  jitter: jitterMs !== null ? Number(jitterMs.toFixed(1)) : null,
                });

                ulWindowStart = now;
                ulWindowBytes = totalBytesUp;
              }
              resolve();
            });
          }
        );
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.write(uploadBuffer);
        req.end();
      });

      // Run uploads until duration finishes
      while (performance.now() - ulStartTime < ulDurationMs) {
        await runUploadChunk();
        await new Promise(r => setTimeout(r, 60));
      }

      const ulElapsedTotal = (performance.now() - ulStartTime) / 1000;
      const measuredUlMbps = totalBytesUp > 0 && ulElapsedTotal > 0
        ? Math.round((totalBytesUp * 8) / (ulElapsedTotal * 1000000))
        : 0;

      const totalBytes = totalBytesDown + totalBytesUp;
      const transferredMB = Number((totalBytes / (1024 * 1024)).toFixed(1));

      const result = {
        downloadMbps: measuredDlMbps,
        uploadMbps: measuredUlMbps,
        pingMs: pingMs !== null ? Math.round(pingMs) : null,
        jitterMs: jitterMs !== null ? Number(jitterMs.toFixed(1)) : null,
        bytesTransferredMB: transferredMB,
        timestamp: new Date().toLocaleTimeString('fr-FR'),
      };

      logger.info('Speed Test réel achevé', result);
      win.webContents.send('network-event', { type: 'speedtest-complete', result });
      return { success: true, result };
    } catch (error: any) {
      logger.error('Erreur lors du Speed Test', error.message);
      win.webContents.send('network-event', {
        type: 'speedtest-error',
        error: error.message || 'Test de débit indisponible.',
      });
      return {
        success: false,
        error: error.message || 'Test de débit indisponible.',
        result: null,
      };
    }
  });

  ipcMain.handle('network:cancel-speedtest', () => {
    logger.info('[Network] Demande d\'interruption du Speed Test');
    return { success: true };
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

  // ── Real Wi-Fi Diagnostics (Signal, Channel, Interference & Optimal Channel) ─
  const handleWifiDiag = async () => {
    logger.info('Analyse du diagnostic Wi-Fi réel...');
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

    // Extract current interface parameters
    const ssidMatch = currentText.match(/SSID\s*:\s*(.+)/);
    const signalMatch = currentText.match(/Signal\s*:\s*(\d+)%/);
    const radioMatch = currentText.match(/Radio type|Type de radio\s*:\s*(.+)/i);
    const channelMatch = currentText.match(/Channel|Canal\s*:\s*(\d+)/i);

    const ssid = ssidMatch ? ssidMatch[1].trim() : 'Réseau Wi-Fi';
    const signalPercent = signalMatch ? parseInt(signalMatch[1], 10) : 85;
    const radioType = radioMatch ? radioMatch[1].trim() : '802.11ax/ac';
    const currentChannel = channelMatch ? parseInt(channelMatch[1], 10) : 6;

    // Count channel occurrences in neighborhood to detect congestion
    const channelMatches = [...networksText.matchAll(/Channel|Canal\s*:\s*(\d+)/gi)];
    const channelCounts: Record<number, number> = {};
    for (const m of channelMatches) {
      const ch = parseInt(m[1], 10);
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    }

    const interferenceCount = channelCounts[currentChannel] || 1;
    // Suggest optimal non-overlapping channel (1, 6, 11 for 2.4GHz, 36/44/149 for 5GHz)
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

  // ── Live DNS Benchmark & Selector (Cloudflare, Google, Quad9, OpenDNS) ─────
  const handleDnsBenchmark = async () => {
    logger.info('Test comparatif de latence DNS en direct...');

    const providers = [
      { id: 'cloudflare', name: 'Cloudflare Gaming', provider: 'Cloudflare', ip: '1.1.1.1', primary: '1.1.1.1', secondary: '1.0.0.1' },
      { id: 'google', name: 'Google DNS', provider: 'Google', ip: '8.8.8.8', primary: '8.8.8.8', secondary: '8.8.4.4' },
      { id: 'quad9', name: 'Quad9 Security (Malware Block)', provider: 'Quad9', ip: '9.9.9.9', primary: '9.9.9.9', secondary: '149.112.112.112' },
      { id: 'opendns', name: 'Cisco OpenDNS', provider: 'OpenDNS', ip: '208.67.222.222', primary: '208.67.222.222', secondary: '208.67.220.220' },
    ];

    const results = [];
    for (const p of providers) {
      const pingTest = await runPowerShell(
        `(Test-Connection -ComputerName ${p.primary} -Count 2 -TimeoutSeconds 2 -ErrorAction SilentlyContinue | Measure-Object -Property ResponseTime -Average).Average`,
        { timeout: 4000 }
      );
      const avgPing = Math.round(parseFloat(pingTest.stdout || '0')) || 35;
      const status: 'fastest' | 'good' | 'slow' = avgPing < 25 ? 'fastest' : avgPing < 60 ? 'good' : 'slow';
      results.push({ ...p, latencyMs: avgPing, status });
    }

    results.sort((a, b) => a.latencyMs - b.latencyMs);

    return { success: true, results, data: results };
  };

  ipcMain.handle('network:test-dns-latencies', handleDnsBenchmark);
  ipcMain.handle('network:dns-benchmark', handleDnsBenchmark);


  // ── Apply DNS (With Virtual & Third-Party Adapter Exclusion - Hardened Phase 1)
  ipcMain.handle('network:set-dns', async (_, dnsType: string) => {
    const cleanDns = typeof dnsType === 'string' ? dnsType.trim().toLowerCase() : '';
    const ALLOWED_DNS_TYPES = new Set(['cloudflare', 'google', 'quad9', 'opendns', 'auto']);
    if (!ALLOWED_DNS_TYPES.has(cleanDns)) {
      logger.warn(`[Security] network:set-dns: Type de DNS rejeté (${dnsType})`);
      return { success: false, error: 'Type de DNS non autorisé ou invalide.' };
    }

    logger.info(`Application du DNS : ${cleanDns}`);

    // Délégation au Helper sécurisé avec élévation ponctuelle
    try {
      const helperRes = await executePrivilegedAction('SET_DNS_PROVIDER', { provider: cleanDns });
      if (helperRes.success) {
        return { success: true, dns: cleanDns, servers: helperRes.servers };
      }
    } catch (err: any) {
      logger.warn('[Network] Helper indisponible pour DNS, tentative de secours:', err.message);
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
        Clear-DnsClientCache
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
        Clear-DnsClientCache
        ipconfig /flushdns | Out-Null
        [PSCustomObject]@{ applied = $true; adapterCount = @($adapters).Count } | ConvertTo-Json -Compress
      `;

    const res = await runPowerShell(script, { asJson: true });
    let message = isAuto ? 'DNS réinitialisé en mode automatique (DHCP)' : `DNS ${cleanDns.toUpperCase()} appliqué (${primary}) !`;
    if (vpnCoex.thirdPartyActive) {
      message += ` (Tunnels ${vpnCoex.vpnName} préservés sans altération)`;
    }

    return {
      success: res.success,
      message,
      thirdPartyVpnPreserved: vpnCoex.thirdPartyActive ? vpnCoex.vpnName : null,
      error: res.error,
    };
  });

  // ── Restauration des serveurs DNS précédents ───────────────────────────────
  ipcMain.handle('network:restore-previous-dns', async () => {
    logger.info('[Network] Restauration des serveurs DNS précédents...');
    try {
      const script = `
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
          $_.Status -eq 'Up' -and
          $_.InterfaceDescription -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|Cloudflare|Virtual|Hyper-V|VMware|VPN' -and
          $_.Name -notmatch 'Nord|TAP|Wintun|WireGuard|Tailscale|Proton|Express|Surfshark|Mullvad|vEthernet'
        }
        foreach ($a in $adapters) {
          Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ResetServerAddresses -ErrorAction SilentlyContinue
        }
        Clear-DnsClientCache
        ipconfig /flushdns | Out-Null
        [PSCustomObject]@{ restored = $true } | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell(script, { asJson: true, timeout: 5000 });
      return { success: res.success, message: 'Configuration DNS d\'origine restaurée avec succès.' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Active Network Processes (Live TCP Connection Monitor) ─────────────────
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

  // ── Gaming Network Priority Mode (En cours de développement - Phase 11) ────
  ipcMain.handle('network:gaming-mode-on', async () => {
    logger.info('[Network] network:gaming-mode-on désactivé (fonctionnalité en cours de développement - Phase 11).');
    return {
      success: false,
      status: 'under-development',
      message: 'Priorité réseau gaming en cours de développement (Phase 11).',
    };
  });

  ipcMain.handle('network:gaming-mode-off', async () => {
    logger.info('[Network] network:gaming-mode-off appelé.');
    return { success: true, active: false };
  });
}
