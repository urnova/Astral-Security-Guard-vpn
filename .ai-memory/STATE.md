# STATE — Vanguard Core

## État Actuel
- **Version courante :** `v0.1.1` (Bêta Pré-release).
- **Git Commit :** `3bb8dcb` sur `refactor/v3-baseline` et synchronisé sur `main`.
- **Git Tag & Release :** `v0.1.1` publié sur GitHub en tant que pré-release (URL: https://github.com/urnova/Astral-Security-Guard-vpn/releases/tag/v0.1.1).
- **Statut :** Déploiement et publication réussis, code source 100% validé.
- **Vérifications validées :**
  - Typecheck TypeScript (`tsc -p tsconfig.json --noEmit`) : 100% Succès (code 0).
  - Lot 1 Sécurité : 8 PASS, 0 FAIL.
  - Lot 2 Performance & Gaming : 10 PASS, 0 FAIL.
  - Lot 3 VPN Communautaire : 10 PASS, 0 FAIL.
  - Lot 4 Redesign & Accessibilité : 8 PASS, 0 FAIL.
  - Phase 1 Sécurité scanId : 9 PASS, 0 FAIL.
  - Télémetrie réelle : 5 PASS, 0 FAIL.

## Chantiers Finalisés
1. **Suppression du lag système & réseau :**
   - Remplacement de la compilation C# dynamique `csc.exe` dans `gaming.ts` par une requête WMI/cmdlet directe.
   - Suppression du `Clear-DnsClientCache; ipconfig /flushdns` automatique toutes les 20s dans `doctor.ts`.
2. **Moteur Antivirus Multi-Disques & Action requise :**
   - Détection automatique et scan de tous les volumes physiques (`C:`, `D:`, `E:`, `F:`).
   - Préservation du cache d'état lors des timeouts PowerShell transitoires pour éliminer le clignotement "Action requise".
   - Affichage explicite des raisons précises motivant toute alerte dans le tableau de bord.
3. **VPN & Routage IP Réel :**
   - Éradication totale du fallback fictif (`185.125.190.42` et activation du Kill Switch dans le vide).
   - Whitelist et injection stricte des directives `redirect-gateway def1 bypass-dhcp` et `block-outside-dns` dans `ovpnParser.ts`.
   - Résolution multi-critères des serveurs (ID, IP, sous-chaîne) et détection honnête du pilote OpenVPN/Wintun.
4. **Section Réseau & Bande Passante :**
   - Remplacement des requêtes HTTP non chiffrées par des endpoints HTTPS résilients (Cloudflare Edge trace, ipify).
   - Suppression de la valeur de secours arbitraire (450 Mbps) et des timers simulés dans le centre d'accélération.
   - Nettoyage des fallbacks matériels trompeurs dans l'interface.
5. **Refonte des Écrans & Modals :**
   - Onboarding initial : écusson "VC" officiel, avatar dynamique avec initiales, cartes épurées.
   - Paramètres / Profil : badge "Compte Local Autonome", bouton de relance de l'onboarding, avatar lumineux.
   - Paramètres / Scanner : synchronisation réelle avec `downloadScanner.ts` (surveillance, sentinelle USB, alertes sonores, dossiers surveillés).
   - Modal Maintenance : SlideDrawer dédié avec sélection fine des caches et terminal en direct.
6. **Auto-Updater Silencieux en Arrière-Plan & 5 Assets Releases :**
   - Rétablissement du mode silencieux (`isSilent = true`) dans `quitAndInstallUpdate` pour remplacer les fichiers applicatifs sans lancer l'assistant interactif NSIS.
   - Synchronisation réelle du switch "Mises à jour automatiques" (`autoUpdateEnabled`) avec les préférences du profil et `autoUpdater.autoDownload`.
   - Vérification cyclique automatique en arrière-plan toutes les 30 minutes.
   - Génération et téléversement des 3 binaires officiels sur GitHub (`latest.yml`, `Vanguard-Core-Setup-0.1.1.exe`, `Vanguard-Core-Setup-0.1.1.exe.blockmap`), portant à 5 le nombre total d'assets de la release v0.1.1.
7. **Privilèges Administrateur Permanents (Modèle Wallpaper Engine) :**
   - Écriture d'un fichier de privilèges persistant `admin-privileges.json` dans AppData.
   - Enregistrement de la tâche planifiée à privilèges maximaux `VanguardCore_Elevated` (`/rl HIGHEST`).
   - Inscription automatique de `~ RUNASADMIN` dans la base de registre Windows (`AppCompatFlags\Layers` HKCU & HKLM).
   - Élévation silencieuse au démarrage sans invite UAC via la tâche planifiée si l'application démarre sans droits.
   - Section Paramètres / Général & Système avec badge temps réel « ✓ Actif » ou bouton « Activer les privilèges administrateur » si inactif.

## Prochaine Action
Présenter le compte-rendu exhaustif à l'utilisateur avec démonstration des corrections apportées.
