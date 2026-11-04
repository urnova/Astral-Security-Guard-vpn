// scripts/test-maintenance-sandbox.mjs
// Test sandbox pérenne pour l'exigence M6 (Nettoyage & Sécurité)
// Vérifie le non-suivi des symlinks, la gestion des fichiers verrouillés et le calcul exact des octets.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sandboxRoot = path.join(projectRoot, 'scratch', 'sandbox-clean');
const externalDir = path.join(projectRoot, 'scratch', 'sandbox-external');

console.log('=== Test Sandbox M6 : Nettoyage sécurisé & métriques exactes ===\n');

// 1. Préparation de la sandbox isolée
if (fs.existsSync(sandboxRoot)) {
  fs.rmSync(sandboxRoot, { recursive: true, force: true });
}
if (fs.existsSync(externalDir)) {
  fs.rmSync(externalDir, { recursive: true, force: true });
}

fs.mkdirSync(sandboxRoot, { recursive: true });
fs.mkdirSync(externalDir, { recursive: true });

// Création d'un fichier externe précieux hors sandbox
const preciousFilePath = path.join(externalDir, 'important-user-doc.docx');
const preciousContent = 'DONNEES PRECIEUSES UTILISATEUR NE PAS SUPPRIMER';
fs.writeFileSync(preciousFilePath, preciousContent, 'utf-8');

// Création des fichiers dans la sandbox
const file1 = path.join(sandboxRoot, 'temp_file_1.tmp');
const file2 = path.join(sandboxRoot, 'temp_file_2.log');
const nestedDir = path.join(sandboxRoot, 'nested_cache');
fs.mkdirSync(nestedDir, { recursive: true });
const file3 = path.join(nestedDir, 'cache_blob.dat');

const content1 = 'A'.repeat(1024 * 50); // 50 Ko
const content2 = 'B'.repeat(1024 * 150); // 150 Ko
const content3 = 'C'.repeat(1024 * 300); // 300 Ko

fs.writeFileSync(file1, content1);
fs.writeFileSync(file2, content2);
fs.writeFileSync(file3, content3);

const expectedTotalBytes = (50 + 150 + 300) * 1024; // 500 Ko = 512000 octets

// Création d'un fichier verrouillé avec verrou exclusif Windows FileShare.None
const lockedFilePath = path.join(sandboxRoot, 'locked_file.lock');
fs.writeFileSync(lockedFilePath, 'LOCKED_BY_EXTERNAL_PROCESS_EXCLUSIVE');

// Lancer un petit processus PowerShell qui verrouille le fichier avec FileShare.None
const lockProcess = spawn('powershell', [
  '-NoProfile',
  '-Command',
  `$stream = [System.IO.File]::Open('${lockedFilePath}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); Start-Sleep -Seconds 10; $stream.Close()`
]);

// Attendre 1 seconde que le verrou soit effectivement posé
await new Promise(r => setTimeout(r, 1200));

// Création d'une jonction Windows (mklink /J ne requiert pas le mode développeur)
const junctionPath = path.join(sandboxRoot, 'junction_to_external');
let junctionCreated = false;
try {
  const { execSync } = await import('child_process');
  execSync(`cmd /c mklink /J "${junctionPath}" "${externalDir}"`, { stdio: 'pipe' });
  junctionCreated = true;
  console.log('[OK] Jonction de répertoire Windows créée vers dossier externe hors sandbox');
} catch (e) {
  console.log('[INFO] Jonction non créée :', e.message);
}

// 2. Fonctions du moteur de nettoyage
function getSafeDirSize(dirPath) {
  let bytes = 0;
  let fileCount = 0;
  if (!fs.existsSync(dirPath)) return { bytes: 0, fileCount: 0, inaccessible: false };
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) return { bytes: 0, fileCount: 0, inaccessible: false };
  } catch {
    return { bytes: 0, fileCount: 0, inaccessible: true };
  }

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const lst = fs.lstatSync(full);
        if (lst.isSymbolicLink()) continue; // Sécurité M6 : non-suivi absolu
      } catch {
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(full);
          bytes += st.size;
          fileCount++;
        } catch {}
      }
    }
  }
  walk(dirPath);
  return { bytes, fileCount, inaccessible: false };
}

