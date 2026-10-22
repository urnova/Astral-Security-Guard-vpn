# Journal des Décisions — Vanguard Core

## 2026-10-22 — Rebranding Vanguard Core, Nouvelles Pages Légales & Publication v0.1.0 Bêta
- **Rebranding** : Migration d'Astral Vanguard vers **Vanguard Core** par **Astral Security** au sein de l'écosystème global Vanguard.
- **Règle stricte des téléchargements sur le site** :
  - Seules les versions stables publiques peuvent être téléchargées via le site web.
  - Absence de version stable -> Bouton désactivé « Indisponible » avec notification que les versions bêta pré-release sont réservées aux tests via l'auto-updater interne.
- **Pages dédiées complètes** :
  - Création de [TermsPage.tsx](file:///f:/code/Astral-Security-Guard-vpn-main/astral-website/src/pages/TermsPage.tsx) (`/cgu` et `/terms`).
  - Création de [PrivacyPage.tsx](file:///f:/code/Astral-Security-Guard-vpn-main/astral-website/src/pages/PrivacyPage.tsx) (`/confidentialite` et `/privacy`).
  - Création de [NotFoundPage.tsx](file:///f:/code/Astral-Security-Guard-vpn-main/astral-website/src/pages/NotFoundPage.tsx) (`*` pour toute URL invalide).
  - Suppression de l'affichage SHA-512 sur le site grand public.
- **Build & Publication GitHub v0.1.0** :
  - Compilé avec succès : `Vanguard-Core-Setup-0.1.0.exe` (83.06 Mo) et `latest.yml`.
  - Publié avec succès sur GitHub Releases sous le tag `v0.1.0` en tant que Bêta Pré-release.
  - Branches `refactor/v3-baseline` et `main` synchronisées sur GitHub.
