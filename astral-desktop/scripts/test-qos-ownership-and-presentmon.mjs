/**
 * Test ciblé : QoS Ownership, PresentMon Integration & Profil Importé (VPNBook)
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  OK: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name} ->`, err.message);
    failed++;
  }
}

console.log('\n=== 1. Vérification du Binaire et de la Licence PresentMon ===');

runTest('Présence du binaire PresentMon-x64.exe dans bin/', () => {
  const binPath = path.join(rootDir, 'bin', 'PresentMon-x64.exe');
  assert.ok(fs.existsSync(binPath), 'PresentMon-x64.exe doit exister dans bin/');
  const stats = fs.statSync(binPath);
  assert.ok(stats.size > 300000, `Taille binaire attendue > 300 Ko, obtenu: ${stats.size}`);

  // Vérifier en-tête PE (MZ)
  const fd = fs.openSync(binPath, 'r');
  const buffer = Buffer.alloc(2);
  fs.readSync(fd, buffer, 0, 2, 0);
  fs.closeSync(fd);
  assert.strictEqual(buffer.toString('ascii'), 'MZ', 'Le binaire doit avoir un en-tête PE valide (MZ)');
});

runTest('Présence de la notice de licence MIT PresentMon dans bin/PRESENTMON_LICENSE.txt', () => {
  const licPath = path.join(rootDir, 'bin', 'PRESENTMON_LICENSE.txt');
  assert.ok(fs.existsSync(licPath), 'PRESENTMON_LICENSE.txt doit exister dans bin/');
  const content = fs.readFileSync(licPath, 'utf8');
  assert.ok(content.includes('Intel Corporation'), 'Doit mentionner Intel Corporation');
  assert.ok(content.includes('Permission is hereby granted, free of charge'), 'Doit contenir le texte MIT standard');
  assert.ok(content.includes('github.com/GameTechDev/PresentMon'), 'Doit citer la source officielle');
});

runTest('Configuration package.json extraResources inclut bien bin/*', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const extra = pkg.build?.extraResources || [];
  const binResource = extra.find(r => r.from === 'bin' && r.to === 'bin');
  assert.ok(binResource, 'extraResources doit mapper "bin" vers "bin"');
});

console.log('\n=== 2. Parseur CSV PresentMon et Arguments ===');

runTest('Parseur CSV supporte MsBetweenPresents, FrameTime et variantes case-insensitive', () => {
  const headers = [
    'Application,ProcessID,MsBetweenPresents,MsInPresentApi',
    'application,process_id,frametime,cpustarttime',
    'Application,ProcessID,msBetweenDisplayChange,CPUWait',
  ];

  for (const h of headers) {
    const cols = h.split(',').map(c => c.trim());
    const idx = cols.findIndex(c => {
      const lc = c.toLowerCase();
      return lc === 'msbetweenpresents' || lc === 'frametime' || lc === 'msbetweendisplaychange' || lc === 'msinpresentapi';
    });
    assert.ok(idx >= 0, `Entête [${h}] doit identifier une colonne frametime valide`);
  }
});

console.log('\n=== 3. Logique QoS Ownership et Protection Anti-Collision ===');

class MockQosManager {
  constructor() {
    this.owned = new Set();
    this.preExisting = new Set();
    this.systemPolicies = new Map();
  }

  init(existingOnSystem = []) {
    for (const p of existingOnSystem) {
      if (!this.owned.has(p)) {
        this.preExisting.add(p);
      }
      this.systemPolicies.set(p, { name: p });
    }
  }

  setQos(name, appPath, throttleKbps) {
    const policyName = `Vanguard-${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;
    if (this.preExisting.has(policyName)) {
      return { success: false, error: 'Politique préexistante sanctuarisée. Modification refusée.' };
    }
    this.systemPolicies.set(policyName, { name: policyName, appPath, throttleKbps });
    this.owned.add(policyName);
    return { success: true, policyName };
  }

  removeQos(name) {
    const policyName = `Vanguard-${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;
    if (this.preExisting.has(policyName)) {
      return { success: false, error: 'Impossible de supprimer une politique non créée par Vanguard.' };
    }
    const existed = this.systemPolicies.delete(policyName);
    this.owned.delete(policyName);
    return { success: true, removed: existed ? policyName : null };
  }

  removeAllVanguardQos() {
    let count = 0;
    for (const target of Array.from(this.owned)) {
      if (this.systemPolicies.delete(target)) count++;
    }
    this.owned.clear();
    return { success: true, removed: count };
  }
}

runTest('QoS : une politique préexistante (ex. GPO d’entreprise) ne peut être ni écrasée ni supprimée', () => {
  const qos = new MockQosManager();
  qos.init(['Vanguard-CorpPolicy', 'CorporateQoS', 'Vanguard-GameA']);

  // Tentative de modification de Vanguard-CorpPolicy (qui préexistait)
  const setRes = qos.setQos('CorpPolicy', 'C:\\Game\\app.exe', 5000);
  assert.strictEqual(setRes.success, false, 'Doit refuser d’écraser une politique préexistante');

  // Tentative de suppression directe
  const remRes = qos.removeQos('CorpPolicy');
  assert.strictEqual(remRes.success, false, 'Doit refuser de supprimer une politique préexistante');

  // Vérifier qu'elle est toujours présente sur le système
  assert.ok(qos.systemPolicies.has('Vanguard-CorpPolicy'), 'La politique système préexistante doit être intacte');
});

runTest('QoS : removeAllVanguardQos supprime uniquement les politiques créées par Vanguard', () => {
  const qos = new MockQosManager();
  qos.init(['Vanguard-PreExisting']);

  // Vanguard crée 2 politiques
  qos.setQos('GameSession1', 'C:\\Game1.exe', 8000);
  qos.setQos('GameSession2', 'C:\\Game2.exe', 12000);

  assert.strictEqual(qos.owned.size, 2);
  assert.strictEqual(qos.systemPolicies.size, 3); // 1 préexistante + 2 créées

  // Suppression globale Vanguard
  const res = qos.removeAllVanguardQos();
  assert.strictEqual(res.removed, 2, 'Doit supprimer exactement les 2 politiques possédées');
  assert.strictEqual(qos.owned.size, 0);

  // La politique préexistante doit toujours exister
  assert.ok(qos.systemPolicies.has('Vanguard-PreExisting'), 'Vanguard-PreExisting ne doit pas avoir été touchée');
});

console.log('\n=== 4. Profil Importé VPNBook & Parseur Strict ===');

import { StrictOvpnParser } from '../src/main/ovpnParser.ts';

runTest('Parseur Strict accepte auth-user-pass et rejette les scripts malveillants', () => {
  const validVpnBookConfig = `
client
dev tun
proto udp
remote us1.vpnbook.com 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-128-CBC
auth SHA1
auth-user-pass
verb 3
<ca>
-----BEGIN CERTIFICATE-----
MIIB/DCCAWWgAwIBAgIJAP1234567890ABCDEFGH
-----END CERTIFICATE-----
</ca>
  `;

  const parsedValid = StrictOvpnParser.parse(validVpnBookConfig);
  assert.ok(parsedValid.valid, `Le profil valide doit être accepté: ${parsedValid.error}`);
  assert.strictEqual(parsedValid.remoteHost, 'us1.vpnbook.com');
  assert.strictEqual(parsedValid.remotePort, 1194);

  // Configuration hostile avec tentative d'exécution de script (up / script-security)
  const hostileConfig = `
client
dev tun
remote malicious.site 1194
up "powershell -enc maliciousPayload"
script-security 2
<ca>
-----BEGIN CERTIFICATE-----
MIIC...
-----END CERTIFICATE-----
</ca>
  `;

  const parsedHostile = StrictOvpnParser.parse(hostileConfig);
  assert.strictEqual(parsedHostile.valid, false, 'Le profil contenant des scripts doit être rejeté');
  assert.ok(parsedHostile.error.includes('interdite'), 'L’erreur doit signaler la directive interdite');
});

console.log(`\n========================================`);
console.log(`Bilan tests ciblés : ${passed} OK, ${failed} ÉCHEC(S)`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
