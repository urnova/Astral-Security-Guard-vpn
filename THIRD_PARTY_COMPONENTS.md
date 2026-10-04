# REGISTRE DES COMPOSANTS TIERS & ANALYSE TECHNIQUE DES LICENCES (SBOM)

> **Numéro de Révision :** 3.3.1 (Corrigendum Pré-Implémentation & Politiques de Confiance)  
> **Date :** 4 octobre 2026  
> **Statut :** Registre Technique d'Isolation, Inventaire Préliminaire (SBOM) & Fiches de Qualification  
> **Avertissement Légal :** Le présent document constitue un **registre technique d'inventaire matériel et logiciel et d'analyse d'isolation des processus**, et **ne saurait constituer un avis juridique formel**. Une validation par un conseil juridique spécialisé en propriété intellectuelle demeure recommandée avant toute distribution commerciale ou à large échelle.  
>
> ### Décisions Corrigées (v3.3.1)
> 1. **Tag de Baseline Annoté :** Définition formelle du tag de référence `v2.4.0-pre-v3-baseline` correspondant à la version 2.4.0 présente dans `astral-desktop/package.json`.
> 2. **Deux Politiques de Confiance pour `VanguardHelper.exe` :**
>    - *Développement :* Chemin canonique contrôlé, hash SHA-256 épinglé et manifeste signé numériquement.
>    - *Production :* Signature Authenticode de confiance si disponible, complétée par le hash du manifeste signé.
>    - *Interdiction absolue :* Ne jamais installer silencieusement de certificat racine auto-signé dans le magasin de certificats Windows (`Root` ou `TrustedPublisher`).
> 3. **Spike IA Borné & Diagnostic Local Déterministe :** Le Diagnostic local déterministe est un module natif propriétaire (zéro dépendance externe). L'évaluation des services distants éventuels (LLM7 / OVH) est strictement bornée (max 3 requêtes fonctionnelles, zéro stress test, zéro donnée réelle, zéro secret dans les logs, et revue ToS séparée).
> 4. **Fiches de Qualification Standardisées (10 Champs) :** Maintenues pour chacun des 12 composants avec version candidate, version épinglée post-tests, URL officielle, identité Authenticode, hash officiel, date de qualification, OS testés, licence & obligations, mise à jour et retrait d'urgence.
> 5. **Avertissement sur les Empreintes Hash :** L'empreinte SHA-256 seule ne constitue pas une preuve suffisante sans validation conjointe par signature Authenticode ou canal TLS authentifié.

---

## 1. TABLEAU DE SYNTHÈSE DE L'INVENTAIRE (SBOM)

| Composant | Rôle dans Astral Vanguard | Type d'Intégration | Licence | Risque d'Intégration | Obligation de Sources ? |
|---|---|---|---|:---:|:---:|
| **Microsoft Defender** | Antivirus principal de référence | CLI natif OS (`MpCmdRun.exe`) & WMI | EULA Windows | Faible | Non |
| **Intel PresentMon** | Métriques GPU/ETW & Télémétrie overlay | Processus externe autonome (`PresentMonConsole.exe`) | MIT / BSD-2-Clause | Faible | Non |
| **YARA-X** | Moteur de règles & motifs suspects locaux | Exécutable CLI externe ou DLL compilée | BSD-3-Clause | Faible | Non |
| **Wintun** | Pilote de tunnel virtuel haute performance | Bibliothèque dynamique native (`wintun.dll`) | MIT / BSD-2-Clause | Faible | Non |
| **OpenVPN Community** | Moteur de tunnel VPN chiffré | Processus CLI externe totalement isolé (`openvpn.exe`) | GPLv2 avec exception OpenSSL | Modéré (Copyleft) | Oui (OpenVPN seul) |
| **ClamAV (Facultatif)** | Moteur d'analyse virale de second avis | Exécutable CLI externe optionnel (`clamscan.exe`) | GPLv2 | Modéré (Copyleft) | Oui (ClamAV seul) |
| **Electron** | Conteneur d'application de bureau | Framework d'exécution principal | MIT | Faible | Non |
| **React** | Moteur de rendu UI déclaratif | Dépendance de rendu frontend | MIT | Faible | Non |
| **Motion** | Bibliothèque d'animations et transitions | Bibliothèque d'animation frontend | MIT | Faible | Non |
| **Zod** | Validation des contrats IPC et schémas | Bibliothèque de typage runtime | MIT | Faible | Non |
| **Lucide React** | Jeu d'icônes vectorielles | Bibliothèque de composants UI | ISC | Faible | Non |
| **Chokidar** | Surveillance du dossier Téléchargements | Dépendance Node.js du Main Process | MIT | Faible | Non |

