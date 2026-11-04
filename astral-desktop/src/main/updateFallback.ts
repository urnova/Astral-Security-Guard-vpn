/**
 * Vanguard Core — Secours Informatif des Mises à Jour
 * 
 * En cas d'échec du mécanisme principal (authentification, 401, réseau),
 * consulte de manière passive et sécurisée la liste publique des releases GitHub.
 * 
 * Règles strictes :
 * 1. Ne s'exécute QUE si le mécanisme principal a échoué.
 * 2. Aucun polling autonome parallèle.
 * 3. Ne télécharge ni n'exécute aucun fichier.
 * 4. Respect du canal stable vs pré-release (allowPrerelease).
 * 5. Comparaison sémantique stricte (SemVer 2.0.0, jamais lexicographique).
 * 6. Cache et cooldown de 15 minutes entre requêtes.
 * 7. Aucune exposition de token ou de données sensibles.
 */

import https from 'node:https';
import { logger } from './logger.ts';
import { notificationManager } from './notificationManager.ts';

export interface SemverParsed {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  raw: string;
}

export interface FallbackReleaseInfo {
  version: string;
  tag: string;
  publishedAt: string;
  htmlUrl: string;
  isPrerelease: boolean;
}

export type FallbackCheckResult =
  | { status: 'fallback_new_version_detected'; release: FallbackReleaseInfo; source: string }
  | { status: 'fallback_no_newer_version'; currentVersion: string; source: string }
  | { status: 'fallback_unavailable'; error: string; officialUrl: string }
  | { status: 'main_check_unavailable'; error: string; officialUrl: string };

const GITHUB_OWNER = 'urnova';
const GITHUB_REPO = 'Astral-Security-Guard-vpn';
const OFFICIAL_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const FALLBACK_API_PATH = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

let lastCheckTime = 0;
let cachedResult: FallbackCheckResult | null = null;

/**
 * Analyse et valide une chaîne de version selon SemVer
 */
export function parseSemver(v: string): SemverParsed | null {
  if (!v || typeof v !== 'string') return null;
  const clean = v.trim().replace(/^v/i, '');
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    raw: clean,
  };
}

/**
 * Compare deux versions sémantiques.
 * Retourne > 0 si a > b, < 0 si a < b, 0 si a === b.
 */
export function compareSemver(aStr: string, bStr: string): number {
  const a = parseSemver(aStr);
  const b = parseSemver(bStr);

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Si l'un a un tag prerelease et l'autre non, la version sans prerelease est plus récente (ex: 0.1.6 > 0.1.6-beta)
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (!a.prerelease && !b.prerelease) return 0;

  // Comparaison des identifiants de pré-version
  const aParts = (a.prerelease || '').split('.');
  const bParts = (b.prerelease || '').split('.');
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aP = aParts[i];
    const bP = bParts[i];
    if (aP === undefined) return -1;
    if (bP === undefined) return 1;

    const aNum = Number(aP);
    const bNum = Number(bP);
    const aIsNum = !Number.isNaN(aNum) && String(aNum) === aP;
    const bIsNum = !Number.isNaN(bNum) && String(bNum) === bP;

    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNum && !bIsNum) {
      return -1;
    } else if (!aIsNum && bIsNum) {
      return 1;
    } else {
      if (aP !== bP) return aP.localeCompare(bP);
    }
  }

  return 0;
}

/**
 * Effectue une requête HTTP passive vers GitHub Releases sans authentification
 */
