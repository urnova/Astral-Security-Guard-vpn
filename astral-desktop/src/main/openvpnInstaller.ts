/**
 * OpenVPN Guided Installer Module
 * 
 * Orchestration sécurisée de la préparation, vérification et installation
 * du paquet officiel OpenVPN Community x64 sans exécution silencieuse.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import https from 'node:https';
import os from 'node:os';
import { logger } from './logger.ts';

export interface OfficialMsiPackageInfo {
  version: string;
  build: string;
  architecture: string;
  filename: string;
  downloadUrl: string;
  mirrorUrl: string;
  expectedSignerSubject: string;
  releaseNotesUrl: string;
  securityNotice: string;
}

export const OFFICIAL_OPENVPN_PACKAGE: OfficialMsiPackageInfo = {
  version: '2.6.23',
  build: 'I002',
  architecture: 'amd64',
  filename: 'OpenVPN-2.6.23-I002-amd64.msi',
  downloadUrl: 'https://build.openvpn.net/downloads/releases/OpenVPN-2.6.23-I002-amd64.msi',
  mirrorUrl: 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.6.23-I002-amd64.msi',
  expectedSignerSubject: 'OpenVPN, Inc.',
  releaseNotesUrl: 'https://github.com/OpenVPN/openvpn/releases',
  securityNotice: 'Paquet officiel de maintenance OpenVPN 2.6. Intégrité et authenticité garanties par signature numérique Authenticode (OpenVPN, Inc.). L\'empreinte SHA-256 est calculée localement à des fins d\'audit (aucun fichier .sha256 séparé n\'est publié en amont). Les versions exactes des pilotes (wintun, ovpn-dco) et bibliothèques (OpenSSL) dépendent des composants packagés dans le MSI.',
};

export interface ComponentDetectionResult {
  binaryInstalled: boolean;
  binaryPath: string | null;
  driverInstalled: boolean;
  serviceInstalled: boolean;
  serviceRunning: boolean;
  userInAuthorizedGroup: boolean;
  authorizedGroupName: string;
  details: string[];
}

export interface AuthenticodeVerificationResult {
  valid: boolean;
  status: string;
  signerSubject: string | null;
  publisherMatched: boolean;
  reason?: string;
}

export interface MsiExecutionResult {
  success: boolean;
  exitCode: number;
  rebootRequired: boolean;
  cancelledByUser: boolean;
  message: string;
}

export class OpenVpnInstaller {
  private customSignatureVerifier: ((filePath: string) => Promise<AuthenticodeVerificationResult>) | null = null;
  private customMsiExecutor: ((filePath: string) => Promise<MsiExecutionResult>) | null = null;
  private customDownloader: ((url: string, dest: string) => Promise<boolean>) | null = null;

  public setTestHooks(hooks: {
    signatureVerifier?: (filePath: string) => Promise<AuthenticodeVerificationResult>;
    msiExecutor?: (filePath: string) => Promise<MsiExecutionResult>;
    downloader?: (url: string, dest: string) => Promise<boolean>;
  } | null) {
    if (!hooks) {
      this.customSignatureVerifier = null;
      this.customMsiExecutor = null;
      this.customDownloader = null;
    } else {
      if (hooks.signatureVerifier) this.customSignatureVerifier = hooks.signatureVerifier;
      if (hooks.msiExecutor) this.customMsiExecutor = hooks.msiExecutor;
      if (hooks.downloader) this.customDownloader = hooks.downloader;
    }
  }

  /**
   * Détection exhaustive des composants nécessaires à Vanguard
   */
  public async detectComponents(): Promise<ComponentDetectionResult> {
    const details: string[] = [];

    // 1. Détection du binaire OpenVPN
    let binaryPath: string | null = null;
    const candidates = [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
      'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
      'C:\\OpenVPN\\bin\\openvpn.exe',
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          binaryPath = p;
          break;
        }
      } catch {}
    }

    const binaryInstalled = Boolean(binaryPath);
    details.push(binaryInstalled ? `Binaire OpenVPN : Présent (${binaryPath})` : 'Binaire OpenVPN : Manquant');

    // 2. Détection du pilote Wintun
    let driverInstalled = false;
    if (binaryPath) {
      const binDir = path.dirname(binaryPath);
      driverInstalled =
        fs.existsSync(path.join(binDir, 'wintun.dll')) ||
        fs.existsSync('C:\\Windows\\System32\\wintun.dll') ||
        fs.existsSync('C:\\Windows\\System32\\drivers\\wintun.sys');
    }
    details.push(driverInstalled ? 'Pilote Wintun : Détecté' : 'Pilote Wintun : Non trouvé');

    // 3. Détection du Service Interactif
    let serviceInstalled = false;
    let serviceRunning = false;
    if (process.platform === 'win32') {
      try {
        const scRes = cp.spawnSync('sc.exe', ['query', 'OpenVPNServiceInteractive'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 2500,
        });
        if (scRes.stdout) {
          const out = scRes.stdout.toUpperCase();
          serviceInstalled = !out.includes('1060') && !out.includes('DOES NOT EXIST');
          serviceRunning = out.includes('STATE') && out.includes('RUNNING');
        }
      } catch {}
    }
    details.push(
      serviceInstalled
        ? `Service interactif : ${serviceRunning ? 'Actif (RUNNING)' : 'Installé mais arrêté'}`
        : 'Service interactif : Absent'
    );

    // 4. Détection du groupe administrateur OpenVPN et appartenance utilisateur
    let authorizedGroupName = 'OpenVPN Administrators';
    let userInAuthorizedGroup = false;

    if (process.platform === 'win32') {
      try {
        const regRes = cp.spawnSync(
          'reg.exe',
          ['query', 'HKLM\\Software\\OpenVPN', '/v', 'ovpn_admin_group'],
          { encoding: 'utf8', windowsHide: true, timeout: 2000 }
        );
        if (regRes.stdout) {
          const m = regRes.stdout.match(/ovpn_admin_group\s+REG_SZ\s+(.+)/i);
          if (m) authorizedGroupName = m[1].trim();
        }

        const whoamiRes = cp.spawnSync('whoami.exe', ['/groups', '/fo', 'csv'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 2000,
        });
        if (whoamiRes.stdout) {
          const groups = whoamiRes.stdout;
          // S-1-5-32-544 (Administrateurs) ou nom du groupe configuré
          userInAuthorizedGroup =
            groups.includes('S-1-5-32-544') ||
            groups.toLowerCase().includes(authorizedGroupName.toLowerCase());
        }
      } catch {}
    }
    details.push(
      userInAuthorizedGroup
        ? `Droits d'accès : Compte autorisé (Administrateur ou membre de ${authorizedGroupName})`
        : `Droits d'accès : Compte non membre de ${authorizedGroupName}`
    );

    return {
      binaryInstalled,
      binaryPath,
      driverInstalled,
      serviceInstalled,
      serviceRunning,
      userInAuthorizedGroup,
      authorizedGroupName,
      details,
    };
  }

  /**
   * Calcule le hachage SHA-256 d'un fichier local
   */
  public async computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`Fichier introuvable pour hachage : ${filePath}`));
      }
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
      stream.on('error', reject);
    });
  }

  /**
   * Vérifie la signature Authenticode Windows d'un fichier MSI téléchargé
   */
  public async verifyAuthenticodeSignature(filePath: string): Promise<AuthenticodeVerificationResult> {
    if (this.customSignatureVerifier) {
      return await this.customSignatureVerifier(filePath);
    }

    if (process.platform !== 'win32') {
      return {
        valid: false,
        status: 'UnsupportedPlatform',
        signerSubject: null,
        publisherMatched: false,
        reason: 'La vérification Authenticode requiert un système Windows.',
      };
    }

    const escaped = filePath.replace(/'/g, "''");
    const script = `
      $sig = Get-AuthenticodeSignature -LiteralPath '${escaped}'
      [PSCustomObject]@{
        Status = $sig.Status.ToString()
        Subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
      } | ConvertTo-Json -Compress
    `;

    return new Promise((resolve) => {
      cp.exec(
        `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script.replace(/\r?\n/g, ' ')}"`,
        { timeout: 8000, windowsHide: true },
        (err, stdout) => {
          if (err || !stdout) {
            return resolve({
              valid: false,
              status: 'ExecutionError',
              signerSubject: null,
              publisherMatched: false,
              reason: 'Impossible d\'exécuter la vérification de signature Authenticode PowerShell.',
            });
          }

          try {
            const data = JSON.parse(stdout.trim());
            const isValid = data.Status === 'Valid';
            const subject = data.Subject || '';
            const publisherMatched =
              subject.includes(OFFICIAL_OPENVPN_PACKAGE.expectedSignerSubject) ||
              subject.includes('OpenVPN Inc.');

            if (!isValid) {
              return resolve({
                valid: false,
                status: data.Status,
                signerSubject: subject || null,
                publisherMatched: false,
                reason: `La signature Authenticode du fichier n'est pas valide (Statut : ${data.Status}).`,
              });
            }

            if (!publisherMatched) {
              return resolve({
                valid: false,
                status: data.Status,
                signerSubject: subject || null,
                publisherMatched: false,
                reason: `L'éditeur du certificat (${subject}) ne correspond pas à l'éditeur officiel attendu (${OFFICIAL_OPENVPN_PACKAGE.expectedSignerSubject}).`,
              });
            }

            resolve({
              valid: true,
              status: 'Valid',
              signerSubject: subject,
              publisherMatched: true,
            });
          } catch (parseErr: any) {
            resolve({
              valid: false,
              status: 'ParseError',
              signerSubject: null,
              publisherMatched: false,
              reason: `Erreur d'analyse de la réponse Authenticode : ${parseErr.message}`,
            });
          }
        }
      );
    });
  }

  /**
   * Télécharge le paquet MSI officiel vers un dossier temporaire isolé
   */
  public async downloadPackage(
    url: string = OFFICIAL_OPENVPN_PACKAGE.downloadUrl,
    destinationPath?: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (this.customDownloader) {
      const dest = destinationPath || path.join(os.tmpdir(), OFFICIAL_OPENVPN_PACKAGE.filename);
      const ok = await this.customDownloader(url, dest);
      return ok ? { success: true, filePath: dest } : { success: false, error: 'Échec téléchargement bouchonné' };
    }

    const dest = destinationPath || path.join(os.tmpdir(), `vanguard_openvpn_${Date.now()}_amd64.msi`);

    return new Promise((resolve) => {
      const file = fs.createWriteStream(dest);

      const request = https.get(url, { timeout: 30000 }, (response) => {
        // Suivre les redirections 301 / 302
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            try { fs.unlinkSync(dest); } catch {}
            return resolve(this.downloadPackage(redirectUrl, dest));
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch {}
          return resolve({
            success: false,
            error: `Le serveur a répondu avec le code HTTP ${response.statusCode}`,
          });
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve({ success: true, filePath: dest }));
        });
      });

      request.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        resolve({ success: false, error: `Erreur réseau pendant le téléchargement : ${err.message}` });
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        resolve({ success: false, error: 'Délai d\'attente de téléchargement dépassé (30s).' });
      });
    });
  }

  /**
   * Retourne le chemin officiel et maîtrisé du fichier d'installation
   * situé dans le répertoire contrôlé de Vanguard sous userData.
   */
  public getControlledInstallerPath(): string {
    let baseDir = os.tmpdir();
    try {
      const electron = require('electron');
      const app = electron?.app || electron?.default?.app;
      if (app && typeof app.getPath === 'function') {
        baseDir = app.getPath('userData');
      }
    } catch {}
    return path.join(baseDir, 'vanguard_installers', OFFICIAL_OPENVPN_PACKAGE.filename);
  }

  /**
   * Exécute l'installateur MSI avec msiexec.exe de manière contrôlée (/norestart /qb).
   * Vérifie au préalable l'intégrité Authenticode de l'exécutable pour interdire toute exécution
   * de binaire non signé ou falsifié.
   */
  public async executeInstaller(msiPath?: string): Promise<MsiExecutionResult> {
    const targetPath = msiPath || this.getControlledInstallerPath();

    if (this.customMsiExecutor) {
      return await this.customMsiExecutor(targetPath);
    }

    if (process.platform !== 'win32') {
      return {
        success: false,
        exitCode: -1,
        rebootRequired: false,
        cancelledByUser: false,
        message: 'msiexec est uniquement disponible sous Windows.',
      };
    }

    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        exitCode: -1,
        rebootRequired: false,
        cancelledByUser: false,
        message: `Fichier d'installation introuvable : ${targetPath}`,
      };
    }

    // Contrôle Authenticode obligatoire avant tout lancement
    const sigCheck = await this.verifyAuthenticodeSignature(targetPath);
    if (!sigCheck.valid || !sigCheck.publisherMatched) {
      return {
        success: false,
        exitCode: -1,
        rebootRequired: false,
        cancelledByUser: false,
        message: `Exécution refusée : signature Authenticode non valide ou éditeur non reconnu (${sigCheck.signerSubject || 'inconnu'}).`,
      };
    }

    return new Promise((resolve) => {
      // /i install, /qb interface basique avec barre de progression, /norestart empêche tout reboot sauvage
      const args = ['/i', targetPath, '/qb', '/norestart'];

      const proc = cp.spawn('msiexec.exe', args, {
        windowsHide: false, // Afficher l'interface de progression MSI à l'utilisateur
        stdio: 'ignore',
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          exitCode: -1,
          rebootRequired: false,
          cancelledByUser: false,
          message: `Impossible de lancer msiexec.exe : ${err.message}`,
        });
      });

      proc.on('close', (code) => {
        const exitCode = code ?? -1;

        if (exitCode === 0) {
          resolve({
            success: true,
            exitCode: 0,
            rebootRequired: false,
            cancelledByUser: false,
            message: 'Installation terminée avec succès.',
          });
        } else if (exitCode === 3010) {
          resolve({
            success: true,
            exitCode: 3010,
            rebootRequired: true,
            cancelledByUser: false,
            message: 'Installation terminée avec succès. Un redémarrage du système est nécessaire pour charger le pilote réseau.',
          });
        } else if (exitCode === 1602) {
          resolve({
            success: false,
            exitCode: 1602,
            rebootRequired: false,
            cancelledByUser: true,
            message: 'Installation annulée par l\'utilisateur (refus de l\'élévation UAC ou fermeture).',
          });
        } else {
          resolve({
            success: false,
            exitCode,
            rebootRequired: false,
            cancelledByUser: false,
            message: `L'installateur MSI s'est terminé avec le code d'erreur ${exitCode}.`,
          });
        }
      });
    });
  }
}

export const openVpnInstaller = new OpenVpnInstaller();

