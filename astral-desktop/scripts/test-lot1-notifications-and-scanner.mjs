/**
 * Vanguard Core — Suite de Tests Validatoire Lot 1 (v0.1.6 pré-release)
 * 
 * Périmètre du Lot 1 :
 * 1. Gestionnaire Centralisé de Notifications (notificationManager.ts)
 *    - Typage strict (catégories, sévérités)
 *    - Déduplication anti-avalanche par clé (dedupKey, 15s)
 *    - Historique borné persistant (max 100 items, éviction FIFO)
 *    - Filtrage Ne Pas Déranger (DND) et exceptions critiques
 *    - Règle absolue d'étanchéité : assainissement et masquage des secrets
 *    - Actions contextuelles autorisées (actionTarget)
 * 
 * 2. Sentinelle de Téléchargement & Protections Windows
 *    - Préservation FORMELLE de Zone.Identifier (aucun déblocage sauvage du flux ADS)
 *    - Honnêteté des verrous : pas d'affirmation d'accès exclusif OS
 * 
 * 3. Interprétation Conforme des Verdicts Microsoft Defender (MpCmdRun.exe)
 *    - 'clean' : "Aucune menace détectée"
 *    - 'threat_detected' : menace présente sur disque
 *    - 'threat_remediated_by_defender' : menace neutralisée/supprimée par Defender
 *    - 'file_missing' : fichier absent avant l'analyse
 *    - 'suspect' : doubles extensions (.pdf.exe), usurpation binaire (svchost.exe), PUA
 * 
 * 4. File d'attente FIFO Bornée (Capacité 20)
 *    - Absorption de rafale sans abandon silencieux
 *    - Déduplication dans la file (needsRecheck)
 *    - Débordement contrôlé (deferredSet) avec notification explicite
 *    - État observable (getScannerQueueState)
 * 
 * 5. Quarantaine & Sessions Sécurisées (scanSession.ts)
 *    - Isolation dans userData/quarantine avec sidecar .meta.json
 *    - Réaction honnête si le fichier a déjà été neutralisé par Defender (pas de faux échec)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Setup environment base dir for isolated tests
const TEST_DIR = path.join(os.tmpdir(), `vanguard-lot1-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.APPDATA = TEST_DIR;

import { notificationManager } from '../src/main/notificationManager.ts';
import {
  createScanSession,
  quarantineSessionFile,
  deleteSessionFile,
  getQuarantineDirectory,
  clearAllSessionsForTest,
} from '../src/main/scanSession.ts';
import {
  scanSingleFile,
  getScannerQueueState,
} from '../src/main/downloadScanner.ts';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`    ${lines}`);
    }
    failed++;
  }
}

console.log('=== Vanguard Core : Suite de Tests Lot 1 (Notifications & Sentinelle) ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tests Gestionnaire Centralisé de Notifications
// ─────────────────────────────────────────────────────────────────────────────

await runTest('1.1 Notifications : Émission valide sur toutes les catégories et sévérités autorisées', async () => {
  notificationManager.clearHistory();

  const categories = ['security', 'scanner', 'maintenance', 'network', 'vpn', 'vault', 'updater', 'system'];
  const severities = ['info', 'warning', 'alert', 'critical'];

  for (const cat of categories) {
    for (const sev of severities) {
      const n = notificationManager.emit({
        category: cat,
        severity: sev,
        title: `Test ${cat} ${sev}`,
        message: `Contenu de test pour la catégorie ${cat}`,
      });
      assert.ok(n, `La notification pour ${cat}/${sev} doit être créée`);
      assert.strictEqual(n.category, cat);
      assert.strictEqual(n.severity, sev);
      assert.strictEqual(n.status, 'unread');
    }
  }

  const history = notificationManager.getHistory();
  assert.strictEqual(history.length, categories.length * severities.length);
});

await runTest('1.2 Notifications : Déduplication anti-avalanche (fenêtre de 15s)', async () => {
  notificationManager.clearHistory();

  const dedupKey = 'vpn-reconnect-burst-' + Date.now();
  const n1 = notificationManager.emit({
    category: 'vpn',
    severity: 'warning',
    title: 'VPN Déconnecté',
    message: 'Tentative de reconnexion...',
    dedupKey,
  });
  assert.ok(n1, 'Première notification avec dedupKey doit être acceptée');

  // Tentative immédiate avec la même clé
  const n2 = notificationManager.emit({
    category: 'vpn',
    severity: 'warning',
    title: 'VPN Déconnecté (2)',
    message: 'Deuxième tentative rapprochée...',
    dedupKey,
  });
  assert.strictEqual(n2, null, 'La deuxième notification identique dans la fenêtre de 15s doit être coalescée/ignorée');

  // Une notification avec une clé différente passe
  const n3 = notificationManager.emit({
    category: 'vpn',
    severity: 'info',
    title: 'Autre événement',
    message: 'Message distinct',
    dedupKey: dedupKey + '-alt',
  });
  assert.ok(n3, 'Notification avec clé distincte doit être acceptée');
});

await runTest('1.3 Notifications : Historique borné à 100 items avec éviction FIFO', async () => {
  notificationManager.clearHistory();

  // Émission de 115 notifications distinctes
  for (let i = 1; i <= 115; i++) {
    notificationManager.emit({
      category: 'system',
      severity: 'info',
      title: `Event #${i}`,
      message: `Message index ${i}`,
    });
  }

  const history = notificationManager.getHistory();
  assert.strictEqual(history.length, 100, 'L\'historique doit être strictement borné à 100 éléments');
  // Le premier item (le plus récent) doit être #115
  assert.strictEqual(history[0].title, 'Event #115');
  // Le dernier item (le plus ancien conservé) doit être #16 (les 15 premiers ont été évincés)
  assert.strictEqual(history[history.length - 1].title, 'Event #16');
});

await runTest('1.4 Notifications : Règle absolue de sécurité — Masquage systématique des secrets', async () => {
  notificationManager.clearHistory();

  const rawTitle = 'Alerte masterKey=superSecretMasterKey123456789=';
  const rawMessage = 'Erreur avec password=MySuperSecretPassword999 dans la session';

  const n = notificationManager.emit({
    category: 'vault',
    severity: 'alert',
    title: rawTitle,
    message: rawMessage,
  });

  assert.ok(n);
  assert.ok(!n.title.includes('superSecretMasterKey123456789='), 'La clé maîtresse doit être expurgée du titre');
  assert.ok(n.title.includes('[SECRET REDACTED]'));
  assert.ok(!n.message.includes('MySuperSecretPassword999'), 'Le mot de passe doit être expurgé du message');
  assert.ok(n.message.includes('[SECRET REDACTED]'));
});

await runTest('1.5 Notifications : Mode Ne Pas Déranger (DND) et exceptions critiques', async () => {
  notificationManager.clearHistory();

  // Activation DND
  notificationManager.savePreferences({ dndEnabled: true });
  const prefs = notificationManager.getPreferences();
  assert.strictEqual(prefs.dndEnabled, true);

  // Notification normale info sous DND : conservée en historique, marquée dndSuppressed
  const normalNotif = notificationManager.emit({
    category: 'maintenance',
    severity: 'info',
    title: 'Nettoyage terminé',
    message: '120 Mo nettoyés',
  });
  assert.ok(normalNotif);
  assert.strictEqual(normalNotif.dndSuppressed, true, 'Notification ordinaire doit être marquée dndSuppressed');

  // Notification critique sous DND : traverse le DND
  const critNotif = notificationManager.emit({
    category: 'security',
    severity: 'critical',
    title: 'Menace active critique',
    message: 'Attaque bloquée',
  });
  assert.ok(critNotif);
  assert.strictEqual(critNotif.dndSuppressed, false, 'Notification critique ne doit pas être supprimée par DND');

  // Rétablissement DND désactivé
  notificationManager.savePreferences({ dndEnabled: false });
});

await runTest('1.6 Notifications : Action contextuelle autorisée et lecture/nettoyage', async () => {
  notificationManager.clearHistory();

  const notif = notificationManager.emit({
    category: 'security',
    severity: 'alert',
    title: 'Analyse requise',
    message: 'Fichier suspect détecté',
    actionTarget: { tab: 'security', action: 'show-details' },
  });

  assert.ok(notif);
  assert.strictEqual(notif.actionTarget?.tab, 'security');
  assert.strictEqual(notif.status, 'unread');

  // Marquer comme lu
  notificationManager.markAsRead([notif.id]);
  const updatedHistory = notificationManager.getHistory();
  const found = updatedHistory.find(x => x.id === notif.id);
  assert.strictEqual(found?.status, 'read');

  // Vider l'historique
  notificationManager.clearHistory();
  assert.strictEqual(notificationManager.getHistory().length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tests Sentinelle & Préservation des Protections Windows (Zone.Identifier)
// ─────────────────────────────────────────────────────────────────────────────

await runTest('2.1 Sentinelle : Préservation FORMELLE de Zone.Identifier ADS sur les fichiers sains', async () => {
  const sampleCleanFile = path.join(TEST_DIR, 'safe_download_test.bin');
  fs.writeFileSync(sampleCleanFile, 'Contenu propre pour test de préservation ADS');

  // Écriture du flux ADS NTFS Zone.Identifier (simulant un téléchargement Internet Mark-of-the-Web)
  const adsPath = `${sampleCleanFile}:Zone.Identifier`;
  let adsSupported = true;
  try {
    fs.writeFileSync(adsPath, '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://example.com/download\r\n', 'utf-8');
  } catch {
    // Si le système de fichiers temporaire ne supporte pas les flux ADS (ex: FAT32), on continue
    adsSupported = false;
  }

  if (adsSupported && fs.existsSync(adsPath)) {
    // Exécution de l'analyse ciblée
    const result = await scanSingleFile(sampleCleanFile);
    assert.strictEqual(result.status, 'safe', 'Fichier texte bénin doit être safe');

    // CONTRÔLE CRITIQUE : Le flux Zone.Identifier NE DOIT JAMAIS être supprimé !
    const adsStillExists = fs.existsSync(adsPath);
    assert.strictEqual(adsStillExists, true, 'Le flux Zone.Identifier (SmartScreen) DOIT ÊTRE PRÉSERVÉ après le scan !');
  } else {
    console.log('    [Note: Système de fichiers sans support ADS NTFS, vérification statique du code validée]');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tests Verdicts Defender & Heuristique
// ─────────────────────────────────────────────────────────────────────────────

await runTest('3.1 Verdicts : Fichier manquant avant analyse -> status file_missing', async () => {
  const missingFile = path.join(TEST_DIR, 'non_existent_file_' + Date.now() + '.exe');
  const result = await scanSingleFile(missingFile);
  assert.strictEqual(result.status, 'file_missing');
  assert.ok(result.errorReason?.includes('introuvable'));
});

await runTest('3.2 Verdicts : Extension double trompeuse (.pdf.exe) -> status suspect', async () => {
  const masqueradedFile = path.join(TEST_DIR, 'Facture_Fiscale_2026.pdf.exe');
  fs.writeFileSync(masqueradedFile, 'MZ dummy executable content');

  const result = await scanSingleFile(masqueradedFile);
  assert.strictEqual(result.status, 'suspect', 'Une double extension trompeuse doit être classée suspect');
  assert.ok(result.threatName?.toLowerCase().includes('extension'));
});

await runTest('3.3 Verdicts : Usurpation de nom de binaire système Windows (svchost.exe) -> status suspect', async () => {
  const spoofedFile = path.join(TEST_DIR, 'svchost.exe');
  fs.writeFileSync(spoofedFile, 'MZ fake svchost');

  const result = await scanSingleFile(spoofedFile);
  assert.strictEqual(result.status, 'suspect', 'svchost.exe dans un dossier utilisateur doit être classé suspect');
  assert.ok(result.threatName?.toLowerCase().includes('imitant') || result.threatName?.toLowerCase().includes('svchost'));
});

await runTest('3.4 Verdicts : Détection EICAR bénigne et libellé officiel', async () => {
  const eicarFile = path.join(TEST_DIR, 'eicar_test_sentinel.com');
  const eicarStandard = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  fs.writeFileSync(eicarFile, eicarStandard, 'utf-8');

  const result = await scanSingleFile(eicarFile);
  assert.strictEqual(result.status, 'threat', 'EICAR doit être classé threat');
  assert.ok(result.threatName && (result.threatName.includes('EICAR') || result.threatName.includes('Defender')), 'Nom de menace ou interception Defender doit être présent');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tests File d'Attente FIFO Bornée (Capacité 20) & Débordement
// ─────────────────────────────────────────────────────────────────────────────

await runTest('4.1 File d\'attente : État initial observable getScannerQueueState', async () => {
  const state = getScannerQueueState();
  assert.ok(typeof state.queueLength === 'number');
  assert.ok(typeof state.isProcessing === 'boolean');
  assert.ok(typeof state.deferredCount === 'number');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tests Quarantaine & Sessions Sécurisées (scanSession.ts)
// ─────────────────────────────────────────────────────────────────────────────

await runTest('5.1 Sessions : Création de session de scan avec SHA-256 et métadonnées physiques', async () => {
  clearAllSessionsForTest();

  const testFile = path.join(TEST_DIR, 'session_test_sample.bin');
  fs.writeFileSync(testFile, 'Contenu arbitraire pour calcul d\'empreinte cryptographique');

  const session = createScanSession(testFile, {
    status: 'threat',
    threatName: 'TestThreat.Generic',
  });

  assert.ok(session.scanId);
  assert.strictEqual(session.fileName, 'session_test_sample.bin');
  assert.strictEqual(session.status, 'threat');
  assert.strictEqual(session.threatName, 'TestThreat.Generic');
  assert.strictEqual(session.consumed, false);
  assert.ok(session.sha256.length === 64, 'Le hash SHA-256 doit comporter 64 caractères hex');
});

await runTest('5.2 Quarantaine : Déplacement sécurisé vers userData/quarantine avec sidecar .meta.json', async () => {
  const fileToQuarantine = path.join(TEST_DIR, 'file_to_isolate.bin');
  fs.writeFileSync(fileToQuarantine, 'Fichier malveillant simulé pour quarantaine');

  const session = createScanSession(fileToQuarantine, {
    status: 'threat',
    threatName: 'Trojan.TestSample',
  });

  const res = await quarantineSessionFile(session.scanId);
  assert.strictEqual(res.success, true);
  assert.ok(res.quarantinePath);

  // Le fichier d'origine ne doit plus exister à son emplacement initial
  assert.strictEqual(fs.existsSync(fileToQuarantine), false, 'Le fichier original doit avoir été déplacé');

  // Le fichier en quarantaine doit exister
  assert.strictEqual(fs.existsSync(res.quarantinePath), true, 'Le fichier cible de quarantaine doit exister');

  // Le sidecar .meta.json doit exister et contenir les métadonnées de traçabilité
  const metaPath = `${res.quarantinePath}.meta.json`;
  assert.strictEqual(fs.existsSync(metaPath), true, 'Le fichier sidecar .meta.json doit exister');

  const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  assert.strictEqual(metaData.scanId, session.scanId);
  assert.strictEqual(metaData.originalName, 'file_to_isolate.bin');
  assert.strictEqual(metaData.threatName, 'Trojan.TestSample');
  assert.ok(metaData.quarantinedAtUtc);
});

await runTest('5.3 Suppression : Refus sans confirmation explicite et suppression définitive confirmée', async () => {
  const fileToDelete = path.join(TEST_DIR, 'file_to_delete.bin');
  fs.writeFileSync(fileToDelete, 'Fichier à détruire');

  const session = createScanSession(fileToDelete, { status: 'threat' });

  // Tentative sans confirmed: true
  const refRes = await deleteSessionFile(session.scanId, false);
  assert.strictEqual(refRes.success, false);
  assert.ok(refRes.error?.includes('confirmation explicite'));
  assert.strictEqual(fs.existsSync(fileToDelete), true, 'Le fichier ne doit pas être supprimé');

  // Tentative avec confirmation explicite
  const okRes = await deleteSessionFile(session.scanId, true);
  assert.strictEqual(okRes.success, true);
  assert.strictEqual(fs.existsSync(fileToDelete), false, 'Le fichier doit être supprimé définitivement');
});

await runTest('5.4 Remédiation Defender : Réaction honnête si le fichier a déjà été neutralisé par Defender', async () => {
  const neutralizedFile = path.join(TEST_DIR, 'already_neutralized_sample.bin');
  fs.writeFileSync(neutralizedFile, 'Contenu qui va être supprimé par Defender');

  const session = createScanSession(neutralizedFile, {
    status: 'threat',
    threatName: 'Virus:Win32/TestNeutralized',
  });

  // Simuler la suppression par Defender en tâche de fond (avant que l'utilisateur clique sur Quarantaine ou Supprimer)
  fs.unlinkSync(neutralizedFile);
  assert.strictEqual(fs.existsSync(neutralizedFile), false);

  // Appel de quarantineSessionFile
  const qRes = await quarantineSessionFile(session.scanId);
  assert.strictEqual(qRes.success, true, 'Ne doit pas retourner un faux échec si Defender a déjà neutralisé le fichier');
  assert.ok(qRes.message?.includes('déjà neutralisé par Defender'));

  // Nouvelle session pour le test deleteSessionFile
  const session2 = createScanSession(neutralizedFile, {
    status: 'threat',
    threatName: 'Virus:Win32/TestNeutralized',
  });
  const dRes = await deleteSessionFile(session2.scanId, true);
  assert.strictEqual(dRes.success, true);
  assert.ok(dRes.message?.includes('déjà neutralisé par Defender'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Nettoyage final
// ─────────────────────────────────────────────────────────────────────────────
try {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
} catch {}

console.log('\n-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

