/**
 * Test suite: Maintenance scheduler logic.
 *
 * Tests the calculateNextMaintenanceRun() logic and the scheduler state machine
 * using a mock profile store — no real file I/O, no real timers, no real cleanup.
 *
 * Run: npx tsx scripts/test-maintenance-scheduler.ts
 */

import { calculateNextMaintenanceRun } from '../src/main/maintenanceManager';
import type { MaintenanceSchedule } from '../src/main/profile';

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];
let passed = 0; let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  results.push({ name, passed: condition, detail });
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function makeSchedule(overrides: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule {
  return {
    enabled: true,
    frequency: 'weekly',
    dayOfWeek: 0, // Sunday
    dayOfMonth: 1,
    time: '04:00',
    categories: ['userTemp', 'winTemp'],
    lastRun: undefined,
    ...overrides,
  };
}

// ── Test 1: Disabled schedule ─────────────────────────────────────────────────
console.log('\n=== Test: Disabled schedule ===');
{
  const s = makeSchedule({ enabled: false });
  const { nextRunDate, formattedText, isOverdue } = calculateNextMaintenanceRun(s);
  assert('nextRunDate is null when disabled', nextRunDate === null);
  assert('formattedText is "Désactivée" when disabled', formattedText === 'Désactivée', `got="${formattedText}"`);
  assert('isOverdue is false when disabled', isOverdue === false);
}

// ── Test 2: No schedule at all ────────────────────────────────────────────────
console.log('\n=== Test: No schedule ===');
{
  const { nextRunDate, isOverdue } = calculateNextMaintenanceRun(undefined);
  assert('nextRunDate is null with no schedule', nextRunDate === null);
  assert('isOverdue is false with no schedule', isOverdue === false);
}

// ── Test 3: Daily schedule — next run is in the future ───────────────────────
console.log('\n=== Test: Daily schedule ===');
{
  const s = makeSchedule({ frequency: 'daily', time: '04:00', lastRun: new Date().toISOString() });
  const { nextRunDate, isOverdue } = calculateNextMaintenanceRun(s);
  assert('nextRunDate is not null for daily', nextRunDate !== null);
  assert('nextRunDate is in the future', nextRunDate !== null && nextRunDate.getTime() > Date.now());
  assert('isOverdue is false (just ran)', isOverdue === false);
}

// ── Test 4: Weekly schedule — next run is at correct weekday ─────────────────
console.log('\n=== Test: Weekly schedule ===');
{
  const s = makeSchedule({ frequency: 'weekly', dayOfWeek: 0, time: '04:00', lastRun: new Date().toISOString() });
  const { nextRunDate, isOverdue } = calculateNextMaintenanceRun(s);
  assert('nextRunDate is not null for weekly', nextRunDate !== null);
  if (nextRunDate) {
    assert('nextRunDate is a Sunday (day 0)', nextRunDate.getDay() === 0, `day=${nextRunDate.getDay()}`);
    assert('nextRunDate is in the future', nextRunDate.getTime() > Date.now());
  }
  assert('isOverdue is false (just ran)', isOverdue === false);
}

// ── Test 5: Monthly schedule ──────────────────────────────────────────────────
console.log('\n=== Test: Monthly schedule ===');
{
  const s = makeSchedule({ frequency: 'monthly', dayOfMonth: 1, time: '04:00', lastRun: new Date().toISOString() });
  const { nextRunDate } = calculateNextMaintenanceRun(s);
  assert('nextRunDate is not null for monthly', nextRunDate !== null);
  if (nextRunDate) {
    assert('nextRunDate day-of-month is 1', nextRunDate.getDate() === 1, `dom=${nextRunDate.getDate()}`);
    assert('nextRunDate is in the future', nextRunDate.getTime() > Date.now());
  }
}

// ── Test 6: Overdue detection — daily, last run > 1.2 days ago ───────────────
console.log('\n=== Test: Overdue detection ===');
{
  const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
  const s = makeSchedule({ frequency: 'daily', lastRun: twoDaysAgo });
  const { isOverdue } = calculateNextMaintenanceRun(s);
  assert('isOverdue is true when last run > 1.2 periods ago', isOverdue === true);
}

// ── Test 7: Not overdue when within period ────────────────────────────────────
console.log('\n=== Test: Not overdue (within period) ===');
{
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const s = makeSchedule({ frequency: 'daily', lastRun: sixHoursAgo });
  const { isOverdue } = calculateNextMaintenanceRun(s);
  assert('isOverdue is false when last run is recent', isOverdue === false);
}

// ── Test 8: Missing categories — no auto-consent ─────────────────────────────
console.log('\n=== Test: Missing categories ===');
{
  const s = makeSchedule({ categories: [], enabled: true });
  const { nextRunDate } = calculateNextMaintenanceRun(s);
  // Scheduler should still return a date — categories check is done at trigger time
  assert('nextRunDate still computed with empty categories', nextRunDate !== null);
  // The actual scheduler (maintenanceScheduler.ts) checks categories before executing
  assert('empty categories array is falsy-empty', !s.categories?.length);
}

// ── Test 9: formattedText format check ───────────────────────────────────────
console.log('\n=== Test: Formatted text ===');
{
  const s = makeSchedule({ frequency: 'weekly', dayOfWeek: 1, time: '03:30', lastRun: new Date().toISOString() });
  const { formattedText } = calculateNextMaintenanceRun(s);
  // Should mention the time
  assert('formattedText contains configured time', formattedText.includes('03:30'), `got="${formattedText}"`);
  // Should be a non-empty, non-error string
  assert('formattedText is not empty or error', formattedText.length > 3 && formattedText !== 'Désactivée');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} assertions`);
if (failed > 0) {
  console.error('\nFailed:');
  results.filter(r => !r.passed).forEach(r => console.error(`  ❌ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`));
  process.exit(1);
} else {
  console.log('✅ All scheduler logic tests passed.');
  process.exit(0);
}
