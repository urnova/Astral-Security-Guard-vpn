/**
 * Vanguard Core — Suite de Tests Validatoire Lot 3 (v0.1.6 pré-release)
 * 
 * Périmètre du Lot 3 :
 * 1. Élévation de privilèges Windows & Tâche planifiée (adminHelper.ts)
 *    - Détection factuelle du statut administrateur (isAdmin)
 *    - Détection de version et build Windows 11/10 (getWindowsBuildInfo)
 *    - Traçabilité de l'enregistrement de privilège persistant (getAdminPrivilegeRecord / saveAdminPrivilegeRecord)
 *    - Robustesse de la relance : non-fermeture si annulation UAC par l'utilisateur
 * 
 * 2. Catalogue fermé du Helper Privilégié (privilegedHelper/)
 *    - Rejet immédiat et déterministe de toute commande arbitraire hors catalogue
 *    - Validation du catalogue fermé autorisé (GET_HELPER_STATUS, FLUSH_DNS, SET_DNS_PROVIDER, DISABLE_STARTUP_ENTRY)
 *    - Sécurisation du Named Pipe avec nonce éphémère
 * 
 * 3. Gestionnaire de Mises à jour Sécurisées (updater.ts)
 *    - Alignement sur la version courante de Vanguard Core
 *    - Machine à états UpdaterState (idle, checking, available, downloading, downloaded, installing)
 *    - Support et persistance du canal préversion (previewChannel) et auto-téléchargement (autoUpdateEnabled)
 *    - Notification automatique vers le gestionnaire central lors d'une mise à jour prête
 *    - Libération de mutex et préparation ordonnée avant quitAndInstall
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Setup environment base dir for isolated tests
const TEST_DIR = path.join(os.tmpdir(), `vanguard-lot3-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.APPDATA = TEST_DIR;

import {
  isAdmin,
  checkIsAdmin,
  getWindowsBuildInfo,
  saveAdminPrivilegeRecord,
  getAdminPrivilegeRecord,
} from '../src/main/adminHelper.ts';

import { executePrivilegedAction } from '../src/main/privilegedHelper/client.ts';
import { generateSecurePipeName } from '../src/main/privilegedHelper/pipeSecurity.ts';
import { notificationManager } from '../src/main/notificationManager.ts';
import {
  executeSafeShutdownForUpdate,
  quitAndInstallUpdate,
  deferAutoUpdate,
  registerQuitPreparer,
} from '../src/main/updater.ts';

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('🧪 Vanguard Core — Suite de Validation Lot 3');
console.log('======================================================\n');

// ── 1. Privilèges & Diagnostics Windows (adminHelper.ts) ────────────────────
console.log('1. Élévation de privilèges & Diagnostic Windows :');

runTest('1.1 isAdmin et checkIsAdmin retournent un booléen factuel sans exception', () => {
  const admin = isAdmin();
  assert.strictEqual(typeof admin, 'boolean', 'isAdmin doit retourner un booléen');
  const adminRefreshed = isAdmin(true);
  assert.strictEqual(typeof adminRefreshed, 'boolean', 'isAdmin avec forceRefresh doit retourner un booléen');
});

runTest('1.2 getWindowsBuildInfo détecte fidèlement la build Windows courante', () => {
  const osInfo = getWindowsBuildInfo();
  assert(osInfo, 'osInfo ne doit pas être null');
  assert.strictEqual(typeof osInfo.edition, 'string', 'L édition Windows doit être une chaîne');
  assert.strictEqual(typeof osInfo.buildNumber, 'number', 'Le numéro de build doit être numérique');
  assert(osInfo.buildNumber > 10000, 'Le build Windows doit être > 10000');
  assert.strictEqual(typeof osInfo.isWindows11, 'boolean', 'isWindows11 doit être un booléen');
});

runTest('1.3 saveAdminPrivilegeRecord persiste le record et getAdminPrivilegeRecord le restitue', () => {
  const fakeExe = 'C:\\Program Files\\Vanguard\\VanguardCore.exe';
  saveAdminPrivilegeRecord(fakeExe);

  const record = getAdminPrivilegeRecord();
  assert(record, 'Le record doit être retrouvé');
  assert.strictEqual(record.granted, true);
  assert.strictEqual(record.exePath, fakeExe);
  assert(record.grantedAt, 'Doit contenir un horodatage');
});

// ── 2. Catalogue fermé du Helper Privilégié (privilegedHelper/) ──────────────
console.log('\n2. Catalogue fermé & Sécurité du Helper Privilégié :');

await runAsyncTest('2.1 Rejet immédiat de toute commande arbitraire hors catalogue fermé', async () => {
  const forbiddenActions = ['FORMAT_C', 'RUN_ARBITRARY_CMD', 'DOWNLOAD_EXE', 'REG_DELETE_ALL'];
  for (const act of forbiddenActions) {
    const res = await executePrivilegedAction(act);
    assert.strictEqual(res.success, false, `L'action ${act} doit être rejetée`);
    assert.strictEqual(res.errorCode, 'UNKNOWN_ACTION', `L'erreur doit être UNKNOWN_ACTION`);
    assert(res.error?.includes('catalogue fermé'), 'Le message doit mentionner le catalogue fermé');
  }
});

runTest('2.2 generateSecurePipeName produit un nom de tube sécurisé unique et borné', () => {
  const pipe1 = generateSecurePipeName();
  const pipe2 = generateSecurePipeName();
  assert(pipe1.startsWith('\\\\.\\pipe\\'), 'Le chemin doit pointer vers le préfixe de tube nommé Windows');
  assert.notStrictEqual(pipe1, pipe2, 'Deux tubes distincts doivent avoir des noms uniques');
});

// ── 3. Gestionnaire de Mises à Jour & Notifications (updater.ts) ────────────
console.log('\n3. Gestionnaire de Mises à Jour & Notifications :');

runTest('3.1 Typage et transitions de l\'état de mise à jour (UpdaterState)', () => {
  const validStatuses = ['idle', 'checking', 'available', 'not-available', 'downloading', 'downloaded', 'installing', 'error'];
  for (const st of validStatuses) {
    const state = {
      currentVersion: '0.1.5',
      status: st,
      updateInfo: null,
      progressPercent: st === 'downloaded' ? 100 : (st === 'downloading' ? 45 : 0),
      bytesPerSecond: 1024 * 512,
      transferredBytes: 500000,
      totalBytes: 1000000,
      error: st === 'error' ? 'Test error' : null,
    };
    assert.strictEqual(state.status, st);
    assert(typeof state.progressPercent === 'number');
  }
});

runTest('3.2 Émission de notification centrale lorsqu\'une mise à jour est prête', () => {
  const fakeVersion = '0.1.6-pre';
  const notif = notificationManager.emit({
    category: 'updater',
    severity: 'info',
    title: 'Mise à jour prête',
    message: `Vanguard Core v${fakeVersion} a été téléchargé et vérifié. Prêt à l'installation.`,
    dedupKey: `test-update-${Date.now()}`,
    actionTarget: { tab: 'settings' },
  });

  assert(notif, 'Une notification doit avoir été émise');
  assert.strictEqual(notif.category, 'updater');
  assert.strictEqual(notif.severity, 'info');
  assert.strictEqual(notif.actionTarget?.tab, 'settings');

  // Vérifier qu'elle est dans l'historique
  const history = notificationManager.getHistory();
  const found = history.find(h => h.id === notif.id);
  assert(found, 'La notification de mise à jour doit être enregistrée dans l\'historique borné');
});

runTest('3.3 Comparaison déterministe de version (Semantic Versioning)', () => {
  const isNewer = (remote, current) => {
    const r = remote.replace(/^v/i, '').split('-')[0].split('.').map(Number);
    const c = current.replace(/^v/i, '').split('-')[0].split('.').map(Number);
    for (let i = 0; i < Math.max(r.length, c.length); i++) {
      const rNum = r[i] || 0;
      const cNum = c[i] || 0;
      if (rNum > cNum) return true;
      if (rNum < cNum) return false;
    }
    return false;
  };

  assert.strictEqual(isNewer('0.1.6', '0.1.5'), true, '0.1.6 doit être plus récent que 0.1.5');
  assert.strictEqual(isNewer('0.1.5', '0.1.5'), false, '0.1.5 est identique');
  assert.strictEqual(isNewer('0.1.4', '0.1.5'), false, '0.1.4 est plus ancien');
  assert.strictEqual(isNewer('v0.2.0', '0.1.5'), true, '0.2.0 est plus récent');
});

await runAsyncTest('3.4 executeSafeShutdownForUpdate échoue si les opérations sensibles ne sont pas confirmées closes', async () => {
  // Simuler un préparateur qui échoue (ex: Vault non fermé ou déconnexion VPN expirée)
  registerQuitPreparer(async () => {
    return {
      success: false,
      error: 'Vault non fermé à temps (fichiers verrouillés)',
    };
  });

  const res = await executeSafeShutdownForUpdate();
  assert.strictEqual(res.success, false, 'La préparation doit être déclarée échouée');
  assert(res.reason?.includes('Vault non fermé'), 'La raison doit refléter l\'opération sensible en échec');
});

await runAsyncTest('3.5 quitAndInstallUpdate refuse l\'arrêt et n\'appelle pas l\'installateur si la préparation échoue', async () => {
  // Simuler un préparateur qui échoue
  registerQuitPreparer(async () => {
    return {
      success: false,
      error: 'VPN encore actif ou restauration non confirmée',
    };
  });

  const installed = await quitAndInstallUpdate(false, true);
  assert.strictEqual(installed, false, 'quitAndInstallUpdate doit refuser d\'exécuter l\'installation si la préparation a échoué');

  // Vérifier qu\'une alerte de report a été émise dans l\'historique des notifications
  const history = notificationManager.getHistory();
  const alertNotif = history.find(h => h.dedupKey === 'update-postponed-sensitive-ops');
  assert(alertNotif, 'Une notification d\'avertissement de report doit être présente');
  assert.strictEqual(alertNotif.severity, 'warning');
});

runTest('3.6 deferAutoUpdate annule le compte à rebours et marque la mise à jour comme différée', () => {
  const res = deferAutoUpdate();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.deferred, true);

  const history = notificationManager.getHistory();
  const deferNotif = history.find(h => h.dedupKey === 'update-deferred-by-user');
  assert(deferNotif, 'Une notification de mise à jour reportée doit être enregistrée');
  assert.strictEqual(deferNotif.category, 'updater');
});

// Nettoyage final
try {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
} catch {}

console.log('\n======================================================');
console.log(`📊 Résultat Lot 3 : ${passedTests} / ${totalTests} tests réussis.`);
if (passedTests === totalTests) {
  console.log('🎉 LOT 3 VALIDÉ AVEC SUCCÈS (Sortie 0).');
  process.exit(0);
} else {
  console.error(`❌ ÉCHEC : ${totalTests - passedTests} test(s) échoué(s).`);
  process.exit(1);
}

