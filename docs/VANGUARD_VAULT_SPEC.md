# Vanguard Vault — Spécification Binaire & Modèle Transactionnel (v1)

Ce document formalise la spécification technique, le format binaire, les constantes, les offsets et les règles transactionnelles de **Vanguard Vault**.

---

## 1. Format Binaire de l'En-tête (`vault.header`)

L'en-tête du coffre réside dans le fichier immuable/remplaçable `vault.header` à la racine du coffre.

### 1.1 Préfixe d'En-tête (`HeaderPrefix`) — 32 octets

| Offset | Taille | Type | Description | Valeur / Règle |
| :--- | :--- | :--- | :--- | :--- |
| **0** | 4 octets | ASCII | Signature magique | `0x56 0x47 0x56 0x31` (`VGV1`) |
| **4** | 2 octets | uint16be | Version de format | `0x0001` (Version 1) |
| **6** | 16 octets | Bytes | Vault UUID | Identifiant binaire unique du coffre |
| **22** | 1 octet | uint8 | Drapeaux (Flags) | Bit 0 (`0x01`) = Slot Mot de passe présent<br>Bit 1 (`0x02`) = Slot Récupération présent |
| **23** | 9 octets | Bytes | Réservé | Rempli de zéros (`0x00`) pour alignement à 32 octets |

---

### 1.2 Structure d'un Slot de Déverrouillage — 99 octets

Le fichier comporte au moins 1 slot (Mot de passe) et optionnellement 1 second slot (Récupération). Chaque slot mesure exactement **99 octets**.

#### A. Métadonnées de Slot (`SlotMetadata`) — 27 octets (incluses dans l'AAD)

| Offset relatif | Offset absolu (Slot 1) | Offset absolu (Slot 2) | Taille | Type | Description | Valeur autorisée |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **+0** | 32 | 131 | 1 octet | uint8 | Type de slot | `0x01` (Mot de passe) ou `0x02` (Récupération) |
| **+1** | 33 | 132 | 1 octet | uint8 | Algorithme KDF | `0x02` (Argon2id v1.3) |
| **+2** | 34..37 | 133..136 | 4 octets | uint32be | Opslimit KDF | Bornes : 1 à 5 (politique création : $\ge 2$) |
| **+6** | 38..41 | 137..140 | 4 octets | uint32be | Memlimit KDF | Bornes : 8192 à 268435456 octets (64 Mo par défaut) |
| **+10** | 42..57 | 141..156 | 16 octets | Bytes | Sel KDF (Salt) | 16 octets aléatoires cryptographiques |
| **+26** | 58 | 157 | 1 octet | uint8 | Algorithme AEAD | `0x01` (XChaCha20-Poly1305-IETF) |

#### B. Données Chiffrées du Slot — 72 octets (exclues de l'AAD)

| Offset relatif | Offset absolu (Slot 1) | Offset absolu (Slot 2) | Taille | Type | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **+27** | 59..82 | 158..181 | 24 octets | Bytes | Nonce AEAD XChaCha20 (24 octets aléatoires) |
| **+51** | 83..130 | 182..229 | 48 octets | Bytes | Clé maîtresse chiffrée (32B) + Tag Poly1305 (16B) |

**Taille totale de l'en-tête :**
- 1 Slot (sans clé de secours) : $32 + 99 = 131$ octets.
- 2 Slots (avec clé de secours) : $32 + 99 + 99 = 230$ octets.

---

### 1.3 Données Authentifiées Associées (AAD) des Slots

Pour interdire toute réutilisation ou manipulation croisée entre coffres ou entre slots, l'AAD de chaque slot est strictement délimité à **59 octets** :

$$\text{AAD}_{\text{slot}} = \text{InvariantPrefix (32 octets)} \;||\; \text{SlotMetadata (27 octets)}$$

