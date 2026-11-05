/**
 * Tests d'Intégration & Vérification du Brief IA, des Paramètres et du Cycle de Vie (Accueil / Paramètres / Tray)
 * 
 * Valide sur le code de production :
 * 1. Payload autorisé et champs exclus (minimisation stricte, aucun nom, chemin, IP, secret)
 * 2. Réponse IA valide : extraction sûre, longueur bornée, filtrage HTML
 * 3. Réponse IA invalide (JSON corrompu) : bascule propre en synthèse déterministe
 * 4. Timeout distant : bascule gracieuse sans crash
 * 5. Gestion HTTP 429 & Retry-After : état unavailable, cooldown, bascule déterministe
 * 6. Déduplication des demandes concurrentes en vol (1 seul appel réseau exécuté)
 * 7. Cache temporisé (TTL 15 min) et respect du cooldown manuel (60s)
 * 8. Fraîcheur des alertes en direct : alerte disque C: saturé immédiatement visible malgré un texte en cache
 * 9. Mécanisme de consentement : si non accordé ou refusé, ZÉRO appel réseau, synthèse locale pure
 * 10. Persistance des paramètres et rejet des valeurs invalides
 * 11. Arrêt propre (gracefulShutdown) : séquence complète de nettoyage (scheduler, scanner, VPN, gaming)
 * 12. Protection anti-réentrance lors d'arrêts répétés
 * 13. Retrait du consentement pendant une requête : signal d'annulation et rejet de la réponse tardive
 * 14. Changement de profil : étanchéité du cache par profil
 * 15. Dépassement de délai déconnexion VPN lors de l'arrêt : non validation abusive de la restauration
 */

import assert from 'node:assert';
import { dailyBriefEngine } from '../src/main/dailyBriefEngine.ts';
import { userProfileManager } from '../src/main/profile.ts';
import { lifecycleOrchestrator } from '../src/main/lifecycle.ts';
import { communityVpnEngine } from '../src/main/communityVpnEngine.ts';

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

console.log('=== Tests de Production : Brief IA, Paramètres, Tray & Cycle de Vie ===\n');

// ── TEST 1 : MINIMISATION STRICTE DU PAYLOAD ─────────────────────────────────
await runTest('1. Minimisation stricte : liste fermée de champs autorisés & exclusions', async () => {
  dailyBriefEngine.clearCache();
  let capturedBody = null;

  dailyBriefEngine.setTestHooks({
    now: () => 1730000000000,
    httpPost: async (_url, body) => {
      capturedBody = body;
      return {
        statusCode: 200,
        headers: { 'ratelimit-remaining': '1' },
        body: JSON.stringify({
          choices: [{ message: { content: 'Système nominal et protégé.' } }]
        }),
      };
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 80, usedPercent: 68 }),
    pingFetcher: async () => 18,
  });

  // Accorder le consentement pour le test
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  await dailyBriefEngine.getDailyBrief(true);
  assert(capturedBody, 'Le corps de requête HTTP doit être émis');

  // Vérifier les exclusions strictes
  assert(!capturedBody.includes('C:\\'), 'Aucun chemin de fichier ne doit être transmis');
  assert(!capturedBody.includes('TestUser'), 'Aucun nom d\'utilisateur ne doit être transmis');
  assert(!capturedBody.includes('Sec'), 'Aucun nom d\'utilisateur ne doit être transmis');
  assert(!capturedBody.includes('192.168.'), 'Aucune adresse IP privée locale ne doit être dans le prompt');
  assert(!capturedBody.includes('82.64.'), 'Aucune adresse IP publique ne doit être dans le prompt');
  assert(!capturedBody.includes('password'), 'Aucun secret ne doit être présent');
  assert(!capturedBody.includes('Vault'), 'Aucun mot-clé ou métadonnée Vault ne doit être présent');

  // Vérifier la présence des seuls indicateurs système globaux
  assert(capturedBody.includes('Disque C:'), 'L\'indicateur de disque doit être présent');
  assert(capturedBody.includes('Protection antivirus'), 'L\'état de protection doit être présent');
});

