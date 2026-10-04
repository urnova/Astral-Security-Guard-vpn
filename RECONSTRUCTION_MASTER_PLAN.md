# RECONSTRUCTION MASTER PLAN — ASTRAL VANGUARD v3.0

> **Numéro de Révision :** 3.3.1 (Corrigendum Pré-Implémentation & Portes Découplées)  
> **Date :** 4 octobre 2026  
> **Statut :** Plan Directeur Opérationnel Validé Rev. 3.3.1 (Exécution Exclusif Phase 0 Autorisée)  
> **Principe Directeur :** Chaque phase est autonome, directement confiable à un agent de code ou un développeur, testable immédiatement sans casser le reste de l'application, et réversible en cas d'échec. Aucune phase d'implémentation active ne démarre sans la validation formelle de ses prérequis et de ses spikes exploratoires.  
>
> ### Décisions Corrigées (v3.3.1)
> 1. **Tag de Baseline Dérivé de `package.json` :** Tag annoté de référence formellement fixé à `v2.4.0-pre-v3-baseline` (version 2.4.0 constatée dans `astral-desktop/package.json`). Il pointe sur le commit exact audité et ne sera créé que sur un arbre de travail propre (`git status --porcelain` vide).
> 2. **DACL Named Pipe Restreinte au Logon SID de Session :** Priorité absolue à une DACL composée uniquement de :
>    - Le **Logon SID de la session interactive autorisée (`TokenLogonSid`)**.
>    - Le compte **`LOCAL_SYSTEM`**.
>    L'ACE au User SID est omise pour empêcher tout accès depuis les autres sessions ou contextes réseau du même compte.
> 3. **Spike Named Pipe — 9 Scénarios de Test Obligatoires :**
>    - Même Logon SID : accès autorisé.
>    - Autre Logon SID du même utilisateur : accès refusé (`ERROR_ACCESS_DENIED`).
>    - Utilisateur différent : accès refusé.
>    - Client distant : accès refusé (`PIPE_REJECT_REMOTE_CLIENTS`).
>    - Seconde instance du pipe : refusée (`FILE_FLAG_FIRST_PIPE_INSTANCE`).
>    - Bit `0x0004` absent du masque client.
>    - Action inconnue : refusée par le catalogue fermé.
>    - Message expiré ou rejoué : refusé.
>    - PID différent du processus attendu : refusé.
> 4. **Sécurité des Nonces & Secrets :** Aucun nonce ou secret ne doit apparaître dans la ligne de commande, les logs, les fichiers temporaires ou les rapports du spike. Le nonce est échangé exclusivement in-band sur le canal Named Pipe après connexion.
> 5. **Deux Politiques de Confiance pour `VanguardHelper.exe` :**
>    - *Développement :* Chemin canonique contrôlé, hash SHA-256 épinglé et manifeste signé numériquement.
>    - *Production :* Signature Authenticode de confiance si disponible, complétée par le hash du manifeste signé.
>    - *Interdiction absolue :* Ne jamais installer silencieusement de certificat racine auto-signé dans le magasin de certificats Windows (`Root` ou `TrustedPublisher`).
> 6. **Spike IA Borné & Diagnostic Local Déterministe :**
>    - Renommé partout en **« Diagnostic local déterministe »** dans l'UI et la documentation. Ce n'est ni un LLM ni une IA agentique, mais un moteur déterministe basé sur des règles expertes locales.
>    - La fonction générative reste expérimentale et marquée `Indisponible` si aucun tiers distant ne réussit la qualification.
>    - Le spike IA est borné à 3 requêtes max par endpoint, sans charge agressive, sans épuisement de quota, sans données réelles, sans secret dans les logs, et avec revue humaine séparée des ToS et droits d'intégration.
> 7. **Découplage de la Matrice des Portes :** La Phase 1 (suppression de fichiers et injections PowerShell) est prioritaire et totalement indépendante de la réussite du spike Named Pipe.
>
> ### Matrice des Portes de Déblocage (Gating Matrix)
> - **GATE 0 :** Phase 0 uniquement (Baseline, bench, spikes).
> - **GATE 1A :** Phase 1 après Phase 0 validée, **indépendamment du résultat du spike Pipe**.
> - **GATE 2 :** Phase 2 après Phase 1 validée.
> - **GATE 3 :** Phase 3 après succès complet du spike Named Pipe (Logon SID validé).
> - **GATE 8 :** Fournisseurs IA cloud optionnels uniquement après spike IA qualifié et revue ToS.
> - **GATE 13 :** Tunnel VPN uniquement après validation du parser OVPN strict et Wintun sous Win 11 24H2.

