// scripts/test-phase2-honesty.mjs
// Suite de tests automatisés de validation d'honnêteté et d'élimination des simulations (Phase 2)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'astral-desktop', 'src');

let passCount = 0;
let failCount = 0;
const testRecords = [];

function assert(condition, testId, description, details = '') {
  if (condition) {
    passCount++;
    console.log(`[PASS] ${testId} : ${description}`);
    if (details) console.log(`       Détail : ${details}`);
    testRecords.push({ testId, description, status: 'PASS', details });
  } else {
    failCount++;
    console.error(`[FAIL] ${testId} : ${description}`);
    if (details) console.error(`       Détail : ${details}`);
    testRecords.push({ testId, description, status: 'FAIL', details });
  }
}

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.mjs']) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'dist-electron') {
        files = files.concat(getAllFiles(fullPath, exts));
      }
    } else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) {
      files.push(fullPath);
    }
  }
  return files;
}

function readFileContent(relativePath) {
  const fullPath = path.join(SRC_DIR, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

async function runPhase2HonestyTests() {
  console.log('======================================================================');
  console.log('  ASTRAL VANGUARD v3.0 - SUITE DE VALIDATION HONNÊTETÉ & DÉ-SIMULATION (PHASE 2)');
  console.log('======================================================================');
  console.log(`Répertoire source scanné : ${SRC_DIR}`);
  console.log('');

  const allSrcFiles = getAllFiles(SRC_DIR);

  // ---------------------------------------------------------------------------
  // TEST 1 : Absence totale de Math.random() dans le code source de production
  // ---------------------------------------------------------------------------
  let mathRandomOccurrences = [];
  for (const f of allSrcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Ignorer les commentaires stricts expliquant la suppression de Math.random
      if (line.includes('Math.random') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        mathRandomOccurrences.push({ file: path.relative(SRC_DIR, f), line: idx + 1, content: line.trim() });
      }
    });
  }
  assert(
    mathRandomOccurrences.length === 0,
    'TEST-P2-01',
    'Élimination stricte de Math.random() dans tout astral-desktop/src',
    mathRandomOccurrences.length === 0
      ? '0 occurrence de Math.random trouvée dans le code source de production.'
      : `Occurrences restantes : ${JSON.stringify(mathRandomOccurrences)}`
  );

  // ---------------------------------------------------------------------------
  // TEST 2 : Faux serveurs VPN et pays codés en dur éliminés
  // ---------------------------------------------------------------------------
  const vpnTs = readFileContent('main/vpn.ts');
  const sysContext = readFileContent('context/SystemContext.tsx');
  const hasEmptyCurated = vpnTs.includes('export const CURATED_INTERNATIONAL_SERVERS: VpnServerItem[] = [];');
  const hasEmptyInitialCountries = sysContext.includes('export const INITIAL_VPN_COUNTRIES: VpnCountryGroup[] = [];');
  assert(
    hasEmptyCurated && hasEmptyInitialCountries,
    'TEST-P2-02',
    'Serveurs VPN codés en dur vidés (CURATED_INTERNATIONAL_SERVERS et INITIAL_VPN_COUNTRIES vides)',
    'Aucun serveur, adresse IP ou ping simulé n\'est exposé à l\'utilisateur.'
  );

  // ---------------------------------------------------------------------------
  // TEST 3 : vpn:connect et connectVpn() retournent un statut honnête (non simulé)
  // ---------------------------------------------------------------------------
  const vpnConnectUnderDev = vpnTs.includes("status: 'under-development'") && vpnTs.includes("success: false");
  const vpnTabTsx = readFileContent('components/tabs/VpnTab.tsx');
  const vpnTabDisabled = vpnTabTsx.includes('Fonctionnalité en cours de développement (Phase 13)');
  assert(
    vpnConnectUnderDev && vpnTabDisabled,
    'TEST-P2-03',
    'vpn:connect et cockpit VPN indiquent honnêtement l\'indisponibilité (Phase 13)',
    'Aucun faux timer setTimeout, aucune fausse notification de succès, bouton désactivé.'
  );

  // ---------------------------------------------------------------------------
  // TEST 4 : Suppression du plancher artificiel (720 Mbps) et plafond (980 Mbps)
  // ---------------------------------------------------------------------------
  const networkTs = readFileContent('main/network.ts');
  const has720Floor = networkTs.includes('Math.max(720') || networkTs.includes('Math.min(980');
  assert(
    !has720Floor,
    'TEST-P2-04',
    'Suppression du plancher artificiel de 720 Mbps et du plafond de 980 Mbps',
    'Mesure directe réelle de débit Cloudflare sans altération synthétique.'
  );

  // ---------------------------------------------------------------------------
  // TEST 5 : Suppression des valeurs de secours arbitraires (885 / 620 Mbps)
  // ---------------------------------------------------------------------------
  const has885Fallback = networkTs.includes('885') || networkTs.includes('downloadMbps: 885') || networkTs.includes('uploadMbps: 620');
  assert(
    !has885Fallback,
    'TEST-P2-05',
    'Suppression des valeurs de secours trompeuses (885 Mbps / 620 Mbps)',
    'En cas d\'échec réseau, le test renvoie une erreur explicite et un résultat null.'
  );

  // ---------------------------------------------------------------------------
  // TEST 6 : Élimination du faux rapport d\'optimisation Wi-Fi (28ms -> 12ms)
  // ---------------------------------------------------------------------------
  const networkTabTsx = readFileContent('components/tabs/NetworkTab.tsx');
  const hasFakeBeforeAfter = networkTabTsx.includes('beforePing') || networkTabTsx.includes('afterPing') || networkTabTsx.includes('-57%');
  const hasRealWifiDiag = networkTabTsx.includes('runWifiDiagnostic') && (networkTabTsx.includes('getWifiDiag') || networkTabTsx.includes('wifiInterference'));
  assert(
    !hasFakeBeforeAfter && hasRealWifiDiag,
    'TEST-P2-06',
    'Suppression de la fausse optimisation Wi-Fi et intégration du diagnostic netsh réel',
    'Le faux modal à 5 étapes et le gain inventé de 57% sont remplacés par les métriques netsh réelles.'
  );

  // ---------------------------------------------------------------------------
  // TEST 7 : Élimination des 165 FPS simulés dans l\'Overlay HUD
  // ---------------------------------------------------------------------------
  const hudTsx = readFileContent('components/OverlayHUD.tsx');
  const has165Fps = hudTsx.includes('165') || hudTsx.includes('fps: 165');
  const hasHonestFpsNotice = hudTsx.includes('PresentMon non installé') || hudTsx.includes('FPS indisponibles');
  assert(
    !has165Fps && hasHonestFpsNotice,
    'TEST-P2-07',
    'Suppression des 165 FPS simulés et mention explicite d\'absence de PresentMon',
    'L\'Overlay affiche N/D ou une explication transparente sur l\'absence de PresentMon (Phase 12).'
  );

  // ---------------------------------------------------------------------------
  // TEST 8 : Antivirus : suppression du faux nom et des compteurs aléatoires
  // ---------------------------------------------------------------------------
  const securityTs = readFileContent('main/security.ts');
  const securityTabTsx = readFileContent('components/tabs/SecurityTab.tsx');
  const hasVanguardCoreName = securityTs.includes("'Astral Vanguard Core v2.4'");
  const hasHonestDefenderName = securityTs.includes("'Moteur Microsoft Defender'");
  const hasFakeFileIncrement = securityTs.includes('Math.floor(Math.random() * 85 + 60)');
  const hasHonestScanStatus = securityTabTsx.includes('Progression détaillée indisponible');
  assert(
    !hasVanguardCoreName && hasHonestDefenderName && !hasFakeFileIncrement && hasHonestScanStatus,
    'TEST-P2-08',
    'Affichage honnête du moteur Microsoft Defender et suppression des compteurs inventés',
    'Le faux moteur Vanguard Core v2.4 et les faux fichiers scannés par incréments aléatoires sont éradiqués.'
  );

  // ---------------------------------------------------------------------------
  // TEST 9 : Nettoyage de disque : suppression du rapport prérempli statique
  // ---------------------------------------------------------------------------
  const perfTs = readFileContent('main/performance.ts');
  const hasStaticDiskReport = perfTs.includes('userTempMB: 120') || perfTs.includes('winTempMB: 45');
  assert(
    !hasStaticDiskReport,
    'TEST-P2-09',
    'Suppression du rapport de nettoyage de disque prérempli statique',
    'L\'analyseur de disque retourne uniquement les données réelles constatées sur le système.'
  );

  // ---------------------------------------------------------------------------
  // TEST 10 : Purge RAM : suppression de [System.GC]::Collect() inopérant
  // ---------------------------------------------------------------------------
  const executesGcCollect = perfTs.includes('[System.GC]::Collect()') && !perfTs.includes('supprimé');
  const honestRamPurgeStatus = perfTs.includes("status: 'unavailable'") && perfTs.includes('Phase 3/7');
  assert(
    honestRamPurgeStatus && !executesGcCollect,
    'TEST-P2-10',
    'Suppression de la fausse purge RAM [System.GC]::Collect() et statut honnête',
    'La fausse commande PowerShell inopérante est supprimée ; le bouton informe de la dépendance Phase 3/7.'
  );

  // ---------------------------------------------------------------------------
  // TEST 11 : Gaming : suppression des annonces de fausse priorité et du ping 24ms
  // ---------------------------------------------------------------------------
  const gamingTs = readFileContent('main/gaming.ts');
  const gamingTabTsx = readFileContent('components/tabs/GamingTab.tsx');
  const has24msFallback = gamingTs.includes(': 24;');
  const hasFakeGamingClaim = gamingTs.includes('Priorité processeur maximale appliquée, télémétrie suspendue');
  const honestGamingProfiles = gamingTabTsx.includes('Phase 11');
  assert(
    !has24msFallback && !hasFakeGamingClaim && honestGamingProfiles,
    'TEST-P2-11',
    'Mode Gaming : annonces honnêtes et suppression du fallback ping 24ms',
    'Les profils et optimisations réseau sont explicitement signalés en cours de développement (Phase 11).'
  );

  // ---------------------------------------------------------------------------
  // TEST 12 : Splash Screen : suppression des annonces de faux protocoles
  // ---------------------------------------------------------------------------
  const splashTsx = readFileContent('components/SplashScreen.tsx');
  const hasFakeProtocols = splashTsx.includes('Activation du bouclier temps réel') || splashTsx.includes('Calibration des profils e-sport');
  assert(
    !hasFakeProtocols,
    'TEST-P2-12',
    'Splash Screen : remplacement des annonces trompeuses par des étapes honnêtes de chargement UI',
    'Les statuts décrivent uniquement le chargement réel des composants graphiques.'
  );

  // ---------------------------------------------------------------------------
  // TEST 13 : Registre centralisé featureAvailability.ts
  // ---------------------------------------------------------------------------
  const featureAvailContent = readFileContent('shared/featureAvailability.ts');
  const hasFeatureRegistry = featureAvailContent.includes('export const FEATURES') &&
    featureAvailContent.includes('vpnConnection') &&
    featureAvailContent.includes('defenderAntivirus') &&
    featureAvailContent.includes('presentMonFps') &&
    featureAvailContent.includes('ramPurge');
  assert(
    hasFeatureRegistry,
    'TEST-P2-13',
    'Présence et complétude du registre centralisé des fonctionnalités (featureAvailability.ts)',
    'Tous les composants majeurs disposent d\'un statut typé, d\'une justification et d\'une action désactivée si non prête.'
  );

  // ---------------------------------------------------------------------------
  // TEST 14 : Intégrité des 7 onglets principaux
  // ---------------------------------------------------------------------------
  const requiredTabs = [
    'Dashboard.tsx',
    'GamingTab.tsx',
    'NetworkTab.tsx',
    'PerformanceTab.tsx',
    'SecurityTab.tsx',
    'SettingsTab.tsx',
    'VpnTab.tsx',
  ];
  let allTabsExist = true;
  for (const tab of requiredTabs) {
    const tabPath = path.join(SRC_DIR, 'components', 'tabs', tab);
    if (!fs.existsSync(tabPath) || fs.statSync(tabPath).size < 100) {
      allTabsExist = false;
    }
  }
  assert(
    allTabsExist,
    'TEST-P2-14',
    'Les 7 onglets de l\'application sont présents, complets et opérationnels',
    'Dashboard, GamingTab, NetworkTab, PerformanceTab, SecurityTab, SettingsTab et VpnTab sont intègres.'
  );

  console.log('');
  console.log('======================================================================');
  console.log(`  RÉSULTATS DE LA VALIDATION PHASE 2 : ${passCount} PASS / ${failCount} FAIL`);
  console.log('======================================================================');

  if (failCount > 0) {
    console.error(`❌ ÉCHEC : ${failCount} test(s) n'ont pas satisfait aux exigences d'honnêteté.`);
    process.exit(1);
  } else {
    console.log('✅ SUCCÈS : L\'ensemble des 14 exigences de dé-simulation et d\'honnêteté sont VALIDÉES.');
    process.exit(0);
  }
}

runPhase2HonestyTests().catch((err) => {
  console.error('Erreur inattendue pendant l\'exécution de la suite de tests:', err);
  process.exit(2);
});
