/**
 * Astral Vanguard v3.0 - Scan Session Manager (Phase 1 Security Hardening)
 * 
 * Implements secure ephemeral scan session tokens (scanId):
 * - Canonical paths preserved exclusively in Main process.
 * - Strict rejection of symlinks, directory junctions, and reparse points.
 * - Cryptographic verification (SHA-256, size, mtime) immediately prior to any mutation.
 * - Single-use tokens with anti-replay protection and 5-minute TTL.
 * - Default quarantine isolation and explicit confirmation for permanent deletion.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, shell } from 'electron';
import { logger } from './logger';

export interface ScanSession {
  scanId: string;
  canonicalPath: string;
  fileName: string;
  ext: string;
  sha256: string;
  sizeBytes: number;
  mtimeMs: number;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
  status: 'safe' | 'suspect' | 'threat' | 'unavailable' | 'error';
  threatName?: string;
  isUnsigned?: boolean;
}

export interface SessionVerificationResult {
  valid: boolean;
  error?: string;
  session?: ScanSession;
}

export interface QuarantineResult {
  success: boolean;
  message?: string;
  error?: string;
  quarantinePath?: string;
}

export interface DeleteResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Active in-memory session registry (never exposed directly to renderer)
const activeSessions = new Map<string, ScanSession>();

// Session TTL: 5 minutes (300,000 ms)
const SESSION_TTL_MS = 5 * 60 * 1000;

/**
 * Periodically purge expired sessions to prevent memory leaks
 */
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(id);
    }
  }
}, 60 * 1000);

/**
 * Computes SHA-256 hash of a file synchronously/safely
 */
export function computeFileSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verifies if a path is a symlink, junction, or reparse point
 */
export function isSymlinkOrReparsePoint(filePath: string): boolean {
  try {
    const lstat = fs.lstatSync(filePath);
    return lstat.isSymbolicLink();
  } catch {
    return true; // If stat fails, reject by default
  }
}

/**
 * Creates and registers a new secure ScanSession from a file path
 */
export function createScanSession(
  inputPath: string,
  extraData: {
    status?: 'safe' | 'suspect' | 'threat' | 'unavailable' | 'error';
    threatName?: string;
    isUnsigned?: boolean;
  } = {}
): ScanSession {
  // 1. Resolve canonical real path
  const canonicalPath = fs.realpathSync(inputPath);

  // 2. Reject symlinks, junctions, and reparse points
  if (isSymlinkOrReparsePoint(inputPath) || isSymlinkOrReparsePoint(canonicalPath)) {
    throw new Error('Refus de sécurité : les liens symboliques et points d’analyse sont strictement interdits.');
  }

  // 3. Collect physical metadata
  const lstat = fs.lstatSync(canonicalPath);
  if (!lstat.isFile()) {
    throw new Error('Refus de sécurité : la cible n’est pas un fichier régulier.');
  }

  const sha256 = computeFileSha256(canonicalPath);
  const now = Date.now();
  const scanId = crypto.randomUUID();

  const session: ScanSession = {
    scanId,
    canonicalPath,
    fileName: path.basename(canonicalPath),
    ext: path.extname(canonicalPath).toLowerCase(),
    sha256,
    sizeBytes: lstat.size,
    mtimeMs: lstat.mtimeMs,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    consumed: false,
    status: extraData.status || 'safe',
    threatName: extraData.threatName,
    isUnsigned: extraData.isUnsigned,
  };

  activeSessions.set(scanId, session);
  logger.info(`[ScanSession] Session de scan créée : ${scanId} pour ${session.fileName} (SHA-256: ${sha256.slice(0, 12)}...)`);
  return session;
}

/**
 * Verifies a scan session immediately before any mutation (quarantine/delete)
 * Checks: existence, TTL expiration, single-use, file existence, symlink check,
 * size match, mtime match, and cryptographic SHA-256 match.
 */
export function verifyAndConsumeSession(scanId: string): SessionVerificationResult {
  if (!scanId || typeof scanId !== 'string') {
    return { valid: false, error: 'Identifiant de scan (scanId) manquant ou invalide.' };
  }

  const session = activeSessions.get(scanId);
  if (!session) {
    logger.warn(`[ScanSession] Tentative d'accès avec scanId inconnu : ${scanId}`);
    return { valid: false, error: 'Session de scan introuvable ou déjà expirée.' };
  }

  // 1. Check TTL
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(scanId);
    logger.warn(`[ScanSession] Session de scan expirée : ${scanId}`);
    return { valid: false, error: 'La session de scan a expiré (validité max 5 minutes).' };
  }

  // 2. Check single-use (anti-replay)
  if (session.consumed) {
    logger.warn(`[ScanSession] Tentative de rejeu sur scanId déjà consommé : ${scanId}`);
    return { valid: false, error: 'Cette session de scan a déjà été exécutée (anti-rejeu).' };
  }

  // 3. Verify file presence at canonical path
  if (!fs.existsSync(session.canonicalPath)) {
    return { valid: false, error: 'Le fichier analysé n’existe plus à son emplacement d’origine.' };
  }

  // 4. Verify symlink/reparse point
  if (isSymlinkOrReparsePoint(session.canonicalPath)) {
    return { valid: false, error: 'Altération détectée : le fichier est devenu un lien symbolique.' };
  }

  // 5. Verify size and mtime
  let currentStat: fs.Stats;
  try {
    currentStat = fs.lstatSync(session.canonicalPath);
  } catch (err: any) {
    return { valid: false, error: `Erreur d'accès au fichier : ${err.message}` };
  }

  if (currentStat.size !== session.sizeBytes) {
    logger.warn(`[ScanSession] Taille altérée pour ${session.canonicalPath} (Attendu: ${session.sizeBytes}, Réel: ${currentStat.size})`);
    return { valid: false, error: 'Refus : la taille du fichier a été modifiée depuis son analyse.' };
  }

  if (Math.abs(currentStat.mtimeMs - session.mtimeMs) > 1) { // 1ms margin for filesystem precision
    logger.warn(`[ScanSession] Date de modification altérée pour ${session.canonicalPath}`);
    return { valid: false, error: 'Refus : la date de modification du fichier a changé depuis son analyse.' };
  }

  // 6. Verify cryptographic hash (SHA-256)
  const currentSha = computeFileSha256(session.canonicalPath);
  if (currentSha !== session.sha256) {
    logger.warn(`[ScanSession] Hash SHA-256 altéré pour ${session.canonicalPath}`);
    return { valid: false, error: 'Refus de sécurité : le contenu du fichier a été altéré depuis son analyse.' };
  }

  // 7. Consume session to prevent replay
  session.consumed = true;
  return { valid: true, session };
}

