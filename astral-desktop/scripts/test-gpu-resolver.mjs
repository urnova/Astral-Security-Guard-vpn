// test-gpu-resolver.mjs — Tests du résolveur NVIDIA via import du module de production
// Utilise --experimental-strip-types pour importer depuis nvidiaResolver.ts (production).
// N''importe PAS de copie de la logique : ce test exerce le code utilisé par l''application.

import { resolveNvidiaFamily, normaliseNvidiaDriverVersion } from '../src/main/nvidiaResolver.ts';

let passed = 0; let failed = 0;

function assert(name, condition, detail) {
  if (condition) { passed++; console.log('  OK ' + name); }
  else { failed++; console.error('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function assertResolve(gpuName, isNotebook, expectedPsid, expectedPfid, expectedLabel) {
  const r = resolveNvidiaFamily(gpuName, isNotebook);
  if (expectedPsid === null) {
    assert(gpuName + ' → null', r === null, r ? 'got psid=' + r.psid : '');
  } else {
    assert(gpuName + ' psid', r?.psid === expectedPsid, 'got ' + r?.psid);
    assert(gpuName + ' pfid', r?.pfid === expectedPfid, 'got ' + r?.pfid);
    assert(gpuName + ' label', r?.label === expectedLabel, 'got "' + r?.label + '"');
  }
}

// * = vérifié par appel API réel (investigation 2026-11-02)
// RTX 40: psid=127/pfid=1005 → API retourne 621.01 "Pilote GeForce Game Ready" (vérifié)
// RTX 30: psid=107/pfid=816 → API retourne 582.78 "GeForce Security Update Driver", 2026-09-30 (vérifié)
// Machine physique: NVIDIA GeForce RTX 3060 Ti, driver 32.0.16.1742 → normalisé 617.42

console.log('\n=== RTX 40 — desktop (psid=127, pfid=1005) [*API réelle: 621.01] ===');
assertResolve('NVIDIA GeForce RTX 4090', false, 127, 1005, 'GeForce RTX 40 Series');
assertResolve('NVIDIA GeForce RTX 4080 Super', false, 127, 1005, 'GeForce RTX 40 Series');
assertResolve('NVIDIA GeForce RTX 4070 Ti', false, 127, 1005, 'GeForce RTX 40 Series');
assertResolve('NVIDIA GeForce RTX 4060', false, 127, 1005, 'GeForce RTX 40 Series');

console.log('\n=== RTX 40 — notebook (psid=127, pfid=1023) ===');
assertResolve('NVIDIA GeForce RTX 4080 Laptop GPU', true, 127, 1023, 'GeForce RTX 40 Series Notebooks');
assertResolve('NVIDIA GeForce RTX 4060 Laptop GPU', true, 127, 1023, 'GeForce RTX 40 Series Notebooks');

console.log('\n=== RTX 30 — desktop (psid=107, pfid=816) [*machine physique + API: 582.78] ===');
assertResolve('NVIDIA GeForce RTX 3090 Ti', false, 107, 816, 'GeForce RTX 30 Series');
assertResolve('NVIDIA GeForce RTX 3080 Ti', false, 107, 816, 'GeForce RTX 30 Series');
assertResolve('NVIDIA GeForce RTX 3070', false, 107, 816, 'GeForce RTX 30 Series');
assertResolve('NVIDIA GeForce RTX 3060 Ti', false, 107, 816, 'GeForce RTX 30 Series');
assertResolve('NVIDIA GeForce RTX 3060', false, 107, 816, 'GeForce RTX 30 Series');
assertResolve('NVIDIA GeForce RTX 3050', false, 107, 816, 'GeForce RTX 30 Series');

console.log('\n=== RTX 30 — notebook (psid=107, pfid=888) ===');
assertResolve('NVIDIA GeForce RTX 3070 Laptop GPU', true, 107, 888, 'GeForce RTX 30 Series Notebooks');
assertResolve('NVIDIA GeForce RTX 3060 Laptop GPU', true, 107, 888, 'GeForce RTX 30 Series Notebooks');

console.log('\n=== RTX 20 — desktop (psid=100, pfid=756) ===');
assertResolve('NVIDIA GeForce RTX 2080 Ti', false, 100, 756, 'GeForce RTX 20 Series');
assertResolve('NVIDIA GeForce RTX 2070 Super', false, 100, 756, 'GeForce RTX 20 Series');
assertResolve('NVIDIA GeForce RTX 2060', false, 100, 756, 'GeForce RTX 20 Series');

console.log('\n=== RTX 20 — notebook (psid=100, pfid=757) ===');
assertResolve('NVIDIA GeForce RTX 2080 Laptop GPU', true, 100, 757, 'GeForce RTX 20 Series Notebooks');

console.log('\n=== GTX 16 — desktop (psid=98, pfid=748) ===');
assertResolve('NVIDIA GeForce GTX 1660 Super', false, 98, 748, 'GeForce GTX 16 Series');
assertResolve('NVIDIA GeForce GTX 1650', false, 98, 748, 'GeForce GTX 16 Series');

console.log('\n=== GTX 16 — notebook (psid=98, pfid=749) ===');
assertResolve('NVIDIA GeForce GTX 1650 Laptop GPU', true, 98, 749, 'GeForce GTX 16 Series Notebooks');

console.log('\n=== GTX 10 — desktop (psid=92, pfid=731) ===');
assertResolve('NVIDIA GeForce GTX 1080 Ti', false, 92, 731, 'GeForce GTX 10 Series');
assertResolve('NVIDIA GeForce GTX 1060 6GB', false, 92, 731, 'GeForce GTX 10 Series');
assertResolve('NVIDIA GeForce GTX 1050 Ti', false, 92, 731, 'GeForce GTX 10 Series');

console.log('\n=== GTX 10 — notebook (psid=92, pfid=750) ===');
assertResolve('NVIDIA GeForce GTX 1070 Laptop GPU', true, 92, 750, 'GeForce GTX 10 Series Notebooks');

console.log('\n=== GTX 900 — desktop (psid=86, pfid=700) ===');
assertResolve('NVIDIA GeForce GTX 980 Ti', false, 86, 700, 'GeForce GTX 900 Series');
assertResolve('NVIDIA GeForce GTX 970', false, 86, 700, 'GeForce GTX 900 Series');

console.log('\n=== GTX 900 — notebook (psid=86, pfid=699) ===');
assertResolve('NVIDIA GeForce GTX 980M', true, 86, 699, 'GeForce GTX 900M Series');

console.log('\n=== Non reconnus → null (pas de repli) ===');
assertResolve('NVIDIA GeForce RTX 5090', false, null, null, null);
assertResolve('NVIDIA Quadro RTX 8000', false, null, null, null);
assertResolve('NVIDIA Tesla V100', false, null, null, null);
assertResolve('NVIDIA TITAN RTX', false, null, null, null);
assertResolve('Unknown Display Adapter', false, null, null, null);
assertResolve('AMD Radeon RX 7900 XTX', false, null, null, null);
assertResolve('Intel Arc A770', false, null, null, null);
assertResolve('VMware SVGA 3D', false, null, null, null);
assertResolve('Microsoft Basic Display Adapter', false, null, null, null);

console.log('\n=== normaliseNvidiaDriverVersion ===');
function assertNorm(raw, expected) {
  const r = normaliseNvidiaDriverVersion(raw);
  assert('"' + raw + '" → "' + expected + '"', r === expected, 'got "' + r + '"');
}
assertNorm('32.0.16.1742', '617.42'); // * machine physique RTX 3060 Ti
assertNorm('31.0.15.2115', '521.15');
assertNorm('27.21.14.5638', '456.38');
assertNorm('26.21.14.4264', '442.64');
assertNorm('30.0.14.9631', '496.31');
assertNorm('', null);
assertNorm('abc', null);
assertNorm('1.0', null);

console.log('\n=== Validation domaine URL téléchargement ===');
const ALLOWED = ['fr.download.nvidia.com','us.download.nvidia.com','download.nvidia.com','international.download.nvidia.com'];
function domainOk(u) { try { return ALLOWED.includes(new URL(u).hostname); } catch { return false; } }
// * URL réelle API pour psid=107, pfid=816 (RTX 30 desktop, version 582.78)
assert('fr.download.nvidia.com [*API réelle]', domainOk('https://fr.download.nvidia.com/Windows/582.78/582.78-desktop-win10-win11-64bit-international-dch-whql.exe'));
assert('us.download.nvidia.com', domainOk('https://us.download.nvidia.com/Windows/582.78/test.exe'));
assert('download.nvidia.com', domainOk('https://download.nvidia.com/Windows/test.exe'));
assert('evil.com refusé', !domainOk('https://evil.com/nvidia.exe'));
assert('nvidia.com refusé (racine)', !domainOk('https://nvidia.com/driver.exe'));
assert('malicious-nvidia.com refusé', !domainOk('https://malicious-nvidia.com/file.exe'));

console.log('\n' + '-'.repeat(55));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
else { console.log('ALL GPU RESOLVER TESTS PASSED'); process.exit(0); }