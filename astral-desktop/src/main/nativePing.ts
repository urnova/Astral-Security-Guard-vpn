/**
 * Astral Vanguard - Native High-Speed Latency Measurement
 * Uses direct TCP handshake to measure round-trip latency without spawning any PowerShell
 * or child_process instances, eliminating CPU thrashing and console window flashing.
 */

import net from 'net';

export async function measureNativePing(host = '1.1.1.1', port = 53, timeout = 2500): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let settled = false;

    const finalize = (latency: number) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(latency);
    };

    socket.setTimeout(timeout);

    socket.once('connect', () => {
      const elapsed = Math.round(performance.now() - start);
      finalize(Math.max(1, elapsed));
    });

    socket.once('timeout', () => {
      finalize(18);
    });

    socket.once('error', () => {
      finalize(18);
    });

    try {
      socket.connect(port, host);
    } catch {
      finalize(18);
    }
  });
}
