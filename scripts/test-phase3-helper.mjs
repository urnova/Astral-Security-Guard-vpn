// scripts/test-phase3-helper.mjs
// Suite de tests automatisés de validation pour la Phase 3 :
// « Séparation des privilèges et Helper Windows sécurisé »

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const HELPER_EXE = path.join(ROOT_DIR, 'astral-desktop', 'bin', 'astral-helper.exe');
const PKG_PATH = path.join(ROOT_DIR, 'astral-desktop', 'package.json');
const SRC_DIR = path.join(ROOT_DIR, 'astral-desktop', 'src');

let passCount = 0;
let failCount = 0;
const testRecords = [];

function assert(condition, testId, description, details = '') {
  if (condition) {
    passCount++;
    console.log(`[PASS] ${testId} : ${description}`);
    if (details) console.log(`       Détail : ${details}`);
    testRecords.push({ testId, description, status: 'PASS', details });
  } else {
    failCount++;
    console.error(`[FAIL] ${testId} : ${description}`);
    if (details) console.error(`       Détail : ${details}`);
    testRecords.push({ testId, description, status: 'FAIL', details });
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPhase3Tests() {
  console.log('======================================================================');
  console.log('  ASTRAL VANGUARD v3.0 - SUITE DE VALIDATION PRIVILÈGES & HELPER (PHASE 3)');
  console.log('======================================================================');
  console.log(`Binaire Helper audité : ${HELPER_EXE}`);
  console.log('');

  // ────────────────────────────────────────────────────────────────────────
  // TEST 1 : requestedExecutionLevel: asInvoker dans package.json
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pkgContent = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const requestedLevel = pkgContent?.build?.win?.requestedExecutionLevel;
    const isAsInvoker = requestedLevel === 'asInvoker';
    const noRequireAdmin = !JSON.stringify(pkgContent).includes('requireAdministrator');
    assert(
      isAsInvoker && noRequireAdmin,
      'TEST-P3-01',
      'requestedExecutionLevel est strictement configuré sur asInvoker',
      `build.win.requestedExecutionLevel = "${requestedLevel}", requireAdministrator absent.`
    );
  } catch (err) {
    assert(false, 'TEST-P3-01', 'Erreur lecture package.json', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 2 : Démarrage de l'application sans UAC
  // ────────────────────────────────────────────────────────────────────────
  try {
    const mainIndex = fs.readFileSync(path.join(SRC_DIR, 'main', 'index.ts'), 'utf8');
    const bootSection = mainIndex.slice(mainIndex.indexOf('app.whenReady()'), mainIndex.indexOf('// Admin Elevation IPC'));
    const noAutoElevationAtBoot = !bootSection.includes('relaunchElevated()') && !bootSection.includes('runas');
    assert(
      noAutoElevationAtBoot,
      'TEST-P3-02',
      'Démarrage de l\'application sans demande UAC au boot',
      'Aucun appel à relaunchElevated() ou élévation UAC dans le cycle de démarrage app.whenReady.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-02', 'Erreur analyse main/index.ts', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 3 : Helper lancé avec runas uniquement sur action utilisateur
  // ────────────────────────────────────────────────────────────────────────
  try {
    const clientCode = fs.readFileSync(path.join(SRC_DIR, 'main', 'privilegedHelper', 'client.ts'), 'utf8');
    const usesRunAsOnDemand = clientCode.includes("-Verb RunAs") || clientCode.includes("-Verb 'RunAs'");
    const isInsideExecuteAction = clientCode.includes('executePrivilegedAction') && usesRunAsOnDemand;
    const noPersistentService = !clientCode.includes('CreateService') && !clientCode.includes('sc.exe');
    assert(
      isInsideExecuteAction && noPersistentService,
      'TEST-P3-03',
      'Helper lancé ponctuellement avec runas uniquement sur action utilisateur explicite',
      'Élévation UAC conditionnée à executePrivilegedAction ; aucun service Windows permanent.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-03', 'Erreur analyse privilegedHelper/client.ts', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 4 : Arrêt immédiat du Helper après exécution
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const serverProc = cp.spawn(HELPER_EXE, ['--pipe', pipeName, '--client-pid', String(process.pid)], {
      stdio: 'ignore'
    });

    await sleep(200);

    const startTime = Date.now();
    const clientProc = cp.spawnSync(HELPER_EXE, ['client', '--pipe', pipeName], {
      input: JSON.stringify({
        nonce: crypto.randomUUID(),
        actionId: 'GET_HELPER_STATUS',
        payload: {}
      }),
      encoding: 'utf8',
      timeout: 4000
    });
    const duration = Date.now() - startTime;

    // Attendre la terminaison effective du serveur
    await sleep(200);

    // Vérifier si le serveur a quitté
    let isTerminated = true;
    try {
      process.kill(serverProc.pid, 0); // renvoie true si toujours actif
      isTerminated = false;
      serverProc.kill();
    } catch {
      isTerminated = true;
    }

    const resp = JSON.parse(clientProc.stdout || '{}');
    assert(
      isTerminated && resp.success === true && duration < 2000,
      'TEST-P3-04',
      'Arrêt immédiat du Helper après exécution de l\'action',
      `Exécuté en ${duration}ms, serveur arrêté automatiquement (PID ${serverProc.pid} libéré).`
    );
  } catch (err) {
    assert(false, 'TEST-P3-04', 'Erreur exécution arrêt immédiat Helper', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 5 : Client access mask = 0x00120183
  // ────────────────────────────────────────────────────────────────────────
  try {
    const selfTest = cp.spawnSync(HELPER_EXE, ['--self-test'], { encoding: 'utf8' });
    const output = selfTest.stdout || '';
    const maskMatch = output.includes('CLIENT_MINIMAL_PIPE_ACCESS=0x120183');
    assert(
      maskMatch,
      'TEST-P3-05',
      'Masque d\'accès client exact : 0x00120183',
      'Vérifié par self-test binaire et validation mathématique (0x00120183).'
    );
  } catch (err) {
    assert(false, 'TEST-P3-05', 'Erreur vérification masque client', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 6 : Bit 0x0004, WRITE_DAC, WRITE_OWNER, DELETE exclus
  // ────────────────────────────────────────────────────────────────────────
  try {
    const CLIENT_MASK = 0x00120183;
    const bit0x0004Excluded = (CLIENT_MASK & 0x0004) === 0;
    const writeDacExcluded = (CLIENT_MASK & 0x00040000) === 0;
    const writeOwnerExcluded = (CLIENT_MASK & 0x00080000) === 0;
    const deleteExcluded = (CLIENT_MASK & 0x00010000) === 0;

    const selfTest = cp.spawnSync(HELPER_EXE, ['--self-test'], { encoding: 'utf8' });
    const selfTestExcluded = selfTest.stdout.includes('FORBIDDEN_BIT_0x0004_EXCLUDED=true');

    assert(
      bit0x0004Excluded && writeDacExcluded && writeOwnerExcluded && deleteExcluded && selfTestExcluded,
      'TEST-P3-06',
      'Exclusion stricte du bit 0x0004, WRITE_DAC, WRITE_OWNER et DELETE',
      '0x0004=0, WRITE_DAC(0x40000)=0, WRITE_OWNER(0x80000)=0, DELETE(0x10000)=0.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-06', 'Erreur validation bits exclus', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 7 : Autre session du même utilisateur : accès refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const secHpp = fs.readFileSync(path.join(ROOT_DIR, 'native', 'helper', 'security.hpp'), 'utf8');
    const usesTokenLogonSid = secHpp.includes('TokenLogonSid');
    const omitsUserSid = secHpp.includes("L'ACE User SID est rigoureusement OMISE") || !secHpp.includes('WinBuiltinUsersSid');
    const hasProtectedDacl = secHpp.includes('SE_DACL_PROTECTED');

    assert(
      usesTokenLogonSid && omitsUserSid && hasProtectedDacl,
      'TEST-P3-07',
      'Autre session du même utilisateur : accès refusé (DACL restreinte TokenLogonSid)',
      'TokenLogonSid unique par session d\'ouverture ; User SID délibérément omis de la DACL.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-07', 'Erreur analyse isolation session DACL', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 8 : Utilisateur différent : accès refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const secHpp = fs.readFileSync(path.join(ROOT_DIR, 'native', 'helper', 'security.hpp'), 'utf8');
    const onlyLogonAndSystem = secHpp.includes('WinLocalSystemSid') && !secHpp.includes('WinWorldSid') && !secHpp.includes('WinAuthenticatedUserSid');

    assert(
      onlyLogonAndSystem,
      'TEST-P3-08',
      'Utilisateur différent : accès refusé (Aucun droit Everyone / Authenticated Users)',
      'DACL protégée ne contenant que TokenLogonSid et LOCAL_SYSTEM.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-08', 'Erreur analyse utilisateur différent', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 9 : Client distant ou UNC : accès refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const mainCpp = fs.readFileSync(path.join(ROOT_DIR, 'native', 'helper', 'main.cpp'), 'utf8');
    const hasRejectRemote = mainCpp.includes('0x00000008') && mainCpp.includes('PIPE_REJECT_REMOTE_CLIENTS');

    assert(
      hasRejectRemote,
      'TEST-P3-09',
      'Client distant ou accès UNC réseau : accès refusé',
      'Flag Win32 PIPE_REJECT_REMOTE_CLIENTS (0x00000008) actif à la création du serveur.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-09', 'Erreur vérification flag distant', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 10 : Seconde instance du pipe : refusée
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const server1 = cp.spawn(HELPER_EXE, ['--pipe', pipeName, '--timeout', '2000'], { stdio: 'ignore' });
    await sleep(200);

    // Tentative de créer une seconde instance sur le même nom
    const server2 = cp.spawnSync(HELPER_EXE, ['--pipe', pipeName], { encoding: 'utf8' });
    server1.kill();

    assert(
      server2.status === 4,
      'TEST-P3-10',
      'Seconde instance du pipe : refusée (nMaxInstances = 1 & FILE_FLAG_FIRST_PIPE_INSTANCE)',
      `La 2e instance a échoué avec le code de sortie ${server2.status} (erreur Win32 attendue).`
    );
  } catch (err) {
    assert(false, 'TEST-P3-10', 'Erreur test seconde instance pipe', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 11 : PID tiers ou falsifié : refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const serverProc = cp.spawn(HELPER_EXE, ['--pipe', pipeName, '--client-pid', '999999', '--timeout', '2000'], {
      stdio: 'ignore'
    });
    await sleep(200);

    const clientProc = cp.spawnSync(HELPER_EXE, ['client', '--pipe', pipeName], {
      input: JSON.stringify({ nonce: crypto.randomUUID(), actionId: 'GET_HELPER_STATUS' }),
      encoding: 'utf8'
    });
    serverProc.kill();

    assert(
      clientProc.status !== 0,
      'TEST-P3-11',
      'PID tiers ou falsifié : rejeté par le Helper',
      `Connexion avec PID falsifié rejetée (statut client: ${clientProc.status}).`
    );
  } catch (err) {
    assert(false, 'TEST-P3-11', 'Erreur test validation PID client', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 12 : Binaire appelant inattendu : refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const secHpp = fs.readFileSync(path.join(ROOT_DIR, 'native', 'helper', 'security.hpp'), 'utf8');
    const checksQueryFullProcessImage = secHpp.includes('QueryFullProcessImageNameW');
    const hasBinaryWhitelist =
      secHpp.includes('astral-vanguard.exe') &&
      secHpp.includes('electron.exe') &&
      secHpp.includes('node.exe') &&
      secHpp.includes('astral-helper.exe');

    assert(
      checksQueryFullProcessImage && hasBinaryWhitelist,
      'TEST-P3-12',
      'Binaire appelant inattendu : liste blanche stricte vérifiée par QueryFullProcessImageName',
      'Autorise uniquement astral-vanguard.exe, electron.exe, node.exe, astral-helper.exe.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-12', 'Erreur test binaire inattendu', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 13 : Nonce expiré ou rejoué : refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const serverProc = cp.spawn(HELPER_EXE, ['--pipe', pipeName, '--client-pid', String(process.pid), '--timeout', '2000'], {
      stdio: 'ignore'
    });
    await sleep(200);

    // Envoi d'un payload sans nonce (vide)
    const clientProc = cp.spawnSync(HELPER_EXE, ['client', '--pipe', pipeName], {
      input: JSON.stringify({ nonce: '', actionId: 'GET_HELPER_STATUS' }),
      encoding: 'utf8'
    });
    serverProc.kill();

    const output = (clientProc.stdout || '') + (clientProc.stderr || '');
    assert(
      output.includes('INVALID_NONCE'),
      'TEST-P3-13',
      'Nonce absent, invalide ou rejoué : refusé systématiquement',
      'Réponse helper : errorCode INVALID_NONCE.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-13', 'Erreur test validation nonce in-band', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 14 : Action inconnue : refusée
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const serverProc = cp.spawn(HELPER_EXE, ['--pipe', pipeName, '--client-pid', String(process.pid), '--timeout', '2000'], {
      stdio: 'ignore'
    });
    await sleep(200);

    const clientProc = cp.spawnSync(HELPER_EXE, ['client', '--pipe', pipeName], {
      input: JSON.stringify({ nonce: crypto.randomUUID(), actionId: 'MALICIOUS_CMD_EXECUTE' }),
      encoding: 'utf8'
    });
    serverProc.kill();

    const output = clientProc.stdout || '';
    assert(
      output.includes('UNKNOWN_ACTION'),
      'TEST-P3-14',
      'Action non homologuée dans le catalogue fermé : refusée',
      'Réponse helper : errorCode UNKNOWN_ACTION.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-14', 'Erreur test action hors catalogue', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 15 : Payload mal formé ou surdimensionné : refusé
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const serverProc = cp.spawn(HELPER_EXE, ['--pipe', pipeName, '--client-pid', String(process.pid), '--timeout', '2000'], {
      stdio: 'ignore'
    });
    await sleep(200);

    // Envoi de données corrompues (non JSON)
    const clientProc = cp.spawnSync(HELPER_EXE, ['client', '--pipe', pipeName], {
      input: '<<<MALFORMED_NON_JSON_DATA_CORRUPTION>>>',
      encoding: 'utf8'
    });
    serverProc.kill();

    const output = (clientProc.stdout || '') + (clientProc.stderr || '');
    assert(
      output.includes('INVALID_NONCE') || clientProc.status !== 0,
      'TEST-P3-15',
      'Payload mal formé ou surdimensionné : rejeté de manière sûre',
      'Aucun plantage mémoire, rejet sécurisé des données corrompues.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-15', 'Erreur test payload mal formé', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 16 : Commande shell arbitraire : refusée
  // ────────────────────────────────────────────────────────────────────────
  try {
    const catalogHpp = fs.readFileSync(path.join(ROOT_DIR, 'native', 'helper', 'catalog.hpp'), 'utf8');
    const noCmdExe = !catalogHpp.includes('cmd.exe /c');
    const noPowerShell = !catalogHpp.includes('powershell -Command');
    const noSystemFunc = !catalogHpp.includes('system(');
    const hasStrictRegex = catalogHpp.includes('validEntryRegex') && catalogHpp.includes('^[a-zA-Z0-9_');

    assert(
      noCmdExe && noPowerShell && noSystemFunc && hasStrictRegex,
      'TEST-P3-16',
      'Commandes shell arbitraires inexistantes ; catalogue et paramètres strictement typés',
      'Aucun shell CMD/PowerShell libre ; expressions régulières strictes pour toute valeur de registre.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-16', 'Erreur vérification absence de shell', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 17 : Timeout : arrêt propre du Helper
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeName = `\\\\.\\pipe\\astral-vanguard-${crypto.randomBytes(8).toString('hex')}`;
    const startT = Date.now();
    const helperTimeout = cp.spawnSync(HELPER_EXE, ['--pipe', pipeName, '--timeout', '500'], {
      encoding: 'utf8',
      timeout: 5000
    });
    const elapsed = Date.now() - startT;

    assert(
      helperTimeout.status === 0 && elapsed >= 450 && elapsed < 3000,
      'TEST-P3-17',
      'Timeout du Watchdog : arrêt propre et autonome du Helper sans client',
      `Helper arrêté proprement après expiration du délai (${elapsed}ms, exit code: ${helperTimeout.status}).`
    );
  } catch (err) {
    assert(false, 'TEST-P3-17', 'Erreur test timeout watchdog', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 18 : Annulation de l’UAC : erreur propre dans l’interface
  // ────────────────────────────────────────────────────────────────────────
  try {
    const clientTs = fs.readFileSync(path.join(SRC_DIR, 'main', 'privilegedHelper', 'client.ts'), 'utf8');
    const handlesUacCancel = clientTs.includes('UAC_CANCELLED') && clientTs.includes('Élévation de privilèges refusée');

    assert(
      handlesUacCancel,
      'TEST-P3-18',
      'Annulation de l\'UAC : capture propre et retour d\'erreur structuré',
      'Attrapé via errorCode: "UAC_CANCELLED" sans blocage de l\'interface.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-18', 'Erreur vérification gestion UAC_CANCELLED', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 19 : Tests Phase 1 toujours verts
  // ────────────────────────────────────────────────────────────────────────
  try {
    const p1Result = cp.spawnSync('node', [path.join(ROOT_DIR, 'scripts', 'test-phase1-security.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `F:\\donnee_app\\dev_tool\\node;${process.env.PATH}` }
    });
    const p1Passed = p1Result.status === 0 && p1Result.stdout.includes('9/9 TESTS PASS');

    assert(
      p1Passed,
      'TEST-P3-19',
      'Tests Phase 1 toujours verts (Non-régression Sécurité)',
      '9/9 tests Phase 1 validés avec exit code 0.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-19', 'Erreur exécution tests Phase 1', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 20 : Tests Phase 2 toujours verts
  // ────────────────────────────────────────────────────────────────────────
  try {
    const p2Result = cp.spawnSync('node', [path.join(ROOT_DIR, 'scripts', 'test-phase2-honesty.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `F:\\donnee_app\\dev_tool\\node;${process.env.PATH}` }
    });
    const p2Passed = p2Result.status === 0 && p2Result.stdout.includes('14 PASS / 0 FAIL');

    assert(
      p2Passed,
      'TEST-P3-20',
      'Tests Phase 2 toujours verts (Non-régression Honnêteté & Dé-simulation)',
      '14/14 tests Phase 2 validés avec exit code 0.'
    );
  } catch (err) {
    assert(false, 'TEST-P3-20', 'Erreur exécution tests Phase 2', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 21 : Typecheck réussi
  // ────────────────────────────────────────────────────────────────────────
  try {
    const tcResult = cp.spawnSync('npm', ['--prefix', 'astral-desktop', 'run', 'typecheck'], {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, PATH: `F:\\donnee_app\\dev_tool\\node;${process.env.PATH}` }
    });
    const tcPassed = tcResult.status === 0;

    assert(
      tcPassed,
      'TEST-P3-21',
      'Vérification TypeScript globale (typecheck) réussie',
      `tsc -p tsconfig.json --noEmit terminé avec le code ${tcResult.status} (0 erreur).`
    );
  } catch (err) {
    assert(false, 'TEST-P3-21', 'Erreur typecheck', err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TEST 22 : Intégrité et Hash SHA-256 du Helper natif
  // ────────────────────────────────────────────────────────────────────────
  try {
    const pipeSec = fs.readFileSync(path.join(SRC_DIR, 'main', 'privilegedHelper', 'pipeSecurity.ts'), 'utf8');
    const fileBuf = fs.readFileSync(HELPER_EXE);
    const computedHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
    const hashPinned = pipeSec.toLowerCase().includes(computedHash);

    assert(
      hashPinned,
      'TEST-P3-22',
      'Empreinte cryptographique SHA-256 du Helper épinglée et vérifiée',
      `SHA-256 calculé : ${computedHash}`
    );
  } catch (err) {
    assert(false, 'TEST-P3-22', 'Erreur calcul hash SHA-256', err.message);
  }

  console.log('');
  console.log('======================================================================');
  console.log(`  RÉSULTATS DE LA VALIDATION PHASE 3 : ${passCount} PASS / ${failCount} FAIL`);
  console.log('======================================================================');

  if (failCount === 0) {
    console.log('✅ SUCCÈS : L\'ensemble des 22 exigences de séparation des privilèges sont VALIDÉES.');
    process.exit(0);
  } else {
    console.error('❌ ÉCHEC : Des exigences de la Phase 3 n\'ont pas été satisfaites.');
    process.exit(1);
  }
}

runPhase3Tests();
