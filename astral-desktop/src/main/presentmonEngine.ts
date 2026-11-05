/**
 * ASTRAL VANGUARD v3.0 - INTÉGRATION OFFICIELLE PRESENTMON & MÉTRIQUES HUD (LOT 2 / PHASE 12)
 *
 * Moteur de capture et télémétrie de performance en jeu :
 * - Version cible : Intel PresentMon officiel (v2.0.0 / v1.9.0)
 * - Traitement honnête : si absent -> "Indisponible — PresentMon non installé"
 * - ZÉRO simulation de FPS, ZÉRO frametime inventé, ZÉRO 1% low fictif
 * - Calcul réel du 1% low basé sur le 99e percentile des frametimes
 * - Respect absolu de l'intégrité : aucun hook intrusif, aucune tentative de contournement d'anti-cheat
 * - Statuts de capture explicites :
 *   'Jeu détecté' | 'Capture en cours' | 'Métriques partielles' | 'Non supporté' |
 *   'Capture refusée' | 'Capture bloquée par le jeu ou l’anti-cheat' | 'Indisponible'
 */

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { logger } from './logger.ts';

export type PresentMonStatus =
  | 'Jeu détecté'
  | 'Capture en cours'
  | 'Métriques partielles'
  | 'Non supporté'
  | 'Capture refusée'
  | 'Capture bloquée par le jeu ou l’anti-cheat'
  | 'Indisponible';

export interface PresentMonMetrics {
  status: PresentMonStatus;
  statusMessage: string;
  fps: number | null;
  frametimeMs: number | null;
  onePercentLowFps: number | null;
  gameProcessName: string | null;
  gamePid: number | null;
  isCapturing: boolean;
  sampleCount: number;
}

export class PresentMonEngine {
  private customBinaryPath: string | null = null;
  private cachedVersion: { binPath: string; version: string } | null = null;
  private captureProcess: cp.ChildProcess | null = null;
  private isCapturing = false;
  private currentStatus: PresentMonStatus = 'Indisponible';
  private statusMessage = 'PresentMon non installé';
  private activeGamePid: number | null = null;
  private activeGameName: string | null = null;

  // Historique des frametimes (pour calcul précis du 1% low)
  private frametimeHistoryMs: number[] = [];
  private readonly MAX_HISTORY_SAMPLES = 300; // ~5 secondes à 60 FPS

  // Dernières métriques calculées
  private lastFps: number | null = null;
  private lastFrametimeMs: number | null = null;
  private lastOnePercentLow: number | null = null;
  // État du parseur CSV et sélection stricte de la métrique d'intervalle
  private csvHeaderParsed = false;
  private presentationIntervalIdx = -1;
  private displayChangeIdx = -1;
  private activeIntervalMetric: 'msBetweenPresents' | 'FrameTime' | null = null;

  /**
   * Localise le binaire officiel de PresentMon sur la machine
   */
  public findPresentMonBinary(): string | null {
    if (this.customBinaryPath && fs.existsSync(this.customBinaryPath)) {
      return this.customBinaryPath;
    }

    const candidatePaths = [
      'C:\\Program Files\\Intel\\PresentMon\\PresentMon-x64.exe',
      'C:\\Program Files\\Intel\\PresentMon\\PresentMon.exe',
      'C:\\Program Files (x86)\\Intel\\PresentMon\\PresentMon-x64.exe',
      // App packagée : process.resourcesPath → resources/bin/
      ...(process.resourcesPath
        ? [path.join(process.resourcesPath, 'bin', 'PresentMon-x64.exe')]
        : []),
      path.resolve(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), '../../../bin/PresentMon-x64.exe'),
      path.resolve(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), '../../bin/PresentMon-x64.exe'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }

