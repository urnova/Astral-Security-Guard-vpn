# STATE — Vanguard Core

## État Actuel
- **Version publiée :** `v0.1.8` ; `v0.1.9` publiée (pré-release) ; candidate `v0.1.10` (pré-release) préparée, voir bloc en bas.
- **Git Branch :** `refactor/v3-baseline`. **Dernier commit :** `858ecf5f14d5ab45259eef3ccc079d0f465a2f69`.
- **Tags distants :** `v0.1.7` (sur `f52fd48`, inchangé) et `v0.1.8` (sur `858ecf5`, publié).
- **Statut courant :** Pré-release v0.1.8 publiée avec succès sur GitHub. Vérification des 4 assets et du tag validée.
- **En attente :** Essais réels par l'utilisateur (mise à jour / installation v0.1.8). Arrêt de toute modification logicielle.
- **TypeCheck :** 0 erreur (`tsc -p tsconfig.json --noEmit`).
- **Tests validés :** 
  - `test-updater-and-lifecycle.mjs` : 6/6 OK.
  - `test-brief-and-lifecycle.mjs` : 16/16 OK.
  - `test-vault-worker-and-ipc.mjs` : 14/14 OK.
- **Artefacts produits :** `Vanguard-Core-Setup-0.1.8.exe` (SHA-256: `717A136CA5DFD406FC2459EB1F9AE3E1F7B08B9EEBCC5DF213968EE45A019F94`), blockmap, `latest.yml`, `SHA256SUMS.txt`.

---

## Causes Racines Établies (Incident v0.1.7)
1. **Faux négatif sur VPN inactif dans `communityVpnEngine.disconnect()` :**
   Lorsque le VPN n'était pas actif, `stoppedGracefully` restait `false` et renvoyait `'restauration_non_confirmee'`, ce qui faisait échouer `gracefulShutdown` (`vpnDisconnected: false`).
2. **Annulation silencieuse de `quitAndInstallUpdate()` :**
   Le préparateur d'arrêt rejetait la fermeture, l'application ne quittait jamais.
3. **Gel de `UpdateModal.tsx` :**
   L'UI basculait immédiatement en `isInstalling: true` avec le texte en dur "2 à 4 secondes" et "Exécution de l'installateur silencieux…", sans jamais réinitialiser l'état en cas d'échec de la préparation.
4. **Verrouillage de fichiers lors de l'installation manuelle :**
   L'application étant toujours active (en arrière-plan dans le tray), le lancement manuel de l'installateur ne pouvait pas écraser `Vanguard Core.exe` et `resources\app.asar`. Seuls les nouveaux fichiers (`PresentMon-x64.exe`, `Uninstall Vanguard Core.exe`) ont été écrits.
5. **Divergence de version :**
   Le registre Windows indiquait 0.1.7, mais le fichier exécuté `app.asar` datait du 04/11/2026 (v0.1.6).

---

## Correctifs Appliqués
- `communityVpnEngine.ts` : si aucun tunnel actif, retour immédiat de `{ stoppedGracefully: true, restorationStatus: 'restauration_verifiee' }`.
- `lifecycle.ts` : acceptation de `stoppedGracefully` pour `vpnDisconnected`.
- `updater.ts` : suivi dynamique `installStage` (`preparing`, `closing`, `launching`, `failed`), destruction des fenêtres avant quit, résolution du chemin de l'installateur téléchargé (`getDownloadedInstallerPath()`), IPC de secours `open-installer-folder` et `launch-downloaded-installer`.
- `UpdateModal.tsx` : suppression de l'estimation "2 à 4 secondes", checklist dynamique calquée sur les étapes réelles, gestion d'erreur sans figer l'interface, carte de secours avec chemin de l'installateur et boutons de lancement manuel / ouverture dossier.
- `preload/index.ts` : exposition des méthodes de secours `openInstallerFolder` et `launchDownloadedInstaller`.

---

---

## Candidat v0.1.9 (branche `release/v0.1.9-prerelease`, base Perplexity ad4d963 relue et corrigée)
Détail et limites : voir `.ai-memory/HANDOFF.md`.
- **Maintenance :** confirmation intégrée sous le bouton, anti double lancement, rapport partiel (couleurs ok/warn/bad du thème), Corbeille jamais vidée sans case de consentement dédiée (principal et par lecteur), plus de `C:` implicite, plus de nettoyage de `Temp`/`tmp`/Steam `downloading`/caches d'installation.
- **Vault :** erreur `globalThis.crypto.getRandomValues is not available` : Electron 28 = Node 18, pas de WebCrypto global dans le worker, donc le Vault ne démarrait pas, y compris dans l'app packagée. Polyfill `vault/webcryptoPolyfill.ts` importé avant libsodium. Parcours « Créer mon coffre » (userData/VanguardVault proposé, sans écrasement), ouverture après création corrigée, extraction en clair confirmée dans la page.
- **VPN :** le catalogue VPN Gate était toujours vide : le parseur rejetait les lignes vides dans `<ca>` (97/97 profils rejetés avant, 97/97 valides après correctif sur le flux réel). Import .ovpn manuel avec sélecteur de fichier et bouton de connexion.
- **Notifications :** historique atomique, événement `notifications:updated`, pas de doublon constaté sur le parcours maintenance.
- **Packaging :** `winCodeSign-2.6.0` recopié dans le cache utilisateur depuis une extraction complète (échec symlink darwin sans mode développeur).
---

## Candidat v0.1.10 (branche `release/v0.1.10-prerelease`, base v0.1.9)
Détail : `.ai-memory/HANDOFF.md`.
- **Notifications :** canal unique = fenêtre Vanguard près de la zone de notification (`main/desktopNotifier.ts`, ce n'est PAS un toast natif Windows). Son joué une seule fois dans cette fenêtre (`shared/notificationSound.ts`). Plus de bulles dans l'application (`NotificationSystem` et `audioSynth` supprimés). Producteurs gaming passés par `notificationManager`. Fenêtre d'analyse de téléchargement conservée, sans doublon (`visual:false`), son soumis aux réglages globaux.
- **Paramètres :** cause du défilement cassé = `.tab-container` sans CSS dans un `overflow:hidden` (Paramètres et Vault inatteignables en bas) → `.pane-scroll`. Interrupteurs actionnables au clavier. Notifications refaites : tests succès/avertissement/erreur par le vrai circuit, explication si un réglage bloque, historique consultable.
- **Divers :** RAM en Go cohérente (utilisé/total), cartes graphiques physiques/virtuelles, volumes triés (Windows puis lettre), repli visuel des jeux, libellés « IA »/« stabilité parfaite » retirés.
- **Limites :** aucune connexion VPN réelle ; Corbeille par lecteur jamais vidée en réel ; le son n'a pas été écouté (vérifié : même fonction, contexte audio actif) ; idée consignée : détection d'USB pour proposer l'export du coffre.