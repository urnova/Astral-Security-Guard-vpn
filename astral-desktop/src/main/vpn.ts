import { BrowserWindow, ipcMain } from 'electron';
import http from 'http';
import https from 'https';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { communityVpnEngine, CommunityServer, VpnSessionStatus } from './communityVpnEngine';

export interface VpnServerItem {
  id: string;
  country: string;
  countryCode: string;
  location: string;
  ip: string;
  ping: number;
  speedMbps: number;
  sessions: number;
  configBase64?: string;
  qualityScore: number;
  badges?: string[];
  disclaimer?: string;
}

export interface ThirdPartyVpnStatus {
  thirdPartyActive: boolean;
  vpnName?: string;
  adapterName?: string;
  details?: string;
}

// Aucun faux serveur ou faux relais codé en dur (Phase 2 & Phase 13)
export const CURATED_INTERNATIONAL_SERVERS: VpnServerItem[] = [];

/**
 * Clean up any legacy or rogue firewall rules from prior sessions.
 * Never leaves Windows firewall blocking outbound traffic.
 */
export async function cleanupAstralFirewallRules(): Promise<void> {
  try {
    const script = `
      netsh advfirewall firewall delete rule name="AstralKillSwitchBlockOut" 2>$null | Out-Null
      netsh advfirewall firewall delete rule name="AstralKillSwitchAllowDNS" 2>$null | Out-Null
      netsh advfirewall firewall delete rule name="AstralKillSwitchAllowVPN" 2>$null | Out-Null
      netsh advfirewall firewall delete rule name="AstralKillSwitch*" 2>$null | Out-Null
    `;
    await runPowerShell(script, { timeout: 4000 });
  } catch (err: any) {
    logger.warn('[VPN Firewall] Erreur silencieuse de nettoyage pare-feu:', err.message);
  }
}

/**
 * Proactively inspect system processes and network interfaces to detect
 * any truly active third-party VPN tunnel with an assigned IPv4 address.
 * NOTE: Background services (like nordvpn-service) are ignored unless their adapter actually routes traffic.
 */
/**
 * Proactively inspect network interfaces and routing table to detect
 * any TRULY ACTIVE third-party VPN tunnel routing Internet traffic.
 * NOTE: Background services (like nordvpn-service / Meshnet or Tailscale) with peer-to-peer 100.x.x.x IPs
 * are IGNORED unless their adapter actually routes Internet traffic (0.0.0.0/0 or 0.0.0.0/1).
 */
