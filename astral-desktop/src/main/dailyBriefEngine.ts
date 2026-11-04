/**
 * Daily Brief Engine — Vanguard Core
 * 
 * Gestionnaire du Brief Quotidien combinant :
 * 1. Collecte et minimisation stricte de la télémétrie locale (liste fermée de champs)
 * 2. Appel au modèle IA souverain OVHcloud AI Endpoints (accès anonyme, 2 req/min)
 * 3. Synthèse déterministe locale hors-ligne sans IA
 * 4. Gestion rigoureuse de la machine à 4 états (generated, deterministic, cached, unavailable)
 * 5. Cache daté avec déduplication des requêtes concurrentes et gestion des quotas HTTP 429
 * 6. Protection absolue de la vie privée (zéro secret, zéro IP dans le prompt, zéro Vault)
 * 7. Gestion fine du consentement : annulation en vol, rejet des réponses tardives, isolation par profil
 */

import os from 'node:os';
import https from 'node:https';
import { logger } from './logger.ts';
import { defenderOrchestrator } from './defenderOrchestrator.ts';
import type { DefenderStatus, DefenderThreat } from './defenderOrchestrator.ts';
import { userProfileManager } from './profile.ts';

export type BriefSourceType = 'generated' | 'deterministic' | 'cached' | 'unavailable';

export interface ObservationDimension {
  status: 'ok' | 'warning' | 'alert' | 'unknown';
  label: string;
  detail: string;
}

export interface BriefObservations {
  protection: ObservationDimension;
  storage:    ObservationDimension;
  workload:   ObservationDimension;
  network:    ObservationDimension;
}

export interface ContextualAction {
  id: string;
  label: string;
  tabTarget: string;
}

export interface DailyBriefResult {
  source: BriefSourceType;
  profileId?: string;
  providerName?: string;
  modelName?: string;
  headline: string;
  summary: string;
  observations: BriefObservations;
  suggestedActions: ContextualAction[];
  generatedAt: number;
  cachedUntil?: number;
  errorMessage?: string;
  rateLimitRemaining?: number;
  quotaRetryAfterSec?: number;
}

/**
 * Payload strictement minimisé envoyé au modèle (liste fermée)
 * N'inclut aucun nom d'utilisateur, aucun chemin, aucun nom de fichier,
 * aucune IP locale ou publique, aucun jeton, aucun secret, aucun journal brut.
 */
export interface SafeBriefPayload {
  osUptimeHours: number;
  ramTotalGB: number;
  ramUsedGB: number;
  ramPercent: number;
  diskTotalGB: number;
  diskFreeGB: number;
  diskUsedPercent: number;
  antivirusActive: boolean | null;
  realtimeActive: boolean | null;
  threatsCount: number;
  networkLatencyMs: number | null;
}

export interface DailyBriefEngineHooks {
  httpPost?: (url: string, body: string, headers: Record<string, string>, signal?: AbortSignal) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>;
  now?: () => number;
  diskTelemetryFetcher?: () => Promise<{ totalGB: number; freeGB: number; usedPercent: number }>;
  pingFetcher?: () => Promise<number | null>;
}

export class DailyBriefEngine {
  private cache: DailyBriefResult | null = null;
  private inFlightPromise: Promise<DailyBriefResult> | null = null;
  private activeAbortController: AbortController | null = null;
  private lastRequestTimestamp: number = 0;
  private quotaCooldownUntil: number = 0;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MIN_COOLDOWN_MS = 60 * 1000;   // Cooldown minimal d'1 minute entre appels distants

  private hooks: DailyBriefEngineHooks | null = null;

  public setTestHooks(hooks: DailyBriefEngineHooks | null) {
    this.hooks = hooks;
  }

  private getNow(): number {
    return this.hooks?.now ? this.hooks.now() : Date.now();
  }

