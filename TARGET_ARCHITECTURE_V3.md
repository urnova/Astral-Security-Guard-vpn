# TARGET ARCHITECTURE SPECIFICATION — ASTRAL VANGUARD v3.0

> **Numéro de Révision :** 3.3.1 (Corrigendum Pré-Implémentation & Portes Découplées)  
> **Date :** 4 octobre 2026  
> **Statut :** Spécification Technique Validée Rev. 3.3.1 (Sous Réserve d'Exécution Exclusif Phase 0)  
> **Modèle d'Exécution :** Multi-processus Electron sécurisé avec isolation des privilèges (User `asInvoker` vs Privileged Helper via Named Pipe sécurisé par DACL dynamique)  
> **Plateforme Cible :** Microsoft Windows 11 (22H2, 23H2, 24H2) et Windows 10 22H2 (Build 19045+ sous réserve du cycle ESU Microsoft) — Architecture x86_64  
>
> ### Décisions Corrigées (v3.3.1)
> 1. **DACL Named Pipe Restreinte au Logon SID de Session :** Priorité absolue à une DACL composée uniquement de :
>    - Le **Logon SID de la session interactive autorisée (`TokenLogonSid`)**.
>    - Le compte **`LOCAL_SYSTEM`**.
>    L'ACE au User SID est formellement omise afin de ne pas accorder l'accès aux autres sessions ou contextes réseau du même compte utilisateur.
> 2. **Masque Client Minimal Strict :** `CLIENT_MINIMAL_PIPE_ACCESS = 0x00120183` excluant explicitement le bit `0x0004` (`FILE_APPEND_DATA` / `FILE_CREATE_PIPE_INSTANCE`), `WRITE_DAC`, `WRITE_OWNER` et `DELETE`. Test unitaire obligatoire vérifiant que `(clientAccessMask & 0x0004) === 0`.
> 3. **Validation Exhaustive du Named Pipe (9 Scénarios de Test Obligatoires) :**
>    - Même Logon SID : accès autorisé.
>    - Autre Logon SID du même utilisateur : accès refusé (`ERROR_ACCESS_DENIED`).
>    - Utilisateur différent : accès refusé.
>    - Client distant : accès refusé (`PIPE_REJECT_REMOTE_CLIENTS`).
>    - Seconde instance du pipe : refusée (`FILE_FLAG_FIRST_PIPE_INSTANCE`).
>    - Bit `0x0004` absent du masque client.
>    - Action inconnue : refusée par le catalogue fermé.
>    - Message expiré ou rejoué : refusé.
>    - PID différent du processus attendu : refusé.
> 4. **Sécurité des Nonces & Secrets :** Aucun nonce, jeton ou secret ne doit apparaître dans la ligne de commande (`Get-Process`), les journaux d'audit, les fichiers temporaires ou les rapports techniques. Le nonce est échangé exclusivement in-band sur le pipe après connexion chiffrée locale.
> 5. **Politiques de Confiance pour `VanguardHelper.exe` :**
>    - *Développement :* Chemin canonique contrôlé, hash SHA-256 épinglé et manifeste signé numériquement.
>    - *Production :* Signature Authenticode de confiance si disponible, plus hash du manifeste de release signé.
>    - *Interdiction absolue :* Ne jamais installer silencieusement de certificat racine auto-signé dans le magasin Windows (`Root` ou `TrustedPublisher`).
> 6. **Diagnostic Local Déterministe vs IA Générative :** Renommé partout en « Diagnostic local déterministe ». Moteur déterministe basé sur des règles expertes locales (zéro réseau, zéro LLM). Une véritable fonction d'IA générative reste une option expérimentale, désactivée par défaut, et marquée `Indisponible` si aucun fournisseur distant ne réussit la qualification pré-implémentation.
> 7. **Spike IA Borné :** Maximum 3 requêtes fonctionnelles par endpoint, interdiction de tests de charge agressifs, interdiction d'épuisement de quota, zéro donnée utilisateur réelle, zéro secret dans les logs, et revue humaine séparée des conditions d'utilisation (ToS) et droits d'intégration.
> 8. **Découplage des Portes :** La Phase 1 (suppression arbitraire de fichiers et injections PowerShell) est prioritaire et totalement indépendante de la réussite du spike Named Pipe.
> 9. **Tag Baseline Annoté :** `v2.4.0-pre-v3-baseline` dérivé de `astral-desktop/package.json`, conditionné à un arbre de travail propre.

---

## 1. ARCHITECTURE GLOBALE & DIAGRAMME DES PROCESSUS

L'architecture d'Astral Vanguard v3.0 repose sur trois piliers fondamentaux :
1. **L'isolation stricte des privilèges :** Le moteur d'affichage (Renderer Chromium Sandbox) et le processus d'orchestration (Main Process Electron) s'exécutent avec des droits d'utilisateur standard (`asInvoker`). Seules les opérations nécessitant des droits d'administration sont déléguées à un exécutable d'élévation ponctuel (`Vanguard Privileged Helper`) communiquant via un Named Pipe local hautement sécurisé.
2. **Le découplage hermétique des licences :** Les composants sous licence GPL (ClamAV, OpenVPN) s'exécutent en tant que **processus fils totalement indépendants** (communication par CLI flags, pipes anonymes ou sockets locaux), préservant la nature propriétaire et fermée du code source d'Astral Vanguard.
3. **La résilience & Vérité Technique :** L'échec d'un composant ne bloque jamais l'application grâce au Diagnostic local déterministe et à des mécanismes de disjoncteur (Circuit Breaker).

### 1.1 Diagramme des Processus (Mermaid)

```mermaid
flowchart TB
    subgraph UI_SPACE ["ESPACE UTILISATEUR NON PRIVILÉGIÉ (Standard User asInvoker)"]
        subgraph RENDERER ["Renderer Process (Chromium Sandbox)"]
            UI["Interface React 19 / Vanilla CSS"]
            HUD_UI["Fenêtre Flottante Overlay HUD"]
            TOAST_UI["Fenêtre Notification Toast"]
        end

        subgraph PRELOAD ["Couche d'Isolation (ContextBridge)"]
            API_BRIDGE["window.vanguard (Contrat Typé Strict Immuable)"]
        end

        subgraph MAIN_PROCESS ["Main Process (Electron 44 / Node 24 asInvoker)"]
            ORCHESTRATOR["Orchestrateur Principal (Cycle de vie, UI State)"]
            ROUTER_IPC["Routeur & Validateur IPC (Zod Schemas)"]
            SCAN_REGISTRY["Registre Interne des Scans (scanId, path, sha256, mtime)"]
            TELEMETRY_MGR["Gestionnaire Télémétrie Différentielle"]
            AUDIT_LOGGER["Journal Local à Altération Détectable (%APPDATA%)"]
            ROLLBACK_MGR["Gestionnaire de Rollback (.reg & Checkpoints)"]
        end

        subgraph WORKERS ["Workers & Services Découplés (Node.js Threads / Subprocesses)"]
            BASE_SUMMARY["Diagnostic Local Déterministe (Règles Locales Hors Ligne)"]
            AI_WORKER["Worker Cloud AI Optionnel (Spike Qualifié + LLM7 / OVH)"]
            YARA_ENGINE["Moteur Local YARA-X 1.21.x (Règles Compilées en Mémoire)"]
            SPEEDTEST_WORKER["Worker Speedtest Cloudflare (Multi-stream HTTPS)"]
            PRESENTMON_SVC["Worker Intel PresentMon v2.6.x (Traces ETW Framerate)"]
            VPN_MGR["Gestionnaire VPN (Parser OVPN Strict + remote-cert-tls + Wintun)"]
        end
    end

    subgraph PRIVILEGED_BOUNDARY ["FRONTIÈRE DE PRIVILÈGES & UAC (Named Pipe Sécurisé Win32)"]
        NAMED_PIPE["Windows Named Pipe (DACL Logon SID + SYSTEM + PID Check)"]
        ELEVATED_HELPER["Vanguard Privileged Helper (Catalogue Fermé d'Actions)"]
    end

    subgraph OS_SUBSYSTEMS ["SOUS-SYSTÈMES WINDOWS & MOTEURS NATIFS"]
        DEFENDER["Moteur Microsoft Defender (MpCmdRun -ReturnHR & ThreatDetection)"]
        AMSI["Interface Windows AMSI (AmsiScanBuffer)"]
        NET_STACK["Pile Réseau Windows (Set-DnsClientServerAddress & netsh)"]
        WIN_RESTORE["Windows System Restore & Registre (.reg export)"]
    end

    subgraph ISOLATED_GPL ["COMPOSANTS EXTERNES ISOLÉS (Licence GPLv2 - Pas de liaison binaire)"]
        CLAMAV_EXE["clamscan.exe (Second avis antivirus facultatif)"]
        OPENVPN_EXE["openvpn.exe + wintun.dll (Tunnel VPN Communautaire)"]
    end

    subgraph CLOUD_SERVICES ["SERVICES DISTANTS OPTIONNELS (HTTPS)"]
        LLM7_API["LLM7 API Sans Compte (Sous réserve de validation spike)"]
        OVH_API["OVHcloud Public AI (Sous réserve de validation spike)"]
        VPNGATE_API["VPN Gate Public Relays CSV (Tsukuba Univ.)"]
        GITHUB_RELEASES["GitHub Releases (Manifeste Signé + Hashes)"]
    end

    %% Flux de données et communications UI (aucun chemin transmis)
    UI -->|Demande Ouverture Boîte Dialogue Scan| API_BRIDGE
    UI -->|Remédiation par scanId| API_BRIDGE
    HUD_UI -->|Télémétrie HUD| API_BRIDGE
    API_BRIDGE -->|IPC Invoke Sécurisé| ROUTER_IPC
    ROUTER_IPC --> ORCHESTRATOR
    ORCHESTRATOR --> SCAN_REGISTRY
    ORCHESTRATOR --> TELEMETRY_MGR
    ORCHESTRATOR --> AUDIT_LOGGER
    ORCHESTRATOR --> ROLLBACK_MGR

    %% Diagnostic déterministe local par défaut et cloud optionnel
    ORCHESTRATOR -->|Diagnostic par Défaut| BASE_SUMMARY
    ORCHESTRATOR -.->|Requête Cloud Confirmée| AI_WORKER
    AI_WORKER -.->|HTTPS qualifié| LLM7_API
    AI_WORKER -.->|Fallback Cloud Explicite| OVH_API
    ORCHESTRATOR -->|Scan Mémoire/Fichier| YARA_ENGINE
    ORCHESTRATOR -->|Lancement Mesure| SPEEDTEST_WORKER
    ORCHESTRATOR -->|Traces ETW| PRESENTMON_SVC
    ORCHESTRATOR -->|Contrôle Session VPN| VPN_MGR

    %% Élévation via Named Pipe
    ORCHESTRATOR -->|Connexion Authentifiée (In-band Nonce + PID)| NAMED_PIPE
    NAMED_PIPE --> ELEVATED_HELPER
    ELEVATED_HELPER -->|CLI MpCmdRun| DEFENDER
    ELEVATED_HELPER -->|Scan Buffer Script| AMSI
    ELEVATED_HELPER -->|Modifications DNS/Wlan| NET_STACK
    ELEVATED_HELPER -->|Sauvegarde & Checkpoint| WIN_RESTORE

    %% Composants GPL externes
    ELEVATED_HELPER -->|Processus Fils CLI Découplé| CLAMAV_EXE
    VPN_MGR -->|Processus Fils CLI Découplé| OPENVPN_EXE
    VPN_MGR -->|Téléchargement Relais| VPNGATE_API

    ORCHESTRATOR -->|Vérification Manifeste Signé| GITHUB_RELEASES
```

---

## 2. LIMITES DE CONFIANCE & SÉCURISATION WIN32 DU PRIVILEGED HELPER

### 2.1 Périmètres de Sécurité (Trust Boundaries)

```
┌───────────────────────────────────────────────────────────────┐
│ PÉRIMÈTRE 0 : Renderer Process (Chromium Sandbox)            │
│ • contextIsolation: true, nodeIntegration: false             │
│ • CSP stricte (aucun script inline, aucun fetch non listé)   │
│ • Aucun accès au système de fichiers ni aux commandes shell  │
│ • Ne manipule que des identifiants abstraits (scanId)        │
└───────────────────────────────┬───────────────────────────────┘
                                │ IPC (window.vanguard.*)
┌───────────────────────────────▼───────────────────────────────┐
│ PÉRIMÈTRE 1 : Main Process (Electron 44 / Node 24 asInvoker)  │
│ • Exécution standard (droits utilisateur normaux)             │
│ • Validation des paramètres entrants par schémas Zod         │
│ • Registre de session interne des fichiers scannés (ScanId)   │
│ • Confinement des chemins autorisés et contrôle anti-TOCTOU  │
│ • Orchestration de l'état, de l'audit et du cache local      │
└───────────────────────────────┬───────────────────────────────┘
                                │ Named Pipe Local + DACL Win32
┌───────────────────────────────▼───────────────────────────────┐
│ PÉRIMÈTRE 2 : Privileged Helper (Processus Élevé UAC Dédié)  │
│ • Démarré à la demande uniquement pour actions privilégiées   │
│ • Canal : \\.\pipe\AstralVanguard_Helper_<RandomHex32>        │
│ • Masque client minimal : 0x00120183 (exclut 0x0004)          │
│ • DACL restreinte : Logon SID de session + LOCAL_SYSTEM      │
│ • N'accepte AUCUNE commande libre (PowerShell/CMD rejetés)   │
│ • Exécute uniquement les actions typées du catalogue fermé    │
│ • Arrêt automatique après achèvement de l'action ou timeout   │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Protocole Détaillé de Sécurisation Win32 du Named Pipe

#### 2.2.1 Analyse Stricte du Masque d'Accès Client (Réfutation de `FILE_GENERIC_WRITE`)
Microsoft documente que le masque standard `FILE_GENERIC_WRITE` inclut `FILE_APPEND_DATA`, qui partage la valeur binaire `0x0004` avec le droit spécifique `FILE_CREATE_PIPE_INSTANCE` sur le système de fichiers de Named Pipes (`\Device\NamedPipe`). Accorder ce bit à un client non privilégié lui permettrait de créer des instances concurrentes ou d'altérer la file d'attente du pipe.

Le masque d'accès accordé au client est donc **strictement restreint et personnalisé** :
```c
// Masque Client Minimal Autorisé : 0x00120183
#define CLIENT_MINIMAL_PIPE_ACCESS ( \
    FILE_READ_DATA            | /* 0x0001 : Lecture messages */ \
    FILE_WRITE_DATA           | /* 0x0002 : Écriture messages */ \
    FILE_READ_ATTRIBUTES      | /* 0x0080 : Lecture attributs */ \
    FILE_WRITE_ATTRIBUTES     | /* 0x0100 : Écriture attributs */ \
    SYNCHRONIZE               | /* 0x00100000 : Attente E/S asynchrone */ \
    READ_CONTROL                /* 0x00020000 : Lecture DACL */ \
)

