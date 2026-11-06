# HANDOFF — Vanguard Core (v0.1.10 candidat, base v0.1.9 publiée)

Lire d'abord : `STATE.md`, `DECISIONS.md`, `EXIGENCES_SUIVI.md`, `COMMANDS.md` (PATH Node/Git).

## Fait dans ce lot (non validé par essais réels)
Maintenance, Vault (démarrage + parcours), VPN (catalogue + import manuel), notifications du parcours maintenance : voir `STATE.md`.
Tests : `astral-desktop/scripts/test-maintenance-regressions.mjs` (14), tests Vault, VPN, notifications ; typecheck 0 erreur.

## Limites connues
- Vault : correctif prouvé par le chargement du worker sous Node 18 (Electron) ; création/ouverture réelles dans l'app installée à essayer.
- Parcours Vault/VPN/Maintenance non rejoués dans une nouvelle session Electron après les derniers correctifs.
- VPN : aucune connexion réelle testée ; `test-vpn-interactive-launcher` 19/20 (service OpenVPN absent sur ce PC).
- Notifications : seuls les producteurs de la maintenance sont vérifiés ; pas de refonte.
- Corbeille par lecteur : jamais exécutée sur de vraies données.
- Installateur non signé.

## Essais réels à faire
Installer la pré-release, créer un coffre, ajouter/extraire un fichier, exporter .vgv sur clé USB ; maintenance (annuler, confirmer, partiel) ; catalogue VPN et import .ovpn.

## v0.1.10 — ajouts
Notifications de bureau uniques, Paramètres défilables et refaits (section Notifications), Vault et VPN vérifiés dans Electron (bac à sable : création, ouverture, import, verrouillage, export .vgv/chiffré, extraction ; catalogue VPN Gate 80 relais, validateur de scripts toujours actif). Tests : `test-notification-pipeline.mjs` (10), `test-maintenance-regressions.mjs` (15).
À essayer en réel : notifications réduites dans la barre système, multi-écrans/DPI, Vault sur USB, maintenance, VPN.