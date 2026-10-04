# AUDIT EXHAUSTIF ET INDÉPENDANT — APPLICATION ASTRAL VANGUARD (v2.4.0)

> **Document de référence pour refonte intégrale**  
> **Date de l'audit :** 4 octobre 2026  
> **Cible analysée :** `Astral-Security-Guard-vpn-main` (Branche principale / Workspace)  
> **Règle méthodologique appliquée :** Aucune fonctionnalité n'est qualifiée de « fonctionnelle » sur la base d'une réaction UI, d'un toast de succès ou d'une animation. Seule l'exécution effective du code système, vérifiable de bout en bout, est retenue comme réelle.

---

## SOMMAIRE

1. [ÉTAPE 1 — IDENTIFICATION DE LA STACK TECHNIQUE](#étape-1--identification-de-la-stack-technique)
2. [ÉTAPE 2 — CARTOGRAPHIE EXHAUSTIVE DU PROJET](#étape-2--cartographie-exhaustive-du-projet)
3. [ÉTAPE 3 — INVENTAIRE COMPLET DES ÉCRANS & VUES](#étape-3--inventaire-complet-des-écrans--vues)
4. [ÉTAPE 4 — RECHERCHE EXHAUSTIVE DU CODE FACTICE, SIMULÉ OU TROMPEUR](#étape-4--recherche-exhaustive-du-code-factice-simulé-ou-trompeur)
5. [ÉTAPE 5 — AUDIT DÉTAILLÉ DES FONCTIONNALITÉS RÉELLES](#étape-5--audit-détaillé-des-fonctionnalités-réelles)
   - 5.1 Informations Système & Télémétrie
   - 5.2 Antivirus & Sécurité
   - 5.3 Performance & Nettoyage
   - 5.4 Gaming, HUD & Optimisations
   - 5.5 Réseau, DNS, Speedtest & Wi-Fi
   - 5.6 VPN, Tunnels & Sécurité Réseau
6. [ÉTAPE 6 — AUDIT ELECTRON & SÉCURITÉ SYSTÈME](#étape-6--audit-electron--sécurité-système)
7. [ÉTAPE 7 — AUDIT DES BUGS, ERREURS SILENCIEUSES & DETTE TECHNIQUE](#étape-7--audit-des-bugs-erreurs-silencieuses--dette-technique)
8. [ÉTAPE 8 — AUDIT ERGONOMIQUE, VISUEL ET UX](#étape-8--audit-ergonomique-visuel-et-ux)
9. [ÉTAPE 9 — ANALYSE DU DESIGN SYSTEM](#étape-9--analyse-du-design-system)
10. [ÉTAPE 10 — MATRICE DES INTERACTIONS UTILISATEUR](#étape-10--matrice-des-interactions-utilisateur)
11. [ÉTAPE 11 — FAISABILITÉ PRODUIT & ARCHITECTURE CIBLE](#étape-11--faisabilité-produit--architecture-cible)
12. [ÉTAPE 12 — QUESTIONS BLOQUANTES POUR LE PLAN DE RECONSTRUCTION](#étape-12--questions-bloquantes-pour-le-plan-de-reconstruction)
13. [ÉTAPE 13 — RAPPORT FINAL DE SYNTHÈSE (SECTIONS A à P)](#étape-13--rapport-final-de-synthèse-sections-a-à-p)

---

## ÉTAPE 1 — IDENTIFICATION DE LA STACK TECHNIQUE

L'inspection directe des fichiers de configuration (`package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `tsconfig.json`) révèle la stack réelle suivante :

| Composant | Technologie réelle / Version trouvée dans les fichiers | Observation technique |
|---|---|---|
| **Framework Frontend** | React `19.1.0` (déclaré via `catalog:`) / React DOM `19.1.0` | Déclaré en devDependencies dans `astral-desktop/package.json`. |
| **Electron** | Electron `28.2.1` | Version Chromium 120 sous-jacente. |
| **TypeScript** | TypeScript `~5.9.3` (root) / `^5.x` | Compilateur configuré en mode strict partiel. |
| **Bundler & Dev Server** | Vite `^8.2.1` | Plugins : `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-electron` `0.28.2`, `vite-plugin-electron-renderer` `0.14.5`. |
| **Gestionnaire de paquets** | `npm` / `pnpm` (Workspace hybride désynchronisé) | La racine définit un `pnpm-workspace.yaml` (avec `packages: [artifacts/*, lib/*, scripts]`). Mais `astral-desktop` et `astral-website` ne sont PAS dans la liste des packages pnpm et possèdent leurs propres `package-lock.json` npm ! |
| **Système de styles** | Vanilla CSS étendu (`index.css` de 1113 lignes) + Tailwind CSS v4 (`@tailwindcss/vite`) | Conflit conceptuel : 95% des styles sont écrits en CSS vanilla avec classes manuelles (`.btn-primary`, `.card`, `.tab-scroll`) et variables CSS `:root`, tandis que Tailwind v4 est importé mais très peu utilisé. |
| **Bibliothèque de composants** | 56 composants `shadcn/ui` (Radix UI) installés dans `src/components/ui/` | **95% de code mort.** Seul `CollapsibleError.tsx` est importé par l'application réelle. Les 55 autres fichiers (`accordion`, `alert-dialog`, `calendar`, `carousel`, `sheet`, `table`, etc.) et la vingtaine de dépendances `@radix-ui/*` dorment dans le bundle. |
| **Bibliothèque d'icônes** | `lucide-react` `^0.545.0` | Utilisée massivement et de manière cohérente dans tous les écrans. |
| **Bibliothèque d'animations** | `motion` `^14.0.0` ET `framer-motion` `*` | **Redondance.** Certains fichiers importent `from 'motion/react'`, d'autres `from 'framer-motion'`, alourdissant inutilement le bundle. |
| **Gestion de l'état** | React Context API (`SystemContext.tsx`) + `useState` local | Aucun Redux, Zustand ou TanStack Query actif dans le desktop. Tout l'état global réside dans un unique `SystemContext.tsx` de 398 lignes. |
| **Routing** | Navigation par état local (`activeTab`) + Hash routing minimaliste dans `main.tsx` (`#/overlay`, `#/splash`) | Aucun React Router. Les onglets restent montés en mémoire avec `display: activeTab === '...' ? 'block' : 'none'`. |
| **Stockage local & DB** | Fichiers JSON locaux dans `%APPDATA%\AstralVanguard\` (`user-profile.json`, `scanner_config.json`, `rollback\log.json`) | La racine contient un dossier `lib/db` avec Drizzle ORM et PostgreSQL (`@workspace/db`), mais il est **totalement orphelin** et n'est jamais importé par le desktop. |
| **Code natif / Exécutables** | Exécutables tiers supposés dans `astral-desktop/bin/` | **Dossier vide.** Seul un `bin/README.md` est présent. ClamAV (`clamscan.exe`) et OpenVPN (`openvpn.exe`) sont absents du dépôt. Les appels natifs passent à 100% par des commandes PowerShell child_process. |
| **Scripts Node** | Scripts de release (`scripts/publish-release.mjs`) | Script ESM de publication GitHub Releases via API HTTPS. |
| **Services Windows** | **Aucun service Windows.** | Tout tourne dans le processus Electron standard avec privilèges Administrateur demandés via l'exécutable (`requireAdministrator`). |
| **Mécanisme IPC** | `contextBridge.exposeInMainWorld('vanguard', api)` | Communication unidirectionnelle et bidirectionnelle `ipcRenderer.invoke` <-> `ipcMain.handle` + `webContents.send`. |
| **APIs Externes** | - GitHub Releases API (`urnova/Astral-Security-Guard-vpn`)<br>- Cloudflare Speedtest endpoints (`speed.cloudflare.com/__down`, `__up`)<br>- VPN Gate CSV API (`vpngate.net/api/iphone/`) déclarée mais inactive. |
| **Packaging & Mises à jour** | `electron-builder` `24.9.1` (Cible NSIS x64) + `electron-updater` `6.1.7` | `requestedExecutionLevel: requireAdministrator`, auto-update branché sur GitHub Releases publiques. |

---

## ÉTAPE 2 — CARTOGRAPHIE DU PROJET

### Arborescence utile

```
Astral-Security-Guard-vpn-main/
├── package.json                   # Racine du repo (scripts typecheck, connecteurs Replit)
├── pnpm-workspace.yaml            # Config workspace (exclut astral-desktop !)
├── CHANGELOG.md                   # Journal des versions (affirmations parfois en décalage avec le code)
├── scripts/
│   └── publish-release.mjs        # Script de build et push vers GitHub Releases
├── artifacts/
│   └── api-server/                # [ABANDONNÉ / ORPHELIN] Serveur Express + Drizzle template Replit
├── lib/                           # [ABANDONNÉ / ORPHELIN] Modules api-client, api-spec, api-zod, db
├── astral-website/                # [SITE VITRINE] Landing page SPA React pour présentation web
└── astral-desktop/                # [APPLICATION PRINCIPALE ELECTRON]
    ├── package.json               # Config du desktop, dépendances et build NSIS
    ├── vite.config.ts             # Configuration Vite + vite-plugin-electron
    ├── index.html                 # Point d'entrée HTML + balise CSP
    ├── mockupPreviewPlugin.ts     # [ORPHELIN] Plugin Vite vestige de Replit
    ├── bin/                       # Dossier destiné aux binaires (Actuellement VIDE sauf README)
    ├── build/
    │   └── installer.nsh          # Script de personnalisation NSIS (kill processes, suppression appdata)
    ├── public/                    # Icônes (.ico, .png)
    └── src/
        ├── main.tsx               # Point d'entrée React avec routage hash (#/overlay, #/splash)
        ├── App.tsx                # Composant racine, orchestration des onglets, toasts et bannières
        ├── index.css              # Feuille de style maîtresse (1113 lignes, variables, resets, thèmes)
        ├── preload/
        │   └── index.ts           # Exposition de l'API window.vanguard via contextBridge
        ├── main/                  # Processus principal Electron
        │   ├── index.ts           # Boot de l'app, BrowserWindow, Tray, raccourcis globaux
        │   ├── adminHelper.ts     # Détection droits Admin (`net session`) et build Windows
        │   ├── psHelper.ts        # Exécuteur PowerShell en Base64 UTF-16LE (-EncodedCommand)
        │   ├── logger.ts          # Logging dans %APPDATA%/AstralVanguard/logs/
        │   ├── vpn.ts             # [SIMULATION MAJEURE] Gestionnaire VPN (Serveurs codés en dur, setTimeout)
        │   ├── security.ts        # [SIMULATION PARTIELLE] Scans antivirus factices + relais Defender
        │   ├── performance.ts     # [SIMULATION PARTIELLE] Métriques système, purge RAM factice
        │   ├── network.ts         # [HYBRIDE] Speedtest réel mais truqué en bas débit, DNS réel, Wi-Fi réel
        │   ├── gaming.ts          # [SIMULATION] Mode jeu sans aucune priorité CPU/OS réelle
        │   ├── doctor.ts          # Anti-lag, SOS Ping (flush DNS/ARP), watchdog ping
        │   ├── downloadScanner.ts # [RÉEL] Surveillance Downloads + MpCmdRun.exe Defender ciblé
        │   ├── rollback.ts        # [RÉEL] Snapshots de registre .reg et Checkpoint-Computer
        │   ├── notificationWindow.ts # Fenêtre flottante native frameless style Avast
        │   ├── updater.ts         # Intégration electron-updater avec GitHub Releases
        │   ├── profile.ts         # Persistance du profil et préférences en JSON
        │   ├── binHelper.ts       # Résolveur de chemins pour dossiers bin/
        │   ├── monitor.ts         # [CODE MORT] Surveillance Chokidar + ClamAV non raccordée
        │   └── behavior.ts        # [CODE MORT] Surveillance comportementale WMI non raccordée
        ├── context/
        │   └── SystemContext.tsx  # Store global React (télémétrie, état VPN, sécurité)
        ├── components/
        │   ├── AppTitlebar.tsx    # Barre de titre personnalisée (drag, statut de protection)
        │   ├── Sidebar.tsx        # Navigation latérale + badge profil utilisateur
        │   ├── SplashScreen.tsx   # Écran de transition initial animé (temporisation 1.2s)
        │   ├── OnboardingWizard.tsx # Assistant de premier lancement en 6 étapes
        │   ├── OverlayHUD.tsx     # Fenêtre HUD flottante transparente (FPS simulés)
        │   ├── DownloadScanModal.tsx # Modale d'alerte lors de la détection de téléchargement
        │   ├── UpdateModal.tsx    # Modale de téléchargement et installation de mise à jour
        │   ├── NotificationSystem.tsx # Toaster in-app bas-droite
        │   ├── common/
        │   │   ├── CyberToggle.tsx # Interrupteur stylisé réutilisable
        │   │   └── VanguardLogo.tsx # Composant SVG du logo
        │   ├── tabs/              # Écrans principaux
        │   │   ├── Dashboard.tsx  # Tableau de bord récapitulatif
        │   │   ├── SecurityTab.tsx # Analyses, exclusions, signatures
        │   │   ├── PerformanceTab.tsx # RAM, démarrage, santé disques
        │   │   ├── GamingTab.tsx  # Cockpit gaming, liste jeux, profils
        │   │   ├── NetworkTab.tsx # Speedtest, DNS, diagnostic Wi-Fi
        │   │   ├── VpnTab.tsx     # Cockpit VPN avec catalogue de pays
        │   │   └── SettingsTab.tsx # Configuration complète de l'application
        │   ├── mockups/           # [CODE MORT] Prototype AstralDashboard.tsx abandonné
        │   └── ui/                # 56 composants shadcn (quasi-totalité inutilisée)
        └── lib/
            ├── audioSynth.ts      # Synthétiseur audio Web Audio API autonome
            └── utils.ts           # Utilitaire clsx/twMerge
```

---

## ÉTAPE 3 — INVENTAIRE COMPLET DES ÉCRANS & VUES

| Écran | Route / Déclencheur | Fichier principal | Composants clés | Fonction attendue | État réel |
|---|---|---|---|---|---|
| **Splash Screen** | `#/splash` ou démarrage dans `App.tsx` | `SplashScreen.tsx` | `VanguardLogo`, timer progression | Affichage d'un chargement pendant la préchauffe système. | **Simulé** (Progression forcée à 1.2s via `setInterval` avec faux libellés d'étapes). |
| **Onboarding Wizard** | Affiché si `onboardingCompleted === false` | `OnboardingWizard.tsx` | Formulaire 6 étapes, `CyberToggle`, `VanguardLogo` | Configuration initiale du profil, thème et options au premier lancement. | **Fonctionnel et vérifié** (Sauvegarde bien dans `user-profile.json`). |
| **Accueil / Dashboard** | Tab `'dashboard'` | `Dashboard.tsx` | Pills télémétrie, modules cards, `CollapsibleError` | Vue d'ensemble du statut de sécurité et des métriques PC. | **Partiellement fonctionnel** (CPU/RAM/Disque réels via OS/PowerShell, statut Defender réel, mais bouton d'action renvoie vers des fonctions parfois simulées). |
| **Sécurité & Antivirus** | Tab `'security'` | `SecurityTab.tsx` | Scanner progress bar, liste menaces, éditeur d'exclusions | Analyses rapides/complètes, synchronisation Defender, gestion exclusions. | **Partiellement fonctionnel** (Exclusions Defender et signatures réelles ; mais la barre de scan est une boucle d'animation 100% simulée). |
| **Performance** | Tab `'performance'` | `PerformanceTab.tsx` | Gauges SVG, liste startup CIM, SMART disques, modal nettoyage | Nettoyage RAM, suppression fichiers temp, gestion démarrage. | **Partiellement fonctionnel** (SMART et Startup réels ; mais purge RAM factice via GC .NET éphémère, nettoyage temp basique). |
| **Gaming** | Tab `'gaming'` | `GamingTab.tsx` | Switch central, scan librairies (Steam/Epic), sélecteur de profils | Booster les perfs en jeu, détecter les jeux lancés, appliquer des priorités. | **Simulé** (Détection jeux installés réelle ; mais le mode activé ne modifie aucune priorité CPU/OS et les profils sont des coquilles vides). |
| **Réseau** | Tab `'network'` | `NetworkTab.tsx` | Speedomètre SVG, sélecteur DNS, modal Wi-Fi Optimizer | Speedtest réel, changement DNS, optimisation Wi-Fi et latence. | **Partiellement fonctionnel** (Changement DNS et Wi-Fi réels ; mais Speedtest forcé à min 720 Mbps, et Wi-Fi Optimizer 100% simulé avec rapport pré-rédigé). |
| **VPN** | Tab `'vpn'` | `VpnTab.tsx` | Liste pays/nœuds, interrupteur connexion, compteurs I/O, kill switch | Connexion à des serveurs VPN chiffrés, routage du trafic, kill switch. | **Simulé** (Aucun tunnel, aucun binaire OpenVPN/WireGuard, serveurs codés en dur, compteurs de bande passante générés par `Math.random()`). |
| **Paramètres & Profil** | Tab `'settings'` | `SettingsTab.tsx` | Menu vertical 11 sections, formulaires, toggles | Réglages généraux, autostart, son, notifications, thème, watchdog. | **Fonctionnel et vérifié** (Persistance des préférences, réglages démarrage Windows et volume audio fonctionnels). |
| **Overlay HUD** | `#/overlay` (Fenêtre dédiée Ctrl+Shift+O) | `OverlayHUD.tsx` | HUD compact / étendu, jauges CPU/RAM/Ping/FPS | Affichage tête-haute transparent au-dessus des jeux. | **Partiellement fonctionnel** (Fenêtre transparente et métriques CPU/RAM réelles ; mais FPS généré aléatoirement autour de 165). |
| **Notification Flottante (Avast-style)** | Déclenché depuis Main (`notifyUser`) | `notificationWindow.ts` | Fenêtre frameless HTML injectée | Affichage d'un toast système hors de l'application en bas à droite. | **Fonctionnel et vérifié** (Crée une vraie fenêtre BrowserWindow native avec carillon Web Audio). |
| **Modale Scan Téléchargement** | Déclenché par IPC `download-scanner:*` | `DownloadScanModal.tsx` | Carte d'alerte, boutons Quarantaine/Supprimer | Avertir lors d'un fichier téléchargé et proposer de le supprimer. | **Fonctionnel et vérifié** (Relié au vrai scan Defender `MpCmdRun.exe`). |
| **Modale Mise à jour** | Déclenché si mise à jour disponible | `UpdateModal.tsx` | Barre de progression Mo/%, bouton installer | Télécharger et appliquer les releases GitHub. | **Fonctionnel et vérifié** (Branché sur `electron-updater`). |

---

## ÉTAPE 4 — RECHERCHE EXHAUSTIVE DU CODE FACTICE, SIMULÉ OU TROMPEUR

Voici l'inventaire précis et vérifié des falsifications, simulations et données codées en dur trouvées dans le code source :

| Gravité | Fichier | Lignes | Fonction / Bloc | Simulation détectée | Comportement affiché | Réalité technique |
|---|---|---:|---|---|---|---|
| **Critique** | `src/main/vpn.ts` | 28–41 | `CURATED_INTERNATIONAL_SERVERS` | Adresses IP et scores factices codés en dur | Liste de 12 serveurs internationaux réputés ultra-rapides. | Simple tableau statique avec IPs arbitraires (`185.125.190.45`, etc.), pings et débits inventés. |
| **Critique** | `src/main/vpn.ts` | 160–172 | `ipcMain.handle('vpn:connect')` | `setTimeout` de 1800ms simulant un handshake VPN | « Tunnel Astral VPN Établi. Trafic sécurisé sans interférence. » | **Aucune connexion réseau.** Aucun adaptateur réseau créé, aucun paquet chiffré, simple variable booléenne `isConnected = true`. |
| **Critique** | `src/main/vpn.ts` | 195–203 | `ipcMain.handle('vpn:set-killswitch')` | Pseudo-killswitch | L'interface prétend couper internet en cas de perte du VPN. | La fonction se contente de supprimer des règles firewall et de basculer un booléen en mémoire. Aucun blocage réel. |
| **Critique** | `src/context/SystemContext.tsx` | 291–296 | `useEffect (isVpnConnected)` | `Math.random()` générant les débits reçus/envoyés | Compteur de Mo téléchargés et envoyés en temps réel dans le VPN. | `setVpnBytesIn(prev => prev + Math.floor(Math.random() * 12000 + 3000))` : octets totalement inventés à chaque seconde ! |
| **Critique** | `src/main/security.ts` | 179–216 | `ipcMain.handle('security:start-scan')` | Animation séquentielle avec `Math.random()` et délais `setTimeout` | Analyse forensique multi-disques, mémoire et registres avec progression de fichiers scannés. | **Aucun fichier n'est scanné.** Boucle sur 11 chaînes de caractères statiques avec pause de 320ms/650ms et incrément `Math.random() * 85 + 60`. Seul `Get-MpThreatDetection` est appelé à la fin. |
| **Critique** | `src/main/security.ts` | 110–112 | `ipcMain.handle('security:get-status')` | Usurpation du nom du moteur | Affiche le moteur antivirus « Astral Vanguard Core v2.4 ». | C'est le moteur natif Windows Defender qui est renommé dans le JSON renvoyé au renderer. |
| **Haute** | `src/components/tabs/NetworkTab.tsx` | 162–203 | `startDeepWifiOptimization` | Temporisations artificielles + rapport pré-rempli | « Optimisation Wi-Fi achevée : gain de 57% de latence ». | Chaîne de 4 `setTimeout()`. Affiche un rapport rigoureusement identique pour tous les PC : `beforePing: 28, afterPing: 12, jitter: 4.8 -> 0.9` et interface `'Wi-Fi 6 (802.11ax) / Realtek Gaming GbE'` même si l'utilisateur est sur Ethernet ou puce Intel ! |
| **Haute** | `src/main/network.ts` | 108–109 | `network:speedtest` | Falsification des mesures faibles de débit | Débit descendant affiché supérieur à 720 Mbps. | `if (measuredDlMbps < 150) measuredDlMbps = Math.max(measuredDlMbps, peakDownloadMbps \|\| 720);` : Si la connexion est lente (< 150 Mbps), le code force un résultat artificiel d'au moins 720 Mbps ! |
| **Haute** | `src/main/network.ts` | 196–204 | `network:speedtest` | Fallback de speedtest factice en cas d'erreur | « Speed Test achevé : 885 Mbps descendant, 620 Mbps montant ». | Si le test échoue ou si le PC est hors ligne, renvoie un faux résultat codé en dur (885 Mbps / 11ms ping) au lieu d'une erreur. |
| **Haute** | `src/components/OverlayHUD.tsx` | 33–35 | `useEffect` HUD | Compteur FPS généré par `Math.random()` | Compteur d'images par seconde in-game affiché sur le HUD (165 FPS). | `setFps(165 + Math.floor(Math.random() * 5 - 2));` : Pas de capture DirectX/D3D/Vulkan. Une simple fluctuation aléatoire autour de 165 FPS. |
| **Haute** | `src/main/performance.ts` | 231–244 | `ipcMain.handle('perf:clean-ram')` | Purge RAM factice via le Garbage Collector .NET | « Purge de la mémoire RAM réussie ». | Exécute `[System.GC]::Collect()` dans le processus PowerShell enfant temporaire qui se ferme aussitôt. Ne libère absolument pas la mémoire système Windows. |
| **Haute** | `src/main/gaming.ts` | 64–71 | `ipcMain.handle('gaming:toggle')` | Promesse d'optimisation processeur non tenue | Notification : « Priorité processeur maximale appliquée, latence optimisée ». | Ne modifie aucune priorité de processus, aucun plan d'énergie Windows, aucun paramètre réseau. Bascule uniquement un booléen. |
| **Haute** | `src/main/network.ts` | 417–425 | `network:gaming-mode-on/off` | Méthodes STUB vides | Prétend appliquer une priorité réseau aux jeux. | Les handlers sont des stubs explicites qui écrivent dans les logs `[STUB] ... aucune modification registre appliquée`. |
| **Haute** | `src/main/doctor.ts` | 170–184 | `doctor:set-mode` | Modes système Gaming et Office vides | L'utilisateur choisit le profil « Gaming » ou « Office ». | Les branches de code indiquent explicitement dans les logs : `Mode UI-only activé. Aucun service système modifié`. |
| **Haute** | `src/main/doctor.ts` | 96 | `executeSosPing` | Message de succès trompeur | « Sockets Winsock purgés, P2P Windows Update désactivé ». | Le code ne réinitialise ni Winsock ni le P2P Windows Update (retirés pour sécurité). Il ne fait que `ipconfig /flushdns` et `arp -d *`. Le message ment sur ce qui a été fait. |
| **Moyenne** | `src/components/SplashScreen.tsx` | 37–56 | `useEffect` Splash | Délais artificiels de démarrage | Messages : « Activation du bouclier... Calibration e-sport... ». | Minuteur fixe de 1.2s simulant une initialisation complexe pour donner une impression de technicité. |
| **Moyenne** | `src/components/tabs/PerformanceTab.tsx` | 88–117 | `startDeepMaintenance` | Suite de `setTimeout` simulant un nettoyage pas à pas | Barre de progression montant par paliers (10%, 35%, 70%, 95%, 100%). | Pauses de 600ms/700ms pour donner l'impression d'un scan approfondi de la machine. |
| **Moyenne** | `src/main/performance.ts` | 56–65 | `perf:get-metrics` | Calcul erroné de l'utilisation CPU | Pourcentage d'utilisation processeur instantané. | Utilise les ticks cumulés depuis le boot de `os.cpus()`. Affiche la moyenne d'utilisation depuis le démarrage du PC, pas la charge en temps réel. |
| **Moyenne** | `src/components/tabs/GamingTab.tsx` | 85–89 | Profils Gaming (Compétitif, Équilibré, Stream) | Boutons d'options sans effet | Prétend ajuster les réglages PC selon le type de session. | Met à jour une variable React locale `setProfile()`, mais n'envoie aucune commande au main process. |
| **Faible** | `src/main/performance.ts` | 129 | `perf:get-startup` | Éditeur d'application déterminé par expressions régulières sommaires | Colonne « Éditeur » des programmes au démarrage. | Analyse le chemin de la commande (`/steam/i ? 'Valve' : /epic/i ? 'Epic Games' : 'Éditeur vérifié'`). |

---

## ÉTAPE 5 — AUDIT DÉTAILLÉ DES FONCTIONNALITÉS RÉELLES

### 5.1 Informations Système & Télémétrie

* **Ce que fait réellement le code :**
  - Lit `os.cpus()` (modèle du processeur, nombre de cœurs).
  - Lit `os.totalmem()` et `os.freemem()` pour la RAM totale et libre.
  - Interroge une fois WMI via PowerShell (`Get-CimInstance Win32_VideoController`) pour obtenir le nom exact du GPU.
  - Interroge PowerShell (`Get-PSDrive -Name C`) pour l'espace disque utilisé et restant sur C:.
  - Liste les programmes au démarrage via `Get-CimInstance Win32_StartupCommand`.
  - Liste la santé des disques physiques via `Get-PhysicalDisk` (FriendlyName, MediaType, HealthStatus).
  - Liste les processus gourmands via `Get-Process`.
* **Ce que l'interface prétend faire :** Afficher un monitoring matériel temps réel de haute précision.
* **Différences & Faux semblants :** Le calcul du pourcentage CPU (`total - idle`) basé sur un seul échantillon de `os.cpus()` donne la moyenne d'activité CPU depuis le démarrage de Windows et non l'utilisation instantanée. La température matérielle n'est pas mesurée (aucune API ni driver Ring-0).
* **Permissions / APIs requises :** Standard Node.js (`os`), PowerShell standard sans élévation pour la lecture.
* **Risques techniques :** Aucun risque particulier, requêtes légères et stables.

### 5.2 Antivirus & Sécurité

* **Ce que fait réellement le code :**
  - **Supervision Defender :** Appelle `Get-MpComputerStatus` pour connaître l'état de l'antivirus Windows Defender, la version des signatures et l'état de la protection en temps réel.
  - **Mise à jour signatures :** Lance `Update-MpSignature` en PowerShell.
  - **Exclusions :** Lit et ajoute des dossiers d'exclusion via `Get-MpPreference`, `Add-MpPreference`, `Remove-MpPreference`.
  - **Scan de téléchargement (`downloadScanner.ts`) :** Surveille `%USERPROFILE%\Downloads` via `fs.watch` / `chokidar`. Dès qu'un fichier est stabilisé, lance `MpCmdRun.exe -Scan -ScanType 3 -File "<path>"`. Détecte les doubles extensions suspectes (ex: `.pdf.exe`) et les faux binaires système.
  - **Quarantaine / Suppression :** Déplace les fichiers vers `%APPDATA%\AstralVanguard\quarantine` ou les supprime avec `fs.unlinkSync` / `Remove-Item`.
* **Ce que l'interface prétend faire :** Moteur antivirus propriétaire autonome multi-disques (« Astral Vanguard Core v2.4 ») avec détection heuristique avancée de menaces furtives et audit mémoire en profondeur.
* **Différences & Faux semblants :**
  - L'application n'est **PAS** un antivirus. C'est une interface graphique (GUI) qui interroge et pilote l'antivirus Windows Defender de Microsoft.
  - L'analyse rapide / complète de l'onglet Sécurité est une **pure simulation visuelle** avec fausse barre de progression et faux compteurs de fichiers scannés.
  - L'IA heuristique prétendue (`security:ai-analyze`) est un simple bloc `if/else` vérifiant si le nom de la menace contient les mots « hacktool », « trainer » ou « keygen ».
* **Permissions nécessaires :** Requiert les **droits Administrateur** stricts pour modifier les exclusions Defender ou désactiver la protection temps réel. Si la protection contre les falsifications Windows (Tamper Protection) est active, `Set-MpPreference` échoue silencieusement.
* **Ce qui nécessiterait un composant natif :** Un véritable antivirus autonome nécessiterait un driver noyau ELAM (Early Launch Anti-Malware) ou minifilter de système de fichiers certifié par Microsoft (WHQL) avec un certificat EV.

### 5.3 Performance

* **Ce que fait réellement le code :**
  - Supprime les fichiers dans `$env:TEMP\*`, `C:\Windows\Temp\*`, `C:\Windows\SoftwareDistribution\Download\*` et vide la corbeille via `Clear-RecycleBin`.
  - Supprime les entrées du registre de démarrage dans `HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`.
  - Tue un processus désigné par son PID via `Stop-Process -Id <pid> -Force`.
  - Purge la mémoire RAM en appelant `[System.GC]::Collect()` dans PowerShell.
* **Ce que l'interface prétend faire :** Purge physique de la mémoire vive du PC, optimisation du plan d'alimentation et défragmentation/optimisation de la mémoire cache.
* **Différences & Faux semblants :**
  - La purge RAM est un placebo : le Garbage Collector .NET nettoie la mémoire du script PowerShell éphémère lui-même, pas la RAM de Windows.
  - L'optimisation du plan d'alimentation promise lors de la « Maintenance approfondie » appelle `api.gamingModeOn()`, qui est un handler vide non enregistré !
* **Permissions nécessaires :** Administrateur nécessaire pour vider `C:\Windows\Temp` et le cache de Windows Update.

### 5.4 Gaming & Overlay HUD

* **Ce que fait réellement le code :**
  - Scanne les dossiers d'installation Steam (via `libraryfolders.vdf`), Epic Games, Riot et GOG pour lister les jeux installés.
  - Affiche une fenêtre d'overlay transparent (`BrowserWindow` `transparent: true, alwaysOnTop: true, focusable: false`).
  - Permet d'activer/désactiver l'overlay via le raccourci global `Ctrl+Shift+O`.
  - Affiche dans le HUD le CPU réel et la RAM réelle.
* **Ce que l'interface prétend faire :** Mode E-Sport avec allocation prioritaire du processeur, suspension de la télémétrie Windows, optimisation réseau UDP anti-lag, et affichage des FPS du jeu en cours.
* **Différences & Faux semblants :**
  - Aucune priorité de processus (`PriorityClass`) n'est modifiée dans le système d'exploitation.
  - Les FPS affichés dans le HUD sont **générés aléatoirement** autour de 165 (`165 + Math.random() * 5 - 2`).
  - L'auto-détection des jeux compile du code C# via `Add-Type` dans un script PowerShell lancé toutes les 4 secondes dans une boucle `setInterval`, ce qui consomme anormalement du CPU. Elle est heureusement désactivée par défaut.
* **Ce qui nécessiterait un composant natif :**
  - Pour les FPS réels : Hook DirectX / Vulkan ou intégration de la bibliothèque native `PresentMon` d'Intel.
  - Pour la priorité processus : Appel de l'API Windows `SetPriorityClass` (`HIGH_PRIORITY_CLASS`) sur le PID du jeu via un binaire natif ou script Node `process`.

### 5.5 Réseau, DNS, Speedtest & Wi-Fi

* **Ce que fait réellement le code :**
  - **Changement DNS :** Exécute `Set-DnsClientServerAddress` sur les interfaces réseau physiques actives pour appliquer Cloudflare (`1.1.1.1`), Google (`8.8.8.8`), Quad9 (`9.9.9.9`) ou remettre en DHCP automatique. Fonctionne réellement.
  - **Diagnostic Wi-Fi :** Parse la sortie de `netsh wlan show interfaces` et `netsh wlan show networks mode=bssid` pour extraire le SSID, le signal (%), le canal Wi-Fi actuel et les canaux voisins. Fonctionne réellement.
  - **SOS Ping / Anti-lag :** Exécute `Clear-DnsClientCache`, `ipconfig /flushdns` et `arp -d *`.
  - **Speedtest :** Télécharge et envoie de vrais fragments de données vers `https://speed.cloudflare.com/__down` et `__up`.
* **Ce que l'interface prétend faire :** Speedtest certifié Ookla-Grade avec fidélité absolue, optimisation Wi-Fi 1-clic réduisant le ping de 57% et gigue à zéro, réinitialisation de la pile TCP/IP Winsock.
* **Différences & Faux semblants :**
  - Si le speedtest mesure un débit inférieur à 150 Mbps, **il gonfle artificiellement le chiffre pour afficher plus de 720 Mbps**. S'il échoue, il renvoie un faux résultat codé en dur (885 Mbps).
  - L'optimisation Wi-Fi affiche un rapport pré-fabriqué avec des valeurs statiques inventées (`before: 28ms, after: 12ms`).
  - Le mode gaming réseau (`network:gaming-mode-on`) est un simple stub vide sans action.
* **Permissions nécessaires :** Droits Administrateur obligatoires pour modifier la configuration DNS des cartes réseau et vider la table ARP (`arp -d *`).

### 5.6 VPN, Tunnels & Sécurité Réseau

* **Ce que fait réellement le code :**
  - Inspecte les adaptateurs réseau avec `Get-NetAdapter` pour détecter si un VPN tiers réputé (NordVPN, Proton, WireGuard, Tailscale, etc.) est déjà actif afin d'afficher un badge « Coexistence ».
  - Reçoit la demande de connexion, attend 1800ms, et renvoie un événement `connected`.
* **Ce que l'interface prétend faire :** Suite VPN militaire avec 12 pays, serveurs 1 Gbps dédiés, chiffrement AES-256, kill switch automatique et prévention des fuites DNS.
* **Diagnostic sans appel :** **LE VPN EST 100% FACTICE ET SIMULÉ.**
  - Il n'y a **aucun serveur distant** Astral.
  - Il n'y a **aucun binaire VPN** dans le dossier `bin/` (pas d'OpenVPN, pas de WireGuard, pas de Wintun).
  - Il n'y a **aucun adaptateur réseau virtuel** créé sur la machine.
  - Le trafic internet de l'utilisateur n'est **ni routé, ni chiffré, ni masqué**. L'adresse IP publique de l'utilisateur reste strictement inchangée.
  - Les octets envoyés/reçus sont générés par un `Math.random()` toutes les secondes dans l'interface.
  - L'utilisateur est mis en danger s'il croit naviguer sous protection VPN.

---

## ÉTAPE 6 — AUDIT ELECTRON & SÉCURITÉ SYSTÈME

| Risque | Gravité | Scénario d'exploitation | Fichier concerné | Correction requise |
|---|---|---|---|---|
| **Suppression arbitraire de fichiers en tant qu'Administrateur** | **Critique** | L'IPC `download-scanner:delete-file` prend un `targetPath: string` sans validation de chemin ni confinement dans un dossier autorisé. Une injection XSS ou un composant renderer compromis peut envoyer `C:\Windows\System32\...` et Astral Vanguard (exécuté en tant qu'Administrateur) le supprimera sans confirmation. | `astral-desktop/src/main/downloadScanner.ts` (L.755) | Valider formellement que le chemin se trouve strictement dans le dossier de téléchargement surveillé (`path.resolve` + vérification de préfixe). |
| **Injection de commandes PowerShell via paramètres IPC non assainis** | **Haute** | Plusieurs handlers IPC injectent des chaînes directement dans des scripts PowerShell : `Add-MpPreference -ExclusionPath "${folderPath.replace(/"/g, '')}"`, `Remove-ItemProperty -Path "${regPath}" -Name "${name}"`. Un paramètre contenant des backticks ou caractères d'échappement PowerShell peut injecter des commandes arbitraires. | `src/main/security.ts` (L.372), `src/main/performance.ts` (L.151) | Ne jamais interpoler de variables dynamiques dans du code PowerShell. Passer les arguments via des paramètres formels ou des fichiers de commande stricts. |
| **Élévation UAC systématique sans signature de code** | **Haute** | L'application est configurée avec `requestedExecutionLevel: requireAdministrator`. À chaque lancement, Windows affiche un avertissement UAC orange menaçant (« Éditeur inconnu ») car l'exécutable n'est pas signé numériquement avec un certificat de signature de code de confiance (EV Code Signing). | `astral-desktop/package.json` (L.25) | Séparer les fonctions utilisateur (exécutées sans élévation) des opérations système via un helper ou service Windows dédié, ou acquérir un certificat de signature. |
| **Content Security Policy (CSP) permissive** | **Moyenne** | La balise CSP dans `index.html` autorise `'unsafe-inline'` et des connexions sans restriction : `default-src 'self' 'unsafe-inline' data:; connect-src 'self' https: http:;`. | `astral-desktop/index.html` (L.6) | Supprimer `'unsafe-inline'`, utiliser des nonces ou hashes pour les scripts/styles, restreindre `connect-src` aux domaines strictement nécessaires. |
| **Navigation non filtrée dans la fenêtre de notification** | **Moyenne** | La fenêtre popup de notification intercepte la navigation via `will-navigate`, mais n'implémente pas de contrôle strict sur les ouvertures externes (`setWindowOpenHandler`). | `src/main/notificationWindow.ts` | Configurer `setWindowOpenHandler(() => ({ action: 'deny' }))` sur toutes les fenêtres BrowserWindow. |
| **Absence d'isolation des channels IPC dans le Preload** | **Faible** | Le preload expose une méthode générique `on: (channel: string, fn: any) => ...` permettant au renderer d'écouter n'importe quel événement IPC interne sans filtrage par liste blanche. | `src/preload/index.ts` (L.119) | Restreindre les canaux d'écoute à une liste blanche immuable d'événements autorisés. |

---

## ÉTAPE 7 — AUDIT DES BUGS, ERREURS SILENCIEUSES & DETTE TECHNIQUE

### 7.1 Vérification de la compilation et des types (Tests non destructifs exécutés)
* **TypeScript Check (`tsc -p tsconfig.json --noEmit`) :** **Réussi avec code retour 0.** Aucun problème de typage statique strict n'a été détecté dans la base existante.
* **Vite Production Build (`npx vite build`) :** **Réussi avec code retour 0.** Les bundles `dist` (renderer) et `dist-electron` (main + preload) se compilent.
* **Avertissements de build constatés :**
  - Chunks de taille excessive : `index--LP_TOnY.js` fait **506 Ko minifié**, dépassant le seuil d'alerte de Vite.
  - CSS massif : `index-B19CAE2I.css` fait **149 Ko** (trop lourd pour une application locale).
  - Avertissement Vite : `resolve.alias contains an alias with customResolver option. This is deprecated and will be removed in Vite 9`.

### 7.2 Handlers IPC manquants (Erreurs silencieuses à l'exécution)
Ces méthodes sont déclarées et appelées, mais leur handler `ipcMain.handle` n'existe nulle part dans le code backend :

1. `security:unblock-downloads` (déclaré dans `preload/index.ts` L.37) : **Aucun handler enregistré.**
2. `security:unblock-file` (déclaré dans `preload/index.ts` L.38) : **Aucun handler enregistré.**
3. `security:select-and-unblock` (déclaré dans `preload/index.ts` L.39) : **Aucun handler enregistré.**
4. `security:get-threats` (déclaré dans `preload/index.ts` L.35) : **Aucun handler enregistré.**
5. `security:run-remediation` (déclaré dans `preload/index.ts` L.31) : **Aucun handler enregistré.**
6. `perf:gaming-mode-on` (appelé par `PerformanceTab.tsx` L.112 et `GamingTab.tsx` L.60) : **Aucun handler enregistré dans `performance.ts`.** L'appel échoue silencieusement masqué par un bloc `catch {}` vide.
7. `perf:gaming-mode-off` (appelé par `GamingTab.tsx` L.63) : **Aucun handler enregistré.**

### 7.3 Intervalles non nettoyés et fuites de mémoire
* **`doctor.ts` (`setupWatchdog`) :** L'intervalle de ping watchdog est recréé sans vérifier si la fenêtre est détruite.
* **`SystemContext.tsx` :** L'intervalle de simulation des octets VPN tourne en continu dès que `isVpnConnected` est vrai, accumulant des calculs inutiles.
* **`OverlayHUD.tsx` :** Intervalle de fluctuation aléatoire des FPS (`setInterval(..., 1200)`) qui tourne en continu même si aucun jeu n'est lancé.

### 7.4 Fichiers et dépendances orphelins (Code mort)
* `src/main/monitor.ts` (127 lignes) : Module de scan différé avec ClamAV jamais branché dans `index.ts`.
* `src/main/behavior.ts` (81 lignes) : Module d'analyse comportementale WMI jamais invoqué.
* `src/components/mockups/astral-antivirus/AstralDashboard.tsx` (245 lignes) : Ancien écran de démonstration non importé.
* `mockupPreviewPlugin.ts` (181 lignes) : Plugin de prévisualisation non utilisé dans `vite.config.ts`.
* 55 composants Radix UI / shadcn dans `src/components/ui/` jamais importés.
* Répertoire racine `lib/` (`api-client-react`, `api-spec`, `api-zod`, `db`) et `artifacts/api-server/` complètement déconnectés de l'application de bureau.

---

## ÉTAPE 8 — AUDIT ERGONOMIQUE, VISUEL ET UX

Diagnostic objectif écran par écran :

### 1. Dashboard (Accueil)
* **Hiérarchie :** Bonne lisibilité globale grâce à la salutation et au statut général. En revanche, les 4 cartes télémétriques (CPU, RAM, Disque, Uptime) manquent de hiérarchie visuelle entre le label et la valeur.
* **Défauts constatés :**
  - Les 5 cartes de modules inférieurs (Sécurité, Performance, Gaming, Réseau, VPN) ont des bordures et fonds aux couleurs arc-en-ciel criardes (vert émeraude, violet, orange, cyan, orange vif) qui surchargent la vision.
  - Le bouton d'actualisation en haut à droite tourne sans donner de retour clair sur ce qui a été mis à jour.

### 2. Sécurité
* **Hiérarchie :** L'écran est dominé par le bouton d'analyse.
* **Défauts constatés :**
  - L'animation de scan affiche des lignes de texte qui défilent trop vite pour être lues.
  - Lorsque l'analyse est terminée, l'écran indique « Système protégé » même si la machine n'a pas été réellement inspectée.
  - Les onglets secondaires (Protection, Planification, Exclusions) ont un contraste faible sur fond sombre (#0a0a1e).

### 3. Performance
* **Hiérarchie :** Les jauges circulaires SVG sont esthétiques et lisibles.
* **Défauts constatés :**
  - La grande bannière CTA « Lancer la maintenance approfondie » déclenche une modale modale avec fausse barre de progression.
  - Le tableau des programmes au démarrage n'a pas de pagination ni de filtre de recherche.
  - L'impact de chaque programme au démarrage (« Élevé », « Moyen », « Faible ») est deviné par regex sur le nom au lieu de lire la métrique Windows réelle.

### 4. Gaming
* **Hiérarchie :** Bouton central imposant et lisible.
* **Défauts constatés :**
  - L'animation de rotation permanente de la manette (`rotate: [0, -10, 10, 0]`) en boucle infinie lorsque le mode est actif fatigue l'œil.
  - Les 3 cartes de profils (Compétitif, Équilibré, Streaming) sont cliquables mais ne produisent **aucun effet perceptible**.
  - La liste des jeux détectés affiche des chemins bruts tronqués sans possibilité de lancer le jeu directement ou de définir des paramètres de lancement.

### 5. Réseau
* **Hiérarchie :** Le speedomètre SVG occupe une place prépondérante mais son aiguille bouge par à-coups.
* **Défauts constatés :**
  - L'alternance entre affichage Téléchargement et Envoi est confuse.
  - La modale « Wi-Fi Optimizer » affiche une fausse console de terminal qui défile toute seule avec des messages pré-enregistrés, créant une rupture de confiance majeure une fois découverte.

### 6. VPN
* **Hiérarchie :** Disposition en 2 colonnes (catalogue des pays à gauche, cockpit de connexion à droite) bien pensée sur le plan ergonomique.
* **Défauts constatés :**
  - Présentation trompeuse de serveurs inexistants.
  - Absence d'état d'erreur réaliste (la connexion réussit systématiquement en exactement 1,8 seconde).

### 7. Paramètres
* **Hiérarchie :** Navigation latérale claire avec 11 rubriques bien sectorisées.
* **Défauts constatés :**
  - Densité inégale : certaines sections ne contiennent qu'un seul interrupteur (ex: Général), d'autres sont très chargées.
  - Les thèmes alternatifs (« Midnight Purple », « Cyber Cyan », « Stealth OLED ») ne changent que quelques bordures sans harmoniser l'intégralité des composants.

### 8. Overlay HUD
* **Défauts constatés :**
  - Le compteur d'IPS (FPS) est une imposture visible qui décrédibilise l'ensemble de l'outil auprès des joueurs exigeants.
  - La fenêtre reste positionnée en haut à gauche sans système de magnétisme (snapping) aux coins de l'écran.

---

## ÉTAPE 9 — ANALYSE DU DESIGN SYSTEM

Toutes les variables sont déclarées dans `astral-desktop/src/index.css` :

* **Palette de couleurs :**
  - `--bg-base`: `#060614` (Fond de page principal)
  - `--bg-surface`: `#0a0a1e` (Conteneurs et panneaux)
  - `--bg-elevated`: `#0f0f28` (Modales et survols)
  - `--cyan`: `#00d4ff` (Accent principal cybersécurité / réseau)
  - `--violet`: `#8b5cf6` (Accent performance / branding)
  - `--green`: `#10d9a0` (Validation / bouclier actif)
  - `--orange`: `#ff8c42` (Gaming / avertissements)
  - `--red`: `#ff4d6d` (Menaces / alertes critiques)
* **Typographie :**
  - Principale : `'Inter', system-ui, sans-serif` (chargée en local via `@fontsource/inter`)
  - Titres et headers : `'Space Grotesk'` (chargée via `@fontsource/space-grotesk`)
  - Télémétrie et chiffres : `'JetBrains Mono', monospace` (chargée via `@fontsource/jetbrains-mono`)
* **Rayons de bordure (Border-radius) :**
  - `--radius-xs`: 4px, `--radius-sm`: 6px, `--radius-md`: 10px, `--radius-lg`: 14px, `--radius-xl`: 20px, `--radius-2xl`: 28px.
* **Espacements & Layout :**
  - Largeur sidebar : 200px (`--sidebar-w`)
  - Hauteur titlebar : 36px (`--titlebar-h`) (en réalité 40px en inline style dans `AppTitlebar.tsx`).
* **Incohérences majeures relevées :**
  1. **Duplication CSS / Inline Styles :** Plus de 60% des composants n'utilisent pas les classes du Design System (`.card`, `.btn-primary`, `.badge`) mais des styles React inline en dur avec des couleurs hexadécimales directes (`rgba(11, 14, 25, 0.95)`, `#c084fc`, etc.).
  2. **Double système d'animation :** Conflit entre `framer-motion` et `motion/react`, créant des doublons dans le code et des styles d'animation non unifiés.
  3. **Multiplication d'accents de couleur sans sémantique stricte :** Le cyan, le violet et l'orange sont parfois intervertis selon les écrans sans logique fonctionnelle claire.

---

## ÉTAPE 10 — MATRICE DES INTERACTIONS UTILISATEUR

| Écran | Élément interactif | Action attendue | Handler invoqué | Appel IPC / Service réel | Résultat technique vérifiable | État réel |
|---|---|---|---|---|---|---|
| **Dashboard** | Bouton Actualiser | Rafraîchir les données | `handleRefresh` | `perf:get-metrics` + `security:get-status` | Métriques CPU/RAM et statut Defender rechargés | **Fonctionnel et vérifié** |
| **Dashboard** | Cartes de modules | Naviguer vers l'onglet | `onTabChange(id)` | Aucun (state React local) | Change l'onglet actif affiché | **Fonctionnel et vérifié** |
| **Sécurité** | Bouton "Lancer l'analyse" | Analyser le système | `startScan()` | `security:start-scan` | Boucle de timeouts avec `Math.random()`, puis lecture de Defender | **Simulé** |
| **Sécurité** | Bouton "Annuler" | Arrêter l'analyse | `cancelScan()` | `security:cancel-scan` | Interrompt la boucle d'attente | **Fonctionnel et vérifié** |
| **Sécurité** | "Actualiser Signatures" | Mettre à jour Defender | `updateSignatures()` | `security:update-signatures` | Exécute `Update-MpSignature` dans PowerShell | **Fonctionnel et vérifié** |
| **Sécurité** | "Ajouter exclusion" | Exclure un dossier | `addExclusion()` | `security:add-exclusion` | Exécute `Add-MpPreference -ExclusionPath` | **Fonctionnel et vérifié** |
| **Sécurité** | Toggle Protection Temps Réel | Activer/Couper Defender | `toggleRealTimeProtection()` | `security:toggle-realtime` | Exécute `Set-MpPreference -DisableRealtimeMonitoring` | **Partiellement fonctionnel** (Bloqué si Tamper Protection est actif sur Windows) |
| **Performance** | "Maintenance approfondie" | Purger RAM + Disque + Cache | `startDeepMaintenance()` | `perf:clean-ram` + `perf:disk-cleanup` + `perf:gaming-mode-on` | Nettoie les dossiers temp ; mais GC .NET inefficace et `gamingModeOn` manquant | **Partiellement fonctionnel** |
| **Performance** | Toggle programme démarrage | Désactiver au boot | `handleToggleStartup()` | `perf:disable-startup` | Supprime la clé de registre `Run` correspondante | **Fonctionnel et vérifié** |
| **Gaming** | Gros bouton central | Activer le mode jeu | `toggleGamingMode()` | `gaming:toggle` + `perf:gaming-mode-on` | `perf:gaming-mode-on` n'existe pas. Ne fait qu'afficher un toast | **Simulé** |
| **Gaming** | Toggle Overlay HUD | Ouvrir/Fermer le HUD | `toggleOverlay()` | `overlay:toggle` | Ouvre ou ferme la fenêtre Electron `overlayWin` | **Fonctionnel et vérifié** |
| **Gaming** | Bouton "Scanner les jeux" | Lister les jeux installés | `scanGames()` | `gaming:scan-installed` | Parse `libraryfolders.vdf` Steam et dossiers Epic/GOG réels | **Fonctionnel et vérifié** |
| **Gaming** | Sélecteur de profils | Adapter les réglages | `setProfile(p.id)` | Aucun | Met à jour une variable React locale uniquement | **Interface uniquement** |
| **Réseau** | "Lancer le Speedtest" | Mesurer débit & ping | `runOoklaSpeedtest()` | `network:speedtest` | Télécharge des fragments Cloudflare réels ; mais gonfle artificiellement le score si < 150 Mbps | **Partiellement fonctionnel** |
| **Réseau** | Sélecteur DNS (Cloudflare, etc.) | Changer les DNS PC | `handleApplyDns(dns)` | `network:set-dns` | Exécute `Set-DnsClientServerAddress` + `ipconfig /flushdns` | **Fonctionnel et vérifié** |
| **Réseau** | "Tester latence DNS" | Comparer les DNS | `benchmarkDnsServers()` | `network:test-dns-latencies` | Exécute `Test-Connection` vers 1.1.1.1, 8.8.8.8, 9.9.9.9, etc. | **Fonctionnel et vérifié** |
| **Réseau** | "Optimiser le Wi-Fi" | Réduire ping et gigue | `startDeepWifiOptimization()`| `network:gaming-mode-on` | Handler stub vide + affiche un rapport statique codé en dur | **Simulé** |
| **VPN** | Sélecteur de pays / nœuds | Choisir un serveur | `handleSelectNode()` | Aucun | Met à jour l'élément sélectionné dans le state React | **Interface uniquement** |
| **VPN** | Interrupteur "Connexion" | Établir le tunnel | `handleToggleConnect()` | `vpn:connect` | Déclenche un `setTimeout(1800)` sans aucun trafic chiffré | **Simulé** |
| **VPN** | Toggle Kill Switch | Bloquer fuites IP | `setKillSwitchEnabled()` | `vpn:set-killswitch` | Supprime les règles pare-feu au lieu d'en créer une | **Simulé** |
| **Paramètres** | Sauvegarder profil | Sauvegarder nom/prénom | `handleSaveProfile()` | `profile:save` | Écrit dans `%APPDATA%\AstralVanguard\user-profile.json` | **Fonctionnel et vérifié** |
| **Paramètres** | Toggle Démarrage Windows | Lancer au boot | `handleToggleAutostart()` | `settings:set-autostart` | Appelle `app.setLoginItemSettings()` d'Electron | **Fonctionnel et vérifié** |
| **Paramètres** | Sélecteur de thème | Changer la palette | `onThemeChange()` | `profile:save` | Modifie l'attribut `data-theme` sur `.app-root` et persiste en JSON | **Fonctionnel et vérifié** |
| **Paramètres** | Recherche de mise à jour | Vérifier sur GitHub | `handleCheckUpdate()` | `updater:check` | Interroge l'API GitHub Releases via `electron-updater` | **Fonctionnel et vérifié** |

---

## ÉTAPE 11 — FAISABILITÉ PRODUIT & ARCHITECTURE CIBLE

| Fonctionnalité | Faisable localement ? | Technologie nécessaire | Privilèges requis | Infrastructure distante ? | Complexité | Risque technique |
|---|---|---|---|---|---|---|
| **Monitoring Système (CPU/RAM/Disque)** | **OUI** | API Node.js `os` + échantillonnage différentiel CPU + WMI CIM | Utilisateur standard | Aucune | Faible | Aucun |
| **Gestion Démarrage & Tâches** | **OUI** | Registre Windows (`HKCU`/`HKLM`) + `Get-CimInstance Win32_StartupCommand` | Utilisateur standard (HKCU) / Admin (HKLM) | Aucune | Faible | Faible |
| **Nettoyage Disque (Cache/Temp)** | **OUI** | `fs` Node.js + PowerShell `Clear-RecycleBin` | Standard (User Temp) / Admin (Win Temp) | Aucune | Faible | Faible |
| **Pilote Windows Defender** | **OUI** | PowerShell `Get-MpComputerStatus`, `Update-MpSignature`, `Add-MpPreference` | Administrateur strict | Aucune (utilise les serveurs Microsoft) | Moyenne | Moyen (Tamper Protection) |
| **Contrôle Téléchargements (Scanner)** | **OUI** | `chokidar` + `MpCmdRun.exe -ScanType 3` | Utilisateur standard | Aucune | Moyenne | Faible |
| **Sélecteur DNS & Benchmark** | **OUI** | `Set-DnsClientServerAddress` + requêtes DNS UDP locales | Administrateur strict | Serveurs DNS publics existants | Faible | Faible |
| **Speedtest Réel et Honnête** | **OUI** | Streams HTTPS Node.js / Ookla Speedtest CLI officiel | Utilisateur standard | Serveurs CDN / Ookla | Moyenne | Faible |
| **Diagnostic Wi-Fi réel** | **OUI** | Parser `netsh wlan show interfaces` et `networks` | Utilisateur standard | Aucune | Faible | Faible |
| **Overlay HUD FPS Réel** | **OUI mais NÉCESSITE NATIF** | C++ Addon Node ou binaire externe (PresentMon / RTSS hook) | Administrateur | Aucune | Haute | Élevé (Anti-cheat de certains jeux) |
| **Priorité Gaming Réelle** | **OUI** | `SetPriorityClass` Windows API sur le PID du jeu actif | Administrateur | Aucune | Moyenne | Faible |
| **Tunnel VPN Réel** | **NON LOCAL SEUL** | Driver TUN/TAP (Wintun) + client WireGuard ou OpenVPN + Infrastructure serveurs | Administrateur (pour adapter TUN) | **Cluster de serveurs VPN distants avec bande passante dédiée** | **Très Haute** | **Très élevé (Coût infra, IP Leaks, maintenance)** |
| **Antivirus Propriétaire Autonome** | **NON LOCAL SEUL** | Driver noyau Minifilter Windows + moteur de signatures + équipe de veille cyber | Certificat EV Microsoft WHQL | Base de signatures de millions de virus + Cloud d'analyse | **Extrême** | **Critique (Impossibilité légale et technique pour une PME/indépendant)** |

### Classification en 4 groupes stratégiques :

1. **Réalisables immédiatement et proprement avec Electron / Node / PowerShell :**
   - Supervision complète et honnête de Microsoft Defender (état, signatures, analyses via `MpCmdRun.exe`).
   - Scanner de téléchargements en temps réel avec isolation de fichiers.
   - Nettoyeur de fichiers temporaires, cache et programmes au démarrage avec points de restauration.
   - Sélecteur et benchmark de serveurs DNS (Cloudflare, Google, Quad9, etc.).
   - Speedtest précis et non truqué (mesure brute affichée sans filtre de surévaluation).
   - Diagnostic Wi-Fi réel (canal, interférences, puissance du signal).
   - Télémétrie instantanée exacte (calcul différentiel de charge CPU, RAM réelle, disques SMART).

2. **Réalisables mais nécessitant un service Windows ou un module natif C++ :**
   - Overlay HUD avec détection réelle des FPS (nécessite le SDK Intel PresentMon compilé).
   - Détection de jeu et attribution réelle de la priorité haute de processus (`HIGH_PRIORITY_CLASS`).
   - Bascule réelle du plan d'alimentation Windows en mode « Performances Ultimes » (`powercfg`).

3. **Réalisables uniquement avec une infrastructure distante et un budget serveur :**
   - **Le VPN :** Nécessite soit la location d'un parc de serveurs dédiés (ex: 5 à 15 nœuds WireGuard mondiaux à 10–25 €/mois/nœud) et le packaging du driver officiel `Wintun.dll`, soit l'intégration d'un partenariat API avec un fournisseur VPN existant (Mullvad, Proton, WireGuard commercial).

4. **À supprimer ou reformuler d'urgence (Trompeuses ou irréalistes) :**
   - La prétention d'être un « Antivirus autonome propriétaire » : renommer en **« Contrôleur de Sécurité & Supervision Microsoft Defender »**.
   - Le faux VPN actuel : tant qu'aucun serveur ni binaire WireGuard n'est déployé, retirer la fonctionnalité ou la désigner explicitement comme indisponible / roadmap.
   - Le Wi-Fi Optimizer avec rapport statique pré-rempli : remplacer par une commande réelle de flush DNS et diagnostic de canal.
   - Le faux compteur FPS dans l'overlay : afficher les métriques système réelles (CPU, RAM, GPU, Ping) et ne proposer le compteur FPS que si PresentMon est intégré.

---

## ÉTAPE 12 — QUESTIONS BLOQUANTES POUR LE PLAN DE RECONSTRUCTION

Avant d'entamer la reconstruction du projet, l'expert ou l'équipe de développement devra impérativement trancher les points suivants avec le porteur du projet :

1. **Orientation du VPN :**
   - Avez-vous un budget mensuel pour louer et maintenir de vrais serveurs VPN WireGuard (environ 10 à 30 €/mois par pays avec bande passante 1 Gbps) ?
   - Si non, souhaitez-vous :
     * Option A : Intégrer un protocole d'import de configurations utilisateur (l'utilisateur fournit son fichier `.conf` WireGuard ou `.ovpn`) ?
     * Option B : Nouer un partenariat/API avec un fournisseur existant ?
     * Option C : Retirer temporairement l'onglet VPN pour se concentrer sur une suite Sécurité & Optimisation PC irréprochable ?

2. **Positionnement Sécurité / Antivirus :**
   - Validez-vous le fait de présenter Astral Vanguard de manière transparente comme une **Console d'Administration Avancée de Microsoft Defender** (Scans réels via `MpCmdRun.exe`, surveillance proactive des téléchargements, gestion des exclusions, durcissement du pare-feu), plutôt que de prétendre faussement être un moteur antivirus indépendant ?

3. **Distribution & Signature de Code (UAC) :**
   - Prévoyez-vous d'acquérir un certificat de signature de code Windows (Certificat Sectigo / DigiCert / Azure Trusted Signing, ~200 à 400 €/an) pour éliminer le message d'alerte SmartScreen orange « Éditeur Inconnu » lors de l'installation et de l'exécution ?

4. **Fonctionnalité Gaming & Mesure des FPS :**
   - Pour le HUD en jeu, acceptez-vous d'afficher uniquement le CPU, la RAM, l'utilisation Disque et le Ping réseau tant qu'un hook natif (comme Intel PresentMon) n'est pas intégré, afin d'éliminer définitivement le faux compteur FPS ?

5. **Nettoyage du code mort et de la stack :**
   - Validez-vous la suppression immédiate des 55 composants shadcn/Radix non utilisés, du faux serveur `artifacts/api-server`, et de la double bibliothèque `framer-motion` / `motion` pour alléger le bundle de plus de 60% ?

---

## ÉTAPE 13 — RAPPORT FINAL DE SYNTHÈSE (SECTIONS A à P)

### A. Résumé exécutif
Astral Vanguard v2.4.0 est une application Electron soignée visuellement, dotée d'une identité graphique cyberpunk et d'un packaging NSIS fonctionnel. Cependant, l'audit approfondi démontre qu'environ **50% des fonctionnalités promises sont soit complètement simulées (le VPN, le scan antivirus rapide/complet, les FPS du HUD, le rapport Wi-Fi Optimizer), soit des stubs vides sans action (priorité gaming, profils de jeu, modes système)**. L'application possède néanmoins de véritables briques saines et fonctionnelles : un scanner de téléchargements en temps réel branché sur Microsoft Defender, un gestionnaire d'exclusions et de signatures Defender, une modification effective des DNS, un diagnostic Wi-Fi réel basé sur `netsh`, et une gestion du démarrage Windows. Une reconstruction propre est nécessaire pour transformer cette suite en un outil 100% honnête, professionnel et sans simulation.

### B. Architecture actuelle
L'application repose sur un processus Electron `main` appelant intensivement PowerShell via des commandes encodées en Base64 UTF-16LE (`psHelper.ts`), communiquant avec une interface React 19 via `contextBridge` (`window.vanguard`). L'état global est centralisé dans un `SystemContext` React unique. Il n'existe aucun backend distant pour l'application desktop (le sous-dossier `artifacts/api-server` étant un vestige orphelin).

### C. Fonctionnalités réellement opérationnelles
1. **Surveillance et scan des téléchargements (`downloadScanner.ts`) :** Exécute un scan ciblé réel via `MpCmdRun.exe` de Microsoft Defender et détecte les doubles extensions trompeuses.
2. **Gestionnaire de signatures et exclusions Defender (`security.ts`) :** Met à jour les définitions Defender et configure les dossiers exclus de manière effective.
3. **Sélecteur et benchmark de serveurs DNS (`network.ts`) :** Applique réellement Cloudflare, Google ou Quad9 sur les interfaces réseau actives et teste leur latence.
4. **Diagnostic Wi-Fi (`network.ts`) :** Analyse le signal, le canal d'émission et les interférences environnantes via `netsh wlan`.
5. **Gestionnaire de démarrage (`performance.ts`) :** Liste et désactive les applications configurées dans le registre Windows.
6. **Santé physique des disques (`performance.ts`) :** Récupère le statut SMART des disques via `Get-PhysicalDisk`.
7. **Restauration système et registre (`rollback.ts`) :** Sauvegarde et réinjecte des fichiers `.reg` avant toute manipulation sensible.
8. **Mises à jour automatiques (`updater.ts`) :** Télécharge et installe les versions publiées sur GitHub Releases.
9. **Profil utilisateur & Paramètres (`profile.ts`) :** Persistance locale des préférences dans `%APPDATA%`.

### D. Fonctionnalités partielles
1. **Speedtest :** Réalise de vraies requêtes HTTP vers Cloudflare, mais modifie artificiellement les débits mesurés pour garantir au moins 720 Mbps si la connexion est inférieure à 150 Mbps, et renvoie 885 Mbps si le test échoue.
2. **Nettoyage système :** Supprime les fichiers temporaires et vide la corbeille, mais ne libère pas la RAM.
3. **Protection en temps réel :** Lit l'état de Defender, mais ne peut pas le désactiver/activer si la protection contre les falsifications (Tamper Protection) de Windows 11 est active.
4. **Overlay HUD :** Affiche une vraie fenêtre flottante transparente et des métriques CPU/RAM réelles, mais les FPS sont simulés.

### E. Fonctionnalités simulées ou trompeuses
1. **Le VPN :** Totalement factice. Aucun serveur, aucun protocole de tunneling, aucune modification d'adresse IP.
2. **L'analyse antivirus de l'onglet Sécurité :** Boucle temporelle avec des noms de fichiers système en dur et compteur de fichiers incrémenté par `Math.random()`.
3. **L'Optimiseur Wi-Fi :** Défilement de faux logs avec rapport de gain de ping pré-enregistré identique pour tous les utilisateurs.
4. **Le Mode Gaming & Profils :** Ne modifie aucune priorité processeur ni plan d'alimentation.
5. **La purge RAM :** Exécute le ramasse-miettes .NET dans un processus temporaire au lieu de purger le système.

### F. Bugs bloquants
1. **7 handlers IPC manquants :** Appels à `security:unblock-*`, `security:get-threats`, `security:run-remediation`, `perf:gaming-mode-on/off` qui génèrent des rejets de promesses non interceptés côté renderer.
2. **Auto-détection de jeu bloquante :** Compilation répétée de C# dans PowerShell toutes les 4 secondes provoquant des micro-gels CPU si l'utilisateur l'active dans les réglages.

### G. Risques de sécurité
1. **Suppression arbitraire de fichiers :** L'IPC `download-scanner:delete-file` permet la suppression de n'importe quel fichier de l'OS avec privilèges Administrateur sans vérification de périmètre.
2. **Exécution de code PowerShell :** Plusieurs interpolations directes de chaînes de caractères dans des commandes PowerShell sans échappement strict des caractères spéciaux.
3. **CSP permissive :** Présence de `'unsafe-inline'` dans la balise meta CSP.

### H. Dette visuelle et UX
1. **Incohérence des styles :** Coexistence anarchique de classes CSS personnalisées, de styles inline massifs et de Tailwind CSS v4.
2. **55 composants UI inutilisés :** Présence d'un dossier complet de composants shadcn créant du bruit et alourdissant le temps de build.
3. **Double dépendance d'animation :** Utilisation simultanée de `motion` et `framer-motion`.

### I. Dépendances et services externes nécessaires
* Un certificat de signature de code Windows (EV ou OV) pour éviter les alertes SmartScreen et UAC.
* Une infrastructure serveur WireGuard dédiée si le produit maintient son offre VPN.
* La bibliothèque C++ native `PresentMon` ou un hook D3D pour un vrai monitoring d'images par seconde in-game.

### J. Ce qui doit être conservé
* L'architecture du preload sécurisé (`contextIsolation: true`, `nodeIntegration: false`).
* L'utilitaire PowerShell encodé en Base64 (`psHelper.ts`) qui prévient les erreurs d'échappement cmd.exe.
* La surveillance proactive du dossier de téléchargement couplée à `MpCmdRun.exe`.
* Le moteur de diagnostic Wi-Fi et de configuration DNS.
* Le mécanisme de double rollback (sauvegarde `.reg` + `Checkpoint-Computer`).
* Le système de mise à jour automatique via `electron-updater`.
* Le système de fenêtre de notification flottante personnalisée.

### K. Ce qui doit être réparé
* Raccorder ou supprimer les 7 handlers IPC manquants.
* Calculer la charge CPU de manière différentielle (delta sur 500ms) pour obtenir le vrai pourcentage instantané.
* Sanctuariser l'IPC `download-scanner:delete-file` pour interdire toute suppression en dehors du dossier de téléchargement.
* Sécuriser toutes les interpolations de variables dans PowerShell.
* Rendre le Speedtest honnête en supprimant la surévaluation forcée à 720 Mbps et le fallback d'erreur à 885 Mbps.

### L. Ce qui doit être réécrit
* **L'analyse antivirus :** Remplacer la fausse barre de progression par une vraie commande `Start-MpScan -ScanType QuickScan` ou `FullScan` avec suivi de progression réel, ou proposer un sélecteur de dossier ciblé via `MpCmdRun.exe`.
* **Le Mode Gaming :** Remplacer le simple booléen par un script qui applique réellement `SetPriorityClass` sur le processus du jeu et active le plan d'alimentation hautes performances via `powercfg`.
* **Le Design System :** Nettoyer `index.css`, éliminer les styles inline au profit d'un système de classes utilitaires propre, et unifier l'utilisation d'une seule bibliothèque d'animation (`motion`).

### M. Ce qui doit être supprimé
* **Le VPN factice actuel :** Supprimer la simulation de connexion, les faux compteurs `Math.random()` et les serveurs codés en dur tant qu'une vraie infrastructure n'est pas raccordée.
* **Le faux Wi-Fi Optimizer :** Supprimer les fausses étapes et le rapport pré-fabriqué.
* **Le faux FPS du HUD :** Supprimer la génération aléatoire autour de 165 FPS.
* **Les fichiers orphelins :** Supprimer `src/main/monitor.ts`, `src/main/behavior.ts`, `src/components/mockups/`, les 55 composants shadcn inutilisés, ainsi que les dossiers racine `artifacts/api-server` et `lib/`.

### N. Ordre de reconstruction recommandé
1. **Phase 1 : Assainissement et Sécurité**
   - Corriger la vulnérabilité de suppression de fichiers et sécuriser les entrées PowerShell.
   - Éliminer le code mort (dossiers orphelins, composants shadcn inutilisés, modules non reliés).
   - Enregistrer ou nettoyer les 7 handlers IPC orphelins.
2. **Phase 2 : Élimination des simulations (Rendre le code 100% honnête)**
   - Remplacer le faux scan antivirus par l'exécution réelle de Defender avec retour d'état véridique.
   - Corriger le Speedtest pour qu'il affiche la mesure brute Cloudflare sans aucune falsification.
   - Nettoyer le HUD des faux FPS et le Wi-Fi Optimizer des faux rapports.
   - Mettre en sommeil ou retirer l'onglet VPN tant que l'infrastructure serveur n'est pas financée et configurée.
3. **Phase 3 : Consolidation des fonctions système réelles**
   - Implémenter la vraie priorité de processus pour le mode gaming (`SetPriorityClass`).
   - Implémenter une vraie purge de mémoire vive (via l'API Windows `EmptyWorkingSet`).
   - Calculer le CPU instantané réel via deux mesures de ticks espacées.
4. **Phase 4 : Unification UX et Design System**
   - Unifier les styles sur `index.css` sans styles inline récurrents.
   - Harmoniser la palette de couleurs sémantiques.
   - Valider l'expérience utilisateur complète à toutes les échelles DPI Windows (100%, 125%, 150%).

### O. Questions bloquantes à poser au propriétaire du projet
*(Voir le détail complet à l'[Étape 12](#étape-12--questions-bloquantes-pour-le-plan-de-reconstruction))* :
- Budget pour de vrais serveurs VPN WireGuard ou retrait du module ?
- Accord pour assumer publiquement le statut de Console Microsoft Defender plutôt que de prétendre à un moteur propriétaire ?
- Acquisition d'un certificat de signature de code Windows ?
- Suppression des faux compteurs FPS dans le HUD ?

### P. Liste exacte des commandes et tests exécutés lors de l'audit
* `list_dir` sur l'ensemble des répertoires du workspace (`root`, `astral-desktop`, `src`, `main`, `components`, `lib`, `artifacts`).
* `view_file` sur l'ensemble des fichiers critiques du main process (`vpn.ts`, `security.ts`, `performance.ts`, `network.ts`, `gaming.ts`, `doctor.ts`, `downloadScanner.ts`, `rollback.ts`, `updater.ts`, `notificationWindow.ts`, `adminHelper.ts`, `psHelper.ts`, `index.ts`).
* `view_file` sur les fichiers du renderer (`App.tsx`, `main.tsx`, `SystemContext.tsx`, tous les onglets `tabs/*.tsx`, `index.css`, `index.html`, modals et wizards).
* `grep_search` ciblé sur les chaînes de simulation : `Math.random`, `setTimeout`, `Priority`, `unblock`, `download-scanner`, `STUB`, etc.
* `tsc -p tsconfig.json --noEmit` via Node.js v20 sous Windows (Code retour : 0 - Validation des types statiques).
* `npx vite build` (Code retour : 0 - Vérification de la production du bundle client et Electron).

---
*Fin du rapport d'audit technique indépendant Astral Vanguard v2.4.0.*