---

## SOMMAIRE GÉNÉRAL DES PHASES

- [Phase 0 — Baseline immuable, outillage de test & spikes exploratoires isolés](#phase-0--baseline-immuable-outillage-de-test--spikes-exploratoires-isolés)
- [Phase 1 — Vulnérabilités critiques, IPC & Confinement par scanId](#phase-1--vulnérabilités-critiques-ipc--confinement-par-scanid)
- [Phase 2 — Élimination définitive de toutes les simulations](#phase-2--élimination-définitive-de-toutes-les-simulations)
- [Phase 3 — Architecture des services, séparation des privilèges & Named Pipe Sécurisé](#phase-3--architecture-des-services-séparation-des-privilèges--named-pipe-sécurisé)
- [Phase 4 — Télémétrie système réelle & différentielle](#phase-4--télémétrie-système-réelle--différentielle)
- [Phase 5 — Orchestration multi-facteurs de Microsoft Defender](#phase-5--orchestration-multi-facteurs-de-microsoft-defender)
- [Phase 6 — Intégration du moteur de règles YARA-X (1.21.x Candidate)](#phase-6--intégration-du-moteur-de-règles-yara-x-121x-candidate)
- [Phase 7 — Second avis antivirus ClamAV facultatif isolé](#phase-7--second-avis-antivirus-clamav-facultatif-isolé)
- [Phase 8 — Diagnostic local déterministe par défaut & Fournisseurs cloud optionnels sans compte](#phase-8--diagnostic-local-déterministe-par-défaut--fournisseurs-cloud-optionnels-sans-compte)
- [Phase 9 — Diagnostic mémoire & working set expérimental](#phase-9--diagnostic-mémoire--working-set-expérimental)
- [Phase 10 — Outils réseau, DNS & Speedtest réel Cloudflare](#phase-10--outils-réseau-dns--speedtest-réel-cloudflare)
- [Phase 11 — Mode Jeu réel (Priorité processeur & Plans d'énergie configurables)](#phase-11--mode-jeu-réel-priorité-processeur--plans-dénergie-configurables)
- [Phase 12 — Intégration Intel PresentMon v2.6.x & Overlay HUD réel](#phase-12--intégration-intel-presentmon-v26x--overlay-hud-réel)
- [Phase 13 — Tunnel VPN communautaire réel (VPN Gate, Parser OVPN & Vérification d'Identité)](#phase-13--tunnel-vpn-communautaire-réel-vpn-gate-parser-ovpn--vérification-didentité)
- [Phase 14 — Refonte du Design System (WCAG AA & Budgets de performance)](#phase-14--refonte-du-design-system-wcag-aa--budgets-de-performance)
- [Phase 15 — Redesign ergonomique écran par écran](#phase-15--redesign-ergonomique-écran-par-écran)
- [Phase 16 — Banc d'essais, validation E2E Playwright & Tests de robustesse](#phase-16--banc-dessais-validation-e2e-playwright--tests-de-robustesse)
- [Phase 17 — Packaging NSIS, SBOM, Signature Authenticode & Distribution](#phase-17--packaging-nsis-sbom-signature-authenticode--distribution)

---

## Phase 0 — Baseline immuable, outillage de test & spikes exploratoires isolés

- **Objectif :** Établir une ligne de base immuable et reproductible du dépôt existant, mesurer les métriques de référence de l'application actuelle, vérifier l'environnement système (Node.js 24 / npm / tsc), et réaliser deux spikes techniques isolés sans aucune modification du code source applicatif ni ajout de dépendances de production.
- **Porte de Démarrage (Gate 0) :** Approbation formelle de la Révision 3.3.1 et commit documentaire propre.
- **Périmètre Strict :**
  - **Interdit :** Aucune modification de fichier dans `astral-desktop/src/`, aucun renommage de composant, aucun téléchargement de binaire dans `bin/`, aucune nouvelle dépendance dans `astral-desktop/package.json`.
  - **Autorisé :** Création du tag annoté `v2.4.0-pre-v3-baseline`, création de la branche `refactor/v3-baseline`, création du script de diagnostic `scripts/verify-env.mjs`, et prototypage des deux spikes dans `scratch/`.
- **Règle Impérative de Tagging :** Ne jamais créer le tag si `git status --porcelain` n'est pas vide. Les documents de Révision 3.3.1 doivent être placés dans un commit documentaire clairement identifié. Le tag doit être annoté et enregistrer :
  - La version de `package.json` (2.4.0) ;
  - Le SHA complet du commit audité ;
  - La branche source (`refactor/v2.3.0-quality-ui`) ;
  - La date UTC ;
  - L'état exact du worktree ;
  - La liste exhaustive des commandes exécutées.
- **Livrables Obligatoires de Phase 0 :**
  - `PHASE_0_EXECUTION_REPORT.md` (Rapport d'exécution complet)
  - `PHASE_0_BASELINE_MANIFEST.json` (Manifeste d'état de référence)
  - `PHASE_0_PIPE_SPIKE_REPORT.md` (Rapport du spike Named Pipe avec les 9 tests)
  - `PHASE_0_AI_SPIKE_REPORT.md` (Rapport du spike IA borné et revue ToS)
- **Fichiers concernés :**
  - `.gitignore` (ajout du dossier `scratch/` si nécessaire)
- **Nouveaux fichiers créés :**
  - `scripts/verify-env.mjs` (contrôle automatisé : Node.js $\ge 24$, npm $\ge 10$, TypeScript compiler, OS Windows Build 19045+)
  - `scratch/spike-pipe-security.ps1` (prototype de test du masque d'accès Named Pipe et de la DACL Logon SID)
  - `scratch/spike-ai-qualification.mjs` (test d'accessibilité réseau, headers, ToS et quotas des endpoints LLM7 / OVH)
- **Procédure d'exécution :**
  1. Vérifier l'état Git (`git status`).
  2. Commiter les documents de spécification 3.3.1.
  3. Créer le tag annoté `v2.4.0-pre-v3-baseline` sur le commit de référence.
  4. Créer la branche de travail : `git checkout -b refactor/v3-baseline`.
  5. Exécuter la suite de tests existante : consigner les résultats dans `reports/baseline-tests.log`.
  6. Exécuter le build existant : `npm run build` dans `astral-desktop/`.
  7. Mesurer les métriques de référence de l'application existante (empreinte mémoire au repos, taille du bundle produit par Vite, temps de build).
  8. Développer et exécuter `scripts/verify-env.mjs`.
  9. Exécuter les deux spikes isolés dans `scratch/`.
  10. Rédiger les 4 rapports de livrables obligatoires.
- **Critères d'acceptation :** 
  - Tag Git `v2.4.0-pre-v3-baseline` créé sur arbre propre.
  - Script `verify-env.mjs` validé et vert.
  - Zéro modification apportée au code source de `astral-desktop/src/`.
  - Décision PASS/FAIL séparée pour chaque spike consignée dans les rapports.
- **Preuve de fonctionnement :** Les 4 documents de rapport livrés et consultables.
- **Rollback :** `git checkout main ; git branch -D refactor/v3-baseline`.
- **Modèle recommandé pour l'exécution :** Agent DevOps / QA environnement.

---

## Phase 1 — Vulnérabilités critiques, IPC & Confinement par scanId

- **Objectif :** Éliminer la vulnérabilité d'effacement arbitraire de fichiers en instaurant le protocole de suppression par `scanId` canonique anti-TOCTOU, supprimer définitivement tout paramètre de chemin (`targetPath`) du contrat IPC de scan manuel, fermer les canaux IPC génériques et neutraliser toute injection PowerShell.
- **Porte de Démarrage (Gate 1A) :** Phase 0 validée. **Cette phase est totalement indépendante du résultat du spike Named Pipe.**
- **Fichiers concernés :**
  - `astral-desktop/src/main/downloadScanner.ts`
  - `astral-desktop/src/preload/index.ts`
  - `astral-desktop/src/main/index.ts`
  - `astral-desktop/index.html`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/security/scanRegistry.ts` (registre des sessions de scan, résolution canonique et anti-TOCTOU)
  - `astral-desktop/src/main/security/pathGuard.ts` (contrôle et refus des symlinks/jonctions NTFS)
- **Changements architecturaux :**
  - Le renderer ne transmet plus aucun chemin de fichier : les scans manuels sont initiés via `requestScanFileDialog()` sans argument de chemin, déclenchant le sélecteur natif dans le Main Process.
  - La remédiation prend exclusivement un `scanId` éphémère.
  - Le Main Process vérifie le hash SHA-256, la date et la taille du fichier sur disque immédiatement avant toute action.
  - La balise CSP dans `index.html` retire `'unsafe-inline'` pour les scripts.
- **Dépendances :** `zod`.
- **Licences :** MIT.
- **Critères d'acceptation :** Zéro suppression arbitraire possible ; aucun chemin absolu manipulable par le renderer.
- **Modèle recommandé pour l'exécution :** Agent AppSec / Cybersécurité.

---

## Phase 2 — Élimination définitive de toutes les simulations

- **Objectif :** Supprimer tout le faux code trompeur du dépôt et le remplacer par des états honnêtes (`Indisponible` ou `Fonctionnalité en cours de développement`).
- **Porte de Démarrage (Gate 2) :** Phase 1 validée.
- **Fichiers concernés :**
  - `astral-desktop/src/main/vpn.ts` (suppression de `setTimeout`, suppression des faux serveurs)
  - `astral-desktop/src/context/SystemContext.tsx` (suppression de `Math.random`)
  - `astral-desktop/src/main/security.ts` (suppression de la boucle de scan factice)
  - `astral-desktop/src/components/OverlayHUD.tsx` (suppression de `165 + Math.random()`)
  - `astral-desktop/src/components/tabs/NetworkTab.tsx` (suppression du faux rapport Wi-Fi)
  - `astral-desktop/src/main/network.ts` (suppression du plancher 720 Mbps)
- **Critères d'acceptation :** Zéro fausse donnée affichée ; mentions explicites « Indisponible » sur les modules en attente.
- **Modèle recommandé pour l'exécution :** Agent de refactoring.

---

## Phase 3 — Architecture des services, séparation des privilèges & Named Pipe Sécurisé

- **Objectif :** Exécuter Electron en tant qu'utilisateur standard (`asInvoker`) et créer le Privileged Helper sécurisé communiquant par Named Pipe local protégé par une DACL restreinte au Logon SID de la session interactive.
- **Porte de Démarrage (Gate 3) :** Phase 2 validée + **Succès complet du Spike Named Pipe validé** (les 9 tests obligatoires au vert).
- **Fichiers concernés :**
  - `astral-desktop/package.json` (`requestedExecutionLevel: asInvoker`)
  - `astral-desktop/src/main/adminHelper.ts`
  - `astral-desktop/src/main/index.ts`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/privilegedHelper/index.ts` (service élévation via Named Pipe)
  - `astral-desktop/src/main/privilegedHelper/actionCatalog.ts` (catalogue fermé d'actions autorisées)
  - `astral-desktop/src/main/privilegedHelper/pipeSecurity.ts` (construction dynamique de DACL Win32 Logon SID + SYSTEM, masque minimal `0x00120183`, validation PID et nonce in-band)
- **Changements architecturaux :**
  - Canal : Named Pipe Windows local (`\\.\pipe\AstralVanguard_Helper_<RandomHex32>`) avec drapeaux `PIPE_REJECT_REMOTE_CLIENTS` et `FILE_FLAG_FIRST_PIPE_INSTANCE`.
  - Masque d'accès client restreint à `CLIENT_MINIMAL_PIPE_ACCESS = 0x00120183` excluant strictement `FILE_APPEND_DATA` (`0x0004` / `FILE_CREATE_PIPE_INSTANCE`), `WRITE_DAC`, `WRITE_OWNER`, `DELETE`.
  - DACL Win32 programmatique accordant les droits uniquement au **Logon SID (`TokenLogonSid`)** et à **`LOCAL_SYSTEM`**, avec `SE_DACL_PROTECTED`.
  - Zéro nonce ou secret passé en argument de ligne de commande : l'échange de nonce se fait exclusivement in-band sur le canal.
  - Vérification mutuelle des PIDs (`GetNamedPipeClientProcessId` / `GetNamedPipeServerProcessId`).
  - Politiques de confiance de `VanguardHelper.exe` : développement (chemin canonique + hash épinglé + manifeste signé) et production (Authenticode officiel de confiance + manifeste signé).
  - Catalogue fermé : aucune commande shell libre acceptée. Arrêt du Helper immédiatement après l'action.
- **Critères d'acceptation :** L'application s'exécute en utilisateur standard ; le Helper n'accepte aucune commande libre ; le bit `0x0004` est vérifié absent du masque client.
- **Modèle recommandé pour l'exécution :** Agent senior Windows / Sécurité système.

---

## Phase 4 — Télémétrie système réelle & différentielle

- **Objectif :** Remplacer le calcul statique d'activité CPU par une mesure différentielle exacte et lire la mémoire et les disques avec précision.
- **Prérequis :** Phase 3 validée.
- **Fichiers concernés :**
  - `astral-desktop/src/main/performance.ts`
  - `astral-desktop/src/context/SystemContext.tsx`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/telemetry/cpuSampler.ts` (calcul $\Delta\text{Total} / \Delta\text{Idle}$ sur fenêtre glissante de 500 ms)
  - `astral-desktop/src/main/telemetry/diskSampler.ts` (requêtes CIM asynchrones)
- **Critères d'acceptation :** La charge CPU instantanée reflète la réalité physique du processeur (écart maximal documenté $\le 2\%$).
- **Modèle recommandé pour l'exécution :** Agent Node.js / Core system.

---

## Phase 5 — Orchestration multi-facteurs de Microsoft Defender

- **Objectif :** Remplacer la simulation de scan par de véritables opérations Microsoft Defender via PowerShell et `MpCmdRun.exe -ReturnHR`, avec corrélation multi-facteurs du verdict.
- **Prérequis :** Phase 4 validée.
- **Fichiers concernés :**
  - `astral-desktop/src/main/security.ts`
  - `astral-desktop/src/components/tabs/SecurityTab.tsx`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/security/defenderOrchestrator.ts` (analyse multi-facteurs HRESULT, ThreatDetection et Event Logs)
- **Critères d'acceptation :** Les résultats proviennent exclusivement de l'antivirus Windows réel et des sources de détection locales.
- **Modèle recommandé pour l'exécution :** Agent sécurité Windows.

---

## Phase 6 — Intégration du moteur de règles YARA-X (1.21.x Candidate)

- **Objectif :** Intégrer un moteur de détection locale ultra-rapide basé sur YARA-X (version candidate 1.21.x à qualifier) avec règles compilées.
- **Prérequis :** Phase 5 validée.
- **Fichiers concernés :**
  - `astral-desktop/src/main/security.ts`
  - `astral-desktop/src/preload/index.ts`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/security/yaraEngine.ts` (moteur d'analyse autonome en mémoire)
  - `astral-desktop/rules/` (règles YARA-X de base : web shells, droppers, scripts obfusqués)
- **Critères d'acceptation :** Analyse locale autonome opérationnelle sans connexion internet.
- **Modèle recommandé pour l'exécution :** Agent cybersécurité.

---

## Phase 7 — Second avis antivirus ClamAV facultatif isolé

- **Objectif :** Offrir un second avis antivirus indépendant en intégrant ClamAV de manière totalement découplée sans risquer la contamination par la licence GPLv2.
- **Prérequis :** Phase 6 validée.
- **Fichiers concernés :**
  - `astral-desktop/src/main/binHelper.ts`
  - `astral-desktop/src/main/security.ts`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/security/clamavClient.ts` (gestionnaire d'exécution CLI découplé)
  - `astral-desktop/src/main/security/clamavInstaller.ts` (téléchargement optionnel officiel et vérification Authenticode)
- **Critères d'acceptation :** ClamAV fonctionne en second avis facultatif sans menacer le statut propriétaire du projet.
- **Modèle recommandé pour l'exécution :** Agent système / Conformité open-source.

---

## Phase 8 — Diagnostic local déterministe par défaut & Fournisseurs cloud optionnels sans compte

- **Objectif :** Implémenter l'architecture d'analyse système avec le Diagnostic local déterministe comme socle par défaut (100% hors ligne), et intégrer les fournisseurs cloud optionnels (LLM7 et OVH) conditionnés aux résultats du spike d'évaluation pré-implémentation, avec requêtes pseudonymisées, assainissement strict des réponses et bouton explicite de diagnostic local.
- **Porte de Démarrage (Gate 8) :** Spike d'évaluation IA validé (3 requêtes max par endpoint réussies, quotas acceptables, conditions d'utilisation conformes et revue ToS effectuée).
- **Fichiers concernés :**
  - `astral-desktop/src/main/index.ts`
  - `astral-desktop/src/preload/index.ts`
  - `astral-desktop/src/components/tabs/Dashboard.tsx`
- **Nouveaux fichiers :**
  - `astral-desktop/src/main/ai/DeterministicSummaryProvider.ts` (moteur local déterministe par défaut, 100% hors ligne)
  - `astral-desktop/src/main/ai/CloudAIProvider.ts` (interface commune des fournisseurs)
  - `astral-desktop/src/main/ai/LLM7AnonymousProvider.ts` (fournisseur cloud optionnel sans compte)
  - `astral-desktop/src/main/ai/OVHAnonymousProvider.ts` (fournisseur cloud secondaire optionnel)
  - `astral-desktop/src/main/ai/Anonymizer.ts` (pseudonymisation stricte des chemins, utilisateurs et métadonnées)
  - `astral-desktop/src/main/ai/AIManager.ts` (orchestrateur, disjoncteur, coupe-circuit distant et gestion du consentement)
- **Changements architecturaux :**
  - Le Diagnostic local déterministe est actif en permanence dès l'installation.
  - L'activation du cloud requiert une action explicite ou propose un bouton visible « Diagnostic local uniquement ».
  - Si le spike échoue, la fonction générative reste marquée `Indisponible`.
  - Aucun basculement silencieux vers le cloud en cas d'erreur locale.
  - Traitement des réponses de l'IA comme du contenu non fiable assaini par DOMPurify.
- **Critères d'acceptation :** Diagnostic système généré en toutes circonstances, sans compte ni clé demandés à l'utilisateur ; bouton « Diagnostic local uniquement » pleinement opérationnel.
- **Modèle recommandé pour l'exécution :** Agent spécialiste APIs / LLM.

---

## Phase 9 — Diagnostic mémoire & working set expérimental

- **Objectif :** Mettre en place un diagnostic mémoire transparent identifiant les processus consommateurs et reléguer l'optimisation par `EmptyWorkingSet` au rang d'option expérimentale désactivée par défaut avec liste d'exclusion stricte.
- **Prérequis :** Phase 8 validée.
- **Critères d'acceptation :** Zéro promesse de gain permanent ; transparence totale sur l'utilisation mémoire.
- **Modèle recommandé pour l'exécution :** Agent Windows internals.

---

## Phase 10 — Outils réseau, DNS & Speedtest réel Cloudflare

- **Objectif :** Supprimer la falsification des débits (< 150 Mbps forcés à 720 Mbps), fiabiliser le sélecteur DNS et le diagnostic Wi-Fi.
- **Prérequis :** Phase 9 validée.
- **Critères d'acceptation :** Mesures de débit et de ping conformes aux débits réels observés sur la ligne physique.
- **Modèle recommandé pour l'exécution :** Agent réseau / Web performance.

---

## Phase 11 — Mode Jeu réel (Priorité processeur & Plans d'énergie configurables)

- **Objectif :** Remplacer le simple interrupteur visuel par une gestion concrète : application de la priorité configurée (`Above Normal` ou `High`, jamais `Realtime`) et enregistrement/restauration du GUID exact du plan d'alimentation.
- **Prérequis :** Phase 10 validée.
- **Critères d'acceptation :** Priorité effective appliquée dans le noyau Windows et restauration systématique vérifiée du GUID d'origine.
- **Modèle recommandé pour l'exécution :** Agent système Windows.

---

## Phase 12 — Intégration Intel PresentMon v2.6.x & Overlay HUD réel

- **Objectif :** Intégrer les métriques réelles fournies par Intel PresentMon v2.6.x (ou stable compatible), sans promesse absolue anti-cheat, avec gestion explicite des statuts de capture.
- **Prérequis :** Phase 11 validée.
- **Critères d'acceptation :** Zéro chiffre aléatoire dans le HUD ; affichage honnête des limitations techniques.
- **Modèle recommandé pour l'exécution :** Agent C++ / Gaming internals.

---

## Phase 13 — Tunnel VPN communautaire réel (VPN Gate, Parser OVPN & Vérification d'Identité)

- **Objectif :** Implémenter un véritable client VPN communautaire basé sur le catalogue public VPN Gate et le moteur OpenVPN/Wintun, avec parser strict en liste blanche imposant la validation serveur (`remote-cert-tls server`), la vérification d'identité quand disponible, l'avertissement d'identité pour les relais non vérifiés, et le rejet de tout fichier malveillant.
- **Porte de Démarrage (Gate 13) :** Parser OVPN en liste blanche validé unitairement + Wintun 0.14.1 qualifié sous Windows 11 24H2.
- **Critères d'acceptation :** Tunnel de données chiffré réel, trafic effectif masqué, rejet systématique validé des directives hostiles et statut d'identité de relais fidèlement rapporté.
- **Modèle recommandé pour l'exécution :** Agent réseau / Sécurité VPN.

---

## Phase 14 — Refonte du Design System (WCAG AA & Budgets de performance)

- **Objectif :** Nettoyer `index.css`, éliminer les 55 composants shadcn/ui morts, unifier l'animation sur `motion`, viser et valider l'accessibilité WCAG AA et respecter les budgets de performance définis.
- **Prérequis :** Phase 13 validée.
- **Critères d'acceptation :** Le bundle client respecte le budget cible (< 350 Ko de code JS/CSS minifié produit par Vite, hors polices et assets) ; conformité WCAG AA validée.
- **Modèle recommandé pour l'exécution :** Agent Frontend / UI Designer.

---

## Phase 15 — Redesign ergonomique écran par écran

- **Objectif :** Appliquer le nouveau Design System professionnel sur les 7 onglets principaux, l'onboarding et l'overlay sans fioritures décoratives trompeuses.
- **Prérequis :** Phase 14 validée.
- **Critères d'acceptation :** Tous les écrans sont harmonisés, professionnels et exempts de tout élément trompeur.
- **Modèle recommandé pour l'exécution :** Agent Frontend React.

---

## Phase 16 — Banc d'essais, validation E2E Playwright & Tests de robustesse

- **Objectif :** Mettre à l'épreuve l'application sur des scénarios réels d'utilisation, de coupures réseau et de stress machine à l'aide de Playwright Test.
- **Prérequis :** Phase 15 validée.
- **Critères d'acceptation :** 0 crash applicatif, 0 rejet de promesse non géré, toutes les erreurs gérées avec message compréhensible.
- **Modèle recommandé pour l'exécution :** Agent QA / Test Automation.

---

## Phase 17 — Packaging NSIS, SBOM, Signature Authenticode & Distribution

- **Objectif :** Produire l'installateur officiel Windows x64 v3.0, générer le registre des licences tierces (SBOM), intégrer la signature Authenticode de l'éditeur, le manifeste de release signé et la protection anti-downgrade (rejet des versions strictement inférieures, réparation autorisée pour les versions égales).
- **Prérequis :** Phase 16 validée.
- **Critères d'acceptation :** Fichier exécutable installateur généré, autonome, stable et intègre.
- **Modèle recommandé pour l'exécution :** Agent DevOps / Release Engineering.
