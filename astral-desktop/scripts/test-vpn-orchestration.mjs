/**
 * Tests d'Intégration & d'Orchestration du Moteur VPN (Lot 3 / Phase 13)
 * 
 * Valide le cycle de vie complet de connexion, de gestion d'erreur, d'annulation
 * et d'isolation d'état sans toucher aux interfaces réseau physiques de l'hôte :
 *  1. Préparation réussie (écritures temporaires isolées, configuration assainie)
 *  2. Moteur OpenVPN absent (refus propre sans crash)
 *  3. Profil OVPN rejeté par le parseur strict (rejet amont sans spawn)
 *  4. Erreur de lancement du processus OpenVPN (gestion propre de proc.on('error'))
 *  5. Authentification de gestion locale refusée (socket managé ERROR: password)
 *  6. Timeout avant connexion (relais silencieux, terminaison et nettoyage)
 *  7. Tunnel déclaré établi (transition fine vers verifying_tunnel puis connected)
 *  8. Contrôle post-connexion échoué (qualification séparée sans fausse promesse)
 *  9. Déconnexion volontaire (fermeture ordonnée, suppression de tous les fichiers temporaires)
 * 10. Arrêt inattendu du processus (crash OpenVPN capturé, aucun état fantôme)
 * 11. Annulation pendant la connexion (interruption immédiate en cours de préparation)
 * 12. Demande concurrente (verrou anti-collision, rejet immédiat du second appel)
 * 13. Événement tardif d'une ancienne tentative (rejet strict via attemptId)
 */

import assert from 'node:assert';
import net from 'node:net';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { communityVpnEngine } from '../src/main/communityVpnEngine.ts';

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

// Profil OVPN valide de référence
const VALID_OVPN_BASE64 = Buffer.from(`
client
dev tun
proto udp
remote 192.0.2.1 1194
resolv-retry infinite
nobind
persist-key
persist-tun
cipher AES-128-CBC
auth SHA1
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
MRUwEwYDVQQDEwxWUE4gR2F0ZSBDQTAeFw0xMzA2MjAwMDAwMDBaFw0zMzA2MjAw
-----END CERTIFICATE-----
</ca>
`).toString('base64');

// Profil OVPN malveillant (directive d'exécution non autorisée)
const REJECTED_OVPN_BASE64 = Buffer.from(`
client
dev tun
proto udp
remote 192.0.2.1 1194
up /bin/sh
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`).toString('base64');

const mockServerValid = {
  id: 'mock-valid-node',
  hostname: 'mock1.opengw.net',
  ip: '192.0.2.1',
  country: 'France',
  countryCode: 'FR',
  pingMs: 22,
  speedMbps: 50,
  sessions: 5,
  uptimeHours: 120,
  qualityScore: 90,
  badges: [],
  configBase64: VALID_OVPN_BASE64,
  disclaimer: 'Relais bénévole de test',
  lastTested: Date.now(),
};

const mockServerRejected = {
  id: 'mock-rejected-node',
  hostname: 'mock2.opengw.net',
  ip: '192.0.2.2',
  country: 'Japon',
  countryCode: 'JP',
  pingMs: 140,
  speedMbps: 20,
  sessions: 2,
  uptimeHours: 50,
  qualityScore: 60,
  badges: [],
  configBase64: REJECTED_OVPN_BASE64,
  disclaimer: 'Relais bénévole de test',
  lastTested: Date.now(),
};

// Simulation d'un processus enfant OpenVPN
class MockChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = 99999;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.killed = false;
  }
  kill(sig = 'SIGTERM') {
    this.killed = true;
    setImmediate(() => this.emit('exit', 0, sig));
    return true;
  }
}

// Fonction de réinitialisation complète entre chaque cas de test
async function resetEngine() {
  await communityVpnEngine.disconnect();
  communityVpnEngine.setTestHooks(null);
  communityVpnEngine.setCachedServersForTest([mockServerValid, mockServerRejected]);
}

console.log('=== Début des Tests d\'Orchestration VPN (Mock Processus & Sockets Locaux) ===\n');

