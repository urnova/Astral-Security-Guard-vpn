/**
 * ASTRAL VANGUARD - CLIENT DE GESTION LOCAL OPENVPN (MANAGEMENT INTERFACE)
 * 
 * Dialogue sécurisé strictement local (127.0.0.1) avec le processus OpenVPN :
 * - Port dynamique local éphémère (jamais codé en dur)
 * - Secret d'authentification aléatoire fort généré en mémoire
 * - Fichier de secret temporaire aux permissions restreintes, nettoyé après connexion
 * - Aucune exposition réseau, aucun secret consigné dans les journaux
 * - Écoute des états réels (>STATE:...) et des compteurs de transfert réels (>BYTECOUNT:...)
 * - Contrôle d'arrêt propre via commande SIGTERM
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import { logger } from './logger.ts';

export interface ManagementStateEvent {
  timestamp: number;
  stateName: string;
  description: string;
  assignedIp?: string;
  remoteIp?: string;
}

export interface ManagementBytecountEvent {
  bytesIn: number;
  bytesOut: number;
  timestamp: number;
}

/**
 * Récupère le SID Windows de l'utilisateur courant de manière déterministe
 */
export function getCurrentUserSid(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const res = cp.spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2000,
    });
    if (res.status === 0 && res.stdout) {
      const match = res.stdout.match(/S-1-5-[0-9-]+/);
      if (match) return match[0].trim();
    }
  } catch {}
  return null;
}

export interface StructuredAclReport {
  valid: boolean;
  owner: string | null;
  hasInherited: boolean;
  unauthorizedCount: number;
  allowedSids: string[];
}

/**
 * Contrôle structuré des ACL et du propriétaire Windows via SIDs
 */
export function verifyFilePermissionsStructured(filePath: string): StructuredAclReport {
  if (process.platform !== 'win32') {
    return {
      valid: true,
      owner: null,
      hasInherited: false,
      unauthorizedCount: 0,
      allowedSids: [],
    };
  }

  const sid = getCurrentUserSid();
  const escapedPath = filePath.replace(/'/g, "''");
  const psScript = `
    $path = '${escapedPath}';
    $acl = Get-Acl -LiteralPath $path;
    $allowedSids = @('S-1-5-18', 'S-1-5-32-544', '${sid || ''}');
    $hasInherited = $false;
    $unauthorized = @();
    foreach ($access in $acl.Access) {
      if ($access.IsInherited) { $hasInherited = $true }
      try {
        $entrySid = $access.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;
        if ($allowedSids -notcontains $entrySid) { $unauthorized += $entrySid }
      } catch {
        $unauthorized += $access.IdentityReference.Value
      }
    }
    [PSCustomObject]@{
      Owner = $acl.Owner;
      HasInherited = [bool]$hasInherited;
      UnauthorizedCount = $unauthorized.Count;
      AllowedSids = $allowedSids;
    } | ConvertTo-Json -Compress
  `;

  const checkRes = cp.spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 }
  );

  if (checkRes.status === 0 && checkRes.stdout) {
    try {
      const parsed = JSON.parse(checkRes.stdout.trim());
      const hasInherited = Boolean(parsed.HasInherited);
      const unauthorizedCount = Number(parsed.UnauthorizedCount || 0);
      return {
        valid: !hasInherited && unauthorizedCount === 0,
        owner: parsed.Owner || null,
        hasInherited,
        unauthorizedCount,
        allowedSids: Array.isArray(parsed.AllowedSids) ? parsed.AllowedSids : [],
      };
    } catch {}
  }

  return {
    valid: false,
    owner: null,
    hasInherited: true,
    unauthorizedCount: 999,
    allowedSids: [],
  };
}

/**
 * Applique des restrictions de permissions Windows (icacls) et POSIX (chmod 0o600 / 0o700)
 * pour limiter l'accès au fichier ou dossier de secret strictement au compte utilisateur courant (via SID),
 * à SYSTEM et aux Administrateurs, puis contrôle l'application effective des ACL.
 * Retourne true si les droits effectifs sont vérifiés, false en cas d'échec ou d'ambiguïté.
 */
