/**
 * Astral Vanguard - Moteur de Notation Réseau Déterministe
 * 
 * Évalue la connexion sur 3 dimensions rigoureusement séparées :
 * 1. Capacité de transfert (Débits descendant et montant réels)
 * 2. Réactivité au repos (Latence aller-retour et gigue)
 * 3. Stabilité sous charge (Bufferbloat / élévation de latence et échecs de sondes)
 * 
 * RÈGLES FORMELLES :
 * - Aucune valeur manquante n'est assimilée à une valeur favorable.
 * - Tout résultat incomplet donne lieu à un statut « Évaluation partielle » avec note globale « — ».
 * - Les seuils sont une convention produit explicite, sans prétention de débit contractuel FAI.
 * - Règle anti-masquage : la note globale ne peut excéder la dimension la plus faible de plus d'un cran.
 */

export type GradeClass = 'A++' | 'A+' | 'A' | 'B' | 'C' | 'D';

export interface DimensionTransfer {
  status:       'valid' | 'missing' | 'failed';
  downloadMbps: number | null;
  uploadMbps:   number | null;
  grade:        GradeClass | null;
  description:  string;
}

export interface DimensionReactivity {
  status:       'valid' | 'missing' | 'failed';
  idlePingMs:   number | null;
  jitterMs:     number | null;
  grade:        GradeClass | null;
  description:  string;
}

export interface DimensionStability {
  status:              'valid' | 'partial' | 'missing' | 'failed';
  bufferbloatDownMs:   number | null; // élévation en ms pendant le téléchargement
  bufferbloatUpMs:     number | null; // élévation en ms pendant l'envoi
  probeFailureRatePct: number | null;
  grade:               GradeClass | null;
  description:         string;
}

export interface NetworkScoreReport {
  isComplete:       boolean;
  overallGrade:     GradeClass | '—';
  statusLabel:      string;
  summary:          string;
  transfer:         DimensionTransfer;
  reactivity:       DimensionReactivity;
  stability:        DimensionStability;
  conventionNotice: string;
}

const GRADE_RANKS: Record<GradeClass, number> = {
  'A++': 5,
  'A+':  4,
  'A':   3,
  'B':   2,
  'C':   1,
  'D':   0,
};

const RANK_TO_GRADE: GradeClass[] = ['D', 'C', 'B', 'A', 'A+', 'A++'];

/** Évalue la capacité de transfert */
export function evaluateTransfer(down: number | null, up: number | null): DimensionTransfer {
  if (down === null || up === null || down < 0 || up < 0) {
    return {
      status: 'missing',
      downloadMbps: down,
      uploadMbps: up,
      grade: null,
      description: 'Débit descendant ou montant non mesuré.',
    };
  }

  // Évaluation individuelle
  let downRank = 0;
  if (down >= 1500) downRank = 5;      // A++
  else if (down >= 800) downRank = 4;  // A+
  else if (down >= 200) downRank = 3;  // A
  else if (down >= 50)  downRank = 2;  // B
  else if (down >= 15)  downRank = 1;  // C
  else downRank = 0;                  // D

  let upRank = 0;
  if (up >= 500) upRank = 5;
  else if (up >= 200) upRank = 4;
  else if (up >= 50)  upRank = 3;
  else if (up >= 10)  upRank = 2;
  else if (up >= 1)   upRank = 1;
  else upRank = 0;

  // Prise en compte des liaisons asymétriques :
  // Si l'une des directions est critique (D / rank 0), le transfert global ne peut masquer ce blocage
  let combinedRank = 0;
  if (downRank === 0 || upRank === 0) {
    combinedRank = 0; // Bloquant pour les usages interactifs
  } else {
    combinedRank = Math.min(downRank, Math.round(downRank * 0.6 + upRank * 0.4));
  }
  const grade = RANK_TO_GRADE[combinedRank];

  let description = '';
  switch (grade) {
    case 'A++': description = 'Capacité multi-gigabit très élevée.'; break;
    case 'A+':  description = 'Bande passante gigabit confortable.'; break;
    case 'A':   description = 'Très haut débit adapté aux flux simultanés multiples.'; break;
    case 'B':   description = 'Haut débit standard suffisant pour les usages courants.'; break;
    case 'C':   description = 'Débit modéré nécessitant d\'échelonner les téléchargements lourds.'; break;
    default:    description = 'Bande passante restreinte limitant les transferts simultanés.'; break;
  }

  return {
    status: 'valid',
    downloadMbps: down,
    uploadMbps: up,
    grade,
    description,
  };
}

