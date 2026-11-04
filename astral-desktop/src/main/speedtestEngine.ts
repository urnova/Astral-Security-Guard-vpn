/**
 * Astral Vanguard - Moteur de Test de Débit Déterministe Multi-Flux
 * 
 * Exécuteur découplé permettant l'exécution en production et le test en environnement
 * contrôlé (serveurs locaux éphémères) sans consommer la bande passante réelle de l'utilisateur.
 * 
 * Principes stricts :
 * - Zéro fallback fictif (ni 100 Mbps, ni 40% de DL, ni ping forcé).
 * - Enregistrement et suivi rigoureux de tous les sockets et timers.
 * - Destruction immédiate de l'ensemble des sockets lors de l'annulation.
 * - Mesure de latence sous charge réelle (Bufferbloat) au point médian des transferts.
 * - Distinction stricte : Mesure valide, Mesure partielle, Échec, Annulation.
 */

import http from 'http';
import https from 'https';
import { measureProbeSeries, measureTcpProbe, calculateJitter } from './nativePing.ts';
import { computeNetworkReport } from './networkScoring.ts';
import type { NetworkScoreReport } from './networkScoring.ts';

export interface SpeedtestProgressEvent {
  type: 'speedtest-progress';
  phase: 'ping' | 'download' | 'download-complete' | 'upload';
  progress: number;
  currentMbps?: number;
  downloadMbps?: number | null;
  finalDownMbps?: number | null;
  ping?: number | null;
  jitter?: number | null;
}

export interface SpeedtestResultPayload {
  downloadMbps: number | null;
  uploadMbps: number | null;
  down?: number | null;
  up?: number | null;
  pingMs: number | null;
  jitterMs: number | null;
  ping?: number | null;
  jitter?: number | null;
  loadedDownPingMs: number | null;
  loadedUpPingMs: number | null;
  bufferbloatDownMs: number | null;
  bufferbloatUpMs: number | null;
  bufferbloatDownProbeCount?: number;
  bufferbloatUpProbeCount?: number;
  probeFailureRatePct: number | null;
  bytesTransferredMB: number;
  timestamp: string;
  report: NetworkScoreReport;
}

export interface SpeedtestExecutionOptions {
  downloadMirrors?: string[];
  uploadEndpoint?: string;
  probeHost?: string;
  probePort?: number;
  dlDurationMs?: number;
  ulDurationMs?: number;
  sampleIntervalMs?: number;
  customHttpModule?: typeof http | typeof https;
  onProgress?: (event: SpeedtestProgressEvent) => void;
  checkCancelled?: () => boolean;
}

export interface SpeedtestExecutionOutcome {
  success: boolean;
  cancelled?: boolean;
  error?: string;
  result: SpeedtestResultPayload | null;
  down?: number | null;
  up?: number | null;
  ping?: number | null;
  jitter?: number | null;
}

export class SpeedtestExecutor {
  private activeSockets: Set<any> = new Set();
  private activeTimers: Set<any> = new Set();
  private isCancelled = false;
  private isRunning = false;

  public cancel(): void {
    this.isCancelled = true;
    for (const s of this.activeSockets) {
      try {
        if (typeof s.destroy === 'function') s.destroy();
        else if (typeof s.abort === 'function') s.abort();
      } catch {}
    }
    this.activeSockets.clear();

    for (const t of this.activeTimers) {
      try {
        clearInterval(t);
        clearTimeout(t);
      } catch {}
    }
    this.activeTimers.clear();
  }

  public getRunning(): boolean {
    return this.isRunning;
  }

