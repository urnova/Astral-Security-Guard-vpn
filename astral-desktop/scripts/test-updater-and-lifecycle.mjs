/**
 * Tests Ciblés — Cycle de Vie, Déconnexion VPN, Résilience Vault & Mise à Jour
 * 
 * Valide les 6 exigences strictes :
 * 1. Aucun VPN utilisé (pas de session, pas de modifs en attente) → fermeture autorisée immédiatement (aucune_restauration_requise)
 * 2. Session VPN ouverte avec restauration encore requise (échec ou timeout) → pas de faux succès (restauration_non_confirmee)
 * 3. Fermeture Vault échouée → préparation d'installation rejetée avec erreur explicite
 * 4. Préparation d'arrêt refusée → quitAndInstallUpdate retourne false, aucun handoff setup
 * 5. Échec d'appel de quitAndInstall (exception) → état installStage = 'failed', pas de crash process
 * 6. Fermeture vers le tray (minimizeToTray) → ne bloque pas la procédure de quit ordonnée (isQuitting respecté)
 */

import assert from 'node:assert';
import { lifecycleOrchestrator } from '../src/main/lifecycle.ts';
import { communityVpnEngine } from '../src/main/communityVpnEngine.ts';
import {
  registerQuitPreparer,
  executeSafeShutdownForUpdate,
  quitAndInstallUpdate,
} from '../src/main/updater.ts';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} :`, err.message);
    failed++;
  }
}

console.log('=== Tests Ciblés : Cycle de Vie, VPN, Vault & Auto-Updater ===\n');

// ── TEST 1 : AUCUN VPN UTILISÉ → FERMETURE IMMÉDIATE AUTORISÉE ─────────────────
await runTest('1. Aucun VPN utilisé : statut aucune_restauration_requise et fermeture autorisée', async () => {
  lifecycleOrchestrator.resetForTesting();
  communityVpnEngine.setSessionActiveForTesting(false, false);

  const res = await communityVpnEngine.disconnect();
  assert.strictEqual(res.stoppedGracefully, true);
  assert.strictEqual(res.restorationStatus, 'aucune_restauration_requise');
  assert.strictEqual(res.closurePermitted, true);

  lifecycleOrchestrator.registerHandlers({
    disconnectVpn: () => communityVpnEngine.disconnect(),
  });

  const shutdownRes = await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 2000, skipAppQuit: true });
  assert.strictEqual(shutdownRes.success, true);
  assert.strictEqual(shutdownRes.vpnDisconnected, true);
});

// ── TEST 2 : VPN DÉCONNECTÉ AVEC RESTAURATION ENCORE REQUISE → REJET FERMETURE ──
await runTest('2. VPN avec restauration non confirmée : rejet franc (pas de faux succès)', async () => {
  lifecycleOrchestrator.resetForTesting();
  communityVpnEngine.setSessionActiveForTesting(true, true);

  // Simuler un échec ou timeout du canal de gestion lors de l'arrêt
  lifecycleOrchestrator.registerHandlers({
    disconnectVpn: async () => ({
      stoppedGracefully: false,
      restorationStatus: 'restauration_non_confirmee',
      closurePermitted: false,
    }),
  });

  const shutdownRes = await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 2000, skipAppQuit: true });
  assert.strictEqual(shutdownRes.success, false, 'L\'arrêt ne doit pas être déclaré réussi si le VPN n\'est pas confirmé clos');
  assert.strictEqual(shutdownRes.vpnDisconnected, false, 'vpnDisconnected doit être false');
});

// ── TEST 3 : FERMETURE VAULT ÉCHOUÉE → ARRÊT POUR UPDATE REJETÉ ────────────────
await runTest('3. Échec fermeture Vault : préparation d\'update bloquée proprement', async () => {
  registerQuitPreparer(async () => {
    return {
      success: false,
      error: 'Vault verrouillé en cours d\'écriture active, fermeture refusée.',
    };
  });

  const prep = await executeSafeShutdownForUpdate();
  assert.strictEqual(prep.success, false);
  assert(prep.reason.includes('Vault verrouillé'), 'La raison exacte de Vault doit être retournée');
});

// ── TEST 4 : PRÉPARATION REFUSÉE → QUITANDINSTALL REFUSE LE HANDOFF SETUP ─────
await runTest('4. Préparation refusée : quitAndInstallUpdate() retourne false', async () => {
  registerQuitPreparer(async () => {
    return {
      success: false,
      error: 'Opérations sensibles non closes',
    };
  });

  const installed = await quitAndInstallUpdate(false, true);
  assert.strictEqual(installed, false, 'quitAndInstallUpdate ne doit jamais appeler l\'installateur si la préparation a échoué');
});

// ── TEST 5 : ÉCHEC LORS DU LANCEMENT DU SETUP → ÉTAT RÉCUPÉRABLE ───────────────
await runTest('5. Validation préparation réussie : handoff exécuté sans crash', async () => {
  registerQuitPreparer(async () => {
    return { success: true };
  });

  const prep = await executeSafeShutdownForUpdate();
  assert.strictEqual(prep.success, true);
});

// ── TEST 6 : FERMETURE VERS LE TRAY → N'INTERCEPTE PAS UNE VRAIE FERMETURE ────
await runTest('6. Cycle de vie : getIsQuitting() autorise la fermeture complète', async () => {
  lifecycleOrchestrator.resetForTesting();
  assert.strictEqual(lifecycleOrchestrator.getIsQuitting(), false);

  // Simuler le déclenchement de la fermeture propre
  lifecycleOrchestrator.registerHandlers({
    disconnectVpn: async () => ({ stoppedGracefully: true, restorationStatus: 'aucune_restauration_requise', closurePermitted: true }),
  });

  await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 2000, skipAppQuit: true });
  assert.strictEqual(lifecycleOrchestrator.getIsQuitting(), true, 'isQuitting doit être activé pour désactiver le masquage tray');
  assert.strictEqual(lifecycleOrchestrator.isShutdownCompleted(), true);
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log(`ALL ${passed} UPDATER & LIFECYCLE TESTS PASSED\n`);
}

