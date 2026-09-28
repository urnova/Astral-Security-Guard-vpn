import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export interface UserPreferences {
  version: number;
  onboardingCompleted: boolean;
  firstName: string;
  lastName: string;
  theme: 'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled';
  openAtLogin: boolean;
  minimizeToTray: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  downloadScannerEnabled: boolean;
  gamingAutoDetect: boolean; // strictly false by default
  hudEnabled: boolean;        // strictly false by default
}

const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  onboardingCompleted: false,
  firstName: '',
  lastName: '',
  theme: 'vanguard-dark',
  openAtLogin: true,
  minimizeToTray: true,
  notificationsEnabled: true,
  soundEnabled: true,
  downloadScannerEnabled: true,
  gamingAutoDetect: false,
  hudEnabled: false,
};

const PROFILE_DIR = path.join(app.getPath('appData'), 'AstralVanguard');
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
          notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : true,
          soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
          downloadScannerEnabled: typeof parsed.downloadScannerEnabled === 'boolean' ? parsed.downloadScannerEnabled : true,
          gamingAutoDetect: typeof parsed.gamingAutoDetect === 'boolean' ? parsed.gamingAutoDetect : false,
          hudEnabled: typeof parsed.hudEnabled === 'boolean' ? parsed.hudEnabled : false,
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
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    logger.info('[Profile] Preferences saved successfully.');
    return updated;
  } catch (e) {
    logger.error('[Profile] Failed to save user preferences:', e);
    throw e;
  }
}

export function setupProfileIPC(): void {
  ipcMain.handle('profile:get', () => {
    return loadPreferences();
  });

  ipcMain.handle('profile:save', (_, prefs: Partial<UserPreferences>) => {
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

