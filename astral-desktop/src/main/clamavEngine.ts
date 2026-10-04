/**
 * ASTRAL VANGUARD v3.0 - MOTEUR CLAMAV SECOND AVIS FACULTATIF (PHASE 7 / LOT 1)
 *
 * Intégration découplée et facultative de ClamAV :
 * - Installation et activation uniquement sur consentement utilisateur
 * - Aucune dépendance liée : exécution CLI strictement isolée (clamscan.exe)
 * - Traitement honnête : si absent -> "Non installé — second avis facultatif"
 * - Respect des licences : notices GNU General Public License v2 (GPLv2)
 * - Timeout strict (15s par fichier) et isolation complète du Main Process
 */

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { logger } from './logger';

export interface ClamAvStatus {
  isInstalled: boolean;
  executablePath: string | null;
  version: string;
  databaseDate: string;
  status: 'actif' | 'Non installé — second avis facultatif' | 'erreur';
  licenseNotice: string;
}

export interface ClamAvScanResult {
  success: boolean;
  filePath: string;
  isClean: boolean;
  threatName?: string;
  durationMs: number;
  engineMessage: string;
}

class ClamAvEngine {
  private customBinaryPath: string | null = null;
  private cachedStatus: ClamAvStatus | null = null;
  private lastStatusCheck = 0;

  public setCustomPath(binaryPath: string) {
    this.customBinaryPath = binaryPath;
    this.cachedStatus = null;
  }

  /**
   * Localise l'exécutable clamscan.exe officiel s'il est présent
   */
  public findClamScan(): string | null {
    if (this.customBinaryPath && fs.existsSync(this.customBinaryPath)) {
      return this.customBinaryPath;
    }

    const candidatePaths = [
      'C:\\Program Files\\ClamAV\\clamscan.exe',
      'C:\\Program Files (x86)\\ClamAV\\clamscan.exe',
      'C:\\ProgramData\\ClamAV\\bin\\clamscan.exe',
      'C:\\ClamAV\\clamscan.exe',
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }

    return null;
  }

  /**
   * Vérifie le statut de disponibilité de ClamAV
   */
  public async getStatus(forceRefresh = false): Promise<ClamAvStatus> {
    const now = Date.now();
    if (!forceRefresh && this.cachedStatus && now - this.lastStatusCheck < 60000) {
      return this.cachedStatus;
    }

    const clamPath = this.findClamScan();
    const licenseNotice = 'ClamAV® est un logiciel libre sous licence GNU General Public License v2 (GPLv2). Découplé d\'Astral Vanguard.';

    if (!clamPath) {
      this.cachedStatus = {
        isInstalled: false,
        executablePath: null,
        version: 'Indisponible',
        databaseDate: 'Indisponible',
        status: 'Non installé — second avis facultatif',
        licenseNotice,
      };
      this.lastStatusCheck = now;
      return this.cachedStatus;
    }

    try {
      const versionOutput = await new Promise<string>((resolve, reject) => {
        cp.exec(`"${clamPath}" --version`, { timeout: 3000 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout ? stdout.trim() : '');
        });
      });

      this.cachedStatus = {
        isInstalled: true,
        executablePath: clamPath,
        version: versionOutput || 'ClamAV Officiel',
        databaseDate: 'Base locale active',
        status: 'actif',
        licenseNotice,
      };
      this.lastStatusCheck = now;
      return this.cachedStatus;
    } catch (err: any) {
      this.cachedStatus = {
        isInstalled: true,
        executablePath: clamPath,
        version: 'Erreur d\'interrogation',
        databaseDate: 'Inconnue',
        status: 'erreur',
        licenseNotice,
      };
      this.lastStatusCheck = now;
      return this.cachedStatus;
    }
  }

  /**
   * Analyse un fichier avec clamscan.exe en CLI isolé
   */
  public async scanFile(filePath: string): Promise<ClamAvScanResult> {
    const startTime = Date.now();
    const clamPath = this.findClamScan();

    if (!clamPath) {
      return {
        success: false,
        filePath,
        isClean: true,
        durationMs: 0,
        engineMessage: 'ClamAV non installé (second avis facultatif ignoré).',
      };
    }

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        filePath,
        isClean: true,
        durationMs: 0,
        engineMessage: 'Fichier cible introuvable.',
      };
    }

    return new Promise((resolve) => {
      // ClamAV codes retour :
      // 0 : Aucun virus trouvé (OK)
      // 1 : Virus(es) trouvé(s) (FOUND)
      // 2 : Erreur
      const child = cp.spawn(clamPath, ['--no-summary', filePath], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        resolve({
          success: false,
          filePath,
          isClean: true,
          durationMs: Date.now() - startTime,
          engineMessage: 'Délai d\'analyse ClamAV dépassé (timeout 15s).',
        });
      }, 15000);

      child.stdout?.on('data', (d) => { stdout += d.toString(); });

      child.on('exit', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (code === 0) {
          resolve({
            success: true,
            filePath,
            isClean: true,
            durationMs,
            engineMessage: 'ClamAV : Fichier sain (aucune détection).',
          });
        } else if (code === 1) {
          // Extraire le nom de la menace (ex: "path/to/file: Eicar-Signature FOUND")
          const foundMatch = /:\s*(.+)\s+FOUND/i.exec(stdout);
          const threatName = foundMatch ? foundMatch[1].trim() : 'Menace détectée par ClamAV';
          resolve({
            success: true,
            filePath,
            isClean: false,
            threatName,
            durationMs,
            engineMessage: `ClamAV a détecté : ${threatName}`,
          });
        } else {
          resolve({
            success: false,
            filePath,
            isClean: true,
            durationMs,
            engineMessage: `ClamAV a terminé avec le code d'erreur ${code}.`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          filePath,
          isClean: true,
          durationMs: Date.now() - startTime,
          engineMessage: `Erreur d'exécution ClamAV : ${err.message}`,
        });
      });
    });
  }
}

export const clamAvEngine = new ClamAvEngine();
