# STATE — Vanguard Core

## État Actuel
- **Version cible :** `v0.1.6` (Pré-release GitHub).
- **Artéfacts compilés :** `Vanguard-Core-Setup-0.1.6.exe` (87.9 Mo, 87 945 209 octets, SHA256: `067124b9dc7b5057c1fe505a10293a422c851269c03ea2bae2820b276833d65a`), `latest.yml`, `Vanguard-Core-Setup-0.1.6.exe.blockmap`, `SHA256SUMS.txt`.
- **Git Branch :** `refactor/v3-baseline`.
- **Statut courant :** **Publication autorisée par l'utilisateur en pré-release sur GitHub pour distribution et essais manuels réels. Version d'évaluation non certifiée stable.**
- **Bancs de validation :** **147 tests automatisés passés avec succès (100%), TypeScript sans erreur (`tsc --noEmit`), build complet NSIS validé (code 0).**

---

## Suivi des Sections

### 1. Maintenance (M1 à M7)
- **Statut :** **Suffisamment avancée pour poursuivre (acceptée avec réserves documentées).**
- **Réserves conservées :**
  - Limite constructeur ASUS/BIOS avec consultation manuelle requise (API propriétaire fermée).
  - Statut NVIDIA `version_ahead_of_catalog` conservé sans assimilation à « certifié à jour ».
  - Vérifications Electron live et parcours complets en conditions réelles restant à auditer lors de la recette finale.

### 2. Performance (P1 à P3)
- **P1 — Présentation des performances :** **Acceptée pour poursuivre.** Cartes de jeu clarifiées (lancement standard sans modification silencieuse), vocabulaire trompeur éliminé.
- **P2 — Fonctions existantes :** **Corrections acceptées dans le périmètre testé.**
  - Identité de processus `PID + Nom + StartTime` implémentée et testée unitairement (15/15 tests réussis).
  - Boucle d'évaluation mutualisée (liveness + premier plan) toutes les 8s, consommation restant à mesurer objectivement.
  - Absence de capture FPS réelle vérifiée sur jeu physique (faute de binaire PresentMon ou d'environnement d'affichage GPU dédié).
  - Limites des tests simulés conservées.
  - Anti-bufferbloat non implémenté, désormais présenté honnêtement.
- **P3 — Paramètres internes aux jeux :** **Non implémenté ; décision de périmètre en attente avant release.**
  - Faux boutons « Optimiser » et badges factices supprimés.
  - Moteur d'édition de fichiers de configuration de jeux non développé (décision de périmètre en attente avant release, chantier non ouvert).

