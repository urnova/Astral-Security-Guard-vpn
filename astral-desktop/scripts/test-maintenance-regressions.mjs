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
let psResult = { success: true, data: { bytes: 0, count: 0 } };
const profile = { maintenanceSchedule: { enabled: false } };
const stubs = {
  './logger': { logger: { warn() {}, info() {}, error() {} } },
  './psHelper': { runPowerShell: async () => psResult },
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
  console.log(`${passed} maintenance regression checks passed`);
} finally {
  if (oldTemp === undefined) delete process.env.TEMP; else process.env.TEMP = oldTemp;
  fs.rmSync(temp, { recursive: true, force: true });
}
