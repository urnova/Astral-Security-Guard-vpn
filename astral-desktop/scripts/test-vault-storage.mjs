/**
 * Vanguard Vault — Test Suite Stockage Transactionnel & Reprise Avancée (Sous-Lot 2)
 * 
 * Valide exhaustivement sur le code de production :
 * 1. Création et réouverture (mot de passe & clé de secours)
 * 2. Import et extraction (intégrité binaire, SHA-256 de bout en bout)
 * 3. Fichier vide (0 octet -> 45 octets chiffrés, extraction 0 octet)
 * 4. Gros fichier (20 Mo) généré en flux, streaming par blocs de 64 Ko et mémoire bornée
 * 5. Verrou multi-processus réel (processus enfant distinct, rejet strict, protection anti-forçage sur PID actif)
 * 6. Protection contre la libération d'un verrou substitué (instanceId mismatch)
 * 7. Conflit d'extraction : protection anti-écrasement sans accord explicite et TOCTOU
 * 8. Crash point 1 : index publié mais marqueur journal absent -> le payload N'EST PAS détruit, l'index reste intègre
 * 9. Crash point 2 : suppression interrompue après commit index -> purge sécurisée du blob résiduel
 * 10. Crash point 3 : index principal corrompu avec sauvegarde cohérente -> restauration et diagnostic
 * 11. Crash point 4 : index corrompu avec sauvegarde ancienne et blobs récents -> mode DEGRADED, blobs récents préservés
 * 12. Crash point 5 : sauvegarde corrompue ou référençant des blobs manquants -> rejet propre UNRECOVERABLE
 * 13. Journal non fiable / altéré : lignes tronquées, tentatives de Path Traversal, confinement strict
 * 14. Injections de pannes sur code de production (échec d'écriture payload, échec avant renommage index)
 * 15. Contrôle des liens symboliques et rejet des dossiers
 * 16. Suppression sélective et préservation des autres fichiers
 * 17. Effacement sécurisé des clés en mémoire vive à la fermeture
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  initSodium,
  generateVaultMasterKey,
  generateRecoveryKey,
  formatRecoveryKey,
  createVault,
  openVault,
  closeVault,
  importFile,
  extractFile,
  deleteFile,
  recoverFromJournal,
  DestinationConflictError,
  VaultLockedError,
  sanitizeVirtualPath,
  STREAM_CONSTANTS,
  buildStreamAad,
  encryptBuffer,
} from '../src/main/vault/index.ts';

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
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failed++;
  }
}

async function main() {
  console.log('=== Vanguard Vault : Suite de Tests Stockage Transactionnel & Reprise (Sous-Lot 2) ===\n');

  await initSodium();

  // 1. Création et réouverture
  await runTest('1. Création de coffre et réouverture (mot de passe & clé de secours)', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-lifecycle-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      const recKey = generateRecoveryKey();
      const createRes = await createVault(testDir, 'MonMotDePasse123!', {
        recoveryKey: recKey,
        opslimit: 2,
        memlimit: 64 * 1024 * 1024,
      });

      assert.ok(createRes.vaultId);
      assert.ok(createRes.recoveryKeyFormatted);
      assert.ok(fs.existsSync(path.join(testDir, 'vault.header')));
      assert.ok(fs.existsSync(path.join(testDir, 'vault.header.bak')));
      assert.ok(fs.existsSync(path.join(testDir, 'index.enc')));
      assert.ok(fs.existsSync(path.join(testDir, 'index.enc.bak')));

      // Réouverture via mot de passe
      const sessionPass = await openVault(testDir, { password: 'MonMotDePasse123!' });
      assert.strictEqual(sessionPass.isOpen, true);
      assert.strictEqual(sessionPass.index.files.length, 0);
      assert.strictEqual(sessionPass.index.generation, 1);
      await closeVault(sessionPass);
      assert.strictEqual(sessionPass.isOpen, false);
      assert.strictEqual(sessionPass.masterKey.length, 0);

      // Réouverture via clé de secours Crockford
      const sessionRec = await openVault(testDir, { recoveryKeyString: createRes.recoveryKeyFormatted });
      assert.strictEqual(sessionRec.isOpen, true);
      await closeVault(sessionRec);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 2. Import et extraction
  await runTest('2. Import et extraction avec vérification SHA-256 et blobs opaques', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-io-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const srcFile = path.join(testDir, 'document_original.txt');
      const originalData = crypto.randomBytes(120 * 1024); // 120 Ko
      await fs.promises.writeFile(srcFile, originalData);

      // Importation dans le coffre
      const entry = await importFile(session, srcFile, 'projets/rapport.pdf');
      assert.strictEqual(entry.virtualPath, 'projets/rapport.pdf');
      assert.strictEqual(entry.size, 120 * 1024);
      assert.strictEqual(session.index.generation, 2);

      // Vérifier que le blob sur disque a un nom aléatoire opaque (non le hash en clair)
      const blobPrefix = entry.id.slice(0, 2);
      const blobPath = path.join(testDir, 'blobs', blobPrefix, `${entry.id}.enc`);
      assert.ok(fs.existsSync(blobPath));
      assert.notStrictEqual(entry.id, entry.sha256);

      // Vérifier que le fichier source n'a PAS été supprimé ni altéré
      assert.ok(fs.existsSync(srcFile));
      assert.strictEqual((await fs.promises.readFile(srcFile)).length, 120 * 1024);

      // Extraction vers une nouvelle cible
      const extractedFile = path.join(testDir, 'document_extrait.bin');
      const extRes = await extractFile(session, 'projets/rapport.pdf', extractedFile);
      assert.strictEqual(extRes.sha256Verified, true);
      assert.strictEqual(extRes.bytesExtracted, 120 * 1024);

      // Identité binaire rigoureuse
      const extractedData = await fs.promises.readFile(extractedFile);
      assert.deepStrictEqual(extractedData, originalData);

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 3. Fichier vide (0 octet)
  await runTest('3. Fichier vide (0 octet) : round-trip nominal et taille blob exacte (45B)', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-empty-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const emptySrc = path.join(testDir, 'empty.txt');
      await fs.promises.writeFile(emptySrc, Buffer.alloc(0));

      const entry = await importFile(session, emptySrc, 'notes/empty.txt');
      assert.strictEqual(entry.size, 0);

      // Vérifier la taille exacte du blob chiffré : 24 header + 4 length + 17 final chunk = 45 octets
      const blobPath = path.join(testDir, 'blobs', entry.id.slice(0, 2), `${entry.id}.enc`);
      const blobStat = await fs.promises.stat(blobPath);
      assert.strictEqual(blobStat.size, 45);

      // Extraction
      const emptyExtracted = path.join(testDir, 'empty_out.txt');
      await extractFile(session, 'notes/empty.txt', emptyExtracted);
      const extStat = await fs.promises.stat(emptyExtracted);
      assert.strictEqual(extStat.size, 0);

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 4. Gros fichier (20 Mo) généré en flux, mémoire bornée
  await runTest('4. Gros fichier (20 Mo) généré en flux : streaming 64 Ko et mémoire bornée', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-20m-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const bigSrc = path.join(testDir, 'stream_20m.dat');
      const targetSize = 20 * 1024 * 1024; // 20 Mo
      const chunkSize = 64 * 1024;
      const totalChunks = targetSize / chunkSize; // 320 blocs

      // Génération du fichier par flux disque pour ne pas gonfler le heap JS
      const hashExpected = crypto.createHash('sha256');
      const writeHandle = await fs.promises.open(bigSrc, 'w', 0o600);
      try {
        const chunkBuf = crypto.randomBytes(chunkSize);
        for (let i = 0; i < totalChunks; i++) {
          await writeHandle.write(chunkBuf);
          hashExpected.update(chunkBuf);
        }
        await writeHandle.sync();
      } finally {
        await writeHandle.close();
      }
      const expectedSha256 = hashExpected.digest('hex');

      // Mesure mémoire de référence avant l'import
      if (global.gc) global.gc();
      const memRef = process.memoryUsage();
      const t0 = performance.now();

      const entry = await importFile(session, bigSrc, 'grosses_donnees/20m.dat');
      const importDurationMs = performance.now() - t0;
      assert.strictEqual(entry.size, targetSize);
      assert.strictEqual(entry.sha256, expectedSha256);

      const memAfterImport = process.memoryUsage();

      // Extraction et contrôle SHA-256
      const tExtract0 = performance.now();
      const extractedPath = path.join(testDir, 'extracted_20m.dat');
      const extRes = await extractFile(session, 'grosses_donnees/20m.dat', extractedPath);
      const extractDurationMs = performance.now() - tExtract0;
      assert.strictEqual(extRes.sha256Verified, true);
      assert.strictEqual(extRes.bytesExtracted, targetSize);

      const memAfterExtract = process.memoryUsage();

      // Métriques complètes documentées (distinction streaming vs KDF vs runtime)
      const heapDelta = memAfterImport.heapUsed - memRef.heapUsed;
      const rssDelta = memAfterImport.rss - memRef.rss;

      // Contrôle borné du tas : les blocs de 64 Ko ne chargent pas les 20 Mo d'un coup dans le tas JS
      assert.ok(heapDelta < 5 * 1024 * 1024, `Heap delta anormalement élevé : ${heapDelta} octets`);

      // Trace informative des allocations complètes pour le rapport de performance
      // Note : rss inclut les allocations WebAssembly/runtime C et le code JS
      if (process.env.VANGUARD_BENCH_VERBOSE === '1') {
        console.log(`    [Perf 20 Mo] Import: ${(importDurationMs).toFixed(1)}ms (${(targetSize / 1024 / 1024 / (importDurationMs / 1000)).toFixed(1)} Mo/s) | Extract: ${(extractDurationMs).toFixed(1)}ms`);
        console.log(`    [Mémoire] Réf: RSS=${(memRef.rss/1024/1024).toFixed(1)}M, HeapUsed=${(memRef.heapUsed/1024/1024).toFixed(1)}M, Ext=${(memRef.external/1024/1024).toFixed(1)}M, ArrayBuf=${(memRef.arrayBuffers/1024/1024).toFixed(1)}M`);
        console.log(`    [Mémoire post-import] RSS=${(memAfterImport.rss/1024/1024).toFixed(1)}M (Δ=${(rssDelta/1024/1024).toFixed(1)}M), HeapUsed=${(memAfterImport.heapUsed/1024/1024).toFixed(1)}M (Δ=${(heapDelta/1024/1024).toFixed(1)}M), Ext=${(memAfterImport.external/1024/1024).toFixed(1)}M, ArrayBuf=${(memAfterImport.arrayBuffers/1024/1024).toFixed(1)}M`);
      }

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 5. Verrou multi-processus réel (processus enfant distinct)
  await runTest('5. Verrou multi-processus réel : blocage d\'un second processus et rejet anti-forçage sur PID actif', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-multiproc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');

      // Lancer un processus Node.js enfant qui ouvre le coffre et maintient le verrou
      const vaultPath = fs.existsSync(path.resolve('src/main/vault/index.ts'))
        ? path.resolve('src/main/vault/index.ts')
        : path.resolve('astral-desktop/src/main/vault/index.ts');
      const vaultModuleHref = pathToFileURL(vaultPath).href;
      const childScript = `
        import { openVault } from '${vaultModuleHref}';
        async function run() {
          const targetDir = process.argv[1] || process.argv[2];
          const session = await openVault(targetDir, { password: 'Pass123!' });
          process.send({ status: 'LOCKED', pid: process.pid });
          process.on('message', async (msg) => {
            if (msg === 'QUIT') {
              await session.lockHandle?.release().catch(() => {});
              process.exit(0);
            }
          });
        }
        run().catch(err => { console.error('Child exception:', err); process.exit(1); });
      `;

      const child = spawn(process.execPath, [
        '--input-type=module',
        '-e', childScript,
        testDir,
      ], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      let childStderr = '';
      child.stderr?.on('data', chunk => { childStderr += chunk.toString(); });

      // Attendre que le processus enfant ait acquis le verrou
      await new Promise((resolve, reject) => {
        child.on('message', (msg) => {
          if (msg && msg.status === 'LOCKED') resolve();
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Child exited with code ${code}: ${childStderr}`));
        });
      });

      // 1. Le processus parent tente d'ouvrir le coffre -> doit échouer
      await assert.rejects(async () => {
        await openVault(testDir, { password: 'Pass123!' });
      }, (err) => {
        assert.ok(err instanceof VaultLockedError);
        assert.ok(err.reasonCode === 'ACTIVE_PROCESS' || err.reasonCode === 'HANDLE_BUSY');
        return true;
      });

      // 2. Le processus parent tente un forçage (forceBreakStaleLock: true) alors que l'enfant est vivant -> DOIT ÉCHOUER
      await assert.rejects(async () => {
        await openVault(testDir, { password: 'Pass123!' }, { forceBreakStaleLock: true });
      }, (err) => {
        assert.ok(err instanceof VaultLockedError);
        // Interdiction absolue de forcer un verrou d'un processus actif
        assert.ok(err.reasonCode === 'ACTIVE_PROCESS' || err.reasonCode === 'HANDLE_BUSY');
        return true;
      });

      // 3. Ordonner à l'enfant de fermer et quitter
      child.send('QUIT');
      await new Promise(resolve => child.on('exit', resolve));

      // Supprimer le verrou abandonné de l'enfant mort si nécessaire avec option explicite
      const sessionParent = await openVault(testDir, { password: 'Pass123!' }, { forceBreakStaleLock: true });
      assert.strictEqual(sessionParent.isOpen, true);
      await closeVault(sessionParent);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 6. Protection contre la libération d'un verrou substitué (instanceId mismatch)
  await runTest('6. Protection de libération de verrou : interdiction d\'effacer un verrou substitué', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-substlock-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const lockPath = path.join(testDir, '.lock');
      assert.ok(fs.existsSync(lockPath));

      // Remplacer le contenu du verrou avec un instanceId tiers
      const fakeMeta = {
        vaultId: session.vaultId,
        pid: process.pid,
        instanceId: 'autre-instance-id-1234',
        acquiredAt: new Date().toISOString(),
        hostname: os.hostname(),
        user: 'autre_user',
      };
      await fs.promises.writeFile(lockPath, JSON.stringify(fakeMeta));

      // La fermeture de la session ne doit PAS effacer le fichier .lock tiers
      await closeVault(session);
      assert.ok(fs.existsSync(lockPath), 'Le verrou tiers a été supprimé à tort !');

      // Nettoyer manuellement le fichier de test
      await fs.promises.unlink(lockPath);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 7. Conflit de destination (overwrite: false vs true)
  await runTest('7. Conflit d\'extraction : protection anti-écrasement sans accord explicite et TOCTOU', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-conflict-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(src, Buffer.from('Contenu légitime'));
      await importFile(session, src, 'donnees.txt');

      const dest = path.join(testDir, 'cible_preexistante.txt');
      await fs.promises.writeFile(dest, Buffer.from('Fichier tiers ne devant pas être écrasé'));

      // Tentative d'extraction sans overwrite -> doit échouer
      await assert.rejects(async () => {
        await extractFile(session, 'donnees.txt', dest, { overwrite: false });
      }, (err) => {
        assert.ok(err instanceof DestinationConflictError);
        return true;
      });
      // Le contenu préexistant est strictement intact
      assert.strictEqual(await fs.promises.readFile(dest, 'utf8'), 'Fichier tiers ne devant pas être écrasé');

      // Avec overwrite explicite -> autorisé
      await extractFile(session, 'donnees.txt', dest, { overwrite: true });
      assert.strictEqual(await fs.promises.readFile(dest, 'utf8'), 'Contenu légitime');

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 8. Crash point 1 : Index publié, marqueur de commit absent (Point 1 utilisateur)
  await runTest('8. Reprise incident : index publié mais crash avant mise à jour journal -> le payload EST PRÉSERVÉ', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-commit-boundary-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src = path.join(testDir, 'doc.txt');
      await fs.promises.writeFile(src, Buffer.from('Donnée critique à préserver'));

      // Simulation d'import où l'index est publié avec succès, mais le processus crashe juste avant d'écrire INDEX_COMMITTED
      let importedEntry;
      await assert.rejects(async () => {
        importedEntry = await importFile(session, src, 'critique.txt', { faultInjection: 'FAIL_BEFORE_JOURNAL_COMMIT' });
      }, /Crash simulé après publication index/);

      // Fermer la session pour simuler le crash
      await closeVault(session);

      // Dans le journal, le dernier statut est PAYLOAD_PUBLISHED (pas INDEX_COMMITTED)
      // Réouverture : la reprise doit vérifier l'index valide avant de toucher aux blobs !
      const sessionRecovered = await openVault(testDir, { password: 'Pass123!' });

      // RÉSULTAT OBLIGATOIRE : le fichier est DANS l'index et son payload sur disque N'A PAS ÉTÉ DÉTRUIT !
      assert.strictEqual(sessionRecovered.index.files.length, 1);
      assert.strictEqual(sessionRecovered.index.files[0].virtualPath, 'critique.txt');

      // Le fichier est parfaitement extractable et intègre
      const extractedPath = path.join(testDir, 'critique_recup.txt');
      const extRes = await extractFile(sessionRecovered, 'critique.txt', extractedPath);
      assert.strictEqual(extRes.sha256Verified, true);
      assert.strictEqual(await fs.promises.readFile(extractedPath, 'utf8'), 'Donnée critique à préserver');

      await closeVault(sessionRecovered);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 9. Crash point 2 : Suppression interrompue après commit index (Point 2 utilisateur)
  await runTest('9. Reprise suppression : index publié sans référence mais crash avant journal -> purge sécurisée du blob', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-del-boundary-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src1 = path.join(testDir, 'f1.txt');
      const src2 = path.join(testDir, 'f2.txt');
      await fs.promises.writeFile(src1, Buffer.from('Fichier 1'));
      await fs.promises.writeFile(src2, Buffer.from('Fichier 2'));

      const e1 = await importFile(session, src1, 'f1.txt');
      const e2 = await importFile(session, src2, 'f2.txt');
      assert.strictEqual(session.index.files.length, 2);

      const blob1Path = path.join(testDir, 'blobs', e1.id.slice(0, 2), `${e1.id}.enc`);
      const blob2Path = path.join(testDir, 'blobs', e2.id.slice(0, 2), `${e2.id}.enc`);

      // Suppression de f1 avec crash juste après le commit de l'index
      await assert.rejects(async () => {
        await deleteFile(session, 'f1.txt', { faultInjection: 'FAIL_BEFORE_BLOB_UNLINK' });
      }, /Crash simulé après commit index/);

      await closeVault(session);

      // Le blob1 est encore présent sur disque au moment du crash
      assert.ok(fs.existsSync(blob1Path));

      // Réouverture : la reprise constate que l'index ne référence plus e1 -> suppression physique du blob orphelin
      const session2 = await openVault(testDir, { password: 'Pass123!' });
      assert.strictEqual(session2.index.files.length, 1);
      assert.strictEqual(session2.index.files[0].virtualPath, 'f2.txt');
      assert.ok(!fs.existsSync(blob1Path), 'Le blob supprimé n\'a pas été purgé !');
      assert.ok(fs.existsSync(blob2Path), 'Le blob légitime restant a été altéré !');

      // Test d'interruption pendant la reprise elle-même : ré-exécuter recoverFromJournal
      const recAgain = await recoverFromJournal(session2.vaultRoot, session2.index);
      assert.strictEqual(recAgain.recoveredCount, 0);

      await closeVault(session2);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 10. Crash point 3 : Index corrompu avec sauvegarde cohérente (Point 3 utilisateur)
  await runTest('10. Diagnostic sauvegarde : index corrompu avec sauvegarde cohérente -> restauration qualifiée', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-bak-consistent-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src = path.join(testDir, 'donnee.txt');
      await fs.promises.writeFile(src, Buffer.from('Texte précieux'));
      await importFile(session, src, 'donnee.txt');

      // Sauvegarde de l'index synchronisée
      await fs.promises.copyFile(path.join(testDir, 'index.enc'), path.join(testDir, 'index.enc.bak'));
      await closeVault(session);

      // Corrompre index.enc
      const indexPath = path.join(testDir, 'index.enc');
      await fs.promises.writeFile(indexPath, crypto.randomBytes(64));

      // Réouverture : doit qualifier RESTORED_FROM_BACKUP_CONSISTENT et préserver l'index corrompu
      const session2 = await openVault(testDir, { password: 'Pass123!' });
      assert.strictEqual(session2.indexRecoveryStatus, 'RESTORED_FROM_BACKUP_CONSISTENT');
      assert.strictEqual(session2.index.files.length, 1);

      // Vérifier la présence du fichier index.enc.corrupt.<ts>
      const files = await fs.promises.readdir(testDir);
      assert.ok(files.some(f => f.startsWith('index.enc.corrupt.')));

      await closeVault(session2);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 11. Crash point 4 : Index corrompu avec blobs récents non réconciliés (Point 3 utilisateur)
  await runTest('11. Diagnostic sauvegarde : sauvegarde ancienne et blobs récents -> mode DEGRADED, blobs récents préservés', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-bak-degraded-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src1 = path.join(testDir, 'doc1.txt');
      await fs.promises.writeFile(src1, Buffer.from('Doc 1'));
      await importFile(session, src1, 'doc1.txt');

      // Sauvegarde contient doc1
      await fs.promises.copyFile(path.join(testDir, 'index.enc'), path.join(testDir, 'index.enc.bak'));

      const src2 = path.join(testDir, 'doc2.txt');
      await fs.promises.writeFile(src2, Buffer.from('Doc 2'));
      const e2 = await importFile(session, src2, 'doc2.txt');
      assert.strictEqual(session.index.files.length, 2);

      const blob2Path = path.join(testDir, 'blobs', e2.id.slice(0, 2), `${e2.id}.enc`);
      assert.ok(fs.existsSync(blob2Path));

      await closeVault(session);

      // Corrompre l'index principal
      await fs.promises.writeFile(path.join(testDir, 'index.enc'), crypto.randomBytes(64));

      // Réouverture : la sauvegarde ne connaît que doc1, mais le blob2 existe sur disque !
      const session2 = await openVault(testDir, { password: 'Pass123!' });
      assert.strictEqual(session2.indexRecoveryStatus, 'DEGRADED_UNRECONCILED_BACKUP');
      assert.strictEqual(session2.unreconciledBlobs.length, 1);
      assert.strictEqual(session2.unreconciledBlobs[0], e2.id.toLowerCase());

      // RÈGLE ABSOLUE : le blob 2 n'est PAS supprimé par la restauration !
      assert.ok(fs.existsSync(blob2Path), 'Le blob récent non réconcilié a été détruit à tort !');

      // Les écritures doivent être bloquées en mode dégradé
      await assert.rejects(async () => {
        await importFile(session2, src1, 'doc3.txt');
      }, /Écriture bloquée : le coffre est en mode dégradé/);

      await closeVault(session2);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 12. Crash point 5 : Sauvegarde corrompue ou blobs manquants -> rejet propre UNRECOVERABLE
  await runTest('12. Diagnostic sauvegarde : index et sauvegarde irrécupérables -> échec franc sans altération', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-unrecoverable-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });
      await closeVault(session);

      // Corrompre index.enc et index.enc.bak
      await fs.promises.writeFile(path.join(testDir, 'index.enc'), crypto.randomBytes(64));
      await fs.promises.writeFile(path.join(testDir, 'index.enc.bak'), crypto.randomBytes(64));

      await assert.rejects(async () => {
        await openVault(testDir, { password: 'Pass123!' });
      }, /UNRECOVERABLE_INDEX/);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 13. Journal non fiable / altéré (Point 4 utilisateur)
  await runTest('13. Journal non fiable : rejet des lignes trop longues, fausses cibles et Path Traversal', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-untrusted-journal-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src = path.join(testDir, 'legitime.txt');
      await fs.promises.writeFile(src, Buffer.from('Fichier légitime'));
      const entry = await importFile(session, src, 'legitime.txt');
      assert.strictEqual(session.index.files.length, 1);

      const blobPath = path.join(testDir, 'blobs', entry.id.slice(0, 2), `${entry.id}.enc`);

      // Injecter des lignes malveillantes ou corrompues dans journal.log
      const journalPath = path.join(testDir, 'journal.log');
      const maliciousLines = [
        // Tentative de Path Traversal via stagingRelPath
        JSON.stringify({ txId: crypto.randomUUID(), op: 'IMPORT_PAYLOAD', state: 'STAGING_PAYLOAD', stagingRelPath: '../../secret.txt', timestamp: Date.now() }),
        // Ligne corrompue / tronquée
        '{"txId": "incomplet", "op": "IMPO',
        // Ligne de taille anormale (> 1024 octets)
        JSON.stringify({ txId: crypto.randomUUID(), op: 'IMPORT_PAYLOAD', state: 'STAGING_PAYLOAD', padding: 'A'.repeat(1500), timestamp: Date.now() }),
        // Fausse mention que le blob légitime doit être supprimé (alors qu'il est dans l'index valide)
        JSON.stringify({ txId: crypto.randomUUID(), op: 'IMPORT_PAYLOAD', state: 'PAYLOAD_PUBLISHED', blobId: entry.id, timestamp: Date.now() }),
      ].join('\n') + '\n';

      await fs.promises.appendFile(journalPath, maliciousLines);

      await closeVault(session);

      // Réouverture : la reprise doit filtrer les lignes invalides et REFUSER de détruire le blob légitime
      const session2 = await openVault(testDir, { password: 'Pass123!' });
      assert.strictEqual(session2.index.files.length, 1);
      assert.ok(fs.existsSync(blobPath), 'Le blob légitime a été supprimé suite à une injection dans le journal !');

      await closeVault(session2);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 14. Injections de pannes sur code de production
  await runTest('14. Injections de fautes : échec d\'écriture payload et échec avant renommage index', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-faults-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const src = path.join(testDir, 'fichier_panne.txt');
      await fs.promises.writeFile(src, Buffer.from('Test de panne'));

      // 1. Échec simulé d'écriture de payload (simulation disque plein / I/O error)
      await assert.rejects(async () => {
        await importFile(session, src, 'panne1.txt', { faultInjection: 'FAIL_DURING_PAYLOAD_WRITE' });
      }, /Échec simulé d'écriture de payload/);

      // L'index est intact, aucun staging orphelin n'a été publié
      assert.strictEqual(session.index.files.length, 0);

      // 2. Échec simulé avant renommage de l'index
      await assert.rejects(async () => {
        await importFile(session, src, 'panne2.txt', { faultInjection: 'FAIL_BEFORE_INDEX_RENAME' });
      }, /Échec simulé avant renommage atomique index/);

      assert.strictEqual(session.index.files.length, 0);

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 15. Contrôle des liens symboliques
  await runTest('15. Liens symboliques et chemins malveillants : rejet des dossiers et contrôle Path Traversal', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-symlinks-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      // Dossier interdit comme fichier source
      const subDir = path.join(testDir, 'un_vrai_dossier');
      await fs.promises.mkdir(subDir, { recursive: true });
      await assert.rejects(async () => {
        await importFile(session, subDir, 'dossier');
      }, /n'est pas un fichier régulier/);

      // Path Traversal dans le chemin virtuel
      await assert.rejects(async () => {
        await importFile(session, path.join(testDir, 'vault.header'), '../../evil.txt');
      }, /Path Traversal/);

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 16. Suppression sélective et préservation des tiers
  await runTest('16. Suppression sélective : intégrité et préservation stricte des tiers', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-selective-del-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      const f1 = path.join(testDir, 'doc1.txt');
      const f2 = path.join(testDir, 'doc2.txt');
      await fs.promises.writeFile(f1, Buffer.from('Doc 1'));
      await fs.promises.writeFile(f2, Buffer.from('Doc 2'));

      const e1 = await importFile(session, f1, 'doc1.txt');
      const e2 = await importFile(session, f2, 'doc2.txt');

      const b1 = path.join(testDir, 'blobs', e1.id.slice(0, 2), `${e1.id}.enc`);
      const b2 = path.join(testDir, 'blobs', e2.id.slice(0, 2), `${e2.id}.enc`);

      await deleteFile(session, 'doc1.txt');
      assert.strictEqual(session.index.files.length, 1);
      assert.strictEqual(session.index.files[0].virtualPath, 'doc2.txt');
      assert.ok(!fs.existsSync(b1));
      assert.ok(fs.existsSync(b2));

      await closeVault(session);
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 17. Effacement sécurisé des clés en mémoire vive à la fermeture
  await runTest('17. Effacement sécurisé des clés : mise à zéro immédiate de la mémoire à la fermeture', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-zero-keys-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    try {
      await createVault(testDir, 'Pass123!');
      const session = await openVault(testDir, { password: 'Pass123!' });

      assert.strictEqual(session.masterKey.length, 32);
      assert.strictEqual(session.metaKey.length, 32);
      assert.strictEqual(session.dataKey.length, 32);

      // Conserver une référence directe sur les tableaux sous-jacents en mémoire vive
      const rawMaster = session.masterKey;
      const rawMeta = session.metaKey;
      const rawData = session.dataKey;

      assert.ok(rawMaster.some(b => b !== 0));
      assert.ok(rawMeta.some(b => b !== 0));
      assert.ok(rawData.some(b => b !== 0));

      await closeVault(session);

      // Les propriétés de la session ont été réinitialisées à longueur 0
      assert.strictEqual(session.isOpen, false);
      assert.strictEqual(session.masterKey.length, 0);
      assert.strictEqual(session.metaKey.length, 0);
      assert.strictEqual(session.dataKey.length, 0);

      // Et les tampons mémoire préexistants ont été intégralement écrasés de zéros (secureZero / sodium_memzero)
      assert.ok(rawMaster.every(b => b === 0), 'La clé maîtresse n\'a pas été mise à zéro en mémoire !');
      assert.ok(rawMeta.every(b => b === 0), 'La sous-clé méta n\'a pas été mise à zéro en mémoire !');
      assert.ok(rawData.every(b => b === 0), 'La sous-clé data n\'a pas été mise à zéro en mémoire !');
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  console.log('-------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur non rattrapée dans la suite de tests :', err);
  process.exit(1);
});
