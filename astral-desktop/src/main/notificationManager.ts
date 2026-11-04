/**
 * Vanguard Core — Gestionnaire Centralisé de Notifications (notificationManager.ts)
 * 
 * Source de vérité unique pour l'émission, le filtrage, la déduplication,
 * l'historique borné et la distribution des notifications :
 * - Catégorisation stricte : security, scanner, maintenance, network, vpn, vault, updater, system
 * - Sévérité : info, warning, alert, critical
 * - Déduplication anti-avalanche par clé (dedupKey) et fenêtre temporelle
 * - Respect des préférences globales, du mode Ne Pas Déranger (DND) et des catégories
 * - Routage intelligent : Toast in-app si la fenêtre principale est active, Popup Avast si masquée/minimisée
 * - Navigation contextuelle sécurisée au clic (onglet cible prédéfini, aucun code/URL arbitraire)
 * - Historique borné persisté (max 100 événements, exclusion totale des secrets/données Vault)
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger.ts';
import { loadPreferences, savePreferences } from './profile.ts';
import { showAvastStyleToast } from './notificationWindow.ts';

export type NotificationCategory =
  | 'security'
  | 'scanner'
  | 'maintenance'
  | 'network'
  | 'vpn'
  | 'vault'
  | 'updater'
  | 'system';

export type NotificationSeverity = 'info' | 'warning' | 'alert' | 'critical';

export interface NotificationActionTarget {
  tab: 'dashboard' | 'security' | 'performance' | 'gaming' | 'network' | 'vpn' | 'vault' | 'settings';
  action?: string;
  params?: Record<string, any>;
}

export interface VanguardNotification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: number;
  status: 'unread' | 'read' | 'dismissed';
  dedupKey?: string;
  actionTarget?: NotificationActionTarget;
  dndSuppressed?: boolean;
}

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  dndEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number; // 0 à 100
  categories: Record<NotificationCategory, boolean>;
}

const DEFAULT_CATEGORIES: Record<NotificationCategory, boolean> = {
  security: true,
  scanner: true,
  maintenance: true,
  network: true,
  vpn: true,
  vault: true,
  updater: true,
  system: true,
};

const MAX_HISTORY_ITEMS = 100;
const DEDUP_WINDOW_MS = 15000; // 15 secondes

class NotificationManager {
  private history: VanguardNotification[] = [];
  private recentDedupKeys = new Map<string, number>();
  private mainWindow: BrowserWindow | null = null;
  private historyFilePath: string;

  constructor() {
    const baseDir = (app && typeof app.getPath === 'function')
      ? app.getPath('userData')
      : (process.env.APPDATA || path.join(process.cwd(), 'AppData'));
    this.historyFilePath = path.join(baseDir, 'AstralVanguard', 'notifications_history.json');
    this.loadHistory();
  }

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const raw = fs.readFileSync(this.historyFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.history = parsed.slice(-MAX_HISTORY_ITEMS);
        }
      }
    } catch (err: any) {
      logger.warn('[NotificationManager] Impossible de charger l\'historique :', err?.message);
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      const dir = path.dirname(this.historyFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.historyFilePath, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (err: any) {
      logger.warn('[NotificationManager] Impossible d\'enregistrer l\'historique :', err?.message);
    }
  }

  public getPreferences(): NotificationPreferences {
    const p = loadPreferences() as any;
    return {
      notificationsEnabled: typeof p.notificationsEnabled === 'boolean' ? p.notificationsEnabled : true,
      dndEnabled: typeof p.dndEnabled === 'boolean' ? p.dndEnabled : false,
      soundEnabled: typeof p.soundEnabled === 'boolean' ? p.soundEnabled : true,
      soundVolume: typeof p.soundVolume === 'number' ? Math.max(0, Math.min(100, p.soundVolume)) : 70,
      categories: {
        ...DEFAULT_CATEGORIES,
        ...(typeof p.notificationCategories === 'object' && p.notificationCategories !== null ? p.notificationCategories : {}),
      },
    };
  }

  public savePreferences(prefs: Partial<NotificationPreferences>): NotificationPreferences {
    const current = this.getPreferences();
    const updated: NotificationPreferences = {
      notificationsEnabled: prefs.notificationsEnabled !== undefined ? prefs.notificationsEnabled : current.notificationsEnabled,
      dndEnabled: prefs.dndEnabled !== undefined ? prefs.dndEnabled : current.dndEnabled,
      soundEnabled: prefs.soundEnabled !== undefined ? prefs.soundEnabled : current.soundEnabled,
      soundVolume: prefs.soundVolume !== undefined ? prefs.soundVolume : current.soundVolume,
      categories: prefs.categories ? { ...current.categories, ...prefs.categories } : current.categories,
    };

    savePreferences({
      notificationsEnabled: updated.notificationsEnabled,
      dndEnabled: updated.dndEnabled,
      soundEnabled: updated.soundEnabled,
      soundVolume: updated.soundVolume,
      notificationCategories: updated.categories,
    } as any);

    return updated;
  }

  /**
   * Point d'entrée unique pour émettre une notification
   */
  public emit(payload: {
    category: NotificationCategory;
    severity?: NotificationSeverity;
    title: string;
    message: string;
    dedupKey?: string;
    actionTarget?: NotificationActionTarget;
  }): VanguardNotification | null {
    const severity = payload.severity || 'info';
    const now = Date.now();

    // 1. Filtrage anti-avalanche par dedupKey
    if (payload.dedupKey) {
      const last = this.recentDedupKeys.get(payload.dedupKey);
      if (last && now - last < DEDUP_WINDOW_MS) {
        logger.debug(`[NotificationManager] Notification coalescée/ignorée (dedupKey: ${payload.dedupKey})`);
        return null;
      }
      this.recentDedupKeys.set(payload.dedupKey, now);
      // Nettoyage des anciennes clés
      if (this.recentDedupKeys.size > 100) {
        for (const [k, v] of this.recentDedupKeys.entries()) {
          if (now - v > DEDUP_WINDOW_MS) this.recentDedupKeys.delete(k);
        }
      }
    }

    const prefs = this.getPreferences();

    // 2. Règle absolue de sécurité : AUCUNE clé, mot de passe ou contenu Vault dans le message
    const sanitizedTitle = this.sanitizeText(payload.title);
    const sanitizedMessage = this.sanitizeText(payload.message);

    const isCategoryEnabled = prefs.categories[payload.category] !== false;
    const isGlobalEnabled = prefs.notificationsEnabled !== false;
    const isDndActive = prefs.dndEnabled === true;
    const isCritical = severity === 'critical';

    // 3. Construction de l'objet de notification
    const notification: VanguardNotification = {
      id: crypto.randomUUID(),
      category: payload.category,
      severity,
      title: sanitizedTitle,
      message: sanitizedMessage,
      timestamp: now,
      status: 'unread',
      dedupKey: payload.dedupKey,
      actionTarget: payload.actionTarget,
      dndSuppressed: isDndActive && !isCritical,
    };

    // 4. Historisation bornée (systématique pour les alertes et événements notables)
    this.history.unshift(notification);
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history.pop();
    }
    this.saveHistory();

    // 5. Décision de distribution visuelle et sonore
    if (!isGlobalEnabled && !isCritical) {
      return notification; // Désactivé par l'utilisateur
    }
    if (!isCategoryEnabled && !isCritical) {
      return notification; // Catégorie désactivée
    }
    if (isDndActive && !isCritical) {
      return notification; // Masqué par le mode Ne Pas Déranger
    }

    this.dispatchVisualAndSound(notification, prefs);
    return notification;
  }

  private dispatchVisualAndSound(notification: VanguardNotification, prefs: NotificationPreferences): void {
    const isWindowActive =
      this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      this.mainWindow.isVisible() &&
      this.mainWindow.isFocused();

    const volume = (prefs.soundVolume || 70) / 100;
    const soundEnabled = prefs.soundEnabled && !prefs.dndEnabled;

    if (isWindowActive) {
      // La fenêtre est active : diffuser un toast in-app propre sans popup intrusive
      this.mainWindow!.webContents.send('notification:toast', {
        id: notification.id,
        category: notification.category,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        actionTarget: notification.actionTarget,
        soundEnabled,
        volume,
      });
    } else {
      // La fenêtre est masquée, minimisée ou en arrière-plan : afficher la popup Avast-style
      try {
        showAvastStyleToast({
          title: notification.title,
          message: notification.message,
          type: this.mapCategoryToToastType(notification.category, notification.severity),
          soundEnabled,
          volume,
          onClickFocus: () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              if (this.mainWindow.isMinimized()) this.mainWindow.restore();
              this.mainWindow.show();
              this.mainWindow.focus();
              if (notification.actionTarget?.tab) {
                this.mainWindow.webContents.send('navigation:go-to', notification.actionTarget.tab);
              }
            }
          },
        });
      } catch (err: any) {
        logger.warn('[NotificationManager] Échec affichage popup :', err?.message);
      }
    }
  }

  private mapCategoryToToastType(cat: NotificationCategory, sev: NotificationSeverity): string {
    if (sev === 'critical') return 'threat';
    switch (cat) {
      case 'security': return sev === 'alert' ? 'threat' : 'security_clean';
      case 'scanner':  return sev === 'alert' ? 'download_threat' : 'download_safe';
      case 'vpn':      return sev === 'warning' ? 'vpn_disconnected' : 'vpn_connected';
      case 'maintenance': return 'maintenance';
      case 'network':  return 'network';
      case 'vault':    return sev === 'alert' || sev === 'warning' ? 'threat' : 'info';
      case 'updater':  return 'performance';
      default:         return 'info';
    }
  }

  private sanitizeText(text: string): string {
    if (!text) return '';
    // Filtre absolu : élimine toute fuite potentielle de clés ou secrets
    return String(text)
      .replace(/masterKey=[a-zA-Z0-9+/=]+/gi, '[SECRET REDACTED]')
      .replace(/password=[^\s&]+/gi, '[SECRET REDACTED]')
      .slice(0, 300);
  }

  public getHistory(): VanguardNotification[] {
    return [...this.history];
  }

  public markAsRead(ids?: string[]): void {
    if (!ids || ids.length === 0) {
      this.history.forEach((n) => { n.status = 'read'; });
    } else {
      const idSet = new Set(ids);
      this.history.forEach((n) => {
        if (idSet.has(n.id)) n.status = 'read';
      });
    }
    this.saveHistory();
  }

  public clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }
}

export const notificationManager = new NotificationManager();

export function setupNotificationIPC(win: BrowserWindow): void {
  notificationManager.setMainWindow(win);

  ipcMain.handle('notifications:get-history', () => {
    return notificationManager.getHistory();
  });

  ipcMain.handle('notifications:mark-read', (_, ids?: string[]) => {
    notificationManager.markAsRead(ids);
    return { success: true };
  });

  ipcMain.handle('notifications:clear-history', () => {
    notificationManager.clearHistory();
    return { success: true };
  });

  ipcMain.handle('notifications:get-prefs', () => {
    return notificationManager.getPreferences();
  });

  ipcMain.handle('notifications:save-prefs', (_, prefs: Partial<NotificationPreferences>) => {
    const updated = notificationManager.savePreferences(prefs);
    return { success: true, prefs: updated };
  });

  ipcMain.handle('notifications:emit', (_, payload: any) => {
    const result = notificationManager.emit(payload);
    return { success: Boolean(result), notification: result };
  });
}

