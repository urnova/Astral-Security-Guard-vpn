# DECISIONS — Vanguard Core

## Décisions Validées
1. **Version & Canal :**
   - Version fixée à `v0.1.6` (Candidat Pré-release).
   - Le site web ne distribue QUE les releases stables (bouton « Indisponible » tant qu'aucune stable n'existe).
   - Aucune publication automatique autorisée : publication GitHub Releases réservée à l'utilisateur.
2. **Éradication des simulations et faux fallbacks :**
   - Interdiction de tout état fake ou fallback masquant un composant non installé (ex: faux VPN connecté).
   - Interdiction des faux `setTimeout` pour simuler des barres de progression d'optimisation.
3. **Optimisation des ressources :**
   - Remplacement de la boucle `Add-Type` + `csc.exe` dans `gaming.ts` par une détection native in-process ou commande Windows ultra-légère sans recompilation dynamique.
   - Suppression du watchdog DNS intempestif de `doctor.ts` (aucun flush DNS automatique en boucle sans action utilisateur).
4. **Antivirus multi-disques :**
   - Découverte instantanée des volumes `fs.existsSync('<Drive>:\')` (`C:`, `D:`, `E:`, `F:`) et balayage de chaque volume.
5. **Centralisation des Notifications & Sentinelle (Lot 1) :**
   - Source centrale unique `notificationManager.ts` (8 catégories, 4 sévérités, 100 items FIFO, déduplication 15s).
   - Masquage systématique des secrets et clés par regex amont.
   - Mode DND persistant filtrant les interruptions sans perdre l'historique.
   - Préservation stricte du flux ADS `Zone.Identifier` (traçabilité SmartScreen intacte, aucun déblocage automatique).
6. **Persistance des Préférences & Menu Tray Complet (Lot 2) :**
   - `reduceAnimations`, `dndEnabled`, `soundVolume` et `notificationCategories` persistés fidèlement sans écraser les réglages réseau et shields.
   - Menu Tray Windows complet synchronisé avec l'état réel (Vault déverrouillé/verrouillé avec verrouillage direct, Sécurité Defender, VPN, HUD).
7. **Privilèges Windows & Catalogue Fermé (Lot 3) :**
   - Démarrage standard non privilégié (`requestedExecutionLevel: asInvoker`) sans relance UAC inconditionnelle.
   - Catalogue fermé strict `ALLOWED_ACTIONS` pour le helper privilégié avec rejet déterministe `UNKNOWN_ACTION`.
   - Gestion de l'annulation UAC (code 1223) sans fermeture intempestive de l'application.
   - Statut classé en exigence partielle (aucun service persistant installé).
8. **Export Vanguard Vault & Non-Destruction (Lot 4) :**
   - Deux modes étanches : `backup_encrypted` (sauvegarde chiffrée autonome) et `extract_all_plaintext` (extraction récursive vérifiée SHA-256).
   - Règle absolue de non-destruction : le coffre source et les fichiers originaux restent 100% intacts après tout export.
9. **Coordination des Mises à Jour & Clôture Sensible :**
   - Parcours complet « mise à jour téléchargée -> attente des opérations sensibles -> arrêt propre -> installation -> relance automatique » coordonné via `gracefulShutdown({ skipAppQuit: true })` fermant Vault et VPN avant l'exécution de l'installateur.
10. **Secours Informatif des Mises à Jour :**
    - Interrogation passive sans authentification de l'API publique GitHub Releases (`/repos/urnova/Astral-Security-Guard-vpn/releases`) déclenchée uniquement en cas d'échec du mécanisme principal.
    - Comparaison SemVer 2.0.0 stricte et respect du canal préversion. Aucun téléchargement ni exécution via ce secours. Cooldown de 15 minutes.
11. **Gestion Bornée de la Saturation de la Sentinelle :**
    - File d'attente principale de 20 éléments complétée par une file d'attente différée bornée à 50 éléments.
    - Drainage séquentiel sans perte d'éléments différés et signalement durable en cas de dépassement (`isFullyScanned === false`).
