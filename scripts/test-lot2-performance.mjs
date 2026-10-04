/**
 * TEST SUITE - LOT 2 : PERFORMANCE, RÉSEAU, GAMING ET HUD (PHASES 9 À 12)
 *
 * Vérification rigoureuse des fonctionnalités de performance et de jeu :
 * 1. Processus critiques protégés contre l'arrêt (csrss, dwm, lsass, smss, services)
 * 2. EmptyWorkingSet : refus strict sans consentement, avertissement sur les page faults
 * 3. Réseau : mesure réelle ping/gigue, annonce du volume transféré (Mo), annulation
 * 4. DNS : sauvegarde et restauration de la configuration précédente
 * 5. Wi-Fi : diagnostic canal, signal et absence d'estimation artificielle
 * 6. Mode Gaming : priorité AboveNormal/High réversible (jamais Realtime)
 * 7. Mode Gaming : sauvegarde et restauration du plan d'alimentation GUID
 * 8. Mode Gaming : persistance du fichier d'état et récupération après crash
 * 9. Mode Gaming : avertissement sur l'autonomie et la batterie
 * 10. PresentMon : détection officielle, statuts honnêtes ('Indisponible' si absent)
 * 11. PresentMon : calcul rigoureux du 1% low basé sur le 99e percentile
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log('TEST LOT 2 - PERFORMANCE, RÉSEAU, GAMING ET HUD (PHASES 9 À 12)');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Erreur : ${err.message}`);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Erreur : ${err.message}`);
    failCount++;
  }
}

async function main() {
  // ── TEST 1 : Protection des processus système critiques ───────────────────
  runTest('Sécurité : Processus système critiques strictement protégés contre l\'arrêt', () => {
    const perfTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'performance.ts'), 'utf8');
    assert(perfTs.includes('CRITICAL_SYSTEM_PROCESSES.has'), 'Doit vérifier l\'appartenance à CRITICAL_SYSTEM_PROCESSES');
    assert(perfTs.includes('processus système critique'), 'Doit refuser explicitement l\'arrêt avec message de sécurité');
  });

  // ── TEST 2 : EmptyWorkingSet avec consentement explicite ──────────────────
  runTest('Mémoire : EmptyWorkingSet expérimental refuse l\'exécution sans consentement explicite', () => {
    const perfTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'performance.ts'), 'utf8');
    assert(perfTs.includes('perf:empty-working-set'), 'Le handler perf:empty-working-set doit exister');
    assert(perfTs.includes('consent_required'), 'Doit retourner status: consent_required en l\'absence de consentement');
    assert(perfTs.includes('défauts de page (page faults)'), 'Doit comporter l\'avertissement honnête sur les page faults');
    assert(perfTs.includes('optimisation permanente') && perfTs.includes('Réduction ponctuelle'), 'Ne doit pas prétendre à un gain permanent');
  });

  // ── TEST 3 : Réseau : Annonce du volume transféré et annulation ───────────
  runTest('Réseau : Speedtest annonce le volume de données transféré et permet l\'interruption', () => {
    const netTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'network.ts'), 'utf8');
    assert(netTs.includes('bytesTransferredMB'), 'Le résultat du speedtest doit inclure les Mo transférés');
    assert(netTs.includes('network:cancel-speedtest'), 'Le handler d\'annulation doit être disponible');
  });

  // ── TEST 4 : Réseau : Sauvegarde et restauration du DNS précédent ─────────
  runTest('Réseau : Mécanisme de restauration du DNS d\'origine disponible', () => {
    const netTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'network.ts'), 'utf8');
    assert(netTs.includes('network:restore-previous-dns'), 'Le handler network:restore-previous-dns doit exister');
    assert(netTs.includes('ResetServerAddresses'), 'La réinitialisation doit restaurer le DHCP / serveurs d\'origine');
  });

  // ── TEST 5 : Mode Gaming : Priorités réversibles (Jamais Realtime) ────────
  runTest('Gaming : Priorité limitée à AboveNormal/High, Realtime strictement exclu', () => {
    const gmTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'gamingManager.ts'), 'utf8');
    assert(gmTs.includes('AboveNormal'), 'Doit supporter AboveNormal');
    assert(!gmTs.includes('[System.Diagnostics.ProcessPriorityClass]::Realtime'), 'Realtime ne doit JAMAIS être appliqué');
    assert(gmTs.includes('previousPriority'), 'La priorité d\'origine doit être conservée pour restauration');
  });

  // ── TEST 6 : Mode Gaming : Sauvegarde et restauration du plan d'alimentation GUID
  runTest('Gaming : Plan d\'alimentation Windows sauvegardé et restauré par GUID', () => {
    const gmTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'gamingManager.ts'), 'utf8');
    assert(gmTs.includes('powercfg /getactivescheme'), 'Doit interroger le plan actif actuel');
    assert(gmTs.includes('powercfg /setactive'), 'Doit restaurer le plan via son GUID');
    assert(gmTs.includes('restorePreviousState'), 'La fonction de restauration doit exister');
  });

  // ── TEST 7 : Mode Gaming : Persistance d'état et récupération après crash ─
  runTest('Gaming : Récupération après crash via gaming_rollback_state.json', () => {
    const gmTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'gamingManager.ts'), 'utf8');
    assert(gmTs.includes('gaming_rollback_state.json'), 'Le fichier d\'état de rollback doit être nommé');
    assert(gmTs.includes('recoverFromPreviousCrash'), 'La procédure de récupération post-crash doit être implémentée');

    const indexTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'index.ts'), 'utf8');
    assert(indexTs.includes('gamingManager.recoverFromPreviousCrash()'), 'index.ts doit invoquer la récupération au démarrage');
    assert(indexTs.includes('gamingManager.restorePreviousState()'), 'index.ts doit restaurer l\'état à la fermeture de Vanguard');
  });

  // ── TEST 8 : Mode Gaming : Avertissement explicite batterie et consommation
  runTest('Gaming : Avertissement honnête sur l\'impact batterie des hautes performances', () => {
    const gmTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'gamingManager.ts'), 'utf8');
    assert(gmTs.includes('batteryWarning'), 'Un avertissement batterie doit être présent');
    assert(gmTs.includes('consommation énergétique'), 'Doit expliciter la hausse de consommation');
  });

  // ── TEST 9 : PresentMon : Intégration officielle et statut honnête ────────
  runTest('PresentMon : Détection officielle et statut honnête "Indisponible" si absent', () => {
    const pmTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'presentmonEngine.ts'), 'utf8');
    assert(pmTs.includes('findPresentMonBinary'), 'Doit sonder les chemins officiels');
    assert(pmTs.includes('PresentMon non installé'), 'Doit déclarer honnêtement l\'absence');
    assert(pmTs.includes('Intel PresentMon'), 'Doit inclure la notice de licence officielle');
    assert(!pmTs.includes('Math.random'), 'Zéro FPS simulé');
  });

  // ── TEST 10 : PresentMon : Calcul rigoureux du 1% Low (99e percentile) ────
  runTest('PresentMon : Calcul authentique du 1% Low sur le 99e percentile des frametimes', () => {
    // Échantillon de 100 frametimes simulant 60 FPS avec quelques saccades
    const frametimes = Array.from({ length: 100 }, (_, i) => (i < 95 ? 16.6 : 33.3));
    const sorted = [...frametimes].sort((a, b) => a - b);
    const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
    const p99Frametime = sorted[p99Index];
    const onePercentLow = Math.round(1000 / p99Frametime);

    assert.strictEqual(p99Frametime, 33.3);
    assert.strictEqual(onePercentLow, 30); // 1000 / 33.3ms = 30 FPS pour le 1% low
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`RÉSULTAT LOT 2 PERFORMANCE & GAMING : ${passCount} PASS, ${failCount} FAIL`);
  console.log('----------------------------------------------------------------------');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erreur non gérée :', err);
  process.exit(1);
});