// Droits Formellement Exclus du Masque Client :
// - FILE_APPEND_DATA / FILE_CREATE_PIPE_INSTANCE (0x0004)  -> INTERDIT (bit 0x0004 = 0)
// - WRITE_DAC (0x00040000)                                 -> INTERDIT
// - WRITE_OWNER (0x00080000)                               -> INTERDIT
// - DELETE (0x00010000)                                    -> INTERDIT
// - GENERIC_ALL (0x10000000)                               -> INTERDIT
```

**Test unitaire obligatoire :**
```typescript
const FILE_CREATE_PIPE_INSTANCE = 0x0004;
const clientAccessMask = 0x00120183;
assert.strictEqual((clientAccessMask & FILE_CREATE_PIPE_INSTANCE), 0, "Le bit FILE_CREATE_PIPE_INSTANCE doit impérativement être nul !");
```

#### 2.2.2 Construction Séquentielle Win32 de la DACL (Logon SID Exclusif)
La création du descripteur de sécurité ne repose pas sur une simple chaîne SDDL statique, mais sur une construction programmatique vérifiée via les APIs Win32 :
1. **Initialisation du Descripteur :** Appel de `InitializeSecurityDescriptor(&sd, SECURITY_DESCRIPTOR_REVISION)`.
2. **Extraction des SIDs Authentifiés :**
   - Ouverture du jeton du processus appelant non privilégié via `OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)`.
   - Extraction du **Logon SID de Session** via `GetTokenInformation(hToken, TokenLogonSid, ...)`.
   - Récupération du **SID SYSTEM** (`S-1-5-18`) via `CreateWellKnownSid(WinLocalSystemSid, ...)`.
   - **Règle de Sécurité Critique :** Ne pas insérer d'ACE pour le User SID global. Seul le Logon SID de la session interactive courante est autorisé, empêchant tout accès depuis une session concurrente du même compte utilisateur.
3. **Allocation et Initialisation de l'ACL :**
   - Calcul de la taille mémoire exacte requise pour l'en-tête `ACL` et les deux structures `ACCESS_ALLOWED_ACE`.
   - Allocation via `HeapAlloc` et initialisation via `InitializeAcl(pDacl, cbAclSize, ACL_REVISION)`.
4. **Insertion des ACEs d'Accès Exclusif :**
   - `AddAccessAllowedAce(pDacl, ACL_REVISION, CLIENT_MINIMAL_PIPE_ACCESS, pLogonSid)`
   - `AddAccessAllowedAce(pDacl, ACL_REVISION, FILE_ALL_ACCESS, pSystemSid)`
5. **Association et Protection contre l'Héritage :**
   - Association de la DACL au descripteur via `SetSecurityDescriptorDacl(&sd, TRUE, pDacl, FALSE)`.
   - Verrouillage via `SetSecurityDescriptorControl(&sd, SE_DACL_PROTECTED, SE_DACL_PROTECTED)` (interdit formellement toute modification des droits par héritage).
   - Exclusion formelle de tout SID réseau (`Network Logon S-1-5-2`), invité ou anonyme.

#### 2.2.3 Paramètres d'Instanciation `CreateNamedPipeW`
- **Nom du Pipe :** `\\.\pipe\AstralVanguard_Helper_<RandomHex32>` (généré via `crypto.randomBytes(16).toString('hex')`).
- **Flags d'Ouverture :** `PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE` (garantit que si un binaire tiers a préempté le nom de pipe, l'appel échoue immédiatement avec `ERROR_ACCESS_DENIED` ou `ERROR_ALREADY_EXISTS`).
- **Mode de Fonctionnement :** `PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS` (`PIPE_REJECT_REMOTE_CLIENTS = 0x00000008` rejette matériellement toute tentative de connexion provenant du réseau).
- **Nombre d'Instances Maximal :** `nMaxInstances = 1`.

#### 2.2.4 Politiques de Confiance de `VanguardHelper.exe` & Nonces
1. **Politiques de Confiance du Binaire :**
   - *Développement :* Chemin canonique contrôlé (`resources/bin/VanguardHelper.exe`), contrôle du hash SHA-256 épinglé et manifeste signé numériquement.
   - *Production :* Signature Authenticode valide émise par le certificat de l'éditeur, complétée par le hash du manifeste de release signé.
   - *Interdiction stricte :* Ne jamais installer silencieusement de certificat racine auto-signé dans le magasin de certificats Windows (`Root` ou `TrustedPublisher`).
2. **Démarrage Élevé Ponctuel :** Lancement de `VanguardHelper.exe` via `runas` avec le nom de pipe éphémère comme seul argument.
3. **Sécurité des Nonces (Zéro Secret dans les Arguments) :**
   - Aucun nonce, jeton ou secret n'est passé en argument de ligne de commande (visibles par `Get-Process` ou Process Hacker).
   - L'échange du nonce de validation se fait exclusivement **in-band sur le Named Pipe** immédiatement après établissement de la connexion.
4. **Authentification Mutuelle des Processus :**
   - Le Helper appelle `GetNamedPipeClientProcessId(hPipe, &clientPid)` et vérifie que `clientPid === process.pid` du Main Process.
   - Le Main Process appelle `GetNamedPipeServerProcessId(hPipe, &serverPid)` et vérifie le PID du processus fils spawned.
5. **Catalogue Fermé & Arrêt Immédiat :** Le Helper exécute exclusivement l'action typée autorisée (`actionId`), renvoie la réponse typée, enregistre l'opération dans le journal d'audit local, ferme le canal et s'arrête (`exit 0`).

---

## 3. CONTRATS IPC & VALIDATION DES MESSAGES (ZOD SCHEMAS)

Le preload n'expose **aucune fonction générique**. Chaque canal est scellé et typé.
**Règle critique : Le renderer ne transmet JAMAIS de chemin de fichier, que ce soit pour le scan manuel ou pour la remédiation.**

### 3.1 Schémas de Validation Côté Main Process

```typescript
import { z } from 'zod';

