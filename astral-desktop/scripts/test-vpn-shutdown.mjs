import assert from 'node:assert';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { communityVpnEngine } from '../src/main/communityVpnEngine.ts';

console.log('=== Début des Tests du Mécanisme d\'Arrêt Windows (Gracieux vs Secours) ===\n');

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

class MockGracefulProcess extends EventEmitter {
  constructor(shouldIgnoreSignal = false) {
    super();
    this.pid = 88888;
    this.killed = false;
    this.hardKilled = false;
    this.shouldIgnoreSignal = shouldIgnoreSignal;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  kill(sig = 'SIGTERM') {
    this.killed = true;
    this.hardKilled = true;
    setImmediate(() => this.emit('exit', 1, sig));
    return true;
  }
}

const VALID_CONFIG = Buffer.from(`
client
dev tun
proto udp
remote 192.0.2.1 1194
remote-cert-tls server
<ca>
-----BEGIN CERTIFICATE-----
MIIB/zCCAaagAwIBAgIU
-----END CERTIFICATE-----
</ca>
`).toString('base64');

const mockServer = {
  id: 'mock-shutdown-node',
  hostname: 'mock-shutdown.opengw.net',
  ip: '192.0.2.1',
  country: 'France',
  countryCode: 'FR',
  pingMs: 20,
  speedMbps: 50,
  sessions: 5,
  uptimeHours: 10,
  qualityScore: 90,
  badges: [],
  configBase64: VALID_CONFIG,
  disclaimer: 'Relais de test',
  lastTested: Date.now(),
};

// ── TEST 1 : ARRÊT GRACIEUX SUR COMMANDE MANAGEMENT (SIGNAL SIGTERM) ──────────
await runTest('1. Arrêt gracieux : signal envoyé via management socket et sortie propre dans le délai', async () => {
  await communityVpnEngine.disconnect();
  communityVpnEngine.setCachedServersForTest([mockServer]);

  const mockProc = new MockGracefulProcess(false);
  let signalReceived = null;
  let mockSrv = null;

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '192.0.2.1',
    dnsTester: async () => true,
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', (c) => {
          const str = c.toString('utf8');
          if (str.includes('signal SIGTERM')) {
            signalReceived = 'SIGTERM';
            // OpenVPN réagit au signal et s'arrête gracieusement
            setImmediate(() => mockProc.emit('exit', 0));
          } else if (!sock.authenticated) {
            sock.authenticated = true;
            sock.write('SUCCESS: password is correct\n');
            setImmediate(() => sock.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n'));
          }
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  await communityVpnEngine.connect('mock-shutdown-node');
  assert.strictEqual(communityVpnEngine.getStatus().state, 'connected');

  // Déconnexion volontaire
  const res = await communityVpnEngine.disconnect();

  assert.strictEqual(signalReceived, 'SIGTERM', 'La commande signal SIGTERM doit être envoyée au socket de gestion');
  assert.strictEqual(res.stoppedGracefully, true, 'Le processus doit être qualifié d\'arrêté gracieusement');
  assert.strictEqual(res.restorationStatus, 'restauration_verifiee');
  assert.strictEqual(mockProc.hardKilled, false, 'Le hard kill de secours ne doit PAS avoir été appelé');
  assert.strictEqual(communityVpnEngine.getStatus().state, 'disconnected');

  if (mockSrv) mockSrv.close();
});

// ── TEST 2 : ARRÊT FORCÉ DE SECOURS LORSQUE LE SIGNAL EST IGNORÉ / TIMEOUT ───
await runTest('2. Arrêt forcé de secours : processus sourd au signal arrêté via fallback après délai', async () => {
  await communityVpnEngine.disconnect();
  communityVpnEngine.setCachedServersForTest([mockServer]);

  const mockProc = new MockGracefulProcess(true); // Ignore le signal de gestion
  let mockSrv = null;

  communityVpnEngine.setTestHooks({
    findBinary: () => 'C:\\OpenVPN\\bin\\openvpn.exe',
    ipFetcher: async () => '192.0.2.1',
    dnsTester: async () => true,
    spawn: (_bin, args) => {
      const port = parseInt(args[args.indexOf('--management') + 2], 10);
      mockSrv = net.createServer((sock) => {
        sock.on('error', () => {});
        sock.write('ENTER PASSWORD:\n');
        sock.on('data', () => {
          if (!sock.authenticated) {
            sock.authenticated = true;
            sock.write('SUCCESS: password is correct\n');
            setImmediate(() => sock.write('>STATE:1730000004,CONNECTED,SUCCESS,10.8.0.2,192.0.2.1\n'));
          }
          // Note : La commande signal SIGTERM est ignorée par le faux processus
        });
      });
      mockSrv.listen(port, '127.0.0.1');
      return mockProc;
    },
  });

  await communityVpnEngine.connect('mock-shutdown-node');
  assert.strictEqual(communityVpnEngine.getStatus().state, 'connected');

  // Déconnexion volontaire (le processus refusera de quitter suite au signal)
  const res = await communityVpnEngine.disconnect();

  assert.strictEqual(res.stoppedGracefully, false, 'Le processus ne doit pas être qualifié de gracieux');
  assert.strictEqual(res.restorationStatus, 'restauration_non_confirmee');
  assert.strictEqual(mockProc.hardKilled, true, 'Le kill de secours doit être invoqué suite au dépassement de délai');
  assert.strictEqual(communityVpnEngine.getStatus().state, 'disconnected');

  if (mockSrv) mockSrv.close();
});

// Réinitialisation finale des hooks
await communityVpnEngine.disconnect();
communityVpnEngine.setTestHooks(null);

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL 2 SHUTDOWN SEQUENCE TESTS PASSED\n');

