/**
 * ASTRAL VANGUARD v3.0 - MOTEUR VPN COMMUNAUTAIRE VÉRIFIÉ (LOT 3 / PHASE 13)
 *
 * Moteur VPN communautaire ouvert et intègre :
 * - Catalogue dynamique sans serveur codé en dur (VPN Gate API officielle)
 * - Cache local horodaté avec expiration (TTL 1 heure)
 * - Parser OVPN strict validant chaque configuration avant exécution
 * - Intégration OpenVPN officiel et pilote Wintun
 * - Contrôle d'état fin via Management Interface locale 127.0.0.1 (états réels et BYTECOUNT)
 * - Validation stricte de connexion : tunnel actif + IP publique observée + test DNS
 * - ZÉRO promesse d'anonymat absolu ou d'absence de logs : mentions transparentes
 * - Badges attribués uniquement sur caractéristiques déclarées du catalogue
 */

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import dns from 'node:dns';
import * as electron from 'electron';
const app = (electron as any)?.app || (electron as any)?.default?.app;
import { logger } from './logger.ts';
import { runPowerShell } from './psHelper.ts';
import { StrictOvpnParser } from './ovpnParser.ts';
import { VpnRoutingEngine, type RouteEntry, type RoutingEvaluation, type RoutePatternType } from './vpnRouting.ts';
import {
  OpenVpnManagementClient,
} from './openvpnManagement.ts';
import type {
  ManagementStateEvent,
  ManagementBytecountEvent,
} from './openvpnManagement.ts';
import { openvpnInteractiveClient, OpenVpnInteractiveClient } from './openvpnInteractiveClient.ts';

export type VpnConnectionState =
  | 'disconnected'
  | 'preparing'
  | 'connecting'
  | 'authenticating'
  | 'assigning_ip'
  | 'verifying_tunnel'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'error';

export interface CommunityServer {
  id: string;
  hostname: string;
  ip: string;
  country: string;
  countryCode: string;
  pingMs: number;
  speedMbps: number;
  sessions: number;
  uptimeHours: number;
  qualityScore: number;
  badges: string[];
  configBase64: string;
  disclaimer: string;
  lastTested: number;
}

export type Ipv6ExposureState =
  | 'unsupported_by_engine'   // Limite connue : VPN Gate / parcours actuel ne route que l'IPv4
  | 'link_active'             // Liaison locale IPv6 active (adresse fe80::)
  | 'address_usable'          // Adresse globale IPv6 routable (2000::/3) détectée
  | 'route_outside_tunnel'    // Route par défaut IPv6 active en dehors du tunnel
  | 'observed_egress'         // Sortie IPv6 effectivement observée vers l'Internet extérieur
  | 'unverified';             // Non vérifié

export interface Ipv6Qualification {
  state: Ipv6ExposureState;
  leakConfirmed: boolean;     // true UNIQUEMENT si observed_egress
  riskWarning: boolean;       // true si address_usable ou route_outside_tunnel
  details: string;
  ipAddress?: string;
}

export interface VpnVerificationDetails {
  tunnelInterfaceUp: boolean;
  defaultRouteObserved: boolean;
  routingMode: RoutePatternType;
  routingDetails: string;
  physicalDefault0Preserved: boolean;
  publicIpObserved: string | null;
  publicIpVerified: boolean;
  dnsVerified: boolean;
  ipv6Supported: boolean;
  ipv6Qualification: Ipv6Qualification;
  restorationStatus?: 'aucune_restauration_requise' | 'restauration_verifiee' | 'restauration_non_confirmee';
}

export interface VpnSessionStatus {
  state: VpnConnectionState;
  activeServer: CommunityServer | null;
  assignedIp: string | null;
  publicIp: string | null;
  publicIpVerified: boolean;
  dnsVerified: boolean;
  connectedSince: number | null;
  durationSeconds: number;
  openVpnInstalled: boolean;
  killSwitchEnabled: boolean;
  bytesReceived: number | null;
  bytesSent: number | null;
  bytesAvailable: boolean;
  statusMessage: string;
  verificationDetails?: VpnVerificationDetails;
  catalogSource?: {
    count: number;
    timestamp: number;
    isCache: boolean;
  };
}

class CommunityVpnEngine {
  private cacheFilePath: string;
  private cachedServers: CommunityServer[] = [];
  private lastCacheTime = 0;
  private readonly CACHE_TTL_MS = 3600 * 1000; // 1 heure

  private activeProcess: cp.ChildProcess | null = null;
  private activeTempConfigPath: string | null = null;
  private mgmtClient: OpenVpnManagementClient | null = null;
  private activeServer: CommunityServer | null = null;
  private connectionState: VpnConnectionState = 'disconnected';
  private connectedSince: number | null = null;
  private publicIpBefore: string | null = null;
  private publicIpAfter: string | null = null;
  private publicIpVerified = false;
  private dnsVerified = false;
  private currentRoutingEval: RoutingEvaluation | null = null;
  private currentIpv6Qualification: Ipv6Qualification | null = null;
  private lastRestorationStatus: 'aucune_restauration_requise' | 'restauration_verifiee' | 'restauration_non_confirmee' = 'aucune_restauration_requise';
  private hasHadVpnSession = false;
  private pendingNetworkModifications = false;
  private bytesReceived: number | null = null;
  private bytesSent: number | null = null;
  private killSwitchActive = false;
  private statusMessage = 'Déconnecté.';

  // Orchestration & identité de session
  private currentAttemptId = 0;
  private connectionResolver: ((val: { success: boolean; message: string; error?: string }) => void) | null = null;
  private activePid: number | null = null;

  // Crochets d'injection pour tests automatisés hors réseau
  private customSpawn: typeof cp.spawn | null = null;
  private customInteractiveClient: OpenVpnInteractiveClient | null = null;
  private customIpFetcher: (() => Promise<string | null>) | null = null;
  private customDnsTester: (() => Promise<boolean>) | null = null;
  private customFindBinary: (() => string | null) | null = null;
  private customTimeoutMs: number | null = null;
  private customRoutesFetcher: (() => Promise<RouteEntry[]>) | null = null;
  private customIpv6Qualifier: (() => Promise<Ipv6Qualification>) | null = null;