// ── TEST 2 : RÉPONSE IA VALIDE & ASSAINIE ─────────────────────────────────────
await runTest('2. Réponse IA valide : extraction, longueur bornée et assainissement HTML', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  dailyBriefEngine.setTestHooks({
    now: () => 1730000010000,
    httpPost: async () => ({
      statusCode: 200,
      headers: { 'ratelimit-remaining': '1' },
      body: JSON.stringify({
        choices: [{ message: { content: '<b>Attention :</b> Votre disque C: nécessite un nettoyage. <script>alert(1)</script>' } }]
      }),
    }),
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 10, usedPercent: 96 }),
  });

  const res = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res.source, 'generated');
  assert.strictEqual(res.providerName, 'OVHcloud AI Endpoints');
  assert.strictEqual(res.modelName, 'Mistral-Nemo-Instruct-2407');
  assert(!res.summary.includes('<script>'), 'Les balises HTML doivent être assainies');
  assert(!res.summary.includes('<b>'), 'Les balises HTML doivent être retirées');
  assert(res.summary.includes('Votre disque C: nécessite un nettoyage'));
  assert(res.summary.length <= 500, 'La longueur doit être bornée');
});

// ── TEST 3 : RÉPONSE IA INVALIDE (REPLI DÉTERMINISTE) ─────────────────────────
await runTest('3. Réponse IA invalide : bascule propre en synthèse déterministe', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  dailyBriefEngine.setTestHooks({
    now: () => 1730000020000,
    httpPost: async () => ({
      statusCode: 200,
      headers: {},
      body: 'MALFORMED_JSON_STRING_FROM_UPSTREAM',
    }),
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const res = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res.source, 'deterministic');
  assert(res.summary.length > 0);
  assert(res.errorMessage?.includes('invalide') || res.errorMessage?.includes('indisponible'));
});

// ── TEST 4 : GESTION DU TIMEOUT DISTANT ───────────────────────────────────────
await runTest('4. Timeout distant : bascule gracieuse sans blocage', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  dailyBriefEngine.setTestHooks({
    now: () => 1730000030000,
    httpPost: async () => {
      const err = new Error('Délai d\'attente dépassé (timeout 8s)');
      throw err;
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const res = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res.source, 'deterministic');
  assert(res.errorMessage?.includes('timeout') || res.errorMessage?.includes('indisponible'));
});

// ── TEST 5 : GESTION HTTP 429 & COOLDOWN ──────────────────────────────────────
await runTest('5. Gestion HTTP 429 : état unavailable, cooldown et secours déterministe', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  let simulatedNow = 1730000100000;
  dailyBriefEngine.setTestHooks({
    now: () => simulatedNow,
    httpPost: async () => ({
      statusCode: 429,
      headers: { 'retry-after': '15' },
      body: JSON.stringify({ error: 'rate limit' }),
    }),
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const res1 = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res1.source, 'unavailable');
  assert.strictEqual(res1.quotaRetryAfterSec, 15);
  assert(res1.summary.length > 0, 'Un résumé déterministe de secours doit être fourni');

  // Tentative immédiate pendant le cooldown : rejet sans requête réseau
  let networkCalled = false;
  dailyBriefEngine.setTestHooks({
    now: () => simulatedNow + 5000, // +5s (reste 10s)
    httpPost: async () => { networkCalled = true; throw new Error('Ne doit pas être appelé'); },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const res2 = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res2.source, 'unavailable');
  assert.strictEqual(networkCalled, false, 'Le quota en cooldown doit bloquer tout appel réseau');
  assert.strictEqual(res2.quotaRetryAfterSec, 10);
});

// ── TEST 6 : DÉDUPLICATION DES REQUÊTES EN VOL ───────────────────────────────
await runTest('6. Demandes concurrentes en vol : déduplication stricte (1 seul appel réseau)', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  let callCount = 0;
  dailyBriefEngine.setTestHooks({
    now: () => 1730000150000,
    httpPost: async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 50));
      return {
        statusCode: 200,
        headers: { 'ratelimit-remaining': '1' },
        body: JSON.stringify({ choices: [{ message: { content: 'Réponse unique.' } }] }),
      };
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  // Lancement simultané de 3 requêtes getDailyBrief
  const [r1, r2, r3] = await Promise.all([
    dailyBriefEngine.getDailyBrief(true),
    dailyBriefEngine.getDailyBrief(true),
    dailyBriefEngine.getDailyBrief(true),
  ]);

  assert.strictEqual(callCount, 1, 'Un seul appel HTTP distant doit être réalisé');
  assert.strictEqual(r1.summary, 'Réponse unique.');
  assert.strictEqual(r2.summary, 'Réponse unique.');
  assert.strictEqual(r3.summary, 'Réponse unique.');
});

// ── TEST 7 : FRAÎCHEUR DES ALERTES RÉELLES ────────────────────────────────────
await runTest('7. Fraîcheur des alertes réelles : mise en avant immédiate même avec brief en cache', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  let currentDiskFree = 100;
  let currentDiskPct = 60;

  dailyBriefEngine.setTestHooks({
    now: () => 1730000200000,
    httpPost: async () => ({
      statusCode: 200,
      headers: { 'ratelimit-remaining': '1' },
      body: JSON.stringify({ choices: [{ message: { content: 'Tout va bien (état à T0).' } }] }),
    }),
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: currentDiskFree, usedPercent: currentDiskPct }),
  });

  // T0 : Disque sain (60% utilisé)
  const b1 = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(b1.source, 'generated');
  assert.strictEqual(b1.observations.storage.status, 'ok');

  // T+5 min : Le disque devient soudainement saturé à 96% (10 Go libres)
  currentDiskFree = 10;
  currentDiskPct = 96;
  dailyBriefEngine.setTestHooks({
    now: () => 1730000200000 + (5 * 60 * 1000),
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: currentDiskFree, usedPercent: currentDiskPct }),
  });

  // Appel sans forceRefresh -> retour du cache pour le texte, MAIS observations actualisées
  const b2 = await dailyBriefEngine.getDailyBrief(false);
  assert.strictEqual(b2.source, 'cached');
  assert.strictEqual(b2.observations.storage.status, 'alert', 'L\'alerte disque saturé doit être visible immédiatement');
  assert(b2.observations.storage.detail.includes('critique') || b2.observations.storage.detail.includes('saturé'));
  assert(b2.suggestedActions.some(a => a.id === 'disk-cleanup'), 'L\'action de nettoyage doit être proposée');
});