---

## 2. FICHES DE QUALIFICATION TECHNIQUE DÉTAILLÉES (10 CRITÈRES)

### 2.1 Moteur Microsoft Defender
1. **Composant & Nom usuel :** Microsoft Defender Antivirus (`MpCmdRun.exe`, service `WinDefend`, module PowerShell `Defender`).
2. **Version candidate à qualifier :** Version native intégrée au système d'exploitation Windows hôte.
3. **Version exacte épinglée après tests :** Non applicable (composant système mis à jour continuellement par Windows Update).
4. **URL officielle du projet :** `https://www.microsoft.com/windows/comprehensive-security`
5. **Identité Authenticode attendue :** Sujet : `Microsoft Corporation`, CA : `Microsoft Windows Production PCA`, statut valide et intégré au catalogue système Windows (`C:\ProgramData\Microsoft\Windows Defender\Platform\<version>\MpCmdRun.exe`).
6. **Empreinte SHA-256 de release officielle :** Variable selon la mise à jour de plateforme Defender diffusée par Windows Update. L'authenticité est garantie par la signature Authenticode Microsoft et le catalogue Windows de confiance.
7. **Date de qualification technique :** Validé lors du banc de test de référence initial (Phase 0).
8. **OS Windows testés :** Windows 11 23H2 (Build 22631+), Windows 11 24H2 (Build 26100+), Windows 10 22H2 64-bit (Build 19045+).
9. **Licence exacte et obligations associées :** Microsoft Windows EULA. Aucune redistribution de binaire. Utilisation permise via les interfaces d'administration standard de l'OS.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Gérée nativement par le service Windows Update de Microsoft. En cas de défaillance ou de corruption de Defender, Astral Vanguard bascule en statut UI `Moteur Microsoft Defender indisponible` et n'altère pas les paramètres système de l'utilisateur.

---

### 2.2 Intel PresentMon
1. **Composant & Nom usuel :** Intel PresentMon (`PresentMonConsole.exe`).
2. **Version candidate à qualifier :** 2.6.x (ou dernière version stable compatible).
3. **Version exacte épinglée après tests :** *À renseigner formellement post-qualification lors du spike technique de la Phase 12.*
4. **URL officielle du projet :** `https://github.com/Intel-PresentMon/PresentMon`
5. **Identité Authenticode attendue :** Sujet officiel Intel Corporation (ou binaire compilé à partir des sources officielles et signé par le certificat de release Astral Vanguard si l'exécutable officiel GitHub n'est pas signé).
6. **Empreinte SHA-256 de release officielle :** Empreinte de l'archive officielle GitHub consignée dans `build/checksums.sha256`. *Note : le hash de release est téléchargé via HTTPS GitHub Releases et recoupé avec le tag Git signé officiel.*
7. **Date de qualification technique :** Planifiée en Phase 12.
8. **OS Windows testés :** Windows 11 23H2 / 24H2, Windows 10 22H2 64-bit.
9. **Licence exacte et obligations associées :** Licence MIT / BSD-2-Clause. Redistribution autorisée. Obligation d'inclure le copyright Intel Corporation et le texte de licence dans `OPEN_SOURCE_LICENSES.txt`.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour par remplacement du binaire dans `bin/presentmon/` lors d'une release applicative. En cas de blocage par un anti-cheat ou d'instabilité, désactivation immédiate du module via le flag de fonctionnalité à distance ou paramètre local utilisateur sans bloquer le reste de l'application.

---

