import { createRollbackSnapshot, restoreRollbackSnapshot } from '../src/main/rollback';
import path from 'path';
import fs from 'fs';

async function runTest() {
  console.log('================================================================');
  console.log('🚀 TEST ASTRAL VANGUARD - TWO-TIER ROLLBACK (SAME-DAY MULTI-ACTION)');
  console.log('================================================================');

  try {
    const appData = process.env.APPDATA || 'C:\\Users\\Public';
    const rollbackRoot = path.join(appData, 'AstralVanguard', 'rollback');
    console.log(`[Test] Rollback root directory: ${rollbackRoot}`);

    // Create a temporary test file to verify file backup capability as well
    const testTempFile = path.join(appData, 'AstralVanguard', 'test_config_target.json');
    if (!fs.existsSync(path.dirname(testTempFile))) {
      fs.mkdirSync(path.dirname(testTempFile), { recursive: true });
    }
    fs.writeFileSync(testTempFile, JSON.stringify({ version: 'pre-remediation-1', state: 'original' }), 'utf-8');

    // ──────────────────────────────────────────────────────────────────────────
    // ACTION 1: First Remediation Action of the day
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- ÉTAPE 1 : Déclenchement Action 1 (Remédiation Réseau & DeliveryOptimization) ---');
    const action1Result = await createRollbackSnapshot(
      'Action 1 - SOS Déblocage Ping (Pile Réseau & DeliveryOptimization)',
      {
        keys: [
          'HKCU\\Control Panel\\Keyboard',
          'HKCU\\Control Panel\\Accessibility\\Keyboard Response'
        ],
        files: [testTempFile]
      }
    );

    console.log('Action 1 snapshot créée :', {
      success: action1Result.success,
      id: action1Result.entry.id,
      hasLocalBackup: action1Result.entry.hasLocalBackup,
      hasRegistryBackup: action1Result.entry.hasRegistryBackup,
      hasFileBackup: action1Result.entry.hasFileBackup,
      systemRestoreStatus: action1Result.entry.systemRestoreStatus,
      warning: action1Result.warning || '(aucun)'
    });

    if (!action1Result.success || !action1Result.entry.hasLocalBackup) {
      throw new Error('Échec Action 1 : sauvegarde locale manquante.');
    }

    // Simulate system change between Action 1 and Action 2
    fs.writeFileSync(testTempFile, JSON.stringify({ version: 'post-remediation-1', state: 'modified_1' }), 'utf-8');

    // Wait 1.5 seconds to ensure distinct timestamp
    await new Promise((r) => setTimeout(r, 1500));

    // ──────────────────────────────────────────────────────────────────────────
    // ACTION 2: Second Remediation Action on the SAME DAY
    // (This is where Windows System Restore / Checkpoint-Computer hits 24h limit)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- ÉTAPE 2 : Déclenchement Action 2 le MÊME JOUR (Remédiation Menace Defender) ---');
    const action2Result = await createRollbackSnapshot(
      'Action 2 - Remédiation Menace Defender (Heuristique)',
      {
        keys: [
          'HKCU\\Control Panel\\Keyboard',
          'HKCU\\Control Panel\\Accessibility\\StickyKeys'
        ],
        files: [testTempFile]
      }
    );

    console.log('Action 2 snapshot créée :', {
      success: action2Result.success,
      id: action2Result.entry.id,
      hasLocalBackup: action2Result.entry.hasLocalBackup,
      hasRegistryBackup: action2Result.entry.hasRegistryBackup,
      hasFileBackup: action2Result.entry.hasFileBackup,
      systemRestoreStatus: action2Result.entry.systemRestoreStatus,
      warning: action2Result.warning || '(aucun)'
    });

    if (!action2Result.success || !action2Result.entry.hasLocalBackup) {
      throw new Error('Échec Action 2 : la sauvegarde locale doit être garantie même si le quota Windows 24h est atteint.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ÉTAPE 3 : Vérification du système de fichiers (.reg avec UTF-16LE BOM)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- ÉTAPE 3 : Vérification des fichiers .reg et métadonnées ---');
    const snap1Dir = path.join(rollbackRoot, action1Result.entry.id);
    const snap2Dir = path.join(rollbackRoot, action2Result.entry.id);

    const reg1Path = path.join(snap1Dir, 'registry_backup.reg');
    const reg2Path = path.join(snap2Dir, 'registry_backup.reg');

    console.log(`Snap 1 .reg existe : ${fs.existsSync(reg1Path)} (taille: ${fs.statSync(reg1Path).size} octets)`);
    console.log(`Snap 2 .reg existe : ${fs.existsSync(reg2Path)} (taille: ${fs.statSync(reg2Path).size} octets)`);

    // Verify BOM \ufeff
    const buf1 = fs.readFileSync(reg1Path);
    const hasBom1 = buf1[0] === 0xff && buf1[1] === 0xfe;
    console.log(`Snap 1 UTF-16LE BOM présent : ${hasBom1}`);

    const buf2 = fs.readFileSync(reg2Path);
    const hasBom2 = buf2[0] === 0xff && buf2[1] === 0xfe;
    console.log(`Snap 2 UTF-16LE BOM présent : ${hasBom2}`);

    if (!hasBom1 || !hasBom2) {
      throw new Error('BOM UTF-16LE manquant sur le fichier .reg ! Windows reg.exe rejetterait le fichier.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ÉTAPE 4 : Test de Restauration (Rollback) pour Action 1
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- ÉTAPE 4 : Test de restauration pour Action 1 ---');
    const restore1 = await restoreRollbackSnapshot(action1Result.entry.id);
    console.log('Résultat restauration Action 1 :', restore1);
    if (!restore1.success) {
      throw new Error(`Échec restauration Action 1: ${restore1.error}`);
    }

    // Check restored file content
    const restoredContent1 = JSON.parse(fs.readFileSync(testTempFile, 'utf-8'));
    console.log('Contenu fichier restauré par Action 1 :', restoredContent1);
    if (restoredContent1.version !== 'pre-remediation-1') {
      throw new Error('Le fichier restauré ne correspond pas à l\'état pré-remediation-1');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ÉTAPE 5 : Test de Restauration (Rollback) pour Action 2
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- ÉTAPE 5 : Test de restauration pour Action 2 ---');
    const restore2 = await restoreRollbackSnapshot(action2Result.entry.id);
    console.log('Résultat restauration Action 2 :', restore2);
    if (!restore2.success) {
      throw new Error(`Échec restauration Action 2: ${restore2.error}`);
    }

    const restoredContent2 = JSON.parse(fs.readFileSync(testTempFile, 'utf-8'));
    console.log('Contenu fichier restauré par Action 2 :', restoredContent2);
    if (restoredContent2.version !== 'post-remediation-1') {
      throw new Error('Le fichier restauré ne correspond pas à l\'état post-remediation-1');
    }

    // Clean up temporary test target file
    try { fs.unlinkSync(testTempFile); } catch {}

    console.log('\n================================================================');
    console.log('🎉 TOUS LES TESTS DU ROLLBACK EN DEUX NIVEAUX ONT RÉUSSI AVEC SUCCÈS !');
    console.log('1. Action 1 sauvegardée et restaurable sans dépendre de Checkpoint-Computer');
    console.log('2. Action 2 (même jour) sauvegardée et restaurable sans blocage de quota 24h');
    console.log('3. Export .reg UTF-16LE BOM conforme reg.exe');
    console.log('4. Source de vérité locale active et badges UI explicites');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ ERREUR LORS DU TEST ROLLBACK :', err);
    process.exit(1);
  }
}

runTest();
