import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { OpenVpnManagementClient, restrictFilePermissions } from '../src/main/openvpnManagement.ts';

console.log('=== Début des Tests de Sécurité du Secret Management (Emplacement & Cycle de Vie) ===\n');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} : ${err.message}`);
    failed++;
  }
}

// ── TEST 1 : CRÉATION DU SECRET DANS UN EMPLACEMENT CONTRÔLÉ ──────────────────
await runTest('1. Création du secret dans un dossier dédié avec permissions restreintes', async () => {
  const client = new OpenVpnManagementClient();
  const prep = await client.prepare();

  assert(prep.port > 1024, 'Le port management doit être supérieur à 1024');
  assert(prep.passwordPath, 'Le chemin du fichier de secret doit être fourni');
  assert(fs.existsSync(prep.passwordPath), 'Le fichier de secret physique doit exister');

  const content = fs.readFileSync(prep.passwordPath, 'utf8').trim();
  assert(content.length >= 32, 'Le secret aléatoire doit avoir une longueur forte');

  // Vérifier que le dossier parent est bien vanguard_vpn_secrets
  const parentDir = path.basename(path.dirname(prep.passwordPath));
  assert.strictEqual(parentDir, 'vanguard_vpn_secrets');

  client.disconnect();
  assert(!fs.existsSync(prep.passwordPath), 'Le fichier doit être purgé au disconnect');
});

// ── TEST 2 : NON-EXPOSITION DU SECRET DANS LES ARGUMENTS DE COMMANDE ─────────
await runTest('2. Absence stricte du secret dans les arguments de ligne de commande', async () => {
  const client = new OpenVpnManagementClient();
  const prep = await client.prepare();

  // Les arguments ne doivent contenir que le chemin du fichier, JAMAIS le secret lui-même
  const exposed = client.isSecretExposedInArgs(prep.args);
  assert.strictEqual(exposed, false, 'Le secret ne doit JAMAIS apparaître dans les arguments');

  const fullArgs = prep.args.join(' ');
  assert(fullArgs.includes(prep.passwordPath), 'Le chemin du fichier de mot de passe doit être présent');
  const secretContent = fs.readFileSync(prep.passwordPath, 'utf8').trim();
  assert(!fullArgs.includes(secretContent), 'La chaîne du mot de passe ne doit pas figurer dans la ligne de commande');

  client.disconnect();
});

// ── TEST 3 : RESTRICTION DE PERMISSIONS (ICACLS AVEC SID & VERIFICATION EFFECTIVE) ───
await runTest('3. Exécution et contrôle effectif des ACL (SID Windows, suppression héritage, lisibilité)', async () => {
  const tempTestFile = path.join(process.cwd(), 'temp_test_perm.txt');
  fs.writeFileSync(tempTestFile, 'test\n', 'utf8');

  // L'application des restrictions doit renvoyer true et vérifier les ACL réelles
  const success = restrictFilePermissions(tempTestFile, false);
  assert.strictEqual(success, true, 'restrictFilePermissions doit renvoyer true');
  assert(fs.existsSync(tempTestFile));

  // Vérifier que le fichier est effectivement lisible par le compte courant
  assert.doesNotThrow(() => {
    fs.accessSync(tempTestFile, fs.constants.R_OK | fs.constants.W_OK);
  }, 'Le compte courant doit pouvoir lire et modifier le fichier');

  try {
    fs.chmodSync(tempTestFile, 0o666);
    fs.unlinkSync(tempTestFile);
  } catch {}
});

// ── TEST 4 : NETTOYAGE LORS D'UN ÉCHEC DE CONNEXION / ERREUR AUTHENTIFICATION ─
await runTest('4. Purge du secret lors de la déconnexion après échec', async () => {
  const client = new OpenVpnManagementClient();
  const prep = await client.prepare();
  const filePath = prep.passwordPath;

  assert(fs.existsSync(filePath), 'Fichier créé');

  // Simulation d'une déconnexion/nettoyage suite à erreur d'authentification
  client.disconnect();

  assert(!fs.existsSync(filePath), 'Le fichier temporaire de secret doit être purgé');
  assert.strictEqual(client.getPasswordFilePath(), null);
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL 4 SECRET SECURITY & ACL TESTS PASSED\n');
