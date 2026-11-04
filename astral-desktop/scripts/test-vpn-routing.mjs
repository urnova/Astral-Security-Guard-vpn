import assert from 'node:assert';
import { VpnRoutingEngine } from '../src/main/vpnRouting.ts';

console.log('=== Début des Tests d\'Évaluation du Routage VPN (redirect-gateway def1 & Conflits) ===\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} : ${err.message}`);
    failed++;
  }
}

// ── TEST 1 : ROUTE PAR DÉFAUT CLASSIQUE (0.0.0.0/0) ──────────────────────────
runTest('1. Route par défaut classique (0.0.0.0/0) sur l\'interface du tunnel', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'VanguardTun0', nextHop: '10.8.0.1' },
    { destinationPrefix: '192.168.1.0/24', interfaceAlias: 'Ethernet', nextHop: '0.0.0.0' },
  ];

  const evalRes = VpnRoutingEngine.evaluateTargetRouting(routes, { alias: 'VanguardTun0' });
  assert.strictEqual(evalRes.pattern, 'default_0');
  assert.strictEqual(evalRes.isCovered, true);
  assert.strictEqual(evalRes.isConflict, false);
  assert.strictEqual(evalRes.hasDefault0, true);
  assert.strictEqual(evalRes.hasDef1Half0, false);
  assert.strictEqual(evalRes.hasDef1Half128, false);
});

// ── TEST 2 : PAIRE DE ROUTES /1 (redirect-gateway def1) AVEC ROUTE PHYSIQUE CONSERVÉE ─
runTest('2. Paire complète /1 (def1_pair) avec route par défaut physique conservée sans échec', () => {
  const routes = [
    // OpenVPN ajoute ces 2 routes spécifiques /1 sur le tunnel
    { destinationPrefix: '0.0.0.0/1', interfaceAlias: 'VanguardTun0', nextHop: '10.8.0.1' },
    { destinationPrefix: '128.0.0.0/1', interfaceAlias: 'VanguardTun0', nextHop: '10.8.0.1' },
    // La route par défaut d'origine sur l'Ethernet physique reste en place dans Windows
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'Ethernet', nextHop: '192.168.1.254' },
  ];

  const evalRes = VpnRoutingEngine.evaluateTargetRouting(routes, { alias: 'VanguardTun0' });
  assert.strictEqual(evalRes.pattern, 'def1_pair');
  assert.strictEqual(evalRes.isCovered, true, 'Le trafic doit être considéré 100% couvert par la paire /1');
  assert.strictEqual(evalRes.isConflict, false, 'La route 0.0.0.0/0 physique conservée n\'est PAS un conflit');
  assert.strictEqual(evalRes.physicalDefault0Preserved, true, 'La préservation de la route physique doit être notée');
  assert.strictEqual(evalRes.hasDef1Half0, true);
  assert.strictEqual(evalRes.hasDef1Half128, true);
});

// ── TEST 3 : PAIRE /1 INCOMPLÈTE (COUVERTURE DÉFECTUEUSE) ─────────────────────
runTest('3. Paire /1 incomplète (seulement 0.0.0.0/1 présent) : couverture rejetée', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/1', interfaceAlias: 'VanguardTun0', nextHop: '10.8.0.1' },
    // 128.0.0.0/1 est manquant
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'Ethernet', nextHop: '192.168.1.254' },
  ];

  const evalRes = VpnRoutingEngine.evaluateTargetRouting(routes, { alias: 'VanguardTun0' });
  assert.strictEqual(evalRes.pattern, 'def1_incomplete');
  assert.strictEqual(evalRes.isCovered, false, 'Une paire incomplète ne couvre pas tout le trafic');
  assert(evalRes.details.includes('128.0.0.0/1 est manquant'));
});

// ── TEST 4 : ROUTES DIRIGÉES VERS UNE AUTRE INTERFACE ─────────────────────────
runTest('4. Routes dirigées vers une autre interface (conflit de sortie)', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'Ethernet', nextHop: '192.168.1.254' },
  ];

  const evalRes = VpnRoutingEngine.evaluateTargetRouting(routes, { alias: 'VanguardTun0' });
  assert.strictEqual(evalRes.pattern, 'external_interface');
  assert.strictEqual(evalRes.isCovered, false);
  assert.strictEqual(evalRes.isConflict, true);
  assert.strictEqual(evalRes.matchedInterface, 'Ethernet');
});

