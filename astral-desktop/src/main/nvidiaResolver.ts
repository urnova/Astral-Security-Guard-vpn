/**
 * nvidiaResolver.ts
 * Shared NVIDIA GPU family resolution module.
 * Used by gaming.ts (IPC handler) and tests.
 *
 * Source: NVIDIA AjaxDriverService public endpoint psid/pfid catalog
 * https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php
 */

/** NVIDIA AjaxDriverService family parameters. */
export interface NvidiaFamily {
  psid: number;
  pfid: number;
  label: string;
}

/**
 * Resolve the NVIDIA AjaxDriverService product family for a given GPU name.
 * Returns null when the GPU is not in the supported catalog (RTX 50+, Quadro, Tesla, etc.).
 * NEVER falls back to an approximate family for an unrecognised GPU.
 *
 * @param gpuName  Full GPU name string (e.g. "NVIDIA GeForce RTX 3060 Ti")
 * @param isNotebook  true if this is a mobile/laptop variant
 */
export function resolveNvidiaFamily(
  gpuName: string,
  isNotebook: boolean
): NvidiaFamily | null {
  const n = gpuName.toLowerCase();

  // RTX 50 series — not yet in AjaxDriverService public catalog
  if (/rtx\s*5\d{3}/.test(n)) return null;

  // RTX 40 series (Ada Lovelace)
  if (/rtx\s*40\d{2}/.test(n)) {
    return isNotebook
      ? { psid: 127, pfid: 1023, label: 'GeForce RTX 40 Series Notebooks' }
      : { psid: 127, pfid: 1005, label: 'GeForce RTX 40 Series' };
  }

  // RTX 30 series (Ampere)
  if (/rtx\s*30\d{2}/.test(n)) {
    return isNotebook
      ? { psid: 107, pfid: 888, label: 'GeForce RTX 30 Series Notebooks' }
      : { psid: 107, pfid: 816, label: 'GeForce RTX 30 Series' };
  }

  // RTX 20 series (Turing)
  if (/rtx\s*20\d{2}/.test(n)) {
    return isNotebook
      ? { psid: 100, pfid: 757, label: 'GeForce RTX 20 Series Notebooks' }
      : { psid: 100, pfid: 756, label: 'GeForce RTX 20 Series' };
  }

  // GTX 16 series (Turing refresh)
  if (/gtx\s*16\d{2}/.test(n)) {
    return isNotebook
      ? { psid: 98, pfid: 749, label: 'GeForce GTX 16 Series Notebooks' }
      : { psid: 98, pfid: 748, label: 'GeForce GTX 16 Series' };
  }

  // GTX 10 series (Pascal)
  if (/gtx\s*10\d{2}/.test(n)) {
    return isNotebook
      ? { psid: 92, pfid: 750, label: 'GeForce GTX 10 Series Notebooks' }
      : { psid: 92, pfid: 731, label: 'GeForce GTX 10 Series' };
  }

  // GTX 900 series (Maxwell)
  if (/gtx\s*9\d{2}/.test(n)) {
    return isNotebook
      ? { psid: 86, pfid: 699, label: 'GeForce GTX 900M Series' }
      : { psid: 86, pfid: 700, label: 'GeForce GTX 900 Series' };
  }

  // Quadro, Tesla, TITAN, professional GPUs — not in AjaxDriverService consumer catalog
  // Unknown or future families — no approximation, return null explicitly
  return null;
}

/**
 * Normalise a raw Windows driver version string (e.g. "32.0.16.1742")
 * to the NVIDIA display format (e.g. "617.42").
 *
 * Returns null if the string cannot be normalised to a valid range.
 */
export function normaliseNvidiaDriverVersion(rawVersion: string): string | null {
  const digits = rawVersion.replace(/\D/g, '');
  if (digits.length < 5) return null;
  const last5 = digits.slice(-5);
  const major = parseInt(last5.slice(0, 3), 10);
  const minor = last5.slice(3);
  if (major < 100 || major > 999) return null;
  return `${major}.${minor}`;
}
