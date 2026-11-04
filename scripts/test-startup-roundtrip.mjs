// scripts/test-startup-roundtrip.mjs
// Test d'aller-retour contrôlé pour M7 (Programmes au démarrage)
// Prouve la création, lecture, désactivation, sauvegarde JSON avec type REG_SZ, réactivation et comparaison exacte.

import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testJsonPath = path.join(projectRoot, 'scratch', 'test-disabled-startup.json');

console.log('=== Test Aller-Retour M7 : Désactivation & Restauration Registre ===\n');

const TEST_KEY_NAME = 'VanguardTestApp_Roundtrip';
const TEST_COMMAND = '"C:\\Windows\\notepad.exe" /test-arg-12345 --profile=vanguard';
const REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

// 1. Nettoyage préalable au cas où
try {
  cp.execFileSync('reg.exe', ['delete', REG_PATH, '/v', TEST_KEY_NAME, '/f'], { stdio: 'pipe' });
} catch {}
if (fs.existsSync(testJsonPath)) {
  fs.unlinkSync(testJsonPath);
}

// Fonction pour interroger la valeur exacte dans le registre
function queryKey(name) {
  try {
    const out = cp.execFileSync('reg.exe', ['query', REG_PATH, '/v', name], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = out.split('\r\n');
    for (const line of lines) {
      const match = line.match(/^\s{4}([^\s].*?)\s{4,}(REG_\w+)\s{4,}(.*)$/);
      if (match && match[1].trim() === name) {
        return { name: match[1].trim(), type: match[2].trim(), command: match[3].trim() };
      }
    }
  } catch {
    return null;
  }
  return null;
}

// 2. Étape 1 : Création de l'entrée de test dans HKCU
console.log(`[1] Création de l'entrée test [${TEST_KEY_NAME}] dans ${REG_PATH}...`);
cp.execFileSync('reg.exe', ['add', REG_PATH, '/v', TEST_KEY_NAME, '/t', 'REG_SZ', '/d', TEST_COMMAND, '/f']);

const initialQuery = queryKey(TEST_KEY_NAME);
if (!initialQuery) {
  console.error('[FAIL] Impossible de créer la clé de test dans le registre.');
  process.exit(1);
}
console.log(`[PASS] Clé créée : Type=${initialQuery.type}, Commande=${initialQuery.command}`);
if (initialQuery.command !== TEST_COMMAND || initialQuery.type !== 'REG_SZ') {
  console.error('[FAIL] La commande ou le type ne correspondent pas !');
  process.exit(1);
}

// 3. Étape 2 : Désactivation (Lecture, Enregistrement JSON, Suppression Registre)
console.log('\n[2] Désactivation du programme (Sauvegarde JSON et suppression du Registre)...');
const backupData = {
  [TEST_KEY_NAME.toLowerCase()]: {
    rawName: TEST_KEY_NAME,
    name: 'Vanguard Test Application',
    command: initialQuery.command,
    location: 'HKCU',
    regType: initialQuery.type,
  }
};
fs.writeFileSync(testJsonPath, JSON.stringify(backupData, null, 2), 'utf-8');

// Suppression du registre
cp.execFileSync('reg.exe', ['delete', REG_PATH, '/v', TEST_KEY_NAME, '/f']);

const disabledQuery = queryKey(TEST_KEY_NAME);
if (disabledQuery === null) {
  console.log('[PASS] Clé supprimée du registre avec succès (désactivée).');
} else {
  console.error('[FAIL] La clé est toujours présente dans le registre après désactivation !');
  process.exit(1);
}

// 4. Étape 3 : Réactivation (Relecture JSON, Restauration Registre)
console.log('\n[3] Réactivation du programme (Relecture JSON et écriture Registre)...');
const readBackup = JSON.parse(fs.readFileSync(testJsonPath, 'utf-8'));
const itemToRestore = readBackup[TEST_KEY_NAME.toLowerCase()];

if (!itemToRestore || !itemToRestore.command) {
  console.error('[FAIL] Les données de sauvegarde JSON sont invalides.');
  process.exit(1);
}

// Restauration dans le registre
cp.execFileSync('reg.exe', [
  'add',
  REG_PATH,
  '/v',
  itemToRestore.rawName,
  '/t',
  itemToRestore.regType || 'REG_SZ',
  '/d',
  itemToRestore.command,
  '/f'
]);

// 5. Étape 4 : Vérification et comparaison exacte post-restauration
console.log('\n[4] Vérification post-restauration dans le Registre Windows...');
const restoredQuery = queryKey(TEST_KEY_NAME);
if (!restoredQuery) {
  console.error('[FAIL] La clé n a pas pu être restaurée dans le registre.');
  process.exit(1);
}

console.log(`Clé restaurée : Type=${restoredQuery.type}`);
console.log(`Commande d'origine :  ${TEST_COMMAND}`);
console.log(`Commande restaurée : ${restoredQuery.command}`);

let allPassed = true;
if (restoredQuery.type !== 'REG_SZ') {
  console.error(`[FAIL] Type de registre altéré : ${restoredQuery.type} (attendu REG_SZ)`);
  allPassed = false;
}
if (restoredQuery.command !== TEST_COMMAND) {
  console.error('[FAIL] Altération de la commande ou des arguments lors de l aller-retour !');
  allPassed = false;
}

// 6. Nettoyage final
try {
  cp.execFileSync('reg.exe', ['delete', REG_PATH, '/v', TEST_KEY_NAME, '/f'], { stdio: 'pipe' });
  if (fs.existsSync(testJsonPath)) fs.unlinkSync(testJsonPath);
} catch {}

if (allPassed) {
  console.log('\n[PASS] Concordance 100% exacte : la commande, les arguments et le type REG_SZ ont été fidèlement préservés.');
  console.log('>>> ALLER-RETOUR REGISTRE M7 VALIDÉ AVEC SUCCÈS <<<');
  process.exit(0);
} else {
  console.error('\n>>> ÉCHEC DU TEST ALLER-RETOUR REGISTRE M7 <<<');
  process.exit(1);
}