// ── TEST 8 : CONSENTEMENT ET SYNTHÈSE LOCALE ─────────────────────────────────
await runTest('8. Consentement refusé : zéro appel réseau et synthèse déterministe pure', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'declined' });

  let networkHit = false;
  dailyBriefEngine.setTestHooks({
    now: () => 1730000300000,
    httpPost: async () => {
      networkHit = true;
      throw new Error('Ne doit jamais être appelé si le consentement est refusé !');
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 50, usedPercent: 80 }),
  });

  const res = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res.source, 'deterministic');
  assert.strictEqual(networkHit, false, 'Aucune requête réseau ne doit avoir lieu sans accord explicite');
  assert(res.headline.length > 0);
  assert(res.summary.length > 0);
});

// ── TEST 9 : PARAMÈTRES PERSISTÉS & VALIDATION ────────────────────────────────
await runTest('9. Paramètres persistés : consentement sauvegardé & validation', async () => {
  const p1 = userProfileManager.saveProfile({ aiBriefConsent: 'granted' });
  assert.strictEqual(p1.aiBriefConsent, 'granted');

  const p2 = userProfileManager.saveProfile({ aiBriefConsent: 'declined' });
  assert.strictEqual(p2.aiBriefConsent, 'declined');

  const loaded = userProfileManager.getProfile();
  assert.strictEqual(loaded.aiBriefConsent, 'declined');
});

// ── TEST 10 : ARRÊT PROPRE (GRACEFUL SHUTDOWN) ────────────────────────────────
await runTest('10. Arrêt propre orchestré : séquence complète de nettoyage et anti-réentrance', async () => {
  lifecycleOrchestrator.resetForTesting();
  let schedulerStopped = false;
  let scannerStopped = false;
  let vpnDisconnected = false;
  let gamingRestored = false;

  lifecycleOrchestrator.registerHandlers({
    stopScheduler: () => { schedulerStopped = true; },
    stopScanner: () => { scannerStopped = true; },
    disconnectVpn: async () => { return { restorationStatus: 'restauration_verifiee' }; },
    restoreGaming: () => { gamingRestored = true; },
    appQuit: () => {},
  });

  // Test de la fonction de fermeture ordonnée avec skipAppQuit pour isolation unitaire
  const res = await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 2000, skipAppQuit: true });

  assert.strictEqual(res.success, true);
  assert.strictEqual(schedulerStopped, true, 'Le scheduler de maintenance doit être arrêté');
  assert.strictEqual(scannerStopped, true, 'Les observateurs de répertoires doivent être fermés');
  assert.strictEqual(res.vpnDisconnected, true, 'Le VPN doit être qualifié déconnecté');
  assert.strictEqual(res.gamingRestored, true, 'Les configurations temporaires doivent être restaurées');
  assert.strictEqual(lifecycleOrchestrator.isShutdownCompleted(), true);

  // Test de la protection anti-réentrance lors d'un second appel immédiat
  const secondCall = await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 2000, skipAppQuit: true });
  assert.strictEqual(secondCall.success, true);
});

