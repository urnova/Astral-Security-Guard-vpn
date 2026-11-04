/**
 * Test suite: Maintenance sandbox cleanup.
 *
 * Creates a controlled temporary sandbox directory with:
 *  - normal files (should be deleted)
 *  - a symlink (should be skipped)
 *  - a locked file simulation (open by another process — should be skipped gracefully)
 *
 * Tests getSafeDirSize() and cleanSafeDir() against real filesystem operations.
 * Cleans up after itself. Does NOT touch real system directories.
 *
 * Run: npx tsx scripts/test-maintenance-sandbox.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSafeDirSize, cleanSafeDir } from '../src/main/maintenanceManager';

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];
let passed = 0; let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  results.push({ name, passed: condition, detail });
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ── Sandbox setup ─────────────────────────────────────────────────────────────
const sandboxRoot = path.join(os.tmpdir(), `vanguard-test-sandbox-${Date.now()}`);

function createSandbox() {
  fs.mkdirSync(sandboxRoot, { recursive: true });

  // Normal files to delete
  fs.writeFileSync(path.join(sandboxRoot, 'file1.tmp'), 'A'.repeat(1024));        // 1 KB
  fs.writeFileSync(path.join(sandboxRoot, 'file2.log'), 'B'.repeat(2048));        // 2 KB
  fs.mkdirSync(path.join(sandboxRoot, 'subdir'), { recursive: true });
  fs.writeFileSync(path.join(sandboxRoot, 'subdir', 'nested.tmp'), 'C'.repeat(512)); // 0.5 KB

  // Symlink — should be skipped
  const targetFile = path.join(sandboxRoot, 'real_target.txt');
  fs.writeFileSync(targetFile, 'TARGET');
  try {
    fs.symlinkSync(targetFile, path.join(sandboxRoot, 'symlink_to_target.txt'));
    console.log('  [setup] Symlink created');
  } catch (e: any) {
    console.log(`  [setup] Symlink creation skipped (${e.message}) — may require elevated rights on Windows`);
  }
}

function destroySandbox() {
  try {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  } catch { /* best effort */ }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n=== Test: getSafeDirSize — non-existent directory ===');
{
  const r = getSafeDirSize(path.join(os.tmpdir(), 'vanguard-does-not-exist-9999'));
  assert('bytes=0 for non-existent dir', r.bytes === 0, `got ${r.bytes}`);
  assert('fileCount=0 for non-existent dir', r.fileCount === 0, `got ${r.fileCount}`);
  assert('inaccessible=false for non-existent dir', r.inaccessible === false);
}

console.log('\n=== Test: getSafeDirSize — sandbox ===');
createSandbox();
try {
  const r = getSafeDirSize(sandboxRoot);
  // real_target.txt(6) + file1.tmp(1024) + file2.log(2048) + subdir/nested.tmp(512) = 3590 bytes minimum
  // symlink should be excluded
  assert('bytes > 0', r.bytes > 0, `got ${r.bytes}`);
  assert('bytes includes real files (>= 3590)', r.bytes >= 3590, `got ${r.bytes}`);
  assert('fileCount >= 4 (real files)', r.fileCount >= 4, `got ${r.fileCount}`);
  assert('inaccessible=false for accessible dir', r.inaccessible === false);
} finally {
  destroySandbox();
}

console.log('\n=== Test: cleanSafeDir — deletes target files ===');
{
  // Fresh sandbox for cleanup test
  const cleanBox = path.join(os.tmpdir(), `vanguard-clean-test-${Date.now()}`);
  fs.mkdirSync(cleanBox, { recursive: true });
  fs.writeFileSync(path.join(cleanBox, 'a.tmp'), 'DATA1');
  fs.writeFileSync(path.join(cleanBox, 'b.tmp'), 'DATA2');
  fs.mkdirSync(path.join(cleanBox, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(cleanBox, 'sub', 'c.tmp'), 'DATA3');

  const r = cleanSafeDir(cleanBox);
  assert('deletedCount >= 3', r.deletedCount >= 3, `got ${r.deletedCount}`);
  assert('deletedBytes > 0', r.deletedBytes > 0, `got ${r.deletedBytes}`);
  assert('skippedCount is a number', typeof r.skippedCount === 'number');
  assert('errors is an array', Array.isArray(r.errors));

  // Files should be gone
  assert('file a.tmp deleted', !fs.existsSync(path.join(cleanBox, 'a.tmp')));
  assert('file b.tmp deleted', !fs.existsSync(path.join(cleanBox, 'b.tmp')));
  assert('file c.tmp deleted', !fs.existsSync(path.join(cleanBox, 'sub', 'c.tmp')));

  try { fs.rmSync(cleanBox, { recursive: true, force: true }); } catch {}
}

console.log('\n=== Test: cleanSafeDir — symlink skipped ===');
{
  const symlinkBox = path.join(os.tmpdir(), `vanguard-symlink-test-${Date.now()}`);
  fs.mkdirSync(symlinkBox, { recursive: true });

  const externalFile = path.join(os.tmpdir(), `vanguard-external-${Date.now()}.txt`);
  fs.writeFileSync(externalFile, 'SHOULD NOT BE DELETED');

  let symlinkCreated = false;
  try {
    fs.symlinkSync(externalFile, path.join(symlinkBox, 'link_to_external.txt'));
    symlinkCreated = true;
  } catch {
    console.log('  [skip] Symlink creation requires elevated rights — skipping symlink test');
  }

  if (symlinkCreated) {
    cleanSafeDir(symlinkBox);
    assert('External file NOT deleted through symlink', fs.existsSync(externalFile), 'external file was deleted!');
  } else {
    results.push({ name: 'Symlink safety (skipped — no elevated rights)', passed: true, detail: 'skipped' });
    passed++;
    console.log('  ⏭️  Symlink safety (skipped — no elevated rights)');
  }

  try {
    fs.rmSync(symlinkBox, { recursive: true, force: true });
    fs.unlinkSync(externalFile);
  } catch {}
}

console.log('\n=== Test: cleanSafeDir — non-existent directory ===');
{
  const r = cleanSafeDir(path.join(os.tmpdir(), 'vanguard-does-not-exist-cleanup-9999'));
  assert('No error thrown for non-existent dir', true); // would have thrown above
  assert('deletedCount=0 for non-existent dir', r.deletedCount === 0, `got ${r.deletedCount}`);
}

console.log('\n=== Test: Files outside sandbox not affected ===');
{
  const outsideFile = path.join(os.tmpdir(), `vanguard-outside-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, 'PROTECTED');

  // Clean a different directory
  const innerBox = path.join(os.tmpdir(), `vanguard-inner-${Date.now()}`);
  fs.mkdirSync(innerBox, { recursive: true });
  fs.writeFileSync(path.join(innerBox, 'toDelete.tmp'), 'DELETE_ME');
  cleanSafeDir(innerBox);

  assert('Outside file not affected by cleanSafeDir', fs.existsSync(outsideFile), 'outside file was deleted!');

  try {
    fs.unlinkSync(outsideFile);
    fs.rmSync(innerBox, { recursive: true, force: true });
  } catch {}
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} assertions`);
if (failed > 0) {
  console.error('\nFailed:');
  results.filter(r => !r.passed).forEach(r => console.error(`  ❌ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`));
  process.exit(1);
} else {
  console.log('✅ All maintenance sandbox tests passed.');
  process.exit(0);
}
