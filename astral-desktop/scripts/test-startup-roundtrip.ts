/**
 * Test suite: Startup programs round-trip (REG_SZ and REG_EXPAND_SZ).
 *
 * Uses DEDICATED test-only registry entries under HKCU\...\Run.
 * Cleans up after each test. Never touches real startup programs.
 *
 * Run: npx tsx scripts/test-startup-roundtrip.ts
 */

import cp from 'child_process';
import fs from 'fs';
import path from 'path';

const REG_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const TEST_PREFIX = '__VanguardTest_';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  detail?: string;
}

const results: TestResult[] = [];
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  results.push({ name, passed: condition, detail });
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function regAdd(name: string, value: string, type: 'REG_SZ' | 'REG_EXPAND_SZ') {
  cp.execFileSync('reg.exe', ['add', REG_RUN, '/v', name, '/t', type, '/d', value, '/f'], { windowsHide: true });
}

function regQuery(name: string): { value: string; type: string } | null {
  try {
    const out = cp.execFileSync('reg.exe', ['query', REG_RUN, '/v', name], { encoding: 'utf8', windowsHide: true });
    const typeMatch = out.match(/\s+(REG_\w+)\s+(.+)/);
    if (!typeMatch) return null;
    return { type: typeMatch[1].trim(), value: typeMatch[2].trim() };
  } catch {
    return null;
  }
}

function regDelete(name: string) {
  try {
    cp.execFileSync('reg.exe', ['delete', REG_RUN, '/v', name, '/f'], { windowsHide: true });
  } catch { /* already gone */ }
}

/**
 * Simulate the disable path from performance.ts:
 * Read actual type → save to map → delete from registry.
 */
function simulateDisable(name: string, command: string): { regType: string; savedCmd: string } {
  // Read real type (as fixed in P-D)
  let detectedRegType = 'REG_SZ';
  try {
    const queryOut = cp.execFileSync('reg.exe', ['query', REG_RUN, '/v', name], { encoding: 'utf8', windowsHide: true });
    const typeMatch = queryOut.match(/\s+(REG_\w+)\s+/);
    if (typeMatch) detectedRegType = typeMatch[1];
  } catch { /* fallback */ }

  // Delete from registry
  cp.execFileSync('reg.exe', ['delete', REG_RUN, '/v', name, '/f'], { windowsHide: true });

  return { regType: detectedRegType, savedCmd: command };
}

/**
 * Simulate the enable/restore path from performance.ts.
 */
function simulateRestore(name: string, command: string, regType: string) {
  const regPath = REG_RUN;
  cp.execFileSync('reg.exe', ['add', regPath, '/v', name, '/t', regType, '/d', command, '/f'], { windowsHide: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n=== Test: Startup Round-trip REG_SZ ===');
{
  const name = `${TEST_PREFIX}SZ`;
  const cmd = 'C:\\Program Files\\TestApp\\app.exe --start';
  try {
    regAdd(name, cmd, 'REG_SZ');

    const before = regQuery(name);
    assert('Entry created with REG_SZ', before?.type === 'REG_SZ', `type=${before?.type}`);

    const { regType, savedCmd } = simulateDisable(name, cmd);
    assert('Detected type is REG_SZ', regType === 'REG_SZ', `detected=${regType}`);
    assert('Entry deleted after disable', regQuery(name) === null);

    simulateRestore(name, savedCmd, regType);
    const after = regQuery(name);
    assert('Entry restored with REG_SZ', after?.type === 'REG_SZ', `type=${after?.type}`);
    assert('Command preserved (REG_SZ)', after?.value === cmd, `value="${after?.value}" expected="${cmd}"`);
  } finally {
    regDelete(name);
    assert('Cleanup: test entry removed', regQuery(name) === null);
  }
}

console.log('\n=== Test: Startup Round-trip REG_EXPAND_SZ ===');
{
  const name = `${TEST_PREFIX}ExpSZ`;
  const cmd = '%LOCALAPPDATA%\\TestApp\\launcher.exe --background';
  try {
    regAdd(name, cmd, 'REG_EXPAND_SZ');

    const before = regQuery(name);
    assert('Entry created with REG_EXPAND_SZ', before?.type === 'REG_EXPAND_SZ', `type=${before?.type}`);
    // The raw stored value should contain the literal % variable, not an expanded path
    assert('Raw value preserved (not expanded)', before?.value?.includes('%'), `raw="${before?.value}"`);

    const { regType, savedCmd } = simulateDisable(name, cmd);
    assert('Detected type is REG_EXPAND_SZ', regType === 'REG_EXPAND_SZ', `detected=${regType}`);
    assert('Entry deleted after disable', regQuery(name) === null);

    simulateRestore(name, savedCmd, regType);
    const after = regQuery(name);
    assert('Entry restored with REG_EXPAND_SZ', after?.type === 'REG_EXPAND_SZ', `type=${after?.type}`);
    assert('Env var preserved after restore', after?.value?.includes('%'), `value="${after?.value}"`);
    assert('Command exactly preserved', after?.value === cmd, `value="${after?.value}" expected="${cmd}"`);
  } finally {
    regDelete(name);
    assert('Cleanup: test entry removed', regQuery(name) === null);
  }
}

console.log('\n=== Test: Arguments preserved ===');
{
  const name = `${TEST_PREFIX}Args`;
  const cmd = '"C:\\Program Files\\App With Spaces\\app.exe" --flag1 --flag2="value with space"';
  try {
    regAdd(name, cmd, 'REG_SZ');
    const { regType, savedCmd } = simulateDisable(name, cmd);
    simulateRestore(name, savedCmd, regType);
    const after = regQuery(name);
    assert('Arguments fully preserved', after?.value === cmd, `got="${after?.value}"`);
  } finally {
    regDelete(name);
  }
}

console.log('\n=== Test: No false success on error ===');
{
  // Attempt to disable a non-existent entry — should not throw uncaught
  const name = `${TEST_PREFIX}NonExistent`;
  let errorCaught = false;
  try {
    cp.execFileSync('reg.exe', ['delete', REG_RUN, '/v', name, '/f'], { windowsHide: true, stdio: 'pipe' });
  } catch {
    errorCaught = true;
  }
  assert('Non-existent entry deletion throws error', errorCaught);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} assertions`);
if (failed > 0) {
  console.error('\nFailed assertions:');
  results.filter(r => !r.passed).forEach(r => {
    console.error(`  ❌ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  });
  process.exit(1);
} else {
  console.log('✅ All startup round-trip tests passed.');
  process.exit(0);
}
