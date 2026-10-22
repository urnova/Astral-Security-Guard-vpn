# STATE — Vanguard Core

## État Actuel
- **Version courante :** `v0.1.4` (Bêta Pré-release).
- **Git Branch :** `refactor/v3-baseline`.
- **Git Tag & Release :** `v0.1.4` préparé pour publication via `scripts/publish-release.mjs`.
- **Statut :** Résolution intégrale des 8 points signalés par l'utilisateur.

## Chantiers Finalisés en v0.1.4
1. **Laboratoire Sentinelle & Fichiers de Test EICAR :**
   - Échantillons statiques inoffensifs `vanguard-eicar-test.com` et `vanguard-eicar-test.txt` intégrés dans `astral-website/public/downloads/`.
   - Résolution de l'erreur réseau lors du téléchargement sur la page `/test-sentinel`.
   - Détection EICAR in-memory (`Virus:DOS/EICAR_Test_File`) dans la sentinelle et levée de l'exclusion sur les fichiers tests.
2. **Multimoteur & Élimination des Menaces Fantômes Defender :**
   - Filtrage de l'historique obsolète de `Get-MpThreatDetection` par vérification physique de présence (`fs.existsSync(item.Resources)`).
   - Remplacement de la bannière rouge par un bouton héroïque dynamique « Appliquer la remédiation » quand `threats > 0`.
   - Jauge circulaire animée de nettoyage, streaming des logs (`security:apply-remediation`), et panneau d'état détaillé des menaces.
3. **Persistance Universelle des Préférences :**
   - Sauvegarde dans `profile.ts` des boucliers actifs (`shields`), des paramètres réseau (`antiBufferbloat`, `dnsOverHttps`, `ipv6Disabled`, `selectedDns`), et du dernier résultat de speedtest (`lastSpeedResult`).
   - Synchronisation multi-vues instantanée (Settings, Network, Gaming).
4. **Dashboard Réactif :**
   - Réactivité dynamique du tableau de bord (lueur rouge/ambre et badge alerte) lors de menaces détectées.
   - Bouton d'action directe « Lancer la remédiation immédiate ».
5. **Modal de Maintenance Assistée en Direct :**
   - Maintien du modal ouvert pendant toute l'opération de maintenance.
   - Interface bifaciale : jauge circulaire animée à gauche, terminal de journalisation en temps réel à droite (`perf:maintenance-progress`).
   - Bouton « Terminer » avec coche de validation une fois achevé.
6. **Refonte Ergonomique de l'Onglet Réseau (3 Niveaux & AI Vanguard Quality) :**
   - Restauration immédiate des mesures au lancement (`lastSpeedResult`), éliminant l'état par défaut "ADSL/4G Grade C".
   - Restructuration en 3 tiers équilibrés sans trous ni espaces vides.
   - Carte pleine largeur « Vanguard AI Line Quality Score » avec jauge circulaire animée, grade A+, ratio d'efficience et télémétrie complète.
7. **Relais VPN & Résilience du Catalogue :**
   - Téléchargement et mise en cache automatique du catalogue communautaire VPN dès que le cache est vide.
   - Repli automatique sur le nœud le plus rapide et accessible par pays ou mondialement.
8. **Notifications Système Unifiées :**
   - Notifications natives et sonores à la fin des scans antivirus, de la maintenance PC, et aux transitions de connexion/déconnexion VPN.