function cleanSafeDir(dirPath) {
  let deletedBytes = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  const errors = [];

  if (!fs.existsSync(dirPath)) return { deletedBytes, deletedCount, skippedCount, errors };

  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) return { deletedBytes, deletedCount, skippedCount, errors };
  } catch {
    return { deletedBytes, deletedCount, skippedCount, errors: [`Accès refusé au répertoire ${dirPath}`] };
  }

  function removeContents(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      errors.push(`Lecture impossible : ${current} (${e.code || e.message})`);
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const lst = fs.lstatSync(full);
        if (lst.isSymbolicLink()) {
          // Si c'est un lien symbolique ou une jonction, on supprime seulement le lien dans la sandbox
          // SANS JAMAIS descendre ni toucher la cible externe !
          try {
            if (lst.isDirectory()) {
              fs.rmdirSync(full); // Supprime la jonction sans toucher la cible
            } else {
              fs.unlinkSync(full);
            }
          } catch {}
          continue;
        }
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        removeContents(full);
        try {
          fs.rmdirSync(full);
        } catch {
          skippedCount++;
        }
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(full);
          const size = st.size;
          fs.unlinkSync(full);
          deletedBytes += size;
          deletedCount++;
        } catch (err) {
          // Fichier verrouillé par un processus actif ou droits insuffisants
          skippedCount++;
        }
      }
    }
  }

  removeContents(dirPath);
  return { deletedBytes, deletedCount, skippedCount, errors };
}

// 3. Mesure avant nettoyage
const preScan = getSafeDirSize(sandboxRoot);
console.log(`Scan pré-nettoyage : ${preScan.fileCount} fichiers, ${preScan.bytes} octets.`);

// 4. Exécution du nettoyage sécurisé
console.log('Exécution de cleanSafeDir sur la sandbox...');
const result = cleanSafeDir(sandboxRoot);

console.log('\n--- Résultats du nettoyage ---');
console.log(`Fichiers supprimés : ${result.deletedCount}`);
console.log(`Octets supprimés : ${result.deletedBytes} (attendu: ~${expectedTotalBytes})`);
console.log(`Fichiers ignorés/verrouillés : ${result.skippedCount}`);
console.log(`Erreurs enregistrées : ${result.errors.length}`);

// Libération du processus de verrou
try {
  lockProcess.kill('SIGKILL');
} catch {}

// 5. Assertions strictes
let allPassed = true;

// Assertion 1: Fichiers normaux supprimés
if (fs.existsSync(file1) || fs.existsSync(file2) || fs.existsSync(file3)) {
  console.error('[FAIL] Les fichiers temporaires normaux auraient dû être supprimés !');
  allPassed = false;
} else {
  console.log('[PASS] Fichiers temporaires normaux supprimés avec succès.');
}

// Assertion 2: Fichier externe hors périmètre 100% INTACT
if (!fs.existsSync(preciousFilePath)) {
  console.error('[FAIL CRITIQUE] Le fichier externe précieux a été supprimé !');
  allPassed = false;
} else {
  const readContent = fs.readFileSync(preciousFilePath, 'utf-8');
  if (readContent === preciousContent) {
    console.log('[PASS] Fichier externe hors périmètre 100% INTACT (la jonction / symlink n a PAS été suivie).');
  } else {
    console.error('[FAIL CRITIQUE] Le fichier externe a été altéré !');
    allPassed = false;
  }
}

// Assertion 3: Fichier verrouillé bien intercepté et compté
if (result.skippedCount >= 1 && fs.existsSync(lockedFilePath)) {
  console.log(`[PASS] Le fichier verrouillé a bien été intercepté et comptabilisé dans skippedCount (${result.skippedCount}) sans planter le moteur.`);
} else {
  console.error(`[FAIL] Le fichier verrouillé aurait dû être compté dans skippedCount.`);
  allPassed = false;
}

// Assertion 4: Précision des octets
if (Math.abs(result.deletedBytes - expectedTotalBytes) < 1000) {
  console.log(`[PASS] Comptage des octets exact : ${result.deletedBytes} octets.`);
} else {
  console.error(`[FAIL] Écart de comptage : ${result.deletedBytes} vs ${expectedTotalBytes}`);
  allPassed = false;
}

// Nettoyage final de la sandbox
try {
  fs.rmSync(sandboxRoot, { recursive: true, force: true });
  fs.rmSync(externalDir, { recursive: true, force: true });
} catch {}

if (allPassed) {
  console.log('\n>>> TOUTES LES ASSERTIONS DU TEST SANDBOX M6 ONT RÉUSSI AVEC SUCCÈS <<<');
  process.exit(0);
} else {
  console.error('\n>>> ÉCHEC DU TEST SANDBOX M6 <<<');
  process.exit(1);
}
