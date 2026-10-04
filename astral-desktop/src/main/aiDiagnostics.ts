/**
 * ASTRAL VANGUARD v3.0 - MOTEUR DE DIAGNOSTIC DE SÉCURITÉ LOCAL (PHASE 8 / LOT 1)
 *
 * Moteur d'analyse heuristique et diagnostique 100% autonome et déterministe :
 * - Fonctionnement exclusif hors ligne (zéro compte, zéro clé API, zéro donnée émise)
 * - Synthèse fondée strictement sur les résultats réels multi-moteurs (Defender, YARA-X, ClamAV)
 * - Évaluation technique transparente des facteurs de risque
 * - Recommandations issues d'un catalogue contrôlé et strictement consultatives
 * - RÈGLE ABSOLUE DE SÉCURITÉ : L'IA ne peut JAMAIS exécuter de commande, modifier le Registre,
 *   supprimer un fichier ou appliquer une action de manière automatique.
 */

import { DefenderThreat } from './defenderOrchestrator';
import { YaraMatch } from './yaraEngine';
import { SystemTelemetrySnapshot } from './telemetry';

export type RiskLevel = 'Sain' | 'Faible' | 'Moyen' | 'Élevé' | 'Critique';

export interface HeuristicFactor {
  category: 'malware' | 'script_obfuscation' | 'persistence' | 'evasion' | 'system_integrity';
  name: string;
  sourceEngine: 'Microsoft Defender' | 'YARA-X' | 'ClamAV' | 'Télémétrie Système';
  description: string;
  weight: number;
}

export interface SecurityDiagnosis {
  timestamp: number;
  riskScore: number; // 0 à 100
  riskLevel: RiskLevel;
  summary: string;
  explanation: string;
  factors: HeuristicFactor[];
  safeRecommendations: string[];
  systemHealthSummary: string;
  canExecuteAction: false; // Invariant strict
}

export interface DiagnosticInput {
  defenderThreats?: DefenderThreat[];
  yaraMatches?: YaraMatch[];
  clamAvThreatName?: string | null;
  telemetry?: Partial<SystemTelemetrySnapshot>;
}

export class LocalSecurityDiagnosticsEngine {
  /**
   * Analyse déterministe des éléments de sécurité collectés
   */
  public diagnose(input: DiagnosticInput): SecurityDiagnosis {
    const factors: HeuristicFactor[] = [];
    let cumulativeWeight = 0;

    // 1. Analyse des détections Defender
    const defThreats = input.defenderThreats || [];
    for (const t of defThreats) {
      const name = (t.name || '').toLowerCase();
      let weight = 40;
      let cat: HeuristicFactor['category'] = 'malware';

      if (name.includes('ransom') || name.includes('crypt')) {
        weight = 80;
        cat = 'malware';
      } else if (name.includes('trojan') || name.includes('backdoor')) {
        weight = 65;
        cat = 'malware';
      } else if (name.includes('hacktool') || name.includes('keygen') || name.includes('miner')) {
        weight = 35;
        cat = 'evasion';
      } else if (name.includes('pua') || name.includes('adware')) {
        weight = 20;
        cat = 'evasion';
      }

      cumulativeWeight += weight;
      factors.push({
        category: cat,
        name: t.name || 'Menace Defender',
        sourceEngine: 'Microsoft Defender',
        description: `Signature ou heuristique active signalée par Microsoft Defender. Cible : ${(t.resources || []).join(', ') || 'Inconnue'}.`,
        weight,
      });
    }

    // 2. Analyse des correspondances YARA-X
    const yaraMatches = input.yaraMatches || [];
    for (const m of yaraMatches) {
      let weight = 30;
      let cat: HeuristicFactor['category'] = 'script_obfuscation';

      if (m.severity === 'critical') {
        weight = 70;
        cat = 'malware';
      } else if (m.severity === 'high') {
        weight = 50;
        cat = 'persistence';
      } else if (m.severity === 'medium') {
        weight = 30;
        cat = 'script_obfuscation';
      } else {
        weight = 15;
        cat = 'evasion';
      }

      cumulativeWeight += weight;
      factors.push({
        category: cat,
        name: m.ruleName,
        sourceEngine: 'YARA-X',
        description: m.description,
        weight,
      });
    }

    // 3. Second avis ClamAV
    if (input.clamAvThreatName) {
      cumulativeWeight += 45;
      factors.push({
        category: 'malware',
        name: input.clamAvThreatName,
        sourceEngine: 'ClamAV',
        description: `Second avis indépendant ClamAV signalant la signature [${input.clamAvThreatName}].`,
        weight: 45,
      });
    }

    // 4. Calcul du score normalisé (0 - 100)
    const riskScore = Math.min(100, Math.max(0, cumulativeWeight));

    // 5. Détermination du niveau de risque
    let riskLevel: RiskLevel = 'Sain';
    if (riskScore >= 75) {
      riskLevel = 'Critique';
    } else if (riskScore >= 50) {
      riskLevel = 'Élevé';
    } else if (riskScore >= 30) {
      riskLevel = 'Moyen';
    } else if (riskScore > 0) {
      riskLevel = 'Faible';
    }

    // 6. Synthèse et recommandations
    const summary = this.generateSummary(riskLevel, factors.length);
    const explanation = this.generateExplanation(factors);
    const safeRecommendations = this.generateRecommendations(riskLevel, factors);

    // 7. Évaluation de la santé globale (avec télémétrie si présente)
    let systemHealthSummary = 'Paramètres de télémétrie nominaux.';
    if (input.telemetry?.cpu && input.telemetry.cpu.overallPercent > 90) {
      systemHealthSummary = `Charge CPU élevée (${input.telemetry.cpu.overallPercent}%). Surveillez les processus consommateurs.`;
    }

    return {
      timestamp: Date.now(),
      riskScore,
      riskLevel,
      summary,
      explanation,
      factors,
      safeRecommendations,
      systemHealthSummary,
      canExecuteAction: false, // Invariant absolu
    };
  }

