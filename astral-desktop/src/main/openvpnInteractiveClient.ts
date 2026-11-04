/**
 * OpenVPN Interactive Service Client (iservice)
 * 
 * Implémente le protocole officiel de communication avec le service interactif Windows
 * OpenVPN (OpenVPNServiceInteractive / openvpnserv.exe) sur le tube nommé \\.\pipe\openvpn\service.
 * 
 * Permet aux applications exécutées en utilisateur standard de démarrer openvpn.exe
 * avec l'assistance des privilèges réseau nécessaires (SeNetworkConfigurationPrivilege)
 * sans exécuter toute l'application Electron en administrateur.
 */

import net from 'node:net';
import cp from 'node:child_process';
import { logger } from './logger.ts';

export const OPENVPN_INTERACTIVE_PIPE = '\\\\.\\pipe\\openvpn\\service';
export const MAX_STARTUP_DATA_BYTES = 8192; // 4096 WCHARs selon interactive.c

export type ServiceErrorType =
  | 'service_missing'
  | 'service_stopped'
  | 'pipe_access_denied'
  | 'options_or_config_rejected'
  | 'insufficient_rights'
  | 'timeout'
  | 'invalid_response'
  | 'indeterminate_cancellation'
  | 'unknown';

export interface InteractiveServiceResponse {
  success: boolean;
  pid?: number;
  errorType?: ServiceErrorType;
  errorCode?: number;
  failingFunction?: string;
  errorMessage?: string;
}

export interface InteractiveConfigSettings {
  adminGroup: string;
  configDir: string;
}

/**
 * Construit la charge binaire STARTUP_DATA selon la spécification de interactive.c :
 * [directory\0][options\0][std_input\0] encodés en UTF-16LE.
 */
export function buildStartupPayload(directory: string, options: string, stdInput: string = ''): Buffer {
  if (directory.includes('\0')) {
    throw new Error('Le répertoire ne doit pas contenir de caractère nul.');
  }
  if (options.includes('\0')) {
    throw new Error('Les options ne doivent pas contenir de caractère nul.');
  }
  if (stdInput.includes('\0')) {
    throw new Error('Le flux std_input ne doit pas contenir de caractère nul.');
  }

  const dirBuf = Buffer.from(directory + '\0', 'utf16le');
  const optBuf = Buffer.from(options + '\0', 'utf16le');
  const inBuf = Buffer.from(stdInput + '\0', 'utf16le');

  const total = Buffer.concat([dirBuf, optBuf, inBuf]);
  if (total.length > MAX_STARTUP_DATA_BYTES) {
    throw new Error(
      `Charge utile STARTUP_DATA trop volumineuse (${total.length} octets > maximum ${MAX_STARTUP_DATA_BYTES} octets autorisés).`
    );
  }

  return total;
}

/**
 * Analyseur de flux de réponses pour le tube nommé OpenVPN Interactive Service.
 * Gère la fragmentation ou l'agrégation des paquets réseau/tube.
 */
export class InteractiveResponseParser {
  private buffer: Buffer = Buffer.alloc(0);

  public append(chunk: Buffer): { done: boolean; result?: InteractiveServiceResponse } {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Une réponse valide est encodée en UTF-16LE et contient au moins 3 lignes
    // Format succès : 0x00000000\r\n0x00001A2B\r\nProcess ID\r\n
    // Format erreur : 0x00000005\r\nValidateOptions\r\nMessage d'erreur...\r\n
    const text = this.buffer.toString('utf16le');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length >= 3) {
      const codeStr = lines[0];
      const code = parseInt(codeStr, 16);

      if (isNaN(code)) {
        return {
          done: true,
          result: {
            success: false,
            errorType: 'invalid_response',
            errorMessage: `Code d'état non reconnu dans la réponse du service : ${codeStr}`,
          },
        };
      }

      if (code === 0) {
        // Succès : line 1 est le PID en hexadécimal
        const pid = parseInt(lines[1], 16);
        return {
          done: true,
          result: {
            success: true,
            pid: isNaN(pid) ? undefined : pid,
          },
        };
      } else {
        // Erreur : line 1 est la fonction qui a échoué, line 2+ le message
        const failingFunction = lines[1];
        const errorMessage = lines.slice(2).join(' ');

        let errorType: ServiceErrorType = 'unknown';
        if (code === 5 || errorMessage.toLowerCase().includes('admin approval') || errorMessage.toLowerCase().includes('group')) {
          errorType = 'insufficient_rights';
        } else if (failingFunction === 'ValidateOptions' || failingFunction === 'CheckOption') {
          errorType = 'options_or_config_rejected';
        } else {
          errorType = 'unknown';
        }

        return {
          done: true,
          result: {
            success: false,
            errorCode: code,
            errorType,
            failingFunction,
            errorMessage,
          },
        };
      }
    }

    return { done: false };
  }
}

export class OpenVpnInteractiveClient {
  private customConnector: ((pipePath: string) => net.Socket) | null = null;
  private customServiceChecker: (() => Promise<{ installed: boolean; running: boolean }>) | null = null;
  private customRegistryReader: (() => Promise<InteractiveConfigSettings>) | null = null;

