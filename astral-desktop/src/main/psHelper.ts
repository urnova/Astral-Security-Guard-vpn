import { exec } from 'child_process';
import util from 'util';
import { logger } from './logger';

const execPromise = util.promisify(exec);

export interface PSResult<T = any> {
  success: boolean;
  data?: T;
  stdout?: string;
  error?: string;
  technicalError?: string;
}

/**
 * Encode a string to PowerShell UTF-16LE Base64.
 * This completely avoids cmd.exe quote escaping, parentheses errors,
 * comment stripping, and character encoding issues on Windows 10 & 11.
 */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/**
 * Execute a PowerShell script securely with full error trapping.
 */
export async function runPowerShell<T = any>(
  scriptContent: string,
  options: { timeout?: number; asJson?: boolean } = {}
): Promise<PSResult<T>> {
  const timeout = options.timeout || 30000;

  // Wrap script in an overarching try/catch inside PowerShell
  const wrappedScript = `
    $ErrorActionPreference = 'Stop'
    try {
      ${scriptContent}
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  const base64Command = encodePowerShell(wrappedScript);
  const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64Command}`;

  try {
    const { stdout, stderr } = await execPromise(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      windowsHide: true,
    });

    const trimmedOut = stdout ? stdout.trim() : '';

    if (options.asJson) {
      try {
        const parsed = JSON.parse(trimmedOut);
        return { success: true, data: parsed, stdout: trimmedOut };
      } catch (parseErr) {
        logger.warn('PowerShell output could not be parsed as JSON', { stdout: trimmedOut });
        return { success: true, data: undefined, stdout: trimmedOut };
      }
    }

    return {
      success: true,
      stdout: trimmedOut,
    };
  } catch (err: any) {
    const technical = err.stderr || err.stdout || err.message || String(err);
    logger.error('PowerShell execution failed', { error: technical, scriptSample: scriptContent.slice(0, 150) });

    // Friendly humanized error message
    let humanMessage = 'Une erreur est survenue lors de l\'exécution de l\'opération système.';
    if (technical.includes('Administrator') || technical.includes('Access is denied') || technical.includes('Accès refusé')) {
      humanMessage = 'Privilèges insuffisants : cette action nécessite les droits administrateur.';
    } else if (technical.includes('timeout') || err.killed) {
      humanMessage = 'L\'opération a expiré (délai dépassé). Le système était peut-être occupé.';
    } else if (technical.includes('network') || technical.includes('hôte inconnu')) {
      humanMessage = 'Problème de connectivité réseau lors de l\'exécution.';
    }

    return {
      success: false,
      error: humanMessage,
      technicalError: technical.trim(),
    };
  }
}