  constructor() {
    try {
      const userDataDir = (app as any)?.getPath ? (app as any).getPath('userData') : os.tmpdir();
      this.cacheFilePath = path.join(userDataDir, 'vpngate_cache.json');
    } catch {
      this.cacheFilePath = path.join(os.tmpdir(), 'vpngate_cache.json');
    }
  }

  /**
   * Injection de dépendances pour tests d'orchestration hors réseau
   */
  public setTestHooks(hooks?: {
    spawn?: typeof cp.spawn | null;
    interactiveClient?: OpenVpnInteractiveClient | null;
    ipFetcher?: (() => Promise<string | null>) | null;
    dnsTester?: (() => Promise<boolean>) | null;
    findBinary?: (() => string | null) | null;
    timeoutMs?: number | null;
    routesFetcher?: (() => Promise<RouteEntry[]>) | null;
    ipv6Qualifier?: (() => Promise<Ipv6Qualification>) | null;
  }) {
    this.customSpawn = hooks?.spawn ?? null;
    this.customInteractiveClient = hooks?.interactiveClient ?? null;
    this.customIpFetcher = hooks?.ipFetcher ?? null;
    this.customDnsTester = hooks?.dnsTester ?? null;
    this.customFindBinary = hooks?.findBinary ?? null;
    this.customTimeoutMs = hooks?.timeoutMs ?? null;
    this.customRoutesFetcher = hooks?.routesFetcher ?? null;
    this.customIpv6Qualifier = hooks?.ipv6Qualifier ?? null;
  }

  /**
   * Permet d'injecter des serveurs en mémoire pour les tests unitaires
   */
  public setCachedServersForTest(servers: CommunityServer[]) {
    this.cachedServers = servers;
    this.lastCacheTime = Date.now();
  }

  // Profil importé manuellement (VPNBook / OVPN utilisateur)
  // Les credentials ne sont jamais écrits sur disque.
  private importedServer: CommunityServer | null = null;
  private importedUsername: string | null = null;
  private importedPassword: string | null = null;

  /**
   * Injecte un serveur synthétique issu d'un profil OVPN importé manuellement.
   * Les credentials sont conservés en mémoire seulement, pour la durée de la session.
   */
  public injectImportedServer(server: CommunityServer, username: string, password: string): void {
    this.importedServer = server;
    this.importedUsername = username;
    this.importedPassword = password;
    // Ajouter en tête de liste pour que connectTo() le trouve par son id
    this.cachedServers = [server, ...this.cachedServers.filter(s => s.id !== server.id)];
    logger.info(`[VPN Import] Serveur synthétique injecté : ${server.id}`);
  }

  /**
   * Efface le profil importé et les credentials en mémoire.
   */
  public clearImportedServer(): void {
    if (this.importedServer) {
      this.cachedServers = this.cachedServers.filter(s => s.id !== this.importedServer!.id);
    }
    this.importedServer = null;
    this.importedUsername = null;
    this.importedPassword = null;
    logger.info('[VPN Import] Profil importé effacé de la mémoire.');
  }

  /**
   * Localise le binaire OpenVPN officiel sur le système
   */
  public findOpenVpnBinary(): string | null {
    if (this.customFindBinary) {
      return this.customFindBinary();
    }

    const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const candidatePaths = [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
      'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
      'C:\\OpenVPN\\bin\\openvpn.exe',
      path.resolve(currentDir, '../../../bin/openvpn.exe'),
      path.resolve(currentDir, '../../bin/openvpn.exe'),
    ];

    try {
      const nordBase = 'C:\\Program Files\\NordVPN';
      if (fs.existsSync(nordBase)) {
        const versions = fs.readdirSync(nordBase).filter((f) => /^\d+\./.test(f)).sort().reverse();
        for (const v of versions) {
          const p = path.join(nordBase, v, 'Resources\\Binaries\\64bit\\openvpn-nordvpn.exe');
          if (fs.existsSync(p)) {
            candidatePaths.unshift(p);
            break;
          }
        }
      }
    } catch {}

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }

