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
const filename = path.resolve(here, '../src/main/notificationManager.ts');
const built = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
});
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vanguard-notif-test-'));
const prefs = { notificationsEnabled: true, dndEnabled: false, soundEnabled: true, soundVolume: 50, notificationCategories: undefined };
const shown = [];
const sent = [];
const handlers = new Map();
const stubs = {
  electron: {
    app: { getPath: () => userData },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    BrowserWindow: class {},
  },
  './logger.ts': { logger: { warn() {}, info() {}, error() {}, debug() {} } },
  './profile.ts': { loadPreferences: () => ({ ...prefs }), savePreferences: p => Object.assign(prefs, p) },
  './desktopNotifier.ts': { showDesktopNotification: t => shown.push(t) },
  'node:fs': fs, 'node:path': path, 'node:crypto': require('node:crypto'),
};
const mod = { exports: {} };
vm.runInNewContext(built.outputText, {
  module: mod, exports: mod.exports, console, process, setTimeout,
  require: name => Object.hasOwn(stubs, name) ? stubs[name] : require(name),
}, { filename });
const { notificationManager: nm, setupNotificationIPC } = mod.exports;
nm.setMainWindow({ isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } });
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`OK ${name}`); };
const reset = () => { shown.length = 0; sent.length = 0; Object.assign(prefs, { notificationsEnabled: true, dndEnabled: false, soundEnabled: true, soundVolume: 50, notificationCategories: undefined }); };
const ev = (extra = {}) => ({ category: 'system', severity: 'info', title: 'T', message: 'M', ...extra });
try {
  check('a displayed notification goes to the desktop window once, with sound settings, and never to an in-app toast', () => {
    reset();
    const r = nm.emitDetailed(ev({ tone: 'success' }));
    assert.equal(r.delivery, 'shown'); assert.equal(shown.length, 1);
    assert.equal(shown[0].soundEnabled, true); assert.equal(shown[0].volume, 0.5); assert.equal(shown[0].tone, 'success');
    assert.equal(sent.some(s => s.channel === 'notification:toast'), false);
    assert.equal(nm.getHistory()[0].title, 'T');
  });
  check('do-not-disturb keeps history but shows nothing and explains why', () => {
    reset(); prefs.dndEnabled = true;
    const r = nm.emitDetailed(ev());
    assert.equal(r.delivery, 'history_only'); assert.equal(r.reason, 'do_not_disturb'); assert.equal(shown.length, 0);
  });
  check('disabled notifications and disabled categories are explained, not silently shown', () => {
    reset(); prefs.notificationsEnabled = false;
    assert.equal(nm.emitDetailed(ev()).reason, 'notifications_disabled');
    reset(); prefs.notificationCategories = { system: false };
    assert.equal(nm.emitDetailed(ev()).reason, 'category_disabled');
    assert.equal(shown.length, 0);
  });
  check('critical events bypass filters and still play one sound request', () => {
    reset(); prefs.dndEnabled = true; prefs.notificationsEnabled = false;
    const r = nm.emitDetailed(ev({ severity: 'critical' }));
    assert.equal(r.delivery, 'shown'); assert.equal(shown.length, 1);
    assert.equal(shown[0].soundEnabled, false, 'DND still mutes the sound');
  });
  check('sounds off or volume 0 never request audio', () => {
    reset(); prefs.soundEnabled = false; nm.emitDetailed(ev());
    assert.equal(shown[0].soundEnabled, false);
    reset(); prefs.soundVolume = 0; nm.emitDetailed(ev());
    assert.equal(shown[0].volume, 0);
  });
  check('visual:false writes history only (the scan window already presents it)', () => {
    reset();
    const before = nm.getHistory().length;
    const r = nm.emitDetailed(ev({ visual: false, title: 'scan-only' }));
    assert.equal(r.delivery, 'history_only'); assert.equal(shown.length, 0);
    assert.equal(nm.getHistory().length, before + 1);
  });
  check('repeated events with the same key are coalesced to one display', () => {
    reset();
    nm.emitDetailed(ev({ dedupKey: 'same' }));
    assert.equal(nm.emitDetailed(ev({ dedupKey: 'same' })).delivery, 'deduplicated');
    assert.equal(shown.length, 1);
  });
  check('secrets are redacted before history and display', () => {
    reset();
    nm.emitDetailed(ev({ message: 'password=hunter2 masterKey=AbCd123+/=' }));
    assert.ok(!/hunter2|AbCd123/.test(shown[0].message)); assert.ok(shown[0].message.includes('[SECRET REDACTED]'));
  });
  check('history is persisted atomically and reloaded', () => {
    const file = path.join(userData, 'AstralVanguard', 'notifications_history.json');
    assert.ok(fs.existsSync(file)); assert.equal(fs.existsSync(`${file}.tmp`), false);
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).length >= 1);
  });
  check('the settings test uses the real pipeline and reports the blocking setting', () => {
    reset(); setupNotificationIPC({ isDestroyed: () => false, webContents: { send() {} } });
    const test = handlers.get('notifications:test');
    const ok = test({}, 'warning'); assert.equal(ok.delivered, true); assert.equal(shown.length, 1); assert.equal(shown[0].severity, 'warning');
    assert.equal(test({}, 'success').delivered, true); assert.equal(shown.at(-1).tone, 'success');
    assert.equal(test({}, 'error').delivered, true); assert.equal(shown.at(-1).severity, 'alert');
    prefs.dndEnabled = true; shown.length = 0;
    const blocked = test({}, 'success'); assert.equal(blocked.delivered, false); assert.equal(blocked.reason, 'do_not_disturb'); assert.equal(shown.length, 0);
    assert.equal(prefs.dndEnabled, true, 'the test must not change preferences');
  });
  console.log(`${passed} notification pipeline checks passed`);
} finally {
  fs.rmSync(userData, { recursive: true, force: true });
}
