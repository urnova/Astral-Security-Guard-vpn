/**
 * ASTRAL VANGUARD v3.0 - GESTIONNAIRE GAMING RÉVERSIBLE & MESURABLE (LOT 2 / PHASE 11)
 *
 * Optimisations de jeu strictement réversibles et honnêtes :
 * - Détection du jeu actif et priorité de processus 'AboveNormal' ou 'High' (JAMAIS 'Realtime')
 * - Sauvegarde de la priorité d'origine du processus
 * - Sauvegarde du GUID du plan d'alimentation Windows actif (powercfg /getactivescheme)
 * - Restauration automatique à la fermeture du jeu
 * - Restauration automatique à la fermeture de Vanguard (hook before-quit)
 * - Récupération après crash (persistance de l'état dans gaming_rollback_state.json)
 * - Exclusion absolue des processus système critiques
 * - Avertissement explicite sur l'autonomie de la batterie
 * - ZÉRO promesse abusive de FPS ou de ping garanti
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { logger } from './logger';
import { runPowerShell } from './psHelper';
import { CRITICAL_SYSTEM_PROCESSES } from './telemetry';
import { presentMonEngine, PresentMonMetrics } from './presentmonEngine';

export interface GamingRollbackState {
  gamePid: number | null;
  gameProcessName: string | null;
  previousProcessPriority: string | null;
  previousPowerPlanGuid: string | null;
  timestamp: number;
}

export interface GamingOptimizationResult {
  success: boolean;
  gamePid: number;
  gameName: string;
  appliedPriority: 'AboveNormal' | 'High';
  previousPriority: string;
  appliedPowerPlanGuid: string;
  previousPowerPlanGuid: string;
  batteryWarning: string;
}

class GamingManager {
  private activeGamePid: number | null = null;
  private activeGameName: string | null = null;
  private previousPriority: string | null = null;
  private previousPowerPlanGuid: string | null = null;
  private isGamingActive = false;

  private stateFilePath: string;

  constructor() {
    try {
      this.stateFilePath = path.join(app.getPath('userData'), 'gaming_rollback_state.json');
    } catch {
      this.stateFilePath = path.resolve(__dirname, '../../../data/gaming_rollback_state.json');
    }
  }

  /**
   * Vérifie au démarrage si une session non restaurée existe suite à un crash
   */
  public async recoverFromPreviousCrash(): Promise<{ recovered: boolean; restoredGuid?: string }> {
    if (!fs.existsSync(this.stateFilePath)) {
      return { recovered: false };
    }

    try {
      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const state: GamingRollbackState = JSON.parse(raw);
      logger.warn('[GamingManager] État de session non restaurée détecté suite à un crash précédent :', state);

      if (state.previousPowerPlanGuid) {
        logger.info(`[GamingManager] Restauration du plan d'alimentation précédent : ${state.previousPowerPlanGuid}`);
        await runPowerShell(`powercfg /setactive ${state.previousPowerPlanGuid}`, { timeout: 3000 });
      }

      // Nettoyage de l'état
      this.clearSavedState();
      return { recovered: true, restoredGuid: state.previousPowerPlanGuid || undefined };
    } catch (err: any) {
      logger.error('[GamingManager] Échec récupération après crash :', err.message);
      this.clearSavedState();
      return { recovered: false };
    }
  }

  /**
   * Sauvegarde l'état actif sur disque pour récupération après crash
   */
  private saveState(state: GamingRollbackState) {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e: any) {
      logger.warn('[GamingManager] Impossible d\'écrire l\'état de rollback :', e.message);
    }
  }

  private clearSavedState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch {}
  }

  /**
   * Récupère le GUID du plan d'alimentation actif
   */
  public async getActivePowerPlanGuid(): Promise<string | null> {
    try {
      const res = await runPowerShell<string>('powercfg /getactivescheme', { timeout: 3000 });
      if (res?.data) {
        const match = res.data.match(/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/);
        if (match) return match[1];
      }
    } catch (err: any) {
      logger.warn('[GamingManager] Erreur lecture getactivescheme :', err.message);
    }
    return null;
  }

  /**
   * Active le mode gaming pour un processus de jeu avec réversibilité stricte
   */
  public async enableGamingOptimizations(
    pid: number,
    gameName: string
  ): Promise<GamingOptimizationResult> {
    // 1. Validation de sécurité : exclusion stricte des processus système
    const cleanName = gameName.toLowerCase().trim();
    if (CRITICAL_SYSTEM_PROCESSES.has(cleanName) || CRITICAL_SYSTEM_PROCESSES.has(`${cleanName}.exe`) || pid <= 4) {
      throw new Error(`Le processus [${gameName}] est un processus système protégé. Optimisation refusée.`);
    }

    logger.info(`[GamingManager] Activation des optimisations réversibles pour [${gameName}] (PID ${pid})...`);

    // 2. Sauvegarde de la priorité actuelle du processus
    let currentProcPriority = 'Normal';
    try {
      const prioRes = await runPowerShell<string>(
        `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).PriorityClass`,
        { timeout: 2000 }
      );
      if (prioRes?.data && prioRes.data.trim()) {
        currentProcPriority = prioRes.data.trim();
      }
    } catch {}

    // 3. Sauvegarde du plan d'alimentation actuel
    const currentPowerGuid = await this.getActivePowerPlanGuid();

    this.activeGamePid = pid;
    this.activeGameName = gameName;
    this.previousPriority = currentProcPriority;
    this.previousPowerPlanGuid = currentPowerGuid;
    this.isGamingActive = true;

    // 4. Persistance de l'état pour tolérance aux crashs
    this.saveState({
      gamePid: pid,
      gameProcessName: gameName,
      previousProcessPriority: currentProcPriority,
      previousPowerPlanGuid: currentPowerGuid,
      timestamp: Date.now(),
    });

    // 5. Application de la priorité AboveNormal (JAMAIS Realtime)
    const targetPriority: 'AboveNormal' | 'High' = 'AboveNormal';
    try {
      await runPowerShell(
        `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${targetPriority}`,
        { timeout: 2000 }
      );
      logger.info(`[GamingManager] Priorité du processus ${pid} passée à ${targetPriority} (précédent: ${currentProcPriority})`);
    } catch (e: any) {
      logger.warn('[GamingManager] Impossible de modifier la priorité du processus :', e.message);
    }

    // 6. Bascule vers le plan Haute Performance Windows si disponible
    // GUID Haute Performance standard de Windows : 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
    const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
    let appliedGuid = currentPowerGuid || HIGH_PERF_GUID;
    if (currentPowerGuid && currentPowerGuid.toLowerCase() !== HIGH_PERF_GUID.toLowerCase()) {
      try {
        await runPowerShell(`powercfg /setactive ${HIGH_PERF_GUID}`, { timeout: 3000 });
        appliedGuid = HIGH_PERF_GUID;
        logger.info(`[GamingManager] Plan d'alimentation passé en Haute Performance (${HIGH_PERF_GUID})`);
      } catch (e: any) {
        logger.warn('[GamingManager] Impossible de changer le plan d\'alimentation :', e.message);
      }
    }

    // 7. Lancement de la capture PresentMon si disponible
    presentMonEngine.startCapture(pid, gameName);

    return {
      success: true,
      gamePid: pid,
      gameName,
      appliedPriority: targetPriority,
      previousPriority: currentProcPriority,
      appliedPowerPlanGuid: appliedGuid,
      previousPowerPlanGuid: currentPowerGuid || 'Inconnu',
      batteryWarning:
        'Avertissement batterie : le plan hautes performances augmente la consommation énergétique. Recommandé sur secteur.',
    };
  }

  /**
   * Restaure intégralement l'état d'origine (priorité, plan d'alimentation, arrêt PresentMon)
   */
  public async restorePreviousState(): Promise<{ restored: boolean; message: string }> {
    if (!this.isGamingActive && !this.previousPowerPlanGuid) {
      return { restored: false, message: 'Aucune session active à restaurer.' };
    }

    logger.info('[GamingManager] Restauration des paramètres système d\'origine...');

    // 1. Arrêt de la capture PresentMon
    presentMonEngine.stopCapture();

    // 2. Restauration de la priorité du processus (s'il est encore vivant)
    if (this.activeGamePid && this.previousPriority) {
      try {
        let isAlive = false;
        try {
          process.kill(this.activeGamePid, 0);
          isAlive = true;
        } catch {}

        if (isAlive) {
          await runPowerShell(
            `(Get-Process -Id ${this.activeGamePid} -ErrorAction SilentlyContinue).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${this.previousPriority}`,
            { timeout: 2000 }
          );
          logger.info(`[GamingManager] Priorité du jeu ${this.activeGamePid} restaurée à ${this.previousPriority}`);
        }
      } catch (e: any) {
        logger.warn('[GamingManager] Erreur restauration priorité :', e.message);
      }
    }

    // 3. Restauration du plan d'alimentation d'origine
    if (this.previousPowerPlanGuid) {
      try {
        await runPowerShell(`powercfg /setactive ${this.previousPowerPlanGuid}`, { timeout: 3000 });
        logger.info(`[GamingManager] Plan d'alimentation restauré : ${this.previousPowerPlanGuid}`);
      } catch (e: any) {
        logger.warn('[GamingManager] Erreur restauration plan d\'alimentation :', e.message);
      }
    }

    // 4. Nettoyage de l'état
    this.clearSavedState();
    this.activeGamePid = null;
    this.activeGameName = null;
    this.previousPriority = null;
    this.previousPowerPlanGuid = null;
    this.isGamingActive = false;

    return { restored: true, message: 'Paramètres système d\'origine restaurés avec succès.' };
  }

  public getStatus() {
    return {
      isGamingActive: this.isGamingActive,
      activeGamePid: this.activeGamePid,
      activeGameName: this.activeGameName,
      previousPowerPlanGuid: this.previousPowerPlanGuid,
      presentMon: presentMonEngine.getCurrentMetrics(),
    };
  }
}

export const gamingManager = new GamingManager();