    return null;
  }

  public setCustomBinary(binaryPath: string) {
    this.customBinaryPath = binaryPath;
  }

  /**
   * Vérifie la disponibilité de PresentMon et ses métadonnées
   */
  public getAvailability(): {
    isAvailable: boolean;
    executablePath: string | null;
    version: string;
    license: string;
  } {
    const bin = this.findPresentMonBinary();
    if (!bin) {
      return {
        isAvailable: false,
        executablePath: null,
        version: 'Non installé',
        license: 'Intel PresentMon - BSD-3-Clause / MIT License. Découplé.',
      };
    }

    if (this.cachedVersion && this.cachedVersion.binPath === bin) {
      return {
        isAvailable: true,
        executablePath: bin,
        version: this.cachedVersion.version,
        license: 'Intel PresentMon - BSD-3-Clause / MIT License. Découplé.',
      };
    }

    let detectedVersion = 'installé (version non déterminée)';
    try {
      const out = cp.execFileSync(bin, ['--version'], { timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const match = /(\d+\.\d+[\.\d]*)/.exec(out);
      if (match) detectedVersion = match[1];
    } catch {
      detectedVersion = 'installé (version non déterminée)';
    }

    this.cachedVersion = { binPath: bin, version: detectedVersion };
    return {
      isAvailable: true,
      executablePath: bin,
      version: detectedVersion,
      license: 'Intel PresentMon - BSD-3-Clause / MIT License. Découplé.',
    };
  }

  /**
   * Démarre la capture PresentMon pour un processus de jeu donné
   */
  public startCapture(
    pid: number,
    processName: string,
    onMetricsUpdate?: (m: PresentMonMetrics) => void
  ): boolean {
    if (this.isCapturing) {
      this.stopCapture();
    }

    this.activeGamePid = pid;
    this.activeGameName = processName;
    this.frametimeHistoryMs = [];
    this.lastFps = null;
    this.lastFrametimeMs = null;
    this.lastOnePercentLow = null;

    const bin = this.findPresentMonBinary();
    if (!bin) {
      this.currentStatus = 'Indisponible';
      this.statusMessage = 'FPS indisponibles — PresentMon introuvable dans les chemins attendus. ' +
        'Vérifiez que l\'installation n\'est pas corrompue (bin/PresentMon-x64.exe).';
      logger.info(`[PresentMon] ${this.statusMessage}`);
      if (onMetricsUpdate) onMetricsUpdate(this.getCurrentMetrics());
      return false;
    }

    try {
      logger.info(`[PresentMon] Lancement de la capture pour ${processName} (PID ${pid})...`);
      this.currentStatus = 'Jeu détecté';
      this.statusMessage = `Jeu détecté [${processName}]. Initialisation du suivi...`;

      // Arguments standardisés de PresentMon CLI officiel :
      // -process_id <pid> : cible le processus spécifique
      // -output_stdout : envoi des métriques CSV sur la sortie standard
      // -terminate_on_proc_exit : arrêt automatique avec le jeu
      // -stop_existing_session : évite les conflits de session ETW
      const args = [
        '-process_id',
        String(pid),
        '-output_stdout',
        '-terminate_on_proc_exit',
        '-stop_existing_session',
        '-no_console_stats',
        '-v1_metrics',
      ];

      this.captureProcess = cp.spawn(bin, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.isCapturing = true;
      this.currentStatus = 'Capture en cours';
      this.statusMessage = 'Capture des métriques graphiques en direct.';

      this.csvHeaderParsed = false;
      this.presentationIntervalIdx = -1;
      this.displayChangeIdx = -1;
      this.activeIntervalMetric = null;

      this.captureProcess.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          this.processCsvLine(line, onMetricsUpdate);
        }
      });

      this.captureProcess.stderr?.on('data', (errChunk: Buffer) => {
        const errText = errChunk.toString('utf8');
        logger.warn(`[PresentMon STDERR] ${errText}`);
        if (errText.includes('Access denied') || errText.includes('EAC') || errText.includes('BattlEye')) {
          this.currentStatus = 'Capture bloquée par le jeu ou l’anti-cheat';
          this.statusMessage = 'Anti-cheat actif : capture ETW refusée sans contournement.';
        }
      });

      this.captureProcess.on('exit', (code) => {
        logger.info(`[PresentMon] Processus de capture terminé avec code ${code}`);
        this.isCapturing = false;
        this.captureProcess = null;
        if (this.currentStatus === 'Capture en cours') {
          this.currentStatus = 'Indisponible';
          this.statusMessage = 'Capture arrêtée.';
        }
      });

      return true;
    } catch (err: any) {
      logger.error('[PresentMon] Échec du lancement de la capture :', err.message);
      this.isCapturing = false;
      this.currentStatus = 'Non supporté';
      this.statusMessage = `Erreur système : ${err.message}`;
      return false;
    }
  }

  /**
   * Arrête la capture active
   */
  public stopCapture() {
    if (this.captureProcess) {
      try {
        this.captureProcess.kill('SIGTERM');
      } catch {}
      this.captureProcess = null;
    }
    this.isCapturing = false;
    this.activeGamePid = null;
    this.activeGameName = null;
    this.currentStatus = 'Indisponible';
    this.statusMessage = 'Capture arrêtée.';
  }

  /**
   * Ajoute un échantillon de frametime et calcule FPS / 1% low
   */
    /**
   * Analyse l'en-tête CSV émis par PresentMon.
   * RÈGLES FORMELLES D'INTÉGRITÉ DU CALCUL FPS :
   * 1. msBetweenPresents est la métrique prioritaire pour le calcul du taux de présentation.
   * 2. FrameTime (schéma 2.x) n'est utilisé que si msBetweenPresents est absent.
   * 3. msInPresentAPI représente le temps d'exécution interne de l'API Present() (ex. 0.2 ms) :
   *    il ne doit JAMAIS être utilisé comme intervalle de trame ou fallback FPS.
   * 4. msBetweenDisplayChange représente le changement d'affichage écran (flip matériel) :
   *    il reste identifié séparément et n'est pas confondu avec le taux de trames de l'application.
   * 5. Si aucun intervalle compatible n'est présent, le statut indique « Mesure indisponible ».
   */
  public parseCsvHeader(headerLine: string): boolean {
    const cols = headerLine.split(',').map((c) => c.trim());
    const lowerCols = cols.map((c) => c.toLowerCase());

    const mbpIdx = lowerCols.findIndex((c) => c === 'msbetweenpresents');
    const ftIdx = lowerCols.findIndex((c) => c === 'frametime');
    const mbdcIdx = lowerCols.findIndex((c) => c === 'msbetweendisplaychange');

    this.displayChangeIdx = mbdcIdx;

    if (mbpIdx >= 0) {
      this.presentationIntervalIdx = mbpIdx;
      this.activeIntervalMetric = 'msBetweenPresents';
      logger.info(`[PresentMon] Métrique de présentation sélectionnée : msBetweenPresents (colonne #${mbpIdx})`);
    } else if (ftIdx >= 0) {
      this.presentationIntervalIdx = ftIdx;
      this.activeIntervalMetric = 'FrameTime';
      logger.info(`[PresentMon] Métrique de présentation sélectionnée : FrameTime (colonne #${ftIdx})`);
    } else {
      this.presentationIntervalIdx = -1;
      this.activeIntervalMetric = null;
      this.currentStatus = 'Indisponible';
      this.statusMessage = 'Mesure indisponible';
      logger.warn('[PresentMon] Aucun intervalle de présentation compatible (msBetweenPresents ou FrameTime) trouvé. msInPresentAPI est expressément ignoré.');
    }

    this.csvHeaderParsed = true;
    return this.presentationIntervalIdx >= 0;
  }

  /**
   * Traite une ligne brute émise par PresentMon sur STDOUT (en-tête ou ligne de données).
   * Retourne true si un échantillon d'intervalle valide a été enregistré, false sinon.
   */
  public processCsvLine(line: string, onMetricsUpdate?: (m: PresentMonMetrics) => void): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;

    const lower = trimmed.toLowerCase();

    // Détection de l'en-tête CSV
    if (!this.csvHeaderParsed && (lower.includes('application') || lower.includes('msbetweenpresents') || lower.includes('processid') || lower.includes('frametime'))) {
      this.parseCsvHeader(trimmed);
      return false;
    }

    // Traitement d'une ligne de données
    if (this.csvHeaderParsed) {
      if (this.presentationIntervalIdx >= 0) {
        const parts = trimmed.split(',');
        if (parts.length > this.presentationIntervalIdx) {
          const rawVal = parseFloat(parts[this.presentationIntervalIdx]);
          if (!isNaN(rawVal) && rawVal > 0 && rawVal < 1000) {
            this.recordFrametimeSample(rawVal);
            if (onMetricsUpdate) {
              onMetricsUpdate(this.getCurrentMetrics());
            }
            return true;
          }
        }
      } else {
        // En-tête analysé mais aucun intervalle compatible disponible
        this.currentStatus = 'Indisponible';
        this.statusMessage = 'Mesure indisponible';
        if (onMetricsUpdate) {
          onMetricsUpdate(this.getCurrentMetrics());
        }
      }
    }

    return false;
  }

  /**
   * Réinitialise l'état interne pour tests unitaires déterministes
   */
  public resetForTest(): void {
    this.csvHeaderParsed = false;
    this.presentationIntervalIdx = -1;
    this.displayChangeIdx = -1;
    this.activeIntervalMetric = null;
    this.frametimeHistoryMs = [];
    this.lastFps = null;
    this.lastFrametimeMs = null;
    this.lastOnePercentLow = null;
    this.currentStatus = 'Indisponible';
    this.statusMessage = 'Indisponible';
  }

  private recordFrametimeSample(frametimeMs: number) {
    this.frametimeHistoryMs.push(frametimeMs);
    if (this.frametimeHistoryMs.length > this.MAX_HISTORY_SAMPLES) {
      this.frametimeHistoryMs.shift();
    }

    this.lastFrametimeMs = Number(frametimeMs.toFixed(2));
    this.lastFps = frametimeMs > 0 ? Math.round(1000 / frametimeMs) : null;

    // Calcul rigoureux du 1% Low :
    // 99e percentile des frametimes les plus lents (en ms), converti en FPS
    if (this.frametimeHistoryMs.length >= 30) {
      const sorted = [...this.frametimeHistoryMs].sort((a, b) => a - b);
      const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
      const p99FrametimeMs = sorted[p99Index];
      this.lastOnePercentLow = p99FrametimeMs > 0 ? Math.round(1000 / p99FrametimeMs) : null;
    }
  }

  /**
   * Retourne l'état courant des métriques
   */
  public getCurrentMetrics(): PresentMonMetrics {
    return {
      status: this.currentStatus,
      statusMessage: this.statusMessage,
      fps: this.lastFps,
      frametimeMs: this.lastFrametimeMs,
      onePercentLowFps: this.lastOnePercentLow,
      gameProcessName: this.activeGameName,
      gamePid: this.activeGamePid,
      isCapturing: this.isCapturing,
      sampleCount: this.frametimeHistoryMs.length,
    };
  }
}

export const presentMonEngine = new PresentMonEngine();
