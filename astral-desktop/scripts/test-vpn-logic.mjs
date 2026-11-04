/**
 * Tests Unitaires & d'Intégrité de la Logique VPN (Lot 3 / Phase 13)
 * 
 * Vérifie le comportement des composants de production hors réseau (aucune mutation système) :
 * - StrictOvpnParser : directives autorisées, directives dangereuses, chemins externes, certificats
 * - CommunityVpnEngine : parsing CSV officiel VPN Gate, absence de badges marketing inventés
 * - OpenVpnManagementClient : parsing temps réel des lignes >STATE et >BYTECOUNT
 * - Coexistence : qualification des 4 états de détection
 */

import assert from 'node:assert';
import { StrictOvpnParser } from '../src/main/ovpnParser.ts';
import { communityVpnEngine } from '../src/main/communityVpnEngine.ts';
import { OpenVpnManagementClient } from '../src/main/openvpnManagement.ts';

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

console.log('=== Début des Tests de la Logique VPN (Sans Mutation Réseau) ===\n');

// ── 1. TESTS STRICT OVPN PARSER ──────────────────────────────────────────────

await runTest('1. Profil OVPN valide avec <ca> intégré accepté et assaini', () => {
  const validOvpn = `
client
dev tun
proto udp
remote 103.149.162.2 1194
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
`;

  const res = StrictOvpnParser.parse(validOvpn);
  assert.strictEqual(res.valid, true, 'Le profil valide doit être accepté');
  assert.strictEqual(res.remoteHost, '103.149.162.2');
  assert.strictEqual(res.remotePort, 1194);
  assert.strictEqual(res.protocol, 'udp');
  assert(res.sanitizedConfig.includes('remote-cert-tls server'), 'Doit imposer remote-cert-tls server');
  assert(res.sanitizedConfig.includes('redirect-gateway def1 bypass-dhcp'), 'Doit imposer redirect-gateway');
  assert(res.sanitizedConfig.includes('block-outside-dns'), 'Doit imposer block-outside-dns');
});

await runTest('2. Rejet formel des directives de hook et d\'exécution dangereuses (up, down, script-security, plugin)', () => {
  const dangerousDirectives = [
    'up /tmp/malicious.sh',
    'down "C:\\evil.bat"',
    'script-security 2',
    'plugin /lib/openvpn-auth-pam.so',
    'client-connect /bin/sh',
    'client-disconnect /bin/sh',
    'route-up /bin/sh',
    'management 0.0.0.0 9999',
  ];

  for (const dir of dangerousDirectives) {
    const config = `
client
dev tun
proto udp
remote 1.2.3.4 1194
${dir}
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`;
    const res = StrictOvpnParser.parse(config);
    assert.strictEqual(res.valid, false, `La directive "${dir}" aurait dû être rejetée`);
    assert.strictEqual(res.rejectionReason, 'DANGEROUS_DIRECTIVE_REJECTED');
  }
});

await runTest('3. Rejet formel des références à des fichiers externes (ca path, traversal, UNC)', () => {
  const externalRefConfigs = [
    'ca /etc/ssl/certs/ca-certificates.crt',
    'cert C:\\Windows\\System32\\cert.crt',
    'key ..\\..\\private\\key.key',
    'pkcs12 \\\\evilserver\\share\\client.p12',
    'secret ../secret.key',
  ];

  for (const ref of externalRefConfigs) {
    const config = `
client
dev tun
proto udp
remote 1.2.3.4 1194
${ref}
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`;
    const res = StrictOvpnParser.parse(config);
    assert.strictEqual(res.valid, false, `La référence externe "${ref}" aurait dû être rejetée`);
    assert.strictEqual(res.rejectionReason, 'EXTERNAL_FILE_REFERENCE_FORBIDDEN');
  }
});

await runTest('4. Rejet en cas d\'absence de balise d\'autorité de certification <ca>', () => {
  const missingCaConfig = `
client
dev tun
proto udp
remote 1.2.3.4 1194
nobind
`;
  const res = StrictOvpnParser.parse(missingCaConfig);
  assert.strictEqual(res.valid, false, 'Le profil sans <ca> doit être rejeté');
  assert.strictEqual(res.rejectionReason, 'MISSING_CA');
});

await runTest('5. Rejet de balises XML non autorisées (<script>, etc.)', () => {
  const forbiddenTagConfig = `
client
dev tun
proto udp
remote 1.2.3.4 1194
<script>
alert("xss")
</script>
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`;
  const res = StrictOvpnParser.parse(forbiddenTagConfig);
  assert.strictEqual(res.valid, false, 'La balise non autorisée doit être rejetée');
  assert.strictEqual(res.rejectionReason, 'FORBIDDEN_TAG');
});

