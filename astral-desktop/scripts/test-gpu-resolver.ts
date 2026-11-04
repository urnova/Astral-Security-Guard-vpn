/**
 * Test suite: GPU driver check — resolveNvidiaFamily logic and handler routing.
 *
 * Tests the GPU family resolver table (psid/pfid selection) and the
 * multi-brand routing logic directly.
 *
 * NOTE: This tests the resolution LOGIC only — not the live NVIDIA API call.
 * Network calls are NOT made. Tests that depend on network are clearly labelled.
 *
 * Run: npx tsx scripts/test-gpu-resolver.ts
 */

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];
let passed = 0; let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  results.push({ name, passed: condition, detail });
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ── Copy of resolveNvidiaFamily for unit testing without loading all of gaming.ts ──
interface NvidiaFamily { psid: number; pfid: number; label: string; }

function resolveNvidiaFamily(gpuName: string, isNotebook: boolean): NvidiaFamily | null {
  const n = gpuName.toLowerCase();
  if (/rtx\s*5\d{3}/.test(n)) return null;
  if (/rtx\s*40\d{2}/.test(n)) return isNotebook
    ? { psid: 127, pfid: 1023, label: 'GeForce RTX 40 Series Notebooks' }
    : { psid: 127, pfid: 1005, label: 'GeForce RTX 40 Series' };
  if (/rtx\s*30\d{2}/.test(n)) return isNotebook
    ? { psid: 107, pfid: 888, label: 'GeForce RTX 30 Series Notebooks' }
    : { psid: 107, pfid: 816, label: 'GeForce RTX 30 Series' };
  if (/rtx\s*20\d{2}/.test(n)) return isNotebook
    ? { psid: 100, pfid: 757, label: 'GeForce RTX 20 Series Notebooks' }
    : { psid: 100, pfid: 756, label: 'GeForce RTX 20 Series' };
  if (/gtx\s*16\d{2}/.test(n)) return isNotebook
    ? { psid: 98, pfid: 749, label: 'GeForce GTX 16 Series Notebooks' }
    : { psid: 98, pfid: 748, label: 'GeForce GTX 16 Series' };
  if (/gtx\s*10\d{2}/.test(n)) return isNotebook
    ? { psid: 92, pfid: 750, label: 'GeForce GTX 10 Series Notebooks' }
    : { psid: 92, pfid: 731, label: 'GeForce GTX 10 Series' };
  if (/gtx\s*9\d{2}/.test(n)) return isNotebook
    ? { psid: 86, pfid: 699, label: 'GeForce GTX 900M Series' }
    : { psid: 86, pfid: 700, label: 'GeForce GTX 900 Series' };
  return null;
}

// ── GPU family resolver tests ─────────────────────────────────────────────────

console.log('\n=== Test: Known GPU families — desktop ===');
{
  const cases: [string, number, number][] = [
    ['NVIDIA GeForce RTX 4090', 127, 1005],
    ['NVIDIA GeForce RTX 4070 Ti', 127, 1005],
    ['NVIDIA GeForce RTX 3080', 107, 816],
    ['NVIDIA GeForce RTX 3060 Ti', 107, 816],
    ['NVIDIA GeForce RTX 2080 SUPER', 100, 756],
    ['NVIDIA GeForce GTX 1660 SUPER', 98, 748],
    ['NVIDIA GeForce GTX 1080 Ti', 92, 731],
    ['NVIDIA GeForce GTX 980', 86, 700],
  ];
  for (const [name, expectedPsid, expectedPfid] of cases) {
    const f = resolveNvidiaFamily(name, false);
    assert(`${name}: resolved (not null)`, f !== null, 'returned null');
    assert(`${name}: correct psid=${expectedPsid}`, f?.psid === expectedPsid, `got psid=${f?.psid}`);
    assert(`${name}: correct pfid=${expectedPfid}`, f?.pfid === expectedPfid, `got pfid=${f?.pfid}`);
  }
}

console.log('\n=== Test: Known GPU families — notebook ===');
{
  const cases: [string, number, number][] = [
    ['NVIDIA GeForce RTX 4060 Laptop GPU', 127, 1023],
    ['NVIDIA GeForce RTX 3070 Laptop GPU', 107, 888],
    ['NVIDIA GeForce RTX 2070 Max-Q', 100, 757],
    ['NVIDIA GeForce GTX 1650 Mobile', 92, 750],
  ];
  for (const [name, expectedPsid, expectedPfid] of cases) {
    const isNb = /laptop|mobile|max-q/i.test(name);
    const f = resolveNvidiaFamily(name, isNb);
    assert(`${name}: resolved as notebook`, f !== null && (f.psid === expectedPsid));
    assert(`${name}: correct pfid=${expectedPfid}`, f?.pfid === expectedPfid, `got pfid=${f?.pfid}`);
  }
}