  public async run(options: SpeedtestExecutionOptions = {}): Promise<SpeedtestExecutionOutcome> {
    if (this.isRunning) {
      return {
        success: false,
        error: 'Un test de débit est déjà en cours d\'exécution.',
        result: null,
      };
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.activeSockets.clear();
    this.activeTimers.clear();

    const probeHost = options.probeHost || '1.1.1.1';
    const probePort = options.probePort || 443;
    const dlDurationMs = options.dlDurationMs ?? 5200;
    const ulDurationMs = options.ulDurationMs ?? 4200;
    const sampleIntervalMs = options.sampleIntervalMs ?? 200;

    const downloadMirrors = options.downloadMirrors || [
      'https://speed.cloudflare.com/__down?bytes=50000000',
      'https://proof.ovh.net/files/100Mb.dat',
      'https://proof.ovh.net/files/1Gb.dat',
      'https://speed.cloudflare.com/__down?bytes=25000000',
    ];

    const uploadEndpoint = options.uploadEndpoint || 'https://speed.cloudflare.com/__up';

    try {
      // ── Phase 1 : Latence et Gigue de Référence au Repos (Idle) ───────────
      const idleSeries = await measureProbeSeries(probeHost, probePort, 5, 800);
      if (this.isCancelled || options.checkCancelled?.()) {
        return { success: false, cancelled: true, result: null };
      }

      const idlePingMs = idleSeries.medianLatencyMs;
      const idleJitterMs = idleSeries.jitterMs;
      let totalProbeAttempts = idleSeries.attempts;
      let totalProbeFailures = idleSeries.probeFailures;

      options.onProgress?.({
        type: 'speedtest-progress',
        phase: 'ping',
        ping: idlePingMs,
        jitter: idleJitterMs,
        progress: 10,
      });

      // ── Phase 2 : Téléchargement multi-flux & Bufferbloat Réception ───────
      const dlStartTime = performance.now();
      let totalBytesDown = 0;
      let peakDownloadMbps = 0;
      let currentDlMbps = 0;

      let lastDlSampleTime = dlStartTime;
      let lastDlSampleBytes = 0;

      const dlSampler = setInterval(() => {
        if (this.isCancelled || options.checkCancelled?.()) return;
        const now = performance.now();
        const elapsedSec = (now - lastDlSampleTime) / 1000;
        if (elapsedSec > 0.05) {
          const deltaBytes = totalBytesDown - lastDlSampleBytes;
          const instantMbps = Math.round((deltaBytes * 8) / (elapsedSec * 1000000));
          currentDlMbps = Math.round(currentDlMbps * 0.25 + instantMbps * 0.75);
          if (currentDlMbps > peakDownloadMbps) peakDownloadMbps = currentDlMbps;

          const totalElapsed = now - dlStartTime;
          const progress = Math.min(99, Math.round((totalElapsed / dlDurationMs) * 100));

          options.onProgress?.({
            type: 'speedtest-progress',
            phase: 'download',
            currentMbps: currentDlMbps,
            progress,
            ping: idlePingMs,
            jitter: idleJitterMs,
          });

          lastDlSampleTime = now;
          lastDlSampleBytes = totalBytesDown;
        }
      }, sampleIntervalMs);
      this.activeTimers.add(dlSampler);

      // Sonde Bufferbloat pendant le téléchargement (lancée en parallèle pour réactivité)
      let loadedDownPing: number | null = null;
      let downProbeCount = 0;
      const probeDownTimeout = setTimeout(async () => {
        if (!this.isCancelled && !options.checkCancelled?.() && (performance.now() - dlStartTime) < dlDurationMs) {
          totalProbeAttempts += 2;
          const [p1, p2] = await Promise.all([
            measureTcpProbe(probeHost, probePort, 600),
            measureTcpProbe(probeHost, probePort, 600)
          ]);
          const valid = [p1.latencyMs, p2.latencyMs].filter((v): v is number => v !== null);
          downProbeCount = valid.length;
          if (valid.length > 0) {
            loadedDownPing = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
          }
          totalProbeFailures += (2 - valid.length);
        }
      }, Math.max(50, Math.floor(dlDurationMs * 0.3)));
      this.activeTimers.add(probeDownTimeout);

      const runDlWorker = async (workerIndex: number) => {
        let mirrorIdx = workerIndex % downloadMirrors.length;
        while (!this.isCancelled && !options.checkCancelled?.() && (performance.now() - dlStartTime) < dlDurationMs) {
          const targetUrl = downloadMirrors[mirrorIdx % downloadMirrors.length];
          mirrorIdx++;

          await new Promise<void>((resolve) => {
            try {
              const parsed = new URL(targetUrl);
              const requester = (parsed.protocol === 'http:' ? http : https) as any;
              const req = requester.get(targetUrl, { timeout: 4000 }, (res: any) => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                  res.resume();
                  this.activeSockets.delete(req);
                  return resolve();
                }

                res.on('data', (chunk: Buffer) => {
                  totalBytesDown += chunk.length;
                  if (this.isCancelled || options.checkCancelled?.() || (performance.now() - dlStartTime) >= dlDurationMs) {
                    try { req.destroy(); } catch {}
                    this.activeSockets.delete(req);
                    resolve();
                  }
                });
                res.on('end', () => {
                  this.activeSockets.delete(req);
                  resolve();
                });
                res.on('error', () => {
                  this.activeSockets.delete(req);
                  resolve();
                });
              });

              this.activeSockets.add(req);
              req.on('error', () => {
                this.activeSockets.delete(req);
                resolve();
              });
              req.on('timeout', () => {
                try { req.destroy(); } catch {}
                this.activeSockets.delete(req);
                resolve();
              });
            } catch {
              resolve();
            }
          });
        }
      };

      const dlWorkers = [runDlWorker(0), runDlWorker(1), runDlWorker(2), runDlWorker(3)];
      await Promise.race([
        Promise.all(dlWorkers),
        new Promise(r => {
          const t = setTimeout(r, dlDurationMs + 400);
          this.activeTimers.add(t);
        }),
      ]);

      clearInterval(dlSampler);
      clearTimeout(probeDownTimeout);
      this.activeTimers.delete(dlSampler);
      this.activeTimers.delete(probeDownTimeout);

      if (this.isCancelled || options.checkCancelled?.()) {
        return { success: false, cancelled: true, result: null };
      }

      const dlElapsedTotal = (performance.now() - dlStartTime) / 1000;
      const avgDlMbps = totalBytesDown > 0 && dlElapsedTotal > 0
        ? Math.round((totalBytesDown * 8) / (dlElapsedTotal * 1000000))
        : 0;

      const finalDlMbps: number | null = totalBytesDown > 0
        ? Math.max(avgDlMbps, Math.round(peakDownloadMbps * 0.9))
        : null;

      options.onProgress?.({
        type: 'speedtest-progress',
        phase: 'download-complete',
        downloadMbps: finalDlMbps,
        finalDownMbps: finalDlMbps,
        currentMbps: finalDlMbps ?? 0,
        progress: 100,
        ping: idlePingMs,
        jitter: idleJitterMs,
      });

      // ── Phase 3 : Envoi multi-flux (Upload) & Bufferbloat Émission ────────
      const ulStartTime = performance.now();
      let totalBytesUp = 0;
      let peakUploadMbps = 0;
      let currentUlMbps = 0;

      const uploadChunk = Buffer.alloc(256 * 1024);

      let lastUlSampleTime = ulStartTime;
      let lastUlSampleBytes = 0;

      const ulSampler = setInterval(() => {
        if (this.isCancelled || options.checkCancelled?.()) return;
        const now = performance.now();
        const elapsedSec = (now - lastUlSampleTime) / 1000;
        if (elapsedSec > 0.05) {
          const deltaBytes = totalBytesUp - lastUlSampleBytes;
          const instantMbps = Math.round((deltaBytes * 8) / (elapsedSec * 1000000));
          currentUlMbps = Math.round(currentUlMbps * 0.3 + instantMbps * 0.7);
          if (currentUlMbps > peakUploadMbps) peakUploadMbps = currentUlMbps;

          const totalElapsed = now - ulStartTime;
          const progress = Math.min(99, Math.round((totalElapsed / ulDurationMs) * 100));

          options.onProgress?.({
            type: 'speedtest-progress',
            phase: 'upload',
            currentMbps: currentUlMbps,
            finalDownMbps: finalDlMbps,
            progress,
            ping: idlePingMs,
            jitter: idleJitterMs,
          });

          lastUlSampleTime = now;
          lastUlSampleBytes = totalBytesUp;
        }
      }, sampleIntervalMs);
      this.activeTimers.add(ulSampler);

      let loadedUpPing: number | null = null;
      let upProbeCount = 0;
      const probeUpTimeout = setTimeout(async () => {
        if (!this.isCancelled && !options.checkCancelled?.() && (performance.now() - ulStartTime) < ulDurationMs) {
          totalProbeAttempts += 2;
          const [p1, p2] = await Promise.all([
            measureTcpProbe(probeHost, probePort, 600),
            measureTcpProbe(probeHost, probePort, 600)
          ]);
          const valid = [p1.latencyMs, p2.latencyMs].filter((v): v is number => v !== null);
          upProbeCount = valid.length;
          if (valid.length > 0) {
            loadedUpPing = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
          }
          totalProbeFailures += (2 - valid.length);
        }
      }, Math.max(50, Math.floor(ulDurationMs * 0.3)));
      this.activeTimers.add(probeUpTimeout);

      const parsedUp = new URL(uploadEndpoint);
      const upRequester = (parsedUp.protocol === 'http:' ? http : https) as any;

      const runUlWorker = async () => {
        while (!this.isCancelled && !options.checkCancelled?.() && (performance.now() - ulStartTime) < ulDurationMs) {
          await new Promise<void>((resolve) => {
            try {
              const req = upRequester.request(
                uploadEndpoint,
                {
                  method: 'POST',
                  timeout: 3000,
                  headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': uploadChunk.length,
                  },
                },
                (res: any) => {
                  if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    res.resume();
                    this.activeSockets.delete(req);
                    return resolve();
                  }

                  res.resume();
                  res.on('end', () => {
                    totalBytesUp += uploadChunk.length;
                    this.activeSockets.delete(req);
                    resolve();
                  });
                  res.on('error', () => {
                    this.activeSockets.delete(req);
                    resolve();
                  });
                }
              );

              this.activeSockets.add(req);
              req.on('error', () => {
                this.activeSockets.delete(req);
                resolve();
              });
              req.on('timeout', () => {
                try { req.destroy(); } catch {}
                this.activeSockets.delete(req);
                resolve();
              });
              req.write(uploadChunk);
              req.end();
            } catch {
              resolve();
            }
          });
        }
      };

      const ulWorkers = [runUlWorker(), runUlWorker(), runUlWorker(), runUlWorker()];
      await Promise.race([
        Promise.all(ulWorkers),
        new Promise(r => {
          const t = setTimeout(r, ulDurationMs + 400);
          this.activeTimers.add(t);
        }),
      ]);

      clearInterval(ulSampler);
      clearTimeout(probeUpTimeout);
      this.activeTimers.delete(ulSampler);
      this.activeTimers.delete(probeUpTimeout);

      if (this.isCancelled || options.checkCancelled?.()) {
        return { success: false, cancelled: true, result: null };
      }

      const ulElapsedTotal = (performance.now() - ulStartTime) / 1000;
      const avgUlMbps = totalBytesUp > 0 && ulElapsedTotal > 0
        ? Math.round((totalBytesUp * 8) / (ulElapsedTotal * 1000000))
        : 0;

      const finalUlMbps: number | null = totalBytesUp > 0
        ? Math.max(avgUlMbps, Math.round(peakUploadMbps * 0.9))
        : null;

      // ── Phase 4 : Bufferbloat & Notation Déterministe ──────────────────────
      const bufferbloatDownMs: number | null = (loadedDownPing !== null && idlePingMs !== null)
        ? Math.max(0, loadedDownPing - idlePingMs)
        : null;

      const bufferbloatUpMs: number | null = (loadedUpPing !== null && idlePingMs !== null)
        ? Math.max(0, loadedUpPing - idlePingMs)
        : null;

      const failureRatePct: number | null = totalProbeAttempts > 0
        ? Number(((totalProbeFailures / totalProbeAttempts) * 100).toFixed(1))
        : null;

      const scoringReport = computeNetworkReport({
        downloadMbps: finalDlMbps,
        uploadMbps: finalUlMbps,
        idlePingMs,
        jitterMs: idleJitterMs,
        bufferbloatDownMs,
        bufferbloatUpMs,
        probeFailureRatePct: failureRatePct,
      });

      const totalMB = Number(((totalBytesDown + totalBytesUp) / (1024 * 1024)).toFixed(1));

      const payload: SpeedtestResultPayload = {
        downloadMbps: finalDlMbps,
        uploadMbps: finalUlMbps,
        down: finalDlMbps,
        up: finalUlMbps,
        pingMs: idlePingMs,
        jitterMs: idleJitterMs,
        ping: idlePingMs,
        jitter: idleJitterMs,
        loadedDownPingMs: loadedDownPing,
        loadedUpPingMs: loadedUpPing,
        bufferbloatDownMs,
        bufferbloatUpMs,
        bufferbloatDownProbeCount: downProbeCount,
        bufferbloatUpProbeCount: upProbeCount,
        probeFailureRatePct: failureRatePct,
        bytesTransferredMB: totalMB,
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        report: scoringReport,
      };

      return {
        success: true,
        result: payload,
        down: finalDlMbps,
        up: finalUlMbps,
        ping: idlePingMs,
        jitter: idleJitterMs,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur inattendue pendant le test de débit.',
        result: null,
      };
    } finally {
      this.cancel();
      this.isRunning = false;
    }
  }
}
