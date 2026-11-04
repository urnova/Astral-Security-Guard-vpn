/**
 * Lifecycle & Graceful Shutdown Orchestrator — Vanguard Core
 * 
 * Orchestre une séquence de fermeture unique, ordonnée et protégée contre
 * les réentrances (appels répétés) :
 * 1. Marquer l'intention de quitter et désactiver le masquage dans le Tray
 * 2. Arrêter le planificateur de maintenance et les observateurs de fichiers
 * 3. Demander la déconnexion ordonnée du VPN si actif (délai borné à 3000ms)
 *    En cas de dépassement de délai, le statut de restauration est marqué non confirmé.
 * 4. Restaurer les optimisations et configurations temporaires
 * 5. Détruire le Tray et l'Overlay
 * 6. Attendre les opérations asynchrones sous délai global maximal (5000ms)
 * 7. Quitter proprement l'application via app.quit() (ou app.exit(1) en dernier recours)
 */

import { logger } from './logger.ts';

export interface LifecycleHandlers {
  stopScheduler?: () => void;
  stopScanner?: () => void;
  disconnectVpn?: () => Promise<any>;
  closeVault?: () => Promise<any>;
  restoreGaming?: () => void;
  destroyTray?: () => void;
  destroyOverlay?: () => void;
  appQuit?: () => void;
  appExit?: (code: number) => void;
}

export class LifecycleOrchestrator {
  private isQuitting = false;
  private isShutdownInProgress = false;
  private isShutdownDone = false;
  private handlers: LifecycleHandlers = {};

