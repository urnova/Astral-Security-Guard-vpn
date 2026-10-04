import { BrowserWindow, ipcMain } from 'electron';
import http from 'http';
import https from 'https';
import { runPowerShell } from './psHelper';
import { logger } from './logger';

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
}

export interface ThirdPartyVpnStatus {
  thirdPartyActive: boolean;
  vpnName?: string;
  adapterName?: string;
  details?: string;
}

// Aucun faux serveur ou faux relais exposé (Phase 2 - Élimination des simulations)
export const CURATED_INTERNATIONAL_SERVERS: VpnServerItem[] = [];

let cachedServers: VpnServerItem[] = [];
let isConnected = false;
let currentServerId: string | null = null;
let killSwitchActive = false;
let connectStartTime = 0;

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
export async function detectThirdPartyVpn(): Promise<ThirdPartyVpnStatus> {
  try {
    const script = `
      $activeVpnAdapter = $null
      $vpnName = $null
      $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
      
      foreach ($a in $adapters) {
        $desc = ($a.InterfaceDescription + ' ' + $a.Name).ToLower()
        if ($desc -match 'nordlynx|wireguard|tap-windows|openvpn|proton|surfshark|mullvad|tailscale|cloudflare|warp') {
          $ips = Get-NetIPAddress -InterfaceAlias $a.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254*' }
          if ($ips) {
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

export function setupVpnIPC(win: BrowserWindow) {
  // Purge any stale firewall rules on startup
  cleanupAstralFirewallRules();

  // ── Coexistence Status Check (Vérification réelle) ──────────────────────────
  ipcMain.handle('vpn:get-coexistence-status', async () => {
    return await detectThirdPartyVpn();
  });

  // ── Fetch Servers (Aucun faux serveur exposé) ─────────────────────────────
  ipcMain.handle('vpn:fetch-servers', async () => {
    logger.info('[VPN] Récupération serveurs : fonctionnalité en cours de développement (aucun faux serveur exposé).');
    return {
      success: true,
      servers: [],
      message: 'Fonctionnalité en cours de développement (Phase 13).',
    };
  });

  // ── Connect VPN (Désactivé jusqu\'à la Phase 13) ────────────────────────────
  ipcMain.handle('vpn:connect', async () => {
    logger.info('[VPN] Tentative de connexion rejetée : fonctionnalité en cours de développement.');
    return {
      success: false,
      status: 'under-development',
      message: 'Fonctionnalité en cours de développement — L\'intégration OpenVPN/Wintun est planifiée en Phase 13.',
    };
  });

  // ── Disconnect VPN ────────────────────────────────────────────────────────
  ipcMain.handle('vpn:disconnect', async () => {
    logger.info('[VPN] Déconnexion VPN Astral...');
    await cleanupAstralFirewallRules();
    isConnected = false;
    currentServerId = null;
    win.webContents.send('vpn-event', { type: 'disconnected' });
    return { success: true, status: 'disconnected' };
  });

  // ── Kill Switch (Désactivé jusqu\'à la Phase 13) ────────────────────────────
  ipcMain.handle('vpn:get-killswitch', () => ({
    success: true,
    enabled: false,
    killSwitch: false,
    message: 'Fonctionnalité en cours de développement (Phase 13).',
  }));

  ipcMain.handle('vpn:set-killswitch', async () => {
    logger.info('[VPN] Kill Switch désactivé : en cours de développement (Phase 13).');
    await cleanupAstralFirewallRules();
    return {
      success: false,
      enabled: false,
      killSwitch: false,
      message: 'Kill Switch indisponible — fonctionnalité en cours de développement (Phase 13).',
    };
  });
}

function fetchVpnGateCsv(): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = 'http://www.vpngate.net/api/iphone/';
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('VPN Gate API timeout (8s)'));
    });

    req.on('error', (err) => reject(err));
  });
}
