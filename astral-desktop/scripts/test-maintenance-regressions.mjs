import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));
const filename = path.resolve(here, '../src/main/maintenanceManager.ts');
const source = fs.readFileSync(filename, 'utf8');
const built = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  reportDiagnostics: true,
});
assert.equal((built.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const events = [];
const psCalls = [];
let psResult = { success: true, data: { bytes: 0, count: 0 } };
const profile = { maintenanceSchedule: { enabled: false } };
const stubs = {
  './logger': { logger: { warn() {}, info() {}, error() {} } },
  './psHelper': { runPowerShell: async script => { psCalls.push(String(script)); return psResult; } },
  './profile': { loadPreferences: () => profile, savePreferences: p => Object.assign(profile, p) },
  './notificationManager': { notificationManager: { emit: event => { events.push(event); return event; } } },
  electron: {},
};
let forbiddenRootTouched = false;
const fsProxy = new Proxy(fs, { get(target, key) {
  if (key === 'lstatSync') return (value, ...args) => {
    if (path.resolve(value) === path.parse(path.resolve(value)).root) {
      forbiddenRootTouched = true; throw new Error('Root filesystem access forbidden in tests');
    }
    return target.lstatSync(value, ...args);
  };
  return Reflect.get(target, key);
} });
stubs.fs = fsProxy;
const mod = { exports: {} };
vm.runInNewContext(built.outputText, {
  module: mod, exports: mod.exports,
  require: name => Object.hasOwn(stubs, name) ? stubs[name] : require(name),
  process, console, setTimeout, clearTimeout,
}, { filename });
const engine = mod.exports;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vanguard-maintenance-test-'));
const oldTemp = process.env.TEMP;
let passed = 0;
async function check(name, action) {
  await action(); passed++; console.log(`OK ${name}`);
}
try {
  await check('known file deletion is counted exactly', () => {
    const dir = path.join(temp, 'counted'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'sample.tmp'), Buffer.alloc(1234));
    const result = engine.cleanSafeDir(dir);
    assert.equal(result.deletedBytes, 1234); assert.equal(result.deletedCount, 1);
    assert.equal(fs.existsSync(dir), true);
  });
  await check('filesystem root is refused', () => {
    const result = engine.cleanSafeDir(path.parse(temp).root);
    assert.ok(result.errors.length > 0); assert.equal(result.deletedCount, 0);
    assert.equal(forbiddenRootTouched, false);
  });
  await check('relative cleanup target is refused', () => {
    assert.ok(engine.cleanSafeDir('relative-target').errors.length > 0);
  });
  await check('non-directory is refused', () => {
    const file = path.join(temp, 'not-a-folder'); fs.writeFileSync(file, 'keep');
    assert.ok(engine.cleanSafeDir(file).errors.length > 0);
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
  });
  await check('unknown and empty selections are rejected without activity', async () => {
    await assert.rejects(engine.executeStorageCleanup(['not-a-category']));
    await assert.rejects(engine.executeStorageCleanup([]));
    assert.equal(events.length, 0); assert.equal(engine.isMaintenanceBusy(), false);
  });
  await check('real completion is emitted through maintenance history channel', async () => {
    const dir = path.join(temp, 'operation'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'sample.tmp'), Buffer.alloc(4096)); process.env.TEMP = dir;
    const report = await engine.executeStorageCleanup(['userTemp', 'userTemp']);
    assert.equal(report.success, true); assert.equal(report.deletedBytes, 4096);
    assert.equal(report.deletedFilesCount, 1); assert.equal(events.length, 1);
    assert.equal(events[0].category, 'maintenance');
    assert.equal(events[0].actionTarget.tab, 'performance');
    assert.equal(engine.isMaintenanceBusy(), false);
  });
  await check('failed recycle operation is not reported as success', async () => {
    psResult = { success: false };
    const report = await engine.executeStorageCleanup(['recycleBin']);
    assert.equal(report.success, false); assert.equal(report.partial, true);
    assert.equal(report.freedDisplay, '0 Mo'); assert.equal(report.categoriesCleaned.length, 0);
    assert.equal(events.at(-1).severity, 'warning'); assert.equal(engine.isMaintenanceBusy(), false);
  });
  await check('notification failure does not erase a completed cleanup result', async () => {
    stubs['./notificationManager'].notificationManager.emit = () => { throw new Error('unavailable'); };
    const report = await engine.executeStorageCleanup(['userTemp']);
    assert.equal(report.success, true); assert.equal(engine.isMaintenanceBusy(), false);
  });
  await check('missing directory has zero measured size', () => {
    const result = engine.getSafeDirSize(path.join(temp, 'missing'));
    assert.equal(result.bytes, 0); assert.equal(result.fileCount, 0);
  });
  await check('drive letter parsing is strict and has no default', () => {
    assert.equal(engine.parseDriveLetter('c:'), 'C');
    assert.equal(engine.parseDriveLetter('D'), 'D');
    for (const bad of [undefined, null, '', ' ', 'CD', 'C:\\', '1', 'C:\\Windows', 42, {}]) {
      assert.equal(engine.parseDriveLetter(bad), null, `rejects ${JSON.stringify(bad)}`);
    }
  });
  await check('drive operations refuse a missing letter instead of defaulting to C:', async () => {
    const before = events.length;
    const scan = await engine.scanDriveJunk(undefined);
    assert.equal(scan.success, false); assert.equal(scan.categories.length, 0);
    const result = await engine.cleanDriveJunk('');
    assert.equal(result.success, false); assert.equal(result.deletedFilesCount, 0);
    assert.equal(events.length, before); assert.equal(engine.isMaintenanceBusy(), false);
  });
  await check('missing system root leaves system targets unresolved and untouched', async () => {
    const saved = { SystemRoot: process.env.SystemRoot, windir: process.env.windir };
    delete process.env.SystemRoot; delete process.env.windir;
    try {
      const targets = engine.resolveCleanupTargets();
      assert.equal(targets.winTemp, null); assert.equal(targets.winLogs, null);
      const report = await engine.executeStorageCleanup(['winTemp']);
      assert.equal(report.success, false); assert.equal(report.deletedFilesCount, 0);
      assert.equal(report.categoriesCleaned.length, 0);
    } finally {
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  await check('drive cleanup only removes known caches and never sibling game or temp-like folders', async () => {
    stubs['./notificationManager'].notificationManager.emit = event => { events.push(event); return event; };
    psResult = { success: true }; psCalls.length = 0;
    const root = path.join(temp, 'drive-scope'); fs.mkdirSync(root);
    const userTemp = path.join(root, 'usertemp'); const local = path.join(root, 'local');
    const dx = path.join(local, 'D3DSCache'); const dumps = path.join(local, 'CrashDumps');
    const games = path.join(root, 'SteamLibrary', 'steamapps', 'downloading'); const lookalike = path.join(root, 'Temp');
    for (const dir of [userTemp, dx, dumps, games, lookalike]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(userTemp, 'a.tmp'), Buffer.alloc(100));
    fs.writeFileSync(path.join(dx, 'shader.bin'), Buffer.alloc(200));
    fs.writeFileSync(path.join(dumps, 'crash.dmp'), Buffer.alloc(300));
    fs.writeFileSync(path.join(games, 'game.part'), Buffer.alloc(400));
    fs.writeFileSync(path.join(lookalike, 'abandoned-looking.dat'), Buffer.alloc(500));
    const saved = { TEMP: process.env.TEMP, LOCALAPPDATA: process.env.LOCALAPPDATA };
    process.env.TEMP = userTemp; process.env.LOCALAPPDATA = local;
    try {
      const letter = path.parse(root).root[0];
      const scan = await engine.scanDriveJunk(letter);
      assert.equal(scan.success, true);
      assert.deepEqual([...scan.categories.map(c => c.id)].sort(), ['crashDumps', 'dxCache', 'recycleBin', 'userTemp']);
      const result = await engine.cleanDriveJunk(`${letter}:`);
      assert.equal(result.success, true); assert.equal(result.deletedFilesCount, 3); assert.equal(result.deletedBytes, 600);
      assert.equal(fs.existsSync(path.join(games, 'game.part')), true, 'game download preserved');
      assert.equal(fs.existsSync(path.join(lookalike, 'abandoned-looking.dat')), true, 'arbitrary Temp folder preserved');
      assert.equal(events.at(-1).category, 'maintenance');
      assert.equal(engine.isMaintenanceBusy(), false);
      assert.equal(psCalls.some(s => s.includes('Clear-RecycleBin')), false, 'Recycle Bin untouched without explicit consent');
      assert.equal(result.categoriesCleaned.includes('recycleBin'), false);
      const withBin = await engine.cleanDriveJunk(letter, { emptyRecycleBin: true });
      assert.equal(psCalls.filter(s => s.includes(`Clear-RecycleBin -DriveLetter '${letter}'`)).length, 1);
      assert.equal(withBin.categoriesCleaned.includes('recycleBin'), true);
    } finally {
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  await check('a second drive cleanup while one is running is rejected', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    psResult = undefined;
    const savedRun = stubs['./psHelper'].runPowerShell;
    stubs['./psHelper'].runPowerShell = async () => { await gate; return { success: true }; };
    const letter = path.parse(temp).root[0];
    const saved = { TEMP: process.env.TEMP, LOCALAPPDATA: process.env.LOCALAPPDATA };
    process.env.TEMP = path.join(temp, 'empty-a'); process.env.LOCALAPPDATA = path.join(temp, 'empty-b');
    try {
      const first = engine.cleanDriveJunk(letter, { emptyRecycleBin: true });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(engine.isMaintenanceBusy(), true);
      assert.equal((await engine.cleanDriveJunk(letter)).success, false);
      await assert.rejects(engine.executeStorageCleanup(['userTemp']));
      release(); assert.equal((await first).success, true);
      assert.equal(engine.isMaintenanceBusy(), false);
    } finally {
      stubs['./psHelper'].runPowerShell = savedRun;
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  await check('links and junctions are never followed or emptied', () => {
    const outside = path.join(temp, 'outside-target'); fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'precious.txt'), 'keep');
    const dir = path.join(temp, 'with-junction'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'junk.tmp'), Buffer.alloc(10));
    fs.symlinkSync(outside, path.join(dir, 'link'), 'junction');
    const scan = engine.getSafeDirSize(dir);
    assert.equal(scan.fileCount, 1, 'size scan does not traverse the junction');
    const result = engine.cleanSafeDir(dir);
    assert.equal(result.deletedCount, 1);
    assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep');
  });
  console.log(`${passed} maintenance regression checks passed`);
} finally {
  if (oldTemp === undefined) delete process.env.TEMP; else process.env.TEMP = oldTemp;
  fs.rmSync(temp, { recursive: true, force: true });
}
