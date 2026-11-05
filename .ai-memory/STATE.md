# STATE — Vanguard Core

## État Actuel
- **Version cible :** `v0.1.8` (suite à l'incident de livraison v0.1.7).
- **Git Branch :** `refactor/v3-baseline`. **Dernier commit :** `f52fd48`. **Tag distant :** `v0.1.7` (sur `f52fd48`).
- **Statut courant :** Diagnostic complet et prouvé de l'incident v0.1.7. Correctifs appliqués sur `communityVpnEngine.ts`, `lifecycle.ts`, `updater.ts`, `UpdateModal.tsx`, `preload/index.ts`.
- **TypeCheck :** 0 erreur (`tsc --noEmit`).
- **Tests :** 16/16 tests cycle de vie & brief IA passés (`test-brief-and-lifecycle.mjs`), 14/14 tests Vault passés (`test-vault-worker-and-ipc.mjs`).
- **Publication :** En attente de décision utilisateur pour le passage en v0.1.8. Aucun tag distant poussé.

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
