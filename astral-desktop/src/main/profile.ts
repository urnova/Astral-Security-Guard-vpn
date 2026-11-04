import * as electronModule from 'electron';
const electronObj: any = electronModule;
const app = electronObj?.app || electronObj?.default?.app;
const ipcMain = electronObj?.ipcMain || electronObj?.default?.ipcMain;
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.ts';

export interface MaintenanceSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  lastRun?: string;
  categories: string[];
}

export interface UserPreferences {
  version: number;
  profileId: string;
  onboardingCompleted: boolean;
  firstName: string;
  lastName: string;
  theme: 'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled';
  openAtLogin: boolean;
  minimizeToTray: boolean;
  reduceAnimations?: boolean;
  notificationsEnabled: boolean;
  dndEnabled?: boolean;
  soundEnabled: boolean;
  soundVolume?: number;
  notificationCategories?: Record<string, boolean>;
  downloadScannerEnabled: boolean;
  gamingAutoDetect: boolean; // strictly false by default
  hudEnabled: boolean;        // strictly false by default
  previewChannel: boolean;   // beta/preview update channel
  autoUpdateEnabled: boolean; // automatic background download and quiet installation
  adminElevationEnabled: boolean; // user has acknowledged admin requirement
  aiBriefConsent?: 'granted' | 'declined' | 'unprompted'; // explicit consent for OVHcloud AI Endpoints
  shields?: Record<string, boolean>;
  network?: {
    antiBufferbloat?: boolean;
    dnsOverHttps?: boolean;
    ipv6Disabled?: boolean;
    selectedDns?: string;
    tcpBackup?: {
      autotuning?: string;
      rss?: string;
      heuristics?: string;
      backedUpAt?: string;
    } | null;
    lastAppliedTcp?: {
      autotuning?: string;
      rss?: string;
      heuristics?: string;
      appliedAt?: string;
    } | null;
    dnsBackup?: {
      adapterName?: string;
      isDhcp?: boolean;
      dnsServers?: string[];
      backedUpAt?: string;
    } | null;
    lastAppliedDns?: {
      adapterName?: string;
      isDhcp?: boolean;
      dnsServers?: string[];
      appliedAt?: string;
    } | null;
  };
  lastSpeedResult?: any;
  maintenanceSchedule?: MaintenanceSchedule;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  profileId: 'profile-local-primary',
  onboardingCompleted: false,
  firstName: '',
  lastName: '',
  theme: 'vanguard-dark',
  openAtLogin: true,
  minimizeToTray: true,
  reduceAnimations: false,
  notificationsEnabled: true,
  dndEnabled: false,
  soundEnabled: true,
  soundVolume: 70,
  notificationCategories: undefined,
  downloadScannerEnabled: true,
  gamingAutoDetect: false,
  hudEnabled: false,
  previewChannel: true,
  autoUpdateEnabled: true,
  adminElevationEnabled: true,
  aiBriefConsent: 'unprompted',
  shields: {
    realtime: true,
    behavioral: true,
    cloud: true,
    network: true,
    usb: true,
    download: true,
    antiRansomware: true,
    antiExploit: true,
  },
  network: {
    antiBufferbloat: false,
    dnsOverHttps: false,
    ipv6Disabled: false,
    selectedDns: 'auto',
    tcpBackup: null,
    lastAppliedTcp: null,
    dnsBackup: null,
    lastAppliedDns: null,
  },
  lastSpeedResult: null,
  maintenanceSchedule: {
    enabled: false,
    frequency: 'weekly',
    time: '04:00',
    dayOfWeek: 0,
    categories: ['userTemp', 'winTemp', 'winLogs'],
  },
};

