/**
 * Test de non-régression : Exclusion déterministe des fichiers système et temporaires
 * Vérifie que desktop.ini, thumbs.db, les fichiers temporaires et les extensions ignorées
 * sont filtrés immédiatement sans déclencher de scan ni solliciter MpCmdRun.
 */

import assert from 'node:assert';
import { shouldIgnoreFile, SYSTEM_IGNORED_FILES } from '../src/main/scannerExclusions.ts';

console.log('=== Test de Non-Régression : Filtrage Sentinelle de Téléchargement ===\n');

// 1. Fichiers système Windows
console.log('1. Vérification des fichiers système Windows (desktop.ini, thumbs.db)...');
assert.strictEqual(shouldIgnoreFile('desktop.ini'), true, 'desktop.ini doit être ignoré');
assert.strictEqual(shouldIgnoreFile('DESKTOP.INI'), true, 'DESKTOP.INI (majuscules) doit être ignoré');
assert.strictEqual(shouldIgnoreFile('thumbs.db'), true, 'thumbs.db doit être ignoré');
assert.strictEqual(shouldIgnoreFile('ehthumbs.db'), true, 'ehthumbs.db doit être ignoré');
console.log('  OK : Tous les fichiers système Windows sont ignorés immédiatement.');

// 2. Fichiers temporaires de navigateurs et installateurs
console.log('2. Vérification des fichiers temporaires (.crdownload, .part, .tmp, Inno Setup)...');
assert.strictEqual(shouldIgnoreFile('download.crdownload'), true, '.crdownload doit être ignoré');
assert.strictEqual(shouldIgnoreFile('archive.zip.part'), true, '.part doit être ignoré');
assert.strictEqual(shouldIgnoreFile('file.tmp'), true, '.tmp doit être ignoré');
assert.strictEqual(shouldIgnoreFile('~setup123.tmp'), true, 'Fichiers commençant par ~ doivent être ignorés');
assert.strictEqual(shouldIgnoreFile('is-ABCDE.tmp'), true, 'Inno Setup temporaires doivent être ignorés');
assert.strictEqual(shouldIgnoreFile('.hidden_file'), true, 'Fichiers cachés commençant par un point doivent être ignorés');
assert.strictEqual(shouldIgnoreFile('unconfirmed 98765.crdownload'), true, 'Fichiers non confirmés Chrome doivent être ignorés');
console.log('  OK : Tous les fichiers temporaires sont ignorés.');

// 3. Extensions ignorées par défaut (.txt, .md, média)
console.log('3. Vérification des extensions ignorées par défaut...');
assert.strictEqual(shouldIgnoreFile('notes.txt'), true, '.txt doit être ignoré par défaut');
assert.strictEqual(shouldIgnoreFile('readme.md'), true, '.md doit être ignoré par défaut');
assert.strictEqual(shouldIgnoreFile('music.mp3'), true, '.mp3 doit être ignoré par défaut');
console.log('  OK : Les extensions configurées sont ignorées.');

// 4. Fichiers légitimes à analyser impérativement
console.log('4. Vérification des fichiers binaires légitimes à analyser...');
assert.strictEqual(shouldIgnoreFile('installer.exe'), false, 'installer.exe NE DOIT PAS être ignoré');
assert.strictEqual(shouldIgnoreFile('package.msi'), false, 'package.msi NE DOIT PAS être ignoré');
assert.strictEqual(shouldIgnoreFile('payload.zip'), false, 'payload.zip NE DOIT PAS être ignoré');
assert.strictEqual(shouldIgnoreFile('script.vbs'), false, 'script.vbs NE DOIT PAS être ignoré');
console.log('  OK : Les exécutables et archives sont correctement envoyés à l\'analyse.');

// 5. Préservation des sentinelles de test de sécurité
console.log('5. Vérification des sentinelles de test EICAR et Vanguard...');
assert.strictEqual(shouldIgnoreFile('eicar.txt'), false, 'eicar.txt NE DOIT PAS être ignoré malgré l\'extension .txt');
assert.strictEqual(shouldIgnoreFile('vanguard-sentinel-test.txt'), false, 'vanguard-sentinel-test.txt NE DOIT PAS être ignoré');
console.log('  OK : Les sentinelles de test de sécurité sont préservées.');

console.log('\n-------------------------------------------------------');
console.log('Results: 5/5 assertions passed, 0 failed');
console.log('ALL DOWNLOAD SCANNER EXCLUSION TESTS PASSED\n');
