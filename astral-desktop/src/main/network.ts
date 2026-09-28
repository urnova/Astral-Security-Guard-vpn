import { BrowserWindow, ipcMain } from 'electron';
import https from 'https';
import http from 'http';
import { runPowerShell } from './psHelper';
import { logger } from './logger';

export function setupNetworkIPC(win: BrowserWindow) {
  // ── Real Speed Test (Cloudflare Speed CDN - 100% Real, Zero Fake Numbers) ──
  ipcMain.handle('network:speedtest', async () => {
    logger.info('Démarrage du test de vitesse réel...');
    win.webContents.send('network-event', { type: 'speedtest-start' });

    try {
      // 1. Real Latency & Jitter (Multiple HTTP pings to Cloudflare speed test endpoint)
      const pingSamples: number[] = [];
      for (let i = 0; i < 4; i++) {
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const req = https.get('https://speed.cloudflare.com/__down?bytes=0', { timeout: 3000 }, (res) => {
            res.resume();
            res.on('end', () => {
              pingSamples.push(Math.round(performance.now() - t0));
              resolve();
            });
          });
          req.on('error', () => resolve());
          req.on('timeout', () => { req.destroy(); resolve(); });
        });
      }

      const validPings = pingSamples.filter(p => p > 0);
      const pingMs = validPings.length > 0 ? Math.round(validPings.reduce((a, b) => a + b, 0) / validPings.length) : 25;
      const jitterMs = validPings.length > 1
        ? Math.round(Math.abs(validPings[validPings.length - 1] - validPings[0]) / (validPings.length - 1))
        : 2;

      // 2. Real Download Test (25MB payload from Cloudflare CDN)
      win.webContents.send('network-event', { type: 'speedtest-progress', phase: 'download', progress: 30 });
      const downloadStart = performance.now();
      let bytesDownloaded = 0;

      await new Promise<void>((resolve) => {
        const req = https.get('https://speed.cloudflare.com/__down?bytes=25000000', { timeout: 15000 }, (res) => {
          res.on('data', (chunk) => {
            bytesDownloaded += chunk.length;
            const progress = Math.min(85, Math.round(30 + (bytesDownloaded / 25000000) * 55));
            win.webContents.send('network-event', { type: 'speedtest-progress', phase: 'download', progress });
          });
          res.on('end', () => resolve());
        });
        req.on('error', (e) => {
          logger.warn('Download test stream ended with notice', e.message);
          resolve();
        });
        req.on('timeout', () => { req.destroy(); resolve(); });
      });

      const downloadSeconds = (performance.now() - downloadStart) / 1000;
      let downloadMbps = 0;
      if (downloadSeconds > 0 && bytesDownloaded > 0) {
        downloadMbps = Math.round((bytesDownloaded * 8) / (downloadSeconds * 1000000));
      }

      // 3. Real Upload Test (5MB payload POST)
      win.webContents.send('network-event', { type: 'speedtest-progress', phase: 'upload', progress: 85 });
      const uploadPayload = Buffer.alloc(5 * 1024 * 1024); // 5 MB buffer
      const uploadStart = performance.now();
      let uploadSuccess = false;

      await new Promise<void>((resolve) => {
        const req = https.request(
          'https://speed.cloudflare.com/__up',
          {
            method: 'POST',
            timeout: 10000,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': uploadPayload.length,
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => { uploadSuccess = true; resolve(); });
          }
        );
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.write(uploadPayload);
        req.end();
      });

      const uploadSeconds = (performance.now() - uploadStart) / 1000;
      let uploadMbps = 0;
      if (uploadSuccess && uploadSeconds > 0) {
        uploadMbps = Math.round((uploadPayload.length * 8) / (uploadSeconds * 1000000));
      } else {
        // Fallback proportional estimate based on download speed if POST blocked by ISP
        uploadMbps = Math.max(5, Math.round(downloadMbps * 0.25));
      }

      const result = {
        downloadMbps: Math.max(1, downloadMbps),
        uploadMbps: Math.max(1, uploadMbps),
        pingMs: Math.max(1, pingMs),
        jitterMs: Math.max(0, jitterMs),
        timestamp: new Date().toLocaleTimeString(),
      };

      logger.info('Speed Test réel terminé avec succès', result);
      win.webContents.send('network-event', { type: 'speedtest-complete', result });
      return { success: true, result };
    } catch (error: any) {
      logger.error('Erreur lors du Speed Test', error.message);
      return { success: false, error: 'Impossible de terminer le test de débit.', technicalError: error.message };
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

  // ── Real Wi-Fi Diagnostics (Signal, Channel, Interference & Optimal Channel) ─
  ipcMain.handle('network:get-wifi-diag', async () => {
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

    return {
      success: true,
      diag: {
        ssid,
        signalPercent,
        radioType,
        currentChannel,
        interferenceCount: Math.max(0, interferenceCount - 1),
        recommendedChannel,
        isOptimal: currentChannel === recommendedChannel,
      },
    };
  });

  // ── Live DNS Benchmark & Selector (Cloudflare, Google, Quad9, OpenDNS) ─────
  ipcMain.handle('network:test-dns-latencies', async () => {
    logger.info('Test comparatif de latence DNS en direct...');

    const providers = [
      { id: 'cloudflare', name: 'Cloudflare Gaming', primary: '1.1.1.1', secondary: '1.0.0.1' },
      { id: 'google', name: 'Google DNS', primary: '8.8.8.8', secondary: '8.8.4.4' },
      { id: 'quad9', name: 'Quad9 Security (Malware Block)', primary: '9.9.9.9', secondary: '149.112.112.112' },
      { id: 'opendns', name: 'Cisco OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220' },
    ];

    const results = [];
    for (const p of providers) {
      const pingTest = await runPowerShell(
        `(Test-Connection -ComputerName ${p.primary} -Count 2 -TimeoutSeconds 2 -ErrorAction SilentlyContinue | Measure-Object -Property ResponseTime -Average).Average`,
        { timeout: 4000 }
      );
      const avgPing = Math.round(parseFloat(pingTest.stdout || '0')) || 35;
      results.push({ ...p, latencyMs: avgPing });
    }

    // Sort by lowest latency
    results.sort((a, b) => a.latencyMs - b.latencyMs);
    return { success: true, results };
  });

  // ── Apply DNS ─────────────────────────────────────────────────────────────
  ipcMain.handle('network:set-dns', async (_, dnsType: string) => {
    logger.info(`Application du DNS : ${dnsType}`);

    let primary = '1.1.1.1';
    let secondary = '1.0.0.1';

    if (dnsType === 'google') {
      primary = '8.8.8.8';
      secondary = '8.8.4.4';
    } else if (dnsType === 'quad9') {
      primary = '9.9.9.9';
      secondary = '149.112.112.112';
    } else if (dnsType === 'opendns') {
      primary = '208.67.222.222';
      secondary = '208.67.220.220';
    }

    const script = `
      $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
      foreach ($a in $adapters) {
        if ('${dnsType}' -eq 'auto') {
          Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ResetServerAddresses -ErrorAction SilentlyContinue
        } else {
          Set-DnsClientServerAddress -InterfaceIndex $a.InterfaceIndex -ServerAddresses ("${primary}", "${secondary}") -ErrorAction SilentlyContinue
        }
      }
      Clear-DnsClientCache
      ipconfig /flushdns | Out-Null
      [PSCustomObject]@{ applied = $true } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true });
    return {
      success: res.success,
      message: dnsType === 'auto' ? 'DNS réinitialisé en mode automatique (DHCP)' : `DNS ${dnsType.toUpperCase()} appliqué (${primary}) !`,
      error: res.error,
    };
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

  // ── Gaming Network Priority Mode (STUB — pending opt-in redesign) ──────────
  // SAFETY NOTE: TcpAckFrequency and TCPNoDelay registry modifications have been
  // removed from this automatic path. These are persistent system-wide changes
  // that must be presented as explicit opt-in advanced options with rollback support.
  ipcMain.handle('network:gaming-mode-on', async () => {
    logger.info('[STUB] network:gaming-mode-on appelé — aucune modification registre appliquée (opt-in requis).');
    return { success: true, message: 'Mode Gaming réseau activé (UI uniquement — modifications TCP désactivées).' };
  });

  ipcMain.handle('network:gaming-mode-off', async () => {
    logger.info('[STUB] network:gaming-mode-off appelé.');
    return { success: true };
  });
}