  public registerHandlers(handlers: Partial<LifecycleHandlers>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  public getIsQuitting(): boolean {
    return this.isQuitting;
  }

  public isShuttingDown(): boolean {
    return this.isShutdownInProgress;
  }

  public isShutdownCompleted(): boolean {
    return this.isShutdownDone;
  }

  public resetForTesting(): void {
    this.isQuitting = false;
    this.isShutdownInProgress = false;
    this.isShutdownDone = false;
    this.handlers = {};
  }

  public async gracefulShutdown(options: { forceExitTimeoutMs?: number; skipAppQuit?: boolean } = {}): Promise<{
    success: boolean;
    schedulerStopped: boolean;
    scannerStopped: boolean;
    vpnDisconnected: boolean;
    vaultClosed: boolean;
    gamingRestored: boolean;
  }> {
    if (this.isShutdownInProgress) {
      logger.info('[Lifecycle] Arrêt déjà en cours, appel répété ignoré.');
      return {
        success: true,
        schedulerStopped: true,
        scannerStopped: true,
        vpnDisconnected: true,
        vaultClosed: true,
        gamingRestored: true,
      };
    }

    this.isShutdownInProgress = true;
    this.isQuitting = true;

    logger.info('[Lifecycle] Début de la séquence d\'arrêt propre ordonnée...');

    let schedulerStopped = false;
    let scannerStopped = false;
    let vpnDisconnected = false;
    let vaultClosed = false;
    let gamingRestored = false;

    const forceTimeoutMs = options.forceExitTimeoutMs ?? 6000;
    const forceTimer = setTimeout(() => {
      logger.warn(`[Lifecycle] Délai maximal de nettoyage (${forceTimeoutMs}ms) dépassé. Arrêt forcé de secours.`);
      if (!options.skipAppQuit) {
        if (this.handlers.appExit) {
          this.handlers.appExit(1);
        } else {
          try {
            const { app } = require('electron');
            app.exit(1);
          } catch {}
        }
      }
    }, forceTimeoutMs);

    try {
      // 1. Arrêter le planificateur de maintenance
      try {
        logger.info('[Lifecycle] Arrêt du planificateur de maintenance...');
        if (this.handlers.stopScheduler) {
          this.handlers.stopScheduler();
          schedulerStopped = true;
        } else {
          schedulerStopped = true;
        }
      } catch (e: any) {
        logger.warn('[Lifecycle] Erreur arrêt scheduler:', e?.message);
      }

      // 2. Arrêter les observateurs de répertoires
      try {
        logger.info('[Lifecycle] Arrêt des observateurs de répertoires...');
        if (this.handlers.stopScanner) {
          this.handlers.stopScanner();
          scannerStopped = true;
        } else {
          scannerStopped = true;
        }
      } catch (e: any) {
        logger.warn('[Lifecycle] Erreur arrêt scanner:', e?.message);
      }

      // 3. Déconnexion ordonnée du VPN si actif (délai borné à 3000ms)
      try {
        if (this.handlers.disconnectVpn) {
          logger.info('[Lifecycle] Déconnexion ordonnée du VPN avant fermeture...');
          let timedOut = false;
          let disconnectResult: any = null;
          await Promise.race([
            this.handlers.disconnectVpn().then((res) => { disconnectResult = res; }),
            new Promise((resolve) => setTimeout(() => { timedOut = true; resolve(null); }, 3000)),
          ]);
          if (timedOut) {
            logger.warn('[Lifecycle] Délai dépassé (3000ms) pour la déconnexion VPN. Statut de restauration non confirmé.');
            vpnDisconnected = false;
          } else {
            // Si le résultat signale une restauration non confirmée, ne pas prétendre à un succès complet
            vpnDisconnected = disconnectResult?.restorationStatus === 'restauration_verifiee';
          }
        } else {
          vpnDisconnected = true;
        }
      } catch (e: any) {
        logger.warn('[Lifecycle] Erreur déconnexion VPN:', e?.message);
        vpnDisconnected = false;
      }

      // 3bis. Fermeture ordonnée du coffre Vanguard Vault (libération des verrous, clés mémoire)
      try {
        if (this.handlers.closeVault) {
          logger.info('[Lifecycle] Fermeture ordonnée de Vanguard Vault...');
          let vaultTimedOut = false;
          await Promise.race([
            this.handlers.closeVault().then(() => { vaultClosed = true; }),
            new Promise((resolve) => setTimeout(() => { vaultTimedOut = true; resolve(null); }, 2000)),
          ]);
          if (vaultTimedOut) {
            logger.warn('[Lifecycle] Délai dépassé (2000ms) pour la fermeture de Vault.');
            vaultClosed = false;
          }
        } else {
          vaultClosed = true;
        }
      } catch (e: any) {
        logger.warn('[Lifecycle] Erreur fermeture coffre:', e?.message);
        vaultClosed = false;
      }

      // 4. Restaurer les optimisations temporaires
      try {
        logger.info('[Lifecycle] Restauration des configurations temporaires...');
        if (this.handlers.restoreGaming) {
          this.handlers.restoreGaming();
          gamingRestored = true;
        } else {
          gamingRestored = true;
        }
      } catch (e: any) {
        logger.warn('[Lifecycle] Erreur restauration gamingManager:', e?.message);
      }

      // 5. Libérer le Tray et l'Overlay
      try {
        if (this.handlers.destroyTray) {
          this.handlers.destroyTray();
        }
        if (this.handlers.destroyOverlay) {
          this.handlers.destroyOverlay();
        }
      } catch {}

      this.isShutdownDone = true;
      logger.info('[Lifecycle] Nettoyage terminé avec succès.');
    } finally {
      clearTimeout(forceTimer);
      if (!options.skipAppQuit) {
        if (this.handlers.appQuit) {
          this.handlers.appQuit();
        } else {
          try {
            const { app } = require('electron');
            app.quit();
          } catch {}
        }
      }
    }

    return {
      success: schedulerStopped && scannerStopped && vpnDisconnected && vaultClosed && gamingRestored,
      schedulerStopped,
      scannerStopped,
      vpnDisconnected,
      vaultClosed,
      gamingRestored,
    };
  }
}

export const lifecycleOrchestrator = new LifecycleOrchestrator();
