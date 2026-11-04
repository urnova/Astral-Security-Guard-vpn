// Inline reproduction of calculateNextMaintenanceRun — no Electron dependency
function calculateNextMaintenanceRun(schedule) {
  if (!schedule || !schedule.enabled) return { nextRunDate: null, formattedText: 'Désactivée', isOverdue: false };
  const [targetH, targetM] = (schedule.time || '04:00').split(':').map(n => parseInt(n, 10) || 0);
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetH, targetM, 0, 0);
  const freq = schedule.frequency || 'weekly';
  if (freq === 'daily') { if (next <= now) next.setDate(next.getDate() + 1); }
  else if (freq === 'weekly') {
    const targetDay = typeof schedule.dayOfWeek === 'number' ? schedule.dayOfWeek : 0;
    const currentDay = next.getDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0 && next <= now) daysToAdd = 7;
    next.setDate(next.getDate() + daysToAdd);
  } else if (freq === 'monthly') {
    const targetDom = Math.max(1, Math.min(31, schedule.dayOfMonth || 1));
    next.setDate(targetDom);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }
  let isOverdue = false;
  if (schedule.lastRun) {
    const lastRunTime = new Date(schedule.lastRun).getTime();
    const periodMs = freq === 'daily' ? 86400000 : freq === 'weekly' ? 7 * 86400000 : 30 * 86400000;
    if (now.getTime() - lastRunTime > periodMs * 1.2) isOverdue = true;
  }
  const timeStr = `${String(targetH).padStart(2,'0')}:${String(targetM).padStart(2,'0')}`;
  return { nextRunDate: next, formattedText: `${next.toLocaleDateString()} à ${timeStr}`, isOverdue };
}

let passed = 0; let failed = 0;
function assert(name, condition, detail) {
  if (condition) { passed++; console.log('  OK ' + name); }
  else { failed++; console.error('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// T1: Disabled
let r = calculateNextMaintenanceRun({ enabled: false, frequency: 'weekly', time: '04:00' });
assert('disabled => null date', r.nextRunDate === null);
assert('disabled => Désactivée', r.formattedText === 'Désactivée');
assert('disabled => not overdue', r.isOverdue === false);

// T2: No schedule
r = calculateNextMaintenanceRun(undefined);
assert('no schedule => null date', r.nextRunDate === null);

// T3: Daily
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'daily', time: '04:00', lastRun: new Date().toISOString() });
assert('daily => future date', r.nextRunDate !== null && r.nextRunDate.getTime() > Date.now());
assert('daily => not overdue (just ran)', r.isOverdue === false);

// T4: Weekly Sunday
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'weekly', dayOfWeek: 0, time: '04:00', lastRun: new Date().toISOString() });
assert('weekly => future Sunday (day 0)', r.nextRunDate !== null && r.nextRunDate.getDay() === 0, 'day=' + r.nextRunDate?.getDay());

// T5: Monthly day 1
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'monthly', dayOfMonth: 1, time: '04:00', lastRun: new Date().toISOString() });
assert('monthly => day 1', r.nextRunDate !== null && r.nextRunDate.getDate() === 1, 'date=' + r.nextRunDate?.getDate());

// T6: Overdue (daily, last run 2 days ago)
const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'daily', time: '04:00', lastRun: twoDaysAgo });
assert('overdue => isOverdue=true', r.isOverdue === true);

// T7: Not overdue (daily, last run 6h ago)
const sixHAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'daily', time: '04:00', lastRun: sixHAgo });
assert('recent run => not overdue', r.isOverdue === false);

// T8: Formatted text includes time
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'weekly', dayOfWeek: 1, time: '03:30', lastRun: new Date().toISOString() });
assert('formatted text contains 03:30', r.formattedText.includes('03:30'), 'got="' + r.formattedText + '"');

// T9: Empty categories does not crash calculateNextMaintenanceRun
r = calculateNextMaintenanceRun({ enabled: true, frequency: 'daily', time: '04:00', categories: [], lastRun: new Date().toISOString() });
assert('empty categories => no crash, date computed', r.nextRunDate !== null);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
else { console.log('ALL SCHEDULER TESTS PASSED'); process.exit(0); }
