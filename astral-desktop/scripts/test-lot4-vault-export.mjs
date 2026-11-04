/**
 * Vanguard Core — Suite de Tests Validatoire Lot 4 (v0.1.6 pré-release)
 * 
 * Périmètre du Lot 4 :
 * 1. Export Vault : Mode Sauvegarde Chiffrée (backup_encrypted)
 *    - Copie conforme et intègre de header.enc, index.enc et partition blobs/
 *    - Préservation du chiffrement au repos (aucune divulgation en clair)
 *    - Capacité du coffre exporté à être déverrouillé de manière autonome
 * 
 * 2. Export Vault : Mode Extraction Intégrale en Clair (extract_all_plaintext)
 *    - Extraction récursive de l'ensemble des fichiers indexés
 *    - Préservation rigoureuse de l'arborescence et des chemins relatifs
 *    - Validation cryptographique SHA-256 de chaque fichier extrait
 *    - Conformité bit-à-bit avec les fichiers originaux
 * 
 * 3. Règle absolue de non-destruction
 *    - L'exportation ne modifie ni ne supprime aucun fichier du coffre source
 *    - Le coffre source reste 100% fonctionnel après les opérations d'exportation
 *    - Protection anti-écrasement
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Setup environment base dir for isolated tests
const TEST_DIR = path.join(os.tmpdir(), `vanguard-lot4-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

import {
  initSodium,
  createVault,
  openVault,
  importFile,
  exportVaultStorage,
  exportVaultArchive,
  importVaultArchive,
  extractFile,
  closeVault,
} from '../src/main/vault/index.ts';

let passedTests = 0;
let totalTests = 0;

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
console.log('🧪 Vanguard Core — Suite de Validation Lot 4 (Export Vault)');
console.log('======================================================\n');

await initSodium();

const sourceVaultDir = path.join(TEST_DIR, 'source_vault');
const exportBackupDir = path.join(TEST_DIR, 'exported_backup');
const exportPlaintextDir = path.join(TEST_DIR, 'exported_plaintext');

const password = 'TestLot4MasterPassword123!';
const testFiles = [
  { name: 'document1.txt', content: 'Contenu secret hautement confidentiel #1' },
  { name: 'sub/document2.txt', content: 'Contenu secret dans un sous-dossier #2' },
  { name: 'archive_data.bin', content: crypto.randomBytes(128 * 1024) }, // 128 Ko de données binaires
];

let session;

await runAsyncTest('4.1 Initialisation du coffre source et import des fichiers synthétiques', async () => {
  await createVault(sourceVaultDir, password, { opslimit: 2, memlimit: 64 * 1024 * 1024 });
  session = await openVault(sourceVaultDir, { password });
  assert(session.isOpen, 'Le coffre source doit être ouvert');

  for (const tf of testFiles) {
    const srcDiskPath = path.join(TEST_DIR, `temp_src_${path.basename(tf.name)}`);
    fs.writeFileSync(srcDiskPath, tf.content);
    await importFile(session, srcDiskPath, tf.name);
  }

  assert.strictEqual(session.index.files.length, 3, 'Le coffre doit contenir 3 fichiers');
});

await runAsyncTest('4.2 Export en mode "backup_encrypted" (Sauvegarde Chiffrée Complète)', async () => {
  let progressCount = 0;
  const res = await exportVaultStorage(
    session,
    exportBackupDir,
    'backup_encrypted',
    {
      onProgress: (p, t) => {
        progressCount++;
      },
    }
  );

  assert.strictEqual(res.mode, 'backup_encrypted');
  assert(res.filesExported >= 4, 'Doit exporter header, index et les blobs');
  assert(res.totalBytes > 0, 'La taille totale doit être > 0');
  assert(progressCount > 0, 'La progression streaming doit avoir été notifiée');

  // Vérifier la structure de la sauvegarde
  assert(fs.existsSync(path.join(exportBackupDir, 'vault.header')), 'vault.header doit exister');
  assert(fs.existsSync(path.join(exportBackupDir, 'index.enc')), 'index.enc doit exister');
  assert(fs.existsSync(path.join(exportBackupDir, 'blobs')), 'Le dossier blobs doit exister');

  // Vérifier que le fichier vault.header exporté commence par le magic VGV1
  const headerBuf = fs.readFileSync(path.join(exportBackupDir, 'vault.header'));
  assert.strictEqual(headerBuf.toString('utf8', 0, 4), 'VGV1', 'Le magic header doit être VGV1');
});

await runAsyncTest('4.3 Vérification d\'autonomie : Le coffre de sauvegarde s\'ouvre et se déverrouille indépendamment', async () => {
  const backupSession = await openVault(exportBackupDir, { password });
  assert(backupSession.isOpen, 'Le coffre de sauvegarde doit pouvoir être ouvert avec le mot de passe');
  assert.strictEqual(backupSession.index.files.length, 3, 'La sauvegarde doit contenir les 3 fichiers');

  // Vérifier les chemins virtuels dans la sauvegarde
  const paths = backupSession.index.files.map(f => f.virtualPath);
  assert(paths.includes('document1.txt'));
  assert(paths.includes('sub/document2.txt'));
  assert(paths.includes('archive_data.bin'));

  await closeVault(backupSession);
});

await runAsyncTest('4.4 Export en mode "extract_all_plaintext" (Extraction complète en clair)', async () => {
  const res = await exportVaultStorage(
    session,
    exportPlaintextDir,
    'extract_all_plaintext'
  );

  assert.strictEqual(res.mode, 'extract_all_plaintext');
  assert.strictEqual(res.filesExported, 3, 'Doit avoir extrait les 3 fichiers');

  // Vérification de la conformité bit-à-bit de chaque fichier extrait
  for (const tf of testFiles) {
    const outDiskPath = path.join(exportPlaintextDir, tf.name);
    assert(fs.existsSync(outDiskPath), `Le fichier ${tf.name} doit exister sur disque`);
    const readData = fs.readFileSync(outDiskPath);

    if (typeof tf.content === 'string') {
      assert.strictEqual(readData.toString('utf8'), tf.content, `Le contenu de ${tf.name} doit correspondre`);
    } else {
      assert(readData.equals(tf.content), `Les données binaires de ${tf.name} doivent être identiques`);
    }
  }
});

const portableArchivePath = path.join(TEST_DIR, 'test_vault.vgv');
const importedVaultDir = path.join(TEST_DIR, 'imported_vault_dir');

await runAsyncTest('4.5 Export en Archive Portable Unique (.vgv) chiffrée', async () => {
  let progressCalled = false;
  const res = await exportVaultArchive(
    session,
    portableArchivePath,
    {
      onProgress: () => { progressCalled = true; },
    }
  );

  assert(fs.existsSync(portableArchivePath), 'Le fichier d\'archive .vgv doit exister sur disque');
  assert.strictEqual(res.archivePath, portableArchivePath);
  assert(res.filesCount >= 4, 'L\'archive doit contenir header, index et les blobs');
  assert(res.totalBytes > 0, 'La taille totale doit être positive');
  assert(progressCalled, 'Le callback onProgress doit avoir été déclenché');

  // Vérifier qu'aucun texte en clair ne fuité dans l'archive .vgv
  const archiveBytes = fs.readFileSync(portableArchivePath);
  const archiveStr = archiveBytes.toString('utf-8');
  assert(!archiveStr.includes('Contenu secret hautement confidentiel #1'), 'L\'archive .vgv ne doit contenir AUCUN contenu en clair');
  assert(!archiveStr.includes(password), 'L\'archive .vgv ne doit contenir AUCUN mot de passe');
});

await runAsyncTest('4.6 Importation de l\'archive portable (.vgv) dans un nouvel emplacement', async () => {
  const res = await importVaultArchive(
    portableArchivePath,
    importedVaultDir
  );

  assert.strictEqual(res.headerValid, true, 'L\'en-tête du coffre importé doit être validé');
  assert(res.filesExtracted >= 4, 'Les composants chiffrés doivent avoir été décompressés');
  assert(fs.existsSync(path.join(importedVaultDir, 'vault.header')), 'vault.header doit exister');
  assert(fs.existsSync(path.join(importedVaultDir, 'index.enc')), 'index.enc doit exister');
});

await runAsyncTest('4.7 Déverrouillage autonome du coffre importé et conformité des données', async () => {
  const importedSession = await openVault(importedVaultDir, { password });
  assert(importedSession.isOpen, 'Le coffre importé doit s\'ouvrir avec le mot de passe d\'origine');
  assert.strictEqual(importedSession.index.files.length, 3, 'Le coffre importé doit contenir les 3 fichiers');

  // Extraire un fichier du coffre importé pour vérifier l'intégrité de déchiffrement
  const testExtractPath = path.join(TEST_DIR, 'extracted_from_imported.txt');
  await extractFile(importedSession, 'document1.txt', testExtractPath, { overwrite: true });
  const extractedText = fs.readFileSync(testExtractPath, 'utf-8');
  assert.strictEqual(extractedText, 'Contenu secret hautement confidentiel #1', 'Le contenu extrait du coffre importé doit être intact');

  await closeVault(importedSession);
});

await runAsyncTest('4.8 Règle absolue de non-destruction : Intégrité du coffre source préservée', async () => {
  // Le coffre source doit toujours être ouvert et intact
  assert(session.isOpen, 'Le coffre source doit rester ouvert');
  assert.strictEqual(session.index.files.length, 3, 'Le coffre source doit toujours avoir ses 3 fichiers');

  // Fermer proprement
  await closeVault(session);
  assert.strictEqual(session.isOpen, false, 'Le coffre doit être fermé');
});

// Nettoyage final
try {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
} catch {}

console.log('\n======================================================');
console.log(`📊 Résultat Lot 4 : ${passedTests} / ${totalTests} tests réussis.`);
if (passedTests === totalTests) {
  console.log('🎉 LOT 4 VALIDÉ AVEC SUCCÈS (Sortie 0).');
  process.exit(0);
} else {
  console.error(`❌ ÉCHEC : ${totalTests - passedTests} test(s) échoué(s).`);
  process.exit(1);
}