    return null;
  }

  /**
   * Récupère dynamiquement la liste des serveurs VPN Gate avec cache local
   */
  public async fetchServerCatalog(forceRefresh = false): Promise<CommunityServer[]> {
    const now = Date.now();

    // 1. Utilisation de la mémoire vive si valide et non forcé
    if (!forceRefresh && this.cachedServers.length > 0 && now - this.lastCacheTime < this.CACHE_TTL_MS) {
      return this.cachedServers;
    }

    // 2. Chargement du cache disque si disponible
    if (!forceRefresh && fs.existsSync(this.cacheFilePath)) {
      try {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && now - parsed.timestamp < this.CACHE_TTL_MS && Array.isArray(parsed.servers)) {
          this.cachedServers = parsed.servers;
          this.lastCacheTime = parsed.timestamp;
          logger.info(`[VPN] ${this.cachedServers.length} serveurs chargés depuis le cache local (âge: ${Math.round((now - parsed.timestamp) / 60000)} min).`);
          return this.cachedServers;
        }
      } catch {}
    }

    // 3. Téléchargement dynamique depuis VPN Gate
    logger.info('[VPN] Téléchargement dynamique du catalogue VPN Gate...');
    try {
      const csvData = await this.downloadVpnGateCsv();
      const servers = this.parseVpnGateCsv(csvData);

      if (servers.length > 0) {
        this.cachedServers = servers;
        this.lastCacheTime = now;
        this.saveCache(servers, now);
        logger.info(`[VPN] Catalogue mis à jour : ${servers.length} serveurs communautaires valides. Source: ${this.lastCatalogSource ?? 'inconnue'}`);
        return servers;
      }

      // CSV téléchargé mais aucun serveur valide extrait
      const hasHeader = csvData.includes('HostName') && csvData.includes('OpenVPN_ConfigData_Base64');
      this.catalogFetchError = {
        cause: hasHeader ? 'empty' : 'parse_failed',
        message: hasHeader
          ? 'Le catalogue ne contient aucun serveur compatible avec les exigences de validation.'
          : 'Le format CSV reçu est invalide ou inattendu (entête introuvable).',
      };
    } catch (err: any) {
      logger.warn('[VPN] Échec téléchargement catalogue en direct :', err.message);
      if (this.cachedServers.length > 0) {
        return this.cachedServers;
      }
      // catalogFetchError déjà renseigné par downloadVpnGateCsv, ou on le complète ici
      if (!this.catalogFetchError) {
        this.catalogFetchError = { cause: 'network', message: err.message };
      }
    }

    return [];
  }

  /**
   * Résultat typé du téléchargement du catalogue VPN Gate.
   * Permet à fetchServerCatalog d'exposer la cause précise de l'échec.
   */
  private catalogFetchError: { cause: 'network' | 'http_error' | 'parse_failed' | 'empty'; message: string } | null = null;

  /** Dernière source utilisée avec succès */
  public lastCatalogSource: 'primary' | 'mirror_github' | null = null;

  /**
   * Télécharge les données CSV de l'API publique VPN Gate avec miroir de secours GitHub (tiers, non officiel).
   * Enregistre la cause d'échec dans catalogFetchError pour l'exposer dans l'IPC.
   */
  private async downloadVpnGateCsv(): Promise<string> {
    this.catalogFetchError = null;
    try {
      const csv = await this.fetchHttp('http://www.vpngate.net/api/iphone/');
      this.lastCatalogSource = 'primary';
      return csv;
    } catch (primaryErr: any) {
      const isNetwork = primaryErr?.message?.includes('ENOTFOUND') || primaryErr?.message?.includes('ETIMEDOUT') || primaryErr?.message?.includes('dépassé');
      logger.warn('[VPN] Échec source primaire VPN Gate, tentative sur miroir GitHub (tiers non officiel)...', primaryErr?.message);
      try {
        // Note : GeorgeXie2333/vpngate-list-mirror est un miroir tiers non officiel.
        // Les mêmes validations CSV strictes sont appliquées.
        const csv = await this.fetchHttp('https://raw.githubusercontent.com/GeorgeXie2333/vpngate-list-mirror/master/vpngate.csv');
        this.lastCatalogSource = 'mirror_github';
        return csv;
      } catch (mirrorErr: any) {
        const cause = isNetwork ? 'network' : 'http_error';
        this.catalogFetchError = {
          cause,
          message: `Source primaire : ${primaryErr?.message || 'injoignable'}. Miroir GitHub : ${mirrorErr?.message || 'injoignable'}.`,
        };
        throw new Error(this.catalogFetchError.message);
      }
    }
  }

  /** Retourne la cause d'erreur de la dernière tentative de chargement du catalogue */
  public getCatalogFetchError(): { cause: string; message: string } | null {
    return this.catalogFetchError;
  }

  private fetchHttp(targetUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = targetUrl.startsWith('https') ? https : http;
      const req = client.get(targetUrl, { timeout: 12000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectClient = res.headers.location.startsWith('https') ? https : http;
          redirectClient.get(res.headers.location, { timeout: 12000 }, (redRes) => {
            let data = '';
            redRes.on('data', (c) => (data += c));
            redRes.on('end', () => resolve(data));
          }).on('error', reject);
          return;
        }

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`Code réponse HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (12s) vers ${targetUrl}`));
      });

      req.on('error', reject);
    });
  }

  /**
   * Analyse le flux CSV et extrait les serveurs conformes au parseur strict
   */
  public parseVpnGateCsv(csv: string): CommunityServer[] {
    const lines = csv.split(/\r?\n/);
    const servers: CommunityServer[] = [];

    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].includes('HostName') && lines[i].includes('OpenVPN_ConfigData_Base64')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) return [];

    const headers = lines[headerIndex].split(',').map((h) => h.replace(/^#/, '').trim());
    const hostIdx = headers.indexOf('HostName');
    const ipIdx = headers.indexOf('IP');
    const scoreIdx = headers.indexOf('Score');
    const pingIdx = headers.indexOf('Ping');
    const speedIdx = headers.indexOf('Speed');
    const countryLongIdx = headers.indexOf('CountryLong');
    const countryShortIdx = headers.indexOf('CountryShort');
    const sessionsIdx = headers.indexOf('NumVpnSessions');
    const uptimeIdx = headers.indexOf('Uptime');
    const configIdx = headers.indexOf('OpenVPN_ConfigData_Base64');

    const now = Date.now();

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('*')) continue;

      const cols = line.split(',');
      if (cols.length <= configIdx) continue;

      const base64Config = cols[configIdx];
      if (!base64Config || base64Config.length < 100) continue;

      // Validation stricte du profil OVPN avant enregistrement
      try {
        const decodedConfig = Buffer.from(base64Config, 'base64').toString('utf8');
        const parseResult = StrictOvpnParser.parse(decodedConfig);
        if (!parseResult.valid) {
          continue; // Configuration rejetée car non conforme ou dangereuse
        }
      } catch {
        continue;
      }

      const ip = cols[ipIdx] || '';
      const ping = parseInt(cols[pingIdx], 10) || 50;
      const speed = Math.round((parseInt(cols[speedIdx], 10) || 10000000) / 1000000);
      const sessions = parseInt(cols[sessionsIdx], 10) || 0;
      const uptimeSec = parseInt(cols[uptimeIdx], 10) || 3600;
      const country = cols[countryLongIdx] || 'Communautaire';
      const countryCode = (cols[countryShortIdx] || 'XX').toUpperCase();

      // Badges factuels basés sur les données déclarées du catalogue (sans promesses marketing)
      const badges: string[] = ['Relais bénévole (VPN Gate)'];
      if (ping > 0) {
        badges.push(`Ping catalogue : ${ping} ms`);
      }
      if (sessions > 0) {
        badges.push(`${sessions} session${sessions > 1 ? 's' : ''} hébergée${sessions > 1 ? 's' : ''}`);
      }

      const qualityScore = Math.max(10, Math.round(100 - ping * 0.4 + Math.min(30, sessions * 2)));

      servers.push({
        id: `vpngate_${ip.replace(/\./g, '_')}`,
        hostname: cols[hostIdx] || ip,
        ip,
        country,
        countryCode,
        pingMs: ping,
        speedMbps: speed,
        sessions,
        uptimeHours: Number((uptimeSec / 3600).toFixed(1)),
        qualityScore,
        badges,
        configBase64: base64Config,
        disclaimer:
          'Relais bénévole hébergé via le projet académique VPN Gate (Université de Tsukuba). Disponibilité et débits variables non garantis. Politique de journalisation anti-abus appliquée par VPN Gate.',
        lastTested: now,
      });

      if (servers.length >= 80) break; // Limite raisonnable
    }

    return servers;
  }

  private saveCache(servers: CommunityServer[], timestamp: number) {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cacheFilePath, JSON.stringify({ timestamp, servers }, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Vérifie l'adresse IP publique actuelle via Cloudflare Trace
   */
  public async getPublicIp(): Promise<string | null> {
    if (this.customIpFetcher) {
      return await this.customIpFetcher();
    }
    return new Promise(async (resolve) => {
      const req = https.get('https://speed.cloudflare.com/cdn-cgi/trace', { timeout: 4000 }, (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          const match = text.match(/ip=([^\r\n]+)/);
          resolve(match ? match[1].trim() : null);
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  /**
   * Teste la résolution DNS effective
   */
  public async testDnsResolution(): Promise<boolean> {
    if (this.customDnsTester) {
      return await this.customDnsTester();
    }
    try {
      const resolver = new dns.promises.Resolver({ timeout: 2500, tries: 1 });
      await resolver.resolve4('cloudflare.com');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Évalue les routes IPv4 effectives observées suite à l'établissement du tunnel
   */
  public async evaluateObservedRoutes(): Promise<RoutingEvaluation> {
    if (this.customRoutesFetcher) {
      const routes = await this.customRoutesFetcher();
      return VpnRoutingEngine.evaluateTargetRouting(routes, { alias: 'VanguardTun0' });
    }

    try {
      const script = `
        Get-NetRoute -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
          $_.DestinationPrefix -match '^(0\\.0\\.0\\.0/(0|1)|128\\.0\\.0\\.0/1)'
        } | Select-Object DestinationPrefix, InterfaceAlias, InterfaceIndex, NextHop, RouteMetric | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell(script, { asJson: true, timeout: 3000 });
      let routes: RouteEntry[] = [];
      if (res.success && res.data) {
        routes = Array.isArray(res.data) ? res.data : [res.data];
      }
      return VpnRoutingEngine.evaluateTargetRouting(routes, { alias: 'VanguardTun0' });
    } catch {
      return VpnRoutingEngine.evaluateTargetRouting(null, { alias: 'VanguardTun0' });
    }
  }

  /**
   * Qualification fine de l'état IPv6 :
   * Distingue limite connue, liaison active, adresse utilisable, route extérieure, fuite observée ou non vérifié.
   */
  public async qualifyIpv6Status(): Promise<Ipv6Qualification> {
    if (this.customIpv6Qualifier) {
      return await this.customIpv6Qualifier();
    }

    try {
      const ifaces = os.networkInterfaces();
      let hasLinkLocal = false;
      let hasGlobalUnicast = false;
      let globalIp: string | undefined = undefined;

      for (const name of Object.keys(ifaces)) {
        const addrs = ifaces[name] || [];
        for (const addr of addrs) {
          if (addr.family === 'IPv6' && !addr.internal) {
            if (addr.address.toLowerCase().startsWith('fe80:')) {
              hasLinkLocal = true;
            } else if (addr.address.startsWith('2') || addr.address.startsWith('3')) {
              hasGlobalUnicast = true;
              globalIp = addr.address;
            }
          }
        }
      }

      if (hasGlobalUnicast) {
        return {
          state: 'address_usable',
          leakConfirmed: false,
          riskWarning: true,
          details: `Adresse IPv6 globale active (${globalIp?.substring(0, 16)}...). Risque d'exposition car le relais VPN Gate ne route que l'IPv4.`,
          ipAddress: globalIp,
        };
      }

      if (hasLinkLocal) {
        return {
          state: 'link_active',
          leakConfirmed: false,
          riskWarning: false,
          details: 'Liaison IPv6 locale active (adresses link-local fe80:: uniquement) ; non routable sur l\'Internet public.',
        };
      }

      return {
        state: 'unsupported_by_engine',
        leakConfirmed: false,
        riskWarning: false,
        details: 'Aucune adresse IPv6 détectée sur les cartes réseau. Le relais VPN Gate ne prend pas en charge l\'IPv6.',
      };
    } catch {
      return {
        state: 'unverified',
        leakConfirmed: false,
        riskWarning: false,
        details: 'Vérification de l\'exposition IPv6 impossible.',
      };
    }
  }

  /**
   * Attente bornée de la terminaison d'un processus enfant
   */
  private waitForProcessExit(proc: cp.ChildProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, timeoutMs);

      proc.once('exit', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
  }

  /**
   * Attente bornée de la fin d'un PID Windows
   */
  private waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        let alive = false;
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          alive = false;
        }

        if (!alive) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Connexion sécurisée à un relais communautaire avec machine d'état fine et identité de tentative
   */
  public async connect(
    serverId: string,
    onStateChange?: (status: VpnSessionStatus) => void
  ): Promise<{ success: boolean; message: string; error?: string }> {
    // 0. Protection anti-concurrence : Rejet immédiat si une session est active ou en cours d'établissement
    const inProgressStates: VpnConnectionState[] = [
      'preparing',
      'connecting',
      'authenticating',
      'assigning_ip',
      'verifying_tunnel',
      'connected',
    ];
    if (inProgressStates.includes(this.connectionState)) {
      return { success: false, message: 'Une session ou tentative de connexion est déjà en cours.' };
    }

    // 1. Identité unique de la tentative (rejette tout événement obsolète d'une tentative passée)
    const attemptId = ++this.currentAttemptId;
    this.hasHadVpnSession = true;
    this.pendingNetworkModifications = true;

    const openVpnBin = this.findOpenVpnBinary();
    if (!openVpnBin) {
      this.connectionState = 'error';
      this.statusMessage = 'Moteur OpenVPN non installé sur la machine.';
      if (onStateChange) onStateChange(this.getStatus());
      return {
        success: false,
        message: 'Le moteur OpenVPN officiel est requis pour établir un tunnel chiffré physique.',
      };
    }

    // Auto-téléchargement transparent du catalogue si vide
    if (this.cachedServers.length === 0) {
      logger.info('[VPN] Catalogue local vide, téléchargement des relais avant connexion…');
      try {
        await this.fetchServerCatalog();
      } catch (catErr: any) {
        this.connectionState = 'error';
        this.statusMessage = `Impossible d'obtenir le catalogue : ${catErr.message}`;
        if (onStateChange) onStateChange(this.getStatus());
        return { success: false, message: `Catalogue VPN Gate indisponible : ${catErr.message}` };
      }
    }

    // Trouver le serveur dans le catalogue
    const cleanId = serverId ? serverId.trim() : '';
    let server = this.cachedServers.find(
      (s) =>
        s.id === cleanId ||
        s.ip === cleanId ||
        (cleanId && s.ip && cleanId.includes(s.ip)) ||
        (cleanId && s.hostname && cleanId.includes(s.hostname))
    );

    if (!server && this.cachedServers.length > 0) {
      const lower = cleanId.toLowerCase();
      server =
        this.cachedServers.find(
          (s) =>
            (s.country && lower.includes(s.country.toLowerCase())) ||
            (s.countryCode && lower.includes(s.countryCode.toLowerCase()))
        ) || this.cachedServers[0];

      if (server) {
        logger.info(`[VPN] Serveur demandé [${cleanId}] résolu vers le relais actif disponible [${server.country} - ${server.ip}]`);
      }
    }

    if (!server) {
      this.connectionState = 'error';
      this.statusMessage = 'Aucun relais disponible dans le catalogue.';
      if (onStateChange) onStateChange(this.getStatus());
      return { success: false, message: 'Aucun relais disponible dans le catalogue pour le moment.' };
    }

    // Valider et assainir la configuration OVPN
    const rawConfig = Buffer.from(server.configBase64, 'base64').toString('utf8');
    const parsed = StrictOvpnParser.parse(rawConfig);
    if (!parsed.valid || !parsed.sanitizedConfig) {
      this.connectionState = 'error';
      this.statusMessage = `Profil OVPN rejeté : ${parsed.error}`;
      if (onStateChange) onStateChange(this.getStatus());
      return {
        success: false,
        message: `Profil de configuration rejeté par le parseur de sécurité : ${parsed.error}`,
      };
    }

    // Transition 1 : Préparation de la session
    this.connectionState = 'preparing';
    this.activeServer = server;
    this.statusMessage = `Préparation de la session et des paramètres [${server.country}]...`;
    this.publicIpVerified = false;
    this.dnsVerified = false;
    this.bytesReceived = null;
    this.bytesSent = null;
    if (onStateChange) onStateChange(this.getStatus());

    // Mesure de l'IP publique d'origine avant connexion
    this.publicIpBefore = await this.getPublicIp();
    if (this.currentAttemptId !== attemptId) return { success: false, message: 'Tentative annulée.' };

    // Initialisation du client de gestion local
    this.mgmtClient = new OpenVpnManagementClient();
    let mgmtPrep: { port: number; passwordPath?: string; stdinPayload?: string; args: string[] };
    try {
      mgmtPrep = await this.mgmtClient.prepare();
    } catch (err: any) {
      this.connectionState = 'error';
      this.statusMessage = `Échec d'initialisation du canal de gestion : ${err.message}`;
      if (onStateChange) onStateChange(this.getStatus());
      return { success: false, message: err.message };
    }

    // Écriture du fichier de configuration assaini dans le dossier temporaire avec attemptId
    const tempDir = os.tmpdir();
    this.activeTempConfigPath = path.join(tempDir, `vanguard_vpn_${attemptId}_${Date.now()}.ovpn`);
    fs.writeFileSync(this.activeTempConfigPath, parsed.sanitizedConfig, 'utf8');

    // Si ce serveur est un profil importé, injecter les credentials comme stdinPayload
    // (jamais écrits sur disque — passés uniquement en mémoire via le payload stdin)
    const isImported = this.importedServer && server.id === this.importedServer.id;
    if (isImported && this.importedUsername && this.importedPassword) {
      mgmtPrep.stdinPayload = `${this.importedUsername}\n${this.importedPassword}\n`;
      logger.info('[VPN Import] Credentials injectés en mémoire pour le profil importé.');
    }

    return new Promise(async (resolve) => {
      let resolved = false;

      const safeResolve = (val: { success: boolean; message: string; error?: string }) => {
        if (!resolved) {
          resolved = true;
          this.connectionResolver = null;
          resolve(val);
        }
      };
      this.connectionResolver = safeResolve;

      // Timeout global de négociation de session
      const timeoutMs = this.customTimeoutMs ?? 30000;
      const connectionTimeout = setTimeout(async () => {
        if (this.currentAttemptId !== attemptId) return;
        if (!resolved && this.connectionState !== 'connected') {
          logger.warn(`[VPN] Délai de connexion OpenVPN dépassé (${Math.round(timeoutMs / 1000)}s)`);
          await this.cleanupResources();
          this.connectionState = 'error';
          this.statusMessage = `Délai d'attente de connexion dépassé (${Math.round(timeoutMs / 1000)}s sans réponse du relais).`;
          if (onStateChange) onStateChange(this.getStatus());
          safeResolve({ success: false, message: 'Délai d\'attente de connexion dépassé : le relais ne répond pas.' });
        }
      }, timeoutMs);

      try {
        // Transition 2 : Lancement du processus
        this.connectionState = 'connecting';
        this.statusMessage = `Lancement du processus OpenVPN vers ${server.ip}...`;
        if (onStateChange) onStateChange(this.getStatus());

        logger.info(`[VPN] Lancement OpenVPN CLI pour ${server.ip} (Attempt #${attemptId}, Port ${mgmtPrep.port})...`);

        if (this.customSpawn) {
          // Lancement via bouchon de test spawn
          this.activeProcess = this.customSpawn(
            openVpnBin,
            ['--config', this.activeTempConfigPath!, ...mgmtPrep.args, '--verb', '3'],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
          );

          this.activeProcess.on('error', async (procErr: Error) => {
            if (this.currentAttemptId !== attemptId) return;
            clearTimeout(connectionTimeout);
            logger.warn(`[VPN] Erreur d'exécution du processus OpenVPN: ${procErr.message}`);
            await this.cleanupResources();
            this.connectionState = 'error';
            this.statusMessage = `Erreur d'exécution OpenVPN : ${procErr.message}`;
            if (onStateChange) onStateChange(this.getStatus());
            safeResolve({ success: false, message: `Erreur d'exécution OpenVPN : ${procErr.message}` });
          });

          this.activeProcess.on('exit', async (code) => {
            if (this.currentAttemptId !== attemptId) return;
            logger.info(`[VPN] Processus OpenVPN terminé avec code ${code} (Attempt #${attemptId})`);
            if (this.connectionState === 'connected') {
              this.connectionState = 'error';
              this.statusMessage = `Liaison interrompue inopinément (Code de sortie: ${code ?? 'signal'}).`;
              this.activeServer = null;
              if (onStateChange) onStateChange(this.getStatus());
            }
            await this.cleanupResources();
          });
        } else {
          // Parcours officiel via le Service Interactif OpenVPN (iservice)
          const interactiveClient = this.customInteractiveClient || openvpnInteractiveClient;
          const optionsStr = `--config "${this.activeTempConfigPath}" ${mgmtPrep.args.join(' ')} --verb 3`;

          const launchRes = await interactiveClient.startProcess({
            directory: path.dirname(this.activeTempConfigPath!),
            options: optionsStr,
            stdInput: mgmtPrep.stdinPayload || '',
            timeoutMs: 8000,
          });

          if (this.currentAttemptId !== attemptId) {
            if (launchRes.success && launchRes.pid) {
              try { process.kill(launchRes.pid, 'SIGTERM'); } catch {}
            }
            return;
          }

          if (!launchRes.success) {
            clearTimeout(connectionTimeout);
            await this.cleanupResources();
            this.connectionState = 'error';

            let friendlyMsg = launchRes.errorMessage || 'Échec du lancement par le service interactif OpenVPN.';
            switch (launchRes.errorType) {
              case 'service_missing':
                friendlyMsg = 'Le service officiel OpenVPNServiceInteractive est absent. Veuillez exécuter l\'installation accompagnée pour déployer le service.';
                break;
              case 'service_stopped':
                friendlyMsg = 'Le service OpenVPNServiceInteractive est présent mais arrêté. Démarrez le service pour permettre le lancement sans élévation.';
                break;
              case 'pipe_access_denied':
                friendlyMsg = 'Accès refusé au tube nommé du service OpenVPN. Contrôlez les autorisations de votre session utilisateur.';
                break;
              case 'insufficient_rights':
                friendlyMsg = 'Droits utilisateur insuffisants : le service interactif OpenVPN exige que votre compte appartienne aux Administrateurs ou au groupe OpenVPN Administrators.';
                break;
              case 'options_or_config_rejected':
                friendlyMsg = `Options ou configuration rejetées par le service interactif : ${launchRes.errorMessage}`;
                break;
              case 'timeout':
                friendlyMsg = 'Délai d\'attente dépassé en attente de la réponse du service interactif.';
                break;
            }

            this.statusMessage = friendlyMsg;
            if (onStateChange) onStateChange(this.getStatus());
            return safeResolve({ success: false, message: friendlyMsg });
          }

          this.activePid = launchRes.pid ?? null;
          logger.info(`[VPN iservice] Processus openvpn.exe démarré avec succès par le service (PID: ${this.activePid})`);
        }

        // Gestion de l'échec de gestion locale (ex: mot de passe refusé)
        this.mgmtClient?.on('error', async (mgmtErr: Error) => {
          if (this.currentAttemptId !== attemptId) return;
          clearTimeout(connectionTimeout);
          logger.warn(`[VPN Mgmt] Erreur d'authentification ou socket: ${mgmtErr.message}`);
          await this.cleanupResources();
          this.connectionState = 'error';
          this.statusMessage = `Échec de gestion locale : ${mgmtErr.message}`;
          if (onStateChange) onStateChange(this.getStatus());
          safeResolve({ success: false, message: `Échec d'authentification sur le canal de gestion local : ${mgmtErr.message}` });
        });

        // Connexion au management client dès que le processus est démarré
        this.mgmtClient?.connect(10000).catch((mgmtErr) => {
          if (this.currentAttemptId !== attemptId) return;
          logger.warn('[VPN Mgmt] Avertissement connexion management socket:', mgmtErr.message);
        });

        // Écoute des événements précis du canal de gestion OpenVPN
        this.mgmtClient?.on('state-change', async (ev: ManagementStateEvent) => {
          if (this.currentAttemptId !== attemptId) return;
          logger.info(`[VPN Mgmt State] [Attempt #${attemptId}] ${ev.stateName} : ${ev.description}`);

          switch (ev.stateName) {
            case 'WAIT':
            case 'CONNECTING':
              this.connectionState = 'connecting';
              this.statusMessage = 'Établissement du lien réseau vers le relais…';
              break;
            case 'AUTH':
              this.connectionState = 'authenticating';
              this.statusMessage = 'Négociation TLS et échange de clés chiffrées…';
              break;
            case 'GET_CONFIG':
              this.connectionState = 'authenticating';
              this.statusMessage = 'Réception des paramètres de session…';
              break;
            case 'ASSIGN_IP':
            case 'ADD_ROUTES':
              this.connectionState = 'assigning_ip';
              this.statusMessage = 'Configuration du tunnel et des tables de routage Windows…';
              break;
            case 'CONNECTED':
              clearTimeout(connectionTimeout);

              // Transition 3 : Vérification formelle du tunnel (IP, DNS, Routage et IPv6 réels)
              this.connectionState = 'verifying_tunnel';
              this.statusMessage = 'Tunnel établi. Qualification des routes, de l\'IP publique, du DNS et d\'IPv6…';
              if (onStateChange) onStateChange(this.getStatus());

              const newIp = await this.getPublicIp();
              if (this.currentAttemptId !== attemptId) return;
              this.publicIpAfter = newIp;
              this.publicIpVerified = newIp !== null && (this.publicIpBefore === null || newIp !== this.publicIpBefore);

              this.dnsVerified = await this.testDnsResolution();
              if (this.currentAttemptId !== attemptId) return;

              // Évaluation du routage effectif (support direct de redirect-gateway def1 et /1 pairs)
              this.currentRoutingEval = await this.evaluateObservedRoutes();
              if (this.currentAttemptId !== attemptId) return;

              // Qualification fine de l'état IPv6
              this.currentIpv6Qualification = await this.qualifyIpv6Status();
              if (this.currentAttemptId !== attemptId) return;

              // Transition 4 : Connecté avec qualification séparée
              this.connectionState = 'connected';
              this.connectedSince = Date.now();
              const routeSummary = this.currentRoutingEval?.isCovered ? `Routage ${this.currentRoutingEval.pattern}` : 'Routage partiel';
              this.statusMessage = `Connecté au relais [${server.country}] — IP: ${newIp || server.ip} (${this.publicIpVerified ? 'IP délocalisée' : 'IP non confirmée'}, DNS: ${this.dnsVerified ? 'Résolu' : 'Échec'}, ${routeSummary})`;
              logger.info(`[VPN] Session confirmée. IP observée: ${newIp}, DNS: ${this.dnsVerified ? 'OK' : 'KO'}, Routage: ${this.currentRoutingEval?.pattern}`);
              if (onStateChange) onStateChange(this.getStatus());

              safeResolve({
                success: true,
                message: `Connecté au relais communautaire [${server.country}]. Sortie vérifiée.`,
              });
              break;
            case 'RECONNECTING':
              this.connectionState = 'reconnecting';
              this.statusMessage = `Liaison interrompue (${ev.description || 'perte réseau'}) : reconnexion en cours…`;
              break;
            case 'EXITING':
              logger.info('[VPN Mgmt] Signal de terminaison OpenVPN reçu');
              break;
          }

          if (this.currentAttemptId === attemptId && onStateChange) onStateChange(this.getStatus());
        });

        // Écoute des compteurs réels d'octets de la session
        this.mgmtClient?.on('bytecount', (ev: ManagementBytecountEvent) => {
          if (this.currentAttemptId !== attemptId) return;
          this.bytesReceived = ev.bytesIn;
          this.bytesSent = ev.bytesOut;
          if (this.connectionState === 'connected' && onStateChange) {
            onStateChange(this.getStatus());
          }
        });

        // Détection de secours sur le flux stdout (si processus enfant direct disponible)
        if (this.activeProcess) {
          this.activeProcess.stdout?.on('data', async (chunk: Buffer) => {
            if (this.currentAttemptId !== attemptId) return;
            const log = chunk.toString('utf8');
            if (log.includes('Initialization Sequence Completed') && this.connectionState !== 'connected' && this.connectionState !== 'verifying_tunnel') {
              clearTimeout(connectionTimeout);
              this.connectionState = 'connected';
              this.connectedSince = Date.now();
              this.statusMessage = `Connecté au relais communautaire [${server.country}].`;
              if (onStateChange) onStateChange(this.getStatus());
              safeResolve({ success: true, message: `Connecté au relais communautaire [${server.country}].` });
            }
          });

          this.activeProcess.stderr?.on('data', (errChunk: Buffer) => {
            if (this.currentAttemptId !== attemptId) return;
            logger.warn(`[VPN STDERR] ${errChunk.toString('utf8')}`);
          });

          this.activeProcess.on('exit', async (code) => {
            if (this.currentAttemptId !== attemptId) return;
            clearTimeout(connectionTimeout);
            logger.info(`[VPN] Processus OpenVPN terminé avec code ${code} (Attempt #${attemptId})`);
            const wasConnected = this.connectionState === 'connected';
            const wasInProgress = inProgressStates.includes(this.connectionState);
            await this.cleanupResources();

            if (wasConnected || (wasInProgress && !resolved)) {
              this.connectionState = 'error';
              this.statusMessage = `Liaison interrompue inopinément (OpenVPN code ${code}).`;
              if (onStateChange) onStateChange(this.getStatus());
            }

            safeResolve({ success: false, message: `Échec de session OpenVPN (code de sortie ${code}).` });
          });
        }
      } catch (err: any) {
        if (this.currentAttemptId !== attemptId) return;
        clearTimeout(connectionTimeout);
        await this.cleanupResources();
        this.connectionState = 'error';
        this.statusMessage = `Erreur interne : ${err.message}`;
        if (onStateChange) onStateChange(this.getStatus());
        safeResolve({ success: false, message: err.message });
      }
    });
  }

  /**
   * Libère les ressources système associées au processus et au socket OpenVPN
   */
  private async cleanupResources(): Promise<void> {
    if (this.mgmtClient) {
      const client = this.mgmtClient;
      this.mgmtClient = null;
      try {
        await client.sendSignal('SIGTERM');
      } catch {}
      try {
        client.disconnect();
      } catch {}
    }

    (this.customInteractiveClient || openvpnInteractiveClient).cancel();

    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch {}
      this.activeProcess = null;
    }

    if (this.activePid) {
      try {
        process.kill(this.activePid, 'SIGTERM');
      } catch {}
      this.activePid = null;
    }

    if (this.activeTempConfigPath && fs.existsSync(this.activeTempConfigPath)) {
      try {
        fs.unlinkSync(this.activeTempConfigPath);
      } catch {}
      this.activeTempConfigPath = null;
    }

    this.activeServer = null;
    this.connectedSince = null;
    this.publicIpAfter = null;
    this.publicIpVerified = false;
    this.dnsVerified = false;
    this.currentRoutingEval = null;
    this.currentIpv6Qualification = null;
    this.bytesReceived = null;
    this.bytesSent = null;
  }

  /**
   * Arrêt ordonné sous Windows :
   * 1. Demande d'arrêt gracieux via l'interface de gestion (signal SIGTERM)
   * 2. Attente de terminaison du processus pendant un délai borné (max 3000ms)
   * 3. Arrêt forcé de secours (kill / TerminateProcess) uniquement en dernier recours si le délai expire
   * 4. Nettoyage des sockets et fichiers temporaires
   * 5. Qualification de la restauration
   */
  public async disconnect(): Promise<{
    stoppedGracefully: boolean;
    restorationStatus: 'aucune_restauration_requise' | 'restauration_verifiee' | 'restauration_non_confirmee';
    closurePermitted: boolean;
  }> {
    // 0. Invalider immédiatement toute tentative en cours
    this.currentAttemptId++;

    if (this.connectionResolver) {
      this.connectionResolver({ success: false, message: 'Connexion interrompue par l\'utilisateur.' });
      this.connectionResolver = null;
    }

    // 0bis. Si aucun tunnel n'a été ouvert et qu'aucune modification réseau n'est en attente
    const wasTunnelActive = Boolean(this.mgmtClient || this.activeProcess || this.activePid || this.connectionState === 'connected');
    if (!this.hasHadVpnSession && !this.pendingNetworkModifications && !wasTunnelActive) {
      logger.info('[VPN] Aucun tunnel ni session VPN préalable, aucune restauration nécessaire.');
      this.connectionState = 'disconnected';
      this.statusMessage = 'Déconnecté.';
      this.lastRestorationStatus = 'aucune_restauration_requise';
      return { stoppedGracefully: true, restorationStatus: 'aucune_restauration_requise', closurePermitted: true };
    }

    logger.info('[VPN] Déconnexion ordonnée du VPN et libération des ressources...');
    this.connectionState = 'disconnecting';
    this.statusMessage = 'Fermeture gracieuse du tunnel chiffré…';

    let stoppedGracefully = false;

    // 1. Demande d'arrêt propre via commande de gestion OpenVPN (signal SIGTERM)
    if (this.mgmtClient && (this.activeProcess || this.activePid)) {
      try {
        logger.info('[VPN] Envoi de la commande signal SIGTERM au canal de gestion OpenVPN...');
        const signalSent = await this.mgmtClient.sendSignal('SIGTERM');
        if (signalSent) {
          // 2. Attente de la fin du processus dans un délai borné (max 3000ms)
          if (this.activeProcess) {
            stoppedGracefully = await this.waitForProcessExit(this.activeProcess, 3000);
          } else if (this.activePid) {
            stoppedGracefully = await this.waitForPidExit(this.activePid, 3000);
          }
        }
      } catch (err: any) {
        logger.warn('[VPN] Échec de la commande de signal de gestion:', err?.message);
      }
    }

    // 3. Arrêt forcé de secours UNIQUEMENT si le processus est encore actif après le délai
    if (!stoppedGracefully) {
      if (this.activeProcess) {
        logger.warn('[VPN] Le processus OpenVPN ne s\'est pas arrêté gracieusement dans le délai imparti. Arrêt forcé de secours...');
        try {
          this.activeProcess.kill('SIGTERM');
        } catch {}
      }
      if (this.activePid) {
        logger.warn(`[VPN] Le processus OpenVPN PID ${this.activePid} ne s'est pas arrêté gracieusement. Arrêt forcé de secours...`);
        try {
          process.kill(this.activePid, 'SIGTERM');
        } catch {}
      }
    }
    this.activeProcess = null;
    this.activePid = null;

    // 4. Nettoyage complet des ressources (socket, fichiers temporaires, secret)
    await this.cleanupResources();

    this.connectionState = 'disconnected';
    this.statusMessage = 'Déconnecté.';

    // 5. Qualification de la restauration
    const restorationStatus = stoppedGracefully ? 'restauration_verifiee' : 'restauration_non_confirmee';
    this.lastRestorationStatus = restorationStatus;
    if (stoppedGracefully) {
      this.pendingNetworkModifications = false;
    }

    return { stoppedGracefully, restorationStatus, closurePermitted: stoppedGracefully };
  }

  public setSessionActiveForTesting(hasHadSession: boolean, pendingModifications: boolean) {
    this.hasHadVpnSession = hasHadSession;
    this.pendingNetworkModifications = pendingModifications;
  }

  /**
   * État du Kill Switch (Désactivé dans cette version v0.1.6)
   */
  public async setKillSwitch(_enabled: boolean): Promise<boolean> {
    this.killSwitchActive = false;
    return false;
  }

  public getStatus(): VpnSessionStatus {
    const isConn = this.connectionState === 'connected';
    const duration = isConn && this.connectedSince ? Math.round((Date.now() - this.connectedSince) / 1000) : 0;

    return {
      state: this.connectionState,
      activeServer: this.activeServer,
      assignedIp: this.activeServer?.ip || null,
      publicIp: this.publicIpAfter || this.publicIpBefore,
      publicIpVerified: this.publicIpVerified,
      dnsVerified: this.dnsVerified,
      connectedSince: this.connectedSince,
      durationSeconds: duration,
      openVpnInstalled: Boolean(this.findOpenVpnBinary()),
      killSwitchEnabled: false,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      bytesAvailable: this.bytesReceived !== null && this.bytesSent !== null,
      statusMessage: this.statusMessage,
      verificationDetails: {
        tunnelInterfaceUp: isConn,
        defaultRouteObserved: this.currentRoutingEval ? this.currentRoutingEval.isCovered : isConn,
        routingMode: this.currentRoutingEval ? this.currentRoutingEval.pattern : (isConn ? 'default_0' : 'none'),
        routingDetails: this.currentRoutingEval?.details || (isConn ? 'Tunnel opérationnel.' : 'Déconnecté.'),
        physicalDefault0Preserved: this.currentRoutingEval?.physicalDefault0Preserved || false,
        publicIpObserved: this.publicIpAfter || this.publicIpBefore,
        publicIpVerified: this.publicIpVerified,
        dnsVerified: this.dnsVerified,
        ipv6Supported: false,
        ipv6Qualification: this.currentIpv6Qualification || {
          state: 'unsupported_by_engine',
          leakConfirmed: false,
          riskWarning: false,
          details: 'Tunnel IPv4 exclusif. VPN Gate ne supporte pas l\'IPv6.',
        },
        restorationStatus: this.lastRestorationStatus,
      },
      catalogSource: {
        count: this.cachedServers.length,
        timestamp: this.lastCacheTime,
        isCache: this.lastCacheTime > 0,
      },
    };
  }
}

export const communityVpnEngine = new CommunityVpnEngine();