// ── TEST 1 : PRÉPARATION RÉUSSIE ─────────────────────────────────────────────
await runTest('1. Préparation réussie : fichiers temporaires isolés & assainis', async () => {
  await resetEngine();
  let capturedConfigPath = null;
  let capturedArgs = [];
  const mockProc = new MockChildProcess();

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    spawn: (_bin, args) => {
      capturedConfigPath = args[1];
      capturedArgs = args;
      assert(fs.existsSync(capturedConfigPath), 'Le fichier de config temporaire doit exister lors du spawn');
      setImmediate(() => mockProc.emit('exit', 0));
      return mockProc;
    },
  });

  await communityVpnEngine.connect('mock-valid-node');

  assert(capturedConfigPath, 'Le chemin de configuration temporaire doit être capturé');
  assert(!fs.existsSync(capturedConfigPath), 'Le fichier OVPN temporaire doit être purgé à la fin de session');
  assert(capturedArgs.includes('--management'), 'Les arguments doivent inclure la gestion locale');
});

// ── TEST 2 : MOTEUR OPENVPN ABSENT ───────────────────────────────────────────
await runTest('2. Moteur OpenVPN absent : refus propre sans tentative de spawn', async () => {
  await resetEngine();
  communityVpnEngine.setTestHooks({
    findBinary: () => null,
    spawn: () => {
      throw new Error('Ne doit jamais être appelé si le binaire est absent !');
    },
  });

  const res = await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(res.success, false);
  assert(res.message.includes('OpenVPN officiel est requis'));

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'error');
  assert.strictEqual(st.openVpnInstalled, false);
});

// ── TEST 3 : PROFIL REJETÉ PAR LE PARSEUR STRICT ─────────────────────────────
await runTest('3. Profil OVPN rejeté par le parseur : arrêt immédiat amont', async () => {
  await resetEngine();
  let spawnCalled = false;
  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    spawn: () => {
      spawnCalled = true;
      return new MockChildProcess();
    },
  });

  const res = await communityVpnEngine.connect('mock-rejected-node');
  assert.strictEqual(res.success, false);
  assert(res.message.includes('rejeté par le parseur'), `Message: ${res.message}`);
  assert.strictEqual(spawnCalled, false, 'Aucun processus ne doit être lancé pour un profil non sécurisé');

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'error');
});

// ── TEST 4 : ERREUR DE LANCEMENT DU PROCESSUS (ENOENT / PERMISSIONS) ─────────
await runTest('4. Erreur de lancement (proc.on error) : transition en erreur et purge', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    spawn: () => {
      setImmediate(() => mockProc.emit('error', new Error('spawn ENOENT : binaire introuvable')));
      return mockProc;
    },
  });

  const res = await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(res.success, false);
  assert(res.message.includes('ENOENT'));

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'error');
  assert.strictEqual(st.activeServer, null);
});

// ── TEST 5 : AUTHENTIFICATION DE GESTION REFUSÉE ──────────────────────────────
await runTest('5. Échec d\'authentification de gestion locale : rejet et fermeture', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();
  let mockSrv = null;

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', () => {
          sock.write('ERROR: password verification failed\n');
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  const res = await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(res.success, false);
  assert(res.message.includes('gestion local') || res.message.includes('authentification'));

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'error');

  if (mockSrv) mockSrv.close();
});

// ── TEST 6 : TIMEOUT AVANT CONNEXION ─────────────────────────────────────────
await runTest('6. Timeout avant connexion : interruption propre après délai d\'attente', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    timeoutMs: 150,
    spawn: () => mockProc,
  });

  const startTime = Date.now();
  const res = await communityVpnEngine.connect('mock-valid-node');
  const elapsed = Date.now() - startTime;

  assert.strictEqual(res.success, false);
  assert(res.message.includes('Délai d\'attente'));
  assert(elapsed >= 140, 'Le timeout doit respecter le délai configuré');

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'error');
});

