# PRE-IMPLEMENTATION QUALITY GATE — ASTRAL VANGUARD v3.0

> **Date d'évaluation :** 4 octobre 2026  
> **Révision documentaire vérifiée :** Révision 3.3.1 (Corrigendum Pré-Implémentation & Portes Découplées)  
> **Objectif :** Valider formellement la conformité architecturale, légale et technique des spécifications avant d'autoriser le démarrage des travaux, et définir les conditions strictes de franchissement de chaque porte de sécurité.  
> **Résultat de la Vérification :** **STATUT GLOBAL : PASS CONDITIONNEL REV. 3.3.1 (SEULE LA PHASE 0 EST AUTORISÉE / IMPLÉMENTATION ACTIVE BLOQUÉE)**

---

## 1. CHECKLIST DE CONFORMITÉ PRÉ-IMPLÉMENTATION (REV. 3.3.1)

| # | Point de Contrôle Critique | Statut Rev 3.3.1 | Justification Technique et Références Documentaires |
|---|---|:---:|---|
| **1** | **Tag de Baseline Annoté & Traçabilité Git** | **CONFORME** | Tag annoté `v2.4.0-pre-v3-baseline` dérivé de la version 2.4.0 de `astral-desktop/package.json`. Conditionné à un arbre de travail propre (`git status --porcelain` vide). Enregistre : version package.json, SHA complet, branche source, date UTC, état du worktree et commandes exécutées. *(Réf: Plan Phase 0, PRD Décisions)* |
| **2** | **Suppression de `targetPath` en IPC & Découplage Phase 1** | **CONFORME** | Le contrat IPC de scan manuel ne prend plus aucun chemin. Dialogue natif OS (`dialog.showOpenDialog`) géré par le Main Process, avec `scanId` éphémère anti-TOCTOU. La correction de la suppression arbitraire et des injections PowerShell (Phase 1 / Gate 1A) est **totalement autonome et non bloquée par le résultat du spike Pipe**. *(Réf: PRD §4 Parcours 2, Archi §3.1, Plan Phase 1)* |
| **3** | **DACL Named Pipe Restreinte au Logon SID** | **CONFORME** | DACL programmatique Win32 accordant l'accès exclusivement au **Logon SID de session (`TokenLogonSid`)** et à **`LOCAL_SYSTEM`**. L'ACE au User SID est omise pour interdire tout accès depuis les autres sessions du même compte. Masque client minimal `0x00120183` excluant le bit `0x0004` (`FILE_CREATE_PIPE_INSTANCE`), `PIPE_REJECT_REMOTE_CLIENTS` et `FILE_FLAG_FIRST_PIPE_INSTANCE`. *(Réf: Archi §2.2-2.3, Plan Phase 3)* |
| **4** | **Spike Pipe : 9 Tests Obligatoires & Nonces In-Band** | **CONFORME** | Validation obligatoire de : même Logon SID (OK), autre Logon SID (rejet), autre utilisateur (rejet), distant (rejet), seconde instance (rejet), bit 0x0004 absent (OK), action inconnue (rejet), message expiré (rejet), PID différent (rejet). Aucun nonce ou secret dans la ligne de commande ni dans les logs (échange in-band sur le canal). *(Réf: Archi §2.2.4, Plan Phase 3)* |
| **5** | **Deux Politiques de Confiance pour `VanguardHelper.exe`** | **CONFORME** | Mode développement : chemin canonique, hash SHA-256 épinglé et manifeste signé. Mode production : signature Authenticode de confiance de l'éditeur si disponible, complétée par le hash du manifeste signé. Interdiction absolue d'installer silencieusement un certificat racine auto-signé. *(Réf: Archi §2.2.4, ThirdParty §4.2)* |
| **6** | **Diagnostic Local Déterministe (Sans Confusion LLM)** | **CONFORME** | Renommé partout en « Diagnostic local déterministe ». Moteur de règles expertes et de seuils télémétriques 100% hors ligne. Ne doit jamais être présenté comme un LLM ou une IA agentique. Une fonction générative reste une option expérimentale, marquée `Indisponible` si aucun tiers ne passe la qualification. *(Réf: PRD §5 Module 2.1, Archi §5.1)* |
| **7** | **Spike IA Strictement Borné & Revue ToS** | **CONFORME** | Maximum 3 requêtes fonctionnelles par endpoint, zéro test de charge agressif, zéro tentative d'épuisement de quota, zéro donnée réelle, zéro secret consigné dans les logs, et revue humaine séparée des ToS, de la conservation et des droits d'intégration. *(Réf: Archi §5.2, Plan Phase 8)* |
| **8** | **Authentification Serveur OpenVPN & Identité des Relais** | **CONFORME** | Directive `remote-cert-tls server` obligatoire dans le parser strict. Reconnaissance des limites du certificat partagé sur VPN Gate : application de `verify-x509-name` ou `peer-fingerprint` lorsque disponible, et affichage explicite obligatoire `Identité du relais non vérifiée indépendamment` en l'absence de liaison forte. *(Réf: PRD §5 Module 7.1, Archi §6.1-6.2, Plan Phase 13)* |
| **9** | **Suppression Définitive de Spectron au Profit de Playwright** | **CONFORME** | Spectron totalement éliminé au profit de Playwright Test officiel avec intégration native Electron (`_electron.launch()`). *(Réf: Archi §13, Plan Phase 16)* |
| **10** | **Résultats Bornés au Périmètre des Tests** | **CONFORME** | Élimination intégrale de toute prétention universelle ou absolue (« 100% des erreurs gérées », « risque nul », « zéro faille »). Résultats strictement circonscrits aux environnements et configurations testés. *(Réf: PRD §1.2/§5, Archi §1/§7/§13, Plan Sommaire/Phases)* |