12. **Séparation des Sauvegardes du Vault & Non-Récursion :**
    - Deux fonctions explicites dans l'UI : « Sauvegarder copie chiffrée » et « Extraire tous les fichiers en clair ».
    - Rejet strict de toute tentative d'exporter vers une destination située à l'intérieur du coffre source ou sur le coffre lui-même (protection anti-récursion).
13. **Archive Portable Unique Vanguard Vault (.vgv) :**
    - Implémentation complète du format d'archive unifié VGV1 (`exportVaultArchive` et `importVaultArchive`).
    - Empaquette exclusivement les composants chiffrés (`vault.header`, `index.enc`, `blobs/`) avec intégrité SHA-256 par composant.
    - Zéro donnée en clair, zéro script, zéro exécutable, zéro clé de secours incluse.
    - Réimportation vérifiée et déverrouillage autonome validés par test de roundtrip.
14. **Déclenchement Automatique des Mises à Jour & Prévention des Coupures :**
    - Mode automatique post-téléchargement avec préavis de 30 secondes et possibilité de report explicite (`deferAutoUpdate`).
    - Articulation stricte des délais d'arrêt : fermeture Vault (jusqu'à 2s) + déconnexion VPN (jusqu'à 3s) sous un délai global de coordination de 6s.
    - Règle de sécurité absolue : si une opération sensible échoue ou expire, `quitAndInstall()` n'est PAS appelé, l'installation est reportée et l'utilisateur est averti sans coupure forcée.
15. **Saturation Sentinelle Strictement Bornée :**
    - Remplacement de la collection illimitée par un compteur numérique exact et un échantillon borné à 20 éléments max.
    - Conservation déterministe de l'état `analysisStatus: 'analyse_incomplete'` et `isFullyScanned: false` jusqu'à réconciliation ou acquittement explicite (`acknowledgeScannerOverflow()`).
16. **Onboarding Regroupé en 5 Étapes Complètes :**
    - Présentation claire des nouveautés réelles sans prolifération d'écrans : Profil local et souveraineté, Thème minéral et réduction animations, Sentinelle et politique de mise à jour, Modules avancés optionnels (Vault + kit papier, IA avec consentement séparé, limites VPN), Intégration Windows et modèle de privilèges `asInvoker`.
    - Préservation des préférences existantes lors de la réouverture, avec abandon et complétion testés.
17. **Arbitrage du Composant Privilégié Persistant :**
    - Analyse technique et proposition ferme soumise à arbitrage : maintien du helper ponctuel sur catalogue fermé pour v0.1.6, et report du Service Windows natif à v0.2.0 afin de ne modifier aucun service, tâche ou registre sur la machine hôte.
18. **Publication Immédiate de la Version v0.1.6 en Pré-release (Changement de Décision Utilisateur) :**
    - Décision arrêtée par l'utilisateur : publication immédiate de la version `v0.1.6` en pré-release sur GitHub pour effectuer directement les vérifications manuelles sur l'exécutable distribué.
    - Fin du blocage sur la recette manuelle préalable complète.
    - Périmètre accepté pour v0.1.6 : helper ponctuel sur catalogue fermé (sans service persistant), optimisation interne des jeux reportée (P3), kill switch et basculement automatique VPN indisponibles, limites ASUS/NVIDIA documentées.
    - Qualification obligatoire : version d'évaluation en pré-release, non certifiée, non promue en stable.
    - Publication sur le dépôt `urnova/Astral-Security-Guard-vpn` : tag annoté `v0.1.6`, titre `Vanguard Core v0.1.6 — Pré-release`, flag `prerelease: true`, avec les actifs `Vanguard-Core-Setup-0.1.6.exe`, `latest.yml`, `.blockmap` et `SHA256SUMS.txt`.