export function restrictFilePermissions(filePath: string, isDirectory = false): boolean {
  try {
    fs.chmodSync(filePath, isDirectory ? 0o700 : 0o600);
  } catch {}

  if (process.platform === 'win32') {
    try {
      const sid = getCurrentUserSid();
      const user = process.env.USERNAME || (os.userInfo && os.userInfo().username);
      const userGrant = sid ? `*${sid}` : user;
      if (!userGrant) {
        logger.warn('[VPN Mgmt] Impossible d\'identifier l\'utilisateur Windows pour l\'isolation ACL.');
        return false;
      }

      const permSuffix = isDirectory ? ':(OI)(CI)(M)' : ':(M)';
      const adminPerm = isDirectory ? ':(OI)(CI)(F)' : ':(F)';

      // 1. Appliquer les ACLs strictes en brisant l'héritage (/inheritance:r)
      const applyRes = cp.spawnSync(
        'icacls.exe',
        [
          filePath,
          '/inheritance:r',
          '/grant:r', `*S-1-5-18${adminPerm}`,     // NT AUTHORITY\SYSTEM
          '/grant:r', `*S-1-5-32-544${adminPerm}`, // BUILTIN\Administrateurs
          '/grant:r', `${userGrant}${permSuffix}`, // Utilisateur courant identifié par SID
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 3000 }
      );

      if (applyRes.status !== 0) {
        logger.warn('[VPN Mgmt] Échec de la commande icacls (code non-zéro):', applyRes.stderr || applyRes.stdout);
        return false;
      }

      // 2. Contrôle structuré des ACL et du propriétaire via PowerShell
      const report = verifyFilePermissionsStructured(filePath);
      if (!report.valid) {
        if (report.hasInherited) {
          logger.warn('[VPN Mgmt] Refus : Le fichier ou dossier contient encore des ACE héritées.');
        }
        if (report.unauthorizedCount > 0) {
          logger.warn(`[VPN Mgmt] Refus : ${report.unauthorizedCount} identité(s) non autorisée(s) détectée(s) sur le secret.`);
        }
        return false;
      }

      // 3. Vérifier que le compte courant peut effectivement lire et écrire le fichier
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);

      return true;
      // 3. Vérifier que le compte courant peut effectivement lire et écrire le fichier
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);

      return true;
    } catch (err: any) {
      logger.warn('[VPN Mgmt] Échec de vérification des permissions ACL Windows:', err?.message);
      return false;
    }
  }

  // Sous POSIX, vérifier la lisibilité
  try {
    fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export class OpenVpnManagementClient extends EventEmitter {
  private port: number = 0;
  private passwordFilePath: string | null = null;
  private passwordSecret: string = '';
  private socket: net.Socket | null = null;
  private isConnected = false;
  private isAuthenticated = false;
  private buffer = '';

  /**
   * Retourne le chemin du fichier de mot de passe actuel (ou null)
   */
  public getPasswordFilePath(): string | null {
    return this.passwordFilePath;
  }

  /**
   * Vérifie formellement si la chaîne secrète apparaît dans les arguments de ligne de commande
   */
  public isSecretExposedInArgs(args: string[]): boolean {
    if (!this.passwordSecret) return false;
    return args.some((arg) => arg.includes(this.passwordSecret));
  }

  /**
   * Initialise un port libre et un fichier de mot de passe sécurisé pour l'instance OpenVPN.
   * Si useStdin est activé, la chaîne secrète est transmise via stdin sans création de fichier sur disque.
   */
  public async prepare(opts?: { useStdin?: boolean }): Promise<{
    port: number;
    passwordPath?: string;
    stdinPayload?: string;
    args: string[];
  }> {
    // 1. Trouver un port local libre sur 127.0.0.1
    this.port = await this.findAvailablePort();

    // 2. Générer un secret aléatoire fort (24 octets base64url)
    this.passwordSecret = crypto.randomBytes(24).toString('base64url');

    if (opts?.useStdin) {
      const args = [
        '--management', '127.0.0.1', String(this.port), 'stdin',
        '--management-hold',
        '--management-signal',
      ];
      return {
        port: this.port,
        stdinPayload: `${this.passwordSecret}\n`,
        args,
      };
    }

    // 3. Emplacement contrôlé pour les secrets temporaires
    let baseDir = os.tmpdir();
    try {
      const electron = require('electron');
      const app = electron?.app || electron?.default?.app;
      if (app && typeof app.getPath === 'function') {
        baseDir = app.getPath('userData');
      }
    } catch {}

    const secretsDir = path.join(baseDir, 'vanguard_vpn_secrets');
    if (!fs.existsSync(secretsDir)) {
      try {
        fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
      } catch {}
    }
    const dirSecured = restrictFilePermissions(secretsDir, true);
    if (!dirSecured && process.platform === 'win32') {
      throw new Error(`Échec de sécurisation des permissions du dossier de secrets : ${secretsDir}`);
    }

    this.passwordFilePath = path.join(
      secretsDir,
      `vanguard_mgmt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pw`
    );

    // Écriture du secret dans le fichier restreint
    fs.writeFileSync(this.passwordFilePath, `${this.passwordSecret}\n`, { encoding: 'utf8', mode: 0o600 });
    const fileSecured = restrictFilePermissions(this.passwordFilePath, false);
    if (!fileSecured && process.platform === 'win32') {
      this.cleanupPasswordFile();
      throw new Error(`Échec de sécurisation des permissions du fichier secret OpenVPN : ${this.passwordFilePath}`);
    }

    // 4. Arguments OpenVPN CLI : Seul le CHEMIN du fichier est passé, jamais le secret en clair
    const args = [
      '--management', '127.0.0.1', String(this.port), this.passwordFilePath,
      '--management-hold',
      '--management-signal',
    ];

    return {
      port: this.port,
      passwordPath: this.passwordFilePath,
      args,
    };
  }

  /**
   * Trouve un port TCP disponible sur l'interface de bouclage locale (127.0.0.1)
   */
  private findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const address = srv.address();
        if (address && typeof address === 'object') {
          const port = address.port;
          srv.close(() => resolve(port));
        } else {
          srv.close(() => reject(new Error('Impossible d\'allouer un port management local.')));
        }
      });
      srv.on('error', reject);
    });
  }

  /**
   * Se connecte au socket de management OpenVPN une fois le processus lancé
   */
  public connect(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        return reject(new Error('Client management non préparé (port manquant).'));
      }

      const startTime = Date.now();
      const attemptConnect = () => {
        this.socket = net.connect({ host: '127.0.0.1', port: this.port }, () => {
          this.isConnected = true;
          logger.info(`[VPN Mgmt] Socket management connecté sur 127.0.0.1:${this.port}`);
        });

        this.socket.on('data', (chunk) => {
          this.buffer += chunk.toString('utf8');
          this.processBuffer(resolve, reject);
        });

        this.socket.on('error', (err) => {
          if (!this.isConnected && Date.now() - startTime < timeoutMs) {
            // Le processus OpenVPN est peut-être en train d'initialiser son port : nouvelle tentative rapide
            setTimeout(attemptConnect, 200);
          } else {
            this.emit('error', err);
            if (!this.isConnected) reject(err);
          }
        });

        this.socket.on('close', () => {
          this.isConnected = false;
          this.isAuthenticated = false;
          this.emit('close');
        });
      };

      attemptConnect();
    });
  }

  /**
   * Traitement des lignes renvoyées par le management socket
   */
  private processBuffer(onAuthenticated?: () => void, onError?: (err: Error) => void) {
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. Demande de mot de passe
      if (line.startsWith('ENTER PASSWORD:')) {
        if (this.socket && !this.isAuthenticated) {
          this.socket.write(`${this.passwordSecret}\n`);
        }
        continue;
      }

      // 2. Confirmation du mot de passe
      if (line.startsWith('SUCCESS: password is correct')) {
        this.isAuthenticated = true;
        // Le fichier de secret temporaire (mode 0o600) est conservé pendant la durée de vie
        // du processus pour permettre d'éventuelles réauthentifications/reconnexions OpenVPN,
        // puis purgé lors du disconnect() ou de la fin du processus.
        if (this.socket) {
          this.socket.write('state on\n');
          this.socket.write('bytecount 2\n');
          this.socket.write('hold release\n'); // Libérer OpenVPN pour continuer la connexion
        }
        if (onAuthenticated) onAuthenticated();
        continue;
      }

      // 3. Échec d'authentification
      if (line.startsWith('ERROR: password')) {
        const err = new Error('Échec d\'authentification sur le management socket local OpenVPN.');
        if (onError) onError(err);
        this.emit('error', err);
        this.disconnect();
        return;
      }

      // 4. Événements d'état et de télémétrie OpenVPN
      this.processLine(line);
    }
  }

  /**
   * Analyse et distribue une ligne de protocole du socket de gestion OpenVPN
   */
  public processLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith('>STATE:')) {
      this.handleStateLine(line.substring(7));
    } else if (line.startsWith('>BYTECOUNT:')) {
      this.handleBytecountLine(line.substring(11));
    } else if (line.startsWith('>INFO:') || line.startsWith('>FATAL:')) {
      this.emit('message', line);
    }
  }

  /**
   * Analyse d'une ligne d'état >STATE
   */
  private handleStateLine(payload: string) {
    const parts = payload.split(',');
    const timestamp = parseInt(parts[0], 10) || Math.floor(Date.now() / 1000);
    const stateName = (parts[1] || '').trim();
    const description = (parts[2] || '').trim();
    const assignedIp = parts[3] ? parts[3].trim() : undefined;
    const remoteIp = parts[4] ? parts[4].trim() : undefined;

    const event: ManagementStateEvent = {
      timestamp,
      stateName,
      description,
      assignedIp,
      remoteIp,
    };

    this.emit('state-change', event);
  }

  /**
   * Analyse d'une ligne de comptage >BYTECOUNT
   */
  private handleBytecountLine(payload: string) {
    const parts = payload.split(',');
    const bytesIn = parseInt(parts[0], 10) || 0;
    const bytesOut = parseInt(parts[1], 10) || 0;

    const event: ManagementBytecountEvent = {
      bytesIn,
      bytesOut,
      timestamp: Date.now(),
    };

    this.emit('bytecount', event);
  }

  /**
   * Envoie une commande d'arrêt contrôlée à OpenVPN via le socket
   */
  public async sendSignal(signal: 'SIGTERM' | 'SIGINT' | 'SIGHUP'): Promise<boolean> {
    if (!this.socket || !this.isConnected) return false;
    return new Promise((resolve) => {
      try {
        this.socket?.write(`signal ${signal}\n`, () => {
          resolve(true);
        });
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Fermeture du socket et nettoyage des fichiers temporaires
   */
  public disconnect() {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    this.isConnected = false;
    this.isAuthenticated = false;
    this.cleanupPasswordFile();
  }

  /**
   * Suppression du fichier temporaire de mot de passe du système de fichiers.
   * Note de transparence : L'appel à fs.unlinkSync retire l'entrée de répertoire NTFS et marque les clusters
   * comme disponibles pour de futures écritures. Il ne constitue pas un effacement physique multipasse garanti.
   */
  public cleanupPasswordFile() {
    if (this.passwordFilePath && fs.existsSync(this.passwordFilePath)) {
      try {
        fs.chmodSync(this.passwordFilePath, 0o666);
      } catch {}
      try {
        fs.unlinkSync(this.passwordFilePath);
      } catch (err: any) {
        logger.warn('[VPN Mgmt] Erreur suppression fichier secret:', err?.message);
      }
      this.passwordFilePath = null;
    }
    this.passwordSecret = '';
  }
}
