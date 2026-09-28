import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export interface UserProfile {
  firstName: string;
  lastName: string;
}

const PROFILE_DIR  = path.join(app.getPath('appData'), 'AstralVanguard');
const PROFILE_FILE = path.join(PROFILE_DIR, 'user-profile.json');

function loadProfile(): UserProfile {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const raw = fs.readFileSync(PROFILE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        firstName: typeof parsed.firstName === 'string' ? parsed.firstName.trim() : '',
        lastName:  typeof parsed.lastName  === 'string' ? parsed.lastName.trim()  : '',
      };
    }
  } catch (e) {
    logger.warn('[Profile] Failed to load user profile:', e);
  }
  return { firstName: '', lastName: '' };
}

function saveProfile(profile: UserProfile): void {
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }
    const safe: UserProfile = {
      firstName: String(profile.firstName ?? '').trim().substring(0, 64),
      lastName:  String(profile.lastName  ?? '').trim().substring(0, 64),
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(safe, null, 2), 'utf-8');
    logger.info('[Profile] Profile saved.');
  } catch (e) {
    logger.error('[Profile] Failed to save user profile:', e);
    throw e;
  }
}

export function setupProfileIPC(): void {
  ipcMain.handle('profile:get', () => {
    return loadProfile();
  });

  ipcMain.handle('profile:save', (_, profile: UserProfile) => {
    try {
      saveProfile(profile);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: (e as Error).message };
    }
  });
}