// ── TEST 5 : LECTURE IMPOSSIBLE / AMBIGUË ─────────────────────────────────────
runTest('5. Lecture impossible de la table de routage (null/undefined) : gestion honnête', () => {
  const evalRes = VpnRoutingEngine.evaluateTargetRouting(null, { alias: 'VanguardTun0' });
  assert.strictEqual(evalRes.pattern, 'unreadable');
  assert.strictEqual(evalRes.isCovered, false);
  assert(evalRes.details.includes('impossible'));
});

// ── TEST 6 : CONFLIT VPN TIERS EN MODE DEF1_PAIR ──────────────────────────────
runTest('6. Conflit VPN tiers détecté en mode def1_pair (WireGuard avec paires /1)', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/1', interfaceAlias: 'WireGuardTunnel', nextHop: '10.14.0.1' },
    { destinationPrefix: '128.0.0.0/1', interfaceAlias: 'WireGuardTunnel', nextHop: '10.14.0.1' },
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'Ethernet', nextHop: '192.168.1.254' },
  ];

  const conflict = VpnRoutingEngine.evaluateThirdPartyConflict(routes, [
    { name: 'WireGuard', alias: 'WireGuardTunnel' },
  ]);

  assert.strictEqual(conflict.state, 'conflict_confirmed');
  assert.strictEqual(conflict.vpnName, 'WireGuard');
  assert.strictEqual(conflict.adapter, 'WireGuardTunnel');
  assert.strictEqual(conflict.pattern, 'def1_pair');
});

// ── TEST 7 : CONFLIT VPN TIERS EN MODE DEFAULT_0 ──────────────────────────────
runTest('7. Conflit VPN tiers détecté en mode standard 0.0.0.0/0 (NordVPN)', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'NordLynx', nextHop: '10.5.0.1' },
  ];

  const conflict = VpnRoutingEngine.evaluateThirdPartyConflict(routes, [
    { name: 'NordVPN', alias: 'NordLynx' },
  ]);

  assert.strictEqual(conflict.state, 'conflict_confirmed');
  assert.strictEqual(conflict.vpnName, 'NordVPN');
  assert.strictEqual(conflict.pattern, 'default_0');
});

// ── TEST 8 : SUSPICION SANS CONFLIT (VPN ACTIF SANS INTERCEPTION PAR DÉFAUT) ──
runTest('8. Suspicion sans conflit si le VPN tiers est Up mais ne route pas par défaut (Tailscale/Meshnet)', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'Ethernet', nextHop: '192.168.1.254' },
    { destinationPrefix: '100.64.0.0/10', interfaceAlias: 'Tailscale', nextHop: '0.0.0.0' },
  ];

  const conflict = VpnRoutingEngine.evaluateThirdPartyConflict(routes, [
    { name: 'Tailscale', alias: 'Tailscale' },
  ]);

  assert.strictEqual(conflict.state, 'vpn_suspected');
  assert.strictEqual(conflict.vpnName, 'Tailscale');
  assert(conflict.reason.includes('ne route pas l\'ensemble du trafic'));
});

// ── TEST 9 : ABSENCE TOTALE DE CONFLIT ────────────────────────────────────────
runTest('9. Absence de conflit si aucun adaptateur VPN tiers n\'est présent', () => {
  const routes = [
    { destinationPrefix: '0.0.0.0/0', interfaceAlias: 'Ethernet', nextHop: '192.168.1.254' },
  ];

  const conflict = VpnRoutingEngine.evaluateThirdPartyConflict(routes, []);
  assert.strictEqual(conflict.state, 'no_conflict');
  assert.strictEqual(conflict.vpnName, null);
});

// ── TEST 10 : ERREUR DE LECTURE SUR DÉTECTION CONFLIT ─────────────────────────
runTest('10. Erreur de lecture sur détection de conflit renvoie unknown', () => {
  const conflict = VpnRoutingEngine.evaluateThirdPartyConflict(null, [
    { name: 'NordVPN', alias: 'NordLynx' },
  ]);
  assert.strictEqual(conflict.state, 'unknown');
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL 10 VPN ROUTING TESTS PASSED\n');