// Schéma pour le déclenchement d'un scan manuel via dialogue natif OS (ZÉRO chemin transmis par le renderer)
export const RequestScanFileDialogSchema = z.object({
  enginePreference: z.enum(['all', 'defender_only', 'yara_only', 'clamav_only']).default('all')
});

// Schéma pour la remédiation sécurisée : UNIQUEMENT PAR SCAN_ID
export const RemediateScannedFileSchema = z.object({
  scanId: z.string().uuid("scanId invalide ou expiré"),
  action: z.enum(['quarantine', 'delete', 'whitelist']),
  userConfirmed: z.literal(true)
});

// Schéma pour l'application d'un serveur DNS
export const ApplyDnsSchema = z.object({
  provider: z.enum(['cloudflare', 'google', 'quad9', 'dhcp_auto']),
  adapterIndex: z.number().int().positive().optional()
});

// Schéma pour la requête d'explication (Données strictement pseudonymisées)
export const AIExplainRequestSchema = z.object({
  threatName: z.string().max(120),
  detectionEngine: z.enum(['defender', 'clamav', 'yara', 'amsi']),
  fileCategory: z.enum(['USER_DOWNLOADS', 'TEMP', 'PROGRAM_FILES', 'EXTERNAL_DRIVE']),
  fileExtension: z.string().max(10),
  riskIndicators: z.array(z.string().max(80)).max(10),
  chosenProvider: z.enum(['deterministic_local', 'llm7_experimental', 'ovh_experimental'])
});

