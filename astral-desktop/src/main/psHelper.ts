import cp from 'child_process';
import { logger } from './logger';

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
 * Spawns powershell.exe directly with -WindowStyle Hidden and windowsHide: true
 * to guarantee that no console windows or prompts ever appear on user screen.
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

  return new Promise((resolve) => {
    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    const child = cp.spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        base64Command,
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
      resolve({
        success: false,
        error: "L'opération a expiré (délai dépassé). Le système était peut-être occupé.",
        technicalError: 'Process timed out and was killed.',
      });
    }, timeout);

    child.stdout?.on('data', (chunk) => {
      stdoutData += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk) => {
      stderrData += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      logger.error('PowerShell spawn error', { error: err.message });
      resolve({
        success: false,
        error: "Erreur lors du lancement de l'opération système.",
        technicalError: err.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      const trimmedOut = stdoutData.trim();
      const trimmedErr = stderrData.trim();

      if (code !== 0 && code !== null) {
        const technical = trimmedErr || trimmedOut || `Exit code ${code}`;
        logger.error('PowerShell execution failed', { error: technical, scriptSample: scriptContent.slice(0, 150) });

        let humanMessage = "Une erreur est survenue lors de l'exécution de l'opération système.";
        if (technical.includes('Administrator') || technical.includes('Access is denied') || technical.includes('Accès refusé')) {
          humanMessage = 'Privilèges insuffisants : cette action nécessite les droits administrateur.';
        } else if (technical.includes('timeout')) {
          humanMessage = "L'opération a expiré (délai dépassé). Le système était peut-être occupé.";
        } else if (technical.includes('network') || technical.includes('hôte inconnu')) {
          humanMessage = "Problème de connectivité réseau lors de l'exécution.";
        }

        resolve({
          success: false,
          error: humanMessage,
          technicalError: technical,
        });
        return;
      }

      if (options.asJson) {
        try {
          const parsed = JSON.parse(trimmedOut);
          resolve({ success: true, data: parsed, stdout: trimmedOut });
        } catch {
          logger.warn('PowerShell output could not be parsed as JSON', { stdout: trimmedOut });
          resolve({ success: true, data: undefined, stdout: trimmedOut });
        }
        return;
      }

      resolve({
        success: true,
        stdout: trimmedOut,
      });
    });
  });
}
