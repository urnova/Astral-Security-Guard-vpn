# PRODUCT REQUIREMENTS DOCUMENT (PRD) — ASTRAL VANGUARD v3.0

> **Numéro de Révision :** 3.3.1 (Corrigendum Pré-Implémentation & Portes Découplées)  
> **Date :** 4 octobre 2026  
> **Statut :** Spécification Validée Rev. 3.3.1 (Sous Réserve d'Exécution Exclusif Phase 0)  
> **Type de Licence :** Logiciel Propriétaire (Code Source Fermé)  
> **Modèle Économique :** 100% Gratuit pour l'utilisateur final (aucun frais facturé à l'utilisateur ; la disponibilité des services tiers et relais bénévoles n'est toutefois pas garantie dans la durée) — Zéro Compte — Zéro Clé API — Zéro Abonnement  
> **Plateforme Cible :** Microsoft Windows 11 (22H2, 23H2, 24H2) et Windows 10 22H2 (Build 19045+ uniquement, sous réserve du cycle ESU Microsoft) — Architecture x86_64  
>
> ### Décisions Corrigées (v3.3.1)
> 1. **Tag de Baseline Dérivé de `package.json` :** Utilisation formelle du tag annoté `v2.4.0-pre-v3-baseline` correspondant à la version 2.4.0 présente dans `astral-desktop/package.json`. Le tag pointera sur le commit exact audité et ne sera créé que sur un arbre de travail propre (`git status --porcelain` vide).
> 2. **DACL Named Pipe Restreinte au Logon SID :** Priorité absolue à une DACL composée uniquement du **Logon SID de la session interactive autorisée (`TokenLogonSid`)** et de `LOCAL_SYSTEM`. Exclusion de l'ACE globale au User SID afin de ne pas étendre l'accès aux autres sessions ou contextes réseau du même compte utilisateur.
> 3. **Politiques de Confiance pour `VanguardHelper.exe` :**
>    - *Développement :* Chemin canonique contrôlé, empreinte SHA-256 épinglée et manifeste signé numériquement.
>    - *Production :* Signature Authenticode de confiance de l'éditeur si disponible, complétée par le hash du manifeste de release signé.
>    - *Interdiction absolue :* Ne jamais installer silencieusement de certificat racine auto-signé dans le magasin de certificats Windows (`Root` ou `TrustedPublisher`).
> 4. **Sécurité des Nonces & Secrets :** Aucun nonce, jeton ou secret ne doit apparaître dans la ligne de commande (`Get-Process`), les journaux d'audit, les fichiers temporaires ou les rapports techniques.
> 5. **Clarification du « Diagnostic local déterministe » :** Renommé ainsi dans toute l'interface et la documentation. Il ne s'agit ni d'un LLM ni d'une IA agentique, mais d'un moteur déterministe d'agrégation basé sur des règles expertes et des pondérations pré-calculées. Une véritable fonction d'IA générative reste une option expérimentale, désactivée par défaut, et marquée `Indisponible` si aucun fournisseur distant ne réussit la qualification pré-implémentation.
> 6. **Spike IA Strictement Borné :** Maximum 3 requêtes fonctionnelles par endpoint, interdiction de tests de charge agressifs, interdiction d'épuisement de quota, zéro donnée utilisateur réelle, zéro secret dans les logs, et revue humaine séparée des conditions d'utilisation (ToS) et droits d'intégration.
> 7. **Découplage des Portes de Sécurité (Gating Matrix Corrigée) :** La correction de la suppression arbitraire de fichiers et des injections PowerShell (Phase 1) est autonome et n'est en aucun cas bloquée par le résultat du spike Named Pipe.
> 8. **Résultats Bornés au Périmètre des Tests :** Remplacement de toute prétention universelle par des résultats limités au périmètre exact des tests exécutés sur les plateformes de test documentées.

---

## 1. VISION DU PRODUIT & PROPOSITION DE VALEUR

### 1.1 Vision Globale
Astral Vanguard v3.0 est une suite Windows propriétaire complète, moderne, transparente et vérifiable réunissant au sein d'une interface haute performance :
1. **La cybersécurité multi-moteur locale** : supervision active du Moteur Microsoft Defender, second avis ClamAV facultatif isolé, moteur de règles YARA-X local, inspection AMSI des scripts et scanner de téléchargements en direct.
2. **Une analyse système transparente avec socle local garanti** : brief d'accueil assuré par défaut par le **Diagnostic local déterministe** (100% local, sans réseau, sans LLM) ; accès optionnel à des requêtes cloud pseudonymisées sans compte (LLM7/OVH sous réserve de qualification stricte), sans clé API et sans LLM local lourd.
3. **Une remédiation déterministe et contrôlée** : catalogue d'actions typées, vérification d'intégrité, snapshots de registre et points de restauration système avant toute action.
4. **L'optimisation des performances et le diagnostic système** : diagnostic mémoire transparent, gestionnaire de processus consommateurs, priorité de processus Windows mesurée, gestion exacte des plans d'alimentation, diagnostic SMART des disques et audit du démarrage.
5. **Un overlay HUD en jeu avec métriques réelles** : intégration d'Intel PresentMon (v2.6.x) pour un monitoring technique du framerate, frametime, 1% low, charge GPU/CPU et latence, sans promesse de gain magique.
6. **Des outils réseau et Wi-Fi précis** : speedtest multi-flux haute fidélité non falsifié, changement et benchmark de serveurs DNS, diagnostic de canal Wi-Fi `netsh`.
7. **Un tunnel VPN communautaire transparent** : catalogue dynamique VPN Gate, support strict et assaini des configurations `.ovpn` utilisateur avec validation CA, `remote-cert-tls server`, vérification effective du tunnel, détection des fuites DNS et affichage obligatoire `Identité du relais non vérifiée indépendamment` en l'absence d'ancrage fort.

Astral Vanguard n'est pas une simple interface graphique de Microsoft Defender. Microsoft Defender est l'un des moteurs intégrés, clairement identifié, tandis qu'Astral Vanguard assure l'orchestration globale, la corrélation multi-moteur, les règles YARA-X, le second avis ClamAV facultatif, la remédiation, les diagnostics système, le HUD gaming et le tunnel VPN communautaire.

### 1.2 Proposition de Valeur Unique
- Astral Vanguard n'exige **aucune inscription, aucun compte tiers, aucune carte bancaire, aucune clé API**.
- Astral Vanguard n'installe **aucun modèle de langage lourd localement** (pas d'Ollama, pas de LLM de plusieurs gigaoctets qui ralentit la machine ou sature le stockage).
- Astral Vanguard applique la **Règle de Vérité Technique** : chaque chiffre, graphique, détection ou statut affiché est vérifiable dans l'OS. Si une donnée n'est pas disponible, elle est explicitement notée `Indisponible`.