console.log('\n=== Test: Unknown GPU → no fallback ===');
{
  const unknowns = [
    'NVIDIA GeForce RTX 5090',     // RTX 50 — not in catalog
    'NVIDIA Quadro P4000',          // Quadro — not in this table
    'NVIDIA Tesla K80',             // Tesla — not in this table
    'Some Unknown GPU XYZ',
    '',
  ];
  for (const name of unknowns) {
    const f = resolveNvidiaFamily(name, false);
    assert(`"${name || '(empty)'}" returns null (no fallback)`, f === null, `got family=${f?.label}`);
  }
}

console.log('\n=== Test: Handler routing — manufacturer detection ===');
{
  // Test that the manufacturer/name detection logic routes correctly
  // (mirroring the handler logic in gaming.ts)
  function detectBrand(gpuInfo: { name?: string; manufacturer?: string; isVirtual?: boolean }): string {
    const gpuName = String(gpuInfo?.name || '').trim();
    const mfg = String(gpuInfo?.manufacturer || '').toLowerCase();
    if (gpuInfo?.isVirtual || /virtual|basic display|meta quest|remotefx/i.test(gpuName)) return 'virtual';
    if (mfg === 'nvidia' || /geforce|nvidia|rtx|gtx|quadro/i.test(gpuName)) return 'nvidia';
    if (mfg === 'amd' || /radeon|amd/i.test(gpuName)) return 'amd';
    if (mfg === 'intel' || /intel uhd|intel iris|arc a\d+/i.test(gpuName)) return 'intel';
    return 'unknown';
  }

  assert('RTX 3080 → nvidia', detectBrand({ name: 'NVIDIA GeForce RTX 3080' }) === 'nvidia');
  assert('Radeon RX 6800 XT → amd', detectBrand({ name: 'AMD Radeon RX 6800 XT' }) === 'amd');
  assert('Intel UHD Graphics → intel', detectBrand({ name: 'Intel UHD Graphics 630' }) === 'intel');
  assert('Arc A770 → intel', detectBrand({ name: 'Intel Arc A770' }) === 'intel');
  assert('Virtual adapter → virtual', detectBrand({ name: 'Microsoft Basic Display Adapter' }) === 'virtual');
  assert('isVirtual flag → virtual', detectBrand({ name: 'Any GPU', isVirtual: true }) === 'virtual');
  assert('Empty name + unknown mfg → unknown', detectBrand({ name: '', manufacturer: 'unknown-brand' }) === 'unknown');
}

console.log('\n=== Test: Download URL domain validation ===');
{
  // Mirror the ALLOWED_NVIDIA_DOMAINS check in gaming.ts
  const ALLOWED = ['fr.download.nvidia.com', 'us.download.nvidia.com', 'download.nvidia.com', 'international.download.nvidia.com'];
  function isAllowedHost(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return ALLOWED.some(d => host === d);
    } catch { return false; }
  }

  assert('fr.download.nvidia.com allowed', isAllowedHost('https://fr.download.nvidia.com/Windows/537.34/537.34-desktop.exe'));
  assert('us.download.nvidia.com allowed', isAllowedHost('https://us.download.nvidia.com/Windows/537.34/537.34-desktop.exe'));
  assert('download.nvidia.com allowed', isAllowedHost('https://download.nvidia.com/Windows/537.34/537.34-desktop.exe'));
  assert('international.download.nvidia.com allowed', isAllowedHost('https://international.download.nvidia.com/Windows/537.34/file.exe'));
  assert('evil.nvidia.com.attacker.com NOT allowed', !isAllowedHost('https://evil.nvidia.com.attacker.com/file.exe'));
  assert('attacker.com NOT allowed', !isAllowedHost('https://attacker.com/file.exe'));
  assert('empty string NOT allowed', !isAllowedHost(''));
  assert('malformed URL NOT allowed', !isAllowedHost('not-a-url'));
}

console.log('\n=== Test: Version comparison edge cases ===');
{
  // Mirror the update detection logic
  function detectUpdate(installed: string, latest: string): { updateAvailable: boolean; status: string } {
    const installedNum = parseFloat(installed) || 0;
    const latestNum = parseFloat(latest) || 0;
    const updateAvailable = installedNum > 0 ? latestNum > installedNum : false;
    const status = installedNum === 0 ? 'version_unknown' : (updateAvailable ? 'update_available' : 'up_to_date');
    return { updateAvailable, status };
  }

  const r1 = detectUpdate('537.34', '546.33');
  assert('Newer version → update_available', r1.updateAvailable && r1.status === 'update_available');

  const r2 = detectUpdate('546.33', '537.34');
  assert('Older latest → up_to_date', !r2.updateAvailable && r2.status === 'up_to_date');

  const r3 = detectUpdate('', '546.33');
  assert('Unknown installed → version_unknown (not update_available)', !r3.updateAvailable && r3.status === 'version_unknown');

  const r4 = detectUpdate('546.33', '546.33');
  assert('Same version → up_to_date', !r4.updateAvailable && r4.status === 'up_to_date');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} assertions`);
if (failed > 0) {
  console.error('\nFailed:');
  results.filter(r => !r.passed).forEach(r => console.error(`  ❌ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`));
  process.exit(1);
} else {
  console.log('✅ All GPU resolver tests passed.');
  process.exit(0);
}