// Schéma pour la connexion au tunnel VPN
export const VpnConnectSchema = z.object({
  serverId: z.string().min(1),
  protocol: z.enum(['udp', 'tcp']).default('udp'),
  customConfigContent: z.string().max(100000).optional()
});
```

---

## 4. ARCHITECTURE DU MOTEUR DE SÉCURITÉ MULTI-MOTEUR

### 4.1 Orchestrateur de Détection (`SecurityOrchestrator`)
Le coordinateur interroge chaque moteur de manière asynchrone et produit un rapport corrélé sans altérer la source d'un verdict :

```typescript
export interface EngineVerdict {
  engineName: 'Moteur Microsoft Defender' | 'Second avis ClamAV facultatif' | 'Moteur de règles YARA-X' | 'AMSI';
  status: 'clean' | 'threat_detected' | 'suspicious' | 'error' | 'unavailable';
  threatName?: string;
  signatureVersion?: string;
  details?: string;
  durationMs: number;
}

export interface SecurityReport {
  scanId: string; // UUID v4 éphémère (validité 10 min)
  targetCategory: string; // Ex: USER_DOWNLOADS/FILE_001.exe
  sha256: string;
  fileSizeBytes: number;
  mtimeMs: number;
  authenticodeStatus: 'valid_signature' | 'unsigned' | 'invalid_cert' | 'not_applicable';
  verdicts: EngineVerdict[];
  consensusLevel: 'clean' | 'suspicious' | 'confirmed_malware' | 'divergent';
  confidenceScore: number;
  remediationOptions: ('quarantine' | 'delete' | 'whitelist')[];
  timestamp: string;
}
```

### 4.2 Interprétation Multi-Facteurs Microsoft Defender
L'analyse via `MpCmdRun.exe` s'effectue systématiquement avec `-ReturnHR`.
Le résultat n'est jamais interprété par le simple code de sortie :
- **Code 0 :** Peut indiquer soit l'absence de menace, soit qu'une menace a été détectée puis neutralisée par Windows.
- **Code 2 :** Peut indiquer une menace active non neutralisée, ou une erreur de traitement.
- **Protocole de corrélation obligatoire :**
  1. Capture du HRESULT retourné par `MpCmdRun.exe`.
  2. Interrogation de `Get-MpThreatDetection` pour extraire les menaces détectées dans la fenêtre temporelle du scan.
  3. Lecture de l'état de remédiation (`RemediationStatus`) dans les journaux d'événements Defender (Event ID 1116 et 1117).
  4. Détermination du statut réel : Menace active, Menace neutralisée, ou Fichier sain.

### 4.3 Formule Déterministe du Score de Confiance
$$\text{Score} = \min\left(100, \sum_{i} W_i \cdot V_i\right)$$
- $W_{\text{Defender}} = 45$ (Poids du moteur de référence Microsoft)
- $W_{\text{ClamAV}} = 30$ (Poids du second avis indépendant)
- $W_{\text{YARA-X}} = 25$ (Poids des règles heuristiques locales YARA-X 1.21.x)
- $W_{\text{AMSI}} = 30$ (Poids de l'évaluation dynamique de script)
- **Règle Authenticode :** Aucun point n'est déduit pour la présence d'une signature numérique valide.

---

## 5. ARCHITECTURE CLOUD AI — PRIORITÉ LOCALE & SPIKE DE QUALIFICATION

### 5.1 Architecture en Deux Niveaux
1. **Socle de Référence par Défaut (100% Local) : Diagnostic local déterministe**
   - Zéro appel réseau, zéro dépendance externe, zéro modèle génératif.
   - Génère instantanément le brief d'accueil et les synthèses techniques à partir de gabarits textuels vérifiés et de seuils télémétriques.
   - Ne doit jamais être qualifié de LLM ou d'IA agentique.
2. **Fournisseurs Cloud Expérimentaux Facultatifs : `LLM7AnonymousProvider` & `OVHAnonymousProvider`**
   - Réservés à un usage optionnel après activation manuelle et consentement explicite de l'utilisateur.
   - Ne sont intégrés qu'après validation complète du **Spike Pré-Implémentation** dédié.
   - Si le spike échoue, la fonction générative reste marquée `Indisponible`.

### 5.2 Cahier des Charges Strict du Spike IA
Le spike d'évaluation (`scratch/spike-ai-qualification.mjs`) est strictement borné :
- **Volume :** Maximum 3 requêtes fonctionnelles par endpoint.
- **Charge :** Aucun test de charge agressif, aucune tentative d'épuisement de quota.
- **Données :** Aucune donnée utilisateur réelle (uniquement des données synthétiques fictives).
- **Sécurité :** Aucun secret ou token consigné dans les logs.
- **Contrats :** Revue humaine séparée des conditions d'utilisation (ToS), de la rétention des données et des droits d'intégration dans une application distribuée.

---

## 6. ARCHITECTURE DU TUNNEL VPN COMMUNAUTAIRE (VPN GATE & WINTUN)

### 6.1 Traitement Sécurisé des Fichiers `.ovpn` (Parser Strict)
Pour neutraliser tout risque d'exécution de code arbitraire :
1. **Contrôle des directives interdites :** Refus immédiat de toute directive de script (`--up`, `--down`), hook, plugin, ou chargement de DLL.
2. **Authentification serveur obligatoire :** Vérification de la présence de `remote-cert-tls server` et de la validité de la chaîne CA.
3. **Ancrage d'identité :**
   - Si `verify-x509-name` ou `peer-fingerprint` est présent : validation stricte de l'hôte.
   - Si absent : affichage obligatoire du statut `Identité du relais non vérifiée indépendamment`.
4. **Configuration temporaire sous ACLs privées :** Générée dans `%LOCALAPPDATA%\AstralVanguard\vpn\tmp\` et effacée dès la fermeture.

---

## 7. MATRICE DE DÉBLOCAGE DÉCOUPLÉE (GATING MATRIX)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   MATRICE DE DÉBLOCAGE DE L'IMPLÉMENTATION (REV. 3.3.1)                │
├──────────┬─────────────────────────┬────────────────────────────┬──────────────────────┤
│ Porte    │ Périmètre Autorisé      │ Condition Bloquante        │ Action de Validation │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 0   │ Phase 0 uniquement      │ Approbation formelle de la │ Revue humaine        │
│          │ (Baseline, bench, spike)│ Révision 3.3.1             │ explicite            │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 1A  │ Phase 1                 │ Phase 0 validée            │ Tests unitaire verts │
│          │ (Anti-effacement, IPC)  │ (Indépendant du spike Pipe)│ scanId & pathGuard   │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 2   │ Phase 2                 │ Phase 1 validée            │ Grep sans simulation │
│          │ (Nettoyage simulations) │                            │                      │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 3   │ Phase 3                 │ Succès complet du spike    │ 9 tests Named Pipe   │
│          │ (Privileged Helper)     │ Named Pipe (Logon SID)     │ validés avec succès  │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 8   │ Phase 8 (Fournisseurs   │ Succès complet du spike IA │ ToS, quotas et       │
│          │ Cloud Optionnels)       │ borné et revue ToS         │ 3 requêtes réussies  │
├──────────┼─────────────────────────┼────────────────────────────┼──────────────────────┤
│ GATE 13  │ Phase 13                │ Parser OVPN strict validé  │ Rejet des scripts et │
│          │ (Tunnel VPN)            │ et Wintun 0.14.1 qualifié  │ statut relais vérifié│
└──────────┴─────────────────────────┴────────────────────────────┴──────────────────────┘
```