/** Évalue la réactivité au repos */
export function evaluateReactivity(ping: number | null, jitter: number | null): DimensionReactivity {
  if (ping === null || ping <= 0) {
    return {
      status: 'missing',
      idlePingMs: ping,
      jitterMs: jitter,
      grade: null,
      description: 'Latence au repos non mesurée.',
    };
  }

  let rank = 0;
  if (ping <= 8 && (jitter === null || jitter <= 1.2)) rank = 5;       // A++ (Excellence absolue locale/fibre directe)
  else if (ping <= 18 && (jitter === null || jitter <= 3.0)) rank = 4; // A+
  else if (ping <= 35 && (jitter === null || jitter <= 6.0)) rank = 3; // A
  else if (ping <= 60 && (jitter === null || jitter <= 12.0)) rank = 2;// B
  else if (ping <= 95 && (jitter === null || jitter <= 25.0)) rank = 1;// C
  else rank = 0;                                                      // D

  const grade = RANK_TO_GRADE[rank];
  let description = '';
  switch (grade) {
    case 'A++': description = `Réactivité exceptionnelle (${ping} ms, gigue ${jitter !== null ? jitter + ' ms' : '—'}).`; break;
    case 'A+':  description = `Excellente réactivité (${ping} ms, gigue ${jitter !== null ? jitter + ' ms' : '—'}).`; break;
    case 'A':   description = `Temps de réponse rapide et régulier (${ping} ms).`; break;
    case 'B':   description = `Réactivité modérée adaptée à la plupart des applications (${ping} ms).`; break;
    case 'C':   description = `Délai de transit perceptible (${ping} ms).`; break;
    default:    description = `Latence élevée (${ping} ms) pouvant créer un décalage interactif.`; break;
  }

  return {
    status: 'valid',
    idlePingMs: ping,
    jitterMs: jitter,
    grade,
    description,
  };
}

/** Évalue la stabilité sous charge (Bufferbloat & sonde failures) */
export function evaluateStability(
  deltaDownMs: number | null,
  deltaUpMs: number | null,
  probeFailuresPct: number | null
): DimensionStability {
  if (deltaDownMs === null && deltaUpMs === null && probeFailuresPct === null) {
    return {
      status: 'missing',
      bufferbloatDownMs: null,
      bufferbloatUpMs: null,
      probeFailureRatePct: null,
      grade: null,
      description: 'Latence sous charge non mesurée.',
    };
  }

  const maxDelta = Math.max(deltaDownMs ?? 0, deltaUpMs ?? 0);
  const failureRate = probeFailuresPct ?? 0;

  // Si le bufferbloat n'a pas pu être mesuré (aucune sonde sous charge valide)
  if (deltaDownMs === null && deltaUpMs === null) {
    return {
      status: 'missing',
      bufferbloatDownMs: null,
      bufferbloatUpMs: null,
      probeFailureRatePct: failureRate,
      grade: null,
      description: failureRate > 0
        ? `Latence sous charge non mesurée (${failureRate}% d'échecs de sondes).`
        : 'Latence sous charge non mesurée.',
    };
  }

  let rank = 0;
  if (maxDelta <= 8 && failureRate === 0) rank = 5;       // A++
  else if (maxDelta <= 20 && failureRate === 0) rank = 4; // A+
  else if (maxDelta <= 45 && failureRate <= 5) rank = 3;  // A
  else if (maxDelta <= 85 && failureRate <= 10) rank = 2; // B
  else if (maxDelta <= 160 && failureRate <= 20) rank = 1;// C
  else rank = 0;                                         // D

  const grade = RANK_TO_GRADE[rank];
  let description = '';
  switch (grade) {
    case 'A++': description = `Stabilité parfaite sous charge (+${maxDelta} ms max, 0% échec).`; break;
    case 'A+':  description = `Excellente régularité sous charge (+${maxDelta} ms max).`; break;
    case 'A':   description = `Élévation de latence contenue sous transfert (+${maxDelta} ms).`; break;
    case 'B':   description = `Hausse de latence sensible en charge (+${maxDelta} ms).`; break;
    case 'C':   description = `Bufferbloat marqué dégradant la réactivité en transfert (+${maxDelta} ms).`; break;
    default:   description = `Instabilité ou congestion forte en charge (+${maxDelta} ms, ${failureRate}% échecs).`; break;
  }

  return {
    status: 'valid',
    bufferbloatDownMs: deltaDownMs,
    bufferbloatUpMs: deltaUpMs,
    probeFailureRatePct: failureRate,
    grade,
    description,
  };
}

