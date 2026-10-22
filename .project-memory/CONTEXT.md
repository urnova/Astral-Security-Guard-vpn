# Contexte & Mémoire Projet — Vanguard Core

## 1. Objectif du Projet
- **Éditeur / Créateur** : Astral Security
- **Écosystème** : Vanguard (marque ombrelle intégrant le portail cybersécurité, le bot Discord Vanguard Bot et l'utilitaire PC).
- **Nom du logiciel PC** : Vanguard Core (outil autonome de sauvetage, nettoyage, surveillance temps réel des téléchargements et optimisation réversible de sessions e-sport).

## 2. Décisions d'Architecture & Règles Validées
- **Distribution des versions** :
  - **Site web public** : Seules les versions 100% stables (`!prerelease && !draft`) sont proposées au téléchargement. Si aucune version stable n'est publiée, le bouton affiche strictement « Indisponible » avec explication pour l'utilisateur.
  - **Canal Bêta / Pré-release** : Distribué et mis à jour exclusivement via le canal interne de l'application PC desktop (`allowPrerelease: true`).
- **Pages Légales** :
  - Pages web complètes et dédiées (`/cgu` et `/confidentialite`), liens situés dans le footer.
  - Mentions claires : projet 100% gratuit d'Astral Security, logiciel fourni « en l'état » (as-is), statut bêta, exonération de responsabilité (matériel/pilotes/bugs), absence formelle d'allégations de produit miracle, fonctionnement Local First.
  - Page d'erreur 404 dédiée (`*` via react-router-dom) pour tout lien erroné avec redirection vers l'accueil.
- **Suppression SHA** : Retrait définitif du hash SHA-512 et du bouton de copie du site web grand public.

## 3. État Actuel & Réalisations
- **Rebranding complet** : Remplacement d'« Astral Vanguard » par « Vanguard Core » (package.json, AppTitlebar, UpdateModal, SettingsTab, installer.nsh, site web).
- **Release v0.1.0 publiée** : Tag `v0.1.0` (Bêta Pré-release) sur le dépôt `urnova/Astral-Security-Guard-vpn` avec `Vanguard-Core-Setup-0.1.0.exe`, blockmap et `latest.yml`.
- **Branches Git synchronisées** : `refactor/v3-baseline` et `main` synchronisées et poussées sans secret exposé.
- **Site web compilé & validé** : Pages d'accueil, CGU, Confidentialité et 404 testées et fonctionnelles.