export async function fetchPublicReleases(
  customFetch?: (path: string) => Promise<{ statusCode: number; data: string }>
): Promise<any[]> {
  if (customFetch) {
    const res = await customFetch(FALLBACK_API_PATH);
    if (res.statusCode === 403) throw new Error('Limite de requêtes GitHub atteinte (rate limit).');
    if (res.statusCode === 404) throw new Error('Ressource GitHub publique introuvable.');
    if (res.statusCode !== 200) throw new Error(`Erreur HTTP GitHub ${res.statusCode}.`);
    return JSON.parse(res.data);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: FALLBACK_API_PATH,
        method: 'GET',
        headers: {
          'User-Agent': 'Vanguard-Core-App',
          'Accept': 'application/vnd.github.v3+json',
        },
        timeout: 6000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 403) {
            reject(new Error('Limite de requêtes GitHub atteinte (rate limit).'));
            return;
          }
          if (res.statusCode === 404) {
            reject(new Error('Ressource GitHub introuvable ou privée.'));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Réponse inattendue du serveur (${res.statusCode}).`));
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch (e: any) {
            reject(new Error('Réponse JSON invalide reçue de GitHub.'));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Délai d\'attente dépassé (timeout).'));
    });

    req.on('error', (err) => {
      reject(new Error(`Erreur réseau : ${err.message}`));
    });

    req.end();
  });
}

/**
 * Exécute la vérification de secours informative
 */
export async function checkFallbackReleases(options: {
  currentVersion: string;
  allowPrerelease: boolean;
  forceRefresh?: boolean;
  customFetcher?: (path: string) => Promise<{ statusCode: number; data: string }>;
}): Promise<FallbackCheckResult> {
  const { currentVersion, allowPrerelease, forceRefresh = false, customFetcher } = options;

  // 1. Contrôle du cache et cooldown (sauf test ou forceRefresh)
  const now = Date.now();
  if (!forceRefresh && cachedResult && now - lastCheckTime < COOLDOWN_MS) {
    logger.info('[UpdateFallback] Utilisation du résultat en cache (cooldown actif).');
    return cachedResult;
  }

  try {
    const releases = await fetchPublicReleases(customFetcher);
    if (!Array.isArray(releases) || releases.length === 0) {
      cachedResult = {
        status: 'fallback_no_newer_version',
        currentVersion,
        source: 'GitHub Releases publique',
      };
      lastCheckTime = now;
      return cachedResult;
    }

    // 2. Filtrer les releases candidates
    const candidates: FallbackReleaseInfo[] = [];

    for (const r of releases) {
      if (r.draft === true) continue;
      const isPre = Boolean(r.prerelease);
      if (isPre && !allowPrerelease) continue;

      const tag = r.tag_name || r.name || '';
      const parsed = parseSemver(tag);
      if (!parsed) continue;

      candidates.push({
        version: parsed.raw,
        tag,
        publishedAt: r.published_at || new Date().toISOString(),
        htmlUrl: r.html_url || OFFICIAL_RELEASES_URL,
        isPrerelease: isPre,
      });
    }

    if (candidates.length === 0) {
      cachedResult = {
        status: 'fallback_no_newer_version',
        currentVersion,
        source: 'GitHub Releases publique',
      };
      lastCheckTime = now;
      return cachedResult;
    }

    // 3. Trier sémantiquement par version décroissante (jamais par date seule)
    candidates.sort((a, b) => compareSemver(b.version, a.version));
    const highest = candidates[0];

    // 4. Comparer avec la version installée
    if (compareSemver(highest.version, currentVersion) > 0) {
      cachedResult = {
        status: 'fallback_new_version_detected',
        release: highest,
        source: 'GitHub Releases publique',
      };
      lastCheckTime = now;

      // Émettre une notification centrale d'information
      const formattedDate = new Date(highest.publishedAt).toLocaleDateString('fr-FR');
      notificationManager.emit({
        category: 'updater',
        severity: 'info',
        title: 'Nouvelle version publique détectée (secours)',
        message: `Vanguard Core v${highest.version} (publiée le ${formattedDate}) est disponible sur GitHub Releases.`,
        dedupKey: `fallback-update-${highest.version}`,
        actionTarget: { tab: 'settings' },
      });

      return cachedResult;
    } else {
      cachedResult = {
        status: 'fallback_no_newer_version',
        currentVersion,
        source: 'GitHub Releases publique',
      };
      lastCheckTime = now;
      return cachedResult;
    }
  } catch (err: any) {
    logger.warn('[UpdateFallback] Échec de la vérification de secours :', err.message);
    const result: FallbackCheckResult = {
      status: 'fallback_unavailable',
      error: err.message || 'Secours inaccessible',
      officialUrl: OFFICIAL_RELEASES_URL,
    };
    cachedResult = result;
    lastCheckTime = now;

    notificationManager.emit({
      category: 'updater',
      severity: 'warning',
      title: 'Vérification des mises à jour indisponible',
      message: 'Impossible de contacter le serveur de mise à jour. Consultez la page des versions officielles.',
      dedupKey: 'update-check-unavailable',
      actionTarget: { tab: 'settings' },
    });

    return result;
  }
}

