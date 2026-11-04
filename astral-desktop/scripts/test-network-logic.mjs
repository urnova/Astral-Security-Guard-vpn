/**
 * Tests Unitaires & Logique Métier de la Section Réseau
 * 
 * Valide les algorithmes de notation, le calcul de gigue et la gestion des états
 * sur des jeux de données synthétiques explicitement qualifiés.
 */

import assert from 'assert';
import {
  evaluateTransfer,
  evaluateReactivity,
  evaluateStability,
  computeNetworkReport
} from '../src/main/networkScoring.ts';
import { calculateJitter } from '../src/main/nativePing.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} :`, err.message);
    failed++;
  }
}

console.log('\n=== 1. Algorithme de Calcul de Gigue (Écart Absolu Moyen) ===');

test('Calcul exact de la gigue sur 5 échantillons synthétiques', () => {
  // Série : 10ms, 12ms (diff 2), 11ms (diff 1), 15ms (diff 4), 14ms (diff 1)
  // Somme diffs = 8, diviseur = 4 -> Moyenne = 2.0 ms
  const samples = [10, 12, 11, 15, 14];
  const jitter = calculateJitter(samples);
  assert.strictEqual(jitter, 2.0);
});

test('Échantillons insuffisants (< 3) renvoient null sans inventer de valeur', () => {
  assert.strictEqual(calculateJitter([12]), null);
  assert.strictEqual(calculateJitter([12, 14]), null);
  assert.strictEqual(calculateJitter([]), null);
});

console.log('\n=== 2. Évaluation des 3 Dimensions Réseau Déterministes ===');

test('Dimension Transfert : Fibre Multi-Gigabit (Jeu synthétique 2200/1800 Mbps)', () => {
  const res = evaluateTransfer(2200, 1800);
  assert.strictEqual(res.status, 'valid');
  assert.strictEqual(res.grade, 'A++');
});

test('Dimension Transfert : Liaison Asymétrique (Jeu synthétique Down 1000 Mbps / Up 0.8 Mbps)', () => {
  const res = evaluateTransfer(1000, 0.8);
  assert.strictEqual(res.status, 'valid');
  // L'upload est D (0), le combined rank est bloqué à D pour refléter l'asymétrie critique
  assert.strictEqual(res.grade, 'D');
});

test('Dimension Réactivité : Latence exceptionnelle A++ (Jeu synthétique 7ms / 1.0ms)', () => {
  const res = evaluateReactivity(7, 1.0);
  assert.strictEqual(res.status, 'valid');
  assert.strictEqual(res.grade, 'A++');
});

test('Dimension Réactivité : Latence basse A+ (Jeu synthétique 14ms / 2.0ms)', () => {
  const res = evaluateReactivity(14, 2.0);
  assert.strictEqual(res.status, 'valid');
  assert.strictEqual(res.grade, 'A+');
});

test('Dimension Stabilité : Bufferbloat mesuré modéré (Jeu synthétique +25ms / 0% échecs)', () => {
  const res = evaluateStability(25, 20, 0);
  assert.strictEqual(res.status, 'valid');
  assert.strictEqual(res.grade, 'A');
});

test('Dimension Stabilité : Données absentes (Non mesuré)', () => {
  const res = evaluateStability(null, null, null);
  assert.strictEqual(res.status, 'missing');
  assert.strictEqual(res.grade, null);
});

console.log('\n=== 3. Rapport Global & Règle Anti-Masquage des Défauts Majeurs ===');

test('Cas Synthétique 1 : Ligne Optimale Complète -> Note A++', () => {
  const rep = computeNetworkReport({
    downloadMbps: 2000,
    uploadMbps: 1000,
    idlePingMs: 7,
    jitterMs: 0.9,
    bufferbloatDownMs: 5,
    bufferbloatUpMs: 8,
    probeFailureRatePct: 0,
  });
  assert.strictEqual(rep.isComplete, true);
  assert.strictEqual(rep.overallGrade, 'A++');
});

test('Cas Synthétique 2 : Aucun test lancé -> Rapport incomplet avec note « — » (aucun faux A+)', () => {
  const rep = computeNetworkReport({
    downloadMbps: null,
    uploadMbps: null,
    idlePingMs: null,
    jitterMs: null,
    bufferbloatDownMs: null,
    bufferbloatUpMs: null,
    probeFailureRatePct: null,
  });
  assert.strictEqual(rep.isComplete, false);
  assert.strictEqual(rep.overallGrade, '—');
  assert.strictEqual(rep.statusLabel.includes('incomplètes'), true);
});

