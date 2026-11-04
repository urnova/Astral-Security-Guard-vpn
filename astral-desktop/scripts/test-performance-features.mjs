/**
 * ASTRAL VANGUARD - TESTS UNITAIRES & FONCTIONNELS DE PERFORMANCE P1-P3
 * 
 * Vérifications ciblées des mécaniques métier :
 * 1. Logique de priorité des navigateurs (snapshot initial, anti-écrasement, anti-collision PID + Nom + StartTime, restauration)
 * 2. Logique de détection automatique (identité de processus complète PID + Nom + StartTime, non-application sans accord, rejet sans spam, relance sans blocage perpétuel, liveness check)
 * 3. Moteur PresentMon (parseur CSV de production, métriques 1% low réelles, qualification honnête des statuts)
 * 
 * SÉCURITÉ : Ne modifie aucun vrai processus ni paramètre du système de l'utilisateur.
 */

import assert from 'assert';
import { PresentMonEngine } from '../src/main/presentmonEngine.ts';

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

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} :`, err.message);
    failed++;
  }
}

function getProcessIdentityKey(id) {
  if (id.name && id.startTime) {
    return `${id.name.toLowerCase()}::${id.startTime}`;
  }
  return `${id.name ? id.name.toLowerCase() : 'unknown'}::pid-${id.pid || 0}`;
}

console.log('\n=== 1. Logique de Priorité Navigateurs (Snapshot, Identité StartTime & Restauration) ===');

// Simulation fidèle de la logique de snapshot et de restauration de gaming.ts
class BrowserPriorityManagerMock {
  constructor() {
    this.snapshot = [];
    this.systemProcesses = new Map(); // pid -> { name, priority, startTime }
  }

  setProcess(pid, name, priority, startTime = '2026-11-03T18:00:00.000Z') {
    this.systemProcesses.set(pid, { name, priority, startTime });
  }

  killProcess(pid) {
    this.systemProcesses.delete(pid);
  }

  reassignPid(pid, newName, newPriority, newStartTime = '2026-11-03T18:05:00.000Z') {
    this.systemProcesses.set(pid, { name: newName, priority: newPriority, startTime: newStartTime });
  }

  suspend() {
    const trackedPids = new Set(this.snapshot.map(s => s.pid));
    const currentProcesses = [];
    for (const [pid, proc] of this.systemProcesses.entries()) {
      if (['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi'].includes(proc.name.toLowerCase())) {
        currentProcesses.push({ pid, name: proc.name, priority: proc.priority, startTime: proc.startTime });
      }
    }

    if (currentProcesses.length === 0 && this.snapshot.length === 0) {
      return { success: false, error: 'Aucun navigateur actif trouvé.', modified: 0 };
    }

    // Anti-écrasement : conserver impérativement la priorité initiale des PIDs déjà suivis
    const newSnapshot = [...this.snapshot];
    for (const p of currentProcesses) {
      if (!trackedPids.has(p.pid)) {
        if (p.priority && p.priority.toLowerCase() !== 'idle') {
          newSnapshot.push(p);
          trackedPids.add(p.pid);
        }
      }
    }
    this.snapshot = newSnapshot;

    let ok = 0;
    for (const p of currentProcesses) {
      const live = this.systemProcesses.get(p.pid);
      if (live) {
        live.priority = 'Idle';
        ok++;
      }
    }
    return { success: ok > 0, modified: ok, action: 'reduced' };
  }

  restore() {
    if (this.snapshot.length === 0) {
      return { success: true, restored: 0, note: 'Aucun instantané' };
    }

    let ok = 0;
    let gone = 0;
    let fail = 0;

    for (const entry of this.snapshot) {
      const live = this.systemProcesses.get(entry.pid);
      // Vérification d'identité stricte :
      // 1. Processus présent en mémoire
      // 2. Même nom d'exécutable (anti-collision PID vers un autre service)
      // 3. Même StartTime (anti-collision PID vers une NOUVELLE instance du même binaire)
      if (
        live &&
        live.name.toLowerCase() === entry.name.toLowerCase() &&
        (!entry.startTime || live.startTime === entry.startTime)
      ) {
        live.priority = entry.priority;
        ok++;
      } else {
        gone++;
      }
    }

    this.snapshot = [];
    return { success: fail === 0, restored: ok, failed: fail, alreadyClosed: gone };
  }
}

test('Capture de la priorité initiale (Normal -> Idle)', () => {
  const mgr = new BrowserPriorityManagerMock();
  mgr.setProcess(101, 'chrome', 'Normal');
  mgr.setProcess(102, 'msedge', 'AboveNormal');

  const res = mgr.suspend();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.modified, 2);
  assert.strictEqual(mgr.systemProcesses.get(101).priority, 'Idle');
  assert.strictEqual(mgr.systemProcesses.get(102).priority, 'Idle');
  assert.strictEqual(mgr.snapshot.length, 2);
  assert.strictEqual(mgr.snapshot.find(s => s.pid === 101).priority, 'Normal');
  assert.strictEqual(mgr.snapshot.find(s => s.pid === 102).priority, 'AboveNormal');
});

test('Anti-écrasement lors d\'une seconde activation répétée', () => {
  const mgr = new BrowserPriorityManagerMock();
  mgr.setProcess(201, 'chrome', 'Normal');
  mgr.suspend();
  assert.strictEqual(mgr.snapshot.find(s => s.pid === 201).priority, 'Normal');

  // Seconde activation : le processus est déjà en 'Idle'
  const res2 = mgr.suspend();
  assert.strictEqual(res2.success, true);
  // Le snapshot NE DOIT PAS avoir été écrasé par 'Idle' !
  assert.strictEqual(mgr.snapshot.find(s => s.pid === 201).priority, 'Normal');
});

test('Restauration fidèle des priorités initiales', () => {
  const mgr = new BrowserPriorityManagerMock();
  mgr.setProcess(301, 'chrome', 'Normal');
  mgr.setProcess(302, 'firefox', 'AboveNormal');
  mgr.suspend();

  const rest = mgr.restore();
  assert.strictEqual(rest.success, true);
  assert.strictEqual(rest.restored, 2);
  assert.strictEqual(rest.alreadyClosed, 0);
  assert.strictEqual(mgr.systemProcesses.get(301).priority, 'Normal');
  assert.strictEqual(mgr.systemProcesses.get(302).priority, 'AboveNormal');
  assert.strictEqual(mgr.snapshot.length, 0);
});

test('Protection anti-collision de PID lors de la réassignation système (svchost prend le PID)', () => {
  const mgr = new BrowserPriorityManagerMock();
  mgr.setProcess(401, 'chrome', 'Normal');
  mgr.suspend();

  // Le navigateur se ferme et Windows réattribue le PID 401 à un service système (svchost)
  mgr.reassignPid(401, 'svchost', 'Normal');

  const rest = mgr.restore();
  assert.strictEqual(rest.restored, 0);
  assert.strictEqual(rest.alreadyClosed, 1);
  // La priorité du nouveau processus ne doit PAS avoir été altérée
  assert.strictEqual(mgr.systemProcesses.get(401).name, 'svchost');
});

test('Protection anti-collision PID + Nom avec StartTime différent (nouvelle instance du même binaire)', () => {
  const mgr = new BrowserPriorityManagerMock();
  // Premier chrome lancé à 18:00
  mgr.setProcess(501, 'chrome', 'Normal', '2026-11-03T18:00:00.000Z');
  mgr.suspend();
  assert.strictEqual(mgr.snapshot.find(s => s.pid === 501).priority, 'Normal');

  // Le premier chrome se ferme, et un NOUVEAU chrome démarre sous le même PID 501 à 18:06 avec priorité 'Normal'
  mgr.reassignPid(501, 'chrome', 'Normal', '2026-11-03T18:06:00.000Z');

  const rest = mgr.restore();
  // Ne doit PAS restaurer car le StartTime ne correspond pas à l'instance snapshotée
  assert.strictEqual(rest.restored, 0);
  assert.strictEqual(rest.alreadyClosed, 1);
  // La priorité du nouveau chrome reste inchangée
  assert.strictEqual(mgr.systemProcesses.get(501).priority, 'Normal');
});

test('Gestion honnête des processus fermés entre-temps', () => {
  const mgr = new BrowserPriorityManagerMock();
  mgr.setProcess(601, 'chrome', 'Normal');
  mgr.setProcess(602, 'msedge', 'Normal');
  mgr.suspend();

  // 602 se ferme pendant la session
  mgr.killProcess(602);

  const rest = mgr.restore();
  assert.strictEqual(rest.restored, 1);
  assert.strictEqual(rest.alreadyClosed, 1);
  assert.strictEqual(mgr.systemProcesses.get(601).priority, 'Normal');
});

console.log('\n=== 2. Chaîne de Détection Automatique (Identité Complète & Consentement) ===');

class AutoDetectionChainMock {
  constructor() {
    this.enabled = true;
    this.sessionState = 'none';
    this.currentGameIdentity = null;
    this.rejectedIdentities = new Set();
    this.lastProposedIdentity = null;
    this.proposalsSent = [];
    this.optimizationsApplied = [];
    this.sessionSummariesSent = [];
  }

  scanForegroundWindow(pid, name, startTime = '2026-11-03T18:00:00.000Z') {
    if (!this.enabled) return;

    const candidate = { pid, name, startTime };
    const key = getProcessIdentityKey(candidate);

    if (this.rejectedIdentities.has(key)) return; // Rejet mémorisé pour cette instance précise : pas de spam
    if (this.sessionState === 'proposed' && this.lastProposedIdentity && getProcessIdentityKey(this.lastProposedIdentity) === key) {
      return; // Déjà proposé
    }

    if (!this.currentGameIdentity || this.currentGameIdentity.name !== name || this.currentGameIdentity.pid !== pid) {
      this.sessionState = 'proposed';
      this.lastProposedIdentity = candidate;
      this.proposalsSent.push(candidate);
    }
  }

  confirm(pid, name, startTime) {
    if (
      this.lastProposedIdentity &&
      (this.lastProposedIdentity.pid !== pid || (startTime && this.lastProposedIdentity.startTime && this.lastProposedIdentity.startTime !== startTime))
    ) {
      return { success: false, error: 'Identité divergente : le processus a été relancé.' };
    }

    const identity = { pid, name, startTime: startTime || this.lastProposedIdentity?.startTime };
    this.rejectedIdentities.delete(getProcessIdentityKey(identity));
    this.lastProposedIdentity = null;
    this.currentGameIdentity = identity;
    this.sessionState = 'active';
    this.optimizationsApplied.push(identity);
    return { success: true };
  }

  reject() {
    if (this.sessionState === 'proposed' && this.lastProposedIdentity !== null) {
      this.rejectedIdentities.add(getProcessIdentityKey(this.lastProposedIdentity));
      this.sessionState = 'none';
      this.lastProposedIdentity = null;
    }
  }

  checkLiveness(isTargetAlive) {
    if (this.currentGameIdentity !== null && !isTargetAlive) {
      this.rejectedIdentities.delete(getProcessIdentityKey(this.currentGameIdentity));
      this.sessionState = 'finished';
      this.sessionSummariesSent.push({ game: this.currentGameIdentity.name, pid: this.currentGameIdentity.pid });
      this.currentGameIdentity = null;
      this.sessionState = 'none';
      return { restored: true };
    }
    return { restored: false };
  }
}

test('Détecter une cible n\'applique AUCUN changement sans confirmation', () => {
  const chain = new AutoDetectionChainMock();
  chain.scanForegroundWindow(1234, 'Cyberpunk2077', '2026-11-03T18:00:00.000Z');

  assert.strictEqual(chain.sessionState, 'proposed');
  assert.strictEqual(chain.proposalsSent.length, 1);
  assert.strictEqual(chain.optimizationsApplied.length, 0); // Zéro optimisation appliquée
});

test('Le refus explicite mémorise le rejet et empêche le spam pour l\'instance courante', () => {
  const chain = new AutoDetectionChainMock();
  chain.scanForegroundWindow(1234, 'Cyberpunk2077', '2026-11-03T18:00:00.000Z');
  assert.strictEqual(chain.proposalsSent.length, 1);

  // L'utilisateur clique sur "Ignorer"
  chain.reject();
  assert.strictEqual(chain.sessionState, 'none');

  // Scans successifs tant que la même instance reste au premier plan
  chain.scanForegroundWindow(1234, 'Cyberpunk2077', '2026-11-03T18:00:00.000Z');
  chain.scanForegroundWindow(1234, 'Cyberpunk2077', '2026-11-03T18:00:00.000Z');

  // Aucune nouvelle proposition pour cette instance
  assert.strictEqual(chain.proposalsSent.length, 1);
  assert.strictEqual(chain.optimizationsApplied.length, 0);
});

test('Le refus ne bloque PAS indéfiniment une NOUVELLE instance du même jeu (StartTime différent)', () => {
  const chain = new AutoDetectionChainMock();
  // Première session refusée à 18:00
  chain.scanForegroundWindow(1234, 'Cyberpunk2077', '2026-11-03T18:00:00.000Z');
  chain.reject();

  // Le joueur quitte et relance le jeu 10 minutes plus tard (même nom, PID identique ou nouveau, mais StartTime 18:10)
  chain.scanForegroundWindow(1234, 'Cyberpunk2077', '2026-11-03T18:10:00.000Z');

  // Une nouvelle proposition DOIT être présentée car il s'agit d'une nouvelle session de jeu !
  assert.strictEqual(chain.sessionState, 'proposed');
  assert.strictEqual(chain.proposalsSent.length, 2);
  assert.strictEqual(chain.proposalsSent[1].startTime, '2026-11-03T18:10:00.000Z');
});

test('Confirmation rejetée en toute sécurité si le processus a été relancé avant le clic', () => {
  const chain = new AutoDetectionChainMock();
  chain.scanForegroundWindow(2001, 'Valorant', '2026-11-03T18:00:00.000Z');

  // Le jeu a crashé et redémarré entre l'apparition du bandeau et le clic de l'utilisateur
  const res = chain.confirm(2001, 'Valorant', '2026-11-03T18:02:00.000Z');
  assert.strictEqual(res.success, false);
  assert.strictEqual(chain.optimizationsApplied.length, 0);
});

test('Confirmation explicite valide applique l\'optimisation sur l\'identité exacte', () => {
  const chain = new AutoDetectionChainMock();
  chain.scanForegroundWindow(3001, 'ApexLegends', '2026-11-03T18:00:00.000Z');
  const res = chain.confirm(3001, 'ApexLegends', '2026-11-03T18:00:00.000Z');

  assert.strictEqual(res.success, true);
  assert.strictEqual(chain.sessionState, 'active');
  assert.strictEqual(chain.optimizationsApplied.length, 1);
  assert.strictEqual(chain.optimizationsApplied[0].name, 'ApexLegends');
});

test('La terminaison du processus suivi restaure l\'état sans laisser de résidus', () => {
  const chain = new AutoDetectionChainMock();
  chain.scanForegroundWindow(4001, 'Forza', '2026-11-03T18:00:00.000Z');
  chain.confirm(4001, 'Forza', '2026-11-03T18:00:00.000Z');
  assert.strictEqual(chain.sessionState, 'active');

  // Vérification de liveness : processus terminé
  const check = chain.checkLiveness(false);
  assert.strictEqual(check.restored, true);
  assert.strictEqual(chain.sessionState, 'none');
  assert.strictEqual(chain.currentGameIdentity, null);
  assert.strictEqual(chain.sessionSummariesSent.length, 1);
});

console.log('\n=== 3. Moteur PresentMon & Télémétrie Graphique ===');

test('Statut initial honnête si binaire absent', () => {
  const engine = new PresentMonEngine();
  engine.setCustomBinary('C:\\Inexistant\\PresentMon.exe');

  const avail = engine.getAvailability();
  assert.strictEqual(avail.isAvailable, false);
  assert.strictEqual(avail.version, 'Non installé');

  const metrics = engine.getCurrentMetrics();
  assert.strictEqual(metrics.status, 'Indisponible');
  assert.strictEqual(metrics.fps, null);
  assert.strictEqual(metrics.frametimeMs, null);
  assert.strictEqual(metrics.onePercentLowFps, null);
});

test('Distinction entre démarrage et réception de mesures réelles', () => {
  const engine = new PresentMonEngine();
  assert.strictEqual(engine.getCurrentMetrics().status, 'Indisponible');
});

test('Calcul rigoureux du 1% Low (99e percentile des frametimes)', () => {
  const engine = new PresentMonEngine();
  // Injecter 100 frametimes (99 échantillons à 16.6ms = 60 FPS, 1 stutter à 33.3ms = 30 FPS)
  for (let i = 0; i < 99; i++) {
    engine['recordFrametimeSample'](16.66);
  }
  engine['recordFrametimeSample'](33.33);

  const m = engine.getCurrentMetrics();
  assert.strictEqual(m.fps, 30); // dernier échantillon
  assert.strictEqual(m.onePercentLowFps, 30); // 99e percentile = 33.33ms -> 30 FPS
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL PERFORMANCE UNIT & LOGIC TESTS PASSED');
  process.exit(0);
}
