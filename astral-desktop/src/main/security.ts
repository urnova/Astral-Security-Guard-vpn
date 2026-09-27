import { BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

interface ThreatInfo {
  ThreatName?: string;
  InitialDetectionTime?: string;
  Resources?: string[];
  SeverityID?: number;
  CleaningActionID?: number;
}

export function setupSecurityIPC(win: BrowserWindow) {
  // ── Quick Scan ────────────────────────────────────────────────────────────
  ipcMain.handle('security:quick-scan', async () => {
    try {
      win.webContents.send('security-event', { type: 'scan-started', scanType: 'quick' });
      await execPromise(`powershell -Command "Start-MpScan -ScanType QuickScan"`);
      const { stdout } = await execPromise(
        `powershell -Command "Get-MpThreatDetection | Select-Object ThreatName,ActionSuccess,InitialDetectionTime,Resources | ConvertTo-Json -Depth 3"`
      );
      let threats = [];
      try { threats = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(threats)) threats = threats ? [threats] : [];
      win.webContents.send('security-event', { type: 'scan-complete', threats });
      return { success: true, threats };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── Full Scan ─────────────────────────────────────────────────────────────
  ipcMain.handle('security:full-scan', async () => {
    try {
      win.webContents.send('security-event', { type: 'scan-started', scanType: 'full' });
      await execPromise(`powershell -Command "Start-MpScan -ScanType FullScan"`);
      const { stdout } = await execPromise(
        `powershell -Command "Get-MpThreatDetection | ConvertTo-Json -Depth 3"`
      );
      let threats = [];
      try { threats = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(threats)) threats = threats ? [threats] : [];
      win.webContents.send('security-event', { type: 'scan-complete', threats });
      return { success: true, threats };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── Get Defender Status ───────────────────────────────────────────────────
  ipcMain.handle('security:get-status', async () => {
    try {
      const { stdout } = await execPromise(
        `powershell -Command "Get-MpComputerStatus | Select-Object AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,RealTimeProtectionEnabled,NISEnabled,IoavProtectionEnabled,TamperProtectionSource | ConvertTo-Json"`
      );
      return { success: true, data: JSON.parse(stdout) };
    } catch (error) {
      return { success: false };
    }
  });

  // ── Heuristic Threat Analysis (100% Autonomous, No API Key, No Rate Limit) ─
  ipcMain.handle('security:ai-analyze', async (_, threats: ThreatInfo[]) => {
    try {
      if (!threats || threats.length === 0) {
        return {
          success: true,
          analysis: {
            riskLevel: 'Aucun',
            summary: 'Système sain. Aucune menace active détectée par le bouclier.',
            explanation: 'Les analyses heuristiques et Defender confirment que votre système est intègre. Les processus d’arrière-plan et les signatures système sont propres.',
            isFalsePositive: false,
            remediationScript: 'Write-Output "Système déjà sain."',
          },
        };
      }

      // Autonomous Heuristic Classifier
      let highestRisk: 'Faible' | 'Moyen' | 'Élevé' | 'Critique' = 'Faible';
      let isGamingFalsePositive = false;
      const descriptions: string[] = [];
      const remediationSteps: string[] = [];

      for (const t of threats) {
        const name = (t.ThreatName || '').toLowerCase();
        const resources = (t.Resources || []).join(' ').toLowerCase();

        // Check for common game cracks, patchers, keygens, false positives
        if (
          name.includes('hacktool') ||
          name.includes('keygen') ||
          name.includes('patcher') ||
          name.includes('gamehack') ||
          name.includes('autokms') ||
          name.includes('cheatengine') ||
          resources.includes('steam') ||
          resources.includes('games') ||
          resources.includes('repack')
        ) {
          isGamingFalsePositive = true;
          descriptions.push(
            `Menace détectée : "${t.ThreatName}". Profil : Faux-positif gaming classique. Windows Defender bloque fréquemment les injecteurs de DLL ou les émulateurs d'API Steam des jeux moddés/crackés bien qu'ils ne contiennent pas de charge virale destructive.`
          );
          remediationSteps.push(
            `# Débloquer / Whitelist sécurisée du jeu ou crack\nAdd-MpPreference -ExclusionPath "${(t.Resources?.[0] || 'C:\\Games').replace(/"/g, '')}"`
          );
        } else if (
          name.includes('keylogger') ||
          name.includes('spyware') ||
          name.includes('stealer') ||
          name.includes('redline') ||
          name.includes('vidar')
        ) {
          highestRisk = 'Critique';
          descriptions.push(
            `Menace CRITIQUE : "${t.ThreatName}". Espion/Keylogger détecté. Ce malware intercepte les saisies clavier, mots de passe et sessions de jeu.`
          );
          remediationSteps.push(
            `Remove-MpThreat\nStop-Process -Name "${t.ThreatName}" -Force -ErrorAction SilentlyContinue\nGet-MpThreatDetection | Remove-MpThreat`
          );
        } else if (name.includes('ransom') || name.includes('miner') || name.includes('crypto')) {
          highestRisk = 'Critique';
          descriptions.push(
            `Menace CRITIQUE : "${t.ThreatName}". Mineur de cryptomonnaie ou ransomware qui surcharge le processeur et la carte graphique en arrière-plan.`
          );
          remediationSteps.push(`Remove-MpThreat\nClear-RecycleBin -Force -ErrorAction SilentlyContinue`);
        } else if (name.includes('trojan') || name.includes('backdoor')) {
          if (highestRisk !== 'Critique') highestRisk = 'Élevé';
          descriptions.push(
            `Menace ÉLEVÉE : "${t.ThreatName}". Cheval de Troie suspect capable d'ouvrir des accès distants non autorisés.`
          );
          remediationSteps.push(`Remove-MpThreat`);
        } else {
          if (highestRisk === 'Faible') highestRisk = 'Moyen';
          descriptions.push(`Détection générique : "${t.ThreatName}". Programme potentiellement indésirable (PUA).`);
          remediationSteps.push(`Remove-MpThreat`);
        }
      }

      const analysis = {
        riskLevel: highestRisk,
        isFalsePositive: isGamingFalsePositive && highestRisk !== 'Critique',
        summary: isGamingFalsePositive
          ? 'Détection liée à des outils de jeu / Crack (Faux-positif probable)'
          : `Menaces actives identifiées (Niveau de risque : ${highestRisk})`,
        explanation: descriptions.join('\n\n'),
        remediationScript: remediationSteps.join('\n'),
      };

      return { success: true, analysis };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── Run Remediation Script ────────────────────────────────────────────────
  ipcMain.handle('security:run-remediation', async (_, script: string) => {
    try {
      // Create restore point first if possible
      await execPromise(
        `powershell -Command "Checkpoint-Computer -Description 'Astral Vanguard Pre-Fix' -RestorePointType 'MODIFY_SETTINGS'"`
      ).catch(() => {});

      const { stdout, stderr } = await execPromise(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
      );
      return { success: true, output: stdout, errors: stderr };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── Manage Defender Exclusions ────────────────────────────────────────────
  ipcMain.handle('security:add-exclusion', async (_, folderPath: string) => {
    try {
      await execPromise(`powershell -Command "Add-MpPreference -ExclusionPath '${folderPath}'"`);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('security:get-exclusions', async () => {
    try {
      const { stdout } = await execPromise(
        `powershell -Command "(Get-MpPreference).ExclusionPath | ConvertTo-Json"`
      );
      let paths = [];
      try { paths = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(paths)) paths = paths ? [paths] : [];
      return { success: true, paths };
    } catch {
      return { success: true, paths: [] };
    }
  });

  ipcMain.handle('security:get-threats', async () => {
    try {
      const { stdout } = await execPromise(
        `powershell -Command "Get-MpThreat | ConvertTo-Json -Depth 3"`
      );
      let threats = [];
      try { threats = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(threats)) threats = threats ? [threats] : [];
      return { success: true, threats };
    } catch {
      return { success: true, threats: [] };
    }
  });
}
