# Binaires Externes

Ce dossier `bin` est copié tel quel lors de la compilation de l'application (grâce à la directive `extraResources` dans `package.json`).
Il doit contenir les exécutables tiers nécessaires au fonctionnement d'Astral.

## 1. ClamAV
Créez un dossier `clamav` ici.
Placez-y les fichiers de la version portable de ClamAV pour Windows.
**Chemin attendu :** `bin/clamav/clamscan.exe`
*(N'oubliez pas d'inclure la base de données virale `main.cvd` et `daily.cvd` dans le dossier `database` de clamav).*

## 2. OpenVPN
Créez un dossier `openvpn` ici.
Placez-y l'exécutable portable d'OpenVPN pour Windows.
**Chemin attendu :** `bin/openvpn/openvpn.exe`
