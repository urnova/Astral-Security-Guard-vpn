# DECISIONS — Vanguard Core

## Décisions Validées
1. **Version & Canal :**
   - Version fixée à `0.1.1` (Bêta Pré-release).
   - Le site web ne distribue QUE les releases stables (bouton « Indisponible » tant qu'aucune stable n'existe).
2. **Éradication des simulations et faux fallbacks :**
   - Interdiction de tout état fake ou fallback masquant un composant non installé (ex: faux VPN connecté).
   - Interdiction des faux `setTimeout` pour simuler des barres de progression d'optimisation.
3. **Optimisation des ressources :**
   - Remplacement de la boucle `Add-Type` + `csc.exe` dans `gaming.ts` par une détection native in-process ou commande Windows ultra-légère sans recompilation dynamique.
   - Suppression du watchdog DNS intempestif de `doctor.ts` (aucun flush DNS automatique en boucle sans action utilisateur).
4. **Antivirus multi-disques :**
   - Découverte instantanée des volumes `fs.existsSync('<Drive>:\')` (`C:`, `D:`, `E:`, `F:`) et balayage de chaque volume.