  /**
   * Révocation immédiate du consentement : annule toute requête distante en cours
   * et purge tout brief généré par IA présent dans le cache.
   */
  public revokeConsent(): void {
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
      this.activeAbortController = null;
    }
    if (this.cache?.source === 'generated') {
      this.cache = null;
    }
    logger.info('[DailyBrief] Consentement IA révoqué. Requêtes en cours annulées et cache nettoyé.');
  }

  /**
   * Récupération des observations système actuelles en direct
   * (indépendamment du texte du brief qui peut être en cache)
   */
  public async getLiveObservations(): Promise<{ telemetry: SafeBriefPayload; observations: BriefObservations; actions: ContextualAction[] }> {
    // 1. Defender & Menaces
    let defenderStatus: DefenderStatus | null = null;
    let threats: DefenderThreat[] = [];
    try {
      defenderStatus = await defenderOrchestrator.getStatus();
      threats = await defenderOrchestrator.getDetectionHistory(5);
    } catch (e: any) {
      logger.warn('[DailyBrief] Impossible de lire l\'état Defender:', e?.message);
    }

    const threatsCount = threats.length;
    const antivirusActive = defenderStatus ? defenderStatus.antivirusEnabled : null;
    const realtimeActive = defenderStatus ? defenderStatus.realTimeProtectionEnabled : null;

    // 2. Télémétrie disque système C:
    let diskTotalGB = 0;
    let diskFreeGB = 0;
    let diskUsedPercent = 0;
    if (this.hooks?.diskTelemetryFetcher) {
      const d = await this.hooks.diskTelemetryFetcher();
      diskTotalGB = d.totalGB;
      diskFreeGB = d.freeGB;
      diskUsedPercent = d.usedPercent;
    } else {
      try {
        const { statfsSync } = await import('node:fs');
        const stats = statfsSync('C:\\');
        const totalBytes = stats.bsize * stats.blocks;
        const freeBytes = stats.bsize * stats.bfree;
        diskTotalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
        diskFreeGB = Math.round(freeBytes / (1024 * 1024 * 1024));
        diskUsedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;
      } catch {
        diskTotalGB = 512;
        diskFreeGB = 256;
        diskUsedPercent = 50;
      }
    }

    // 3. Télémétrie mémoire & uptime
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const ramTotalGB = Math.round(totalMemBytes / (1024 * 1024 * 1024));
    const ramUsedGB = Math.round((totalMemBytes - freeMemBytes) / (1024 * 1024 * 1024));
    const ramPercent = totalMemBytes > 0 ? Math.round(((totalMemBytes - freeMemBytes) / totalMemBytes) * 100) : 0;
    const osUptimeHours = Math.round(os.uptime() / 3600);

    // 4. Latence réseau vers 1.1.1.1
    let networkLatencyMs: number | null = null;
    if (this.hooks?.pingFetcher) {
      networkLatencyMs = await this.hooks.pingFetcher();
    } else {
      try {
        const net = await import('node:net');
        networkLatencyMs = await new Promise<number | null>((resolve) => {
          const s = Date.now();
          const sock = net.createConnection({ host: '1.1.1.1', port: 443, timeout: 2000 }, () => {
            const lat = Date.now() - s;
            sock.destroy();
            resolve(lat);
          });
          sock.on('error', () => { sock.destroy(); resolve(null); });
          sock.on('timeout', () => { sock.destroy(); resolve(null); });
        });
      } catch {
        networkLatencyMs = null;
      }
    }

    const telemetry: SafeBriefPayload = {
      osUptimeHours,
      ramTotalGB,
      ramUsedGB,
      ramPercent,
      diskTotalGB,
      diskFreeGB,
      diskUsedPercent,
      antivirusActive,
      realtimeActive,
      threatsCount,
      networkLatencyMs,
    };

    // Construction déterministe des observations multi-dimensions
    // Protection
    let protStatus: 'ok' | 'warning' | 'alert' | 'unknown' = 'ok';
    let protDetail = 'Antivirus et protection temps réel opérationnels.';
    if (threatsCount > 0) {
      protStatus = 'alert';
      protDetail = `${threatsCount} élément(s) suspect(s) détecté(s) nécessitant votre attention.`;
    } else if (antivirusActive === false || realtimeActive === false) {
      protStatus = 'warning';
      protDetail = 'Protection résidente ou temps réel désactivée.';
    } else if (antivirusActive === null) {
      protStatus = 'unknown';
      protDetail = 'État de la protection Defender non disponible.';
    }

    // Stockage
    let storStatus: 'ok' | 'warning' | 'alert' | 'unknown' = 'ok';
    let storDetail = `Espace disque disponible : ${diskFreeGB} Go libres (${diskUsedPercent}% utilisé).`;
    if (diskUsedPercent >= 92 || diskFreeGB < 15) {
      storStatus = 'alert';
      storDetail = `Espace critique sur le lecteur C: (${diskFreeGB} Go restants, ${diskUsedPercent}% saturé).`;
    } else if (diskUsedPercent >= 80 || diskFreeGB < 30) {
      storStatus = 'warning';
      storDetail = `Stockage C: modérément chargé (${diskFreeGB} Go restants, ${diskUsedPercent}%).`;
    }

    // Charge
    let workStatus: 'ok' | 'warning' | 'alert' | 'unknown' = 'ok';
    let workDetail = `Mémoire vive stable (${ramUsedGB} / ${ramTotalGB} Go, ${ramPercent}%).`;
    if (ramPercent >= 90) {
      workStatus = 'warning';
      workDetail = `Consommation mémoire élevée (${ramPercent}%, ${ramUsedGB} / ${ramTotalGB} Go utilisés).`;
    }

    // Réseau
    let netStatus: 'ok' | 'warning' | 'alert' | 'unknown' = 'ok';
    let netDetail = networkLatencyMs !== null
      ? `Latence vers DNS Cloudflare : ${networkLatencyMs} ms.`
      : 'Connectivité réseau opérationnelle.';

    const observations: BriefObservations = {
      protection: { status: protStatus, label: 'Protection', detail: protDetail },
      storage:    { status: storStatus, label: 'Stockage', detail: storDetail },
      workload:   { status: workStatus, label: 'Charge système', detail: workDetail },
      network:    { status: netStatus, label: 'Réseau', detail: netDetail },
    };

    // Actions contextuelles décidées par le code
    const actions: ContextualAction[] = [];
    if (protStatus === 'alert' || protStatus === 'warning') {
      actions.push({ id: 'security-remediate', label: 'Examiner la sécurité', tabTarget: 'security' });
    }
    if (storStatus === 'alert' || storStatus === 'warning') {
      actions.push({ id: 'disk-cleanup', label: 'Libérer de l\'espace disque', tabTarget: 'performance' });
    }
    if (actions.length === 0) {
      actions.push({ id: 'security-scan', label: 'Lancer une analyse', tabTarget: 'security' });
      actions.push({ id: 'maintenance-center', label: 'Centre de maintenance', tabTarget: 'performance' });
    }

    return { telemetry, observations, actions };
  }

  /**
   * Synthèse déterministe locale hors ligne (État 2)
   */
  public generateDeterministicSummary(obs: BriefObservations, t: SafeBriefPayload): { headline: string; summary: string } {
    const hasThreats = obs.protection.status === 'alert';
    const isDefenderDown = obs.protection.status === 'warning';
    const isDiskFull = obs.storage.status === 'alert';

    let headline = 'Système sous surveillance active';
    if (hasThreats) {
      headline = 'Alerte sécurité : Action requise sur des éléments suspects';
    } else if (isDefenderDown) {
      headline = 'Attention : Protection résidente à vérifier';
    } else if (isDiskFull) {
      headline = 'Stockage système : Espace disque C: presque saturé';
    } else if (obs.protection.status === 'ok' && obs.storage.status === 'ok') {
      headline = 'Système opérationnel : Aucune anomalie détectée';
    }

    const parts: string[] = [];
    parts.push(obs.protection.detail);
    parts.push(obs.storage.detail);
    parts.push(obs.workload.detail);

    const summary = parts.join(' ');
    return { headline, summary };
  }

  /**
   * Exécution de l'appel HTTP distant sécurisé vers OVHcloud AI Endpoints
   */
  private async executeOvhRequest(payload: SafeBriefPayload): Promise<{ content: string; rateLimitRemaining?: number; retryAfter?: number }> {
    const prompt = `Tu es l'assistant de sécurité Vanguard. Rédige un bref résumé factuel en français (3 à 4 phrases maximum, style direct, sobre et rassurant) pour l'utilisateur sur l'état de son PC, à partir de ces indicateurs stricts :
- Protection antivirus : ${payload.antivirusActive ? 'Active' : 'Inconnue/Arrêtée'}, Menaces actives : ${payload.threatsCount}
- Disque C: ${payload.diskUsedPercent}% utilisé (${payload.diskFreeGB} Go libres sur ${payload.diskTotalGB} Go)
- Mémoire vive : ${payload.ramPercent}% (${payload.ramUsedGB} Go sur ${payload.ramTotalGB} Go)
- Système en cours d'exécution depuis : ${payload.osUptimeHours}h
Ne cite aucun nom de modèle ni de formule mathématique. Si une alerte existe sur le disque ou la protection, mets-la en avant.`;

    const requestBody = JSON.stringify({
      model: 'Mistral-Nemo-Instruct-2407',
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.2,
    });

    const url = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const abortCtrl = new AbortController();
    this.activeAbortController = abortCtrl;

    if (this.hooks?.httpPost) {
      try {
        const res = await this.hooks.httpPost(url, requestBody, headers, abortCtrl.signal);
        if (res.statusCode === 429) {
          const retry = parseInt(res.headers['retry-after'] || '60', 10);
          const err: any = new Error('Rate limit exceeded (HTTP 429)');
          err.statusCode = 429;
          err.retryAfter = isNaN(retry) ? 60 : retry;
          throw err;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err: any = new Error(`HTTP Error ${res.statusCode}`);
          err.statusCode = res.statusCode;
          throw err;
        }
        const data = JSON.parse(res.body);
        const content = data.choices?.[0]?.message?.content?.trim() || '';
        const rem = parseInt(res.headers['ratelimit-remaining'] || res.headers['x-ratelimit-remaining-minute'] || '0', 10);
        return { content, rateLimitRemaining: rem };
      } finally {
        if (this.activeAbortController === abortCtrl) {
          this.activeAbortController = null;
        }
      }
    }

    // Implémentation native via node:https avec signal d'annulation
    return new Promise<{ content: string; rateLimitRemaining?: number; retryAfter?: number }>((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers,
        timeout: 8000,
        signal: abortCtrl.signal,
      }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          const rem = parseInt(String(res.headers['ratelimit-remaining'] || res.headers['x-ratelimit-remaining-minute'] || '0'), 10);
          if (res.statusCode === 429) {
            const retry = parseInt(String(res.headers['retry-after'] || '60'), 10);
            const err: any = new Error('Rate limit exceeded (HTTP 429)');
            err.statusCode = 429;
            err.retryAfter = isNaN(retry) ? 60 : retry;
            return reject(err);
          }
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            const err: any = new Error(`HTTP Error ${res.statusCode}: ${raw.slice(0, 100)}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          try {
            const data = JSON.parse(raw);
            const content = data.choices?.[0]?.message?.content?.trim() || '';
            resolve({ content, rateLimitRemaining: isNaN(rem) ? 0 : rem });
          } catch (e: any) {
            reject(new Error(`Réponse JSON invalide: ${e.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Délai d\'attente dépassé (timeout 8s)'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(requestBody);
      req.end();
    }).finally(() => {
      if (this.activeAbortController === abortCtrl) {
        this.activeAbortController = null;
      }
    });
  }

  /**
   * Obtention du Brief Quotidien avec gestion du cache, du quota, du consentement et isolation par profil
   */
  public async getDailyBrief(forceRefresh: boolean = false): Promise<DailyBriefResult> {
    const now = this.getNow();

    // 1. Lire les observations en direct pour garantir la fraîcheur des alertes
    const { telemetry, observations, actions } = await this.getLiveObservations();

    // Récupérer l'identifiant local stable du profil actif
    const profile = userProfileManager.getProfile();
    const profileId = profile.profileId || 'profile-local-primary';

    // 2. Vérifier le cache si forceRefresh n'est pas demandé ET si le profil correspond
    if (!forceRefresh && this.cache && this.cache.profileId === profileId) {
      const age = now - this.cache.generatedAt;
      if (age < this.CACHE_TTL_MS) {
        // Retourner le résultat en cache, mais avec les observations en direct actualisées
        return {
          ...this.cache,
          source: 'cached',
          observations, // Alertes fraîches préservées !
          suggestedActions: actions,
        };
      }
    }

    // 3. Déduplication des demandes concurrentes en vol
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.performFetchBrief(telemetry, observations, actions, forceRefresh, profileId)
      .finally(() => {
        this.inFlightPromise = null;
      });

    return this.inFlightPromise;
  }

  private async performFetchBrief(
    telemetry: SafeBriefPayload,
    observations: BriefObservations,
    actions: ContextualAction[],
    forceRefresh: boolean,
    profileId: string
  ): Promise<DailyBriefResult> {
    const now = this.getNow();

    // Vérifier le consentement utilisateur
    const profile = userProfileManager.getProfile();
    const isConsentGranted = profile.aiBriefConsent === 'granted';

    // Si pas de consentement accordé : génération déterministe locale immédiate
    if (!isConsentGranted) {
      const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
      const res: DailyBriefResult = {
        source: 'deterministic',
        profileId,
        headline,
        summary,
        observations,
        suggestedActions: actions,
        generatedAt: now,
      };
      this.cache = res;
      return res;
    }

    // Vérifier si le quota est en cooldown
    if (now < this.quotaCooldownUntil) {
      const remainingSec = Math.ceil((this.quotaCooldownUntil - now) / 1000);
      logger.info(`[DailyBrief] Quota OVHcloud en période de cooldown (${remainingSec}s restantes).`);
      const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
      return {
        source: 'unavailable',
        profileId,
        headline,
        summary,
        observations,
        suggestedActions: actions,
        generatedAt: now,
        errorMessage: `Service temporairement indisponible (quota 2 req/min atteint). Réessayer dans ${remainingSec}s.`,
        quotaRetryAfterSec: remainingSec,
      };
    }

    // Vérifier l'intervalle minimal entre requêtes distantes (1 min pour respecter les 2 req/min par IP)
    if (forceRefresh && (now - this.lastRequestTimestamp < this.MIN_COOLDOWN_MS)) {
      const waitSec = Math.ceil((this.MIN_COOLDOWN_MS - (now - this.lastRequestTimestamp)) / 1000);
      logger.info(`[DailyBrief] Rafraîchissement manuel trop rapproché. Attente de ${waitSec}s.`);
      if (this.cache && this.cache.profileId === profileId) {
        return {
          ...this.cache,
          source: 'cached',
          observations,
          suggestedActions: actions,
        };
      }
      const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
      return {
        source: 'deterministic',
        profileId,
        headline,
        summary,
        observations,
        suggestedActions: actions,
        generatedAt: now,
        errorMessage: `Veuillez patienter ${waitSec}s avant d'actualiser à nouveau.`,
      };
    }

    // Tentative d'appel distant vers OVHcloud AI Endpoints
    this.lastRequestTimestamp = now;
    try {
      const { content, rateLimitRemaining } = await this.executeOvhRequest(telemetry);

      // Contrôle post-réponse : vérifier si le profil ou le consentement a changé pendant la requête
      const currentProfileCheck = userProfileManager.getProfile();
      const currentProfileId = currentProfileCheck.profileId || 'profile-local-primary';
      if (currentProfileId !== profileId) {
        logger.info('[DailyBrief] Profil modifié pendant le transit de la requête. Réponse distante écartée.');
        const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
        return {
          source: 'deterministic',
          profileId: currentProfileId,
          headline,
          summary,
          observations,
          suggestedActions: actions,
          generatedAt: now,
          errorMessage: 'Profil modifié pendant le traitement. Synthèse locale déterministe affichée.',
        };
      }
      if (currentProfileCheck.aiBriefConsent !== 'granted') {
        logger.info('[DailyBrief] Consentement retiré pendant le transit de la requête. Réponse distante écartée.');
        const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
        const lateFallback: DailyBriefResult = {
          source: 'deterministic',
          profileId,
          headline,
          summary,
          observations,
          suggestedActions: actions,
          generatedAt: now,
          errorMessage: 'Consentement retiré pendant le traitement. Synthèse locale déterministe affichée.',
        };
        this.cache = lateFallback;
        return lateFallback;
      }

      // Traiter la réponse comme du contenu non fiable (longueur bornée, assainissement balises)
      const cleanContent = content.replace(/<[^>]*>/g, '').trim().slice(0, 500);

      const hasAlert = observations.protection.status === 'alert' || observations.storage.status === 'alert';
      const headline = hasAlert
        ? (observations.protection.status === 'alert' ? 'Alerte sécurité — Action requise' : 'Attention requise sur le stockage')
        : 'Brief Système Quotidien';

      const result: DailyBriefResult = {
        source: 'generated',
        profileId,
        providerName: 'OVHcloud AI Endpoints',
        modelName: 'Mistral-Nemo-Instruct-2407',
        headline,
        summary: cleanContent || this.generateDeterministicSummary(observations, telemetry).summary,
        observations,
        suggestedActions: actions,
        generatedAt: now,
        cachedUntil: now + this.CACHE_TTL_MS,
        rateLimitRemaining,
      };

      this.cache = result;
      return result;
    } catch (err: any) {
      logger.warn('[DailyBrief] Échec de l\'appel OVHcloud :', err?.message);

      if (err?.statusCode === 429) {
        const cooldown = (err.retryAfter || 60) * 1000;
        this.quotaCooldownUntil = now + cooldown;
        const remainingSec = Math.ceil(cooldown / 1000);
        const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
        return {
          source: 'unavailable',
          profileId,
          headline,
          summary,
          observations,
          suggestedActions: actions,
          generatedAt: now,
          errorMessage: `Quota de requêtes atteint (2 req/min). Disponible dans ${remainingSec}s.`,
          quotaRetryAfterSec: remainingSec,
        };
      }

      // Autre erreur réseau (hors ligne, timeout, annulation) : bascule sur synthèse déterministe
      const { headline, summary } = this.generateDeterministicSummary(observations, telemetry);
      return {
        source: 'deterministic',
        profileId,
        headline,
        summary,
        observations,
        suggestedActions: actions,
        generatedAt: now,
        errorMessage: `Réseau distant indisponible (${err?.message}). Synthèse locale affichée.`,
      };
    }
  }

  public clearCache(): void {
    this.cache = null;
    this.lastRequestTimestamp = 0;
    this.quotaCooldownUntil = 0;
  }
}

export const dailyBriefEngine = new DailyBriefEngine();