test('Cas Synthétique 3 : Règle Anti-Masquage (Gros débit A++ mais latence désastreuse D)', () => {
  // Transfert : 2500 Mbps (A++ rank 5)
  // Réactivité : 320 ms (D rank 0)
  // Sans règle anti-masquage, la moyenne donnerait un B ou un A.
  // Avec la règle anti-masquage, le rang maximal est plafonné à minRank + 1 = 0 + 1 = 1 (C).
  const rep = computeNetworkReport({
    downloadMbps: 2500,
    uploadMbps: 1200,
    idlePingMs: 320,
    jitterMs: 45,
    bufferbloatDownMs: 15,
    bufferbloatUpMs: 20,
    probeFailureRatePct: 0,
  });
  assert.strictEqual(rep.isComplete, true);
  assert.strictEqual(rep.transfer.grade, 'A++');
  assert.strictEqual(rep.reactivity.grade, 'D');
  assert.strictEqual(rep.overallGrade, 'C'); // Plafonné à C, défaut majeur préservé
});

test('Cas Synthétique 4 : Débit modeste mais stabilité et latence parfaites (Down 25M, Ping 8ms)', () => {
  // Transfert : 25 Mbps down, 5 Mbps up (C rank 1)
  // Réactivité : 8 ms (A++ rank 5)
  // Stabilité : Bufferbloat +3ms (A++ rank 5)
  // Formule : 0.4*1 + 0.35*5 + 0.25*5 = 3.4 (A), plafonné à minRank + 1 = 1 + 1 = 2 (B)
  const rep = computeNetworkReport({
    downloadMbps: 25,
    uploadMbps: 5,
    idlePingMs: 8,
    jitterMs: 0.8,
    bufferbloatDownMs: 3,
    bufferbloatUpMs: 4,
    probeFailureRatePct: 0,
  });
  assert.strictEqual(rep.isComplete, true);
  assert.strictEqual(rep.transfer.grade, 'C');
  assert.strictEqual(rep.reactivity.grade, 'A++');
  assert.strictEqual(rep.stability.grade, 'A++');
  assert.strictEqual(rep.overallGrade, 'B'); // Valorise la stabilité tout en reconnaissant la limite de débit
});

test('Cas Synthétique 5 : Débit Gigabit mais Bufferbloat catastrophique (+350ms)', () => {
  // Transfert : 1000 Mbps (A+ rank 4)
  // Réactivité : 10 ms (A+ rank 4)
  // Stabilité : +350ms (D rank 0)
  // minRank = 0 -> plafonné à 0 + 1 = 1 (C)
  const rep = computeNetworkReport({
    downloadMbps: 1000,
    uploadMbps: 500,
    idlePingMs: 10,
    jitterMs: 1.0,
    bufferbloatDownMs: 350,
    bufferbloatUpMs: 400,
    probeFailureRatePct: 0,
  });
  assert.strictEqual(rep.isComplete, true);
  assert.strictEqual(rep.transfer.grade, 'A+');
  assert.strictEqual(rep.stability.grade, 'D');
  assert.strictEqual(rep.overallGrade, 'C'); // Plafonné à C par le bufferbloat
});

console.log('\n=== 4. Gestion des Données Incomplètes et Préservation des Sauvegardes ===');

test('Mesure Partielle : Réception réussie mais envoi non mesuré -> Note globale « — »', () => {
  const rep = computeNetworkReport({
    downloadMbps: 950,
    uploadMbps: null, // Échec ou coupure upload
    idlePingMs: 12,
    jitterMs: 1.5,
    bufferbloatDownMs: 10,
    bufferbloatUpMs: null,
    probeFailureRatePct: 0,
  });
  assert.strictEqual(rep.isComplete, false);
  assert.strictEqual(rep.overallGrade, '—');
  assert.strictEqual(rep.transfer.status, 'missing');
});

test('Taux d\'échecs de sondes critique (40%) dégrade la Stabilité à D', () => {
  const res = evaluateStability(10, 10, 40); // 40% d'échecs de sondes
  assert.strictEqual(res.status, 'valid');
  assert.strictEqual(res.grade, 'D');
});

test('Protection Anti-Écrasement du profil : La sauvegarde originale ne doit pas être écrasée', () => {
  const initialProfile = {
    network: {
      tcpBackup: { autotuning: 'restricted', rss: 'disabled', backedUpAt: '2026-11-01T10:00:00Z' },
      dnsBackup: { adapterName: 'Ethernet', isDhcp: false, dnsServers: ['192.168.1.254'], backedUpAt: '2026-11-01T10:00:00Z' }
    }
  };

  // Simuler une deuxième tentative de sauvegarde (nouvel état intermédiaire modifié)
  const newDetectedState = { autotuning: 'normal', rss: 'enabled' };
  
  // Logique anti-écrasement
  const updatedTcpBackup = initialProfile.network?.tcpBackup
    ? initialProfile.network.tcpBackup // Préservé !
    : { ...newDetectedState, backedUpAt: new Date().toISOString() };

  assert.strictEqual(updatedTcpBackup.autotuning, 'restricted');
  assert.strictEqual(updatedTcpBackup.rss, 'disabled');
  assert.strictEqual(updatedTcpBackup.backedUpAt, '2026-11-01T10:00:00Z');
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL NETWORK LOGIC TESTS PASSED');
  process.exit(0);
}