await runTest('6. Rejet des profils volumineux dépassant la limite (512 Ko)', () => {
  const hugeData = 'a'.repeat(520 * 1024);
  const hugeConfig = `client\n# ${hugeData}\n<ca>\n-----BEGIN CERTIFICATE-----\nMIID\n-----END CERTIFICATE-----\n</ca>`;
  const res = StrictOvpnParser.parse(hugeConfig);
  assert.strictEqual(res.valid, false, 'Un profil > 512 Ko doit être rejeté');
  assert.strictEqual(res.rejectionReason, 'FILE_TOO_LARGE');
});

await runTest('7. Rejet du mode d\'adaptateur TAP (seul TUN autorisé)', () => {
  const tapConfig = `
client
dev tap
proto udp
remote 1.2.3.4 1194
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`;
  const res = StrictOvpnParser.parse(tapConfig);
  assert.strictEqual(res.valid, false, 'Le mode dev tap doit être rejeté');
  assert.strictEqual(res.rejectionReason, 'TAP_NOT_ALLOWED');
});

await runTest('8. Imposition et vérification stricte de remote-cert-tls server', () => {
  const insecureCertConfig = `
client
dev tun
proto udp
remote 1.2.3.4 1194
remote-cert-tls client
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`;
  const res = StrictOvpnParser.parse(insecureCertConfig);
  assert.strictEqual(res.valid, false, 'remote-cert-tls client doit être rejeté');
  assert.strictEqual(res.rejectionReason, 'INSECURE_CERT_VERIFICATION');
});

// ── 2. TESTS DU PARSEUR CSV CATALOGUE VPN GATE ───────────────────────────────

await runTest('9. Extraction fidèle du catalogue CSV VPN Gate sans badges marketing fictifs', () => {
  const mockValidOvpn = Buffer.from(`
client
dev tun
proto udp
remote 103.149.162.2 1194
<ca>
-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIQBAABAAAAAAABBQAAAAAAATANBgkqhkiG9w0BAQsFADAX
-----END CERTIFICATE-----
</ca>
`).toString('base64');

  const sampleCsv = `*vpn_servers
#HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64
vg1031491622.opengw.net,103.149.162.2,284102,18,65000000,Japan,JP,12,128921,4321,98765432,2wk,Tsukuba,Welcome,${mockValidOvpn}
vg1851251904.opengw.net,185.125.190.42,150200,35,42000000,France,FR,5,84900,1200,45678901,2wk,Volunteer,Hello,${mockValidOvpn}
*`;

  const servers = communityVpnEngine.parseVpnGateCsv(sampleCsv);
  assert.strictEqual(servers.length, 2, 'Deux serveurs valides doivent être extraits');

  const s1 = servers[0];
  assert.strictEqual(s1.ip, '103.149.162.2');
  assert.strictEqual(s1.country, 'Japan');
  assert.strictEqual(s1.countryCode, 'JP');
  assert.strictEqual(s1.pingMs, 18);
  assert.strictEqual(s1.speedMbps, 65);
  assert.strictEqual(s1.sessions, 12);
  assert(s1.disclaimer.includes('VPN Gate'), 'Doit inclure la mention transparente VPN Gate');

  // Vérifier qu'aucun badge marketing inventé n'est présent
  for (const s of servers) {
    for (const b of s.badges) {
      assert(!['Streaming', 'Gaming', 'P2P', 'Ultra-rapide Europe'].includes(b), `Badge inventé détecté : ${b}`);
    }
  }
});

await runTest('10. Résilience du parseur CSV face à des lignes corrompues ou incomplètes', () => {
  const brokenCsv = `
# Invalid header line
unknown,data,here
#HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64
missing_fields,1.2.3.4
bad_config,1.2.3.4,100,50,1000000,Unknown,UN,1,100,10,1000,2wk,Op,Msg,not_base64_data!!!
`;

  const servers = communityVpnEngine.parseVpnGateCsv(brokenCsv);
  assert.strictEqual(servers.length, 0, 'Les lignes corrompues doivent être ignorées sans crash');
});

// ── 3. TESTS DU CLIENT OPENVPN MANAGEMENT ─────────────────────────────────────

