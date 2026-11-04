/**
 * ASTRAL VANGUARD - MODULE D'ÉVALUATION ET D'ANALYSE DE ROUTAGE VPN
 * 
 * Analyse rigoureuse et déterministe des tables de routage IPv4 :
 * - Prise en charge de la route par défaut classique (0.0.0.0/0)
 * - Prise en charge de la directive OpenVPN 'redirect-gateway def1' :
 *   Paire de routes spécifiques 0.0.0.0/1 et 128.0.0.0/1 vers l'adaptateur VPN.
 *   (La route par défaut physique 0.0.0.0/0 conservée dans la table Windows est normale et attendue).
 * - Détection des paires incomplètes (0.0.0.0/1 seul ou 128.0.0.0/1 seul) -> Couverture partielle invalide.
 * - Détection des routes dirigées vers une autre interface (conflit tiers ou passerelle physique).
 * - Gestion honnête des cas d'échec de lecture ou de table ambiguë.
 */

export type RoutePatternType =
  | 'default_0'         // 0.0.0.0/0 unique pointant vers l'interface cible
  | 'def1_pair'          // Paire complète 0.0.0.0/1 + 128.0.0.0/1 sur l'interface cible
  | 'def1_incomplete'    // Une seule moitié de la paire /1 présente (couverture partielle défectueuse)
  | 'external_interface' // Routes par défaut ou /1 pointant vers une autre interface
  | 'none'               // Aucune route par défaut observée
  | 'unreadable';        // Échec de lecture / données nulles ou corrompues

export interface RouteEntry {
  destinationPrefix: string;  // ex: "0.0.0.0/0", "0.0.0.0/1", "128.0.0.0/1"
  interfaceAlias?: string;
  interfaceIndex?: number;
  nextHop?: string;
  routeMetric?: number;
}

export interface RoutingEvaluation {
  pattern: RoutePatternType;
  isCovered: boolean;              // true si default_0 ou def1_pair sur l'interface attendue
  isConflict: boolean;             // true si une interface tierce intercepte le trafic
  details: string;
  hasDefault0: boolean;
  hasDef1Half0: boolean;           // 0.0.0.0/1
  hasDef1Half128: boolean;         // 128.0.0.0/1
  physicalDefault0Preserved: boolean; // true si 0.0.0.0/0 physique coexiste avec def1_pair (normal)
  matchedInterface?: string;
  expectedInterface?: string;
}

export interface ThirdPartyVpnAdapter {
  name: string;
  alias: string;
  index?: number;
}

export interface ThirdPartyConflictResult {
  state: 'conflict_confirmed' | 'vpn_suspected' | 'no_conflict' | 'unknown';
  vpnName: string | null;
  adapter: string | null;
  pattern: RoutePatternType;
  reason: string;
}

