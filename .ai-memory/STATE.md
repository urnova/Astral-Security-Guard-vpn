# STATE — Vanguard Core

## État Actuel
- **Version courante :** `v0.1.5` (Bêta Pré-release).
- **Git Branch :** `refactor/v3-baseline`.
- **Statut :** Résolution intégrale du scan multi-disques, des notifications contextuelles différenciées (couleurs & sons), et du speedtest Gigabit avec historique SVG.

## Chantiers Finalisés en v0.1.5
1. **Analyse Antivirus Multimoteur Multi-Disques & Compteur Monotone :**
   - Parcours séquentiel de l'intégralité des lecteurs montés (`C:\`, `D:\`, `E:\`, `F:\`).
   - Scan rapide OS / mémoire / registre sur `C:\`, puis scans ciblés sur les lecteurs secondaires avec progression visuelle (`En attente` -> `Analyse…` -> `✓ Scanné`).
   - Élimination de l'intervalle concurrent dans `security.ts` pour garantir un compteur de fichiers balayés strictement monotone (suppression de l'oscillation 2555 <-> 5000).
   - Badges des volumes inspectés affichés dans le rapport final du centre de sécurité.
2. **Refonte Totale des Notifications (Styles & Sons par Catégorie) :**
   - Éradication de la fausse alerte rouge sur scan propre : statut `security_clean` avec bordure verte (`#22c55e`), badge « SYSTÈME PROPRE » et carillon apaisant (D5 -> A5).
   - Profils visuels et synthèses audio dédiés : Menaces (`#ef4444`, alarme sawtooth), Clean (`#22c55e`), Téléchargement sûr (`#06b6d4`), VPN Connecté (`#3b82f6`), VPN Déconnecté (`#f59e0b`), Maintenance/Perf (`#a855f7`), Réseau (`#38bdf8`), Gaming (`#10b981`).
   - Élimination des échos audio entre le toast autonome Avast et le renderer.
3. **Speedtest Réseau Gigabit & Restauration de l'Historique SVG :**
   - Élimination du blocage sur les « petits points » grâce à un ping TCP natif (< 250ms sur le port 443).
   - Éradication du bug 0 Mbps download sur fibre Gigabit : suppression du miroir mort Bouygues (`ENOTFOUND`), ajout de miroirs OVH 1Gb/100Mb et Cloudflare.
   - Échantillonneur centralisé 200ms découplé mesurant avec fluidité les débits Gigabit (~800-984 Mbps).
   - Rétablissement de la carte « Historique des Débits & Stabilité (Mbps) » avec courbe SVG directement au-dessus de la carte Qualité de Ligne IA.
   - Retrait du bouton « Réévaluer la ligne » dans la carte IA et recalibrage des seuils pour attribuer la note d'excellence `A+ (E-Sport)`.

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