  private generateSummary(risk: RiskLevel, factorCount: number): string {
    switch (risk) {
      case 'Critique':
        return `Alerte de sécurité critique : ${factorCount} indicateur(s) de menace avérée détecté(s). Action immédiate recommandée.`;
      case 'Élevé':
        return `Menace de sévérité élevée identifiée : ${factorCount} anomalie(s) active(s) nécessitant une remédiation manuelle.`;
      case 'Moyen':
        return `Activité suspecte modérée : ${factorCount} motif(s) d'obfuscation ou outil à risque détecté(s).`;
      case 'Faible':
        return `Indicateur mineur : ${factorCount} composant potentiellement indésirable ou non vérifié.`;
      case 'Sain':
      default:
        return 'Système sain : Zéro indicateur de compromission détecté par les moteurs actifs.';
    }
  }

  private generateExplanation(factors: HeuristicFactor[]): string {
    if (factors.length === 0) {
      return "L'analyse conjointe du Moteur Microsoft Defender et des règles locales YARA-X confirme l'absence totale de charge malveillante, de script obfusqué ou de vecteur de persistance connu.";
    }

    const descriptions = factors.map((f) => `• [${f.sourceEngine}] ${f.name} : ${f.description}`);
    return `Analyse détaillée des constatations réelles :\n${descriptions.join('\n')}`;
  }

  private generateRecommendations(risk: RiskLevel, factors: HeuristicFactor[]): string[] {
    const recs: string[] = [];

    if (risk === 'Critique' || risk === 'Élevé') {
      recs.push("Isoler le ou les fichiers concernés en quarantaine via l'interface de sécurité.");
      recs.push('Lancer une analyse complète approfondie de tous les disques.');
      recs.push('Vérifier les points de persistance système (clés de registre Run, tâches planifiées).');
    } else if (risk === 'Moyen') {
      recs.push("Examiner la provenance du fichier avant toute exécution.");
      recs.push("Consulter l'historique des téléchargements et le scanner de sécurité.");
    } else if (risk === 'Faible') {
      recs.push("Maintenir sous surveillance ; analyser avec un second avis si nécessaire.");
    } else {
      recs.push('Protection résidente active. Maintenez vos définitions antivirus à jour.');
      recs.push('Conservez les sauvegardes système périodiques recommandées.');
    }

    return recs;
  }
}

export const localSecurityDiagnostics = new LocalSecurityDiagnosticsEngine();
