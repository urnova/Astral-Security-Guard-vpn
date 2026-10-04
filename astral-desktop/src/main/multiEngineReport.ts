/**
 * ASTRAL VANGUARD v3.0 - RAPPORT MULTI-MOTEUR UNIFIÉ (PHASE 8 / LOT 1)
 *
 * Consolidation et corrélation multi-moteurs :
 * - Présentation distincte de Microsoft Defender, YARA-X, ClamAV et Diagnostic IA
 * - Détection explicite des contradictions et des accords entre moteurs
 * - Calcul d'un indice de confiance réaliste
 * - Recommandations d'actions manuelles sécurisées
 */

import { DefenderThreat, defenderOrchestrator } from './defenderOrchestrator';
import { YaraMatch, yaraEngine } from './yaraEngine';
import { clamAvEngine } from './clamavEngine';
import { localSecurityDiagnostics, SecurityDiagnosis } from './aiDiagnostics';

export interface MultiEngineScanReport {
  timestamp: number;
  target?: string;
  engines: {
    defender: {
      name: 'Moteur Microsoft Defender';
      active: boolean;
      threatCount: number;
      threats: DefenderThreat[];
    };
    yara: {
      name: 'Moteur de règles YARA-X';
      active: boolean;
      rulesCount: number;
      matchCount: number;
      matches: YaraMatch[];
    };
    clamav: {
      name: 'Second avis ClamAV facultatif';
      installed: boolean;
      status: string;
      threatDetected?: string;
    };
  };
  contradictions: string[];
  confidenceLevel: 'Très élevée' | 'Élevée' | 'Modérée' | 'Faible';
  diagnosis: SecurityDiagnosis;
  availableActions: Array<'quarantine' | 'delete' | 'view_details' | 'ignore'>;
}

export class MultiEngineReportAggregator {
  /**
   * Construit un rapport multi-moteur complet pour un fichier ou pour l'état global
   */
  public async generateReport(targetFilePath?: string): Promise<MultiEngineScanReport> {
    const timestamp = Date.now();

    // 1. État et détections Microsoft Defender
    const defStatus = await defenderOrchestrator.getStatus();
    let defThreats: DefenderThreat[] = [];
    if (targetFilePath) {
      // Analyse du fichier spécifique si demandé
      try {
        const scanRes = await defenderOrchestrator.executeScan('custom', targetFilePath);
        defThreats = scanRes.threats;
      } catch {
        defThreats = [];
      }
    } else {
      defThreats = await defenderOrchestrator.getDetectionHistory(10);
    }

    // 2. Moteur YARA-X
    let yaraMatches: YaraMatch[] = [];
    if (targetFilePath) {
      const yaraRes = await yaraEngine.scanFile(targetFilePath);
      yaraMatches = yaraRes.matches;
    }

    // 3. Second avis ClamAV
    const clamStatus = await clamAvEngine.getStatus();
    let clamThreat: string | undefined;
    if (targetFilePath && clamStatus.isInstalled) {
      const clamRes = await clamAvEngine.scanFile(targetFilePath);
      if (!clamRes.isClean) {
        clamThreat = clamRes.threatName;
      }
    }

    // 4. Détection des contradictions entre moteurs
    const contradictions: string[] = [];
    const defHasDetection = defThreats.length > 0;
    const yaraHasDetection = yaraMatches.length > 0;
    const clamHasDetection = Boolean(clamThreat);

    if (!defHasDetection && yaraHasDetection) {
      contradictions.push("Contradiction : YARA-X a détecté des motifs suspects alors que Microsoft Defender n'a émis aucune alerte.");
    }
    if (defHasDetection && !yaraHasDetection) {
      contradictions.push("Contradiction : Microsoft Defender signale une menace non répertoriée par les règles heuristiques locales YARA-X.");
    }
    if (clamStatus.isInstalled && clamHasDetection !== defHasDetection) {
      contradictions.push(`Divergence second avis : ClamAV signale [${clamThreat || 'Sain'}] contrairement à Microsoft Defender.`);
    }

    // 5. Niveau de confiance global
    let confidenceLevel: MultiEngineScanReport['confidenceLevel'] = 'Modérée';
    if (defHasDetection && yaraHasDetection) {
      confidenceLevel = 'Très élevée'; // Accord fort multi-moteur
    } else if (!defHasDetection && !yaraHasDetection && (!clamStatus.isInstalled || !clamHasDetection)) {
      confidenceLevel = 'Élevée'; // Consensus sain
    } else if (contradictions.length > 0) {
      confidenceLevel = 'Modérée'; // Contradiction à examiner
    }

    // 6. Diagnostic IA local déterministe
    const diagnosis = localSecurityDiagnostics.diagnose({
      defenderThreats: defThreats,
      yaraMatches,
      clamAvThreatName: clamThreat,
    });

    // 7. Actions disponibles sécurisées
    const availableActions: Array<'quarantine' | 'delete' | 'view_details' | 'ignore'> = ['view_details'];
    if (diagnosis.riskScore > 0) {
      availableActions.push('quarantine', 'delete', 'ignore');
    }

    return {
      timestamp,
      target: targetFilePath,
      engines: {
        defender: {
          name: 'Moteur Microsoft Defender',
          active: defStatus.isAvailable,
          threatCount: defThreats.length,
          threats: defThreats,
        },
        yara: {
          name: 'Moteur de règles YARA-X',
          active: true,
          rulesCount: yaraEngine.getRuleCount(),
          matchCount: yaraMatches.length,
          matches: yaraMatches,
        },
        clamav: {
          name: 'Second avis ClamAV facultatif',
          installed: clamStatus.isInstalled,
          status: clamStatus.status,
          threatDetected: clamThreat,
        },
      },
      contradictions,
      confidenceLevel,
      diagnosis,
      availableActions,
    };
  }
}

export const multiEngineReport = new MultiEngineReportAggregator();
export const multiEngineReportAggregator = multiEngineReport;