export class VpnRoutingEngine {
  /**
   * Évalue la configuration de routage pour une interface attendue (ex: adaptateur TUN Vanguard)
   */
  public static evaluateTargetRouting(
    routes: RouteEntry[] | null | undefined,
    expectedInterface: { alias?: string; index?: number }
  ): RoutingEvaluation {
    if (!routes || !Array.isArray(routes)) {
      return {
        pattern: 'unreadable',
        isCovered: false,
        isConflict: false,
        details: 'Lecture de la table de routage impossible ou non initialisée.',
        hasDefault0: false,
        hasDef1Half0: false,
        hasDef1Half128: false,
        physicalDefault0Preserved: false,
        expectedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
      };
    }

    const expAlias = (expectedInterface.alias || '').toLowerCase();
    const expIdx = expectedInterface.index;

    const matchesExpected = (r: RouteEntry): boolean => {
      if (expAlias && r.interfaceAlias && r.interfaceAlias.toLowerCase() === expAlias) return true;
      if (expIdx !== undefined && r.interfaceIndex !== undefined && r.interfaceIndex === expIdx) return true;
      return false;
    };

    // Filtrer les routes pertinentes IPv4 par défaut
    const default0Routes = routes.filter((r) => r.destinationPrefix === '0.0.0.0/0');
    const half0Routes = routes.filter((r) => r.destinationPrefix === '0.0.0.0/1');
    const half128Routes = routes.filter((r) => r.destinationPrefix === '128.0.0.0/1');

    // Vérifier les routes spécifiques sur l'interface cible
    const targetHasDefault0 = default0Routes.some(matchesExpected);
    const targetHasHalf0 = half0Routes.some(matchesExpected);
    const targetHasHalf128 = half128Routes.some(matchesExpected);

    // Vérifier si une route 0.0.0.0/0 physique existe en dehors de l'interface cible
    const physicalHasDefault0 = default0Routes.some((r) => !matchesExpected(r));

    // 1. Cas redirect-gateway def1 complet (0.0.0.0/1 ET 128.0.0.0/1 sur le tunnel)
    if (targetHasHalf0 && targetHasHalf128) {
      return {
        pattern: 'def1_pair',
        isCovered: true,
        isConflict: false,
        details: physicalHasDefault0
          ? 'Routage par paire /1 actif (redirect-gateway def1). La route par défaut physique 0.0.0.0/0 reste préservée sans conflit.'
          : 'Routage par paire /1 actif (0.0.0.0/1 et 128.0.0.0/1) couvrant l\'ensemble de l\'espace d\'adresses IPv4.',
        hasDefault0: targetHasDefault0,
        hasDef1Half0: true,
        hasDef1Half128: true,
        physicalDefault0Preserved: physicalHasDefault0,
        matchedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
        expectedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
      };
    }

    // 2. Cas redirect-gateway def1 incomplet (une seule moitié présente sur le tunnel)
    if (targetHasHalf0 || targetHasHalf128) {
      return {
        pattern: 'def1_incomplete',
        isCovered: false,
        isConflict: false,
        details: targetHasHalf0
          ? 'Paire /1 incomplète : 0.0.0.0/1 est présent mais 128.0.0.0/1 est manquant. Le sous-réseau supérieur n\'est pas routé.'
          : 'Paire /1 incomplète : 128.0.0.0/1 est présent mais 0.0.0.0/1 est manquant. Le sous-réseau inférieur n\'est pas routé.',
        hasDefault0: targetHasDefault0,
        hasDef1Half0: targetHasHalf0,
        hasDef1Half128: targetHasHalf128,
        physicalDefault0Preserved: physicalHasDefault0,
        matchedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
        expectedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
      };
    }

    // 3. Cas route par défaut classique (0.0.0.0/0 sur le tunnel)
    if (targetHasDefault0) {
      return {
        pattern: 'default_0',
        isCovered: true,
        isConflict: false,
        details: 'Route par défaut classique (0.0.0.0/0) active sur l\'interface du tunnel.',
        hasDefault0: true,
        hasDef1Half0: false,
        hasDef1Half128: false,
        physicalDefault0Preserved: false,
        matchedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
        expectedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
      };
    }

    // 4. Aucune route par défaut sur l'interface cible, mais des routes par défaut existent ailleurs
    if (default0Routes.length > 0 || half0Routes.length > 0 || half128Routes.length > 0) {
      const otherInterface = (default0Routes[0] || half0Routes[0] || half128Routes[0])?.interfaceAlias || 'Autre interface';
      return {
        pattern: 'external_interface',
        isCovered: false,
        isConflict: true,
        details: `Le trafic par défaut est orienté vers une autre interface (${otherInterface}) et non vers le tunnel.`,
        hasDefault0: default0Routes.length > 0,
        hasDef1Half0: half0Routes.length > 0,
        hasDef1Half128: half128Routes.length > 0,
        physicalDefault0Preserved: default0Routes.length > 0,
        matchedInterface: otherInterface,
        expectedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
      };
    }

    // 5. Aucune route par défaut nulle part
    return {
      pattern: 'none',
      isCovered: false,
      isConflict: false,
      details: 'Aucune route par défaut (0.0.0.0/0 ou /1) détectée dans la table de routage.',
      hasDefault0: false,
      hasDef1Half0: false,
      hasDef1Half128: false,
      physicalDefault0Preserved: false,
      expectedInterface: expectedInterface.alias || String(expectedInterface.index || ''),
    };
  }

  /**
   * Évalue les conflits potentiels avec des logiciels VPN tiers installés
   */
  public static evaluateThirdPartyConflict(
    routes: RouteEntry[] | null | undefined,
    knownAdapters: ThirdPartyVpnAdapter[]
  ): ThirdPartyConflictResult {
    if (!routes || !Array.isArray(routes)) {
      return {
        state: 'unknown',
        vpnName: null,
        adapter: null,
        pattern: 'unreadable',
        reason: 'Impossible de lire les routes réseau système pour déterminer la coexistence.',
      };
    }

    if (!knownAdapters || knownAdapters.length === 0) {
      return {
        state: 'no_conflict',
        vpnName: null,
        adapter: null,
        pattern: 'none',
        reason: 'Aucun adaptateur VPN tiers actif détecté sur la machine.',
      };
    }

    for (const a of knownAdapters) {
      const evalTarget = this.evaluateTargetRouting(routes, { alias: a.alias, index: a.index });

      if (evalTarget.isCovered) {
        // Conflit confirmé : un VPN tiers intercepte déjà le trafic par défaut (soit via 0.0.0.0/0, soit via /1 pair)
        return {
          state: 'conflict_confirmed',
          vpnName: a.name,
          adapter: a.alias,
          pattern: evalTarget.pattern,
          reason: `L'adaptateur ${a.alias} (${a.name}) intercepte activement le trafic par défaut (mode ${evalTarget.pattern === 'def1_pair' ? 'redirect-gateway def1 (0.0.0.0/1 + 128.0.0.0/1)' : '0.0.0.0/0'}).`,
        };
      }
    }

    // Aucun adaptateur tiers ne capte la route par défaut, mais un adaptateur VPN tiers est Up
    const firstSuspect = knownAdapters[0];
    return {
      state: 'vpn_suspected',
      vpnName: firstSuspect.name,
      adapter: firstSuspect.alias,
      pattern: 'none',
      reason: `L'adaptateur ${firstSuspect.alias} (${firstSuspect.name}) est actif (Up) mais ne route pas l'ensemble du trafic par défaut (réseau local ou split-tunneling).`,
    };
  }
}

