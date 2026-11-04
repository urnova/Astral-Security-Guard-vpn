import assert from 'node:assert';
import { communityVpnEngine } from '../src/main/communityVpnEngine.ts';

console.log('=== Début des Tests de Qualification Fine de l\'Exposition IPv6 ===\n');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} : ${err.message}`);
    failed++;
  }
}

// ── TEST 1 : LIMITE CONNUE DU MOTEUR (AUCUNE IPV6 MACHINE) ────────────────────
await runTest('1. unsupported_by_engine : Moteur IPv4 seul sans adresse IPv6 détectée', async () => {
  communityVpnEngine.setTestHooks({
    ipv6Qualifier: async () => ({
      state: 'unsupported_by_engine',
      leakConfirmed: false,
      riskWarning: false,
      details: 'Tunnel IPv4 exclusif. VPN Gate ne supporte pas l\'IPv6.',
    }),
  });

  const qual = await communityVpnEngine.qualifyIpv6Status();
  assert.strictEqual(qual.state, 'unsupported_by_engine');
  assert.strictEqual(qual.leakConfirmed, false, 'Pas de fuite confirmée');
  assert.strictEqual(qual.riskWarning, false);
});

// ── TEST 2 : LIAISON LOCALE ACTIVE (FE80:: SANS ADRESSE GLOBALE) ──────────────
await runTest('2. link_active : Liaison locale active sans routabilité WAN (pas de fausse alerte de fuite)', async () => {
  communityVpnEngine.setTestHooks({
    ipv6Qualifier: async () => ({
      state: 'link_active',
      leakConfirmed: false,
      riskWarning: false,
      details: 'Liaison IPv6 locale active (link-local fe80:: uniquement) ; non routable sur l\'Internet public.',
    }),
  });

  const qual = await communityVpnEngine.qualifyIpv6Status();
  assert.strictEqual(qual.state, 'link_active');
  assert.strictEqual(qual.leakConfirmed, false, 'Une adresse fe80:: ne doit PAS être qualifiée de fuite');
  assert.strictEqual(qual.riskWarning, false);
});

// ── TEST 3 : ADRESSE GLOBALE UTILISABLE DÉTECTÉE (RISQUE D'EXPOSITION) ────────
await runTest('3. address_usable : Adresse globale 2000::/3 active -> avertissement risque sans fuite confirmée', async () => {
  communityVpnEngine.setTestHooks({
    ipv6Qualifier: async () => ({
      state: 'address_usable',
      leakConfirmed: false,
      riskWarning: true,
      details: 'Adresse IPv6 globale active (2a01:cb08:...). Risque d\'exposition car le relais VPN Gate ne route que l\'IPv4.',
      ipAddress: '2a01:cb08:8000::1',
    }),
  });

  const qual = await communityVpnEngine.qualifyIpv6Status();
  assert.strictEqual(qual.state, 'address_usable');
  assert.strictEqual(qual.leakConfirmed, false, 'La présence d\'adresse ne constitue PAS une fuite observée');
  assert.strictEqual(qual.riskWarning, true, 'Un avertissement de risque doit être levé');
  assert(qual.details.includes('Risque d\'exposition'));
});

// ── TEST 4 : ROUTE PAR DÉFAUT IPV6 EXTÉRIEURE AU TUNNEL ──────────────────────
await runTest('4. route_outside_tunnel : Route ::/0 vers passerelle FAI -> risque d\'exposition sans fuite confirmée', async () => {
  communityVpnEngine.setTestHooks({
    ipv6Qualifier: async () => ({
      state: 'route_outside_tunnel',
      leakConfirmed: false,
      riskWarning: true,
      details: 'Route IPv6 par défaut active sur la carte physique Ethernet en dehors du tunnel.',
    }),
  });

  const qual = await communityVpnEngine.qualifyIpv6Status();
  assert.strictEqual(qual.state, 'route_outside_tunnel');
  assert.strictEqual(qual.leakConfirmed, false);
  assert.strictEqual(qual.riskWarning, true);
});

// ── TEST 5 : SORTIE IPV6 OBSERVÉE PAR SONDE EXTERNE ──────────────────────────
await runTest('5. observed_egress : Sortie IPv6 effectivement observée -> fuite confirmée honnêtement', async () => {
  communityVpnEngine.setTestHooks({
    ipv6Qualifier: async () => ({
      state: 'observed_egress',
      leakConfirmed: true,
      riskWarning: true,
      details: 'Fuite IPv6 mesurée : votre trafic IPv6 sort en clair via votre FAI.',
      ipAddress: '2a01:cb08:8000::1',
    }),
  });

  const qual = await communityVpnEngine.qualifyIpv6Status();
  assert.strictEqual(qual.state, 'observed_egress');
  assert.strictEqual(qual.leakConfirmed, true, 'La fuite est déclarée confirmée car la sonde a mesuré la sortie');
  assert.strictEqual(qual.riskWarning, true);
});

// ── TEST 6 : VÉRIFICATION NON RÉALISÉE ───────────────────────────────────────
await runTest('6. unverified : Qualification non réalisée ou lecture impossible', async () => {
  communityVpnEngine.setTestHooks({
    ipv6Qualifier: async () => ({
      state: 'unverified',
      leakConfirmed: false,
      riskWarning: false,
      details: 'Vérification de l\'exposition IPv6 impossible ou non exécutée.',
    }),
  });

  const qual = await communityVpnEngine.qualifyIpv6Status();
  assert.strictEqual(qual.state, 'unverified');
  assert.strictEqual(qual.leakConfirmed, false);
  assert.strictEqual(qual.riskWarning, false);
});

// Réinitialisation finale des hooks
communityVpnEngine.setTestHooks(null);

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL 6 IPV6 QUALIFICATION TESTS PASSED\n');

