/**
 * Astral Vanguard - Mesure de latence TCP directe (SYN / SYN-ACK)
 * 
 * Mesure rigoureusement le délai aller-retour d'établissement de connexion TCP (handshake).
 * Ne se substitue pas à une mesure ICMP au niveau IP, mais permet une mesure applicative
 * fiable sans invoquer de sous-processus PowerShell ou ping.exe.
 * 
 * Zéro valeur inventée : tout échec ou dépassement de délai renvoie null ou un code d'erreur explicite.
 */

import net from 'net';

export interface TcpProbeResult {
  success:    boolean;
  latencyMs:  number | null;
  error?:     string;
}

export interface ProbeSeriesResult {
  target:           string;
  port:             number;
  protocol:         'TCP-Handshake';
  attempts:         number;
  successes:        number;
  probeFailures:    number;
  samples:          number[];
  medianLatencyMs:  number | null;
  jitterMs:         number | null;
}

/**
 * Exécute une sonde TCP unitaire vers un hôte et un port donnés.
 * Chronomètre le délai exact entre l'initiation du socket et l'événement 'connect'.
 */
export async function measureTcpProbe(
  host: string,
  port: number,
  timeoutMs = 1200
): Promise<TcpProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let settled = false;

    const finalize = (success: boolean, latencyMs: number | null, error?: string) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve({ success, latencyMs, error });
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      const elapsed = Math.round(performance.now() - start);
      finalize(true, Math.max(1, elapsed));
    });

    socket.once('timeout', () => {
      finalize(false, null, 'Timeout (dépassement du délai imparti)');
    });

    socket.once('error', (err: any) => {
      finalize(false, null, err.message || 'Erreur de connexion socket');
    });

    try {
      socket.connect(port, host);
    } catch (err: any) {
      finalize(false, null, err.message || 'Échec initialisation socket');
    }
  });
}

/**
 * Calcule la déviation absolue moyenne entre échantillons consécutifs (variation temporelle / gigue).
 * Formule : (1 / (N - 1)) * Sum(|S_{i+1} - S_i|) pour N >= 3.
 */
export function calculateJitter(samples: number[]): number | null {
  if (!samples || samples.length < 3) return null;
  let totalDiff = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    totalDiff += Math.abs(samples[i + 1] - samples[i]);
  }
  const jitter = totalDiff / (samples.length - 1);
  return Number(jitter.toFixed(1));
}

/**
 * Exécute une série de sondes consécutives vers une cible unique et homogène.
 * Calcule la médiane et la gigue sur les échantillons réussis.
 */
export async function measureProbeSeries(
  host: string,
  port: number,
  count = 5,
  timeoutMs = 1000
): Promise<ProbeSeriesResult> {
  const samples: number[] = [];
  let failures = 0;

  for (let i = 0; i < count; i++) {
    const probe = await measureTcpProbe(host, port, timeoutMs);
    if (probe.success && probe.latencyMs !== null) {
      samples.push(probe.latencyMs);
    } else {
      failures++;
    }
    // Court délai d'espacement (30ms) entre deux sondes pour éviter de surcharger la pile locale
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 30));
    }
  }

  let medianLatencyMs: number | null = null;
  if (samples.length > 0) {
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianLatencyMs = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }

  const jitterMs = calculateJitter(samples);

  return {
    target: host,
    port,
    protocol: 'TCP-Handshake',
    attempts: count,
    successes: samples.length,
    probeFailures: failures,
    samples,
    medianLatencyMs,
    jitterMs,
  };
}

/**
 * Fonction de compatibilité ascendante pour les consommateurs existants (doctor.ts, OverlayHUD).
 * Renvoie la latence mesurée en millisecondes, ou -1 en cas d'échec (aucun fallback à 18ms).
 */
export async function measureNativePing(
  host = '1.1.1.1',
  port = 443,
  timeout = 600
): Promise<number> {
  const res = await measureTcpProbe(host, port, timeout);
  return res.success && res.latencyMs !== null ? res.latencyMs : -1;
}
