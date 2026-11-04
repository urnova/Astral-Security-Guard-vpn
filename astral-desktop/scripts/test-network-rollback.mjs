/**
 * Tests Unitaires & Intégration du Moteur de Sauvegarde et Restauration DNS & TCP/IP
 * 
 * Valide les scénarios de rollback et de résilience sans modifier la configuration réseau de l'hôte :
 * 1. Capture initiale fidèle (Mode statique vs DHCP, adresses, ordre, adaptateur, autotuning, RSS, heuristiques)
 * 2. Sauvegarde avant modification (avec horodatage et protection stricte anti-écrasement)
 * 3. Modification réussie
 * 4. Détection et remontée d'erreur sur modification partielle
 * 5. Refus immédiat sans faux succès si non-élevé administrateur
 * 6. Restauration fidèle de l'état statique d'origine (pas de reset DHCP aveugle)
 * 7. Restauration fidèle du mode DHCP si c'était l'état d'origine
 * 8. Refus transparent de restauration si l'état d'origine est inconnu
 * 9. Persistance et relecture lors du relancement de l'application
 * 10. Résilience face à une modification extérieure survenue entre-temps
 */

import assert from 'assert';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name} :`, err.message);
    failed++;
  }
}

// ── Modèle de Gestionnaire de Rollback Réseau Contrôlé ─────────────────────────
class NetworkRollbackManager {
  constructor(initialProfile = {}) {
    this.profile = JSON.parse(JSON.stringify(initialProfile));
    this.simulatedSystemDns = {};
    this.simulatedSystemTcp = { autotuning: 'normal', rss: 'enabled', heuristics: 'disabled' };
    this.isAdmin = true;
    this.failCommand = null;
  }

  setAdmin(val) { this.isAdmin = val; }
  setFailCommand(cmd) { this.failCommand = cmd; }

  setSystemDns(adapter, isDhcp, dnsServers) {
    this.simulatedSystemDns[adapter] = { isDhcp, dnsServers: [...dnsServers] };
  }

  getSystemDns(adapter) {
    return this.simulatedSystemDns[adapter];
  }

  setSystemTcp(autotuning, rss, heuristics) {
    this.simulatedSystemTcp = { autotuning, rss, heuristics };
  }

  getSystemTcp() {
    return { ...this.simulatedSystemTcp };
  }

  getProfile() {
    return JSON.parse(JSON.stringify(this.profile));
  }

  // ── 1. Mutation DNS avec sauvegarde préalable ────────────────────────────────
  setDns(adapter, targetServers) {
    const current = this.simulatedSystemDns[adapter];
    if (!current) {
      return { success: false, error: 'Adaptateur non détecté' };
    }

    // Sauvegarde initiale si absente (Anti-écrasement)
    if (!this.profile.network) this.profile.network = {};
    if (!this.profile.network.dnsBackup) {
      this.profile.network.dnsBackup = {
        adapterName: adapter,
        isDhcp: current.isDhcp,
        dnsServers: [...current.dnsServers],
        family: 'IPv4',
        backedUpAt: new Date().toISOString(),
      };
    }

    if (this.failCommand === 'setDns') {
      return { success: false, error: 'Échec de la commande Set-DnsClientServerAddress' };
    }

    const isDhcp = targetServers === 'auto';
    const appliedServers = isDhcp ? [] : [...targetServers];
    this.simulatedSystemDns[adapter] = { isDhcp, dnsServers: appliedServers };

    // Enregistrement de l'état effectivement appliqué par Vanguard
    this.profile.network.lastAppliedDns = {
      adapterName: adapter,
      isDhcp,
      dnsServers: appliedServers,
      appliedAt: new Date().toISOString(),
    };

    return { success: true };
  }

  // ── 2. Restauration DNS (Avec protection anti-conflit extérieur) ─────────────
  restoreDns(adapter, options = {}) {
    const backup = this.profile.network?.dnsBackup;
    if (!backup) {
      return {
        success: false,
        error: 'Configuration d\'origine non disponible (aucune sauvegarde)',
      };
    }

    if (this.failCommand === 'restoreDns') {
      return { success: false, error: 'Erreur lors de la restauration DNS' };
    }

    // Si la lecture de l'état actuel échoue ou reste ambiguë, présomption de conflit
    if (this.failCommand === 'readDns') {
      if (!options.force) {
        return {
          success: false,
          conflict: true,
          reason: 'read_failed_or_ambiguous',
          message: 'Lecture de l\'état actuel impossible ou ambiguë : conflit potentiel présumé, restauration suspendue.',
          choices: ['keep_current', 'force_restore_initial'],
        };
      }
    }

    const current = this.simulatedSystemDns[adapter];
    if (!current && !options.force) {
      return {
        success: false,
        conflict: true,
        reason: 'read_failed_or_ambiguous',
        message: 'Adaptateur introuvable lors de la lecture : conflit potentiel présumé.',
        choices: ['keep_current', 'force_restore_initial'],
      };
    }

    // Comparaison avec le dernier état effectivement appliqué par Vanguard
    const lastApplied = this.profile.network?.lastAppliedDns;
    if (current && lastApplied && !options.force) {
      const matchDhcp = current.isDhcp === lastApplied.isDhcp;
      const matchServers = current.dnsServers.length === lastApplied.dnsServers.length &&
        current.dnsServers.every((s, i) => s === lastApplied.dnsServers[i]);

      if (!matchDhcp || !matchServers) {
        return {
          success: false,
          conflict: true,
          reason: 'external_mutation',
          current: { isDhcp: current.isDhcp, dnsServers: [...current.dnsServers] },
          lastApplied: { isDhcp: lastApplied.isDhcp, dnsServers: [...lastApplied.dnsServers] },
          initialBackup: { isDhcp: backup.isDhcp, dnsServers: [...backup.dnsServers] },
          message: 'Conflit détecté : la configuration a été modifiée en dehors de Vanguard.',
          choices: ['keep_current', 'force_restore_initial'],
        };
      }
    }

    // Restauration fidèle : Si le backup était statique, restaurer les IP exactes dans l'ordre !
    if (!backup.isDhcp && backup.dnsServers && backup.dnsServers.length > 0) {
      this.simulatedSystemDns[adapter] = {
        isDhcp: false,
        dnsServers: [...backup.dnsServers],
      };
      this.profile.network.lastAppliedDns = {
        adapterName: adapter,
        isDhcp: false,
        dnsServers: [...backup.dnsServers],
        appliedAt: new Date().toISOString(),
      };
      return {
        success: true,
        mode: 'static',
        restoredServers: [...backup.dnsServers],
      };
    } else {
      // Restauration DHCP
      this.simulatedSystemDns[adapter] = {
        isDhcp: true,
        dnsServers: [],
      };
      this.profile.network.lastAppliedDns = {
        adapterName: adapter,
        isDhcp: true,
        dnsServers: [],
        appliedAt: new Date().toISOString(),
      };
      return {
        success: true,
        mode: 'dhcp',
      };
    }
  }

  // ── 3. Calibrage TCP avec sauvegarde préalable ───────────────────────────────
  optimizeTcp() {
    if (!this.isAdmin) {
      return {
        success: false,
        error: 'Élévation administrateur requise pour calibrer la pile TCP/IP.',
      };
    }

    // Sauvegarde initiale si absente
    if (!this.profile.network) this.profile.network = {};
    if (!this.profile.network.tcpBackup) {
      this.profile.network.tcpBackup = {
        autotuning: this.simulatedSystemTcp.autotuning,
        rss: this.simulatedSystemTcp.rss,
        heuristics: this.simulatedSystemTcp.heuristics,
        backedUpAt: new Date().toISOString(),
      };
    }

    const errors = [];
    if (this.failCommand === 'tcpHeuristics') {
      errors.push('Paramètre RFC 1323 rejeté par le noyau Windows');
    } else {
      this.simulatedSystemTcp.heuristics = 'disabled';
    }

    this.simulatedSystemTcp.autotuning = 'normal';
    this.simulatedSystemTcp.rss = 'enabled';

    if (errors.length > 0) {
      return {
        success: false,
        error: `Erreur partielle : ${errors.join(', ')}`,
      };
    }

    this.profile.network.lastAppliedTcp = {
      autotuning: 'normal',
      rss: 'enabled',
      heuristics: 'disabled',
      appliedAt: new Date().toISOString(),
    };

    return { success: true, message: 'Pile TCP optimisée.' };
  }

  // ── 4. Restauration TCP (Avec protection anti-conflit extérieur) ─────────────
  restoreTcp(options = {}) {
    if (!this.isAdmin) {
      return {
        success: false,
        error: 'Élévation administrateur requise pour restaurer la pile TCP/IP.',
      };
    }

    const backup = this.profile.network?.tcpBackup;
    if (!backup) {
      return {
        success: false,
        error: 'Aucune sauvegarde TCP/IP trouvée dans le profil.',
      };
    }

    // Si la lecture TCP échoue ou est ambiguë, présomption de conflit
    if (this.failCommand === 'readTcp') {
      if (!options.force) {
        return {
          success: false,
          conflict: true,
          reason: 'read_failed_or_ambiguous',
          message: 'Lecture des paramètres TCP actuels impossible : conflit potentiel présumé.',
          choices: ['keep_current', 'force_restore_initial'],
        };
      }
    }

    const current = { ...this.simulatedSystemTcp };
    const lastApplied = this.profile.network?.lastAppliedTcp;
    if (lastApplied && !options.force) {
      const conflict = current.autotuning !== lastApplied.autotuning ||
        current.rss !== lastApplied.rss ||
        current.heuristics !== lastApplied.heuristics;

      if (conflict) {
        return {
          success: false,
          conflict: true,
          reason: 'external_mutation',
          current,
          lastApplied,
          initialBackup: backup,
          message: 'Conflit détecté : la pile TCP a été modifiée en dehors de Vanguard.',
          choices: ['keep_current', 'force_restore_initial'],
        };
      }
    }

    this.simulatedSystemTcp.autotuning = backup.autotuning;
    this.simulatedSystemTcp.rss = backup.rss;
    this.simulatedSystemTcp.heuristics = backup.heuristics;

    this.profile.network.lastAppliedTcp = {
      autotuning: backup.autotuning,
      rss: backup.rss,
      heuristics: backup.heuristics,
      appliedAt: new Date().toISOString(),
    };

    return {
      success: true,
      restoredValues: { ...this.simulatedSystemTcp },
    };
  }
}

console.log('\n=== Début des Tests de Rollback DNS & TCP/IP ===');

// ── Test 1 : Sauvegarde et Restauration Fidèle d'un DNS Statique (Sans reset DHCP aveugle)
runTest('1. Restauration fidèle d\'un DNS Statique d\'origine (Ordre et adresses exacts)', () => {
  const mgr = new NetworkRollbackManager();
  // Configuration d'origine de l'utilisateur : DNS d'entreprise fixe
  mgr.setSystemDns('Ethernet 1', false, ['10.0.0.1', '10.0.0.2']);

  // Mutation vers Cloudflare
  const setRes = mgr.setDns('Ethernet 1', ['1.1.1.1', '1.0.0.1']);
  assert.strictEqual(setRes.success, true);
  assert.deepStrictEqual(mgr.getSystemDns('Ethernet 1').dnsServers, ['1.1.1.1', '1.0.0.1']);

  // Deuxième mutation vers Google (Test anti-écrasement de la sauvegarde d'origine)
  mgr.setDns('Ethernet 1', ['8.8.8.8', '8.8.4.4']);
  const backup = mgr.getProfile().network.dnsBackup;
  assert.deepStrictEqual(backup.dnsServers, ['10.0.0.1', '10.0.0.2'], 'La sauvegarde d\'origine doit être intacte');

  // Restauration
  const restoreRes = mgr.restoreDns('Ethernet 1');
  assert.strictEqual(restoreRes.success, true);
  assert.strictEqual(restoreRes.mode, 'static');
  assert.deepStrictEqual(mgr.getSystemDns('Ethernet 1').dnsServers, ['10.0.0.1', '10.0.0.2'], 'Le DNS d\'origine doit être restauré');
  assert.strictEqual(mgr.getSystemDns('Ethernet 1').isDhcp, false, 'Ne doit PAS avoir été basculé en DHCP aveugle');
});

// ── Test 2 : Restauration d'un DNS DHCP d'origine
runTest('2. Restauration fidèle d\'un DNS DHCP d\'origine', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemDns('Wi-Fi', true, []);

  // Mutation
  mgr.setDns('Wi-Fi', ['1.1.1.1']);
  assert.strictEqual(mgr.getSystemDns('Wi-Fi').isDhcp, false);

  // Restauration
  const restoreRes = mgr.restoreDns('Wi-Fi');
  assert.strictEqual(restoreRes.success, true);
  assert.strictEqual(restoreRes.mode, 'dhcp');
  assert.strictEqual(mgr.getSystemDns('Wi-Fi').isDhcp, true);
  assert.deepStrictEqual(mgr.getSystemDns('Wi-Fi').dnsServers, []);
});

// ── Test 3 : Refus de restauration si l'état d'origine est inconnu
runTest('3. Refus honnête de restauration si l\'état d\'origine est inconnu', () => {
  const mgr = new NetworkRollbackManager(); // Profil vierge
  mgr.setSystemDns('Ethernet', false, ['8.8.8.8']);

  const res = mgr.restoreDns('Ethernet');
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('non disponible'), 'Doit refuser d\'inventer un rollback');
});

// ── Test 4 : Remontée d'erreur lors d'un échec de modification DNS
runTest('4. Remontée d\'erreur lors d\'un échec de modification DNS', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemDns('Ethernet', true, []);
  mgr.setFailCommand('setDns');

  const res = mgr.setDns('Ethernet', ['1.1.1.1']);
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('Set-DnsClientServerAddress'));
});

// ── Test 5 : Contrôle d'élévation administrateur TCP
runTest('5. Contrôle d\'élévation administrateur TCP (Refus sans mutation)', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemTcp('disabled', 'disabled', 'enabled');
  mgr.setAdmin(false); // Non élevé

  const res = mgr.optimizeTcp();
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('Élévation administrateur requise'));
  // Vérifier qu'aucune valeur système n'a été altérée
  assert.deepStrictEqual(mgr.getSystemTcp(), { autotuning: 'disabled', rss: 'disabled', heuristics: 'enabled' });
});

// ── Test 6 : Remontée d'erreur sur modification TCP partielle
runTest('6. Remontée d\'erreur sur modification TCP partielle (Pas de faux succès)', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemTcp('disabled', 'disabled', 'enabled');
  mgr.setFailCommand('tcpHeuristics');

  const res = mgr.optimizeTcp();
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('Erreur partielle'));
});

// ── Test 7 : Restauration exacte des paramètres TCP personnalisés d'origine
runTest('7. Restauration exacte des paramètres TCP d\'origine (Pas de normal imposé)', () => {
  const mgr = new NetworkRollbackManager();
  // L'utilisateur avait un autotuning 'restricted', RSS 'disabled', heuristics 'enabled'
  mgr.setSystemTcp('restricted', 'disabled', 'enabled');

  // Optimisation réussie
  const optRes = mgr.optimizeTcp();
  assert.strictEqual(optRes.success, true);
  assert.strictEqual(mgr.getSystemTcp().autotuning, 'normal');
  assert.strictEqual(mgr.getSystemTcp().rss, 'enabled');

  // Restauration
  const restRes = mgr.restoreTcp();
  assert.strictEqual(restRes.success, true);
  assert.strictEqual(mgr.getSystemTcp().autotuning, 'restricted', 'Doit restaurer restricted, pas normal');
  assert.strictEqual(mgr.getSystemTcp().rss, 'disabled', 'Doit restaurer disabled, pas enabled');
  assert.strictEqual(mgr.getSystemTcp().heuristics, 'enabled', 'Doit restaurer enabled, pas disabled');
});

// ── Test 8 : Persistance et relecture lors du relancement de l'application
runTest('8. Persistance du profil et relecture lors du relancement', () => {
  const mgr1 = new NetworkRollbackManager();
  mgr1.setSystemDns('Ethernet', false, ['1.2.3.4']);
  mgr1.setDns('Ethernet', ['1.1.1.1']);
  const savedProfile = mgr1.getProfile();

  // Simuler fermeture et redémarrage de l'application avec le profil sauvegardé
  const mgr2 = new NetworkRollbackManager(savedProfile);
  assert.ok(mgr2.getProfile().network?.dnsBackup);
  assert.deepStrictEqual(mgr2.getProfile().network.dnsBackup.dnsServers, ['1.2.3.4']);

  // La restauration fonctionne immédiatement dans la nouvelle session
  mgr2.setSystemDns('Ethernet', false, ['1.1.1.1']);
  const restRes = mgr2.restoreDns('Ethernet');
  assert.strictEqual(restRes.success, true);
  assert.deepStrictEqual(mgr2.getSystemDns('Ethernet').dnsServers, ['1.2.3.4']);
});

// ── Test 9 : Détection de conflit lors d'une modification DNS par un tiers (Pas d'écrasement sans accord)
runTest('9. Détection de conflit DNS tiers : refus d\'écrasement automatique sans accord', () => {
  const mgr = new NetworkRollbackManager();
  // 1. État initial pré-Vanguard
  mgr.setSystemDns('Ethernet', false, ['192.168.1.1']);
  
  // 2. Vanguard applique Cloudflare
  mgr.setDns('Ethernet', ['1.1.1.1']);
  assert.deepStrictEqual(mgr.getSystemDns('Ethernet').dnsServers, ['1.1.1.1']);

  // 3. Un tiers ou l'utilisateur modifie le DNS manuellement vers Quad9
  mgr.setSystemDns('Ethernet', false, ['9.9.9.9']);

  // 4. Tentative de restauration standard : doit DÉTECTER le conflit et REFUSER d'écraser
  const res = mgr.restoreDns('Ethernet');
  assert.strictEqual(res.success, false, 'La restauration automatique doit être refusée');
  assert.strictEqual(res.conflict, true, 'Le statut de conflit doit être explicitement levé');
  assert.strictEqual(res.reason, 'external_mutation');
  assert.deepStrictEqual(res.choices, ['keep_current', 'force_restore_initial'], 'Doit proposer l\'arbitrage');

  // 5. Vérification cruciale : la configuration système modifiée par le tiers n'a PAS été écrasée !
  assert.deepStrictEqual(mgr.getSystemDns('Ethernet').dnsServers, ['9.9.9.9'], 'La configuration tierce doit être préservée');
  assert.deepStrictEqual(mgr.getProfile().network.dnsBackup.dnsServers, ['192.168.1.1'], 'La sauvegarde initiale doit être conservée');
});

// ── Test 10 : Arbitrage utilisateur : Conservation de la configuration actuelle
runTest('10. Arbitrage de conflit : refus de restauration et conservation de la configuration tierce', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemDns('Ethernet', false, ['192.168.1.1']);
  mgr.setDns('Ethernet', ['1.1.1.1']);
  mgr.setSystemDns('Ethernet', false, ['9.9.9.9']);

  // L'utilisateur choisit 'keep_current' (ne force pas la restauration)
  const res = mgr.restoreDns('Ethernet', { force: false });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.conflict, true);
  // L'état reste Quad9
  assert.deepStrictEqual(mgr.getSystemDns('Ethernet').dnsServers, ['9.9.9.9']);
});

// ── Test 11 : Arbitrage utilisateur : Restauration forcée après accord explicite
runTest('11. Arbitrage de conflit : Restauration forcée de l\'état d\'origine après accord explicite', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemDns('Ethernet', false, ['192.168.1.1']);
  mgr.setDns('Ethernet', ['1.1.1.1']);
  mgr.setSystemDns('Ethernet', false, ['9.9.9.9']);

  // L'utilisateur confirme explicitement vouloir restaurer l'état pré-Vanguard
  const res = mgr.restoreDns('Ethernet', { force: true });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.mode, 'static');
  assert.deepStrictEqual(mgr.getSystemDns('Ethernet').dnsServers, ['192.168.1.1'], 'L\'état d\'origine doit être restauré');
});

// ── Test 12 : Présomption de conflit si la lecture de l'état actuel échoue ou est ambiguë
runTest('12. Présomption de conflit si la lecture de l\'état actuel échoue ou est ambiguë', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemDns('Ethernet', false, ['10.0.0.1']);
  mgr.setDns('Ethernet', ['1.1.1.1']);

  // Simuler échec de lecture de l'adaptateur
  mgr.setFailCommand('readDns');

  const res = mgr.restoreDns('Ethernet');
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.conflict, true);
  assert.strictEqual(res.reason, 'read_failed_or_ambiguous');
  assert.ok(res.message.includes('conflit potentiel présumé'));
});

// ── Test 13 : Détection de conflit sur la pile TCP/IP lors d'une modification par un tiers
runTest('13. Détection de conflit sur la pile TCP/IP lors d\'une modification par un tiers', () => {
  const mgr = new NetworkRollbackManager();
  mgr.setSystemTcp('restricted', 'disabled', 'enabled');
  mgr.optimizeTcp(); // Passe à normal, enabled, disabled
  assert.strictEqual(mgr.getSystemTcp().autotuning, 'normal');

  // Un outil tiers (ex: optimiseur tiers ou commande manuelle netsh) modifie autotuning à 'highlyrestricted'
  mgr.setSystemTcp('highlyrestricted', 'enabled', 'disabled');

  // Tentative de restauration TCP standard
  const res = mgr.restoreTcp();
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.conflict, true);
  assert.strictEqual(res.reason, 'external_mutation');
  // Le réglage du tiers n'a pas été écrasé
  assert.strictEqual(mgr.getSystemTcp().autotuning, 'highlyrestricted');

  // Restauration forcée par choix explicite de l'utilisateur
  const forcedRes = mgr.restoreTcp({ force: true });
  assert.strictEqual(forcedRes.success, true);
  assert.strictEqual(mgr.getSystemTcp().autotuning, 'restricted');
  assert.strictEqual(mgr.getSystemTcp().rss, 'disabled');
  assert.strictEqual(mgr.getSystemTcp().heuristics, 'enabled');
});

console.log('-------------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('ROLLBACK TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL NETWORK ROLLBACK TESTS PASSED');
  process.exit(0);
}
