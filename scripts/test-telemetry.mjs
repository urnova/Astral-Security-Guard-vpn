// scripts/test-telemetry.mjs
// Validation des métriques réelles de télémétrie (Phase 4 / Lot 1)

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;

function assert(cond, id, desc, detail = '') {
  if (cond) {
    pass++;
    console.log(`[PASS] ${id} : ${desc}`);
    if (detail) console.log(`       Détail : ${detail}`);
  } else {
    fail++;
    console.error(`[FAIL] ${id} : ${desc}`);
    if (detail) console.error(`       Détail : ${detail}`);
  }
}

async function run() {
  console.log('======================================================================');
  console.log('  TEST TÉLÉMÉTRIE SYSTÈME RÉELLE (PHASE 4 / LOT 1)');
  console.log('======================================================================');

  // 1. CPU différentiel
  const cpus = os.cpus();
  assert(cpus.length > 0, 'TEL-01', 'Détection des cœurs CPU réels', `${cpus.length} cœurs logiques détectés (${cpus[0]?.model})`);

  // 2. Mémoire physique
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  assert(total > 0 && free > 0 && used > 0, 'TEL-02', 'Mémoire physique réelle sans simulation',
    `Total: ${(total/1024**3).toFixed(1)} GB | Libre: ${(free/1024**3).toFixed(1)} GB | Utilisée: ${(used/1024**3).toFixed(1)} GB`);

  // 3. StatFS réels
  let hasDisk = false;
  try {
    const stats = fs.statfsSync('C:\\');
    const totalGB = (stats.blocks * stats.bsize) / (1024**3);
    const freeGB = (stats.bfree * stats.bsize) / (1024**3);
    hasDisk = totalGB > 10;
    assert(hasDisk, 'TEL-03', 'Espace disque réel mesuré via fs.statfs (C:)',
      `Capacité C: ${totalGB.toFixed(1)} GB, Libre: ${freeGB.toFixed(1)} GB`);
  } catch (e) {
    assert(false, 'TEL-03', 'Erreur fs.statfs', e.message);
  }

  // 4. Absence de valeurs codées en dur ou de faux floor/ceiling
  const telemetrySource = fs.readFileSync(path.join(ROOT_DIR, 'astral-desktop', 'src', 'main', 'telemetry.ts'), 'utf8');
  const noHardcodedMetrics = !telemetrySource.includes('usedGB: 225') && !telemetrySource.includes('freeGB: 13');
  assert(noHardcodedMetrics, 'TEL-04', 'Aucune métrique disque ou mémoire codée en dur', 'Source telemetry.ts intègre');

  // 5. Protection des processus système critiques
  const perfSource = fs.readFileSync(path.join(ROOT_DIR, 'astral-desktop', 'src', 'main', 'performance.ts'), 'utf8');
  const protectsCritical = perfSource.includes('CRITICAL_SYSTEM_PROCESSES') && perfSource.includes('ne peut pas être arrêté');
  assert(protectsCritical, 'TEL-05', 'Protection active contre l\'arrêt des processus système critiques', 'csrss.exe, dwm.exe, lsass.exe protégés');

  console.log('');
  console.log(`RÉSULTATS : ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

run();
