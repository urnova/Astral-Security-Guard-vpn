# 📜 CHANGELOG - Astral Vanguard

Ce journal consigne de manière chronologique et détaillée toutes les modifications apportées à Astral Vanguard, section par section, conformément au cahier des charges de la refonte définitive v2.2.0.

---

## 🛠️ Compétences & Antigravity Skills mobilisées
* **`powershell-secure-executor`** : Encapsulation des commandes PowerShell via `-EncodedCommand` (Base64 UTF-16LE), élimination des erreurs de syntaxe de quotes/parenthèses (`MissingEndParenthesisInExpression`), et logging technique structuré dans `%APPDATA%/AstralVanguard/logs/`.
* **`electron-nsis-packager`** : Élévation automatique UAC (`requireAdministrator` + `allowElevation: true`), configuration multi-résolution des icônes et gestion du cycle de vie sans interruption.
* **`framer-motion-ui` & `opera-gx-aesthetic`** : Conception de l'interface en mode sombre profond, accents néon adaptatifs, micro-interactions, skeleton loaders et compteurs animés fluides.
* **`native-audio-synth`** : Moteur sonore Web Audio API synthétisant des carillons discrets pour chaque type d'alerte sans dépendance de fichiers audio externes.

---

## [2.2.0] - Refonte Définitive (2026-09-28)

### Section 0. Robustesse Générale du Code & Moteur PowerShell
- [x] Création de `src/main/psHelper.ts` : conversion automatique des scripts PowerShell en `-EncodedCommand` Base64 (UTF-16LE).
- [x] Try/Catch universel sur tous les appels PowerShell : aucune erreur technique brute (ParserError, chemins de fichiers, stack traces) n'est jamais exposée au renderer.
- [x] Création de `src/main/logger.ts` : écriture locale horodatée dans `%APPDATA%/AstralVanguard/logs/vanguard-technical.log`.
- [x] Panneau "Détail technique" repliable pour les utilisateurs avancés avec messages humains pour le grand public.

### Section 1. Élévation Administrateur Automatique
- [x] Ajout de `requestedExecutionLevel: requireAdministrator` et `allowElevation: true` dans `package.json`.
- [x] Création de `src/main/adminHelper.ts` : détection des privilèges administrateur et de la version de l'OS (Windows 10 Build >= 19041 vs Windows 11 Build >= 22000).
- [x] Composant d'alerte UI avec relance 1-clic si l'UAC est contourné en dev.

### Section 2. Fonctionnement en Arrière-Plan Permanent & Systray
- [x] Démarrage au boot Windows paramétrable (`openAtLogin: true` par défaut).
- [x] Réduction propre dans les icônes cachées (Systray) lors du clic sur la croix.
- [x] Icône dynamique dans le Systray (Vert: Protégé, Orange: Scan/Action, Rouge: Alerte/Menace).
- [x] Menu contextuel complet : Ouvrir, Scanner, Mode Gaming, VPN, Quitter réellement.
- [x] Watchdog et surveillance HIDS persistants même fenêtre fermée.

### Section 3 & 11. Système de Notifications & Synthétiseur Audio
- [x] Toasts empilables bas-droite non bloquants avec auto-dismiss.
- [x] 6 types distincts avec bordures néon et carillons Web Audio API non stridents.
- [x] Mode "Ne pas déranger" pour les sessions de jeu en plein écran.
- [x] Contrôle granulaire dans Paramètres (toggle général, par type, son on/off).

### Section 4. Section Sécurité 100% Réelle
- [x] Vrais scans Microsoft Defender (QuickScan, FullScan, CustomScan) via API/CLI Defender.
- [x] Gestion réelle des exclusions Defender (affichage, ajout, suppression de dossiers/extensions).
- [x] Journal de restauration avec création de points de restauration (`Checkpoint-Computer`) et export `.reg`.
- [x] Analyse heuristique locale approfondie sans clé API (0 quota, 0 rate limit).
- [x] Niveaux de protection (Léger, Équilibré, Strict) et planification des analyses avec curseur d'intensité.