/**
 * Safely resolves the quarantine directory
 */
export function getQuarantineDirectory(): string {
  const baseDir = app ? app.getPath('userData') : path.join(process.env.APPDATA || 'C:\\', 'AstralVanguard');
  const quarantineDir = path.join(baseDir, 'quarantine');
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true, mode: 0o700 });
  }
  return quarantineDir;
}

/**
 * Moves a verified file to the secure quarantine repository
 */
export async function quarantineSessionFile(scanId: string): Promise<QuarantineResult> {
  const verification = verifyAndConsumeSession(scanId);
  if (!verification.valid || !verification.session) {
    return { success: false, error: verification.error || 'Vérification de session échouée.' };
  }

  const session = verification.session;
  try {
    const quarantineDir = getQuarantineDirectory();
    const uniqueToken = crypto.randomBytes(8).toString('hex');
    const quarantineFileName = `${Date.now()}_${uniqueToken}.vanguard_quarantine`;
    const targetQuarantinePath = path.join(quarantineDir, quarantineFileName);

    // Write quarantine metadata sidecar
    const metadata = {
      scanId: session.scanId,
      originalPath: session.canonicalPath,
      originalName: session.fileName,
      sha256: session.sha256,
      sizeBytes: session.sizeBytes,
      quarantinedAtUtc: new Date().toISOString(),
      threatName: session.threatName || 'Fichier suspect',
    };
    fs.writeFileSync(`${targetQuarantinePath}.meta.json`, JSON.stringify(metadata, null, 2), 'utf-8');

    // Move file securely (atomic rename or copy+unlink across volumes)
    try {
      fs.renameSync(session.canonicalPath, targetQuarantinePath);
    } catch (renameErr: any) {
      if (renameErr.code === 'EXDEV') {
        // Cross-device move
        fs.copyFileSync(session.canonicalPath, targetQuarantinePath);
        fs.unlinkSync(session.canonicalPath);
      } else {
        throw renameErr;
      }
    }

    logger.info(`[ScanSession] Fichier mis en quarantaine : ${session.fileName} -> ${targetQuarantinePath}`);
    return {
      success: true,
      message: `Fichier "${session.fileName}" isolé et placé en quarantaine sécurisée.`,
      quarantinePath: targetQuarantinePath,
    };
  } catch (err: any) {
    logger.error(`[ScanSession] Échec de la mise en quarantaine :`, err.message);
    return {
      success: false,
      error: `Échec de la mise en quarantaine : ${err.message}`,
    };
  }
}

/**
 * Permanently deletes a verified file (requires explicit confirmed: true)
 */
export async function deleteSessionFile(scanId: string, confirmed: boolean): Promise<DeleteResult> {
  if (confirmed !== true) {
    return {
      success: false,
      error: 'Refus : confirmation explicite requise pour la suppression définitive.',
    };
  }

  const verification = verifyAndConsumeSession(scanId);
  if (!verification.valid || !verification.session) {
    return { success: false, error: verification.error || 'Vérification de session échouée.' };
  }

  const session = verification.session;
  try {
    // Native node.js deletion without PowerShell invocation
    fs.unlinkSync(session.canonicalPath);
    logger.info(`[ScanSession] Fichier supprimé définitivement : ${session.canonicalPath}`);
    return {
      success: true,
      message: `Fichier "${session.fileName}" supprimé définitivement.`,
    };
  } catch (err: any) {
    logger.error(`[ScanSession] Échec de la suppression définitive :`, err.message);
    return {
      success: false,
      error: `Échec de la suppression : ${err.message}`,
    };
  }
}

/**
 * Reveals the file in Windows Explorer via session token
 */
export function openSessionFolder(scanId: string): { success: boolean; error?: string } {
  if (!scanId || typeof scanId !== 'string') {
    return { success: false, error: 'Identifiant de scan invalide.' };
  }

  const session = activeSessions.get(scanId);
  if (!session) {
    return { success: false, error: 'Session de scan introuvable.' };
  }

  try {
    if (fs.existsSync(session.canonicalPath)) {
      shell.showItemInFolder(session.canonicalPath);
      return { success: true };
    }
    return { success: false, error: 'Le fichier n’existe plus.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Diagnostic helper: retrieve session by id (for internal/test usage only)
 */
export function getSessionForTest(scanId: string): ScanSession | undefined {
  return activeSessions.get(scanId);
}

/**
 * Diagnostic helper: clear all sessions (for test teardown)
 */
export function clearAllSessionsForTest(): void {
  activeSessions.clear();
}
