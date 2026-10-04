/**
 * ASTRAL VANGUARD v3.0 - REGISTRE CENTRALISÉ DE DISPONIBILITÉ DES FONCTIONNALITÉS
 *
 * Définit explicitement et honnêtement le statut de chaque composant de l'application
 * afin de bannir les simulations, faux états de chargement, faux succès et fausses métriques.
 */

export type FeatureStatus =
  | 'available'
  | 'unavailable'
  | 'under-development'
  | 'partially-available'
  | 'error';

export interface FeatureDescriptor {
  id: string;
  name: string;
  status: FeatureStatus;
  reason: string;
  phasePlanned?: string;
  actionDisabled: boolean;
}

export const FEATURES: Record<string, FeatureDescriptor> = {
  // ── VPN & Confidentialité ──
  vpnConnection: {
    id: 'vpnConnection',
    name: 'Tunnel Astral VPN',
    status: 'under-development',
    reason: 'Fonctionnalité en cours de développement — Intégration OpenVPN/Wintun planifiée en Phase 13.',
    phasePlanned: 'Phase 13',
    actionDisabled: true,
  },
  vpnKillSwitch: {
    id: 'vpnKillSwitch',
    name: 'VPN Kill Switch',
    status: 'under-development',
    reason: 'Pare-feu de coupure d\'urgence en cours de développement (requiert le service privilégié Phase 3/13).',
    phasePlanned: 'Phase 13',
    actionDisabled: true,
  },
  vpnServerList: {
    id: 'vpnServerList',
    name: 'Relais VPN Internationaux',
    status: 'under-development',
    reason: 'Aucun faux serveur ou ping simulé n\'est exposé. Liste de passerelles en cours de qualification.',
    phasePlanned: 'Phase 13',
    actionDisabled: true,
  },

  // ── Gaming & Télémétrie In-Game ──
  presentMonFps: {
    id: 'presentMonFps',
    name: 'Compteur de FPS In-Game',
    status: 'unavailable',
    reason: 'FPS indisponibles — PresentMon non installé. Aucun FPS synthétique ou aléatoire.',
    phasePlanned: 'Phase 12',
    actionDisabled: true,
  },
  gamingPriorityProfiles: {
    id: 'gamingPriorityProfiles',
    name: 'Profils de Priorité CPU Gaming',
    status: 'under-development',
    reason: 'Gestionnaire de priorités de processus et plans d\'alimentation en cours de développement.',
    phasePlanned: 'Phase 11',
    actionDisabled: true,
  },

  // ── Réseau & Connectivité ──
  wifiAutoOptimization: {
    id: 'wifiAutoOptimization',
    name: 'Réduction Automatique de Latence Wi-Fi',
    status: 'unavailable',
    reason: 'Aucune promesse de réduction automatique de latence ou rapport simulé avant/après (28ms vers 12ms supprimé).',
    actionDisabled: true,
  },
  speedtestEngine: {
    id: 'speedtestEngine',
    name: 'Test de Débit Réseau',
    status: 'available',
    reason: 'Mesure directe réelle sans plancher forcé ni résultat de secours inventé.',
    actionDisabled: false,
  },
  dnsManagement: {
    id: 'dnsManagement',
    name: 'Changement de Résolveurs DNS',
    status: 'available',
    reason: 'Configuration des résolveurs DNS IPv4 système réelle et opérationnelle.',
    actionDisabled: false,
  },

  // ── Performance & Maintenance ──
  ramPurge: {
    id: 'ramPurge',
    name: 'Purge Mémoire RAM Dédiée',
    status: 'unavailable',
    reason: 'Purge RAM non disponible — L\'appel factice [System.GC]::Collect() a été supprimé. EmptyWorkingSet requiert le helper Phase 3/7.',
    phasePlanned: 'Phase 3 & 7',
    actionDisabled: true,
  },
  systemMaintenance: {
    id: 'systemMaintenance',
    name: 'Maintenance Automatisée du Système',
    status: 'partially-available',
    reason: 'Nettoyage des fichiers temporaires fonctionnel ; purge RAM et optimisation alimentation désactivées car non implémentées.',
    phasePlanned: 'Phase 7',
    actionDisabled: false,
  },
  startupManagement: {
    id: 'startupManagement',
    name: 'Gestion des Applications au Démarrage',
    status: 'available',
    reason: 'Lecture et désactivation des clés Run du Registre Windows opérationnelles.',
    actionDisabled: false,
  },

  // ── Sécurité & Protection ──
  defenderAntivirus: {
    id: 'defenderAntivirus',
    name: 'Moteur Microsoft Defender',
    status: 'partially-available',
    reason: 'Moteur Microsoft Defender réel actif. Faux compteurs de fichiers et faux chemins supprimés. Progression détaillée indisponible.',
    actionDisabled: false,
  },
  downloadScanner: {
    id: 'downloadScanner',
    name: 'Scanner Sécurisé des Téléchargements',
    status: 'available',
    reason: 'Vérification cryptographique SHA-256, session scanId éphémère et scan Defender natif opérationnels.',
    actionDisabled: false,
  },
  thirdPartyVpnDetection: {
    id: 'thirdPartyVpnDetection',
    name: 'Détection VPN Tiers (Coexistence)',
    status: 'available',
    reason: 'Inspection des adaptateurs réseau réels active.',
    actionDisabled: false,
  },
};

/**
 * Vérifie si une fonctionnalité est entièrement disponible
 */
export function isFeatureAvailable(featureId: string): boolean {
  return FEATURES[featureId]?.status === 'available';
}

/**
 * Retourne le descripteur d'une fonctionnalité
 */
export function getFeature(featureId: string): FeatureDescriptor {
  return FEATURES[featureId] || {
    id: featureId,
    name: featureId,
    status: 'unavailable',
    reason: 'Statut inconnu — désactivé par sécurité.',
    actionDisabled: true,
  };
}
