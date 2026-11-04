/**
 * Tests d'Intégration & de Robustesse de l'Exécuteur Speedtest
 * 
 * Valide le comportement réel du moteur SpeedtestExecutor sur un serveur HTTP local contrôlé :
 * - Téléchargement réussi
 * - Envoi réussi
 * - Phase partielle (Download réussi, Upload échoué)
 * - Serveur inaccessible / Port fermé
 * - Réponse HTTP 500
 * - Connexion interrompue brutalement
 * - Requête bloquée / Timeout
 * - Annulation immédiate et fermeture de tous les sockets et timers
 * - Verrouillage anti-concurrence
 * - Collecte réelle de la latence sous charge (Bufferbloat) et gestion des valeurs manquantes
 */

import http from 'http';
import assert from 'assert';
import { SpeedtestExecutor } from '../src/main/speedtestEngine.ts';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} :`, err.message);
    failed++;
  }
}

// Création d'un serveur HTTP local contrôlé sur port éphémère
function createMockServer() {
  let simulatedErrorMode = 'normal'; // 'normal', '500', 'hang', 'destroy'
  let bytesReceivedOnUpload = 0;

  const server = http.createServer((req, res) => {
    if (simulatedErrorMode === '500') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    if (simulatedErrorMode === 'hang') {
      // Ne répond jamais pour tester le timeout
      return;
    }

    if (simulatedErrorMode === 'destroy') {
      req.socket.destroy();
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/down')) {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '1048576', // 1 Mo
      });
      // Envoyer 1 Mo par morceaux de 64 Ko
      const chunk = Buffer.alloc(64 * 1024, 0xAA);
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if (count <= 16) {
          res.write(chunk);
        } else {
          clearInterval(interval);
          res.end();
        }
      }, 10);

      req.on('close', () => {
        clearInterval(interval);
      });
      return;
    }

    if (req.method === 'POST' && req.url?.startsWith('/up')) {
      req.on('data', (c) => {
        bytesReceivedOnUpload += c.length;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: bytesReceivedOnUpload }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    server,
    setMode: (mode) => { simulatedErrorMode = mode; },
    getUploadBytes: () => bytesReceivedOnUpload,
    resetUploadBytes: () => { bytesReceivedOnUpload = 0; },
  };
}

async function main() {
  console.log('\n=== Début des Tests de l\'Exécuteur Speedtest (Serveur Local Contrôlé) ===');

  const mock = createMockServer();
  await new Promise(resolve => mock.server.listen(0, '127.0.0.1', resolve));
  const port = mock.server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Serveur mock local actif sur ${baseUrl}\n`);

  try {
    // ── Test 1 : Téléchargement réussi ─────────────────────────────────────────
    await runTest('1. Téléchargement réussi via transport local contrôlé', async () => {
      mock.setMode('normal');
      const executor = new SpeedtestExecutor();
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 400,
        ulDurationMs: 300,
        sampleIntervalMs: 50,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(typeof outcome.result?.downloadMbps, 'number');
      assert.ok(outcome.result.downloadMbps > 0, 'Le débit descendant calculé doit être > 0');
      assert.strictEqual(executor.getRunning(), false, 'L\'état d\'exécution doit être libéré');
    });

    // ── Test 2 : Envoi (Upload) réussi ─────────────────────────────────────────
    await runTest('2. Envoi (Upload) réussi via transport local contrôlé', async () => {
      mock.setMode('normal');
      mock.resetUploadBytes();
      const executor = new SpeedtestExecutor();
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 300,
        ulDurationMs: 400,
        sampleIntervalMs: 50,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(typeof outcome.result?.uploadMbps, 'number');
      assert.ok(outcome.result.uploadMbps > 0, 'Le débit montant calculé doit être > 0');
      assert.ok(mock.getUploadBytes() > 0, 'Le serveur a réellement reçu des octets');
    });

    // ── Test 3 : Phase partielle (DL réussi, UL échoué) ─────────────────────────
    await runTest('3. Phase partielle : Téléchargement réussi mais envoi échoué', async () => {
      mock.setMode('normal');
      const executor = new SpeedtestExecutor();
      // On fournit un endpoint d'upload sur un port fermé
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: 'http://127.0.0.1:9/up', // Port fermé
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 300,
        ulDurationMs: 300,
        sampleIntervalMs: 50,
      });

      assert.strictEqual(outcome.success, true);
      assert.ok(outcome.result?.downloadMbps !== null && outcome.result.downloadMbps > 0);
      assert.strictEqual(outcome.result?.uploadMbps, null, 'L\'upload échoué doit être null (pas 0 ni 40% de DL)');
      assert.strictEqual(outcome.result?.report.isComplete, false, 'Le rapport global doit être incomplet');
      assert.strictEqual(outcome.result?.report.overallGrade, '—', 'La note globale doit être « — »');
    });

    // ── Test 4 : Serveur inaccessible (Port fermé) ────────────────────────────
    await runTest('4. Serveur distant inaccessible (Port fermé)', async () => {
      const executor = new SpeedtestExecutor();
      const outcome = await executor.run({
        downloadMirrors: ['http://127.0.0.1:9/down'], // Port inaccessible
        uploadEndpoint: 'http://127.0.0.1:9/up',
        probeHost: '127.0.0.1',
        probePort: 9, // Port fermé
        dlDurationMs: 200,
        ulDurationMs: 200,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.result?.downloadMbps, null, 'Le DL échoué doit être null');
      assert.strictEqual(outcome.result?.uploadMbps, null, 'L\'UL échoué doit être null');
      assert.strictEqual(outcome.result?.pingMs, null, 'Le ping doit être null');
    });

    // ── Test 5 : Réponse HTTP en erreur (HTTP 500) ────────────────────────────
    await runTest('5. Réponse HTTP 500 (Gestion propre sans crash)', async () => {
      mock.setMode('500');
      const executor = new SpeedtestExecutor();
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 200,
        ulDurationMs: 200,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.result?.downloadMbps, null, 'Aucun octet utile reçu -> null');
      assert.strictEqual(outcome.result?.uploadMbps, null);
    });

    // ── Test 6 : Connexion interrompue brutalement en cours de route ────────────
    await runTest('6. Connexion socket interrompue (Destroy prématuré)', async () => {
      mock.setMode('destroy');
      const executor = new SpeedtestExecutor();
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 200,
        ulDurationMs: 200,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(executor.getRunning(), false);
    });

    // ── Test 7 : Requête bloquée / Timeout contrôlé ────────────────────────────
    await runTest('7. Requête bloquée / Timeout client respecté', async () => {
      mock.setMode('hang');
      const executor = new SpeedtestExecutor();
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 250,
        ulDurationMs: 250,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(executor.getRunning(), false);
    });

    // ── Test 8 : Annulation immédiate (cancel) et fermeture des sockets ────────
    await runTest('8. Annulation immédiate (Sockets fermés, promesse résolue, flag cancelled)', async () => {
      mock.setMode('normal');
      const executor = new SpeedtestExecutor();

      const runPromise = executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 2000, // 2 secondes
        ulDurationMs: 2000,
      });

      // Annuler après 100ms
      await new Promise(r => setTimeout(r, 100));
      executor.cancel();

      const outcome = await runPromise;
      assert.strictEqual(outcome.cancelled, true, 'Le résultat doit être marqué annulé');
      assert.strictEqual(outcome.result, null, 'Aucun résultat complet ne doit être produit');
      assert.strictEqual(executor.getRunning(), false, 'Le verrou doit être relâché');
    });

    // ── Test 9 : Verrouillage anti-concurrence ──────────────────────────────────
    await runTest('9. Verrou anti-concurrence : Rejet immédiat de deux tests simultanés', async () => {
      mock.setMode('normal');
      const executor = new SpeedtestExecutor();

      const p1 = executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 400,
        ulDurationMs: 400,
      });

      // Lancement simultané immédiat
      const p2 = await executor.run();
      assert.strictEqual(p2.success, false);
      assert.ok(p2.error?.includes('déjà en cours'), 'Le second test doit être refusé');

      await p1;
      assert.strictEqual(executor.getRunning(), false);
    });

    // ── Test 10 : Collecte réelle de latence sous charge (Bufferbloat) ─────────
    await runTest('10. Collecte réelle de latence sous charge (Bufferbloat Down & Up)', async () => {
      mock.setMode('normal');
      const executor = new SpeedtestExecutor();

      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: port,
        dlDurationMs: 600,
        ulDurationMs: 600,
        sampleIntervalMs: 50,
      });

      assert.strictEqual(outcome.success, true);
      assert.ok(outcome.result !== null);
      // Sur loopback, idlePing et loadedDownPing sont tous deux mesurés
      assert.strictEqual(typeof outcome.result.pingMs, 'number');
      assert.strictEqual(typeof outcome.result.loadedDownPingMs, 'number');
      assert.strictEqual(typeof outcome.result.loadedUpPingMs, 'number');
      assert.strictEqual(typeof outcome.result.bufferbloatDownMs, 'number');
      assert.strictEqual(typeof outcome.result.bufferbloatUpMs, 'number');
      assert.ok(outcome.result.bufferbloatDownMs >= 0, 'Bufferbloat Down doit être >= 0 ms');
      assert.ok(outcome.result.bufferbloatUpMs >= 0, 'Bufferbloat Up doit être >= 0 ms');
    });

    // ── Test 11 : Traitement honnête si sondes bufferbloat impossibles ──────────
    await runTest('11. Traitement honnête si sondes bufferbloat impossibles -> Non mesuré', async () => {
      mock.setMode('normal');
      const executor = new SpeedtestExecutor();

      // Passer un probeHost fermé pour simuler l'absence de sondes
      const outcome = await executor.run({
        downloadMirrors: [`${baseUrl}/down`],
        uploadEndpoint: `${baseUrl}/up`,
        probeHost: '127.0.0.1',
        probePort: 9, // Port fermé
        dlDurationMs: 300,
        ulDurationMs: 300,
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.result?.bufferbloatDownMs, null, 'Doit être null sans fallback');
      assert.strictEqual(outcome.result?.bufferbloatUpMs, null, 'Doit être null sans fallback');
      assert.strictEqual(outcome.result?.report.stability.status, 'missing');
      assert.strictEqual(outcome.result?.report.stability.grade, null);
    });

  } finally {
    mock.server.close();
  }

  console.log('-------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('SPEEDTEST EXECUTOR TESTS FAILED');
    process.exit(1);
  } else {
    console.log('ALL SPEEDTEST EXECUTOR TESTS PASSED');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
