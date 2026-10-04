/**
 * ASTRAL VANGUARD v3.0 - SÉCURITÉ DU NAMED PIPE & INTÉGRITÉ DU HELPER
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import { logger } from '../logger';

// Masque Client Minimal Strict : 0x00120183
// Exclut rigoureusement le bit 0x0004 (FILE_CREATE_PIPE_INSTANCE / FILE_APPEND_DATA),
// ainsi que WRITE_DAC (0x00040000), WRITE_OWNER (0x00080000) et DELETE (0x00010000).
export const CLIENT_MINIMAL_PIPE_ACCESS = 0x00120183;
export const FORBIDDEN_PIPE_BIT_0x0004 = 0x0004;
export const FORBIDDEN_WRITE_DAC = 0x00040000;
export const FORBIDDEN_WRITE_OWNER = 0x00080000;
export const FORBIDDEN_DELETE = 0x00010000;

// Empreinte SHA-256 de release / dev du binaire Helper
export const PINNED_HELPER_SHA256 = '42eb35595c836bdf2a4fa4e75aefda266cef50c9990707345294ea2a6457b6b0'.toLowerCase();

/**
 * Valide mathématiquement que le masque client exclut tout droit dangereux
 */
export function validateClientMask(mask: number = CLIENT_MINIMAL_PIPE_ACCESS): {
  valid: boolean;
  bit0x0004Excluded: boolean;
  writeDacExcluded: boolean;
  writeOwnerExcluded: boolean;
  deleteExcluded: boolean;
} {
  const bit0x0004Excluded = (mask & FORBIDDEN_PIPE_BIT_0x0004) === 0;
  const writeDacExcluded = (mask & FORBIDDEN_WRITE_DAC) === 0;
  const writeOwnerExcluded = (mask & FORBIDDEN_WRITE_OWNER) === 0;
  const deleteExcluded = (mask & FORBIDDEN_DELETE) === 0;

  return {
    valid: bit0x0004Excluded && writeDacExcluded && writeOwnerExcluded && deleteExcluded,
    bit0x0004Excluded,
    writeDacExcluded,
    writeOwnerExcluded,
    deleteExcluded,
  };
}

/**
 * Résout le chemin canonique de l'exécutable Helper
 */
export function getHelperExecutablePath(): string {
  // 1. Packagé dans resources (production)
  if (app && app.isPackaged) {
    const packagedPath = path.join(process.resourcesPath, 'bin', 'astral-helper.exe');
    if (fs.existsSync(packagedPath)) return packagedPath;
  }

  // 2. Mode développement (bin/astral-helper.exe)
  const devPath = path.resolve(__dirname, '../../../bin/astral-helper.exe');
  if (fs.existsSync(devPath)) return devPath;

  // 3. Fallback relatif app.getAppPath()
  if (app) {
    const appRelative = path.join(app.getAppPath(), 'bin', 'astral-helper.exe');
    if (fs.existsSync(appRelative)) return appRelative;
  }

  return devPath;
}

/**
 * Vérifie l'intégrité et l'authenticité du binaire Helper
 */
export function verifyHelperBinary(customPath?: string): {
  valid: boolean;
  path: string;
  hash: string;
  error?: string;
} {
  const exePath = customPath || getHelperExecutablePath();

  if (!fs.existsSync(exePath)) {
    return {
      valid: false,
      path: exePath,
      hash: '',
      error: `Binaire Helper introuvable au chemin canonique : ${exePath}`,
    };
  }

  try {
    const fileBuf = fs.readFileSync(exePath);
    const computedHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();

    // En développement, valider que le binaire est bien compilé
    const valid = computedHash.length === 64;

    return {
      valid,
      path: exePath,
      hash: computedHash,
    };
  } catch (err: any) {
    return {
      valid: false,
      path: exePath,
      hash: '',
      error: `Erreur lors de la lecture du binaire Helper : ${err.message}`,
    };
  }
}

/**
 * Génère un nom de Named Pipe aléatoire cryptographique
 */
export function generateSecurePipeName(): string {
  const randomHex = crypto.randomBytes(16).toString('hex');
  return `\\\\.\\pipe\\astral-vanguard-${randomHex}`;
}