---

## 2. MATRICE DE DÉBLOCAGE DÉCOUPLÉE (GATING MATRIX)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   MATRICE DE DÉBLOCAGE DE L'IMPLÉMENTATION (REV. 3.3.1)                │
├──────────┬─────────────────────────┬────────────────────────────┬──────────────────────┤
│ Porte    │ Périmètre Autorisé      │ Condition Bloquante        │ Action de Validation │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 0   │ Phase 0 uniquement      │ Approbation formelle de la │ Revue humaine        │
│          │ (Baseline, bench, spike)│ Révision 3.3.1             │ explicite            │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 1A  │ Phase 1                 │ Phase 0 validée            │ Tests unitaires verts│
│          │ (Anti-effacement, IPC)  │ (Indépendant du spike Pipe)│ scanId & pathGuard   │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 2   │ Phase 2                 │ Phase 1 validée            │ Audit grep sans      │
│          │ (Nettoyage simulations) │                            │ aucune simulation    │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 3   │ Phase 3                 │ Succès complet du spike    │ 9 tests Named Pipe   │
│          │ (Privileged Helper)     │ Named Pipe (Logon SID)     │ validés avec succès  │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 8   │ Phase 8 (Fournisseurs   │ Succès complet du spike IA │ ToS, quotas et       │
│          │ Cloud Optionnels)       │ borné et revue ToS         │ 3 requêtes réussies  │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 13  │ Phase 13                │ Parser OVPN strict validé  │ Rejet des scripts et │
│          │ (Tunnel VPN)            │ et Wintun 0.14.1 qualifié  │ statut relais vérifié│
└──────────┴─────────────────────────┴────────────────────────────┴──────────────────────┘
```

---

## 3. RÉSULTAT GLOBAL DU GATE

```
┌──────────────────────────────────────────────────────────┐
│         RÉSULTAT DE L'AUDIT PRÉ-IMPLÉMENTATION           │
│                                                          │
│        STATUT GLOBAL : PASS CONDITIONNEL (REV. 3.3.1)    │
│                                                          │
│   Les spécifications documentaires sont rigoureuses,     │
│   cohérentes et conformes aux meilleures pratiques.      │
│                                                          │
│   L'IMPLÉMENTATION ACTIVE DU CODE RESTE BLOQUÉE.         │
│   SEULE LA PHASE 0 (BASELINE & SPIKES) EST AUTORISÉE     │
│   PAR LE PROPRIÉTAIRE.                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 4. CONDITIONS ET LIVRABLES OBLIGATOIRES DE LA PHASE 0

### Périmètre Strictement Autorisé pour la Phase 0 :
- Vérification de l'état Git (`git status --porcelain`).
- Création du tag annoté `v2.4.0-pre-v3-baseline` sur le commit audité propre.
- Création de la branche `refactor/v3-baseline`.
- Exécution en lecture seule des tests existants.
- Exécution du build existant (`npm run build`).
- Création du script de vérification d'environnement `scripts/verify-env.mjs`.
- Création et exécution des deux spikes isolés dans `scratch/` :
  - `scratch/spike-pipe-security.ps1`
  - `scratch/spike-ai-qualification.mjs`
- Création des 4 rapports obligatoires de Phase 0.

### Interdictions Strictes de Phase 0 :
- Aucun changement dans `astral-desktop/src/`.
- Aucun changement fonctionnel de l'application.
- Aucun téléchargement ou ajout de binaire.
- Aucune nouvelle dépendance de production.
- Aucun lancement automatique de la Phase 1.
- Arrêt obligatoire à la fin de la Phase 0 avec demande d'une nouvelle autorisation.

### Les 4 Livrables de Phase 0 :
1. `PHASE_0_EXECUTION_REPORT.md`
2. `PHASE_0_BASELINE_MANIFEST.json`
3. `PHASE_0_PIPE_SPIKE_REPORT.md`
4. `PHASE_0_AI_SPIKE_REPORT.md`