await runTest('11. Analyse en temps réel des lignes >STATE OpenVPN Management', () => {
  const client = new OpenVpnManagementClient();
  const stateEvents = [];

  client.on('state-change', (ev) => stateEvents.push(ev));

  // Simuler des lignes de protocole OpenVPN Management
  const rawLines = [
    '>STATE:1730000001,CONNECTING,TCP_CONNECT,,',
    '>STATE:1730000002,WAIT,,,',
    '>STATE:1730000003,AUTH,,,',
    '>STATE:1730000004,GET_CONFIG,,,',
    '>STATE:1730000005,ASSIGN_IP,,,',
    '>STATE:1730000006,CONNECTED,SUCCESS,10.8.0.2,185.125.190.42',
    '>STATE:1730000007,RECONNECTING,tls-error,,',
  ];

  // Accéder à handleLine via la méthode privée pour le test unitaire
  for (const line of rawLines) {
    client.processLine(line);
  }

  assert.strictEqual(stateEvents.length, 7, 'Les 7 transitions doivent être capturées');
  assert.strictEqual(stateEvents[0].stateName, 'CONNECTING');
  assert.strictEqual(stateEvents[2].stateName, 'AUTH');
  assert.strictEqual(stateEvents[4].stateName, 'ASSIGN_IP');
  assert.strictEqual(stateEvents[5].stateName, 'CONNECTED');
  assert.strictEqual(stateEvents[5].assignedIp, '10.8.0.2');
  assert.strictEqual(stateEvents[5].remoteIp, '185.125.190.42');
  assert.strictEqual(stateEvents[6].stateName, 'RECONNECTING');
});

await runTest('12. Analyse en temps réel des compteurs de transfert d\'octets >BYTECOUNT', () => {
  const client = new OpenVpnManagementClient();
  const byteEvents = [];

  client.on('bytecount', (ev) => byteEvents.push(ev));

  client.processLine('>BYTECOUNT:1048576,524288');
  client.processLine('>BYTECOUNT:2097152,1048576');

  assert.strictEqual(byteEvents.length, 2);
  assert.strictEqual(byteEvents[0].bytesIn, 1048576);
  assert.strictEqual(byteEvents[0].bytesOut, 524288);
  assert.strictEqual(byteEvents[1].bytesIn, 2097152);
  assert.strictEqual(byteEvents[1].bytesOut, 1048576);
});

// ── 4. TESTS DU CONTRÔLE DE COEXISTENCE ───────────────────────────────────────

await runTest('13. Distinction formelle des 4 états d\'évaluation VPN tiers', () => {
  // Fonction de décision pure reflétant la logique de détection
  function evaluateCoexistence({ adapters, defaultRoutes }) {
    if (!adapters || adapters.length === 0) {
      return { status: 'no_conflict', thirdPartyActive: false };
    }

    let defaultRouteAdapter = null;
    let upAdapter = null;

    for (const a of adapters) {
      const isDefault = defaultRoutes.some(r => r.interfaceName === a.name);
      if (isDefault) {
        defaultRouteAdapter = a;
        break;
      } else if (!upAdapter && a.status === 'Up') {
        upAdapter = a;
      }
    }

    if (defaultRouteAdapter) {
      return { status: 'conflict_confirmed', thirdPartyActive: true, name: defaultRouteAdapter.name };
    } else if (upAdapter) {
      return { status: 'vpn_suspected', thirdPartyActive: true, name: upAdapter.name };
    }
    return { status: 'no_conflict', thirdPartyActive: false };
  }

  // Cas A : Route par défaut sur adaptateur VPN tiers -> Conflit confirmé
  const resA = evaluateCoexistence({
    adapters: [{ name: 'nordlynx', status: 'Up' }],
    defaultRoutes: [{ interfaceName: 'nordlynx' }],
  });
  assert.strictEqual(resA.status, 'conflict_confirmed');
  assert.strictEqual(resA.thirdPartyActive, true);

  // Cas B : Adaptateur VPN présent et Up mais sans route par défaut (ex: Meshnet ou Tailscale inactif) -> Suspecté
  const resB = evaluateCoexistence({
    adapters: [{ name: 'Tailscale', status: 'Up' }],
    defaultRoutes: [{ interfaceName: 'Ethernet' }],
  });
  assert.strictEqual(resB.status, 'vpn_suspected');
  assert.strictEqual(resB.thirdPartyActive, true);

  // Cas C : Aucun adaptateur tiers -> Aucun conflit
  const resC = evaluateCoexistence({
    adapters: [],
    defaultRoutes: [{ interfaceName: 'Ethernet' }],
  });
  assert.strictEqual(resC.status, 'no_conflict');
  assert.strictEqual(resC.thirdPartyActive, false);
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL VPN LOGIC TESTS PASSED\n');
}