---

## 2. MODÈLE DE CONFIANCE, TRANSPARENCE & RÈGLES DE VÉRACITÉ

### 2.1 Règle de Vérité Technique
Il est formellement interdit :
- D'utiliser `Math.random()` ou tout algorithme pseudo-aléatoire pour générer de la télémétrie, des débits, des pings ou des FPS.
- D'utiliser des `setTimeout` ou `setInterval` pour simuler le temps d'exécution d'une analyse ou d'une opération.
- D'imposer des seuils minimaux artificiels (ex: plancher de speedtest forcé à 720 Mbps).
- D'afficher des serveurs, des adresses IP ou des pays qui ne correspondent à aucune infrastructure réseau réelle.
- De présenter un composant tiers sous un nom propriétaire trompeur (Microsoft Defender ne doit plus jamais être rebaptisé « Astral Vanguard Core »).
- D'afficher un message de succès pour une opération non exécutée ou ayant échoué en silence.

### 2.2 Chaîne de Vérification Obligatoire
Toute opération est considérée fonctionnelle uniquement si la chaîne suivante est démontrée :
$$\text{Interface} \longrightarrow \text{Handler Renderer} \longrightarrow \text{IPC Validé} \longrightarrow \text{Service Réel} \longrightarrow \text{Opération Windows/Réseau Réelle} \longrightarrow \text{Résultat Vérifié} \longrightarrow \text{Retour Structuré} \longrightarrow \text{Affichage Honnête} \longrightarrow \text{Journal d'Audit}$$

Si une donnée n'est pas disponible, l'interface affiche obligatoirement :
`Indisponible`

Si une fonctionnalité n'est pas encore développée, l'interface affiche explicitement :
`Fonctionnalité en cours de développement`

---

## 3. PUBLIC CIBLE & CAS D'USAGE

1. **Gamers PC & Compétiteurs :** Recherchant un overlay HUD technique avec métriques réelles issues de PresentMon, une gestion propre des priorités sans altérer la stabilité de Windows, et un choix éclairé des serveurs DNS.
2. **Utilisateurs Windows soucieux de sécurité :** Voulant un second avis rapide sur les fichiers téléchargés (double vérification Defender + YARA-X + ClamAV facultatif) sans subir de faux positifs bloquants ni d'antivirus tiers payant envahissant.
3. **Power Users & Techniciens :** Ayant besoin d'une console transparente pour auditer la mémoire, inspecter le démarrage, analyser les scripts suspects via AMSI et disposer d'une procédure de rollback tracée et testée à chaque modification.

---

## 4. PARCOURS UTILISATEURS DÉTAILLÉS (USER JOURNEYS)

### Parcours 1 : Premier Lancement & Diagnostic d'Accueil
1. L'utilisateur lance l'application sans droits d'administrateur (mode utilisateur standard `asInvoker`).
2. L'accueil présente immédiatement le **Diagnostic local déterministe** généré à partir des données réelles collectées (état Defender, disques, mémoire, démarrage). L'interface indique clairement : `Source : Diagnostic local déterministe (Règles locales)`.
3. Une option désactivée par défaut propose d'activer l'analyse assistée par IA cloud sans compte. Si l'utilisateur clique dessus, une modale d'information explicite :
   - Le nom du fournisseur qui sera contacté (affiché avant toute transmission).
   - Les données pseudonymisées envoyées (catégories, hashes, zéro document).
   - La visibilité technique de l'adresse IP réseau par le fournisseur.
   - Un bouton clair permettant de conserver à tout moment le mode `Diagnostic local uniquement`.
   - Si aucun fournisseur cloud n'a passé la qualification, l'option affiche : `IA générative : Indisponible`.

### Parcours 2 : Surveillance & Détection d'un Fichier Suspect
1. L'utilisateur télécharge un fichier (ex: dans `%USERPROFILE%\Downloads`) ou sollicite un scan manuel.
2. Pour un scan manuel, le Main Process ouvre la boîte de dialogue native Windows (`dialog.showOpenDialog`), résout le chemin canonique en interne et génère un `scanId` éphémère. Le renderer ne manipule à aucun moment de chemin de fichier arbitraire.
3. Pour un téléchargement intercepté par `DownloadScanner`, l'écriture est détectée dès stabilisation du flux disque.
4. Déclenchement du scan parallèle : Moteur Microsoft Defender (`MpCmdRun.exe -ReturnHR`) + YARA-X (règles compilées en mémoire).
5. Le `scanId` unique est enregistré dans le registre de session du Main Process avec le chemin canonique, le hash SHA-256, la date et la taille.
6. Une notification surgit affichant le statut :
   - Si sain : badge vert transparent discret.
   - Si suspect : modale d'alerte avec options claires : *Mise en Quarantaine*, *Explication technique*, *Supprimer*, ou *Ignorer*.

### Parcours 3 : Triage et Explication Technique d'une Détection
1. L'utilisateur clique sur « Expliquer la détection ».
2. Si le mode cloud est activé et qualifié, l'interface affiche le nom du fournisseur sélectionné (ex: `LLM7` ou `OVH`) et demande confirmation.
3. Le module `Anonymizer` transforme le chemin complet en catégorie (`USER_DOWNLOADS/FILE_001.exe`) et extrait le hash SHA-256 et le nom du malware (ex: `Trojan:Win32/Wacatac`).
4. Le prompt pseudonymisé est soumis au fournisseur retenu.
5. La réponse retournée est traitée comme **non fiable** : validation du schéma JSON, assainissement strict du Markdown (DOMPurify, interdiction de tout tag HTML ou script), et vérification qu'aucune consigne d'exécution n'est injectée.
6. L'IA ne peut jamais exécuter d'action elle-même : seul un bouton d'action manuelle typé est présenté à l'utilisateur. En cas d'échec ou d'absence de fournisseur qualifié, le **Diagnostic local déterministe** prend immédiatement le relais.

### Parcours 4 : Optimisation Gaming & Activation du HUD PresentMon
1. L'utilisateur lance son jeu et active le Mode Gaming dans Astral Vanguard.
2. L'application enregistre le GUID exact du plan d'alimentation actif dans l'OS, applique la priorité configurée (`Above Normal` ou `High`, jamais `Realtime`), et passe temporairement sur le profil Performances élevées.
3. L'utilisateur active l'overlay avec le raccourci `Ctrl+Shift+O`.
4. Le worker PresentMon (v2.6.x) tente d'initialiser la capture des traces ETW.
   - Si le jeu ou son anti-cheat bloque la capture : affichage clair de l'état `Capture bloquée par le jeu ou l'anti-cheat`.
   - Si la capture réussit : affichage en direct des FPS, du frametime et du 1% low.
5. À la fermeture du jeu ou de Vanguard, le plan d'alimentation précédent et les priorités initiales sont systématiquement restaurés.

### Parcours 5 : Connexion au Tunnel VPN Communautaire & Test de Fuite DNS
1. L'utilisateur ouvre l'onglet VPN et consulte la liste dynamique des serveurs VPN Gate récupérée en direct.
2. L'utilisateur choisit un serveur ou importe son propre fichier `.ovpn`.
3. Le fichier `.ovpn` est passé au **parser strict** :
   - Rejet immédiat de toute directive de script, hook, plugin, ou DLL.
   - Contrôle de la directive `remote-cert-tls server` et validation de la chaîne CA.
   - Si le profil contient `verify-x509-name` ou `peer-fingerprint`, validation stricte de l'identité du pair.
   - Si aucune identité forte n'est présente dans le catalogue, affichage de l'avertissement `Identité du relais non vérifiée indépendamment`.
4. Une configuration temporaire minimale et assainie est générée dans un répertoire privé sous ACLs strictes.
5. Le service VPN initialise l'adaptateur virtuel Wintun et lance le binaire `openvpn.exe`.
6. L'état reste « Connexion en cours... » jusqu'à la vérification externe de l'IP publique et du pays de sortie.
7. Une vérification de fuite DNS est exécutée en arrière-plan. Lors de la déconnexion, l'adaptateur Wintun est libéré, la route initiale restaurée, et le fichier temporaire effacé.

### Parcours 6 : Remédiation Système avec Procédure de Rollback Vérifiée
1. L'utilisateur choisit d'appliquer une recommandation d'optimisation (ex: désactiver une application au démarrage ou isoler un fichier suspect).
2. L'application vérifie les permissions : si une élévation est requise, une invite UAC ponctuelle est sollicitée pour démarrer le `PrivilegedHelper` via Named Pipe sécurisé avec DACL restreinte au Logon SID.
3. Une sauvegarde préalable est automatiquement effectuée : export `.reg` dans `%APPDATA%\AstralVanguard\rollback\<timestamp>\` et point de restauration système Windows si permis.
4. L'action est exécutée selon son schéma de validation strict.
5. L'interface consigne l'opération dans le **journal local à altération détectable** et propose immédiatement un bouton « Annuler / Rollback ».

---

## 5. EXIGENCES FONCTIONNELLES PAR MODULE

### MODULE 1 — SÉCURITÉ MULTI-MOTEUR & ANALYSES RÉELLES

#### 1.1 Supervision Moteur Microsoft Defender
- **Statut en temps réel :** Lecture directe via WMI/PowerShell (`Get-MpComputerStatus`) : état de l'antivirus, protection temps réel, moteur antispyware, date et version des signatures.
- **Mise à jour des signatures :** Déclenchement de `Update-MpSignature` avec rapport de statut réel.
- **Analyses Defender et Interprétation Multi-Facteurs :**
  - Analyse rapide (`Start-MpScan -ScanType QuickScan`).
  - Analyse complète (`Start-MpScan -ScanType FullScan`).
  - Analyse ciblée de fichier ou dossier via l'exécutable natif Microsoft `MpCmdRun.exe -Scan -ScanType 3 -File "<chemin>" -ReturnHR`.
  - **Règle d'interprétation stricte :** Aucun verdict ne repose sur le simple code de sortie.
    - Le code 0 signifie soit qu'aucune menace n'a été trouvée, soit qu'une menace a été détectée puis neutralisée par l'OS.
    - Le code 2 signifie qu'une menace active requiert une action, ou qu'une erreur d'analyse est survenue.
    - Le verdict final doit systématiquement corréler la valeur de HRESULT, l'historique `Get-MpThreatDetection`, les journaux d'événements Windows Defender, l'état effectif de remédiation et la fenêtre temporelle exacte du scan.
- **Test EICAR :** Remplacement de tout délai garanti par un temps d'analyse mesuré sans promesse universelle.
- **Gestion des exclusions :** Consultation (`Get-MpPreference`), ajout et suppression de dossiers d'exclusion avec validation stricte du chemin.
- **Affichage obligatoire :** Le moteur doit être explicitement nommé `Moteur Microsoft Defender`.

#### 1.2 Second Avis ClamAV Facultatif (Composant Externe Isolé)
- **Rôle :** Offrir une vérification croisée indépendante de Microsoft.
- **Statut juridique :** ClamAV est sous licence GPLv2. ClamAV n'est **ni lié statiquement, ni lié dynamiquement**. Il s'agit d'un exécutable externe autonome (`clamscan.exe`) invoqué en processus fils séparé via arguments CLI.
- **Mode de fonctionnement :**
  - Composant externe facultatif : téléchargé ou activé uniquement à la demande expresse de l'utilisateur.
  - Scan de fichier ou dossier ciblé.
  - Résultat indépendant étiqueté : `Second avis ClamAV facultatif : [Sain / Menace : Nom / Non installé]`.

#### 1.3 Moteur de Règles YARA-X (Règles Locales Rapides)
- **Rôle :** Analyse instantanée de signatures binaires, motifs d'obfuscation, webshells, scripts malveillants et indicateurs de compromission (IoC).
- **Statut juridique :** Licence BSD-3-Clause.
- **Version cible :** YARA-X 1.21.x candidate à qualifier, puis version exacte épinglée après tests sur machine de référence.
- **Architecture :**
  - Pack de règles compilé et versionné, distribué avec l'application.
  - Exécution en mémoire avec timeout strict (max 5 secondes par fichier) et limite d'allocation RAM.
  - Budget de performance mesuré par classe de taille de fichier (< 1 Mo, 1-10 Mo, > 10 Mo).
  - Résultat étiqueté : `Moteur de règles YARA-X : [Règles déclenchées ou Aucun motif suspect]`.

#### 1.4 Contrôle des Scripts & Flux via AMSI
- **Rôle :** Inspection à la volée des scripts PowerShell (`.ps1`), VBScript (`.vbs`), batch (`.bat`) et JavaScript (`.js`) avant exécution ou remédiation.
- **Fournisseur :** Interface standard Windows Antimalware Scan Interface (`AmsiScanBuffer`).
- **Affichage :** Fournisseur antimalware ayant répondu, résultat réel, ou état `Indisponible` si l'interrogation échoue.

#### 1.5 Scanner de Téléchargements en Direct
- Surveillance passive du dossier `%USERPROFILE%\Downloads` et des dossiers configurés par l'utilisateur via FileSystemWatcher (`chokidar`).
- Détection immédiate des doubles extensions trompeuses (ex: `facture.pdf.exe`).
- Détection des noms de binaires système usurpés dans Downloads (ex: `svchost.exe`, `csrss.exe`).
- Scan automatisé via Microsoft Defender et règles YARA-X dès la stabilisation de l'écriture du fichier.
- Affichage de la modale d'alerte avec options claires : Quarantaine, Suppression sécurisée, ou Autoriser.

#### 1.6 Synthèse et Corrélation des Résultats
Le verdict global est calculé par une matrice de décision déterministe documentée :
$$\text{Indice de Risque} = f(\text{Defender}, \text{ClamAV}, \text{YARA-X}, \text{AMSI})$$
- Chaque moteur conserve son verdict visible de manière indépendante. L'utilisateur voit exactement qui a détecté quoi.
- **Politique Authenticode :** L'état de signature numérique Authenticode est affiché comme métadonnée d'information technique, mais ne soustrait aucun point au score de risque calculé.

---

### MODULE 2 — ANALYSE SYSTÈME & DIAGNOSTIC LOCAL DÉTERMINISTE

#### 2.1 Rôle Exclusif & Socle Local Déterministe
- **Socle de Référence Immédiat :** Le **Diagnostic local déterministe** (100% local, sans réseau, sans LLM) génère le diagnostic d'accueil et les explications système. Il repose sur des règles expertes, des seuils de télémétrie et des pondérations pré-calculées. Il ne doit **jamais être qualifié de LLM ou d'IA agentique**.
- **Fournisseurs Cloud Expérimentaux Facultatifs :** LLM7 et OVH ne sont accessibles qu'après activation manuelle par l'utilisateur, soumise à un spike préalable de qualification contractuelle et technique.
- **Indisponibilité de l'IA Générative :** Si aucun fournisseur cloud ne réussit la qualification, la fonction générative reste marquée `Indisponible`, sans altérer le fonctionnement du Diagnostic local déterministe.
- **Interdictions Absolues :** L'analyse ne peut jamais prendre de décision d'assainissement automatique, ne peut exécuter aucune commande système, ne peut supprimer ou déplacer aucun fichier, ne peut modifier le registre, ne peut pas désactiver Defender, et ne reçoit aucun secret ni chemin de fichier réel.
- **Pas de Failover Silencieux :** En cas d'échec du fournisseur cloud sélectionné, aucun basculement silencieux vers un autre service distant n'est opéré : le Diagnostic local déterministe prend immédiatement le relais en local.
- **Traitement du Contenu Non Fiable :** Toute réponse provenant d'un tiers distant est strictement assainie (DOMPurify, aucun HTML brut, aucun script, aucun lien auto-ouvert).

#### 2.2 Politique de Pseudonymisation Stricte
Avant tout envoi vers un éventuel fournisseur cloud, les données sont pseudonymisées :
- Chemins absolus convertis en catégories (`USER_DOWNLOADS/FILE_001.exe`).
- Nom d'utilisateur Windows remplacé par `[USER]`.
- Adresse IP supprimée du prompt textuel.
- Zéro contenu binaire ou code brut transmis.

---

### MODULE 3 — REMÉDIATION CONTRÔLÉE & ARCHITECTURE PRIVILÉGIÉE

#### 3.1 Protocole de Suppression & Quarantaine Sécurisé (Indépendant du Spike Pipe)
La correction de la suppression arbitraire et des injections PowerShell est **prioritaire en Phase 1 et totalement indépendante du spike Named Pipe**.
Toute action de remédiation exige impérativement :
1. Un `scanId` valide et non expiré (durée de validité : 10 minutes maximum).
2. L'enregistrement côté Main Process du fichier préalablement scanné avec son ID.
3. Le chemin canonique (`fs.realpath`) conservé exclusivement côté Main (le renderer ne transmet jamais de chemin absolu).
4. Le contrôle du hash SHA-256 du fichier sur disque immédiatement avant l'action (protection anti-TOCTOU).
5. La cohérence stricte de la taille et de la date de modification (`mtime`).
6. Le refus formel des liens symboliques, jonctions NTFS et points d'analyse (`reparse points`).
7. La **Mise en Quarantaine comme action par défaut**.
8. Une confirmation utilisateur explicite avec seconde validation pour la suppression définitive.

#### 3.2 Privileged Helper & Sécurité Named Pipe (Phase 3)
- L'application s'exécute en utilisateur standard (`asInvoker`).
- Les actions privilégiées requérant les droits administrateur sont déléguées à `VanguardHelper.exe`, piloté via un Named Pipe Windows local (`\\.\pipe\AstralVanguard_Helper_<RandomNonce>`).
- **Politique de Confiance de `VanguardHelper.exe` :**
  - *Développement :* Chemin canonique contrôlé, hash SHA-256 épinglé et manifeste signé numériquement.
  - *Production :* Signature Authenticode de confiance de l'éditeur si disponible, plus hash du manifeste de release signé.
  - *Interdiction :* Ne jamais installer silencieusement de certificat racine auto-signé.
- **DACL Restreinte au Logon SID :**
  - La DACL est construite dynamiquement via l'API Win32 en accordant l'accès uniquement à :
    1. Le **Logon SID de la session interactive autorisée (`TokenLogonSid`)**.
    2. Le compte **`LOCAL_SYSTEM`**.
  - L'ACE au User SID n'est pas accordée afin de refuser formellement l'accès aux autres sessions du même compte.
- **Masque Client Minimal :** `0x00120183` excluant explicitement le bit `0x0004` (`FILE_CREATE_PIPE_INSTANCE` / `FILE_APPEND_DATA`), `WRITE_DAC`, `WRITE_OWNER` et `DELETE`.
- **Drapeaux Obligatoires :** `PIPE_REJECT_REMOTE_CLIENTS` et `FILE_FLAG_FIRST_PIPE_INSTANCE`.
- **Vérification Mutuelle :** Validation du PID appelant (`GetNamedPipeClientProcessId`) et vérification de la signature du processus client.
- **Gestion des Secrets :** Aucun nonce ou secret ne doit apparaître dans la ligne de commande, les logs ou les fichiers temporaires.
- **Catalogue Fermé :** Aucune commande shell libre (`cmd.exe` ou `powershell.exe`) n'est acceptée. Seuls les `actionId` typés du catalogue sont exécutés. Arrêt du Helper après exécution.

---

### MODULE 4 — OUTILS DE PERFORMANCE & DIAGNOSTIC MÉMOIRE

#### 4.1 Diagnostic Mémoire & Gestion du Working Set
- **Approche Principale :** Diagnostic transparent de la mémoire vive. Identification des processus les plus consommateurs, affichage des tendances et suggestion de fermeture manuelle à l'utilisateur. Aucune promesse de gain magique ou permanent.
- **Fonction Expérimentale `EmptyWorkingSet` :**
  - Option **expérimentale et désactivée par défaut**.
  - Mention explicite des conséquences techniques (vidage vers le pagefile, risque de défauts de page).
  - Exclusion stricte : processus système critiques (`csrss.exe`, `lsass.exe`, `services.exe`), processus actifs au premier plan, processus protégés et jeux vidéo.
  - Mesure d'impact évaluée dans la durée (T+0, T+60s, T+300s).

#### 4.2 Mesure Réelle de l'Activité Processeur (CPU)
- Échantillonnage différentiel sur deux fenêtres temporelles espacées de 500 ms ($\Delta \text{Idle} / \Delta \text{Total}$). Seuil d'écart cible documenté : $\le 2\%$ par rapport au Gestionnaire des tâches.

#### 4.3 Gestion du Démarrage & Diagnostic Matériel
- Énumération directe des clés de registre de démarrage avec sauvegarde miroir dans `HKCU\Software\AstralVanguard\RunBackup\`.
- Diagnostic SMART des disques via `Get-PhysicalDisk` et `Get-Disk`.

---

### MODULE 5 — GAMING & OVERLAY HUD AVEC INTEL PRESENTMON

#### 5.1 Mode Gaming Transparent
- Activation volontaire par l'utilisateur.
- Priorité configurable (`Above Normal` ou `High`, **strictement jamais `Realtime`**).
- Enregistrement du GUID exact du plan d'alimentation actif avant bascule, et restauration exacte de ce même plan.
- Zéro pourcentage d'augmentation de FPS garanti.

#### 5.2 Overlay HUD Intégré avec Intel PresentMon (v2.6.x)
- Capture d'événements ETW au niveau DirectX/Vulkan sans injection DLL.
- États explicites gérés dans l'interface : `Jeu détecté`, `Capture en cours`, `Capture non autorisée`, `Capture bloquée par le jeu ou l'anti-cheat`, `Métriques partielles`, `Indisponible`.
- Raccourci global `Ctrl+Shift+O`, arrêt complet des workers lors de la fermeture.

---

### MODULE 6 — RÉSEAU, DNS, SPEEDTEST & WI-FI

#### 6.1 Speedtest Réel & Honnête
- Suppression de tout plancher artificiel.
- Protocole multi-flux HTTPS vers les serveurs publics Cloudflare (`speed.cloudflare.com`).
- Affichage des chiffres bruts exacts.

#### 6.2 Sélecteur de Serveurs DNS Sécurisés
- Configuration 1-clic pour les cartes réseau physiques : Cloudflare (`1.1.1.1`), Google (`8.8.8.8`), Quad9 (`9.9.9.9`), ou DHCP automatique.
- Vidage systématique du cache local (`ipconfig /flushdns`).

#### 6.3 Diagnostic Wi-Fi Avancé
- Lecture des interfaces via `netsh wlan show interfaces`.
- Cartographie d'encombrement des canaux via `netsh wlan show networks mode=bssid`.

---

### MODULE 7 — TUNNEL VPN COMMUNAUTAIRE (VPN GATE & IMPORT OVPN SÉCURISÉ)

#### 7.1 Architecture & Traitement Sécurisé des Fichiers `.ovpn`
- Moteur sous-jacent : Exécutable officiel `openvpn.exe` isolé avec le pilote `wintun.dll`.
- Tout fichier `.ovpn` est considéré comme potentiellement hostile.
- Directive `remote-cert-tls server` et validation CA obligatoires.
- Application de `verify-x509-name` ou `peer-fingerprint` lorsque disponible. En l'absence d'ancrage fort, affichage obligatoire : `Identité du relais non vérifiée indépendamment`.
- Parser strict en liste blanche : rejet des scripts, plugins, DLLs et options d'élévation. Configuration temporaire assainie sous ACLs privées.

#### 7.2 Processus de Connexion Vérifié
L'état « Connecté » n'est acquis qu'après confirmation externe du changement effectif de l'IP publique et du pays de sortie, avec surveillance des fuites DNS.

---

## 6. EXIGENCES TECHNIQUES & BUDGETS DE PERFORMANCE

### 6.1 Sécurité de l'Exécution (Electron & Node.js)
- **Environnement d'Exécution :** Electron 44.x stable embarquant nativement Node.js 24.x LTS et Chromium correspondant.
- `contextIsolation: true` et `nodeIntegration: false` sur toutes les fenêtres.
- Balise CSP stricte sans `'unsafe-inline'` pour les scripts.
- Liste blanche hermétique des canaux IPC dans le preload.

### 6.2 Budgets de Performance (Cibles Mesurées sur Machine de Référence)
- **Consommation Mémoire en Arrière-plan :** Budget cible < 85 Mo de RAM (au repos dans le System Tray).
- **Consommation CPU au Repos :** Budget cible < 0.2% de CPU sur machine de référence.
- **Seuil d'Écart Télémétrie CPU :** Tolérance de test $\le 2\%$ par rapport à `Taskmgr`.
- **Diagnostic Local Déterministe :** Budget mesuré < 10 ms.
- **Taille du Bundle Client :** Budget cible < 350 Ko (code JS/CSS minifié produit par Vite, hors assets images et polices).

---

## 7. TERMINOLOGIE OFFICIELLE STRICTE

| Terme Banni | Terme Officiel Validé (v3.3.1) | Justification Technique |
|---|---|---|
| « Moteur Astral Vanguard Core » | **« Moteur Microsoft Defender »** | Honnêteté sur le moteur d'analyse sous-jacent. |
| « IA cloud anonyme » | **« IA cloud sans compte » / « Requête cloud pseudonymisée »** | Vérité sur la visibilité de l'adresse IP réseau par le fournisseur. |
| « DeterministicSummaryProvider » (côté utilisateur) | **« Diagnostic local déterministe »** | Clarté : moteur basé sur des règles expertes, non sur un modèle génératif. |
| « Purge de la Mémoire Vive » | **« Diagnostic Mémoire & Optimisation du Working Set (Expérimental) »** | Précision sur la nature de l'opération et ses effets de bord possibles. |
| « Mode E-Sport Extrême (+20% FPS) » | **« Mode Jeu : Priorité Haute & Gestion d'Alimentation »** | Zéro promesse de gain magique de framerate. |
| « Réseau Sécurisé 1 Gbps Chiffré » | **« Tunnel VPN Communautaire (VPN Gate) »** | Rappel de la nature bénévole et variable du réseau. |
| « Journal inaltérable » | **« Journal local à altération détectable »** | Exactitude cryptographique sur un stockage local Windows. |