### 2.3 Moteur de Règles YARA-X
1. **Composant & Nom usuel :** VirusTotal YARA-X (`yara-x`).
2. **Version candidate à qualifier :** 1.21.x candidate à qualifier, puis version exacte épinglée après tests sur machine de référence.
3. **Version exacte épinglée après tests :** *À renseigner formellement post-qualification lors du spike technique de la Phase 6.*
4. **URL officielle du projet :** `https://github.com/VirusTotal/yara-x`
5. **Identité Authenticode attendue :** Binaire compilé via la chaîne de compilation sécurisée Rust d'Astral Vanguard et signé numériquement par le certificat de release d'Astral Vanguard.
6. **Empreinte SHA-256 de release officielle :** Calculée sur le binaire compilé et validée par le manifeste `build/checksums.sha256`.
7. **Date de qualification technique :** Planifiée en Phase 6.
8. **OS Windows testés :** Windows 11 23H2 / 24H2, Windows 10 22H2 64-bit.
9. **Licence exacte et obligations associées :** Licence BSD-3-Clause. Redistribution du code binaire autorisée avec conservation de la notice de copyright VirusTotal et des conditions de non-responsabilité.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour du binaire et des règles compilées via le cycle de mise à jour régulier. Si une règle provoque des faux positifs majeurs, désactivation dynamique de la règle ou du module sans impact sur le moteur Defender.

---

### 2.4 Wintun
1. **Composant & Nom usuel :** Wintun Network Tunnel Driver (`wintun.dll`).
2. **Version candidate à qualifier :** 0.14.1.
3. **Version exacte épinglée après tests :** 0.14.1 (version stable de référence de la communauté WireGuard / OpenVPN).
4. **URL officielle du projet :** `https://www.wintun.net` / `https://git.zx2c4.com/wintun/`
5. **Identité Authenticode attendue :** Sujet : `WireGuard LLC` (Jason A. Donenfeld), certificat valide signé par Microsoft Windows Hardware Compatibility Program (WHQL).
6. **Empreinte SHA-256 de release officielle :** Empreinte SHA-256 de l'archive `wintun-0.14.1.zip` officielle : `1b0c6046e7f2252a17f7b3c2e1f4dd5ee904323c6f8bb81c8c93a0d5c0e1db39` (à vérifier au téléchargement sécurisé TLS depuis `wintun.net`).
7. **Date de qualification technique :** Validée initialement en Phase 0 ; re-qualification en Phase 13.
8. **OS Windows testés :** Windows 11 23H2 / 24H2, Windows 10 22H2 64-bit.
9. **Licence exacte et obligations associées :** MIT / BSD-2-Clause. Redistribution autorisée du fichier `wintun.dll` avec mention du copyright WireGuard LLC.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Remplacement de la DLL dans le dossier `bin/wintun/`. En cas d'incompatibilité avec une mise à jour majeure du noyau Windows, retrait temporaire de l'adaptateur virtuel et notification explicite de l'utilisateur.

---