/** Calcule le rapport complet */
export function computeNetworkReport(
  params: {
    downloadMbps: number | null;
    uploadMbps: number | null;
    idlePingMs: number | null;
    jitterMs: number | null;
    bufferbloatDownMs: number | null;
    bufferbloatUpMs: number | null;
    probeFailureRatePct: number | null;
  }
): NetworkScoreReport {
  const transfer = evaluateTransfer(params.downloadMbps, params.uploadMbps);
  const reactivity = evaluateReactivity(params.idlePingMs, params.jitterMs);
  const stability = evaluateStability(params.bufferbloatDownMs, params.bufferbloatUpMs, params.probeFailureRatePct);

  const conventionNotice = 'Indices calculés selon la convention produit Astral Vanguard à des fins d\'aide au diagnostic. Ne constitue pas un engagement de débit contractuel FAI.';

  // Vérifier si toutes les dimensions sont valides
  const hasTransfer = transfer.status === 'valid' && transfer.grade !== null;
  const hasReactivity = reactivity.status === 'valid' && reactivity.grade !== null;
  const hasStability = (stability.status === 'valid' || stability.status === 'partial') && stability.grade !== null;

  if (!hasTransfer || !hasReactivity) {
    return {
      isComplete: false,
      overallGrade: '—',
      statusLabel: 'Évaluation partielle — Données incomplètes',
      summary: 'Lancez un test de débit pour mesurer la capacité de transfert et la réactivité de la ligne.',
      transfer,
      reactivity,
      stability,
      conventionNotice,
    };
  }

  const tRank = GRADE_RANKS[transfer.grade!];
  const rRank = GRADE_RANKS[reactivity.grade!];
  const sRank = stability.grade !== null ? GRADE_RANKS[stability.grade] : rRank;

  // Moyenne pondérée : Transfert 35%, Réactivité 35%, Stabilité 30%
  const weighted = tRank * 0.35 + rRank * 0.35 + sRank * 0.30;
  let rawRank = Math.round(weighted);

  // RÈGLE ANTI-MASQUAGE : la note globale ne peut pas dépasser la note minimale + 1
  const minRank = Math.min(tRank, rRank, sRank);
  const cappedRank = Math.min(rawRank, minRank + 1);

  const overallGrade = RANK_TO_GRADE[Math.max(0, Math.min(RANK_TO_GRADE.length - 1, cappedRank))];

  let statusLabel = '';
  let summary = '';
  switch (overallGrade) {
    case 'A++':
      statusLabel = 'Capacité Multi-Gigabit & Réactivité Optimale';
      summary = `${transfer.description} ${reactivity.description}`;
      break;
    case 'A+':
      statusLabel = 'Excellente Qualité de Ligne Globale';
      summary = `${transfer.description} ${reactivity.description}`;
      break;
    case 'A':
      statusLabel = 'Ligne Très Haut Débit Équilibrée';
      summary = `${transfer.description} ${reactivity.description}`;
      break;
    case 'B':
      statusLabel = 'Connexion Confortable Standard';
      summary = `${transfer.description} ${reactivity.description}`;
      break;
    case 'C':
      statusLabel = 'Liaison Modérée ou Asymétrique';
      summary = `${transfer.description} ${reactivity.description}`;
      break;
    default:
      statusLabel = 'Qualité de Ligne Dégradée ou Restreinte';
      summary = `${transfer.description} ${reactivity.description}`;
      break;
  }

  return {
    isComplete: true,
    overallGrade,
    statusLabel,
    summary,
    transfer,
    reactivity,
    stability,
    conventionNotice,
  };
}
