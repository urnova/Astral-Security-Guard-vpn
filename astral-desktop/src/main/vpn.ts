import { BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { communityVpnEngine, CommunityServer, VpnSessionStatus } from './communityVpnEngine';
import { VpnRoutingEngine, type RouteEntry, type ThirdPartyVpnAdapter } from './vpnRouting';
import { openVpnInstaller, OFFICIAL_OPENVPN_PACKAGE } from './openvpnInstaller';

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

export type ThirdPartyVpnState = 'conflict_confirmed' | 'vpn_suspected' | 'unknown' | 'no_conflict';

export interface ThirdPartyVpnStatus {
  status: ThirdPartyVpnState;
  thirdPartyActive: boolean;
  vpnName?: string;
  adapterName?: string;
  details?: string;
  reason?: string;
}

// Aucun faux serveur ou faux relais codé en dur (Phase 2 & Phase 13)
export const CURATED_INTERNATIONAL_SERVERS: VpnServerItem[] = [];

/**
 * Inspecte les interfaces réseau et les tables de routage Windows pour qualifier
 * la présence et l'activité d'un VPN tiers selon 4 états précis :
 * - 'conflict_confirmed' : route par défaut (0.0.0.0/0 ou paire def1 0.0.0.0/1 + 128.0.0.0/1) pointant vers un tunnel tiers actif
 * - 'vpn_suspected' : adaptateur tiers présent et Up (ex: Tailscale ou Meshnet) sans interception de la route par défaut
 * - 'no_conflict' : aucun tunnel tiers détecté
 * - 'unknown' : échec de lecture ou indisponibilité du sous-système réseau
 */
export async function detectThirdPartyVpn(): Promise<ThirdPartyVpnStatus> {
  try {
    const script = `
      $vpnAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { 
        $_.Status -eq 'Up' -and ($_.InterfaceDescription + ' ' + $_.Name) -match 'nordlynx|wireguard|tap-windows|openvpn|proton|surfshark|mullvad|tailscale|cloudflare|warp|wintun'
      } | Select-Object Name, InterfaceAlias, InterfaceIndex, InterfaceDescription

      $routes = Get-NetRoute -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { 
        $_.DestinationPrefix -match '^(0\\.0\\.0\\.0/(0|1)|128\\.0\\.0\\.0/1)' 
      } | Select-Object DestinationPrefix, InterfaceAlias, InterfaceIndex, NextHop, RouteMetric

      [PSCustomObject]@{
        adapters = $vpnAdapters
        routes = $routes
      } | ConvertTo-Json -Depth 3 -Compress
    `;

    const res = await runPowerShell(script, { asJson: true, timeout: 3500 });
    if (res.success && res.data) {
      const rawAdapters = res.data.adapters ? (Array.isArray(res.data.adapters) ? res.data.adapters : [res.data.adapters]) : [];
      const rawRoutes = res.data.routes ? (Array.isArray(res.data.routes) ? res.data.routes : [res.data.routes]) : [];

      const knownAdapters: ThirdPartyVpnAdapter[] = rawAdapters.map((a: any) => {
        const desc = ((a.InterfaceDescription || '') + ' ' + (a.Name || '')).toLowerCase();
        let name = 'VPN Tiers';
        if (desc.includes('nord')) name = 'NordVPN';
        else if (desc.includes('wireguard')) name = 'WireGuard';
        else if (desc.includes('proton')) name = 'ProtonVPN';
        else if (desc.includes('express')) name = 'ExpressVPN';
        else if (desc.includes('surfshark')) name = 'Surfshark';
        else if (desc.includes('mullvad')) name = 'Mullvad';
        else if (desc.includes('tailscale')) name = 'Tailscale';
        else if (desc.includes('cloudflare') || desc.includes('warp')) name = 'Cloudflare WARP';

        return {
          name,
          alias: a.Name || a.InterfaceAlias || '',
          index: a.InterfaceIndex,
        };
      });

      const conflictRes = VpnRoutingEngine.evaluateThirdPartyConflict(rawRoutes as RouteEntry[], knownAdapters);

      return {
        status: conflictRes.state,
        thirdPartyActive: conflictRes.state === 'conflict_confirmed' || conflictRes.state === 'vpn_suspected',
        vpnName: conflictRes.vpnName || undefined,
        adapterName: conflictRes.adapter || undefined,
        details: conflictRes.adapter ? `Adaptateur détecté: ${conflictRes.adapter}` : undefined,
        reason: conflictRes.reason,
      };
    }
  } catch (err: any) {
    logger.warn('[VPN Coexistence] Erreur lors de la détection VPN tiers:', err.message);
    return {
      status: 'unknown',
      thirdPartyActive: false,
      reason: `Impossible d'interroger les interfaces réseau système : ${err.message}`,
    };
  }

  return {
    status: 'no_conflict',
    thirdPartyActive: false,
    reason: 'Aucun adaptateur VPN tiers actif détecté.',
  };
}

let activeVpnConnected = false;
let activeVpnNodeName = '';
let activeVpnIp = '';
let activeVpnVirtualIp = '';
let trayUpdateCallback: ((opts: { vpnConnected: boolean; vpnNodeName?: string }) => void) | null = null;
let notifyVpnCallback: ((title: string, body: string, opts?: any) => void) | null = null;
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
  if (coexistence.status === 'conflict_confirmed') {
    logger.warn(`[VPN] Connexion rejetée : conflit confirmé avec ${coexistence.vpnName} (${coexistence.adapterName})`);
    return {
      success: false,
      status: 'conflict',
      message: `Conflit réseau : ${coexistence.vpnName || 'Un VPN tiers'} route actuellement l'ensemble de votre trafic (${coexistence.adapterName || 'tunnel actif'}). Déconnectez-le pour éviter tout conflit d'acheminement IP.`,
    };
  }

  if (coexistence.status === 'vpn_suspected') {
    logger.info(`[VPN] VPN tiers inactif ou peer-to-peer détecté (${coexistence.vpnName || 'inconnu'}) - connexion Vanguard poursuivie.`);
  }

  const serverName = serverId || 'Relais OpenVPN';
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
      if (notifyVpnCallback) {
        notifyVpnCallback('Vanguard VPN Connecté', `Tunnel actif vers ${serverName}. Adresse IP protégée.`, { type: 'vpn_connected' });
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
  logger.info('[VPN] Déconnexion Vanguard VPN...');
  try {
    await communityVpnEngine.disconnect();
  } catch {}

  activeVpnConnected = false;
  activeVpnNodeName = '';
  activeVpnIp = '';
  activeVpnVirtualIp = '';

  if (trayUpdateCallback) {
    trayUpdateCallback({ vpnConnected: false, vpnNodeName: '' });
  }
  if (notifyVpnCallback) {
    notifyVpnCallback('Vanguard VPN Déconnecté', 'Le tunnel chiffré est désormais fermé.', { type: 'vpn_disconnected' });
  }

  if (win && !win.isDestroyed()) {
    win.webContents.send('vpn-event', { type: 'disconnected' });
    win.webContents.send('vpn:state-changed', { connected: false, serverName: '' });
  }

  return { success: true, status: 'disconnected' };
}

export function setupVpnIPC(
  win: BrowserWindow,
  onTrayUpdate?: (opts: { vpnConnected: boolean; vpnNodeName?: string }) => void,
  onNotify?: (title: string, body: string, opts?: any) => void
) {
  if (onTrayUpdate) {
    trayUpdateCallback = onTrayUpdate;
  }
  if (onNotify) {
    notifyVpnCallback = onNotify;
  }

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

  // ── Engine Status & Assisted Installation ────────────────────────────────
  ipcMain.handle('vpn:get-engine-status', () => {
    const binPath = communityVpnEngine.findOpenVpnBinary();
    return {
      installed: Boolean(binPath),
      binaryPath: binPath,
      officialDownloadUrl: 'https://openvpn.net/community-downloads/',
      instructions: 'Installez le package officiel OpenVPN Community ou le pilote Wintun sur Windows.',
    };
  });

  // ── Fetch Servers (Catalogue dynamique VPN Gate avec cache local) ─────────
  ipcMain.handle('vpn:fetch-servers', async (_, forceRefresh?: boolean) => {
    try {
      const servers = await communityVpnEngine.fetchServerCatalog(Boolean(forceRefresh));
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

      const st = communityVpnEngine.getStatus();
      return {
        success: true,
        servers: mapped,
        catalogSource: st.catalogSource,
        message: servers.length > 0 ? `${servers.length} relais communautaires disponibles.` : 'Aucun relais disponible dans le catalogue.',
      };
    } catch (err: any) {
      logger.error('[VPN] Erreur chargement catalogue VPN Gate:', err.message);
      return {
        success: false,
        servers: [],
        catalogSource: null,
        message: `Impossible de charger le catalogue communautaire VPN Gate : ${err.message}`,
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

  // ── Kill Switch (Indisponible dans cette version v0.1.6) ───────────────────
  ipcMain.handle('vpn:get-killswitch', () => {
    return {
      success: true,
      enabled: false,
      killSwitch: false,
      message: 'Indisponible dans cette version.',
    };
  });

  ipcMain.handle('vpn:set-killswitch', async () => {
    return {
      success: false,
      enabled: false,
      killSwitch: false,
      message: 'Le Kill Switch est indisponible dans cette version.',
    };
  });

  // ── Informations & Parcours d'Installation Accompagnée OpenVPN ──────────
  ipcMain.handle('vpn:get-installer-info', async () => {
    const components = await openVpnInstaller.detectComponents();
    return {
      success: true,
      installed: components.binaryInstalled && components.driverInstalled && components.serviceInstalled,
      components,
      packageDetails: {
        name: `OpenVPN Community Windows Installer (${OFFICIAL_OPENVPN_PACKAGE.version}-${OFFICIAL_OPENVPN_PACKAGE.build} ${OFFICIAL_OPENVPN_PACKAGE.architecture})`,
        filename: OFFICIAL_OPENVPN_PACKAGE.filename,
        officialDownloadUrl: OFFICIAL_OPENVPN_PACKAGE.downloadUrl,
        officialMirrorUrl: OFFICIAL_OPENVPN_PACKAGE.mirrorUrl,
        officialDownloadsPage: 'https://openvpn.net/community-downloads/',
        architecture: OFFICIAL_OPENVPN_PACKAGE.architecture,
        publisher: OFFICIAL_OPENVPN_PACKAGE.expectedSignerSubject,
        releaseNotesUrl: OFFICIAL_OPENVPN_PACKAGE.releaseNotesUrl,
        securityNotice: OFFICIAL_OPENVPN_PACKAGE.securityNotice,
        installedComponents: [
          'Moteur OpenVPN Core CLI (openvpn.exe 2.6.23)',
          'Pilotes réseau virtuels (Wintun / TAP-Windows / ovpn-dco packagés par l\'installateur)',
          'Service Interactif OpenVPN (OpenVPNServiceInteractive / openvpnserv.exe)',
        ],
        requiredPrivileges: 'Élévation administrateur (UAC) requise lors de l\'installation pour l\'enregistrement du pilote noyau et du service interactif',
        wingetId: 'OpenVPNTechnologies.OpenVPN',
        wingetCommand: 'winget install OpenVPNTechnologies.OpenVPN',
        verificationMethod: 'Signature numérique Authenticode (OpenVPN, Inc., statut Valid) obligatoire avant exécution. Empreinte SHA-256 calculée localement pour audit.',
      },
    };
  });

  // ── Vérification d'intégrité et signature d'un installeur OpenVPN ──────
  ipcMain.handle('vpn:verify-package', async () => {
    const controlledPath = openVpnInstaller.getControlledInstallerPath();
    if (!fs.existsSync(controlledPath)) {
      return {
        success: false,
        message: `Paquet introuvable dans le dossier d'installation contrôlé (${OFFICIAL_OPENVPN_PACKAGE.filename}).`,
      };
    }
    try {
      const sha256 = await openVpnInstaller.computeSha256(controlledPath);
      const signature = await openVpnInstaller.verifyAuthenticodeSignature(controlledPath);

      return {
        success: signature.valid && signature.publisherMatched,
        sha256,
        signature,
        trusted: signature.valid && signature.publisherMatched,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Erreur lors de la vérification du paquet : ${err.message}`,
      };
    }
  });

  // ── Exécution de l'installeur MSI avec consentement explicite ──────────
  ipcMain.handle('vpn:execute-msi-installer', async (_, opts: { consentGiven: boolean }) => {
    if (!opts || !opts.consentGiven) {
      return {
        success: false,
        exitCode: -1,
        rebootRequired: false,
        cancelledByUser: false,
        message: 'Consentement explicite de l\'utilisateur requis avant de lancer l\'installation.',
      };
    }
    const controlledPath = openVpnInstaller.getControlledInstallerPath();
    if (!fs.existsSync(controlledPath)) {
      return {
        success: false,
        exitCode: -1,
        rebootRequired: false,
        cancelledByUser: false,
        message: `Paquet d'installation officiel introuvable (${OFFICIAL_OPENVPN_PACKAGE.filename}). Veuillez d'abord le télécharger.`,
      };
    }
    return await openVpnInstaller.executeInstaller(controlledPath);
  });
}