### 2bis. Sentinelle de Téléchargement & Filtrage Système
- **Statut :** **Corrigé et validé par test de non-régression (5/5 assertions passées, code 0).**
- **Filtrage amont déterministe (`scannerExclusions.ts`, `downloadScanner.ts`) :**
  - Exclusion immédiate des fichiers système Windows (`desktop.ini`, `thumbs.db`, `ehthumbs.db`, `ehthumbs_vista.db`) avant toute mise en file d'attente, avant stabilisation et avant appel `MpCmdRun.exe`.
  - Résolution définitive des analyses répétées de `desktop.ini` lors des modifications de dossiers par l'Explorateur Windows.
  - Préservation stricte des fichiers sentinelles de test de sécurité (`eicar.txt`, `vanguard-test.txt`).
  - Validation par banc dédié [`test-download-scanner-exclusions.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-download-scanner-exclusions.mjs).

### 3. Réseau (R1 à R5)
- **Statut :** **Réseau accepté dans le périmètre testé, avec recette Electron et mesures WAN réelles restantes.**
- **R1 — Composition visuelle & Intégration :** **Vérifié côté build et structure.** Bloc « Connexion et diagnostic » en 2 colonnes sans modal drawer `showAccelDrawer`. Jauge adaptative jusqu'à 10 Gbps sans plafond arbitraire. Variables CSS du thème respectées. Rendu dynamique Electron en conditions réelles non testé (session interactive requise).
- **R2 — Élimination des fallbacks fictifs & Exécuteur Speedtest :** **Vérifié sur serveur local contrôlé (11/11 tests).** Moteur `SpeedtestExecutor` découplé testé avec serveur HTTP local : téléchargement, upload, phase partielle (upload null), serveur fermé, HTTP 500, socket destroy, timeout, annulation immédiate avec fermeture des sockets, verrou anti-concurrence, rejet d'événements obsolètes via `runToken`. Zéro fallback 100M/40%/18ms.
- **R3 — Méthode de latence, sondes & gigue :** **Vérifié.** Gigue calculée par déviation absolue moyenne ($N \ge 3$). Sondes par poignée de main TCP distinctes (Passerelle port 80/53, Cloudflare `1.1.1.1:443`, Google `8.8.8.8:53`). Si la passerelle refuse la connexion TCP (ports fermés), affichage explicite « Port filtré / Non dispo » sans inférence de panne Internet. Bufferbloat présenté honnêtement comme une estimation ponctuelle d'écart sous charge (non audit de labo) avec affichage du ratio de sondes réussies (0, 1 ou 2) et moyenne des échantillons valides. Si non mesuré ou échoué, affichage « Non mesuré » (null) sans note inventée.
- **R4 — Notation déterministe 3 dimensions :** **Vérifié (16/16 tests unitaires).** Ordre numérique strict (D=0 à A++=5). Règle anti-masquage : note globale plafonnée à $\min(\text{dims}) + 1$. Débit modeste stable (Down 25M, Ping 8ms -> C, A++, A++ -> B). Débit gigabit avec bufferbloat (+350ms -> A+, A+, D -> C). Rapport incomplet -> note « — » avec dimensions valides préservées. Zéro inférence arbitraire de type d'accès (Fibre/ADSL).
- **R5 — Diagnostic TCP/IP, DNS & Protection Anti-Conflit Rollback :** **Vérifié (13/13 tests de rollback).** Sauvegarde `tcpBackup` et `dnsBackup` avec protection anti-écrasement. Enregistrement des modifications effectivement appliquées par Vanguard (`lastAppliedDns`, `lastAppliedTcp`). Détection de modifications tierces préalables à la restauration : si l'état observé diffère du dernier état appliqué par Vanguard, refus de restauration automatique, signalement de conflit et proposition d'arbitrage (« Conserver l'état actuel » vs « Forcer la restauration d'origine »). Présomption de conflit si la lecture de l'état système échoue ou est ambiguë. Restauration fidèle de l'ordre exact des serveurs DNS (non DHCP aveugle). Contrôle d'élévation administrateur TCP sans masquer les erreurs. Test DNS réel via requête DNS standard (Requête A) distinguée de la poignée TCP port 53. Statut IPv6 à 3 états réels (« Liaison activée », « Liaison désactivée », « État inconnu ») avec rappel que Vanguard ne modifie pas IPv6. DoH clarifié comme non configuré dans cette version et tributaire de Windows 11.

### 4. VPN (Lot 3 / Phase 13)
- **Statut exact de la section :** **Lancement via service interactif implémenté et testé en simulation ; installation, interopérabilité avec le service Windows et connexion réelles non vérifiées.**
- **Statuts de suivi détaillés :**
  - **Orchestration testée avec processus simulés :** Les 68 tests couvrent les scénarios listés (20 tests sur le lanceur interactif et l'installateur, 10 tests de routage, 4 tests de sécurité du secret et ACLs structurées, 2 tests d'arrêt Windows gracieux/secours, 6 tests de qualification fine IPv6, 13 tests d'orchestration de cycle de vie, 13 tests de parseur OVPN et catalogue VPN Gate), avec les limites et simulations indiquées.
  - **Connexion réelle non testée :** Aucun relais public VPN Gate contacté avec acheminement réel du trafic de la machine hôte.
  - **Restauration réseau réelle non testée :** Aucune mutation physique de la table de routage ni de l'adaptateur n'a été exécutée sur l'hôte.
  - **Installation réelle non testée :** Aucun package d'installation MSI ni pilote Wintun n'a été installé sur l'hôte.
  - **Kill switch indisponible :** Fonction désactivée pour v0.1.6 ; l'interface avertit expressément que le trafic reprend sa route ordinaire en cas d'interruption du VPN.
  - **Basculement automatique indisponible :** Fonction désactivée pour v0.1.6.

- **Détail des vérifications approfondies :**
  1. **Intégration du Lanceur Privilégié Officiel (`OpenVpnInteractiveClient`) :**
     - Mécanisme : Communication officielle sur le tube nommé Windows `\\.\pipe\openvpn\service` vers le service interactif OpenVPN (`OpenVPNServiceInteractive` / `openvpnserv.exe`).
     - Protocole binaire : Encodage UTF-16LE de la structure `STARTUP_DATA` (`directory\0options\0std_input\0`), rejet des caractères nuls internes, taille bornée à 8192 octets.
     - Parser de réponses : Décodage UTF-16LE gérant les fragments et agrégations, distinction en 5 états fins (`service_missing`, `service_stopped`, `pipe_access_denied`, `options_or_config_rejected`, `insufficient_rights`).
     - Groupe d'autorisation : Vérification basée sur l'appartenance aux Administrateurs locaux (`S-1-5-32-544`) ou au groupe spécifié par `HKLM\Software\OpenVPN\ovpn_admin_group` (par défaut `OpenVPN Administrators`).
     - Annulation et protection anti-orphelins : Interruption avant envoi (rejet immédiat amont), maintien d'une fenêtre de grâce pour intercepter le PID et le terminer immédiatement (`SIGTERM`) si le service répond, ou qualification explicite en état indéterminé (`indeterminate_cancellation`, nettoyage non garanti) si le tube rompt sans PID.
  2. **Installateur Accompagné Officiel (`OpenVpnInstaller`) :**
     - Package ciblé : Version officielle de la branche 2.6 `OpenVPN-2.6.23-I002-amd64.msi` issue de `https://build.openvpn.net/downloads/releases/`.
     - Intégrité & authenticité : Vérification de signature numérique Authenticode par PowerShell `Get-AuthenticodeSignature` (éditeur officiel *OpenVPN, Inc.*, statut `Valid`). Absence de fichier d'empreinte `.sha256` en amont ; calcul d'empreinte SHA-256 réalisé localement à des fins d'audit. Aucune allégation non vérifiée sur des CVEs spécifiques (ex. CVE-2026-105390) ou des versions de pilote interne sans inspection du manifeste paquet ou du pilote installé.
     - Exécution avec consentement explicite : Déclenchement de `msiexec.exe /i <path> /qb /norestart` conditionné au drapeau `consentGiven: true`, chemin strictement maîtrisé dans `vanguard_installers` par le processus principal (zéro chemin arbitraire renderer), gestion des codes d'arrêt `0` (succès), `3010` (redémarrage requis), `1602` (annulation UAC/utilisateur).
  3. **Secret de gestion & permissions Windows structurées par SIDs (`OpenVpnManagementClient`) :**
     - Emplacement : dossier dédié `vanguard_vpn_secrets` dans `userData` (ou `tmpdir`).
     - ACLs Windows : résolution du SID exact de l'utilisateur courant, application via `icacls.exe /inheritance:r /grant:r "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" "*<userSid>:(M)"`.
     - Contrôle structuré : Vérification PowerShell `Get-Acl` avec traduction en `[SecurityIdentifier]`. Rejet formel si `HasInherited == true` ou `UnauthorizedCount > 0`.
     - Séparation stricte : Le canal de gestion local est protégé par son propre secret éphémère (fichier ou `stdin`), distinct des identifiants d'accès VPN.
     - Nettoyage : suppression systématique lors de la déconnexion ou de l'erreur (sans allégation abusive d'effacement physique garanti).
  4. **Routage & prise en charge de `redirect-gateway def1` (`VpnRoutingEngine`) :**
     - Prise en charge formelle de la route par défaut classique `0.0.0.0/0` ET de la paire `/1` spécifique à OpenVPN (`0.0.0.0/1` + `128.0.0.0/1`) sur l'interface du tunnel.
     - La conservation de la passerelle physique `0.0.0.0/0` lors de la présence de la paire `/1` est reconnue comme normale et attendue (non un échec ni un conflit).
     - Détection des paires incomplètes (seule l'une des deux routes `/1` présente -> couverture rejetée).
     - Coexistence tiers (`evaluateThirdPartyConflict`) : confirmation de conflit uniquement si l'adaptateur tiers détient la route par défaut globale ou la paire `/1`.
  5. **Qualification fine de l'exposition IPv6 (`qualifyIpv6Status`) :**
     - Distinction stricte en 6 états : `unsupported_by_engine`, `link_active`, `address_usable`, `route_outside_tunnel`, `observed_egress`, `unverified`.
     - Aucune affirmation de fuite confirmée (`leakConfirmed: false`) sur simple présence d'un lien actif ou d'une adresse utilisable.
     - Le statut de fuite confirmée est STRICTEMENT réservé au cas où une sortie réseau effective (`observed_egress`) a été mesurée.
  6. **Séquence d'arrêt ordonnée sous Windows (`communityVpnEngine.disconnect`) :**
     - Envoi préalable de la commande `signal SIGTERM` sur le socket de gestion OpenVPN.
     - Attente bornée de terminaison du processus (délai max 3000ms via `waitForPidExit`).
     - Recours au kill forcé uniquement en dernier ressort si le processus reste bloqué.
     - Libération des sockets, fermeture du serveur de gestion et purge des profils temporaires.
     - Qualification du statut de restauration (`restauration_verifiee` vs `restauration_non_confirmee`).
  7. **Catalogue dynamique VPN Gate & Transparence :**
     - `DEFAULT_INITIAL_COUNTRIES` supprimé. Zéro fallback statique ou valeur de démonstration.
     - Catalogue réel récupéré dynamiquement avec cache local horodaté (TTL 1h) et gestion d'erreur avec nouvelle tentative.
     - Distinctions claires entre caractéristiques déclarées par le catalogue et mesures locales.
     - Lien officiel vers la politique anti-abus de VPN Gate (`vpngate.net/en/about_abuse.aspx`).
  8. **Maintien des fonctions reportées :**
     - Kill Switch désactivé, badge « INDISPONIBLE DANS CETTE VERSION ».
     - Aucune règle pare-feu ajoutée, modifiée ou supprimée sur l'hôte (`cleanupAstralFirewallRules` définitivement retiré).
     - Basculement automatique affiché « NON IMPLÉMENTÉ ».
     - Basculement automatique affiché « NON IMPLÉMENTÉ ».

### 5. Accueil, Paramètres & Tray Windows
- **Statut :** **Implémentation acceptée dans le périmètre testé ; recette Electron et vérifications réelles restantes.**
- **1. Accueil & Brief Quotidien (`Dashboard.tsx`, `dailyBriefEngine.ts`) :**
  - Direction artistique, thèmes existants et variables CSS intégralement préservés.
  - « Bonjour, [prénom] » conservé ; phrase d'accompagnement sous la salutation supprimée.
  - Brief Quotidien positionné au premier plan dans une carte maîtresse unifiée sans répétitions redondantes.
  - Élimination de tout score global inventé (suppression des formules arbitraires type « 75/100, -25 pts disque »).
  - Évaluation factuelle à 4 niveaux d'alerte : *Problème confirmé*, *Attention recommandée*, *Aucune anomalie détectée*, *Vérification incomplète*.
  - 4 dimensions d'observation distinctes et indépendantes : Protection, Stockage, Charge système, Réseau.
  - Alertes réelles visibles immédiatement même si le brief en cache est ancien (ex: disque C: saturé à 96% mis en avant sans masquer l'anomalie sous un texte rassurant obsolète).
  - Suppression totale du polling toutes les 30s. Bouton de rafraîchissement manuel temporisé avec cooldown de 60s.
  - Événements récents : suppression des 4 lignes statiques fictives ; restitution des vrais événements de scan et téléchargements, ou affichage honnête d'un état vide si aucun événement n'a été enregistré.
- **2. Intégration du Brief IA & Confidentialité (`dailyBriefEngine.ts`) :**
  - Piste prioritaire OVHcloud AI Endpoints (`endpoints.kepler.ai.cloud.ovh.net`, modèle `Mistral-Nemo-Instruct-2407`) vérifiée en direct via un appel minimal neutre (2026-11-04 00:38:33, HTTP 200, 2 req/min par IP).
  - Gestion rigoureuse de la machine à 4 états : `generated`, `deterministic`, `cached` (TTL 15 min), `unavailable`.
  - Minimisation stricte du payload : liste fermée `SafeBriefPayload` (Uptime, RAM, Disque C:, booléen Defender, menaces isolées, latence 1.1.1.1).
  - Exclusions absolues : ZÉRO nom/prénom, ZÉRO chemin ou nom de fichier, ZÉRO IP dans le prompt, ZÉRO secret ou token, ZÉRO métadonnée ou donnée Vault, ZÉRO journal brut.
  - Annulation en vol et protection contre les réponses tardives : si le consentement est retiré pendant le transit de la requête réseau, la réponse tardive est écartée, non enregistrée en cache sous source `generated`, et la synthèse déterministe locale est affichée.
  - Étanchéité du cache par profil : isolation par clé de profil (`profileKey`), aucun mélange entre profils.
  - Réponse IA traitée comme non fiable : longueur bornée, assainissement HTML, aucune commande système exécutée. Boutons d'action contextuels décidés exclusivement par le code de l'application.
- **3. Paramètres & Consentement (`SettingsTab.tsx`, `profile.ts`, `Sidebar.tsx`) :**
  - Remplacement de « Profil Joueur » par « Paramètres » dans la barre latérale sous le nom de l'utilisateur.
  - Section dédiée « Brief Quotidien & Synthèse IA » avec demande de consentement explicite, transparence sur le fournisseur OVHcloud, données autorisées vs exclues, et option locale hors-ligne.
  - Réglages de sécurité (Protection temps réel, Antivirus résident, Pare-feu, Dossiers contrôlés) : suppression des faux interrupteurs d'état local qui trompaient l'utilisateur ; affichage d'indicateurs d'état réels en lecture seule avec distinction stricte entre *Protection active*, *Désactivée*, *Service indisponible*, et *État non déterminé* (sans assimilation à une preuve d'invulnérabilité globale). Bouton d'orientation vers la console Sécurité Windows.
  - Réglages réseau indisponibles (DoH, anti-bufferbloat, IPv6) : déclarés honnêtement « Géré par le système d'exploitation / Non altéré par Vanguard », sans interrupteur inopérant ni promesse indue.
  - Diagnostic factuel : remplacement des fausses vérifications temporisées par de vraies requêtes (Defender, Admin, Disque C:, Ping 1.1.1.1, Service OpenVPN, Sentinelle Téléchargements).
- **4. Tray Windows, Cycle de Vie & Arrêt Ordonné (`index.ts`, `lifecycle.ts`) :**
  - Commandes Tray épurées : suppression des 5 relais VPN fictifs, de l'ancien mode gaming et des commandes mortes sans récepteur frontend (`perf:trigger-clean-ram`, `action:trigger-scan`, faux toggle bouclier).
  - Unification de tous les chemins d'arrêt normal vers la même orchestration `gracefulShutdown` :
    1. « Quitter Vanguard Core » dans le Tray contextuel
    2. Croix de fermeture de fenêtre (`mainWin.on('close')`, si non masqué dans le Tray)
    3. Fermeture de toutes les fenêtres (`app.on('window-all-closed')`)
    4. Appel IPC `app:quit`
    5. Événement système `app.on('before-quit')`
  - Séquence ordonnée avec protection anti-réentrance :
    1. Désactiver le masquage dans le Tray
    2. Arrêter le planificateur de maintenance (`stopMaintenanceScheduler`)
    3. Arrêter les observateurs de répertoires (`stopDownloadScanner`)
    4. Déconnecter le VPN si actif (`communityVpnEngine.disconnect`, délai borné à 3s) ; si le délai expire, le statut de restauration est marqué non confirmé (aucun succès usurpé)
    5. Restaurer les optimisations temporaires (`gamingManager.restorePreviousState`)
    6. Détruire le Tray et l'Overlay
    7. Délai de nettoyage global maximal de 5s prévenant tout blocage ou processus zombie, suivi de `app.quit()`
- **5. Réserves d'exécution conservées :**
  - Recette manuelle Electron en conditions graphiques réelles requise pour valider l'absence de processus orphelins sur tous les chemins d'arrêt sous Windows 11.
  - Rendu visuel dynamique des thèmes sous Electron nécessitant une inspection interactive.
  - Consommation réelle et capture FPS physique restant à auditer sur environnement dédié.
  - Installation, interopérabilité Windows et connexion VPN réelles restant non exécutées sur la machine hôte.

### 6. Vanguard Vault — Sous-Lots 1, 2 & 3 (Cryptographie, Stockage Transactionnel, Worker, API Interne & UI)
- **Statut exact maintenu :** **Développement et tests sur données générées ; utilisation sur données importantes non encore validée.**
- **1. Spécification Binaire & Format Découplé (`docs/VANGUARD_VAULT_SPEC.md`, `envelopeSerializer.ts`) :**
  - Spécification formelle v1 formalisée : Magic `VGV1` (4B), version `0x0001` (2B), Vault UUID (16B), Flags (1B à l'offset 22), Réservé (9B zéros aux offsets 23..31). Total HeaderPrefix = 32 octets.
  - Slot AAD indépendant (59 octets) : `HeaderPrefix (32B avec flags neutralisés à 0x00) || SlotMetadata (27B)`.
  - Règle de découplage critique vérifiée : l'ajout ou le retrait d'une clé de secours (altération de l'octet de flags en en-tête) ne modifie pas l'AAD du mot de passe et n'invalide jamais le mot de passe principal.
- **2. Primitives, Bornes KDF & Clé de Récupération (`cryptoPrimitives.ts`, `recoveryKey.ts`) :**
  - `libsodium-wrappers-sumo@0.8.4` (Argon2id + XChaCha20-Poly1305).
  - Validation KDF stricte : vérification de type entier fini, anti-NaN, anti-Infinity.
  - Distinction formelle entre bornes de lecture anti-DoS (`opslimit` 1 à 5, `memlimit` 8 Ko à 256 Mo) et politique de création Vanguard (`opslimit` $\ge 2$, `memlimit` $\ge 64$ Mo).
  - Contextes KDF de 8 octets ASCII stricts (`vgv_meta`, `vgv_data`) validés par regex 7-bit printable.
  - Clé de secours Crockford Base32 : 56 caractères (52 symboles secret 256 bits + 4 symboles CRC-32 tronqué à 20 bits) en 14 groupes de 4. Rôle du checksum strictement borné à l'interception des fautes de frappe UI avant KDF.
- **3. Architecture Worker Thread & Confidentialité (`vaultWorker.ts`, `vaultProtocol.ts`) :**
  - Le Worker Thread dédié (`node:worker_threads`) est le propriétaire exclusif de la session cryptographique active (`VaultSession`).
  - RÈGLE ABSOLUE DE CONFIDENTIALITÉ : ZÉRO clé maîtresse, dérivée, d'enveloppement ou de contenu n'est transmise via IPC, DTOs ou renvoyée au Main ou au Renderer.
  - Messages typés et sérialisés avec identifiant de requête (`reqId`), progression chunk-par-chunk (`PROGRESS`) et annulation en vol (`AbortController`).
- **4. Gestionnaire Main Process, Auto-Lock & Orchestration (`vaultManager.ts`, `vaultIpc.ts`, `lifecycle.ts`) :**
  - `VaultManager` supervise le Worker, relance en cas de crash inopiné et réinitialise l'état à fermé.
  - File d'attente à exécution sérialisée (`enqueue`) éliminant tout risque de collision transactionnelle.
  - Minuteur d'auto-verrouillage sur inactivité configurable (5m, 15m, 30m, désactivé) avec réinitialisation sur chaque opération.
  - Verrouillage automatique sur veille système ou verrouillage de session Windows (`powerMonitor.on('suspend')`, `powerMonitor.on('lock-screen')`).
  - Intégration à l'orchestrateur de fermeture propre `gracefulShutdown` via `closeVault` (délai borné à 2s).
  - Dialogues natifs Electron contrôlés par le Main (`showOpenDialog`, `showSaveDialog`) ; zéro accès disque arbitraire par le Renderer.
- **5. Moteur de Stockage Transactionnel & Reprise (`vaultStorage.ts`, `vaultLock.ts`, `vaultJournal.ts`) :**
  - Partitionnement `blobs/xx/*.enc` basé sur des UUIDs aléatoires opaques de 16 octets (zéro divulgation de hash en clair).
  - Somme de contrôle SHA-256 de bout en bout conservée exclusivement dans l'index chiffré (`index.enc`, sous-clé `vgv_meta`).
  - Double copie de sécurité de l'index (`index.enc.bak`) permettant la qualification en 4 états.
  - Verrou exclusif `.lock` avec PID et instanceId, interdiction absolue de forcer un verrou d'un processus tiers actif, forçage contrôlé après crash de worker dans le même process.
  - Règle de non-destruction externe : l'extraction et la suppression préservent scrupuleusement les fichiers originaux sur le disque hôte.
  - Protection anti-écrasement à l'extraction (`overwrite: false` par défaut, `DestinationConflictError`).
- **6. Interface Graphique Vanguard Vault (`VaultTab.tsx`, `Sidebar.tsx`, `App.tsx`) :**
  - Entrée « Vault » dans la barre latérale sous « VPN », titre de page « Vanguard Vault ».
  - 8 états d'interface complets : aucun coffre, assistant de création (3 étapes avec export kit de secours textuel hors coffre), coffre verrouillé (mot de passe ou clé Crockford), déverrouillage, coffre ouvert (explorateur, statistiques, recherche, auto-lock), opération en cours (jauge de progression + bouton d'annulation), bandeau mode dégradé, modales d'erreurs.
  - Respect scrupuleux de la charte graphique Vanguard (Space Grotesk, JetBrains Mono, Inter, variables CSS multi-thèmes).
- **7. Résultats des Bancs de Tests & Mesures Réelles :**
  - [`test-vault-crypto.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-vault-crypto.mjs) : **25 passed, 0 failed, code de sortie 0**.
  - [`test-vault-storage.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-vault-storage.mjs) : **17 passed, 0 failed, code de sortie 0**.
  - [`test-vault-worker-and-ipc.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-vault-worker-and-ipc.mjs) : **14 passed, 0 failed, code de sortie 0**.
  - **Total : 56 tests de validation automatisés au vert**.
  - TypeScript : `tsc -p tsconfig.json --noEmit` $\rightarrow$ **Code de sortie 0 (0 erreur)**.
  - Build complet : `npm run build` (Renderer + Main + VaultWorker + Electron-builder NSIS) $\rightarrow$ **Code de sortie 0**.
  - Mesure réelle sur fichier de 20 Mo en flux (320 blocs de 64 Ko) : Import 344 ms (58.1 Mo/s), Extraction 280 ms (71.3 Mo/s). Mémoire de référence RSS 131 Mo, pic post-import RSS 136.8 Mo ($\Delta$ +5.8 Mo), allocation de flux bornée à 64 Ko.
- **8. Périmètre respecté :**
  - Zéro fichier utilisateur manipulé ou chiffré (données de test synthétiques uniquement).
  - Aucune allégation d'invulnérabilité ou de certification indépendante.
  - Fonctionnalité d'exportation intégrée et validée (voir Lot 4 ci-dessous).

### 7. Lots de Finition Transversaux (Lots 1 à 4) — v0.1.6 Pré-Release
- **Statut exact :** **Lots 1, 2, 3 et 4 entièrement implémentés, raccordés et validés par bancs de tests automatisés (100% de réussite, 82/82 assertions au vert, TypeScript 0 erreur, build NSIS code 0).**
- **Lot 1 — Notifications & Sentinelle :**
  - **Source centrale unique (`notificationManager.ts`) :** Raccordement de tous les producteurs (Sécurité, Sentinelle, Maintenance, Pilotes, Réseau, VPN, Vault, Mises à jour). Définition formelle des 8 catégories et 4 sévérités.
  - **Déduplication anti-avalanche :** Fenêtre temporelle glissante de 15s par clé de déduplication pour éviter les rafales d'alertes visuelles.
  - **Règle absolue de sécurité :** Masquage automatique des secrets (tokens, passwords, recovery keys) par expressions régulières amont.
  - **Mode Ne Pas Déranger (DND) & Historique :** Persistance du mode DND filtrant les alertes non critiques tout en conservant l'historique exhaustif borné à 100 événements FIFO.
  - **Sentinelle & Préservation ADS (`downloadScanner.ts`) :** Suppression définitive du déblocage automatique de `Zone.Identifier` ADS. Traçabilité SmartScreen scrupuleusement préservée sur tous les fichiers téléchargés.
  - **File d'attente observable :** Capacité bornée à 20 requêtes avec état `getScannerQueueState()` exposé.
  - **Qualification des verdicts Defender :** Traitement unifié de `threat_remediated_by_defender`, `file_missing`, `suspect` (doubles extensions, usurpation de noms système Windows comme `svchost.exe`), et gestion de l'erreur Win32 `ERROR_VIRUS_INFECTED` (`errno: -4094`).
  - **Quarantaine isolée (`scanSession.ts`) :** Déplacement sécurisé vers `userData/quarantine` avec sidecar `.meta.json` horodaté.
  - **Banc de test :** [`test-lot1-notifications-and-scanner.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-lot1-notifications-and-scanner.mjs) $\rightarrow$ **16 passed, 0 failed**.
- **Lot 2 — Paramètres, Onboarding, Tray Windows :**
  - **Accessibilité & Préférences (`profile.ts`) :** Sauvegarde et restitution fidèles de `reduceAnimations` (classe CSS `reduce-motion` sur `<html>`), `dndEnabled`, `soundVolume` (slider 0-100), et `notificationCategories` (interrupteurs granulaires par catégorie). Préservation stricte des réglages réseau et boucliers lors des sauvegardes partielles.
  - **Sentinelle & Mode Discret (`SettingsTab.tsx`) :** Sélecteur de mode discret (`window`, `mini`, `notification`), `showModalEvenIfSafe` et `usbScanEnabled` sauvegardés via `api.saveScannerConfig`.
  - **Centre d'essai des notifications :** Boutons d'essai déclenchant de vraies notifications contextuelles typées avec actions de navigation ciblées.
  - **Cycle de vie de l'Onboarding (`OnboardingWizard.tsx`) :** Support des propriétés `initialTheme` et `onCancel` pour relance propre depuis les paramètres sans blocage d'étapes ni écrasement de profil. Complétion atomique avec `onboardingCompleted: true`.
  - **System Tray Windows complet (`index.ts`) :**
    - Entrée « 🔒 Vanguard Vault » avec état dynamique (« Coffre déverrouillé » / « Coffre verrouillé » / « Aucun coffre »), action « Ouvrir » et action « 🔒 Verrouiller le Coffre » (`vaultManager.lockVault()`) conditionnelle à l'état déverrouillé.
    - Entrée « 🛡️ Sécurité » avec statut Defender en direct et action « 🔍 Lancer une analyse rapide ».
    - Entrée « 🌐 Vanguard VPN » avec statut de connexion en direct et action de déconnexion.
    - Entrée « 🎮 Mode Gaming HUD » avec état synchronisé.
    - Clic et double-clic restaurant et focalisant la fenêtre principale.
  - **Banc de test :** [`test-lot2-settings-onboarding-tray.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-lot2-settings-onboarding-tray.mjs) $\rightarrow$ **11 passed, 0 failed**.
- **Lot 3 — Privilèges Windows & Mises à Jour :**
  - **Suppression définitive de la relance UAC inconditionnelle au démarrage :** Lancement standard en mode non privilégié sans popups bloquantes.
  - **Élévation UAC sécurisée (`adminHelper.ts`) :** Détection de l'annulation UAC par l'utilisateur (code 1223) sans fermeture intempestive de l'application (`app.exit(0)` conditionné au lancement effectif du nouveau process).
  - **Diagnostic factuel :** `getWindowsBuildInfo()` et `isAdmin(forceRefresh?: boolean)` retournant des informations factuelles du système d'exploitation.
  - **Catalogue fermé du Helper Privilégié (`privilegedHelper/`) :** Catalogue strict `ALLOWED_ACTIONS` (`GET_HELPER_STATUS`, `FLUSH_DNS`, `SET_DNS_PROVIDER`, `DISABLE_STARTUP_ENTRY`). Rejet déterministe avec `errorCode: 'UNKNOWN_ACTION'` de toute commande arbitraire.
  - **Gestionnaire de Mises à Jour (`updater.ts`) :** Machine à états `UpdaterState`, canal préversion, émission de notifications via `notificationManager.emit` (détection, téléchargement), libération du verrou d'instance unique avant application.
  - **Banc de test :** [`test-lot3-privileges-and-updater.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-lot3-privileges-and-updater.mjs) $\rightarrow$ **8 passed, 0 failed**.
- **Lot 4 — Export Vanguard Vault & Recette Finale :**
  - **Moteur d'Exportation (`vaultStorage.ts`, `vaultWorker.ts`, `vaultManager.ts`, `vaultProtocol.ts`) :**
    - Deux modes d'exportation étanches :
      1. `backup_encrypted` : Copie intégrale et vérifiée des fichiers du coffre (`vault.header`, `index.enc`, arborescence `blobs/`) vers un dossier de destination. Le coffre de sauvegarde est 100% autonome et déverrouillable indépendamment.
      2. `extract_all_plaintext` : Extraction récursive de tous les fichiers indexés avec recalcul de somme de contrôle SHA-256 de bout en bout et préservation de l'arborescence des dossiers.
    - Progression en flux et annulation en vol (`AbortController`).
    - Règle absolue de non-destruction : Le coffre source et ses fichiers restent 100% intacts après l'exportation.
  - **Interface & IPC (`vaultIpc.ts`, `preload/index.ts`, `VaultTab.tsx`) :**
    - Dialogues natifs Electron contrôlés par le Main (`vault:select-export-dest`, `vault:export`).
    - Deux actions strictement séparées dans l'interface : « Sauvegarder copie chiffrée » (vers un dossier) et « Extraire tous les fichiers en clair » (avec confirmation explicite des risques).
    - Protection de sécurité de chemin : interdiction absolue d'exporter vers un dossier situé à l'intérieur du coffre source ou sur le coffre lui-même (anti-récursion).
    - L'archive portable unique (.vgv) et sa réimportation restent consignées comme **exigence restante** (non abandonnée).
  - **Banc de test :** [`test-lot4-vault-export.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-lot4-vault-export.mjs) $\rightarrow$ **5 passed, 0 failed**.
- **Ajustements de Finition Pré-Release :**
  - **Mises à Jour — Coordination des opérations sensibles ([`updater.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/updater.ts), [`index.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/index.ts)) :**
    - Parcours « mise à jour téléchargée -> attente opérations sensibles -> arrêt propre -> installation -> relance » branché sur `gracefulShutdown({ skipAppQuit: true })`.
    - Clôture ordonnée du coffre Vault et déconnexion VPN préalables à l'appel `autoUpdater.quitAndInstall()`.
    - Libération du mutex d'instance unique.
  - **Secours informatif des Mises à Jour ([`updateFallback.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/updateFallback.ts)) :**
    - Déclenchement passif sans token uniquement si la recherche principale échoue.
    - Tri sémantique SemVer 2.0.0 strict (rejet des comparaisons lexicographiques).
    - Respect des canaux (bêta / pré-releases filtrées selon `allowPrerelease`).
    - Cooldown de 15 minutes et cache.
    - Distinction rigoureuse des 4 statuts : `main_check_unavailable`, `fallback_new_version_detected`, `fallback_no_newer_version`, `fallback_unavailable`.
  - **Privilèges Windows ([`adminHelper.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/adminHelper.ts), [`package.json`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/package.json)) :**
    - **Statut : Exigence Partielle.**
    - Suppression de l'appel automatique `schtasks` / registre au démarrage.
    - Application configurée en `asInvoker` pour exécution standard sans UAC au lancement.
    - Aucune mémorisation de droits sans UAC ponctuelle.
  - **Sentinelle — Saturation & Réconciliation ([`downloadScanner.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/downloadScanner.ts)) :**
    - File d'attente 20 éléments avec mise en attente différée FIFO jusqu'à 50 éléments.
    - Drainage continu sans perte d'éléments différés.
    - Signalement persistant des éléments non analysés en cas de saturation critique (`isFullyScanned === false`).
    - Préservation formelle de `Zone.Identifier` ADS.
  - **Quarantaine Locale ([`scanSession.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/scanSession.ts)) :**
    - Qualification honnête en « isolation locale (renommage non exécutable) ».
    - Ajout des fonctions `restoreQuarantinedFile` et `deleteQuarantinedFile`.
  - **Onboarding & Tray ([`OnboardingWizard.tsx`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/components/OnboardingWizard.tsx), [`index.ts`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/src/main/index.ts)) :**
    - Élimination de la mention "anti-bufferbloat" de l'étape 5.
    - Libellé du Tray ajusté en « 🎮 Afficher / masquer le HUD ».
  - **Banc de test complémentaire :** [`test-updater-fallback-and-saturation.mjs`](file:///f:/code/Astral-Security-Guard-vpn-main/astral-desktop/scripts/test-updater-fallback-and-saturation.mjs) $\rightarrow$ **10 passed, 0 failed**.

---

## Protocole de Recette Manuelle Réseau & VPN

Pour les vérifications en session graphique réelle :

### Phase 1 : Observation Passive (Sans Modification Système)
1. Ouvrir l'onglet **Réseau** (« Connexion et diagnostic »).
2. Vérifier l'adaptateur détecté, l'adresse IP locale et la passerelle.
3. Vérifier les sondes passives vers Cloudflare (`1.1.1.1:443`) et Google (`8.8.8.8:53`).
4. Vérifier l'état de la passerelle : si la box filtre les ports 80 et 53, constater l'affichage « Port filtré / Non dispo » sans alerte d'erreur Internet bloquante.
5. Vérifier la tuile IPv6 : constater l'affichage explicite (« Liaison activée » ou « désactivée ») et la mention d'absence de modification par Vanguard.
6. Cliquer sur « Mesurer résolution » dans la section DNS : constater l'affichage en ms de la Requête A pour chaque fournisseur sans modification des paramètres système.

### Phase 2 : Mesure de Débit (Speedtest Réel)
> **Avertissement :** Le test de débit WAN réel télécharge et envoie des données multi-flux réelles pouvant consommer entre 50 Mo et 200 Mo de forfait data selon le débit de la ligne.
1. Cliquer sur « Lancer le test de débit ».
2. Vérifier l'aiguille dynamique et l'adaptation automatique de l'échelle (100M, 500M, 1G, 2.5G, 10G).
3. Tester le bouton « Annuler » en cours de mesure : vérifier l'arrêt immédiat des transferts et la libération des sockets.
4. Sur un test complet : vérifier l'affichage des 3 dimensions (Capacité de transfert, Réactivité au repos, Stabilité sous charge avec ratio de sondes réussies) et la règle anti-masquage sur la note globale.

### Phase 3 : Opérations Système avec Confirmation & Gestion des Conflits
1. **Purge du cache DNS :** Cliquer sur « Purger cache DNS », vérifier la confirmation.
2. **Calibrage TCP/IP :** Cliquer sur « Calibrer pile TCP/IP », vérifier la confirmation ou la demande d'élévation administrateur.
3. **Changement de résolveur DNS :** Sélectionner « Cloudflare » ou « Google », vérifier l'application sur la carte réseau active.
4. **Scénario de Conflit Tiers :**
   - Modifier manuellement l'adresse DNS dans les paramètres réseau Windows (ex: définir `9.9.9.9`).
   - Revenir dans Vanguard et cliquer sur « Restaurer origine ».
   - Constater que Vanguard **n'écrase pas** la modification et affiche l'alerte « Conflit de configuration détecté ».
   - Tester le bouton « Conserver l'état actuel » : constater que le réglage Windows reste à `9.9.9.9`.
   - Re-cliquer sur « Restaurer origine » puis « Forcer la restauration d'origine » : constater le rétablissement de la configuration initiale pré-Vanguard.

---

## Réserves Transversales & Comportements Non Vérifiés
1. **Rendu Electron en direct :** L'environnement headless Windows ne permettant pas d'afficher de fenêtre GPU/Direct3D interactive, les parcours visuels en direct (différents thèmes, redimensionnement étroit, clics souris temps réel) doivent être validés en recette manuelle.
2. **Mesure de débit WAN réelle :** Les tests automatisés ont été exécutés sur boucle locale contrôlée (sans consommer le quota utilisateur) ; le débit maximum sur ligne physique dépendra de la connexion réelle de l'utilisateur.
3. **Consommation CPU/PowerShell :** Boucle unifiée toutes les 8s à profiler sous charge réelle.
4. **Pilotes GPU & BIOS :** Limites documentées constructeur ASUS (API fermée) et NVIDIA (versions avancées catalogue).