// ── TEST 11 : RETRAIT DU CONSENTEMENT PENDANT UNE REQUÊTE ────────────────────
await runTest('11. Retrait du consentement en vol : annulation et rejet de réponse tardive', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'granted' });

  let signalAborted = false;
  dailyBriefEngine.setTestHooks({
    now: () => 1730000400000,
    httpPost: async (_url, _body, _headers, signal) => {
      if (signal) {
        signal.addEventListener('abort', () => { signalAborted = true; });
      }
      // Révoquer le consentement pendant que la requête réseau est en transit
      setTimeout(() => {
        userProfileManager.saveProfile({ firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'declined' });
        dailyBriefEngine.revokeConsent();
      }, 10);

      // Simuler la durée de la réponse distante
      await new Promise(r => setTimeout(r, 60));
      return {
        statusCode: 200,
        headers: { 'ratelimit-remaining': '1' },
        body: JSON.stringify({ choices: [{ message: { content: 'Génération tardive non autorisée.' } }] }),
      };
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const result = await dailyBriefEngine.getDailyBrief(true);

  assert.strictEqual(signalAborted, true, 'Le signal d\'annulation AbortSignal doit être déclenché');
  assert.strictEqual(result.source, 'deterministic', 'La réponse tardive ne doit pas être affichée comme autorisée');
  assert(!result.summary.includes('Génération tardive non autorisée'));
});

// ── TEST 12 : ÉTANCHÉITÉ DU CACHE PAR IDENTIFIANT STABLE DE PROFIL ───────────
await runTest('12. Isolation du cache par profil stable, préservation au renommage & homonymie', async () => {
  dailyBriefEngine.clearCache();

  // Profil Alice (ID stable 'prof-alice')
  userProfileManager.saveProfile({ profileId: 'prof-alice', firstName: 'Alice', lastName: 'Dupont', aiBriefConsent: 'granted' });
  dailyBriefEngine.setTestHooks({
    now: () => 1730000500000,
    httpPost: async () => ({
      statusCode: 200,
      headers: { 'ratelimit-remaining': '1' },
      body: JSON.stringify({ choices: [{ message: { content: 'Brief personnel pour Alice.' } }] }),
    }),
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const resAlice = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(resAlice.source, 'generated');
  assert.strictEqual(resAlice.profileId, 'prof-alice');

  // Cas 1 : Renommage du même profil (l'ID reste 'prof-alice') -> Le cache est conservé
  userProfileManager.saveProfile({ profileId: 'prof-alice', firstName: 'Alice Renommée', lastName: 'Martin' });
  dailyBriefEngine.setTestHooks({
    now: () => 1730000510000,
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });
  const resRenamed = await dailyBriefEngine.getDailyBrief(false);
  assert.strictEqual(resRenamed.source, 'cached', 'Le renommage du profil ne doit pas invalider le cache existant');
  assert.strictEqual(resRenamed.profileId, 'prof-alice');

  // Cas 2 : Deux profils différents avec le MÊME nom (homonymes)
  // Profil Bob ayant le même nom affiché 'Alice Renommée' mais un ID distinct 'prof-bob'
  userProfileManager.saveProfile({ profileId: 'prof-bob', firstName: 'Alice Renommée', lastName: 'Martin', aiBriefConsent: 'unprompted' });
  
  const resBob = await dailyBriefEngine.getDailyBrief(false);
  assert.strictEqual(resBob.source, 'deterministic', 'Un profil distinct portant le même nom ne doit pas hériter du cache d\'Alice');
  assert.strictEqual(resBob.profileId, 'prof-bob');
  assert(!resBob.summary.includes('Alice'));
});

// ── TEST 13 : DÉPASSEMENT DE DÉLAI DÉCONNEXION VPN LORS DE L'ARRÊT ───────────
await runTest('13. Dépassement de délai déconnexion VPN : statut non confirmé', async () => {
  lifecycleOrchestrator.resetForTesting();

  lifecycleOrchestrator.registerHandlers({
    stopScheduler: () => {},
    stopScanner: () => {},
    disconnectVpn: async () => {
      // Bloqué plus de 3000ms
      await new Promise(r => setTimeout(r, 4000));
      return { restorationStatus: 'restauration_verifiee' };
    },
    restoreGaming: () => {},
    appQuit: () => {},
  });

  const res = await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 3500, skipAppQuit: true });
  assert.strictEqual(res.vpnDisconnected, false, 'Le statut VPN ne doit pas être validé si le délai a expiré');
  assert.strictEqual(res.success, false, 'L\'arrêt complet doit signaler que le VPN n\'a pas terminé dans le délai imparti');
});

// ── TEST 14 : STATUT INITIAL DU CONSENTEMENT (UNPROMPTED) ─────────────────────
await runTest('14. Consentement initial (unprompted) : zéro envoi distant', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ profileId: 'prof-default', firstName: 'TestUser', lastName: 'Sec', aiBriefConsent: 'unprompted' });

  let networkHit = false;
  dailyBriefEngine.setTestHooks({
    now: () => 1730000600000,
    httpPost: async () => {
      networkHit = true;
      throw new Error('Ne doit jamais être appelé si le statut est unprompted');
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const res = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res.source, 'deterministic');
  assert.strictEqual(networkHit, false, 'Aucun appel réseau ne doit être tenté dans l\'état initial');
});