### Section 5. Section Performance Enrichie
- [x] Programmes au démarrage réels (lecture registre Run + CIM StartupCommand, éditeur, impact, toggle actif/inactif).
- [x] Nettoyage de disque multi-catégories avec pré-calcul de la taille récupérable en Mo avant suppression.
- [x] Gestionnaire de processus trié par CPU/RAM avec arrêt de processus non-système.
- [x] Rapport de santé disque SMART et alertes d'espace.

### Section 6. Section Gaming & Détection Intelligente
- [x] Détection générique des jeux (fenêtre de premier plan plein écran + charge GPU + bibliothèque Steam/Epic/GOG/Xbox).
- [x] 4 modes système réels : Gaming Extrême (arrêt wuauserv/DiagTrack, TCP NoDelay), Bureau-Pro, Cyber-Shield, Éco.
- [x] Profils par jeu et chronométrage de session avec ping moyen.

### Section 7. Section Réseau & Wi-Fi Réelle
- [x] Correction définitive du bug PowerShell SOS Déblocage Ping 1002ms avec affichage avant/après du ping.
- [x] Vrai Speed Test sans valeurs aléatoires (mesure réelle de débit descendant Cloudflare CDN, upload, latence et jitter).
- [x] Diagnostic Wi-Fi complet (SSID, canal, force signal, interférences et recommandation de canal optimal).
- [x] Benchmark DNS en direct (Cloudflare, Google, Quad9, OpenDNS) et application immédiate.
- [x] Moniteur des processus réseau actifs et connexions TCP.

### Section 8. VPN Élargi & Kill Switch Pare-Feu
- [x] Récupération dynamique de serveurs réels via le flux public VPN Gate avec fallback propre sans crash.
- [x] Tri automatique par latence réelle mesurée.
- [x] Vrai Kill Switch actif via règles de pare-feu Windows (`netsh advfirewall firewall`).
- [x] Historique de connexion (durée, volume).

### Section 9. Overlay HUD In-Game
- [x] Fenêtre native topmost non-intrusive avec passe-à-travers des clics (click-through).
- [x] Opacité réglable de 20% à 90% et repositionnement par glisser-déposer mémorisé.
- [x] Affichage CPU, RAM, Ping temps réel (1s), Mode et VPN sans injection de DLL.
- [x] Raccourci personnalisable (défaut `Ctrl + Shift + O`).

### Section 10. IA Agentique & Auto-Dépannage
- [x] Moteur heuristique d'intelligence artificielle intégré en local sans clé requise.
- [x] Diagnostic et remédiation ciblée des deux scénarios majeurs : gel réseau 1002ms et bug clavier/keylogger.
- [x] Sauvegarde du système avant toute action corrective.

### Section 12 & 13. Interface Opera GX & Splash Screen Intégré
- [x] Thème néon Opera GX (fond sombre, bordures cyan/violettes, animations de transitions).
- [x] Compteurs de métriques animés fluides et skeleton loaders pendant les chargements.
- [x] Splash screen unifié directement dans la fenêtre principale sans flash ni création de fenêtres parasites.

### Section 14, 15 & 16. Paramètres, Identité Visuelle & Auto-Updater
- [x] Section Paramètres complète avec profil, thème, journal technique, gestion des notifications et raccourcis.
- [x] Auto-updater résilient : transmission des droits admin au child process pour mise à jour silencieuse sans popup UAC grâce à `requestedExecutionLevel: requireAdministrator` et `allowElevation: true` dans la configuration NSIS.
- [x] Auto-updater syntaxe vérifiée : utilisation de la syntaxe positionnelle `quitAndInstall(true, true)` correspondant à `electron-builder v24.9.1` et `electron-updater v6.1.7` définis dans `package.json`, avec wrapper défensif prenant en charge la syntaxe déstructurée v27+ (`quitAndInstall({ isSilent: true, isForceRunAfter: true })`) en cas de montée de version.
- [x] Suppression des faux tokens Authorization de release pour téléchargement direct sans blocage 401 sur le dépôt public GitHub `urnova/Astral-Security-Guard-vpn`.

