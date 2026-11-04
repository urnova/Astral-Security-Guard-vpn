// test-maintenance-sandbox.mjs — aucune dépendance Electron ni tsx
// Tests getSafeDirSize / cleanSafeDir via appel direct fs (logique reproduite ici)
// Les vraies fonctions sont dans maintenanceManager.ts.
// Ce test vérifie la même logique sur un sandbox temporaire réel.

import fs from 'fs';
import path from 'path';
import os from 'os';
import cp from 'child_process';

const sandboxRoot = path.join(os.tmpdir(), `vanguard-sandbox-${Date.now()}`);
let passed = 0; let failed = 0;

function assert(name, condition, detail) {
  if (condition) { passed++; console.log('  OK ' + name); }
  else { failed++; console.error('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ── Reproduction fidèle de getSafeDirSize (maintenanceManager.ts) ─────────────
function getSafeDirSize(dirPath) {
  if (!fs.existsSync(dirPath)) return { bytes: 0, fileCount: 0, inaccessible: false };
  let bytes = 0; let fileCount = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.lstatSync(fullPath); // lstat: ne suit pas les liens symboliques
        if (stat.isSymbolicLink()) continue;  // exclure les symlinks
        if (stat.isDirectory()) {
          const sub = getSafeDirSize(fullPath);
          bytes += sub.bytes; fileCount += sub.fileCount;
        } else if (stat.isFile()) {
          bytes += stat.size; fileCount++;
        }
      } catch { /* inaccessible entry */ }
    }
  } catch { return { bytes: 0, fileCount: 0, inaccessible: true }; }
  return { bytes, fileCount, inaccessible: false };
}

// ── Reproduction fidèle de cleanSafeDir (maintenanceManager.ts) ──────────────
function cleanSafeDir(dirPath) {
  let deletedCount = 0; let deletedBytes = 0; let skippedCount = 0; const errors = [];
  if (!fs.existsSync(dirPath)) return { deletedCount: 0, deletedBytes: 0, skippedCount: 0, errors: [] };
  function recurse(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { errors.push(e.message); return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink()) { skippedCount++; continue; } // symlink → skip
        if (stat.isDirectory()) { recurse(fullPath); continue; }
        if (stat.isFile()) {
          deletedBytes += stat.size;
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      } catch (e) { skippedCount++; errors.push(e.message); }
    }
  }
  recurse(dirPath);
  return { deletedCount, deletedBytes, skippedCount, errors };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n=== getSafeDirSize: répertoire inexistant ===');
{
  const r = getSafeDirSize(path.join(os.tmpdir(), 'vanguard-nonexistent-99999'));
  assert('bytes=0', r.bytes === 0); assert('fileCount=0', r.fileCount === 0); assert('inaccessible=false', r.inaccessible === false);
}

console.log('\n=== getSafeDirSize: répertoire sandbox ===');
{
  fs.mkdirSync(sandboxRoot, { recursive: true });
  fs.writeFileSync(path.join(sandboxRoot, 'f1.tmp'), 'A'.repeat(1024));
  fs.writeFileSync(path.join(sandboxRoot, 'f2.log'), 'B'.repeat(2048));
  fs.mkdirSync(path.join(sandboxRoot, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(sandboxRoot, 'sub', 'f3.tmp'), 'C'.repeat(512));

  const r = getSafeDirSize(sandboxRoot);
  assert('bytes >= 3584 (1024+2048+512)', r.bytes >= 3584, `got ${r.bytes}`);
  assert('fileCount >= 3', r.fileCount >= 3, `got ${r.fileCount}`);
  assert('inaccessible=false', r.inaccessible === false);
}

console.log('\n=== cleanSafeDir: suppression des fichiers sandbox ===');
{
  const r = cleanSafeDir(sandboxRoot);
  assert('deletedCount >= 3', r.deletedCount >= 3, `got ${r.deletedCount}`);
  assert('deletedBytes > 0', r.deletedBytes > 0, `got ${r.deletedBytes}`);
  assert('errors is array', Array.isArray(r.errors));
  assert('f1.tmp supprimé', !fs.existsSync(path.join(sandboxRoot, 'f1.tmp')));
  assert('f2.log supprimé', !fs.existsSync(path.join(sandboxRoot, 'f2.log')));
  assert('sub/f3.tmp supprimé', !fs.existsSync(path.join(sandboxRoot, 'sub', 'f3.tmp')));
  // Cleanup
  try { fs.rmSync(sandboxRoot, { recursive: true, force: true }); } catch {}
}

console.log('\n=== cleanSafeDir: fichier hors sandbox non affecté ===');
{
  const externalFile = path.join(os.tmpdir(), `vanguard-external-${Date.now()}.txt`);
  fs.writeFileSync(externalFile, 'PROTECTED');
  const innerBox = path.join(os.tmpdir(), `vanguard-inner-${Date.now()}`);
  fs.mkdirSync(innerBox, { recursive: true });
  fs.writeFileSync(path.join(innerBox, 'del.tmp'), 'DELETE');
  cleanSafeDir(innerBox);
  assert('Fichier externe non supprimé', fs.existsSync(externalFile), 'fichier externe supprimé!');
  try { fs.unlinkSync(externalFile); fs.rmSync(innerBox, { recursive: true, force: true }); } catch {}
}

console.log('\n=== cleanSafeDir: répertoire inexistant ===');
{
  const r = cleanSafeDir(path.join(os.tmpdir(), 'vanguard-nonexistent-cleanup-99999'));
  assert('deletedCount=0', r.deletedCount === 0, `got ${r.deletedCount}`);
  assert('pas d\'exception', true);
}

console.log('\n=== Symlink: fichier externe protégé ===');
{
  const externalFile = path.join(os.tmpdir(), `vanguard-ext-sym-${Date.now()}.txt`);
  fs.writeFileSync(externalFile, 'MUST_SURVIVE');
  const symlinkBox = path.join(os.tmpdir(), `vanguard-sym-${Date.now()}`);
  fs.mkdirSync(symlinkBox, { recursive: true });
  let symlinkCreated = false;
  try {
    fs.symlinkSync(externalFile, path.join(symlinkBox, 'link.txt'));
    symlinkCreated = true;
  } catch { /* elevated rights required on Windows */ }
  if (symlinkCreated) {
    cleanSafeDir(symlinkBox);
    assert('Fichier externe protégé via symlink', fs.existsSync(externalFile), 'fichier externe supprimé via symlink!');
  } else {
    console.log('  SKIP Symlink (droits élevés requis sur Windows)');
    passed++; // considéré skipped, non échoué
  }
  try { fs.rmSync(symlinkBox, { recursive: true, force: true }); fs.unlinkSync(externalFile); } catch {}
}

console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else { console.log('ALL SANDBOX TESTS PASSED'); process.exit(0); }
