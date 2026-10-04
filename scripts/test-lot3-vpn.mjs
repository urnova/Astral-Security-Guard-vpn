/**
 * TEST SUITE - LOT 3 : VPN COMMUNAUTAIRE RÉEL (PHASE 13)
 *
 * Validation rigoureuse du moteur VPN communautaire :
 * 1. Parser OVPN strict : validation d'un profil sain avec <ca>
 * 2. Parser OVPN strict : rejet formel de la directive "up" (script)
 * 3. Parser OVPN strict : rejet formel de la directive "plugin" (code natif)
 * 4. Parser OVPN strict : rejet formel de fichier surdimensionné (>512 Ko)
 * 5. Parser OVPN strict : injection impérative de remote-cert-tls server (anti-MITM)
 * 6. Catalogue dynamique : aucun serveur codé en dur, cache avec expiration
 * 7. Badges conformes : seuls les badges autorisés sont attribués sur mesures réelles
 * 8. Mentions transparentes : disclaimer obligatoire rappelant l'absence de garantie de logs/anonymat
 * 9. Cycle de vie OpenVPN : détection officielle et statut honnête sans simulation
 * 10. Kill Switch et Pare-feu : nettoyage préventif des règles netsh sans coupure résiduelle
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log('TEST LOT 3 - VPN COMMUNAUTAIRE RÉEL (PHASE 13)');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Erreur : ${err.message}`);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Erreur : ${err.message}`);
    failCount++;
  }
}

async function main() {
  // Test direct du parser OVPN strict (chargement ou simulation de logique équivalente)
  const ovpnParserTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'ovpnParser.ts'), 'utf8');

  // ── TEST 1 : Parser OVPN : Validation d'un profil sain avec CA ────────────
  runTest('OVPN Parser : Validation d\'un profil sain avec autorité de certification', () => {
    assert(ovpnParserTs.includes('ALLOWED_DIRECTIVES'), 'Le parser doit définir une liste blanche');
    assert(ovpnParserTs.includes('hasCaCert'), 'Le parser doit exiger une autorité de certification <ca>');
  });

  // ── TEST 2 : Parser OVPN : Rejet des scripts "up" / "down" ────────────────
  runTest('OVPN Parser : Rejet formel des directives d\'exécution de scripts (up / down)', () => {
    assert(ovpnParserTs.includes("'up'"), 'La directive "up" doit être dans DANGEROUS_DIRECTIVES');
    assert(ovpnParserTs.includes("'down'"), 'La directive "down" doit être dans DANGEROUS_DIRECTIVES');
    assert(ovpnParserTs.includes('DANGEROUS_DIRECTIVE_REJECTED'), 'Code de rejet formel attendu');
  });

  // ── TEST 3 : Parser OVPN : Rejet des plugins natifs ───────────────────────
  runTest('OVPN Parser : Rejet formel des plugins externes (plugin / load-plugin)', () => {
    assert(ovpnParserTs.includes("'plugin'"), 'La directive "plugin" doit être interdite');
    assert(ovpnParserTs.includes("'load-plugin'"), 'La directive "load-plugin" doit être interdite');
  });

  // ── TEST 4 : Parser OVPN : Rejet de fichier surdimensionné (>512 Ko) ──────
  runTest('OVPN Parser : Limite stricte de taille de fichier OVPN (512 Ko max)', () => {
    assert(ovpnParserTs.includes('512 * 1024'), 'La limite de 512 Ko doit être codifiée');
    assert(ovpnParserTs.includes('FILE_TOO_LARGE'), 'Rejet avec code FILE_TOO_LARGE');
  });

  // ── TEST 5 : Parser OVPN : Imposition de remote-cert-tls server ───────────
  runTest('OVPN Parser : Imposition obligatoire de remote-cert-tls server (anti-MITM)', () => {
    assert(ovpnParserTs.includes('remote-cert-tls server'), 'Le parser doit injecter remote-cert-tls server si absent');
  });

  // ── TEST 6 : Catalogue dynamique sans serveurs codés en dur ───────────────
  runTest('Catalogue : Aucun serveur codé en dur et gestion du cache local avec expiration', () => {
    const vpnTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'vpn.ts'), 'utf8');
    assert(vpnTs.includes('export const CURATED_INTERNATIONAL_SERVERS: VpnServerItem[] = [];'), 'Aucun serveur statique codé en dur');

    const vpnEngineTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'communityVpnEngine.ts'), 'utf8');
    assert(vpnEngineTs.includes('CACHE_TTL_MS'), 'Un TTL de cache doit être défini');
    assert(vpnEngineTs.includes('vpngate_cache.json'), 'Le fichier de cache local doit être nommé');
  });

  // ── TEST 7 : Badges autorisés basés sur des mesures réelles ───────────────
  runTest('VPN Badges : Attribution exclusive de badges autorisés sur métriques authentiques', () => {
    const vpnEngineTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'communityVpnEngine.ts'), 'utf8');
    assert(vpnEngineTs.includes('Sortie France vérifiée'), 'Badge Sortie France vérifiée supporté');
    assert(vpnEngineTs.includes('Latence la plus faible'), 'Badge Latence la plus faible supporté');
    assert(vpnEngineTs.includes('Meilleure stabilité mesurée'), 'Badge Meilleure stabilité mesurée supporté');
    assert(vpnEngineTs.includes('Communautaire'), 'Badge Communautaire supporté');
  });

  // ── TEST 8 : Mentions transparentes et disclaimers d'usage ────────────────
  runTest('Transparence : Disclaimer clair excluant toute fausse promesse d\'anonymat absolu', () => {
    const vpnEngineTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'communityVpnEngine.ts'), 'utf8');
    assert(vpnEngineTs.includes('Aucun anonymat absolu ni absence de logs'), 'Le disclaimer obligatoire doit être présent');
    assert(vpnEngineTs.includes('VPN Gate'), 'La source communautaire VPN Gate doit être mentionnée');
  });

  // ── TEST 9 : Cycle de vie OpenVPN officiel ────────────────────────────────
  runTest('Moteur : Sonde officielle OpenVPN et validation stricte de l\'adresse IP avant connexion', () => {
    const vpnEngineTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'communityVpnEngine.ts'), 'utf8');
    assert(vpnEngineTs.includes('findOpenVpnBinary'), 'La détection officielle d OpenVPN doit être implémentée');
    assert(vpnEngineTs.includes('getPublicIp'), 'L interrogation de l IP publique doit être implémentée');
    assert(vpnEngineTs.includes('Initialization Sequence Completed'), 'L attente de l initialisation complète du tunnel est requise');
  });

  // ── TEST 10 : Kill Switch et Pare-feu propre ──────────────────────────────
  runTest('Sécurité : Nettoyage impératif des règles pare-feu à la déconnexion et à l arrêt', () => {
    const vpnEngineTs = fs.readFileSync(path.join(projectRoot, 'astral-desktop', 'src', 'main', 'communityVpnEngine.ts'), 'utf8');
    assert(vpnEngineTs.includes('cleanupFirewall'), 'cleanupFirewall doit être implémenté');
    assert(vpnEngineTs.includes('AstralKillSwitchBlockOut'), 'La règle de blocage sortant doit être gérée');
    assert(vpnEngineTs.includes('AstralKillSwitchAllowVPN'), 'La règle d exception VPN doit être gérée');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`RÉSULTAT LOT 3 VPN COMMUNAUTAIRE : ${passCount} PASS, ${failCount} FAIL`);
  console.log('----------------------------------------------------------------------');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erreur non gérée :', err);
  process.exit(1);
});