// ── TEST 7 : TUNNEL DÉCLARÉ ÉTABLI & SESSION CONFIRMÉE ─────────────────────────
await runTest('7. Tunnel déclaré établi : négociation complète et état connected', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();
  let mockSrv = null;
  const statesObserved = [];

  let ipCall = 0;
  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => {
      ipCall++;
      return ipCall === 1 ? '82.64.1.1' : '192.0.2.1';
    },
    dnsTester: async () => true,
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', (d) => {
          if (d.toString().includes('signal SIGTERM')) {
            sock.write('SUCCESS: signal SIGTERM thrown\n');
            setImmediate(() => mockProc.emit('exit', 0));
            return;
          }
          if (!sock.authSent) {
            sock.authSent = true;
            sock.write('SUCCESS: password is correct\n');
            setImmediate(() => {
              sock.write('>STATE:1730000001,WAIT,,,\n');
              sock.write('>STATE:1730000002,AUTH,,,\n');
              sock.write('>STATE:1730000003,ASSIGN_IP,,,\n');
              sock.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n');
            });
          }
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  const res = await communityVpnEngine.connect('mock-valid-node', (st) => {
    statesObserved.push(st.state);
  });

  assert.strictEqual(res.success, true);
  assert(statesObserved.includes('preparing'), 'Doit passer par preparing');
  assert(statesObserved.includes('connecting'), 'Doit passer par connecting');
  assert(statesObserved.includes('connected'), 'Doit atteindre connected');

  const finalStatus = communityVpnEngine.getStatus();
  assert.strictEqual(finalStatus.state, 'connected');
  assert.strictEqual(finalStatus.publicIp, '192.0.2.1');
  assert.strictEqual(finalStatus.publicIpVerified, true);
  assert.strictEqual(finalStatus.dnsVerified, true);
  assert.strictEqual(finalStatus.verificationDetails?.tunnelInterfaceUp, true);
  assert.strictEqual(finalStatus.verificationDetails?.ipv6Supported, false, 'IPv6 doit être notifié non supporté');

  await communityVpnEngine.disconnect();
  if (mockSrv) mockSrv.close();
});

// ── TEST 8 : CONTRÔLE POST-CONNEXION ÉCHOUÉ ──────────────────────────────────
await runTest('8. Contrôle post-connexion incomplet : qualification honnête des limites', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();
  let mockSrv = null;

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => null, // Échec de détection de l'IP publique
    dnsTester: async () => false, // Échec du test DNS
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', (d) => {
          if (d.toString().includes('signal SIGTERM')) {
            sock.write('SUCCESS: signal SIGTERM thrown\n');
            setImmediate(() => mockProc.emit('exit', 0));
            return;
          }
          if (!sock.authSent) {
            sock.authSent = true;
            sock.write('SUCCESS: password is correct\n');
            setImmediate(() => {
              sock.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n');
            });
          }
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  const res = await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(res.success, true, 'La session s\'établit techniquement');

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'connected');
  assert.strictEqual(st.publicIpVerified, false, 'IP publique ne doit PAS être déclarée vérifiée');
  assert.strictEqual(st.dnsVerified, false, 'DNS ne doit PAS être déclaré vérifié');
  assert(st.statusMessage.includes('IP non confirmée'));

  await communityVpnEngine.disconnect();
  if (mockSrv) mockSrv.close();
});

// ── TEST 9 : DÉCONNEXION VOLONTAIRE ──────────────────────────────────────────
await runTest('9. Déconnexion volontaire : arrêt du processus et purge des ressources', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();
  let mockSrv = null;

  let ipCall = 0;
  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => {
      ipCall++;
      return ipCall === 1 ? '82.64.1.1' : '192.0.2.1';
    },
    dnsTester: async () => true,
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', (d) => {
          if (d.toString().includes('signal SIGTERM')) {
            sock.write('SUCCESS: signal SIGTERM thrown\n');
            setImmediate(() => mockProc.emit('exit', 0));
            return;
          }
          if (!sock.authSent) {
            sock.authSent = true;
            sock.write('SUCCESS: password is correct\n');
            setImmediate(() => sock.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n'));
          }
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(communityVpnEngine.getStatus().state, 'connected');

  // Déconnexion explicite
  await communityVpnEngine.disconnect();

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'disconnected');
  assert.strictEqual(st.activeServer, null);
  assert.strictEqual(st.durationSeconds, 0);
  assert.strictEqual(st.bytesReceived, null);

  if (mockSrv) mockSrv.close();
});

