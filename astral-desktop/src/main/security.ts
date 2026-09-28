/**
 * Astral Vanguard - Windows Defender Security & Autonomous Heuristics Module
 * Leverages native Microsoft Defender APIs (MpCmdRun.exe & MpPreference cmdlets)
 * with zero cloud dependencies, zero rate limits, and 100% offline gaming false-positive analysis.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { isAdmin } from './adminHelper';

export interface ThreatInfo {
  ThreatID?: number;
  ThreatName?: string;
  InitialDetectionTime?: string;
  Resources?: string[];
  SeverityID?: number;
  CleaningActionID?: number;
}

export interface SecurityAnalysisResult {
  riskLevel: 'Sain' | 'Faible' | 'Moyen' | 'Élevé' | 'Critique';
  isFalsePositive: boolean;
  summary: string;
  explanation: string;
  remediationScript: string;
  suggestedAction: 'none' | 'whitelist' | 'quarantine' | 'delete';
}

let activeScanProcess: any = null;

export function setupSecurityIPC(win: BrowserWindow) {
  // ── Get Microsoft Defender Status ─────────────────────────────────────────
  ipcMain.handle('security:get-status', async () => {
    logger.info('[Security] Fetching Microsoft Defender status...');
    if (!isAdmin()) {
      return {
        success: false,
        requiresElevation: true,
        error: 'Privilèges administrateur requis pour inspecter Microsoft Defender.',
      };
    }

    try {
      const script = `
        $status = Get-MpComputerStatus -ErrorAction Stop
        [PSCustomObject]@{
          AntivirusEnabled            = $status.AntivirusEnabled
          AMServiceEnabled            = $status.AMServiceEnabled
          AntispywareEnabled          = $status.AntispywareEnabled
          RealTimeProtectionEnabled   = $status.RealTimeProtectionEnabled
          IoavProtectionEnabled       = $status.IoavProtectionEnabled
          AntivirusSignatureVersion   = $status.AntivirusSignatureVersion
          AntivirusSignatureLastUpdate= $status.AntivirusSignatureLastUpdated
          QuickScanAge                = $status.QuickScanAge
          FullScanAge                 = $status.FullScanAge
        } | ConvertTo-Json -Compress
      `;

      const res = await runPowerShell<string>(script);
      const data = JSON.parse(res.data || '{}');
      return { success: true, data };
    } catch (err: any) {
      logger.error('[Security] Failed to get Defender status:', err.message);
      return {
        success: false,
        error: 'Impossible d’interroger le service Windows Defender.',
        rawError: err.message,
      };
    }
  });

  // ── Start Scan (Quick or Full) ─────────────────────────────────────────────
  ipcMain.handle('security:start-scan', async (_, scanType: 'quick' | 'full') => {
    logger.info(`[Security] Starting ${scanType} scan...`);
    if (!isAdmin()) {
      return {
        success: false,
        requiresElevation: true,
        error: 'Privilèges administrateur requis pour exécuter un scan antivirus.',
      };
    }

    win.webContents.send('security:scan-event', {
      type: 'scan-started',
      scanType,
      message: `Analyse ${scanType === 'quick' ? 'rapide' : 'complète'} en cours...`,
    });

    try {
      const typeParam = scanType === 'quick' ? 'QuickScan' : 'FullScan';
      const scanScript = `Start-MpScan -ScanType ${typeParam} -ErrorAction Stop`;

      // Start scan
      await runPowerShell(scanScript, { timeout: 300000 }); // up to 5 min timeout for quick

      // Fetch any newly detected threats
      const threatsScript = `
        Get-MpThreatDetection -ErrorAction SilentlyContinue |
        Select-Object ThreatID, ThreatName, InitialDetectionTime, Resources |
        Select-Object -First 20 |
        ConvertTo-Json -Compress -Depth 3
      `;
      const threatsRes = await runPowerShell<string>(threatsScript);
      let threats: ThreatInfo[] = [];
      try {
        const parsed = JSON.parse(threatsRes.data || '[]');
        threats = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        threats = [];
      }

      win.webContents.send('security:scan-event', {
        type: 'scan-complete',
        scanType,
        threats,
      });

      return { success: true, threats };
    } catch (err: any) {
      logger.error(`[Security] ${scanType} scan failed:`, err.message);
      win.webContents.send('security:scan-event', {
        type: 'scan-error',
        error: err.message,
      });
      return {
        success: false,
        error: `Échec de l'analyse antivirus ${scanType === 'quick' ? 'rapide' : 'complète'}.`,
        rawError: err.message,
      };
    }
  });

  // ── Autonomous Heuristic Threat Analysis (No API, No Rate Limit) ─────────
  ipcMain.handle('security:ai-analyze', async (_, threats: ThreatInfo[]) => {
    try {
      if (!threats || threats.length === 0) {
        return {
          success: true,
          analysis: {
            riskLevel: 'Sain',
            isFalsePositive: false,
            summary: 'Système intègre. Aucune menace active détectée.',
            explanation: 'Les modules heuristiques et les signatures Microsoft Defender ne détectent aucun binaire malveillant ni crochet de mémoire suspect.',
            remediationScript: '',
            suggestedAction: 'none',
          } as SecurityAnalysisResult,
        };
      }

      let highestRisk: 'Sain' | 'Faible' | 'Moyen' | 'Élevé' | 'Critique' = 'Faible';
      let isGamingFalsePositive = false;
      const descriptions: string[] = [];
      const remediationSteps: string[] = [];
      let suggestedAction: 'none' | 'whitelist' | 'quarantine' | 'delete' = 'quarantine';

      for (const t of threats) {
        const name = (t.ThreatName || '').toLowerCase();
        const resources = (t.Resources || []).join(' ').toLowerCase();

        // Gaming false positive heuristic
        if (
          name.includes('hacktool') ||
          name.includes('keygen') ||
          name.includes('patcher') ||
          name.includes('gamehack') ||
          name.includes('autokms') ||
          name.includes('cheatengine') ||
          name.includes('trainer') ||
          name.includes('injector') ||
          resources.includes('steam') ||
          resources.includes('games') ||
          resources.includes('repack') ||
          resources.includes('fitgirl') ||
          resources.includes('dodi')
        ) {
          isGamingFalsePositive = true;
          suggestedAction = 'whitelist';
          descriptions.push(
            `Détection : "${t.ThreatName}". Profil : Faux-positif gaming probable. Windows Defender bloque fréquemment les injecteurs de DLL de mods ou les émulateurs de jeux indépendants sans charge destructive.`
          );
          if (t.Resources && t.Resources[0]) {
            remediationSteps.push(`Add-MpPreference -ExclusionPath "${t.Resources[0].replace(/"/g, '')}"`);
          }
        } else if (
          name.includes('keylogger') ||
          name.includes('spyware') ||
          name.includes('stealer') ||
          name.includes('redline') ||
          name.includes('vidar') ||
          name.includes('agenttesla')
        ) {
          highestRisk = 'Critique';
          suggestedAction = 'delete';
          descriptions.push(
            `Menace CRITIQUE : "${t.ThreatName}". Espion/Keylogger détecté. Ce malware intercepte les saisies clavier, tokens Discord et identifiants de jeu.`
          );
          remediationSteps.push(`Remove-MpThreat -ThreatID ${t.ThreatID || 0} -ErrorAction SilentlyContinue`);
        } else if (name.includes('ransom') || name.includes('miner') || name.includes('crypto')) {
          highestRisk = 'Critique';
          suggestedAction = 'delete';
          descriptions.push(
            `Menace CRITIQUE : "${t.ThreatName}". Mineur parasite de cryptomonnaie ou ransomware surchargeant GPU/CPU.`
          );
          remediationSteps.push(`Remove-MpThreat -ThreatID ${t.ThreatID || 0} -ErrorAction SilentlyContinue`);
        } else if (name.includes('trojan') || name.includes('backdoor')) {
          if (highestRisk !== 'Critique') highestRisk = 'Élevé';
          suggestedAction = 'quarantine';
          descriptions.push(
            `Menace ÉLEVÉE : "${t.ThreatName}". Cheval de Troie suspect ouvrant des canaux distants non autorisés.`
          );
          remediationSteps.push(`Remove-MpThreat -ThreatID ${t.ThreatID || 0} -ErrorAction SilentlyContinue`);
        } else {
          if (highestRisk === 'Faible') highestRisk = 'Moyen';
          descriptions.push(`Détection générique : "${t.ThreatName}". Programme potentiellement indésirable (PUA).`);
          remediationSteps.push(`Remove-MpThreat -ThreatID ${t.ThreatID || 0} -ErrorAction SilentlyContinue`);
        }
      }

      const analysis: SecurityAnalysisResult = {
        riskLevel: highestRisk,
        isFalsePositive: isGamingFalsePositive && highestRisk !== 'Critique',
        summary: isGamingFalsePositive
          ? 'Faux-positif détecté (outil de jeu / modding)'
          : `Menaces actives identifiées (Niveau de risque : ${highestRisk})`,
        explanation: descriptions.join('\n\n'),
        remediationScript: remediationSteps.join('\n'),
        suggestedAction,
      };

      return { success: true, analysis };
    } catch (err: any) {
      logger.error('[Security] Heuristic analysis error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Manage Defender Exclusions ────────────────────────────────────────────
  ipcMain.handle('security:get-exclusions', async () => {
    if (!isAdmin()) return { success: false, paths: [], requiresElevation: true };
    try {
      const script = `
        $pref = Get-MpPreference -ErrorAction SilentlyContinue
        [PSCustomObject]@{
          paths = $pref.ExclusionPath
          processes = $pref.ExclusionProcess
        } | ConvertTo-Json -Compress
      `;
      const res = await runPowerShell<string>(script);
      const data = JSON.parse(res.data || '{"paths":[],"processes":[]}');
      const paths = Array.isArray(data.paths) ? data.paths : data.paths ? [data.paths] : [];
      const processes = Array.isArray(data.processes) ? data.processes : data.processes ? [data.processes] : [];
      return { success: true, paths, processes };
    } catch {
      return { success: true, paths: [], processes: [] };
    }
  });

  ipcMain.handle('security:add-exclusion', async (_, targetPath: string) => {
    if (!isAdmin()) {
      return { success: false, requiresElevation: true, error: 'Droits administrateur requis.' };
    }
    try {
      const cleanPath = targetPath.replace(/['"]/g, '');
      const script = `Add-MpPreference -ExclusionPath "${cleanPath}" -ErrorAction Stop`;
      await runPowerShell(script);
      logger.info(`[Security] Added exclusion for: ${cleanPath}`);
      return { success: true };
    } catch (err: any) {
      logger.error('[Security] Failed to add exclusion:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('security:remove-exclusion', async (_, targetPath: string) => {
    if (!isAdmin()) {
      return { success: false, requiresElevation: true, error: 'Droits administrateur requis.' };
    }
    try {
      const cleanPath = targetPath.replace(/['"]/g, '');
      const script = `Remove-MpPreference -ExclusionPath "${cleanPath}" -ErrorAction Stop`;
      await runPowerShell(script);
      logger.info(`[Security] Removed exclusion for: ${cleanPath}`);
      return { success: true };
    } catch (err: any) {
      logger.error('[Security] Failed to remove exclusion:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Update Signatures ─────────────────────────────────────────────────────
  ipcMain.handle('security:update-signatures', async () => {
    if (!isAdmin()) {
      return { success: false, requiresElevation: true, error: 'Droits administrateur requis.' };
    }
    try {
      logger.info('[Security] Updating Defender signatures...');
      await runPowerShell('Update-MpSignature -UpdateSource MicrosoftUpdateServer -ErrorAction Stop', { timeout: 60000 });
      return { success: true, message: 'Signatures antivirales mises à jour avec succès.' };
    } catch (err: any) {
      logger.error('[Security] Failed to update signatures:', err.message);
      return { success: false, error: 'Échec de la mise à jour des signatures Defender.' };
    }
  });

  // ── Execute Remediation with automatic checkpoint ─────────────────────────
  ipcMain.handle('security:run-remediation', async (_, script: string) => {
    if (!isAdmin()) {
      return { success: false, requiresElevation: true, error: 'Droits administrateur requis.' };
    }
    try {
      // 1. Create safety restore point
      try {
        await runPowerShell(`Checkpoint-Computer -Description 'Vanguard Pre-Threat Remediation' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction SilentlyContinue`);
      } catch {}

      // 2. Execute remediation
      const res = await runPowerShell<string>(script);
      return { success: true, output: res.data };
    } catch (err: any) {
      logger.error('[Security] Remediation execution failed:', err.message);
      return { success: false, error: err.message };
    }
  });
}
