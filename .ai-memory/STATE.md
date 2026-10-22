# STATE — Vanguard Core

## État Actuel
- **Version courante :** `v0.1.3` (Bêta Pré-release).
- **Git Commit :** Synchronisé sur `refactor/v3-baseline` et `main`.
- **Git Tag & Release :** `v0.1.3` prêt pour publication via `scripts/publish-release.mjs`.
- **Statut :** Compilation réussie, installeur NSIS généré (`Vanguard-Core-Setup-0.1.3.exe`, `latest.yml`, `.blockmap`).
- **Vérifications validées :**
  - Typecheck TypeScript (`tsc -p tsconfig.json --noEmit`) : 100% Succès (code 0).
  - Build frontend website (`npm run build`) : 100% Succès (code 0).
  - Déduplication de la sentinelle de téléchargements : Registre 25s `recentScannedFiles` + retenue `pendingStabilization` 5s.
  - Synthétiseur audio Web Audio API : Connecté dans `App.tsx` et popups, autoplay policy activé.
  - Banc d'essai et fichier inoffensif EICAR : Implémenté en IPC (`download-scanner:create-test-file`), bouton dédié dans `SettingsTab` et page `/test-sentinel` sur le site.

## Chantiers Finalisés en v0.1.3
1. **Éradication des Notifications de Téléchargement en Double :**
   - Élimination du cycle en double ("Vérification en cours" -> "Vérification terminée" x2) provoqué par le second événement disque (suppression du flux ADS `Zone.Identifier` et fermeture des handles du navigateur).
   - Registre de cooldown `recentScannedFiles` (25s) et verrou `pendingStabilization` temporisé à 5s.
2. **Rétablissement et Fiabilisation des Effets Sonores :**
   - Autoplay policy `no-user-gesture-required` injectée au processus principal Electron et déverrouillage au premier pointerdown/keydown dans `App.tsx`.
   - Écouteurs `notification:trigger`, `download-scanner:scan-start` et `download-scanner:scan-complete` connectés à `audioSynth.ts` dans le composant racine.
   - Synchronisation et persistance des réglages sonores (`soundEnabled`, `soundVolume`) dans le profil utilisateur.
3. **Banc d'Essai de Sécurité Inoffensif (Standard EICAR) :**
   - Handler IPC `download-scanner:create-test-file` pour générer un fichier bénin EICAR dans `%USERPROFILE%\Downloads` et tester la détection en direct.
   - Section dédiée avec bouton d'essai dans l'onglet Paramètres.
   - Page web `/test-sentinel` avec téléchargement direct et générateur dynamique de fichiers `.com` et `.exe`.
