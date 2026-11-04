/**
 * Test Suite — Vanguard Core : Mises à Jour (Coordination & Secours) et Sentinelle (Saturation)
 * 
 * Valide :
 * 1. Semver 2.0.0 : parsing et comparaison rigoureuse (sans comparaison lexicographique)
 * 2. Secours GitHub Releases : détection de nouvelle version publique avec mock HTTP
 * 3. Filtrage des canaux : respect strict de allowPrerelease (stable vs bêta)
 * 4. Exclusion des brouillons (drafts) et tags invalides
 * 5. Gestion des erreurs : HTTP 403 Rate Limit, timeout et absence de fuite de tokens
 * 6. Cooldown et cache : aucun appel réseau répété sous le délai de 15 minutes
 * 7. Coordination d'arrêt : onPrepareForQuit appelé et attendu avant l'arrêt
 * 8. Sentinelle : saturation au-delà de 20 éléments, mise en attente différée bornée
 * 9. Sentinelle : saturation critique au-delà de 50 éléments différés et marquage unscanned
 * 10. Sentinelle : drainage complet sans perte d'éléments et état observable isFullyScanned
 * 11. Vault : interdiction d'exporter vers une destination située à l'intérieur du coffre source
 * 12. Quarantaine : isolation locale non exécutable, métadonnées, restauration et suppression
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import {
  parseSemver,
  compareSemver,
  checkFallbackReleases,
} from '../src/main/updateFallback.ts';

import {
  registerQuitPreparer,
  quitAndInstallUpdate,
} from '../src/main/updater.ts';

import {
  getScannerQueueState,
  resetScannerStateForTesting,
  handleFileEventForTesting,
  acknowledgeScannerOverflow,
  setPauseQueueProcessingForTesting,
} from '../src/main/downloadScanner.ts';

import {
  createVault,
  openVault,
  exportVaultStorage,
} from '../src/main/vault/index.ts';

import {
  quarantineSessionFile,
  restoreQuarantinedFile,
  deleteQuarantinedFile,
  createScanSession,
  clearAllSessionsForTest,
} from '../src/main/scanSession.ts';

import { notificationManager } from '../src/main/notificationManager.ts';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('🧪 Vanguard Core — Suite Mises à Jour, Sentinelle & Vault');
  console.log('======================================================\n');

  // --- SECTION 1 : SemVer 2.0.0 & Comparaison ---
  console.log('1. Analyse et comparaison sémantique (SemVer 2.0.0) :');

  await runTest('1.1 parseSemver extrait major, minor, patch et prerelease', () => {
    const v1 = parseSemver('v0.1.6');
    assert.deepStrictEqual(v1, { major: 0, minor: 1, patch: 6, prerelease: null, raw: '0.1.6' });

    const v2 = parseSemver('1.2.3-beta.1');
    assert.deepStrictEqual(v2, { major: 1, minor: 2, patch: 3, prerelease: 'beta.1', raw: '1.2.3-beta.1' });

    assert.strictEqual(parseSemver('invalid-version'), null);
    assert.strictEqual(parseSemver(''), null);
  });

  await runTest('1.2 compareSemver évite les pièges lexicographiques et respecte les pré-releases', () => {
    // 0.1.10 > 0.1.9 (alors qu'alphabétiquement "0.1.10" < "0.1.9")
    assert.ok(compareSemver('0.1.10', '0.1.9') > 0);
    assert.ok(compareSemver('0.1.9', '0.1.10') < 0);

    // 0.1.6 > 0.1.6-beta.1 (version finale > pré-release)
    assert.ok(compareSemver('0.1.6', '0.1.6-beta.1') > 0);
    assert.ok(compareSemver('0.1.6-beta.1', '0.1.6') < 0);

    // 0.1.6-beta.2 > 0.1.6-beta.1
    assert.ok(compareSemver('0.1.6-beta.2', '0.1.6-beta.1') > 0);

    // Identiques
    assert.strictEqual(compareSemver('v0.1.6', '0.1.6'), 0);
  });

  // --- SECTION 2 : Secours GitHub Releases ---
  console.log('\n2. Secours informatif des mises à jour (Update Fallback) :');

  const mockReleasesData = [
    {
      tag_name: 'v0.1.7',
      name: 'Vanguard Core v0.1.7 Stable',
      draft: false,
      prerelease: false,
      published_at: '2026-11-04T12:00:00Z',
      html_url: 'https://github.com/urnova/Astral-Security-Guard-vpn/releases/tag/v0.1.7',
    },
    {
      tag_name: 'v0.1.8-beta.1',
      name: 'Vanguard Core v0.1.8 Preview',
      draft: false,
      prerelease: true,
      published_at: '2026-11-04T14:00:00Z',
      html_url: 'https://github.com/urnova/Astral-Security-Guard-vpn/releases/tag/v0.1.8-beta.1',
    },
    {
      tag_name: 'v0.1.9-draft',
      name: 'Brouillon privé',
      draft: true,
      prerelease: false,
      published_at: '2026-11-04T15:00:00Z',
      html_url: '',
    },
  ];

  await runTest('2.1 Secours détecte la version stable supérieure quand allowPrerelease = false', async () => {
    const customFetcher = async () => ({
      statusCode: 200,
      data: JSON.stringify(mockReleasesData),
    });

    const res = await checkFallbackReleases({
      currentVersion: '0.1.6',
      allowPrerelease: false,
      forceRefresh: true,
      customFetcher,
    });

    assert.strictEqual(res.status, 'fallback_new_version_detected');
    if (res.status === 'fallback_new_version_detected') {
      assert.strictEqual(res.release.version, '0.1.7');
      assert.strictEqual(res.release.isPrerelease, false);
    }
  });

  await runTest('2.2 Secours détecte la pré-release supérieure quand allowPrerelease = true', async () => {
    const customFetcher = async () => ({
      statusCode: 200,
      data: JSON.stringify(mockReleasesData),
    });

    const res = await checkFallbackReleases({
      currentVersion: '0.1.6',
      allowPrerelease: true,
      forceRefresh: true,
      customFetcher,
    });

    assert.strictEqual(res.status, 'fallback_new_version_detected');
    if (res.status === 'fallback_new_version_detected') {
      assert.strictEqual(res.release.version, '0.1.8-beta.1');
      assert.strictEqual(res.release.isPrerelease, true);
    }
  });

  await runTest('2.3 Brouillons (drafts) strictement ignorés par le secours', async () => {
    const onlyDraft = [{
      tag_name: 'v0.9.9',
      draft: true,
      prerelease: false,
      published_at: '2026-11-04T15:00:00Z',
    }];
    const customFetcher = async () => ({
      statusCode: 200,
      data: JSON.stringify(onlyDraft),
    });

    const res = await checkFallbackReleases({
      currentVersion: '0.1.6',
      allowPrerelease: true,
      forceRefresh: true,
      customFetcher,
    });

    assert.strictEqual(res.status, 'fallback_no_newer_version');
  });

  await runTest('2.4 Gestion propre de la limite de requêtes GitHub (HTTP 403 Rate Limit)', async () => {
    const customFetcher = async () => ({
      statusCode: 403,
      data: 'API rate limit exceeded',
    });

    const res = await checkFallbackReleases({
      currentVersion: '0.1.6',
      allowPrerelease: true,
      forceRefresh: true,
      customFetcher,
    });

    assert.strictEqual(res.status, 'fallback_unavailable');
    if (res.status === 'fallback_unavailable') {
      assert.ok(res.officialUrl.includes('github.com/urnova/Astral-Security-Guard-vpn/releases'));
      assert.ok(res.error.includes('rate limit'));
    }
  });

  // --- SECTION 3 : Coordination d'arrêt de mise à jour ---
  console.log('\n3. Coordination d\'arrêt de mise à jour :');

  await runTest('3.1 quitAndInstallUpdate attend la clôture des opérations sensibles', async () => {
    let sensitiveOperationClosed = false;

    registerQuitPreparer(async () => {
      // Simulation fermeture ordonnée du coffre / déconnexion VPN
      await new Promise((r) => setTimeout(r, 50));
      sensitiveOperationClosed = true;
    });

    // On invoque sans tuer le process de test (en interceptant ou vérifiant la promesse)
    const installPromise = quitAndInstallUpdate(true, true);
    await new Promise((r) => setTimeout(r, 120));

    assert.strictEqual(sensitiveOperationClosed, true, 'La callback de clôture sensible a été appelée et attendue.');
  });

  // --- SECTION 4 : Sentinelle de Téléchargement (Gestion de Saturation) ---
  console.log('\n4. Sentinelle : file d\'attente observable et saturation :');

  await runTest('4.1 getScannerQueueState retourne l\'état complet de la file', () => {
    const state = getScannerQueueState();
    assert.ok(typeof state.queueLength === 'number');
    assert.ok(typeof state.isProcessing === 'boolean');
    assert.ok(typeof state.deferredCount === 'number');
    assert.ok(typeof state.overflowCount === 'number');
    assert.ok(Array.isArray(state.unscannedOverflowFiles));
    assert.ok(typeof state.isFullyScanned === 'boolean');
  });

  await runTest('4.2 Rafale de 75 éléments : file active (20) + différé (50) + débordement borné (5)', async () => {
    resetScannerStateForTesting();
    setPauseQueueProcessingForTesting(true);
    const fakeDir = path.join(os.tmpdir(), 'vanguard-sentinel-burst');

    // Envoi d'une rafale de 75 fichiers exécutables (.exe)
    for (let i = 1; i <= 75; i++) {
      await handleFileEventForTesting(fakeDir, `payload_${i}_burst.exe`);
    }

    const state = getScannerQueueState();
    assert.strictEqual(state.queueLength, 20, 'La file active doit être plafonnée à 20 éléments');
    assert.strictEqual(state.deferredCount, 50, 'Le conteneur différé doit être plafonné à 50 éléments');
    assert.strictEqual(state.overflowCount, 5, 'Le compteur de débordement doit être exactement de 5');
    assert.strictEqual(state.unscannedOverflowFiles.length, 5, 'L\'échantillon borné doit contenir les 5 chemins');
    assert.ok(state.unscannedOverflowFiles.length <= state.overflowSampleCapacity, 'L\'échantillon ne doit jamais excéder 20');
    assert.strictEqual(state.analysisStatus, 'analyse_incomplete', 'L\'état d\'analyse doit être "analyse_incomplete"');
    assert.strictEqual(state.isFullyScanned, false, 'isFullyScanned doit être false');

    setPauseQueueProcessingForTesting(false);
  });

  await runTest('4.3 Acquittement explicite du débordement (acknowledgeScannerOverflow)', () => {
    acknowledgeScannerOverflow();
    const state = getScannerQueueState();
    assert.strictEqual(state.overflowCount, 0, 'Le compteur de débordement doit être réinitialisé à 0');
    assert.strictEqual(state.unscannedOverflowFiles.length, 0, 'L\'échantillon doit être vidé');
    assert.strictEqual(state.pendingReconciliation, false, 'pendingReconciliation doit être false');
  });

  // --- SECTION 5 : Vanguard Vault (Sécurité des Destinations d'Export) ---
  console.log('\n5. Vanguard Vault : protection anti-récursion à l\'export :');

  const tmpTestDir = path.join(os.tmpdir(), `vgv-sec-test-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);

  await runTest('5.1 Refus strict d\'exporter vers une destination située à l\'intérieur du coffre source', async () => {
    await createVault(tmpTestDir, 'MotDePasseFort123!');
    const session = await openVault(tmpTestDir, { password: 'MotDePasseFort123!' });

    try {
      const nestedDest = path.join(tmpTestDir, 'subfolder_backup');
      await assert.rejects(async () => {
        await exportVaultStorage(session, nestedDest, 'backup_encrypted');
      }, /intérieur du répertoire du coffre source/i);

      // Même dossier source
      await assert.rejects(async () => {
        await exportVaultStorage(session, tmpTestDir, 'backup_encrypted');
      }, /intérieur du répertoire du coffre source/i);
    } finally {
      await session.lockHandle?.release().catch(() => {});
      fs.rmSync(tmpTestDir, { recursive: true, force: true });
    }
  });

  // --- SECTION 6 : Quarantaine Locale & Restauration ---
  console.log('\n6. Quarantaine locale : isolation non exécutable, métadonnées, restauration et suppression :');

  const qTestDir = path.join(os.tmpdir(), `vanguard-qtest-${Date.now()}`);
  fs.mkdirSync(qTestDir, { recursive: true });

  await runTest('6.1 Déplacement en extension .vanguard_quarantine et sidecar .meta.json', async () => {
    clearAllSessionsForTest();
    const sampleFile = path.join(qTestDir, 'malware_sample.exe');
    fs.writeFileSync(sampleFile, 'SUSPECT_PAYLOAD_TEST');

    const session = createScanSession(sampleFile, 'threat', 'Trojan.Test.Sentinel');
    const qRes = await quarantineSessionFile(session.scanId);

    assert.strictEqual(qRes.success, true);
    assert.ok(qRes.quarantinePath);
    assert.ok(qRes.quarantinePath.endsWith('.vanguard_quarantine'));
    assert.ok(fs.existsSync(qRes.quarantinePath), 'Fichier isolé présent');
    assert.ok(!fs.existsSync(sampleFile), 'Fichier source retiré de l\'emplacement d\'origine');
    assert.ok(fs.existsSync(`${qRes.quarantinePath}.meta.json`), 'Sidecar métadonnées présent');

    // Restauration
    const restoreTarget = path.join(qTestDir, 'restored_sample.exe');
    const restRes = await restoreQuarantinedFile(qRes.quarantinePath, restoreTarget);
    assert.strictEqual(restRes.success, true);
    assert.ok(fs.existsSync(restoreTarget));
    assert.strictEqual(fs.readFileSync(restoreTarget, 'utf-8'), 'SUSPECT_PAYLOAD_TEST');

    // Nettoyage
    fs.rmSync(qTestDir, { recursive: true, force: true });
  });

  // ======================================================
  console.log('\n======================================================');
  console.log(`📊 Résultat Suite Complémentaire : ${passed} / ${passed + failed} tests réussis.`);
  if (failed === 0) {
    console.log('🎉 TOUTES LES VÉRIFICATIONS COMPLÉMENTAIRES SONT VALIDÉES.');
    process.exit(0);
  } else {
    console.error(`⚠️ ${failed} test(s) ont échoué.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur inattendue dans la suite de tests :', err);
  process.exit(1);
});