  private currentSocket: net.Socket | null = null;
  private pendingCancellation = false;

  /**
   * Permet d'injecter des bouchons de test pour simuler le tube nommé sans dépendance OS
   */
  public setTestHooks(hooks: {
    connector?: (pipePath: string) => net.Socket;
    serviceChecker?: () => Promise<{ installed: boolean; running: boolean }>;
    registryReader?: () => Promise<InteractiveConfigSettings>;
  } | null) {
    if (!hooks) {
      this.customConnector = null;
      this.customServiceChecker = null;
      this.customRegistryReader = null;
    } else {
      if (hooks.connector) this.customConnector = hooks.connector;
      if (hooks.serviceChecker) this.customServiceChecker = hooks.serviceChecker;
      if (hooks.registryReader) this.customRegistryReader = hooks.registryReader;
    }
  }

  /**
   * Interroge l'état du service Windows OpenVPNServiceInteractive
   */
  public async checkServiceStatus(): Promise<{ installed: boolean; running: boolean }> {
    if (this.customServiceChecker) {
      return await this.customServiceChecker();
    }

    if (process.platform !== 'win32') {
      return { installed: false, running: false };
    }

    return new Promise((resolve) => {
      cp.exec('sc.exe query OpenVPNServiceInteractive', { timeout: 3000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({ installed: false, running: false });
        }
        const text = stdout.toUpperCase();
        const installed = !text.includes('1060') && !text.includes('DOES NOT EXIST');
        const running = text.includes('STATE') && text.includes('RUNNING');
        resolve({ installed, running });
      });
    });
  }

  /**
   * Lit la configuration officielle enregistrée dans le Registre Windows
   * pour connaître le groupe administrateur requis (ovpn_admin_group) et le config_dir.
   */
  public async getRegistrySettings(): Promise<InteractiveConfigSettings> {
    if (this.customRegistryReader) {
      return await this.customRegistryReader();
    }

    const defaultSettings: InteractiveConfigSettings = {
      adminGroup: 'OpenVPN Administrators',
      configDir: 'C:\\Program Files\\OpenVPN\\config',
    };

    if (process.platform !== 'win32') {
      return defaultSettings;
    }

    return new Promise((resolve) => {
      cp.exec(
        'reg query "HKLM\\Software\\OpenVPN" /v ovpn_admin_group',
        { timeout: 3000, windowsHide: true },
        (_err1, stdout1) => {
          if (stdout1) {
            const match = stdout1.match(/ovpn_admin_group\s+REG_SZ\s+(.+)/i);
            if (match) defaultSettings.adminGroup = match[1].trim();
          }

          cp.exec(
            'reg query "HKLM\\Software\\OpenVPN" /v config_dir',
            { timeout: 3000, windowsHide: true },
            (_err2, stdout2) => {
              if (stdout2) {
                const match = stdout2.match(/config_dir\s+REG_SZ\s+(.+)/i);
                if (match) defaultSettings.configDir = match[1].trim();
              }
              resolve(defaultSettings);
            }
          );
        }
      );
    });
  }

  /**
   * Lance un processus OpenVPN via le service interactif
   */
  public async startProcess(params: {
    directory: string;
    options: string;
    stdInput?: string;
    timeoutMs?: number;
  }): Promise<InteractiveServiceResponse> {
    if (this.pendingCancellation) {
      return {
        success: false,
        errorType: 'unknown',
        errorMessage: 'Connexion annulée par l\'utilisateur avant l\'envoi au service.',
      };
    }

    // 1. Contrôle préalable du statut du service Windows
    const srvStatus = await this.checkServiceStatus();
    if (process.platform === 'win32' && !this.customConnector) {
      if (!srvStatus.installed) {
        return {
          success: false,
          errorType: 'service_missing',
          errorMessage: 'Le service Windows OpenVPNServiceInteractive est absent du système.',
        };
      }
      if (!srvStatus.running) {
        return {
          success: false,
          errorType: 'service_stopped',
          errorMessage: 'Le service Windows OpenVPNServiceInteractive est installé mais n\'est pas en cours d\'exécution.',
        };
      }
    }

    // 2. Construction de la charge utile STARTUP_DATA
    let payload: Buffer;
    try {
      payload = buildStartupPayload(params.directory, params.options, params.stdInput || '');
    } catch (payloadErr: any) {
      return {
        success: false,
        errorType: 'options_or_config_rejected',
        errorMessage: payloadErr.message,
      };
    }

    const timeoutMs = params.timeoutMs ?? 10000;

    return new Promise((resolve) => {
      let resolved = false;
      const parser = new InteractiveResponseParser();

      const safeResolve = (resp: InteractiveServiceResponse) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.currentSocket = null;
          resolve(resp);
        }
      };

      const timer = setTimeout(() => {
        const sock = this.currentSocket;
        safeResolve({
          success: false,
          errorType: 'timeout',
          errorMessage: `Délai d'attente dépassé (${timeoutMs} ms) pour la réponse du service interactif OpenVPN.`,
        });
        if (sock) {
          try {
            sock.destroy();
          } catch {}
        }
      }, timeoutMs);

      // Si l'utilisateur a annulé avant l'ouverture du tube
      if (this.pendingCancellation) {
        return safeResolve({
          success: false,
          errorType: 'unknown',
          errorMessage: 'Connexion annulée par l\'utilisateur avant l\'envoi au service.',
        });
      }

      // 3. Connexion au tube nommé
      let socket: net.Socket;
      try {
        if (this.customConnector) {
          socket = this.customConnector(OPENVPN_INTERACTIVE_PIPE);
        } else {
          socket = net.connect(OPENVPN_INTERACTIVE_PIPE);
        }
      } catch (err: any) {
        return safeResolve({
          success: false,
          errorType: 'pipe_access_denied',
          errorMessage: `Impossible d'initier la connexion au tube nommé : ${err.message}`,
        });
      }

      this.currentSocket = socket;

      socket.on('connect', () => {
        if (this.pendingCancellation) {
          socket.destroy();
          return safeResolve({
            success: false,
            errorType: 'unknown',
            errorMessage: 'Connexion annulée par l\'utilisateur immédiatement après l\'ouverture du tube.',
          });
        }

        // Écriture de la charge utile binaire UTF-16LE
        try {
          socket.write(payload);
        } catch (writeErr: any) {
          socket.destroy();
          safeResolve({
            success: false,
            errorType: 'unknown',
            errorMessage: `Erreur d'écriture sur le tube nommé : ${writeErr.message}`,
          });
        }
      });

      socket.on('data', (chunk: Buffer) => {
        const { done, result } = parser.append(chunk);
        if (done && result) {
          // Si une annulation a été demandée pendant l'attente de réponse
          if (this.pendingCancellation) {
            // Si le service a quand même démarré le processus, le tuer explicitement
            if (result.success && result.pid) {
              logger.warn(`[VPN iservice] Annulation demandée : arrêt immédiat du PID créé ${result.pid}`);
              try {
                process.kill(result.pid, 'SIGTERM');
              } catch {}
              safeResolve({
                success: false,
                pid: result.pid,
                errorType: 'unknown',
                errorMessage: `Connexion annulée : processus PID ${result.pid} créé par le service et arrêté avec succès.`,
              });
            } else {
              safeResolve({
                success: false,
                errorType: 'unknown',
                errorMessage: 'Connexion annulée avant la création du processus.',
              });
            }
            if (this.currentSocket) {
              try { this.currentSocket.destroy(); } catch {}
              this.currentSocket = null;
            }
            return;
          }

          safeResolve(result);
          if (this.currentSocket) {
            try { this.currentSocket.destroy(); } catch {}
            this.currentSocket = null;
          }
        }
      });

      socket.on('error', (err: any) => {
        const msg = err.message || '';
        let errorType: ServiceErrorType = 'unknown';
        if (err.code === 'ENOENT' || msg.includes('ENOENT')) {
          errorType = srvStatus.installed ? 'service_stopped' : 'service_missing';
        } else if (err.code === 'EACCES' || err.code === 'EPERM' || msg.includes('EACCES')) {
          errorType = 'pipe_access_denied';
        }
        safeResolve({
          success: false,
          errorType,
          errorMessage: `Erreur de communication sur le tube nommé (${err.code || 'ERR'}): ${msg}`,
        });
      });

      socket.on('close', () => {
        if (!resolved) {
          if (this.pendingCancellation) {
            safeResolve({
              success: false,
              errorType: 'indeterminate_cancellation',
              errorMessage: 'Connexion annulée : le tube s\'est fermé sans confirmation de PID par le service. Sort du processus indéterminé (nettoyage non garanti).',
            });
            return;
          }
          safeResolve({
            success: false,
            errorType: 'invalid_response',
            errorMessage: 'Le tube nommé s\'est fermé avant d\'avoir transmis une réponse complète.',
          });
        }
      });
    });
  }

  /**
   * Déclenche une annulation contrôlée.
   * Si une requête a déjà été transmise sur le tube nommé et qu'un socket est ouvert,
   * active le drapeau d'annulation tout en maintenant le socket ouvert pendant une courte
   * fenêtre de grâce (max 1000ms) afin d'intercepter le PID éventuel retourné par le service
   * et le terminer immédiatement au lieu de laisser un processus orphelin.
   */
  public cancel() {
    this.pendingCancellation = true;
    if (this.currentSocket) {
      setTimeout(() => {
        if (this.currentSocket) {
          try {
            this.currentSocket.destroy();
          } catch {}
          this.currentSocket = null;
        }
      }, 1000);
    }
  }

  /**
   * Réinitialise l'état d'annulation pour une nouvelle tentative
   */
  public resetCancellation() {
    this.pendingCancellation = false;
  }
}

export const openvpnInteractiveClient = new OpenVpnInteractiveClient();