const appDataPath = (app && typeof app.getPath === 'function') ? app.getPath('appData') : (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'));
const PROFILE_DIR = path.join(appDataPath, 'AstralVanguard');
const PROFILE_FILE = path.join(PROFILE_DIR, 'user-profile.json');

export function loadPreferences(): UserPreferences {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const raw = fs.readFileSync(PROFILE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);

      // Migration from legacy unversioned { firstName, lastName }
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          version: 1,
          profileId: typeof parsed.profileId === 'string' && parsed.profileId.trim() ? parsed.profileId.trim() : 'profile-local-primary',
          onboardingCompleted: typeof parsed.onboardingCompleted === 'boolean'
            ? parsed.onboardingCompleted
            : Boolean(parsed.firstName?.trim()),
          firstName: typeof parsed.firstName === 'string' ? parsed.firstName.trim().substring(0, 64) : '',
          lastName: typeof parsed.lastName === 'string' ? parsed.lastName.trim().substring(0, 64) : '',
          theme: ['vanguard-dark', 'cyber-cyan', 'midnight-purple', 'stealth-oled'].includes(parsed.theme)
            ? parsed.theme
            : 'vanguard-dark',
          openAtLogin: typeof parsed.openAtLogin === 'boolean' ? parsed.openAtLogin : true,
          minimizeToTray: typeof parsed.minimizeToTray === 'boolean' ? parsed.minimizeToTray : true,
          reduceAnimations: typeof parsed.reduceAnimations === 'boolean' ? parsed.reduceAnimations : false,
          notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : true,
          dndEnabled: typeof parsed.dndEnabled === 'boolean' ? parsed.dndEnabled : false,
          soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
          soundVolume: typeof parsed.soundVolume === 'number' ? parsed.soundVolume : 70,
          notificationCategories: typeof parsed.notificationCategories === 'object' && parsed.notificationCategories !== null ? parsed.notificationCategories : undefined,
          downloadScannerEnabled: typeof parsed.downloadScannerEnabled === 'boolean' ? parsed.downloadScannerEnabled : true,
          gamingAutoDetect: typeof parsed.gamingAutoDetect === 'boolean' ? parsed.gamingAutoDetect : false,
          hudEnabled: typeof parsed.hudEnabled === 'boolean' ? parsed.hudEnabled : false,
          previewChannel: typeof parsed.previewChannel === 'boolean' ? parsed.previewChannel : true,
          autoUpdateEnabled: typeof parsed.autoUpdateEnabled === 'boolean' ? parsed.autoUpdateEnabled : true,
          adminElevationEnabled: typeof parsed.adminElevationEnabled === 'boolean' ? parsed.adminElevationEnabled : true,
          aiBriefConsent: ['granted', 'declined', 'unprompted'].includes(parsed.aiBriefConsent) ? parsed.aiBriefConsent : 'unprompted',
          shields: typeof parsed.shields === 'object' && parsed.shields !== null
            ? { ...DEFAULT_PREFERENCES.shields, ...parsed.shields }
            : DEFAULT_PREFERENCES.shields,
          network: typeof parsed.network === 'object' && parsed.network !== null
            ? { ...DEFAULT_PREFERENCES.network, ...parsed.network }
            : DEFAULT_PREFERENCES.network,
          lastSpeedResult: parsed.lastSpeedResult !== undefined ? parsed.lastSpeedResult : null,
          maintenanceSchedule: typeof parsed.maintenanceSchedule === 'object' && parsed.maintenanceSchedule !== null
            ? { ...DEFAULT_PREFERENCES.maintenanceSchedule, ...parsed.maintenanceSchedule }
            : DEFAULT_PREFERENCES.maintenanceSchedule,
        };
      }
    }
  } catch (e) {
    logger.warn('[Profile] Failed to load user preferences, using defaults:', e);
  }
  return { ...DEFAULT_PREFERENCES };
}

export function savePreferences(prefs: Partial<UserPreferences>): UserPreferences {
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }
    const current = loadPreferences();
    const updated: UserPreferences = {
      ...current,
      ...prefs,
      version: 1,
      firstName: prefs.firstName !== undefined ? String(prefs.firstName).trim().substring(0, 64) : current.firstName,
      lastName: prefs.lastName !== undefined ? String(prefs.lastName).trim().substring(0, 64) : current.lastName,
      shields: prefs.shields ? { ...(current.shields || {}), ...prefs.shields } : current.shields,
      network: prefs.network ? { ...(current.network || {}), ...prefs.network } : current.network,
      maintenanceSchedule: prefs.maintenanceSchedule ? { ...(current.maintenanceSchedule || DEFAULT_PREFERENCES.maintenanceSchedule!), ...prefs.maintenanceSchedule } : current.maintenanceSchedule,
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    logger.info('[Profile] Preferences saved successfully.');
    return updated;
  } catch (e) {
    logger.error('[Profile] Failed to save user preferences:', e);
    throw e;
  }
}

export const userProfileManager = {
  getProfile: (): UserPreferences => loadPreferences(),
  saveProfile: (prefs: Partial<UserPreferences>): UserPreferences => savePreferences(prefs),
};

export function setupProfileIPC(): void {
  ipcMain.handle('profile:get', () => {
    return loadPreferences();
  });

  ipcMain.handle('profile:save', (_: any, prefs: Partial<UserPreferences>) => {
    try {
      const saved = savePreferences(prefs);
      return { success: true, profile: saved };
    } catch (e: any) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('profile:reset-onboarding', () => {
    try {
      const saved = savePreferences({ onboardingCompleted: false });
      return { success: true, profile: saved };
    } catch (e: any) {
      return { success: false, error: (e as Error).message };
    }
  });
}