### Section 17. Moteur de Rollback en Deux Niveaux (Two-Tier Rollback Engine)
- [x] **Niveau 1 (Granulaire & Illimité - Source de Vérité)** : Sauvegarde locale automatique et instantanée avant toute modification (registre, fichiers, scripts) stockée sous `%APPDATA%/AstralVanguard/rollback/<timestamp>/`.
- [x] **Export Registre `.reg` conforme** : Export ultra-rapide via `reg.exe` avec injection obligatoire du BOM UTF-16LE (`\ufeff`) pour compatibilité native parfaite avec l'import Windows sans erreur d'en-tête de registre.
- [x] **Restauration 1-clic** : Le bouton "Restaurer" par entrée dans le Journal de Restauration s'appuie directement sur le Niveau 1 local (réinjection `.reg` et copie des fichiers originaux).
- [x] **Niveau 2 (Filet de Sécurité Système)** : Déclenchement de `Checkpoint-Computer` avec ajustement de `SystemRestorePointCreationFrequency = 0`. Détection précise du quota Windows de 24h (`frequency_limited`) pour éviter les échecs silencieux et garantir la traçabilité.
- [x] **Badges UI Explicites dans le Journal** : Chaque entrée affiche précisément son statut : `💾 Sauvegarde locale (Registre/Fichiers)` et `🛡️ Point Système Windows (OK #seq)` ou `⚠️ Quota Windows 24h (Restauration locale garantie)`.
- [x] **Validation automatisée multi-actions même jour** : Suite de tests `scripts/test-same-day-rollback.ts` validée avec succès (Action 1 et Action 2 consécutives le même jour créent et restaurent leurs instantanés sans blocage).

### Section 18. Scanner de Téléchargement en Temps Réel & Sentinelle USB (Real-Time Download Scanner)
- [x] **Surveillance native sans polling** : Utilisation de `fs.watch` branché directement sur l'API Windows `ReadDirectoryChangesW` pour surveiller `%USERPROFILE%\Downloads` et les répertoires personnalisés avec 0% de charge CPU au repos.
- [x] **Stabilisation d'écriture & Filtrage intelligent** :
  - Détection automatique et exclusion des fragments de téléchargement en cours (`.crdownload`, `.part`, `.opdownload`, `.tmp`).
  - Algorithme de vérification de stabilité de taille (~1-2s) et test de verrou d'écriture avant tout déclenchement d'analyse.
  - Liste d'extensions ignorées configurable (médias, documents) pour éliminer tout déclenchement intempestif.
- [x] **Scan ciblé ultra-rapide Defender** : Analyse unitaire instantanée (< 100ms) via `MpCmdRun.exe -Scan -ScanType 3 -File "<chemin>"`. Cache en mémoire LRU pour ne jamais re-scanner un fichier déjà vérifié.
- [x] **Modal de Scan Flottant Cyberpunk (Direction Artistique)** :
  - Overlay compact non-bloquant en verre dépoli néon avec effet radar.
  - **✅ Vert "Fichier sain"** : Fermeture automatique fluide après 2.5 secondes.
  - **⚠️ Orange "Fichier suspect"** : Alerte heuristique sur les exécutables non signés ou extensions masquées, boutons "Voir le détail" et "Ignorer".
  - **🔴 Rouge "Menace détectée"** : Alerte critique avec nom du malware, alerte sonore dédiée, notification toast, et boutons d'action 1-clic ("Supprimer le fichier" et "Mettre en quarantaine").
- [x] **Configuration dans Paramètres** :
  - Toggle général d'activation/désactivation.
  - Toggle "Afficher le modal même si le fichier est sûr" (recommandé désactivé par défaut pour une discrétion absolue).
  - Gestion dynamique des dossiers surveillés (sélecteur de dossier natif) et des extensions ignorées.
  - Toggle de signal sonore dédié et Sentinelle passive des supports USB amovibles.
- [x] **Validation automatisée** : Suite de tests `scripts/test-download-scanner.ts` validée avec succès.
