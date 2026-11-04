/**
 * Scanner Exclusions & File Filters — Vanguard Core
 * 
 * Logique pure et déterministe pour le filtrage amont des fichiers :
 * - Exclusion immédiate des fichiers système Windows (desktop.ini, thumbs.db)
 * - Exclusion des fichiers temporaires (.tmp, .crdownload, .part, installateurs en cours)
 * - Filtrage des extensions ignorées (.txt, .md, médias)
 * - Préservation stricte des fichiers sentinelles de test (EICAR, vanguard-)
 */

import path from 'node:path';

export const SYSTEM_IGNORED_FILES = new Set([
  'desktop.ini',
  'thumbs.db',
  'ehthumbs.db',
  'ehthumbs_vista.db',
]);

export const TEMP_DOWNLOAD_EXTS = new Set([
  '.crdownload', // Chrome, Edge, Brave, Opera
  '.part',       // Firefox
  '.opdownload', // Opera
  '.tmp',        // Windows / Navigateur Temp
  '.download',   // Générique
  '.partial',    // Générique
]);

export const DEFAULT_IGNORED_EXTS = [
  '.txt', '.log', '.md',
  '.mp3', '.wav', '.flac', '.aac', '.ogg',
  '.mp4', '.mkv', '.avi', '.mov', '.webm',
];

/**
 * Filtre immédiat et déterministe pour les fichiers système, temporaires ou exclus
 */
export function shouldIgnoreFile(filename: string, ignoredExtensions: string[] = DEFAULT_IGNORED_EXTS): boolean {
  if (!filename) return true;
  const lowerName = filename.toLowerCase().trim();
  const ext = path.extname(filename).toLowerCase();

  // 1. Fichiers système Windows (desktop.ini, thumbs.db)
  if (SYSTEM_IGNORED_FILES.has(lowerName)) {
    return true;
  }

  // 2. Fichiers temporaires de téléchargement ou d'installation
  if (
    TEMP_DOWNLOAD_EXTS.has(ext) ||
    lowerName.startsWith('.') ||
    lowerName.startsWith('~') ||
    lowerName.startsWith('is-') || // Inno Setup
    lowerName.startsWith('unconfirmed ') ||
    lowerName.includes('.msi.tmp') ||
    lowerName.includes('.nsis') ||
    lowerName.endsWith('.tmp')
  ) {
    return true;
  }

  // 3. Extensions ignorées configurées (sauf fichiers sentinelles de test eicar / vanguard-)
  const isSecurityTestFile = lowerName.includes('eicar') || lowerName.includes('vanguard-');
  const ignored = ignoredExtensions.map((e) => e.toLowerCase().trim());
  if (!isSecurityTestFile && ignored.includes(ext)) {
    return true;
  }

  return false;
}