Où `InvariantPrefix` (32 octets) est composé de :
- `Magic (4 octets)` : `VGV1` (`0x56 0x47 0x56 0x31`)
- `Format Version (2 octets)` : `0x0001`
- `Vault UUID (16 octets)` : identifiant unique du coffre interdisant toute transposition d'enveloppe vers un autre coffre
- `Réservé Invariant (10 octets)` : octets `0x00` (offsets 22 à 31). Les drapeaux de conteneur (`flags` situés à l'offset 22 dans le fichier `vault.header`) sont **expressément neutralisés à 0x00 dans l'AAD** afin que l'ajout ou la suppression d'un slot de récupération n'altère en rien l'AAD de l'autre slot.

**Propriété fondamentale de découplage et indépendance des slots :**
- Modifier le mot de passe réécrit uniquement le Slot 1 sans toucher au Slot 2 (récupération).
- Configurer, remplacer ou retirer une clé de secours modifie le Slot 2 et les drapeaux du conteneur `vault.header`, mais **l'AAD et le déverrouillage du mot de passe (Slot 1) restent rigoureusement intacts**.
- Réciproquement, la régénération ou suppression de la clé de secours n'invalide jamais le mot de passe principal.

---

## 2. Clé de Récupération Crockford Base32

- **Entrée brute :** 32 octets aléatoires (256 bits).
- **Encodage utile :** 52 caractères Base32 Crockford (alphabet : `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, avec 4 bits de zéro-padding final).
- **Somme de contrôle :** CRC-32 (IEEE 802.3) calculé sur les 32 octets bruts, tronqué à ses 20 bits de poids fort $\rightarrow$ 4 caractères Crockford.
- **Longueur totale :** 56 caractères, groupés par 4 avec tirets : `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
- **Rôle du checksum :** Strictement limité à la détection de fautes de frappe de l'utilisateur dans l'interface UI afin d'éviter d'engager un calcul KDF coûteux sur une clé erronée.
- **Normalisation :** Conversion en majuscules, suppression des tirets/espaces, substitutions `O` $\rightarrow$ `0`, `I`/`L` $\rightarrow$ `1`.

---

## 3. Dérivation de Clés Spécialisées (KDF)

La clé maîtresse (32 octets) n'est jamais utilisée directement pour chiffrer des données. Elle sert exclusivement de clé racine pour `crypto_kdf_derive_from_key` avec des contextes ASCII stricts de 8 caractères :

| Sous-Clé | ID Sous-clé | Contexte ASCII (8B) | Rôle |
| :--- | :--- | :--- | :--- |
| `Key_Index` | `1` | `vgv_meta` | Chiffrement de l'index virtuel (`index.enc`) |
| `Key_Data` | `1` | `vgv_data` | Chiffrement des payloads de fichiers (`blobs/xx/*.enc`) |

---

## 4. Framing Secretstream & Chiffrement par Blocs

Tous les fichiers chiffrés (`index.enc` et `blobs/xx/*.enc`) utilisent `crypto_secretstream_xchacha20poly1305` de Libsodium.

### 4.1 Structure de la Trame Chiffrée

1. **Header Secretstream (24 octets)** : Initialisé par `crypto_secretstream_init_push`.
2. **Séquence de Blocs (Framing)** :
   - `Longueur du bloc` : **4 octets** uint32 big-endian ($17 \le \text{longueur} \le 65553$).
   - `Données du bloc chiffré` : $\text{longueur}$ octets (produit par `crypto_secretstream_push`).
     - Plaintext max par bloc : 65536 octets (64 Ko).
     - Overhead par bloc : 17 octets (16B Poly1305 MAC + 1B Tag Secretstream).
     - Tags : `0` (`TAG_MESSAGE`) pour les blocs intermédiaires, `3` (`TAG_FINAL`) pour le dernier bloc.

### 4.2 Fichiers Vides (0 octet)
Un fichier de 0 octet émet :
- 24 octets Header Secretstream
- 4 octets de longueur (`0x00 0x00 0x00 0x11` = 17)
- 17 octets de bloc chiffré (0B données + 17B tag/MAC avec `TAG_FINAL`)
- **Taille totale sur disque :** 45 octets.

### 4.3 AAD Contextuel Obligatoire — 35 octets

Pour chaque flux, l'AAD de 35 octets lie cryptographiquement chaque bloc à son contexte :

$$\text{AAD} = \text{VaultId (16B)} \;||\; \text{FileId (16B)} \;||\; \text{ObjectType (1B)} \;||\; \text{FormatVersion (2B uint16be)}$$

- `ObjectType` : `0x01` pour un payload de fichier, `0x02` pour le fichier d'index.
- **Règle anti-substitution :** Interdiction mathématique d'intervertir des données entre deux fichiers, entre deux coffres, ou entre l'index et un payload.

---

## 5. Architecture de Stockage Partitionné sur Disque

```
<vaultRoot>/
  ├── vault.header         (En-tête binaire VGV1, slots de clés)
  ├── vault.header.bak     (Copie de sécurité d'en-tête)
  ├── index.enc            (Index chiffré sous vgv_meta, Secretstream)
  ├── index.enc.bak        (Dernier index valide avant transaction)
  ├── journal.log          (Journal de transaction épuré, append-only)
  ├── .lock                (Verrou exclusif d'instance)
  ├── blobs/               (Payloads chiffrés sous vgv_data)
  │   ├── a1/
  │   │   └── a1b2c3d4e5f6...enc (BlobId aléatoire opaque de 16 octets / 32 hex)
  │   └── f8/
  │       └── f8901234abcd...enc
  └── staging/             (Fichiers temporaires de transactions en vol)
      └── tmp-txid-xxxx.tmp
```

### 5.1 Opaque Blob Identifiers & Index Authentifié
Les noms des fichiers dans `blobs/` sont des UUIDs aléatoires de 16 octets générés au moment de l'import (ex: `blobs/3a/3a8f...enc`). Le hash du contenu original en clair (SHA-256) n'est jamais utilisé comme nom de fichier afin d'empêcher toute analyse d'équivalence de contenu par un observateur du système de fichiers.

L'index chiffré contient un numéro de séquence strictement croissant (`generation: number`), l'identifiant de la dernière transaction validée (`lastTxId: string`), et la liste authentifiée des fichiers avec leurs métadonnées.

---

## 6. Point de Commit & Machine d'État Transactionnelle

### 6.1 Définition du Point de Commit Effectif
Le **point de commit effectif** d'une transaction est l'**achèvement réussi du renommage atomique du fichier d'index chiffré valide (`index.enc`)**, portant un numéro de génération incrémenté ($G_{n+1} > G_n$) et authentifié par Poly1305.

- L'écriture ultérieure de `INDEX_COMMITTED` dans `journal.log` est un marqueur de complaisance pour accélérer les vérifications, mais **en aucun cas la condition de commit**.
- Si `index.enc` a été atomiquement publié, la transaction est formellement engagée et valide, même si le processus s'est arrêté avant d'écrire dans `journal.log`.
- **Règle absolue d'invariance :** Aucun blob présent dans un index valide retenu ne peut être supprimé lors d'une phase de reprise, quelle que soit la mention inscrite dans le journal.

### 6.2 Traitement du Journal comme Non Fiable
Le contenu du journal sur disque est traité comme **faillible et non digne de confiance** :
1. Les chemins relatifs (`stagingRelPath`, `targetRelPath`) lus depuis le journal ne sont **jamais acceptés aveuglément**.
2. Les cibles d'action sont systématiquement reconstruites à partir d'identifiants validés par expression régulière (`blobId` $\in [0-9a-f]{32}$, `txId` UUID), confinées strictement dans `<vaultRoot>/blobs/` ou `<vaultRoot>/staging/`.
3. Toute ligne tronquée, malformée ou hors schéma est ignorée.
4. Une ligne de journal prétendant qu'un blob est orphelin est **systématiquement confrontée à l'index valide courant**. Si le blob y figure, la suppression est bloquée. En cas d'incohérence, les données sont préservées et la reprise est signalée incomplète.

### 6.3 Diagnostic et Récupération d'Index à 4 États
Lors de l'ouverture du coffre, l'état de l'index principal et de sa sauvegarde est qualifié selon 4 situations distinctes :
1. **Index principal valide (`INDEX_PRIMARY_OK`) :** `index.enc` est authentifié et déchiffré nominalement.
2. **Sauvegarde cohérente (`RESTORED_FROM_BACKUP_CONSISTENT`) :** `index.enc` est corrompu (renommé en `index.enc.corrupt.<timestamp>` pour conservation du diagnostic). `index.enc.bak` est déchiffré avec succès, sa génération est valide, et tous les blobs qu'il référence sont physiquement présents sur disque sans blobs surnuméraires non résolus.
3. **Sauvegarde ancienne avec éléments non réconciliés (`DEGRADED_UNRECONCILED_BACKUP`) :** `index.enc` est corrompu. `index.enc.bak` est déchiffrable, mais des blobs physiques existent sur disque qui ne sont pas référencés par cette sauvegarde ancienne. Ces blobs **ne sont jamais supprimés** ; le coffre passe en mode de récupération explicite restreint.
4. **Index irrécupérable (`UNRECOVERABLE_INDEX`) :** Ni `index.enc` ni `index.enc.bak` ne peuvent être authentifiés. Aucune opération d'écriture n'est permise et les payloads sur disque sont préservés pour analyse externe.

---

## 7. Verrouillage d'Instance Exclusif (`.lock`)

- **Mécanisme d'acquisition :**
  1. Appel `fs.open(lockPath, O_CREAT | O_EXCL | O_RDWR, 0o600)` assurant l'exclusion mutuelle à la création.
  2. Écriture des métadonnées d'instance (`vaultId`, `instanceId` UUID aléatoire, `pid`, `hostname`, `user`, `acquiredAt`).
  3. Maintien du descripteur de fichier ouvert en écriture pendant toute la session (sur Windows, un handle ouvert en écriture interdit l'acquisition exclusive concurrente).
- **Libération contrôlée :** Lors de `closeVault()`, l'instance lit le fichier `.lock` et contrôle que `lock.instanceId === this.instanceId` avant de fermer le handle et supprimer le fichier. Si le verrou a été substitué ou modifié par une instance tierce, il n'est pas supprimé.
- **Verrou abandonné vs actif :**
  - Si le PID enregistré est actif sur la machine locale : refus absolu de déverrouillage forcé (`ACTIVE_PROCESS`).
  - Si le verrou provient d'un autre hôte : déverrouillage automatique interdit (`FOREIGN_HOST`).
  - Le forçage (`forceBreakStaleLock`) n'est toléré que si le processus est formellement avéré mort (`ESRCH`) sur le même hôte.

---

## 8. Périmètre de Compatibilité Matérielle & Système

- **Systèmes testés et vérifiés :** Windows 11 x64 sur système de fichiers local **NTFS**.
- **Systèmes non vérifiés :** ReFS, ext4, APFS, exFAT, FAT32 (non qualifiés, non certifiés dans cette version).
- **Systèmes explicitement non supportés :** Partages réseau distants (SMB, CIFS, NFS) et dossiers synchronisés par des agents cloud tiers (OneDrive, Dropbox, Google Drive). Les mécanismes de verrouillage exclusif, de liens physiques atomiques et de synchronisation immédiate des caches disques ne peuvent y être garantis.
