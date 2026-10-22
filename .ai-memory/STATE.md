# STATE — Vanguard Core

## État Actuel
- **Version courante :** `v0.1.2` (Bêta Pré-release).
- **Git Commit :** Synchronisé sur `refactor/v3-baseline` et `main`.
- **Git Tag & Release :** `v0.1.2` publié sur GitHub en tant que pré-release (URL: https://github.com/urnova/Astral-Security-Guard-vpn/releases/tag/v0.1.2).
- **Statut :** Déploiement et publication réussis avec les 5 assets GitHub requis.
- **Vérifications validées :**
  - Typecheck TypeScript (`tsc -p tsconfig.json --noEmit`) : 100% Succès (code 0).
  - Lot 1 Sécurité : 8 PASS, 0 FAIL.
  - Lot 2 Performance & Gaming : 10 PASS, 0 FAIL.
  - Télémetrie réelle : 5 PASS, 0 FAIL.
  - Latence TCP native : 12 ms (0 child process).

## Chantiers Finalisés en v0.1.2
1. **Éradication des Fenêtres PowerShell Parasites & Allègement CPU :**
   - Remplacement de l'exécution via `child_process.exec` (qui invoquait `cmd.exe` avec affichage de fenêtres consoles) par `child_process.spawn` direct avec les paramètres stricts `-WindowStyle Hidden` et `windowsHide: true`.
   - Création du module `nativePing.ts` exploitant une socket TCP native Node.js (12ms, 0% CPU) pour remplacer l'ensemble des commandes lourdes `Test-Connection` de PowerShell appelées à répétition par le dashboard et l'overlay.
   - Détection GPU via WMI mise en cache de façon définitive au démarrage (`gpuDetected = true`), éliminant tout appel répétitif en arrière-plan.
2. **Résolution du Blocage d'Analyse Antivirus :**
   - Correction de l'analyse rapide : exécution exclusive de `-ScanType 1` (mémoire vive et fichiers système critiques) sans sur-analyse récursive des disques secondaires volumineux (`F:\`, etc.) qui causait des saturations de 100% disque et des blocages.
   - Standardisation de l'analyse approfondie via `-ScanType 2` officiel de Microsoft Defender.
   - Verrouillage anti-conflit dans `getStatus()` : suspension des requêtes WMI Defender pendant qu'un scan est actif pour éviter tout blocage mutuel.
   - Élimination des requêtes concurrentes en file d'attente grâce à un garde d'exécution `inFlightRef` dans le contexte de télémétrie.
3. **Fiabilisation de l'Auto-Updater & Relaunch Garanti :**
   - Libération préventive du mutex d'instance unique Windows (`app.releaseSingleInstanceLock()`) avant l'invocation de `quitAndInstall` pour empêcher le nouveau processus d'être rejeté en doublon.
   - Tolérance d'attente active au redémarrage : boucle d'acquisition du verrou système (jusqu'à 2s) lors des relances post-mise à jour (`--updated`) avant toute fermeture.
4. **Nouvel Indicateur Visuel de Mise à Jour :**
   - Modal immersif animé « Mise à jour en cours d'application » informant l'utilisateur en temps réel de chaque étape (libération des verrous, remplacement des fichiers, redémarrage automatique imminent).
   - Checklist en direct et barre de progression animée.

## Prochaine Action
Présenter le compte-rendu exhaustif à l'utilisateur.