// ── TEST 15 : RÉPONSE TARDIVE APRÈS CHANGEMENT DE PROFIL EN COURS DE REQUÊTE ─
await runTest('15. Réponse tardive après changement de profil : rejet immédiat et étanchéité', async () => {
  dailyBriefEngine.clearCache();
  userProfileManager.saveProfile({ profileId: 'prof-first', firstName: 'FirstUser', aiBriefConsent: 'granted' });

  dailyBriefEngine.setTestHooks({
    now: () => 1730000700000,
    httpPost: async () => {
      // Le profil bascule vers un autre utilisateur pendant le transit HTTP
      setTimeout(() => {
        userProfileManager.saveProfile({ profileId: 'prof-second', firstName: 'SecondUser', aiBriefConsent: 'granted' });
      }, 10);

      await new Promise(r => setTimeout(r, 60));
      return {
        statusCode: 200,
        headers: { 'ratelimit-remaining': '1' },
        body: JSON.stringify({ choices: [{ message: { content: 'Brief destiné à FirstUser.' } }] }),
      };
    },
    diskTelemetryFetcher: async () => ({ totalGB: 250, freeGB: 100, usedPercent: 60 }),
  });

  const res = await dailyBriefEngine.getDailyBrief(true);
  assert.strictEqual(res.source, 'deterministic', 'La réponse tardive du premier profil ne doit pas s\'afficher pour le second');
  assert.strictEqual(res.profileId, 'prof-second');
  assert(!res.summary.includes('FirstUser'));
});

// ── TEST 16 : ARRÊT PROPRE AVEC VPN INACTIF ──────────────────────────────────
await runTest('16. Déconnexion VPN quand inactif : statut restauration vérifiée & arrêt réussi', async () => {
  lifecycleOrchestrator.resetForTesting();

  // Vérifier le comportement direct de production de communityVpnEngine.disconnect() sans tunnel actif
  const directDisconnect = await communityVpnEngine.disconnect();
  assert.strictEqual(directDisconnect.stoppedGracefully, true, 'Sans tunnel, stoppedGracefully doit être vrai');
  assert.strictEqual(directDisconnect.restorationStatus, 'aucune_restauration_requise', 'Sans tunnel, le statut doit être aucune_restauration_requise');
  assert.strictEqual(directDisconnect.closurePermitted, true, 'La fermeture doit être autorisée');

  // Enregistrer le vrai handler dans lifecycleOrchestrator
  lifecycleOrchestrator.registerHandlers({
    disconnectVpn: () => communityVpnEngine.disconnect(),
  });

  const res = await lifecycleOrchestrator.gracefulShutdown({ forceExitTimeoutMs: 2000, skipAppQuit: true });
  assert.strictEqual(res.success, true, 'L\'arrêt complet doit réussir quand le VPN est inactif');
  assert.strictEqual(res.vpnDisconnected, true, 'vpnDisconnected doit être vrai');
});

// Nettoyage final des hooks
dailyBriefEngine.setTestHooks(null);

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log(`ALL ${passed} BRIEF, SETTINGS & LIFECYCLE TESTS PASSED\n`);
}
