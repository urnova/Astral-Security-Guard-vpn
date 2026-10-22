# BRIEF — Vanguard Core (v0.1.1 Bêta Pré-release)

## 1. Objectif Global
Éditeur : Astral Security  
Écosystème : Vanguard (Vanguard Core — utilitaire PC autonome)  
Version cible : `0.1.1` (Bêta Pré-release exclusivement)

Audit de conformité avec le plan directeur (`RECONSTRUCTION_MASTER_PLAN.md` Lots 1 à 5), éradication des faux fallbacks résiduels, correction des ralentissements système et réseau, multi-disques pour l'antivirus, fiabilisation du VPN, et refonte ergonomique des modaux (Onboarding, Profil, Scanner téléchargement, Maintenance, Session de jeu, Réseau).

## 2. Exigences Explicites Utilisateur
1. **Performance & Légèreté Système :**
   - Éliminer le CPU freeze / jitter provoqué par `Add-Type` + `csc.exe` dans `gaming.ts` toutes les 4s.
   - Éliminer les purges DNS / sockets intempestives de `doctor.ts` toutes les 20s.
2. **Moteur Antivirus Multi-disques :**
   - Analyse automatique de tous les volumes montés (`C:\`, `D:\`, `E:\`, `F:\`, etc.), non restreinte à `C:\`.
   - Affichage en temps réel de la progression par disque.
3. **Correction "État de la protection" :**
   - Résoudre le basculement erratique vers "Action requise" sans explication.
   - Raison détaillée et explicite avec bouton d'action directe si anomalie avérée.
4. **Tunnel VPN & Fuite Géolocalisation :**
   - Éliminer le faux fallback qui déclarait le VPN connecté sans lancer OpenVPN.
   - Transmission correcte de `serverId`, configuration stricte `redirect-gateway def1 bypass-dhcp`, `block-outside-dns`.
   - Affichage honnête de l'absence du binaire OpenVPN / pilote TUN si non installé, sans armer le killswitch dans le vide.
5. **Section Réseau & Bande Passante :**
   - Refonte intégrale, 100% fonctionnelle, zéro timer simulé, animations fluides.
   - Diagnostics fiabilisés (multi-sources HTTPS pour l'IP publique).
6. **Modaux et Écrans :**
   - Assistant de configuration de départ (`OnboardingWizard.tsx`) refait au propre.
   - Section Profil des paramètres (`SettingsTab.tsx`) refaite au propre.
   - Section Scanner de téléchargement des paramètres synchronisée avec `downloadScanner.ts`.
   - Modal "Lancer la maintenance" (centre de maintenance & nettoyage) épuré et plus pro.
   - Modal "Préparer une session de jeu" épuré, moins "IA générique", centré sur les réglages réels.
7. **Version & Packaging :**
   - Strictement `0.1.1` en statut Bêta Pré-release.