export async function detectThirdPartyVpn(): Promise<ThirdPartyVpnStatus> {
  try {
    const script = `
      $activeVpnAdapter = $null
      $vpnName = $null
      
      # Récupérer les adaptateurs UP associés aux logiciels VPN connus
      $vpnAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { 
        $_.Status -eq 'Up' -and ($_.InterfaceDescription + ' ' + $_.Name) -match 'nordlynx|wireguard|tap-windows|openvpn|proton|surfshark|mullvad|tailscale|cloudflare|warp'
      }

      if ($vpnAdapters) {
        # Vérifier si l'un de ces adaptateurs possède une route par défaut active (0.0.0.0/0 ou 0.0.0.0/1)
        # Ceci évite les faux positifs lorsque Meshnet ou Tailscale est simplement en veille avec une IP 100.x.x.x
        $defaultRoutes = Get-NetRoute -ErrorAction SilentlyContinue | Where-Object { 
          $_.DestinationPrefix -match '^(0\\.0\\.0\\.0/(0|1)|128\\.0\\.0\\.0/1)' 
        }

        foreach ($a in $vpnAdapters) {
          $isDefaultGateway = $false
          foreach ($r in $defaultRoutes) {
            if ($r.InterfaceAlias -eq $a.Name -or $r.InterfaceIndex -eq $a.InterfaceIndex) {
              $isDefaultGateway = $true
              break
            }
          }

          if ($isDefaultGateway) {
            $desc = ($a.InterfaceDescription + ' ' + $a.Name).ToLower()
            $activeVpnAdapter = $a.Name
            if ($desc -match 'nord') { $vpnName = 'NordVPN' }
            elseif ($desc -match 'wireguard') { $vpnName = 'WireGuard' }
            elseif ($desc -match 'proton') { $vpnName = 'ProtonVPN' }
            elseif ($desc -match 'express') { $vpnName = 'ExpressVPN' }
            elseif ($desc -match 'surfshark') { $vpnName = 'Surfshark' }
            elseif ($desc -match 'mullvad') { $vpnName = 'Mullvad' }
            elseif ($desc -match 'tailscale') { $vpnName = 'Tailscale' }
            elseif ($desc -match 'cloudflare|warp') { $vpnName = 'Cloudflare WARP' }
            else { $vpnName = 'VPN Tiers Actif' }
            break
          }
        }
      }

      [PSCustomObject]@{
        active = ($activeVpnAdapter -ne $null)
        name = $vpnName
        adapter = $activeVpnAdapter
      } | ConvertTo-Json -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 3500 });
    if (res.success && res.data && res.data.active) {
      const { name, adapter } = res.data;
      return {
        thirdPartyActive: true,
        vpnName: name || 'VPN Tiers Actif',
        adapterName: adapter || undefined,
        details: `Adaptateur actif: ${adapter || 'Inconnu'}`,
      };
    }
  } catch (err: any) {
    logger.warn('[VPN Coexistence] Erreur lors de la détection VPN tiers:', err.message);
  }

  return { thirdPartyActive: false };
}

let activeVpnConnected = false;
let activeVpnNodeName = '';
let activeVpnIp = '';
let activeVpnVirtualIp = '';
let trayUpdateCallback: ((opts: { vpnConnected: boolean; vpnNodeName?: string }) => void) | null = null;
let autoFailoverConfig = {
  enabled: false,
  preference: 'latency' as 'latency' | 'proximity' | 'country',
  targetCountry: 'FR',
  lastSwitchTimestamp: 0,
};

export function isVpnConnected(): boolean {
  return activeVpnConnected;
}

export function getActiveVpnNodeName(): string {
  return activeVpnNodeName;
}

export function setTrayUpdateCallback(cb: (opts: { vpnConnected: boolean; vpnNodeName?: string }) => void) {
  trayUpdateCallback = cb;
}

export async function performVpnConnect(serverId: string, win?: BrowserWindow): Promise<any> {
  const coexistence = await detectThirdPartyVpn();
  if (coexistence.thirdPartyActive) {
    logger.warn(`[VPN] Connexion rejetée : ${coexistence.vpnName} est déjà actif sur la machine`);
    return {
      success: false,
      status: 'conflict',
      message: `Conflit réseau : ${coexistence.vpnName || 'Un VPN tiers'} est actuellement connecté (${coexistence.adapterName || 'tunnel actif'}). Déconnectez-le pour éviter tout conflit de routage IP.`,
    };
  }

  const serverName = serverId || 'Paris · Core Alpha #1';
  logger.info(`[VPN] Connexion au relais sécurisé [${serverName}]...`);

  const hasOpenVpn = Boolean(communityVpnEngine.findOpenVpnBinary());
  if (!hasOpenVpn) {
    logger.warn('[VPN] Tentative de connexion rejetée : binaire OpenVPN introuvable');
    return {
      success: false,
      status: 'missing_driver',
      message: 'Le moteur OpenVPN officiel est requis pour établir un tunnel chiffré réel et délocaliser votre adresse IP. Veuillez installer OpenVPN ou Wintun sur votre machine.',
    };
  }

  try {
    const res = await communityVpnEngine.connect(serverId, (st) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('vpn-event', { type: 'state-change', status: st });
      }
    });

    if (res.success) {
      activeVpnConnected = true;
      activeVpnNodeName = serverName;
      const st = communityVpnEngine.getStatus();
      activeVpnIp = st.publicIp || serverId;
      activeVpnVirtualIp = st.assignedIp || '';

      if (trayUpdateCallback) {
        trayUpdateCallback({ vpnConnected: true, vpnNodeName: serverName });
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send('vpn-event', { type: 'connected', serverName });
        win.webContents.send('vpn:state-changed', { connected: true, serverName, publicIp: activeVpnIp });
      }
      return res;
    } else {
      activeVpnConnected = false;
      activeVpnNodeName = '';
      return {
        success: false,
        status: 'error',
        message: res.message || 'Impossible d\'établir la liaison avec le relais.',
      };
    }
  } catch (err: any) {
    logger.error('[VPN] Exception connect openvpn:', err.message);
    activeVpnConnected = false;
    activeVpnNodeName = '';
    return {
      success: false,
      status: 'error',
      message: err.message || 'Erreur lors de la tentative de connexion au relais.',
    };
  }
}

export async function performVpnDisconnect(win?: BrowserWindow): Promise<any> {
  logger.info('[VPN] Déconnexion VPN Astral...');
  try {
    await communityVpnEngine.disconnect();
  } catch {}
  await cleanupAstralFirewallRules();

  activeVpnConnected = false;
  activeVpnNodeName = '';
  activeVpnIp = '';
  activeVpnVirtualIp = '';

  if (trayUpdateCallback) {
    trayUpdateCallback({ vpnConnected: false, vpnNodeName: '' });
  }

  if (win && !win.isDestroyed()) {
    win.webContents.send('vpn-event', { type: 'disconnected' });
    win.webContents.send('vpn:state-changed', { connected: false, serverName: '' });
  }

  return { success: true, status: 'disconnected' };
}

export function setupVpnIPC(win: BrowserWindow, onTrayUpdate?: (opts: { vpnConnected: boolean; vpnNodeName?: string }) => void) {
  if (onTrayUpdate) {
    trayUpdateCallback = onTrayUpdate;
  }

  // Purge any stale firewall rules on startup
  cleanupAstralFirewallRules();

  // ── Coexistence Status Check (Vérification réelle) ──────────────────────────
  ipcMain.handle('vpn:get-coexistence-status', async () => {
    return await detectThirdPartyVpn();
  });

  ipcMain.handle('vpn:detect-all', async () => {
    const status = await detectThirdPartyVpn();
    if (status.thirdPartyActive && status.vpnName) {
      return [{ id: status.vpnName.toLowerCase().replace(/[^a-z0-9]/g, ''), name: status.vpnName, detected: true, connected: true, serverName: status.adapterName || 'Tunnel actif' }];
    }
    return [];
  });

  // ── Detect ALL installed VPN software (even when disconnected) ─────────────
  ipcMain.handle('vpn:detect-installed', async () => {
    const results: { id: string; name: string; detected: boolean; connected: boolean; serverName: string }[] = [];
    try {
      // First, check active tunnel
      const active = await detectThirdPartyVpn();
      if (active.thirdPartyActive && active.vpnName) {
        results.push({
          id: active.vpnName.toLowerCase().replace(/[^a-z0-9]/g, ''),
          name: active.vpnName,
          detected: true,
          connected: true,
          serverName: active.adapterName || 'Tunnel actif',
        });
      }

      // Then scan for installed but not connected VPN software
      const script = `
        $vpns = @()
        $paths = @(
          @{ id = 'nordvpn'; name = 'NordVPN'; paths = @('C:\\Program Files\\NordVPN', 'C:\\Users\\Public\\AppData\\Local\\NordVPN') },
          @{ id = 'protonvpn'; name = 'ProtonVPN'; paths = @('C:\\Program Files (x86)\\Proton VPN', 'C:\\Program Files\\Proton AG\\Proton VPN') },
          @{ id = 'expressvpn'; name = 'ExpressVPN'; paths = @('C:\\Program Files\\ExpressVPN', 'C:\\Program Files (x86)\\ExpressVPN') },
          @{ id = 'surfshark'; name = 'Surfshark'; paths = @('C:\\Program Files\\Surfshark') },
          @{ id = 'mullvad'; name = 'Mullvad VPN'; paths = @('C:\\Program Files\\Mullvad VPN') },
          @{ id = 'cyberghost'; name = 'CyberGhost'; paths = @('C:\\Program Files\\CyberGhost VPN') },
          @{ id = 'pia'; name = 'PIA'; paths = @('C:\\Program Files\\Private Internet Access') }
        )
        foreach ($v in $paths) {
          $found = $false
          foreach ($p in $v.paths) {
            if (Test-Path $p) { $found = $true; break }
          }
          if ($found) {
            $vpns += [PSCustomObject]@{ id = $v.id; name = $v.name }
          }
        }
        $vpns | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell(script, { asJson: true, timeout: 5000 });
      let installed: any[] = [];
      if (res.success && res.data) {
        installed = Array.isArray(res.data) ? res.data : [res.data];
      }
      for (const inst of installed) {
        const alreadyListed = results.some(r => r.id === inst.id);
        if (!alreadyListed) {
          results.push({ id: inst.id, name: inst.name, detected: true, connected: false, serverName: 'Installé — déconnecté' });
        }
      }
    } catch (err: any) {
      logger.warn('[VPN] Erreur detect-installed :', err.message);
    }
    return results;
  });

  // ── Fetch Servers (Catalogue dynamique VPN Gate avec cache local) ─────────
  ipcMain.handle('vpn:fetch-servers', async () => {
    try {
      const servers = await communityVpnEngine.fetchServerCatalog();
      const mapped: VpnServerItem[] = servers.map((s) => ({
        id: s.id,
        country: s.country,
        countryCode: s.countryCode,
        location: `${s.country} (${s.ip})`,
        ip: s.ip,
        ping: s.pingMs,
        speedMbps: s.speedMbps,
        sessions: s.sessions,
        configBase64: s.configBase64,
        qualityScore: s.qualityScore,
        badges: s.badges,
        disclaimer: s.disclaimer,
      }));

      return {
        success: true,
        servers: mapped,
        message: servers.length > 0 ? `${servers.length} relais communautaires disponibles.` : 'Relais internationaux prêts.',
      };
    } catch (err: any) {
      return {
        success: true,
        servers: [],
        message: 'Relais internationaux prêts.',
      };
    }
  });

  // ── Connect VPN ───────────────────────────────────────────────────────────
  ipcMain.handle('vpn:connect', async (_, serverId: string) => {
    return await performVpnConnect(serverId, win);
  });

  // ── Disconnect VPN ────────────────────────────────────────────────────────
  ipcMain.handle('vpn:disconnect', async () => {
    return await performVpnDisconnect(win);
  });

  // ── Auto-failover Preferences (Bêta) ───────────────────────────────────────
  ipcMain.handle('vpn:get-auto-failover', () => {
    return { success: true, config: autoFailoverConfig };
  });

  ipcMain.handle('vpn:set-auto-failover', (_, cfg: Partial<typeof autoFailoverConfig>) => {
    autoFailoverConfig = { ...autoFailoverConfig, ...cfg };
    logger.info('[VPN] Configuration Basculement automatique mise à jour:', autoFailoverConfig);
    return { success: true, config: autoFailoverConfig };
  });

  let currentVpnProtocol = 'OpenVPN';

  ipcMain.handle('vpn:get-protocol', () => {
    return { success: true, protocol: currentVpnProtocol };
  });

  ipcMain.handle('vpn:set-protocol', (_, proto: string) => {
    if (proto) currentVpnProtocol = proto;
    logger.info(`[VPN] Protocole actif configuré : ${currentVpnProtocol}`);
    return { success: true, protocol: currentVpnProtocol };
  });

  // ── VPN Session Status ────────────────────────────────────────────────────
  ipcMain.handle('vpn:get-status', () => {
    return { success: true, status: communityVpnEngine.getStatus(), protocol: currentVpnProtocol };
  });

  // ── Kill Switch (Actif uniquement avec pare-feu contrôlé) ─────────────────
  ipcMain.handle('vpn:get-killswitch', () => {
    const st = communityVpnEngine.getStatus();
    return {
      success: true,
      enabled: st.killSwitchEnabled,
      killSwitch: st.killSwitchEnabled,
      message: st.killSwitchEnabled ? 'Kill Switch actif.' : 'Kill Switch désactivé.',
    };
  });

  ipcMain.handle('vpn:set-killswitch', async (_, enabled: boolean) => {
    logger.info(`[VPN] Bascule Kill Switch : ${enabled}`);
    const active = await communityVpnEngine.setKillSwitch(Boolean(enabled));
    return {
      success: true,
      enabled: active,
      killSwitch: active,
    };
  });
}
