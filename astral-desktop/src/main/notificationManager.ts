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
import { showDesktopNotification } from './desktopNotifier.ts';

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
  /** Présentation « succès » d'un événement d'information (icône et son de réussite). */
  tone?: 'success';
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

export interface EmitPayload {
  category: NotificationCategory;
  severity?: NotificationSeverity;
  tone?: 'success';
  title: string;
  message: string;
  dedupKey?: string;
  actionTarget?: NotificationActionTarget;
  /** false : historique seulement, l'événement est déjà présenté par un autre écran (ex. fenêtre d'analyse de téléchargement). */
  visual?: boolean;
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  security: 'Sécurité',
  scanner: 'Téléchargements',
  maintenance: 'Maintenance',
  network: 'Réseau',
  vpn: 'VPN',
  vault: 'Vault',
  updater: 'Mises à jour',
  system: 'Vanguard Core',
};

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
          this.history = parsed.slice(0, MAX_HISTORY_ITEMS); // newest first
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
      // Write-then-rename so an interrupted write can never truncate the persisted activity log.
      const tmp = `${this.historyFilePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.history, null, 2), 'utf-8');
      fs.renameSync(tmp, this.historyFilePath);
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
   * Point d'entrée unique pour émettre une notification.
   * L'historique est toujours écrit ; l'affichage (fenêtre de bureau) et le son suivent les préférences.
   */
  public emit(payload: EmitPayload): VanguardNotification | null {
    return this.emitDetailed(payload).notification;
  }

  /** Comme emit(), avec l'état de remise : permet d'expliquer pourquoi rien ne s'est affiché. */
  public emitDetailed(payload: EmitPayload): {
    notification: VanguardNotification | null;
    delivery: 'shown' | 'history_only' | 'deduplicated';
    reason?: 'notifications_disabled' | 'category_disabled' | 'do_not_disturb';
  } {
    const severity = payload.severity || 'info';
    const now = Date.now();

    // 1. Filtrage anti-avalanche par dedupKey
    if (payload.dedupKey) {
      const last = this.recentDedupKeys.get(payload.dedupKey);
      if (last && now - last < DEDUP_WINDOW_MS) {
        logger.debug(`[NotificationManager] Notification coalescée/ignorée (dedupKey: ${payload.dedupKey})`);
        return { notification: null, delivery: 'deduplicated' };
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
      tone: payload.tone,
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
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.webContents.send('notifications:updated', { id: notification.id });
    } catch { /* the persisted history stays authoritative */ }

    // 5. Décision de distribution visuelle et sonore (les critiques passent toujours)
    if (payload.visual === false) return { notification, delivery: 'history_only' };
    if (!isGlobalEnabled && !isCritical) return { notification, delivery: 'history_only', reason: 'notifications_disabled' };
    if (!isCategoryEnabled && !isCritical) return { notification, delivery: 'history_only', reason: 'category_disabled' };
    if (isDndActive && !isCritical) return { notification, delivery: 'history_only', reason: 'do_not_disturb' };

    this.display(notification, prefs);
    return { notification, delivery: 'shown' };
  }

  /** Canal unique : fenêtre de bureau Vanguard. Elle joue aussi le son (une seule fois). */
  private display(notification: VanguardNotification, prefs: NotificationPreferences): void {
    try {
      showDesktopNotification({
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        tone: notification.tone,
        label: CATEGORY_LABELS[notification.category] || 'Vanguard Core',
        soundEnabled: prefs.soundEnabled && !prefs.dndEnabled,
        volume: Math.max(0, Math.min(100, prefs.soundVolume)) / 100,
        onClick: () => {
          const win = this.mainWindow;
          if (!win || win.isDestroyed()) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          if (notification.actionTarget?.tab) win.webContents.send('navigation:go-to', notification.actionTarget.tab);
        },
      });
    } catch (err: any) {
      logger.warn('[NotificationManager] Échec affichage notification de bureau :', err?.message);
    }
  }

  private sanitizeText(text: string): string {
    if (!text) return '';
    // Filtre absolu : élimine toute fuite potentielle de clés ou secrets
    return String(text)
      .replace(/masterKey=[a-zA-Z0-9+/=]+/gi, '[SECRET REDACTED]')
      .replace(/password=[^\s&]+/gi, '[SECRET REDACTED]')
      .replace(/recovery\s*key\s*[=:]\s*\S+/gi, '[SECRET REDACTED]')
      .replace(/\b(?:[0-9A-Z]{4}-){6,}[0-9A-Z]{4}\b/g, '[SECRET REDACTED]')
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

  // Événement de test : passe par le vrai pipeline (préférences, catégories, ne pas déranger, fenêtre de bureau, son).
  ipcMain.handle('notifications:test', (_, kind: 'success' | 'warning' | 'error') => {
    const spec = {
      success: { severity: 'info' as const, tone: 'success' as const, title: 'Test réussi', message: 'Les notifications de bureau Vanguard fonctionnent.' },
      warning: { severity: 'warning' as const, tone: undefined, title: 'Test d\'avertissement', message: 'Exemple d\'avertissement affiché près de la zone de notification.' },
      error: { severity: 'alert' as const, tone: undefined, title: 'Test d\'erreur', message: 'Exemple d\'erreur : la fenêtre reste affichée plus longtemps.' },
    }[kind] || null;
    if (!spec) return { delivered: false, delivery: 'invalid', reason: undefined };
    const result = notificationManager.emitDetailed({ category: 'system', ...spec, actionTarget: { tab: 'settings' } });
    return { delivered: result.delivery === 'shown', delivery: result.delivery, reason: result.reason };
  });

  ipcMain.handle('notifications:emit', (_, payload: any) => {
    const result = notificationManager.emit(payload);
    return { success: Boolean(result), notification: result };
  });
}