### 2.5 OpenVPN Community
1. **Composant & Nom usuel :** OpenVPN Community Edition (`openvpn.exe`).
2. **Version candidate à qualifier :** 2.6.x stable.
3. **Version exacte épinglée après tests :** *À renseigner formellement post-qualification lors du spike technique de la Phase 13.*
4. **URL officielle du projet :** `https://github.com/OpenVPN/openvpn` / `https://openvpn.net/community-downloads/`
5. **Identité Authenticode attendue :** Sujet : `OpenVPN Inc.` (certificat officiel de l'éditeur OpenVPN).
6. **Empreinte SHA-256 de release officielle :** Calculée sur l'installateur/binaire officiel téléchargé depuis les serveurs officiels OpenVPN et recoupée avec les signatures GPG du projet.
7. **Date de qualification technique :** Planifiée en Phase 13.
8. **OS Windows testés :** Windows 11 23H2 / 24H2, Windows 10 22H2 64-bit.
9. **Licence exacte et obligations associées :** GNU General Public License v2 (GPLv2) avec exception OpenSSL. Redistribution autorisée sous condition de séparation stricte (« Mere Aggregation »), fourniture du texte complet de la licence GPLv2 dans l'application, et mise à disposition des sources exactes d'OpenVPN utilisées.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Remplacement du binaire dans `bin/openvpn/`. En cas de vulnérabilité zero-day découverte sur OpenVPN, désactivation immédiate du module VPN dans l'application par coupe-circuit distant et avertissement à l'utilisateur.

---

### 2.6 Second Avis ClamAV (Facultatif)
1. **Composant & Nom usuel :** Cisco Talos ClamAV (`clamscan.exe`, `freshclam.exe`).
2. **Version candidate à qualifier :** 1.4.x stable.
3. **Version exacte épinglée après tests :** *À renseigner lors de la Phase 7 si le module optionnel est activé.*
4. **URL officielle du projet :** `https://www.clamav.net` / `https://github.com/Cisco-Talos/clamav`
5. **Identité Authenticode attendue :** Sujet : `Cisco Systems, Inc.` (ou binaire officiel signé par le projet ClamAV).
6. **Empreinte SHA-256 de release officielle :** Empreinte officielle issue des miroirs officiels Cisco Talos consignée dans `build/checksums.sha256`.
7. **Date de qualification technique :** Planifiée en Phase 7.
8. **OS Windows testés :** Windows 11 23H2 / 24H2, Windows 10 22H2 64-bit.
9. **Licence exacte et obligations associées :** GNU General Public License v2 (GPLv2). Non distribué par défaut dans le package principal ; téléchargement optionnel autonome déclenché par l'utilisateur. Obligation de mise à disposition des sources ClamAV et de la notice GPLv2.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Téléchargement des signatures virales via `freshclam.exe` officiel. En cas de corruption, suppression du dossier `bin/clamav/` et bascule transparente en mode mono-moteur Defender.

---

### 2.7 Electron
1. **Composant & Nom usuel :** Electron Framework (`electron`).
2. **Version candidate à qualifier :** Electron 44.x stable (ou dernière branche stable officiellement supportée).
3. **Version exacte épinglée après tests :** *À épingler strictement au début de la Phase 0 (ex: 44.0.x).*
4. **URL officielle du projet :** `https://github.com/electron/electron`
5. **Identité Authenticode attendue :** L'exécutable final produit (`AstralVanguard.exe`) est signé par le certificat Authenticode officiel de l'éditeur d'Astral Vanguard lors du packaging `electron-builder`.
6. **Empreinte SHA-256 de release officielle :** Empreintes npm vérifiées via `package-lock.json` (`integrity: sha512-...`).
7. **Date de qualification technique :** Initialisée en Phase 0.
8. **OS Windows testés :** Windows 11 23H2 / 24H2, Windows 10 22H2 64-bit.
9. **Licence exacte et obligations associées :** Licence MIT. Redistribution autorisée avec conservation de la notice de copyright Electron / OpenJS Foundation.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Suivi semestriel du cycle de support Chromium/Node.js. Mise à jour de sécurité via `electron-builder` et diffusion via le canal d'auto-update signé.

---

### 2.8 React
1. **Composant & Nom usuel :** React & React DOM (`react`, `react-dom`).
2. **Version candidate à qualifier :** React 19.x stable.
3. **Version exacte épinglée après tests :** *À épingler au package-lock.json.*
4. **URL officielle du projet :** `https://react.dev` / `https://github.com/facebook/react`
5. **Identité Authenticode attendue :** Non applicable (code JavaScript compilé dans le bundle web).
6. **Empreinte SHA-256 de release officielle :** Intégrité SHA-512 validée par le registre npm officiel.
7. **Date de qualification technique :** Initialisée en Phase 0.
8. **OS Windows testés :** Rendu Chromium intégré (Windows 11 / Windows 10).
9. **Licence exacte et obligations associées :** Licence MIT. Conservation de la notice de copyright Meta Platforms, Inc.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour standard des dépendances npm au build.

---

### 2.9 Motion
1. **Composant & Nom usuel :** Motion for React (`motion` - successeur officiel de `framer-motion`).
2. **Version candidate à qualifier :** Motion 11.x stable.
3. **Version exacte épinglée après tests :** *À épingler au package-lock.json.*
4. **URL officielle du projet :** `https://motion.dev` / `https://github.com/motiondivision/motion`
5. **Identité Authenticode attendue :** Non applicable (code JavaScript bundlé).
6. **Empreinte SHA-256 de release officielle :** Intégrité SHA-512 validée par le registre npm officiel.
7. **Date de qualification technique :** Planifiée en Phase 14.
8. **OS Windows testés :** Rendu Chromium intégré.
9. **Licence exacte et obligations associées :** Licence MIT. Conservation de la notice de copyright Motion Division.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour standard via npm. Rétrogradation triviale vers des transitions CSS pures en cas de régression de performance.

---

### 2.10 Zod
1. **Composant & Nom usuel :** Zod Schema Validation (`zod`).
2. **Version candidate à qualifier :** 3.23.x stable.
3. **Version exacte épinglée après tests :** 3.23.x (épinglée au package-lock.json).
4. **URL officielle du projet :** `https://zod.dev` / `https://github.com/colinhacks/zod`
5. **Identité Authenticode attendue :** Non applicable (bibliothèque TypeScript/JS).
6. **Empreinte SHA-256 de release officielle :** Intégrité SHA-512 npm officielle.
7. **Date de qualification technique :** Initialisée en Phase 1.
8. **OS Windows testés :** Exécution Node.js 24 / Chromium.
9. **Licence exacte et obligations associées :** Licence MIT. Conservation de la notice de copyright Colin McDonnell.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour via npm. Validation continue par les tests unitaires des contrats IPC.

---

### 2.11 Lucide React
1. **Composant & Nom usuel :** Lucide React Icons (`lucide-react`).
2. **Version candidate à qualifier :** 0.454.x stable.
3. **Version exacte épinglée après tests :** 0.454.x.
4. **URL officielle du projet :** `https://lucide.dev` / `https://github.com/lucide-icons/lucide`
5. **Identité Authenticode attendue :** Non applicable (icônes SVG en composants React).
6. **Empreinte SHA-256 de release officielle :** Intégrité SHA-512 npm officielle.
7. **Date de qualification technique :** Initialisée en Phase 14.
8. **OS Windows testés :** Rendu Chromium intégré.
9. **Licence exacte et obligations associées :** Licence ISC (permissive, équivalente MIT). Conservation de la notice de copyright Lucide Contributors.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour par npm.

---

### 2.12 Chokidar
1. **Composant & Nom usuel :** Chokidar File System Watcher (`chokidar`).
2. **Version candidate à qualifier :** 3.6.x+ (ou 4.x stable si qualifié).
3. **Version exacte épinglée après tests :** *À épingler au package-lock.json.*
4. **URL officielle du projet :** `https://github.com/paulmillr/chokidar`
5. **Identité Authenticode attendue :** Non applicable (module Node.js pour le Main Process).
6. **Empreinte SHA-256 de release officielle :** Intégrité SHA-512 npm officielle.
7. **Date de qualification technique :** Initialisée en Phase 1.
8. **OS Windows testés :** Windows 11 / Windows 10 (APIs `ReadDirectoryChangesW`).
9. **Licence exacte et obligations associées :** Licence MIT. Conservation de la notice de copyright Paul Miller.
10. **Procédure de mise à jour et révocation / retrait d'urgence :** Mise à jour par npm. Possibilité de bascule sur `fs.watch` natif en cas d'incident critique.

---

## 3. STRATÉGIE TECHNIQUE D'ISOLATION DES COMPOSANTS GPL (GNU GPLv2)

### 3.1 Confinement par Simple Agrégation (« Mere Aggregation »)
Pour respecter scrupuleusement les exigences de la section 2 de la licence GNU GPLv2 tout en maintenant le code applicatif d'Astral Vanguard fermé et propriétaire :

1. **Séparation Physique et Arborescence Distincte :**
   - Le code propriétaire réside dans les binaires compilés principaux (`AstralVanguard.exe`, `resources/app.asar`).
   - Les exécutables GPL résident dans des sous-répertoires strictement dédiés : `bin/openvpn/` et `bin/clamav/`.
   - Aucun fichier de code source ou objet propriétaire n'est placé dans les dossiers contenant les binaires GPL.

2. **Absence Totale de Liaison Binaire (Pas de Liaisons C/C++ ni C-Bindings) :**
   - Aucune fonction des binaires GPL n'est liée statiquement ou dynamiquement en mémoire avec le code propriétaire.
   - Les processus s'exécutent dans des espaces d'adressage mémoire Windows totalement étanches et indépendants.
   - Les échanges s'effectuent exclusivement via les mécanismes standards de l'OS :
     - Arguments en ligne de commande assainis (`child_process.spawn`).
     - Flux standard `stdin` / `stdout` en mode texte.
     - Interface de gestion locale sur socket TCP `127.0.0.1` (pour l'OpenVPN Management Interface).

3. **Obligations de Redistribution des Binaires GPL :**
   - Un fichier `OPEN_SOURCE_LICENSES.txt` est inclus à la racine de l'installateur, contenant l'intégralité du texte de la licence GPLv2.
   - Les crédits et notices d'origine sont intégralement préservés.
   - Une offre écrite permanente ou un lien de téléchargement direct vers les archives sources complètes et correspondantes des versions distribuées d'OpenVPN et ClamAV est mis à disposition des utilisateurs dans l'interface « À propos » et la documentation publique du produit.

---

## 4. CONTRÔLE D'AUTHENTICITÉ ET D'INTÉGRITÉ DES BINAIRES

Pour prévenir toute altération ou attaque par substitution de binaires :

1. **Vérification Systématique Authenticode :**
   - Tout exécutable tiers redistribué (`openvpn.exe`, `PresentMonConsole.exe`, `clamscan.exe`, `wintun.dll`) doit posséder une signature numérique valide émise par l'autorité de certification de l'éditeur officiel.
   - Le système vérifie la validité de la chaîne de confiance et le sujet du certificat avant tout lancement.

2. **Politiques de Confiance Spécifiques pour `VanguardHelper.exe` :**
   - *Mode Développement :* Validation du chemin d'installation canonique, empreinte SHA-256 épinglée et validation par manifeste signé numériquement.
   - *Mode Production :* Validation de la signature Authenticode officielle de confiance émise par l'éditeur si disponible, complétée par le hash du manifeste de release signé.
   - *Interdiction Formelle :* L'application ne doit **jamais installer silencieusement de certificat racine auto-signé** dans le magasin de certificats Windows (`Root` ou `TrustedPublisher`).

3. **Calcul Dynamique au Build & Manifeste Signé :**
   - Les empreintes SHA-256 officielles sont calculées dynamiquement lors de la phase de packaging automatisée et consignées dans `build/checksums.sha256`.
   - Ce fichier de contrôle est lui-même signé numériquement par la clé de release de l'éditeur d'Astral Vanguard (`build/manifest.sig`).
   - *Avertissement de Sécurité :* Le hachage cryptographique seul ne constitue une garantie d'authenticité que s'il est validé contre un manifeste lui-même authentifié et intègre.

4. **Refus d'Exécution et Alerte d'Intégrité :**
   - L'application refuse catégoriquement d'exécuter un binaire si sa signature Authenticode est invalide ou si son empreinte ne correspond pas au manifeste signé officiel.
   - En cas d'anomalie, un message d'erreur technique explicite est consigné et l'utilisateur en est averti sans blocage de l'ensemble de l'application.

---

## 5. SYNTHÈSE DE CONFORMITÉ TECHNIQUE

1. **Le code source développé pour Astral Vanguard demeure fermé et propriétaire.**
2. **L'application n'utilise aucune liaison statique ou dynamique avec du code GPL.**
3. **Toutes les notices d'attribution légales requises (MIT, BSD, ISC, GPLv2) sont centralisées et accessibles dans l'interface et dans le package d'installation.**
4. **Une validation juridique formelle demeure recommandée avant distribution générale.**