// ── TEST 10 : ARRÊT INATTENDU DU PROCESSUS (CRASH OPENVPN) ───────────────────
await runTest('10. Arrêt inattendu du processus : transition en erreur sans session fantôme', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();
  let mockSrv = null;

  let ipCall = 0;
  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => {
      ipCall++;
      return ipCall === 1 ? '82.64.1.1' : '192.0.2.1';
    },
    dnsTester: async () => true,
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', (d) => {
          if (d.toString().includes('signal SIGTERM')) {
            sock.write('SUCCESS: signal SIGTERM thrown\n');
            setImmediate(() => mockProc.emit('exit', 0));
            return;
          }
          if (!sock.authSent) {
            sock.authSent = true;
            sock.write('SUCCESS: password is correct\n');
            setImmediate(() => sock.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n'));
          }
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(communityVpnEngine.getStatus().state, 'connected');

  // Simuler le crash inopiné du processus OpenVPN (code de sortie 1)
  mockProc.emit('exit', 1);

  // Attendre le traitement asynchrone
  await new Promise((r) => setTimeout(r, 60));

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'error', 'L\'état doit devenir error suite au crash');
  assert(st.statusMessage.includes('Liaison interrompue inopinément'));
  assert.strictEqual(st.activeServer, null, 'Le serveur ne doit plus être actif');

  if (mockSrv) mockSrv.close();
});

// ── TEST 11 : ANNULATION PENDANT LA CONNEXION ────────────────────────────────
await runTest('11. Annulation pendant la connexion : résolution immédiate en échec propre', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    timeoutMs: 10000,
    spawn: () => mockProc,
  });

  const connectPromise = communityVpnEngine.connect('mock-valid-node');
  await new Promise((r) => setTimeout(r, 40));
  assert.strictEqual(communityVpnEngine.getStatus().state, 'connecting');

  // L'utilisateur clique sur Annuler / Déconnecter
  await communityVpnEngine.disconnect();

  const res = await connectPromise;
  assert.strictEqual(res.success, false);
  assert(res.message.includes('interrompue par l\'utilisateur') || res.message.includes('annulée'));

  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'disconnected');
  assert.strictEqual(mockProc.killed, true);
});

// ── TEST 12 : DEMANDE CONCURRENTE ────────────────────────────────────────────
await runTest('12. Demande concurrente : verrou anti-collision immédiat', async () => {
  await resetEngine();
  const mockProc = new MockChildProcess();

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    timeoutMs: 10000,
    spawn: () => mockProc,
  });

  const p1 = communityVpnEngine.connect('mock-valid-node');
  await new Promise((r) => setTimeout(r, 30));

  const p2 = await communityVpnEngine.connect('mock-valid-node');
  assert.strictEqual(p2.success, false);
  assert(p2.message.includes('déjà en cours'), `Rejet attendu, obtenu: ${p2.message}`);

  await communityVpnEngine.disconnect();
  await p1;
});

// ── TEST 13 : ÉVÉNEMENT TARDIF D'UNE ANCIENNE TENTATIVE ──────────────────────
await runTest('13. Événement tardif d\'une ancienne tentative : rejet strict via attemptId', async () => {
  await resetEngine();
  const proc1 = new MockChildProcess();
  let sock1 = null;
  let srv1 = null;

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '1.2.3.4',
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      srv1 = net.createServer((sock) => {
        sock1 = sock;
        sock.on('error', () => {});
      });
      srv1.listen(port, '127.0.0.1');
      return proc1;
    },
  });

  const p1 = communityVpnEngine.connect('mock-valid-node');
  await new Promise((r) => setTimeout(r, 40));
  await communityVpnEngine.disconnect();
  await p1;

  assert.strictEqual(communityVpnEngine.getStatus().state, 'disconnected');

  // Émission tardive d'un événement CONNECTED sur l'ancien socket
  if (sock1 && !sock1.destroyed) {
    sock1.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n');
  }

  await new Promise((r) => setTimeout(r, 60));

  // Le moteur ne doit PAS être passé en connected suite à cet événement obsolète
  const st = communityVpnEngine.getStatus();
  assert.strictEqual(st.state, 'disconnected', 'L\'événement obsolète ne doit pas altérer l\'état');

  if (srv1) srv1.close();
});

// Réinitialisation finale des hooks
await resetEngine();

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL 13 VPN ORCHESTRATION TESTS PASSED\n');
}
