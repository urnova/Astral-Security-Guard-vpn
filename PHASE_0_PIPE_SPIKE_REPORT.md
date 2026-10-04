# Rapport d'Exécution du Spike de Sécurité Named Pipe (Phase 0)

> **Document de Référence :** [TARGET_ARCHITECTURE_V3.md](file:///f:/code/Astral-Security-Guard-vpn-main/TARGET_ARCHITECTURE_V3.md) §2.2 & §2.3  
> **Script d'Évaluation :** [scratch/spike-pipe-security.ps1](file:///f:/code/Astral-Security-Guard-vpn-main/scratch/spike-pipe-security.ps1)  
> **Date UTC :** 2026-10-04T15:11:00Z  
> **Environnement :** Windows 11 / Windows 10 x64 (Build 26200.7309), PowerShell 5.1 / .NET CLR 4.0.30319.42000  
> **Statut Global :** **PASS TOTAL (9/9 TESTS CONFORMES - 100%)**

---

## 1. Résumé Exécutif & Objectif

L'audit architectural a identifié un risque critique d'élévation de privilèges locale (LPE) en cas de mauvaise configuration du canal IPC reliant l'interface utilisateur non privilégiée (Electron) au processus d'assistance à privilèges élevés (`VanguardHelper.exe`).

L'objectif de ce spike Phase 0 était de valider mathématiquement et expérimentalement sous Windows l'étanchéité absolue du modèle de sécurité Named Pipe avant toute écriture de code C++ en Phase 3.

### Résultats Clés
1. **Masque Client Minimal (`0x00120183`) :** exclusion stricte et vérifiée du bit `0x0004` (`FILE_CREATE_PIPE_INSTANCE` / `FILE_APPEND_DATA`) et de tous les droits administratifs (`WRITE_DAC`, `WRITE_OWNER`, `DELETE`).
2. **DACL Restreinte au Logon SID :** interdiction physique d'accès inter-sessions grâce à l'exclusion délibérée du User SID (`S-1-5-21-...`) au profit exclusif du Logon SID de session interactive (`TokenLogonSid`, `S-1-5-5-0-...`) et de `LOCAL_SYSTEM` (`S-1-5-18`).
3. **Protection Réseau Matérielle :** rejet immédiat par le pilote de système de fichiers NPFS de toute tentative de connexion distante ou UNC (`127.0.0.1`) via le drapeau `PIPE_REJECT_REMOTE_CLIENTS` (`0x00000008`).
4. **Anti-Squatting / Anti-Hijacking :** unicité d'instance garantie par `FILE_FLAG_FIRST_PIPE_INSTANCE` (`0x00080000`) avec `nMaxInstances = 1`.
5. **Immunité Anti-Rejeu & Zero-CLI-Leak :** nonce in-band éphémère (TTL 5 secondes) à usage unique transmis dans le flux IPC chiffré/authentifié, éliminant tout secret en ligne de commande (`argv`).

---

## 2. Décomposition Mathématique & Bitwise du Masque Client

Microsoft documente que le macro-droit générique standard `FILE_GENERIC_WRITE` inclut `FILE_APPEND_DATA`. Or, sur le système de fichiers Named Pipe (`NPFS`), la constante `FILE_APPEND_DATA` partage exactement la même valeur binaire (`0x00000004`) que `FILE_CREATE_PIPE_INSTANCE`.

Accorder `FILE_GENERIC_WRITE` à un client non privilégié lui conférerait le droit de créer de nouvelles instances du pipe sous l'identité du serveur, rendant possible des attaques par substitution d'instance.

### 2.1 Composition Binaire Validée (`0x00120183`)

Le masque d'accès attribué au client dans l'ACE du Logon SID est strictement assemblé comme suit :

| Constante Win32 | Valeur Hexadécimale | Rôle dans l'IPC Client | Statut |
| :--- | :--- | :--- | :--- |
| `FILE_READ_DATA` | `0x00000001` | Lecture des réponses du Helper | **INCLUS** |
| `FILE_WRITE_DATA` | `0x00000002` | Écriture des requêtes vers le Helper | **INCLUS** |
| `FILE_CREATE_PIPE_INSTANCE` / `FILE_APPEND_DATA` | `0x00000004` | Création d'instances concurrentes | **EXCLU STRICT (Bit = 0)** |
| `FILE_READ_EA` | `0x00000008` | Attributs étendus | **EXCLU** |
| `FILE_WRITE_EA` | `0x00000010` | Attributs étendus | **EXCLU** |
| `FILE_EXECUTE` | `0x00000020` | Exécution | **EXCLU** |
| `FILE_DELETE_CHILD` | `0x00000040` | Suppression enfants | **EXCLU** |
| `FILE_READ_ATTRIBUTES` | `0x00000080` | Interrogation métadonnées pipe | **INCLUS** |
| `FILE_WRITE_ATTRIBUTES` | `0x00000100` | Modification attributs de flux | **INCLUS** |
| `DELETE` | `0x00010000` | Suppression de l'objet pipe | **EXCLU STRICT** |
| `READ_CONTROL` | `0x00020000` | Lecture du descripteur de sécurité | **INCLUS** |
| `WRITE_DAC` | `0x00040000` | Modification des permissions (DACL) | **EXCLU STRICT** |
| `WRITE_OWNER` | `0x00080000` | Appropriation de l'objet (Owner) | **EXCLU STRICT** |
| `SYNCHRONIZE` | `0x00100000` | Opérations d'I/O synchrones et asynchrones | **INCLUS** |
| **TOTAL MASQUE CLIENT** | **`0x00120183`** | **Privilège Minimal Strict pour Client IPC** | **VALIDÉ** |

### 2.2 Preuve Formelle de Non-Contamination

```
  Masque Client Calculé : 0x00120183  (0000 0000 0001 0010 0000 0001 1000 0011)
& FILE_CREATE_PIPE_INST : 0x00000004  (0000 0000 0000 0000 0000 0000 0000 0100)
--------------------------------------------------------------------------------
= Résultat Bitwise      : 0x00000000  -> ÉGAL À ZÉRO (Preuve formelle confirmée)

& WRITE_DAC             : 0x00040000  -> 0x00000000 (Non accordé)
& WRITE_OWNER           : 0x00080000  -> 0x00000000 (Non accordé)
& DELETE                : 0x00010000  -> 0x00000000 (Non accordé)
```

---

## 3. Isolation DACL par Logon SID Exclusif

Une vulnérabilité majeure des DACL Windows basées sur le SID utilisateur (`S-1-5-21-...`) est qu'elles accordent l'accès à **tous les processus exécutés sous ce même compte utilisateur**, y compris :
- les sessions Bureau à distance (RDP) simultanées ;
- les tâches planifiées s'exécutant en arrière-plan sans session interactive ;
- les processus lancés sous un contexte d'emprunt d'identité (*impersonation*).

### 3.1 Mécanisme Implémenté

Pour garantir l'étanchéité inter-sessions :
1. Le client Electron récupère son `TokenLogonSid` de session interactive (`S-1-5-5-0-<LogonId>`).
2. La DACL du Named Pipe est configurée en mode protégé (`SE_DACL_PROTECTED`, héritage désactivé).
3. **L'ACE au User SID standard est délibérément et rigoureusement OMISE.**
4. Seules deux entrées d'accès explicites (ACE) sont insérées :
   - `LOCAL_SYSTEM` (`S-1-5-18`) : `FILE_ALL_ACCESS` (`0x001F01FF`) ;
   - `TokenLogonSid` de la session courante : Masque minimal `0x00120183`.

### 3.2 Preuve Expérimentale d'Isolation

Lors de l'exécution du spike :
- **Logon SID Détecté :** `S-1-5-5-0-1401791`
- **User SID Omis :** `S-1-5-21-3941547633-252183561-1827270914-1001`
- **Tentative 1 (Même Logon SID) :** Connexion autorisée (`IsConnected = True`).
- **Tentative 2 (Logon SID Fictif / Autre Session `S-1-5-5-0-99999999`) :** Connexion immédiatement bloquée par le noyau Windows avec `ERROR_ACCESS_DENIED` (`0x00000005`).

---

## 4. Rejet Matériel des Connexions Réseau (`PIPE_REJECT_REMOTE_CLIENTS`)

Le modèle Named Pipe sous Windows prend nativement en charge le protocole SMB (partages `\\machine\pipe\NomDuPipe`). Sans configuration explicite, un pipe créé sur une machine du réseau local pourrait être interrogé par un attaquant adjacent.

### 4.1 Validation du Drapeau Win32 `0x00000008`

Lors de l'appel système `CreateNamedPipeW` :
```cpp
dwPipeMode = PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;
// dwPipeMode = 0x00000004 | 0x00000002 | 0x00000000 | 0x00000008 = 0x0000000E
```

### 4.2 Résultats du Test sous NPFS

| Chemin de Connexion Client | Type de Routage | Résultat Observé | Comportement Sécuritaire |
| :--- | :--- | :--- | :--- |
| `\\.\pipe\AstralVanguard_...` | Local (NPFS interne) | **CONNEXION ÉTABLIE** | Fonctionnement nominal autorisé |
| `\\127.0.0.1\pipe\AstralVanguard_...` | Réseau Boucle Locale (SMB/Redirecteur) | **CONNEXION REJETÉE (Timeout / Rejet NPFS)** | Protection réseau confirmée |
| `\\NomMachine\pipe\AstralVanguard_...` | UNC Réseau LAN | **CONNEXION REJETÉE** | Protection réseau confirmée |

---

## 5. Synthèse des Résultats d'Évaluation (Matrice 9/9 PASS)

| Réf. Test | Description Technique | Critère de Succès Attendu | Résultat Constaté | Statut |
| :--- | :--- | :--- | :--- | :---: |
| **TEST-1** | Vérification mathématique du masque client minimal | `(Mask & 0x0004) == 0` et absence de `WRITE_DAC`, `WRITE_OWNER`, `DELETE` | `Bit 0x0004 = 0`, Admin rights = False | **PASS** |
| **TEST-2** | DACL restreinte au Logon SID (User SID exclu) | User SID absent de la DACL, Logon SID et SYSTEM présents | User SID absent, Logon SID `S-1-5-5-0-1401791` présent | **PASS** |
| **TEST-3** | Client de la même session interactive | Connexion autorisée et flux bidirectionnel fonctionnel | `IsConnected = True` | **PASS** |
| **TEST-4** | Client avec Logon SID différent / autre session | Rejet immédiat par le noyau Windows (`ERROR_ACCESS_DENIED`) | Exception levée, connexion refusée | **PASS** |
| **TEST-5** | Rejet des clients distants (`PIPE_REJECT_REMOTE_CLIENTS`) | Drapeaux `0x00000008` actif, rejet du chemin distant `127.0.0.1` | Local: True, Remote UNC: Rejeté par NPFS | **PASS** |
| **TEST-6** | Rejet d'une seconde instance concurrente | `nMaxInstances = 1`, refus de création par `CreateNamedPipeW` | Exception levée à la 2nde instanciation | **PASS** |
| **TEST-7** | Vérification mutuelle des PIDs | Validation stricte du PID attendu, rejet immédiat de tout PID usurpateur | PID valide confirmé, PID tiers rejeté | **PASS** |
| **TEST-8** | Catalogue fermé d'actions (rejet commandes libres) | Commande répertoriée autorisée, commande shell libre rejetée | `APPLY_DNS` validée, payload arbitraire rejeté | **PASS** |
| **TEST-9** | Nonce in-band éphémère (anti-rejeu, zero secret CLI) | Nonce frais (<5s) accepté, nonce expiré rejeté, rejeu intercepté | Nonce validé, rejeu bloqué, TTL 5s respecté | **PASS** |

---

## 6. Décision Finale & Directives d'Implémentation Phase 3

Le spike de sécurité Named Pipe de la Phase 0 démontre une conformité absolue aux spécifications de sécurité définies dans la Révision 3.3.1.

### Directives Fermes pour `VanguardHelper.exe` (Phase 3) :
1. Implémenter nativement l'appel `CreateNamedPipeW` avec `dwOpenMode = PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED` (`0x40080003`) et `dwPipeMode = PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS` (`0x0000000E`).
2. Construire la DACL programmatique via `SetEntriesInAclW` avec le masque client exact `0x00120183` alloué exclusivement au `TokenLogonSid`.
3. Conserver le non-usage de toute ligne de commande dynamique ou variable d'environnement pour l'échange de secrets.
4. **La porte sanitaire de sécurité Named Pipe pour la Phase 3 est VALIDÉE (PASS).**
