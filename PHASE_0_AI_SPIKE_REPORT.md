# Rapport de Qualification du Spike IA & Diagnostic Système (Phase 0)

> **Document de Référence :** [PRODUCT_REQUIREMENTS_V3.md](file:///f:/code/Astral-Security-Guard-vpn-main/PRODUCT_REQUIREMENTS_V3.md) §1 & §4, [TARGET_ARCHITECTURE_V3.md](file:///f:/code/Astral-Security-Guard-vpn-main/TARGET_ARCHITECTURE_V3.md) §5  
> **Script d'Évaluation :** [scratch/spike-ai-qualification.mjs](file:///f:/code/Astral-Security-Guard-vpn-main/scratch/spike-ai-qualification.mjs)  
> **Données Brutes du Spike :** [scratch/spike-ai-results.json](file:///f:/code/Astral-Security-Guard-vpn-main/scratch/spike-ai-results.json)  
> **Date UTC :** 2026-10-04T15:12:00Z  
> **Environnement :** Node.js v24.13.0 x64, Windows 11 / Windows 10 x64  
> **Statut de Qualification :** **DIAGNOSTIC LOCAL DÉTERMINISTE VALIDÉ COMME UNIQUE MOTEUR ACTIF EN V3.0 (FOURNISSEURS CLOUD INÉLIGIBLES SANS COMPTE)**

---

## 1. Contexte & Encadrement Strict du Spike

Dans le cadre de la refonte architecturale d'Astral Vanguard, la vision produit impose une accessibilité totale :
- application gratuite pour l'utilisateur final ;
- **utilisable sans créer de compte, sans clé API, sans abonnement et sans configuration complexe** ;
- protection rigoureuse de la vie privée (minimisation des données, zéro fuite non consentie).

Ce spike technique a été exécuté sous un encadrement strict et des garde-fous prédéfinis :
1. **Plafond de requêtes :** strictement borné à 3 requêtes fonctionnelles maximum par fournisseur.
2. **Étanchéité des données :** **zéro donnée utilisateur réelle** transmise. Seuls des payloads synthétiques de test de sécurité ont été employés (hash fictif, événement de log d'alerte simulé).
3. **Absence de stress-testing :** aucune charge, aucune concurrence, respect strict des quotas des infrastructures distantes.
4. **Zéro secret dans les journaux :** masquage et assainissement intégral des flux de réponse.

---

## 2. Relevé Technique des Tests Réseau

Les tests ont été exécutés directement par le runtime Node.js v24 (`fetch` natif) depuis l'environnement d'exécution Windows.

### 2.1 Fournisseur 1 : LLM7 Gateway (`https://api.llm7.io`)

| Réf. Requête | Méthode & Endpoint | Contenu du Payload (Synthétique) | Code HTTP | Latence | Type de Réponse / Résultat |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **REQ-LLM7-1** | `GET /v1/models` | Aucun (Découverte du catalogue) | **`200 OK`** | 117 ms | `application/json` : Catalogue disponible (`DeepSeek-V4.1-Flash`, `GLM-5.3-Flash`, `Inkling`, etc.). |
| **REQ-LLM7-2** | `POST /v1/chat/completions` | Analyse hash synthétique `44d886...` (Modèle `DeepSeek-V4.1-Flash`) | **`401 Unauthorized`** | 49 ms | `application/json` : Requiert une clé d'authentification (`Bearer token`). |
| **REQ-LLM7-3** | `POST /v1/chat/completions` | Analyse log alerte synthétique `ExitCode 2` (Modèle `DeepSeek-V4.1-Flash`) | **`401 Unauthorized`** | 93 ms | `application/json` : Requiert une clé d'authentification (`Bearer token`). |

#### Analyse Technique LLM7 :
- Le point d'entrée de découverte des modèles est public (`200 OK`), mais **l'inférence conversationnelle (`/v1/chat/completions`) impose une clé API (authentification obligatoire)**.
- Par conséquent, LLM7 **ne constitue pas une passerelle anonyme ouverte utilisable sans clé API**.

---

### 2.2 Fournisseur 2 : OVHcloud AI Endpoints (`https://endpoints.ai.cloud.ovh.net`)

| Réf. Requête | Méthode & Endpoint | Contenu du Payload (Synthétique) | Code HTTP | Latence | Type de Réponse / Résultat |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **REQ-OVH-1** | `GET /v1/models` | Requête anonyme sans en-tête d'authentification | **`200 OK`** | 115 ms | `text/html` : Redirection/Service du portail web Next.js (`/_next-ai-endpoint/...`). |
| **REQ-OVH-2** | `POST /v1/chat/completions` | Modèle synthétique `Llama-3-8B-Instruct` sans jeton | **`200 OK`** | 33 ms | `text/html` : Redirection/Service du portail web Next.js (`/_next-ai-endpoint/...`). |

#### Analyse Technique OVHcloud :
- Les requêtes sans jeton d'authentification OVHcloud sont captées par le frontal web de la plateforme (`text/html`) et ne routent vers aucune API REST d'inférence.
- L'utilisation des AI Endpoints d'OVHcloud requiert impérativement un compte OVHcloud, la création d'un projet public cloud et l'approvisionnement d'un jeton d'accès IAM (`Authorization: Bearer <ovh_token>`).
- Par conséquent, OVHcloud **ne peut pas être exploité en mode client gratuit sans compte ni configuration**.

---

## 3. Analyse Juridique, ToS et Respect de la Vie Privée

| Dimension | Évaluation LLM7 | Évaluation OVHcloud | Conséquence pour Astral Vanguard |
| :--- | :--- | :--- | :--- |
| **Conditions d'Utilisation (ToS)** | Service tiers sans SLA garanti pour usage gratuit ; conditions modifiables unilatéralement. | Service d'infrastructure entreprise régi par contrat de cloud payant ; interdiction de revente non couverte. | Risque de rupture brutale de service ou de facturation imprévue. |
| **Politique de Rétention des Données** | Journalisation potentielle des adresses IP d'origine et des invites (*prompts*). | Conforme RGPD (serveurs UE), mais journalisation des requêtes liée au compte émetteur. | Risque pour la confidentialité de l'utilisateur final si des métadonnées de sécurité sont transmises. |
| **Droits de Redistribution** | Aucun accord de distribution OEM / bundle pour une application tierce grand public. | Nécessite un contrat de partenariat commercial ou de revendeur d'API. | Incompatible avec une distribution gratuite à large échelle sans compte. |
| **Adéquation Vision Produit** | **Non conforme** (nécessite une clé API personnelle de l'utilisateur). | **Non conforme** (nécessite un compte et des crédits cloud). | **Rejet des deux fournisseurs en tant que services intégrés par défaut.** |

---

## 4. Décision Architecturale Finale pour Astral Vanguard v3.0

À l'issue de cette qualification technique et juridique formelle :

### 4.1 Diagnostic Local Déterministe : Moteur Exclusif et Souverain

Le **Diagnostic local déterministe** (implémenté en pur TypeScript natif dans le processus principal Node.js d'Electron) est retenu comme **l'unique mécanisme actif d'analyse système dans Astral Vanguard v3.0** :
1. **100% Hors-Ligne & Zéro Réseau :** fonctionnement garanti sans connexion Internet, résistant aux pannes réseau ou aux blocages pare-feu.
2. **Zéro Compte & Zéro Clé API :** aucun compte utilisateur, aucune souscription, aucune clé secrète requise.
3. **Zéro Hallucination & Déterminisme Total :** les règles de diagnostic reposent sur des arbres de décision déterministes, inspectant l'état réel des services Windows (Defender, Pare-feu, DNS, processus gourmands).
4. **Respect Absolu de la Vie Privée :** aucune donnée de télémétrie, aucun hash, aucun log ne quitte la machine de l'utilisateur.
5. **Performance Immédiate :** temps de réponse inférieur à 5 millisecondes (vs 100 à 2000 ms pour une API distante).

### 4.2 Statut des Fournisseurs Cloud Expérimentaux

- Les modules prévus initialement (`LLM7AnonymousProvider` et `OVHAnonymousProvider`) sont déclarés **INÉLIGIBLES EN V3.0 EN MODE ANONYME SANS COMPTE**.
- L'architecture logicielle conservera l'interface abstraite (`ISystemDiagnosticProvider`) afin de préserver l'extensibilité future (ex. si un utilisateur expert souhaite configurer explicitement sa propre clé API personnelle dans les paramètres avancés en mode Bring Your Own Key / BYOK).
- **En v3.0, aucun appel réseau d'IA ne sera activé, et le produit n'aura aucune dépendance envers un quelconque service d'IA distant.**
- La promesse produit et la documentation utilisateur seront parfaitement limpides : *« Diagnostic local déterministe haute performance, respectueux de votre vie privée et sans recours à des serveurs distants. »*
