/**
 * ASTRAL VANGUARD v3.0 - CLIENT DU HELPER PRIVILÉGIÉ SÉCURISÉ
 *
 * Gère l'élévation UAC ponctuelle à la demande, la communication Named Pipe
 * avec masque client strict 0x00120183, et le catalogue fermé d'actions.
 */

import cp from 'node:child_process';
import crypto from 'node:crypto';
import { logger } from '../logger';
import { isAdmin } from '../adminHelper';
import {
  PrivilegedActionId,
  HelperRequest,
  HelperResponse,
} from './types';
import {
  getHelperExecutablePath,
  verifyHelperBinary,
  generateSecurePipeName,
} from './pipeSecurity';

const ALLOWED_ACTIONS: Set<PrivilegedActionId> = new Set([
  'GET_HELPER_STATUS',
  'FLUSH_DNS',
  'SET_DNS_PROVIDER',
  'DISABLE_STARTUP_ENTRY',
]);

/**
 * Exécute une action privilégiée de manière ponctuelle via le Helper Windows sécurisé
 */
export async function executePrivilegedAction<T = any>(
  actionId: PrivilegedActionId,
  payload: any = {}
): Promise<HelperResponse<T>> {
  // 1. Contrôle strict du catalogue fermé
  if (!ALLOWED_ACTIONS.has(actionId)) {
    logger.error(`[PrivilegedHelper] Action rejetée hors catalogue fermé : ${actionId}`);
    return {
      success: false,
      error: `L'action [${actionId}] ne fait pas partie du catalogue fermé sécurisé.`,
      errorCode: 'UNKNOWN_ACTION',
    };
  }

  // 2. Contrôle du binaire Helper
  const binaryCheck = verifyHelperBinary();
  if (!binaryCheck.valid) {
    logger.error(`[PrivilegedHelper] Binaire Helper non conforme : ${binaryCheck.error}`);
    return {
      success: false,
      error: binaryCheck.error || 'Binaire Helper non conforme.',
      errorCode: 'HELPER_BINARY_INVALID',
    };
  }

  const helperExe = binaryCheck.path;
  const pipeName = generateSecurePipeName();
  const nonce = crypto.randomUUID();
  const currentPid = process.pid;

  logger.info(`[PrivilegedHelper] Préparation de l'action [${actionId}] via pipe éphémère...`);

  // 3. Lancement du serveur Helper
  // REGLE CRITIQUE : Le nonce ne figure JAMAIS dans argv ni dans l'environnement !
  let serverProcess: cp.ChildProcess | null = null;
  const currentIsAdmin = isAdmin();

  try {
    if (currentIsAdmin) {
      // Déjà élevé : lancement direct sans invite UAC superflue
      serverProcess = cp.spawn(helperExe, [
        '--pipe', pipeName,
        '--client-pid', String(currentPid),
      ], {
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
      });
    } else {
      // Non élevé : élévation ponctuelle UAC via 'runas'
      // Utilisation d'un script PowerShell Start-Process -Verb RunAs
      const startScript = `
        try {
          $p = Start-Process -FilePath "${helperExe.replace(/"/g, '`"')}" -ArgumentList "--pipe \`"${pipeName}\`" --client-pid ${currentPid}" -Verb RunAs -WindowStyle Hidden -PassThru
          [PSCustomObject]@{ started = $true; pid = $p.Id } | ConvertTo-Json -Compress
        } catch {
          [PSCustomObject]@{ started = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
        }
      `;

      const launchResult = cp.spawnSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', startScript,
      ], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
      });

      if (launchResult.error || launchResult.status !== 0) {
        logger.warn('[PrivilegedHelper] Échec lancement Helper ou UAC annulée.');
        return {
          success: false,
          error: 'Élévation UAC annulée ou non autorisée par l\'utilisateur.',
          errorCode: 'UAC_CANCELLED',
        };
      }

      try {
        const parsed = JSON.parse(launchResult.stdout.trim());
        if (!parsed.started) {
          logger.warn(`[PrivilegedHelper] UAC refusée : ${parsed.error}`);
          return {
            success: false,
            error: 'Élévation de privilèges refusée par l\'utilisateur.',
            errorCode: 'UAC_CANCELLED',
          };
        }
      } catch {
        // En cas d'ambiguïté de sortie, continuer vers la tentative de connexion pipe
      }
    }
  } catch (err: any) {
    logger.error('[PrivilegedHelper] Erreur au déclenchement UAC :', err.message);
    return {
      success: false,
      error: `Impossible de lancer le Helper privilégié : ${err.message}`,
      errorCode: 'HELPER_SPAWN_FAILED',
    };
  }

  // 4. Attente brève de l'initialisation du pipe serveur (max 1.5s)
  await new Promise((r) => setTimeout(r, 400));

  // 5. Connexion client avec masque minimal strict 0x00120183
  // Transmission in-band du nonce et de la charge utile sur stdin
  const requestBody: HelperRequest = {
    nonce,
    timestamp: Date.now(),
    actionId,
    payload: payload || {},
  };

  try {
    const clientProc = cp.spawnSync(helperExe, [
      'client',
      '--pipe', pipeName,
    ], {
      input: JSON.stringify(requestBody),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    });

    if (clientProc.status !== 0) {
      const errOut = clientProc.stderr || clientProc.stdout || 'Erreur inconnue de communication';
      logger.error(`[PrivilegedHelper] Échec client IPC (Code ${clientProc.status}) : ${errOut}`);
      return {
        success: false,
        error: `Échec de communication avec le Helper : ${errOut.trim()}`,
        errorCode: 'PIPE_COMMUNICATION_ERROR',
      };
    }

    const responseText = (clientProc.stdout || '').trim();
    if (!responseText) {
      return {
        success: false,
        error: 'Réponse vide du Helper privilégié.',
        errorCode: 'EMPTY_RESPONSE',
      };
    }

    const response: HelperResponse<T> = JSON.parse(responseText);
    logger.info(`[PrivilegedHelper] Action [${actionId}] terminée : succès=${response.success}`);
    return response;
  } catch (err: any) {
    logger.error(`[PrivilegedHelper] Erreur IPC in-band pour [${actionId}] :`, err.message);
    return {
      success: false,
      error: `Erreur d'exécution de l'action privilégiée : ${err.message}`,
      errorCode: 'EXECUTION_ERROR',
    };
  } finally {
    if (serverProcess) {
      try { serverProcess.kill(); } catch {}
    }
  }
}
