# BRIEF — Vanguard Core (v0.1.6 Pré-release)

## 1. Objectif Global
- **Éditeur :** Astral Security
- **Produit :** Vanguard Core (utilitaire Windows autonome de sécurité, réseau, maintenance & coffre local)
- **Version cible :** `v0.1.6` (Pré-release rigoureusement vérifiée)
- **Règle d'or :** Zéro simulation, zéro valeur inventée, zéro fausse promesse. Fonctionnement réel vérifié avec preuves.

---

## 2. Périmètre & Exigences Principales
1. **Périmètre Cloud Retiré :**
   - Aucune page Cloud, aucune intégration OneDrive/Filen, aucun compte distant, aucune dépendance cloud. Nettoyage des ébauches et drapeaux résiduels.
2. **Direction Artistique Conservée :**
   - Thème sombre/noir et palettes Vanguard préservés. Sécurité et VPN restent les références visuelles.
   - Refonte ciblée des blocs critiqués (Maintenance, Programmation, Performances générales, Diagnostic réseau, suppression des modaux redondants).
3. **Ordre des Travaux (Validation par étapes) :**
   - Phase 1 : Maintenance (M1 à M7).
   - Phase 2 : Performance (P1 à P3).
   - Phase 3 : Réseau (R1 à R3).
   - Phase 4 : VPN.
   - Phase 5 : Accueil, Paramètres & Tray menu.
   - Phase 6 : Astral Vault (Coffre local libsodium V1 à V7).
   - Phase 7 : Audit transversal, consommation & Publication v0.1.6 pré-release.
4. **Astral Vault :**
   - Coffre local intégré à l'application (sous VPN), 100% hors-ligne.
   - Moteur cryptographique `libsodium` (XChaCha20-Poly1305 par flux de blocs + Argon2id pwhash).
   - Conception sécurisée, kit d'urgence de secours, aucune dépendance externe imposée.
5. **Consommation & Stabilité :**
   - Réduction drastique de la charge CPU/RAM (suppression des boucles de polling PowerShell résidents).
   - Correction définitive de la Sentinelle sur `desktop.ini`.
6. **Suivi des Exigences :**
   - Document de suivi exhaustif dans `.ai-memory/EXIGENCES_SUIVI.md`.
