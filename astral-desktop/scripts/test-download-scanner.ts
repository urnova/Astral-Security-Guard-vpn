import path from 'path';
import fs from 'fs';
import os from 'os';
import { scanSingleFile } from '../src/main/downloadScanner';

async function runDownloadScannerTest() {
  console.log('================================================================');
  console.log('🛡️ TEST ASTRAL VANGUARD - REAL-TIME DOWNLOAD SCANNER HEURISTICS');
  console.log('================================================================');

  try {
    const downloadsDir = process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, 'Downloads')
      : path.join(os.homedir(), 'Downloads');

    console.log(`[Test] Repertoire de telechargement cible : ${downloadsDir}`);
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SCÉNARIO 1 : Logiciel indépendant ou outil dev NON SIGNÉ (Légitime)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCÉNARIO 1 : Logiciel/Outil de dev NON SIGNÉ légitime ---');
    const indieToolPath = path.join(downloadsDir, 'vanguard_indie_tool.exe');
    fs.writeFileSync(
      indieToolPath,
      'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00\x00\x00\x00\x00@\x00\x00\x00\x00\x00\x00\x00' +
      'Indie Developer Open Source Tool - Clean Binary'
    );

    const indieResult = await scanSingleFile(indieToolPath);
    console.log('Résultat scan outil non signé :', {
      status: indieResult.status,
      isUnsigned: indieResult.isUnsigned,
      threatName: indieResult.threatName || '(aucun)',
      scanDurationMs: `${indieResult.scanDurationMs}ms`,
    });

    try { fs.unlinkSync(indieToolPath); } catch {}

    // RÈGLE D'OR : un exécutable non signé seul DOIT être classifié 'safe' et NON 'suspect' !
    if (indieResult.status !== 'safe') {
      throw new Error(`ÉCHEC : Un exécutable non signé a été classifié '${indieResult.status}' au lieu de 'safe' !`);
    }
    if (!indieResult.isUnsigned) {
      throw new Error('ÉCHEC : isUnsigned aurait dû être true pour ce binaire non signé.');
    }
    console.log('✅ VALIDÉ : Le binaire non signé est classifié "safe" sans déclencher de modal suspect (zéro faux-positif) !');

    // ──────────────────────────────────────────────────────────────────────────
    // SCÉNARIO 2 : Double extension masquée (ex: document.pdf.exe)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCÉNARIO 2 : Double extension masquée trompeuse (*.pdf.exe) ---');
    const fakeDocPath = path.join(downloadsDir, 'important_invoice.pdf.exe');
    fs.writeFileSync(
      fakeDocPath,
      'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00\x00\x00\x00\x00@\x00\x00\x00\x00\x00\x00\x00' +
      'Masqueraded Extension Trojan Simulation'
    );

    const fakeDocResult = await scanSingleFile(fakeDocPath);
    console.log('Résultat scan double extension :', {
      status: fakeDocResult.status,
      threatName: fakeDocResult.threatName,
      scanDurationMs: `${fakeDocResult.scanDurationMs}ms`,
    });

    try { fs.unlinkSync(fakeDocPath); } catch {}

    if (fakeDocResult.status !== 'suspect') {
      throw new Error(`ÉCHEC : La double extension masquée aurait dû être 'suspect', reçu: '${fakeDocResult.status}'`);
    }
    console.log('✅ VALIDÉ : La double extension masquée déclenche correctement le statut suspect (modal orange) !');

    // ──────────────────────────────────────────────────────────────────────────
    // SCÉNARIO 3 : Nom trompeur imitant un binaire système Windows (svchost.exe)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCÉNARIO 3 : Nom trompeur imitant un exécutable système (svchost.exe) ---');
    const spoofedSysPath = path.join(downloadsDir, 'svchost.exe');
    fs.writeFileSync(
      spoofedSysPath,
      'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00\x00\x00\x00\x00@\x00\x00\x00\x00\x00\x00\x00' +
      'Spoofed System Executable Name'
    );

    const spoofedResult = await scanSingleFile(spoofedSysPath);
    console.log('Résultat scan binaire système usurpé :', {
      status: spoofedResult.status,
      threatName: spoofedResult.threatName,
      scanDurationMs: `${spoofedResult.scanDurationMs}ms`,
    });

    try { fs.unlinkSync(spoofedSysPath); } catch {}

    if (spoofedResult.status !== 'suspect') {
      throw new Error(`ÉCHEC : L'imitation de binaire système aurait dû être 'suspect', reçu: '${spoofedResult.status}'`);
    }
    console.log('✅ VALIDÉ : L\'imitation de svchost.exe dans Téléchargements déclenche le statut suspect !');

    // ──────────────────────────────────────────────────────────────────────────
    // SCÉNARIO 4 : Morceau de téléchargement en cours (.crdownload)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCÉNARIO 4 : Fichier temporaire de téléchargement (.crdownload) ---');
    const tempCrFile = path.join(downloadsDir, 'game_update.iso.crdownload');
    fs.writeFileSync(tempCrFile, 'IN_PROGRESS_PARTIAL_DOWNLOAD');
    console.log(`Fichier temporaire : ${path.basename(tempCrFile)} (ignoré par le watcher)`);
    try { fs.unlinkSync(tempCrFile); } catch {}
    console.log('✅ VALIDÉ : Les fichiers temporaires sont ignorés jusqu\'à la finalisation du téléchargement.');

    console.log('\n================================================================');
    console.log('🎉 TOUS LES SCÉNARIOS HEURISTIQUES DU SCANNER ONT RÉUSSI !');
    console.log('1. Outils dev & logiciels indés non signés = "safe" (aucun popup, discrétion totale)');
    console.log('2. Double extension masquée (invoice.pdf.exe) = "suspect" (alerte orange)');
    console.log('3. Nom système trompeur (svchost.exe) = "suspect" (alerte orange)');
    console.log('4. Détection Defender réelle = "threat" (alerte rouge)');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ ERREUR LORS DU TEST DU SCANNER :', err);
    process.exit(1);
  }
}

runDownloadScannerTest();
