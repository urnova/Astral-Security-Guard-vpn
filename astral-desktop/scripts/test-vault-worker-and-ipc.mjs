/**
 * Vanguard Vault — Test Suite Intégration Worker & API Interne (Sous-Lot 3)
 * 
 * Valide de bout en bout l'orchestration Main <-> Worker Thread :
 * 1. Validation des messages et arguments (rejets stricts, typage)
 * 2. Règle absolue de confidentialité : ABSENCE TOTALE de clés dans les réponses IPC / DTOs
 * 3. Création et ouverture nominale via VaultManager + Worker réel
 * 4. Rejet formel sur mauvais mot de passe
 * 5. Déverrouillage par clé de secours Crockford & configuration/retrait
 * 6. Changement de mot de passe en cours de session et réouverture
 * 7. Import et extraction de données générées (SHA-256 de bout en bout, original externe préservé)
 * 8. Annulation en vol d'une opération longue (AbortController)
 * 9. Tentative de verrouillage pendant une opération
 * 10. Crash inopiné du Worker (terminate) & résilience / réouverture avec reprise
 * 11. Idempotence des fermetures et verrouillages répétés
 * 12. Mode dégradé (DEGRADED_UNRECONCILED_BACKUP) : blocage des écritures, extraction permise
 * 13. Conflit de destination d'extraction (refus d'écrasement sans accord)
 * 14. Étanchéité absolue vis-à-vis du Brief IA (SafeBriefPayload ne contient aucune donnée Vault)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { VaultManager } from '../src/main/vault/vaultManager.ts';
import { DailyBriefEngine } from '../src/main/dailyBriefEngine.ts';
import { userProfileManager } from '../src/main/profile.ts';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(err);
    failed++;
  }
}

async function main() {
  console.log('=== Vanguard Vault : Suite de Tests Worker, API Interne & Résilience (Sous-Lot 3) ===\n');

  const workerScriptPath = fs.existsSync(path.resolve('src/main/vault/vaultWorker.ts'))
    ? path.resolve('src/main/vault/vaultWorker.ts')
    : path.resolve('astral-desktop/src/main/vault/vaultWorker.ts');

  // 1. Validation des messages et arguments
  await runTest('1. Validation des messages et arguments : rejet des entrées invalides', async () => {
    const mgr = new VaultManager({ workerScriptPath });
    try {
      // Chemin vide
      await assert.rejects(async () => {
        await mgr.createVault('', 'PassRobuste123!');
      }, /invalide/i);

      // Mot de passe trop court
      const testDir = path.join(os.tmpdir(), `vgv-test-arg-${Date.now()}`);
      await assert.rejects(async () => {
        await mgr.createVault(testDir, 'court');
      }, /au moins 8 caractères/i);
    } finally {
      await mgr.shutdown();
    }
  });

  // 2. Absence totale de clés dans les réponses IPC / DTOs
  await runTest('2. Absence de clés dans les réponses IPC : étanchéité mémoire et zéro fuite de secret', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-leak-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      const createRes = await mgr.createVault(testDir, 'PassRobuste123!', { recoveryKeyRaw: crypto.randomBytes(32) });
      const status = await mgr.openVault(testDir, { password: 'PassRobuste123!' });

      const statusJson = JSON.stringify(status);
      const forbiddenTokens = ['masterKey', 'metaKey', 'dataKey', 'wrappedKey', 'nonce', 'salt', 'kek', 'PassRobuste123!'];

      for (const token of forbiddenTokens) {
        assert.ok(!statusJson.includes(token), `Fuite détectée dans le DTO de statut : token "${token}" trouvé !`);
      }

      // Vérifier que le statut n'expose que des métadonnées autorisées
      assert.strictEqual(status.isOpen, true);
      assert.strictEqual(status.hasRecoverySlot, true);
      assert.strictEqual(status.filesCount, 0);
      assert.ok(status.vaultId);
      assert.strictEqual(status.vaultRoot, testDir);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 3. Création et ouverture nominale via VaultManager + Worker réel
  await runTest('3. Création et ouverture nominale via Worker Thread dédié', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-worker-open-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      const createRes = await mgr.createVault(testDir, 'MonMotDePasse123!');
      assert.ok(createRes.vaultId);

      const statusBefore = mgr.getStatus();
      assert.strictEqual(statusBefore.isOpen, false);

      const statusOpen = await mgr.openVault(testDir, { password: 'MonMotDePasse123!' });
      assert.strictEqual(statusOpen.isOpen, true);
      assert.strictEqual(statusOpen.vaultId, createRes.vaultId);

      const statusLock = await mgr.lockVault();
      assert.strictEqual(statusLock.isOpen, false);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 4. Rejet formel sur mauvais mot de passe
  await runTest('4. Rejet formel sur mauvais mot de passe : échec franc sans corruption', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-badpass-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'VraiMotDePasse123!');

      await assert.rejects(async () => {
        await mgr.openVault(testDir, { password: 'FauxMotDePasse123!' });
      }, /mot de passe incorrect|données altérées|invalide/i);

      assert.strictEqual(mgr.getStatus().isOpen, false);

      // Déverrouillage réussi ensuite avec le bon mot de passe
      const okStatus = await mgr.openVault(testDir, { password: 'VraiMotDePasse123!' });
      assert.strictEqual(okStatus.isOpen, true);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 5. Déverrouillage par clé de secours Crockford & configuration/retrait
  await runTest('5. Clé de secours Crockford : déverrouillage, ajout et retrait sans invalider le mot de passe', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-rec-flow-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      // 1. Création avec mot de passe uniquement (pas de secours)
      await mgr.createVault(testDir, 'PassInitial123!');
      let status = await mgr.openVault(testDir, { password: 'PassInitial123!' });
      assert.strictEqual(status.hasRecoverySlot, false);

      // 2. Ajout dynamique d'une clé de secours en cours de session
      const addRes = await mgr.configureRecovery('add');
      assert.ok(addRes.recoveryKeyFormatted);
      assert.strictEqual(addRes.status.hasRecoverySlot, true);
      const formattedKey = addRes.recoveryKeyFormatted;

      await mgr.lockVault();

      // 3. Déverrouillage via la clé de secours Crockford nouvellement générée
      const statusRec = await mgr.openVault(testDir, { recoveryKeyString: formattedKey });
      assert.strictEqual(statusRec.isOpen, true);

      // 4. Vérification CRITIQUE : le mot de passe principal fonctionne toujours (indépendance des AAD)
      await mgr.lockVault();
      const statusPass = await mgr.openVault(testDir, { password: 'PassInitial123!' });
      assert.strictEqual(statusPass.isOpen, true);

      // 5. Retrait de la clé de secours
      const removeRes = await mgr.configureRecovery('remove');
      assert.strictEqual(removeRes.status.hasRecoverySlot, false);

      await mgr.lockVault();

      // 6. La clé de secours retirée est désormais rejetée
      await assert.rejects(async () => {
        await mgr.openVault(testDir, { recoveryKeyString: formattedKey });
      }, /ne dispose pas de slot de récupération/);

      // Le mot de passe fonctionne toujours après retrait de la clé de secours
      const finalStatus = await mgr.openVault(testDir, { password: 'PassInitial123!' });
      assert.strictEqual(finalStatus.isOpen, true);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 6. Changement de mot de passe en cours de session et réouverture
  await runTest('6. Changement de mot de passe : réécriture du Slot 1 et validation du nouveau mot de passe', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-chgpass-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'AncienPass123!');
      await mgr.openVault(testDir, { password: 'AncienPass123!' });

      // Changement de mot de passe
      await mgr.changePassword('NouveauPassSecurise456!');
      await mgr.lockVault();

      // L'ancien mot de passe doit être refusé
      await assert.rejects(async () => {
        await mgr.openVault(testDir, { password: 'AncienPass123!' });
      }, /mot de passe incorrect|données altérées|invalide/i);

      // Le nouveau mot de passe doit déverrouiller
      const status = await mgr.openVault(testDir, { password: 'NouveauPassSecurise456!' });
      assert.strictEqual(status.isOpen, true);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 7. Import et extraction de données générées (SHA-256 de bout en bout, original externe préservé)
  await runTest('7. Import et extraction via Worker : intégrité SHA-256 et préservation du fichier externe', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-worker-io-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      const externalFile = path.join(testDir, 'externe.txt');
      const testContent = Buffer.from('Données critiques confidentielles de test - Vanguard');
      await fs.promises.writeFile(externalFile, testContent);
      const expectedSha256 = crypto.createHash('sha256').update(testContent).digest('hex');

      let progressCount = 0;
      const importRes = await mgr.importFile(externalFile, 'dossier/secret.txt', (p) => {
        progressCount++;
        assert.ok(p.percent >= 0 && p.percent <= 100);
      });

      assert.strictEqual(importRes.entry.virtualPath, 'dossier/secret.txt');
      assert.strictEqual(importRes.entry.sha256, expectedSha256);
      assert.strictEqual(importRes.status.filesCount, 1);

      // RÈGLE ABSOLUE : le fichier externe original N'A PAS ÉTÉ MODIFIÉ NI SUPPRIMÉ
      assert.ok(fs.existsSync(externalFile));
      assert.strictEqual(await fs.promises.readFile(externalFile, 'utf8'), testContent.toString());

      // Extraction vers un nouvel emplacement
      const extractedPath = path.join(testDir, 'extrait.txt');
      const extRes = await mgr.extractFile('dossier/secret.txt', extractedPath);
      assert.strictEqual(extRes.sha256Verified, true);
      assert.strictEqual(await fs.promises.readFile(extractedPath, 'utf8'), testContent.toString());

      // Suppression du coffre
      const postDeleteStatus = await mgr.deleteFile('dossier/secret.txt');
      assert.strictEqual(postDeleteStatus.filesCount, 0);

      // Le fichier externe original existe toujours après suppression du coffre
      assert.ok(fs.existsSync(externalFile));
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 8. Annulation en vol d'une opération longue (AbortController)
  await runTest('8. Annulation en vol : interruption propre et nettoyage des résidus temporaires', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-cancel-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      // Gros fichier pour avoir le temps d'annuler
      const bigFile = path.join(testDir, 'gros_fichier.bin');
      const buf = crypto.randomBytes(5 * 1024 * 1024); // 5 Mo
      await fs.promises.writeFile(bigFile, buf);

      let cancelTriggered = false;
      const importPromise = mgr.importFile(bigFile, 'gros.bin', async (p) => {
        if (!cancelTriggered && p.bytesProcessed > 64 * 1024) {
          cancelTriggered = true;
          await mgr.cancelCurrentOperation();
        }
      });

      await assert.rejects(async () => {
        await importPromise;
      }, /OPERATION_CANCELLED/);

      // Le coffre ne doit pas référencer le fichier incomplet
      const currentStatus = mgr.getStatus();
      assert.strictEqual(currentStatus.filesCount, 0);

      // Aucun staging orphelin ne doit persister
      const stagingDir = path.join(testDir, 'staging');
      const stagingFiles = await fs.promises.readdir(stagingDir);
      assert.strictEqual(stagingFiles.length, 0);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 9. Tentative de verrouillage pendant une opération
  await runTest('9. Arrêt / verrouillage ordonné pendant une opération : libération sans blocage', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-lock-in-flight-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      const bigFile = path.join(testDir, 'file.bin');
      await fs.promises.writeFile(bigFile, crypto.randomBytes(3 * 1024 * 1024));

      // Lancer un import puis verrouiller immédiatement
      const importPromise = mgr.importFile(bigFile, 'async_file.bin').catch(() => {});
      const lockPromise = mgr.lockVault();

      await Promise.all([importPromise, lockPromise]);
      assert.strictEqual(mgr.getStatus().isOpen, false);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 10. Crash inopiné du Worker (terminate) & résilience / réouverture avec reprise
  await runTest('10. Crash inopiné du Worker : détection d\'interruption et reprise automatique à la réouverture', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-crash-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      const sample = path.join(testDir, 'pre_crash.txt');
      await fs.promises.writeFile(sample, Buffer.from('Avant crash'));
      await mgr.importFile(sample, 'pre_crash.txt');
      assert.strictEqual(mgr.getStatus().filesCount, 1);

      // Simulation d'un crash brutal du worker thread
      await mgr.terminateWorkerForTesting();

      // Le gestionnaire doit détecter la fin du worker et basculer l'état
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.strictEqual(mgr.getStatus().isOpen, false);

      // Réouverture : le gestionnaire a relancé un nouveau worker et la reprise s'exécute (avec forceBreakStaleLock car le PID hôte est identique)
      const session2 = await mgr.openVault(testDir, { password: 'Pass123!' }, { forceBreakStaleLock: true });
      assert.strictEqual(session2.isOpen, true);
      assert.strictEqual(session2.filesCount, 1);
      assert.strictEqual(session2.files[0].virtualPath, 'pre_crash.txt');
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 11. Idempotence des fermetures et verrouillages répétés
  await runTest('11. Idempotence : fermetures et verrouillages répétés sans effet de bord ni rejet', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-idemp-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      await mgr.lockVault();
      await mgr.lockVault(); // Appel répété sur coffre déjà verrouillé
      await mgr.closeVault();
      await mgr.closeVault();

      assert.strictEqual(mgr.getStatus().isOpen, false);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 12. Mode dégradé (DEGRADED_UNRECONCILED_BACKUP)
  await runTest('12. Mode dégradé : détection stricte, blocage des écritures et extraction autorisée', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-degraded-worker-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      const f1 = path.join(testDir, 'doc1.txt');
      await fs.promises.writeFile(f1, Buffer.from('Contenu doc 1'));
      await mgr.importFile(f1, 'doc1.txt');

      // Copier l'index actuel dans index.enc.bak (qui ne connaît que doc1)
      await fs.promises.copyFile(path.join(testDir, 'index.enc'), path.join(testDir, 'index.enc.bak'));

      // Importer doc2 (seul l'index principal connaît doc2)
      const f2 = path.join(testDir, 'doc2.txt');
      await fs.promises.writeFile(f2, Buffer.from('Contenu doc 2'));
      await mgr.importFile(f2, 'doc2.txt');

      await mgr.lockVault();

      // Corrompre l'index principal : la réouverture bascule sur index.enc.bak
      // mais constate la présence sur disque du blob de doc2 -> DEGRADED_UNRECONCILED_BACKUP
      await fs.promises.writeFile(path.join(testDir, 'index.enc'), crypto.randomBytes(64));

      const degradedStatus = await mgr.openVault(testDir, { password: 'Pass123!' });
      assert.strictEqual(degradedStatus.isOpen, true);
      assert.strictEqual(degradedStatus.recoveryStatus, 'DEGRADED_UNRECONCILED_BACKUP');
      assert.strictEqual(degradedStatus.unreconciledBlobs.length, 1);

      // Les écritures (import) DOIVENT être bloquées pour empêcher tout écrasement aveugle
      const f3 = path.join(testDir, 'doc3.txt');
      await fs.promises.writeFile(f3, Buffer.from('Contenu doc 3'));
      await assert.rejects(async () => {
        await mgr.importFile(f3, 'doc3.txt');
      }, /Écriture bloquée : le coffre est en mode dégradé/);

      // L'extraction des fichiers indexés dans la sauvegarde reste parfaitement fonctionnelle
      const extractedF1 = path.join(testDir, 'f1_recup.txt');
      const extRes = await mgr.extractFile('doc1.txt', extractedF1);
      assert.strictEqual(extRes.sha256Verified, true);
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 13. Conflit de destination d'extraction
  await runTest('13. Conflit de destination : refus d\'écrasement sans accord explicite', async () => {
    const testDir = path.join(os.tmpdir(), `vgv-test-conflict-worker-${Date.now()}`);
    const mgr = new VaultManager({ workerScriptPath });
    try {
      await mgr.createVault(testDir, 'Pass123!');
      await mgr.openVault(testDir, { password: 'Pass123!' });

      const src = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(src, Buffer.from('Texte de test'));
      await mgr.importFile(src, 'source.txt');

      const dest = path.join(testDir, 'existant.txt');
      await fs.promises.writeFile(dest, Buffer.from('Fichier tiers préexistant'));

      // Tentative d'extraction vers un fichier existant sans overwrite
      await assert.rejects(async () => {
        await mgr.extractFile('source.txt', dest, { overwrite: false });
      }, /DestinationConflictError|Conflit de destination/i);

      // Le fichier tiers préexistant n'a pas été écrasé
      assert.strictEqual(await fs.promises.readFile(dest, 'utf8'), 'Fichier tiers préexistant');

      // Avec overwrite: true -> autorisé
      await mgr.extractFile('source.txt', dest, { overwrite: true });
      assert.strictEqual(await fs.promises.readFile(dest, 'utf8'), 'Texte de test');
    } finally {
      await mgr.shutdown();
      await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 14. Étanchéité absolue vis-à-vis du Brief IA
  await runTest('14. Confidentialité Brief IA : absence stricte de toute référence ou métadonnée Vault', async () => {
    let capturedBody = '';
    const engine = new DailyBriefEngine();
    engine.setTestHooks({
      httpPost: async (url, body) => {
        capturedBody = body;
        return {
          statusCode: 200,
          headers: { 'ratelimit-remaining': '1' },
          body: JSON.stringify({
            choices: [{ message: { content: 'Système en parfait état, aucune anomalie.' } }],
          }),
        };
      },
      diskTelemetryFetcher: async () => ({ totalGB: 500, freeGB: 250, usedPercent: 50 }),
      pingFetcher: async () => 15,
    });

    userProfileManager.saveProfile({ aiBriefConsent: 'granted' });

    const res = await engine.getDailyBrief(true);

    assert.ok(res.summary);
    assert.ok(capturedBody.length > 0);

    // Contrôle formel : le payload HTTP envoyé à l'IA distante ne contient STRICTEMENT AUCUN mot ou donnée du coffre
    const forbiddenVaultTerms = ['vault', 'coffre', 'secret', 'masterkey', 'blob', 'wrappedkey', 'vgv_', '.enc'];
    const lowerBody = capturedBody.toLowerCase();
    for (const term of forbiddenVaultTerms) {
      assert.ok(!lowerBody.includes(term), `Fuite critique détectée : terme interdit "${term}" trouvé dans le payload envoyé à l'IA !`);
    }
  });

  console.log('-------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Erreur non rattrapée :', err);
  process.exit(1);
});

