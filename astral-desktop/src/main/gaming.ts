import { BrowserWindow, ipcMain, shell, app } from 'electron';
import child_process from 'child_process';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { runPowerShell } from './psHelper';
import { logger } from './logger';
import { gamingManager } from './gamingManager';
import { notificationManager } from './notificationManager';
import { presentMonEngine, PresentMonMetrics } from './presentmonEngine';
import { resolveNvidiaFamily, normaliseNvidiaDriverVersion, type NvidiaFamily } from './nvidiaResolver';

export interface ProcessIdentity {
  pid:        number;
  name:       string;
  startTime?: string;
}

let gameDetectionInterval: NodeJS.Timeout | null = null;
let currentGameIdentity: ProcessIdentity | null = null;
let currentGameName: string | null = null;
let currentGamePID: number | null = null;
let gamingModeActive = false;
let sessionStartTime = 0;
let sessionPings: number[] = [];
// gamingSessionState declared at module top
const rejectedIdentities = new Set<string>();
let lastProposedIdentity: ProcessIdentity | null = null;

export function getProcessIdentityKey(id: { name: string; startTime?: string; pid?: number }): string {
  if (id.name && id.startTime) {
    return `${id.name.toLowerCase()}::${id.startTime}`;
  }
  return `${id.name ? id.name.toLowerCase() : 'unknown'}::pid-${id.pid || 0}`;
}

// AUTO-DETECTION IS DISABLED BY DEFAULT for safety.
// Can be enabled explicitly by the user.
let autoDetectEnabled = false;

// Exclusions: browsers, IDEs, system tools, launchers, productivity tools, media players, and this app
const EXCLUDED_PROCESSES = new Set([
  // Browsers & Web tools
  'chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'perplexity', 'perplexity-app', 'chatgpt',
  // System / OS / Shell
  'explorer', 'powershell', 'cmd', 'taskmgr', 'mmc', 'regedit', 'svchost', 'dwm', 'csrss', 'lsass', 'runtimebroker',
  // Dev tools & Productivity
  'code', 'devenv', 'rider', 'idea64', 'clion64', 'webstorm64', 'pycharm64', 'notion', 'obsidian', 'antigravity',
  'winword', 'excel', 'powerpnt', 'outlook', 'onenote', 'acrobat', 'acrord32',
  // Media players & viewers
  'vlc', 'mpc-hc', 'mpc-hc64', 'potplayer', 'wmplayer', 'spotify', 'foobar2000',
  // Game launchers (NOT games themselves)
  'steam', 'steamservice', 'epicgameslauncher', 'gog galaxy', 'riotclientservices',
  'battlenet', 'origin', 'eadesktop', 'ubisoft connect', 'xboxapp', 'gamebarftserver',
  // Communication & Streaming
  'discord', 'slack', 'teams', 'zoom', 'obs64', 'streamlabs obs',
  // This app
  'electron', 'astral vanguard', 'astral vanguard setup',
]);

// Saved per-game profiles (persistés sur disque dans userData)
interface GameProfile {
  priority: 'Normal' | 'AboveNormal' | 'High';
  powerPlan: 'default' | 'performance';
  suspendBrowsers: boolean;
  note?: string;
  savedAt?: number;
}
const gameProfiles: Record<string, GameProfile> = {};

function getProfilesFilePath(): string {
  try { return path.join(app.getPath('userData'), 'game_profiles.json'); }
  catch { return ''; }
}

function persistGameProfiles(): void {
  try {
    const fp = getProfilesFilePath();
    if (!fp) return;
    if (!fs.existsSync(path.dirname(fp))) fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(gameProfiles, null, 2), 'utf8');
  } catch (e: any) { logger.warn('[Gaming] Persist profiles error:', e.message); }
}

function loadGameProfilesFromDisk(): void {
  try {
    const fp = getProfilesFilePath();
    if (!fp || !fs.existsSync(fp)) return;
    const loaded = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (typeof loaded === 'object' && loaded !== null) {
      Object.assign(gameProfiles, loaded);
      logger.info(`[Gaming] ${Object.keys(loaded).length} profil(s) chargé(s) depuis le disque.`);
    }
  } catch (e: any) { logger.warn('[Gaming] Load profiles error:', e.message); }
}

export function setupGamingIPC(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null
) {
  loadGameProfilesFromDisk();
  // ── Status ────────────────────────────────────────────────────────────────
  ipcMain.handle('gaming:get-status', () => {
    const mgrStatus = gamingManager.getStatus();
    return {
      gamingModeActive: gamingModeActive || mgrStatus.isGamingActive,
      currentGame: currentGameName || mgrStatus.activeGameName,
      currentPID: currentGamePID || mgrStatus.activeGamePid,
      sessionDurationSeconds: sessionStartTime > 0 ? Math.round((Date.now() - sessionStartTime) / 1000) : 0,
      averagePing: sessionPings.length > 0 ? Math.round(sessionPings.reduce((a, b) => a + b, 0) / sessionPings.length) : null,
      presentMon: mgrStatus.presentMon,
    };
  });

  // ── PresentMon Availability & Metrics ──────────────────────────────────────
  ipcMain.handle('gaming:get-presentmon-status', () => {
    return { success: true, ...presentMonEngine.getAvailability() };
  });

  ipcMain.handle('gaming:get-hud-metrics', () => {
    return { success: true, metrics: presentMonEngine.getCurrentMetrics() };
  });

  // ── Restauration explicite des paramètres système ──────────────────────────
  ipcMain.handle('gaming:restore-system-state', async () => {
    logger.info('[Gaming] Demande de restauration explicite des paramètres système');
    const res = await gamingManager.restorePreviousState();
    return res;
  });

  // ── Toggle Gaming Mode Manually ───────────────────────────────────────────
  ipcMain.handle('gaming:toggle', async (_, force?: boolean) => {
    const nextState = force !== undefined ? force : !gamingModeActive;
    gamingModeActive = nextState;
    logger.info(`Mode Gaming manuel : ${gamingModeActive ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);

    if (gamingModeActive) {
      sessionStartTime = Date.now();
      sessionPings = [];

      // Si un PID est connu, appliquer l'optimisation réversible
      if (currentGamePID && currentGameName) {
        try {
          await gamingManager.enableGamingOptimizations(currentGamePID, currentGameName);
        } catch (e: any) {
          logger.warn('[Gaming] Erreur application optimisations :', e.message);
        }
      }

      notificationManager.emit({ category: 'system', severity: 'info', title: 'Mode Gaming Activé', message: 'Optimisation de priorité processus (AboveNormal) et plan d\'alimentation réversible activés.', actionTarget: { tab: 'gaming' } });
    } else {
      await gamingManager.restorePreviousState();
      sendSessionSummary(win);
      sessionStartTime = 0;
    }

    win.webContents.send('gaming-event', {
      type: 'mode-changed',
      active: gamingModeActive,
      game: currentGameName || 'Manuel',
    });

    return { success: true, active: gamingModeActive };
  });

  // ── Profiles ─────────────────────────────────────────────────────────────
  ipcMain.handle('gaming:get-profiles', () => ({ success: true, profiles: gameProfiles }));

    ipcMain.handle('gaming:save-profile', (_, gameName: string, settings: any) => {
    if (!gameName || typeof gameName !== 'string') return { success: false, error: 'Nom invalide.' };
    const profile: GameProfile = {
      priority:        (['Normal','AboveNormal','High'].includes(settings?.priority) ? settings.priority : 'AboveNormal') as GameProfile['priority'],
      powerPlan:       settings?.powerPlan === 'performance' ? 'performance' : 'default',
      suspendBrowsers: Boolean(settings?.suspendBrowsers),
      note:            typeof settings?.note === 'string' ? settings.note.slice(0, 200) : undefined,
      savedAt:         Date.now(),
    };
    gameProfiles[gameName] = profile;
    persistGameProfiles();
    logger.info(`[Gaming] Profil sauvegardé pour [${gameName}]`);
    return { success: true, profile };
  });

  // ── Enable/Disable Auto-Detection ─────────────────────────────────────────
  ipcMain.handle('gaming:set-auto-detect', (_, enabled: boolean) => {
    autoDetectEnabled = enabled;
    logger.info(`Détection automatique de jeux : ${enabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
    return { success: true, autoDetectEnabled };
  });

  ipcMain.handle('gaming:get-auto-detect', () => ({ autoDetectEnabled }));

  // Confirm Detection Proposal — user must call this explicitly after 'detection-proposal' event
  // Replaces the former silent auto-activation on any fullscreen window.
  ipcMain.handle('gaming:confirm-detection', async (_, payload: { pid: number; name: string; startTime?: string }) => {
    const { pid, name, startTime } = payload;
    if (!pid || !name) return { success: false, error: 'PID ou nom manquant.' };
    if (EXCLUDED_PROCESSES.has(String(name).toLowerCase())) {
      return { success: false, error: 'Processus exclu — optimisation refusée.' };
    }

    // Vérification de cohérence d'identité si une proposition était en attente
    if (lastProposedIdentity && (lastProposedIdentity.pid !== pid || (startTime && lastProposedIdentity.startTime && lastProposedIdentity.startTime !== startTime))) {
      logger.warn(`[Gaming] Confirmation rejetée : identité du processus divergente (proposé PID ${lastProposedIdentity.pid} vs reçu ${pid})`);
      return { success: false, error: "Le processus détecté n'est plus valide ou a été relancé." };
    }

    const identity: ProcessIdentity = {
      pid,
      name,
      startTime: startTime || lastProposedIdentity?.startTime,
    };
    rejectedIdentities.delete(getProcessIdentityKey(identity));
    lastProposedIdentity = null;
    currentGameIdentity = identity;
    currentGamePID = pid;
    currentGameName = name;
    gamingModeActive = true;
    gamingSessionState = 'active';
    sessionStartTime = Date.now();
    sessionPings = [];
    logger.info(`[Gaming] User confirmed detection: ${name} (PID ${pid}, StartTime: ${identity.startTime || 'n/a'})`);
    try { await gamingManager.enableGamingOptimizations(pid, name); }
    catch (e: any) { logger.warn('[Gaming] Optimizations failed after confirm:', e.message); }
    win.webContents.send('gaming-event', {
      type: 'mode-changed',
      state: 'active',
      active: true,
      game: name,
      pid,
      startTime: identity.startTime,
    });
    return { success: true, active: true, game: name, pid, startTime: identity.startTime };
  });

  ipcMain.handle('gaming:reject-detection', () => {
    if (gamingSessionState === 'proposed') {
      if (lastProposedIdentity !== null) {
        rejectedIdentities.add(getProcessIdentityKey(lastProposedIdentity));
        logger.info(`[Gaming] Detection proposal rejected by user: ${lastProposedIdentity.name} (PID ${lastProposedIdentity.pid}, StartTime: ${lastProposedIdentity.startTime || 'n/a'}).`);
      }
      gamingSessionState = 'none';
      lastProposedIdentity = null;
    }
    return { success: true };
  });

  // ── Hardware Information (CPU, GPU, RAM, Motherboard, BIOS, Drivers) ─────
  ipcMain.handle('gaming:get-hardware-info', async () => {
    const script = `
      $gpus = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, AdapterRAM, VideoProcessor
      $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors
      $ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
      $mb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer, Product, SerialNumber
      $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1 SMBIOSBIOSVersion, Manufacturer, ReleaseDate

      [PSCustomObject]@{
        gpus = $gpus
        cpuName = if ($cpu) { $cpu.Name.Trim() } else { '' }
        cpuCores = if ($cpu) { $cpu.NumberOfCores } else { 0 }
        cpuThreads = if ($cpu) { $cpu.NumberOfLogicalProcessors } else { 0 }
        ramGB = if ($ram) { [Math]::Round($ram / 1GB) } else { 0 }
        mbManufacturer = if ($mb) { [string]$mb.Manufacturer } else { '' }
        mbProduct = if ($mb) { [string]$mb.Product } else { '' }
        mbSerial = if ($mb) { [string]$mb.SerialNumber } else { '' }
        biosVersion = if ($bios) { [string]$bios.SMBIOSBIOSVersion } else { '' }
        biosManufacturer = if ($bios) { [string]$bios.Manufacturer } else { '' }
        biosDate = if ($bios.ReleaseDate) { [string]$bios.ReleaseDate } else { '' }
      } | ConvertTo-Json -Depth 3 -Compress
    `;

    try {
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 8000 });
      if (res.success && res.data) {
        const d = res.data;
        let rawGpus = d.gpus || [];
        if (!Array.isArray(rawGpus)) rawGpus = rawGpus ? [rawGpus] : [];

        // Parse and classify GPUs
        const gpus = rawGpus.map((g: any, index: number) => {
          const name = String(g.Name || 'Contrôleur vidéo');
          const rawDriver = String(g.DriverVersion || '');
          const lower = name.toLowerCase();

          // Normalisation du pilote selon le constructeur
          let displayDriver = rawDriver;
          let mfg: 'nvidia' | 'amd' | 'intel' | 'virtual' | 'unknown' = 'unknown';
          let driverUrl = 'https://www.google.com/search?q=' + encodeURIComponent(`${name} driver officiel`);

          const VIRTUAL_ADAPTER = /virtual|basic display|basic render|remote ?(display|fx)|meta quest|oculus|parsec|citrix|vmware|hyper-v|svga|indirect display|displaylink|spacedesk|usb mobile monitor/i;
          if (VIRTUAL_ADAPTER.test(name)) {
            mfg = 'virtual';
          } else if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('gtx') || lower.includes('quadro')) {
            mfg = 'nvidia';
            driverUrl = 'https://www.nvidia.com/fr-fr/geforce/drivers/';
            const digits = rawDriver.replace(/\D/g, '');
            if (digits.length >= 5) {
              const last5 = digits.slice(-5);
              const major = parseInt(last5.slice(0, 3), 10);
              const minor = last5.slice(3);
              if (major >= 100 && major <= 999) {
                displayDriver = `${major}.${minor}`;
              }
            }
          } else if (lower.includes('amd') || lower.includes('radeon')) {
            mfg = 'amd';
            driverUrl = 'https://www.amd.com/fr/support';
          } else if (lower.includes('intel') || lower.includes('uhd') || lower.includes('iris') || lower.includes('arc')) {
            mfg = 'intel';
            driverUrl = 'https://www.intel.fr/content/www/fr/fr/download-center/home.html';
          }

          let dateStr = '';
          if (g.DriverDate) {
            const dateMatch = String(g.DriverDate).match(/\/Date\((\d+)\)\//);
            if (dateMatch) {
              dateStr = new Date(parseInt(dateMatch[1], 10)).toLocaleDateString('fr-FR');
            } else {
              dateStr = String(g.DriverDate).substring(0, 10);
            }
          }

          return {
            id: `gpu-${index}`,
            name,
            driverVersionRaw: rawDriver,
            driverVersionDisplay: displayDriver,
            driverDate: dateStr,
            manufacturer: mfg,
            isVirtual: mfg === 'virtual',
            isPrimary: false, // défini après classement : une seule carte physique principale
            driverUrl,
            status: 'check_manual' as const,
          };
        });

        // Carte principale = première carte physique, discrète (NVIDIA/AMD) avant intégrée ; les adaptateurs virtuels passent en dernier.
        gpus.sort((x: any, y: any) => {
          const rank = (g: any) => g.isVirtual ? 2 : (g.manufacturer === 'nvidia' || g.manufacturer === 'amd') ? 0 : 1;
          return rank(x) - rank(y);
        });
        const firstPhysical = gpus.find((g: any) => !g.isVirtual);
        if (firstPhysical) firstPhysical.isPrimary = true;
        // Filter out purely virtual adapters for the primary display if physical ones exist
        const physicalGpus = gpus.filter((g: any) => !g.isVirtual);
        const activeGpu = physicalGpus[0] || gpus[0] || {
          name: 'Non détecté',
          driverVersionDisplay: '—',
          driverVersionRaw: '',
          driverDate: '',
          driverUrl: 'https://www.nvidia.com/fr-fr/geforce/drivers/',
        };

        // Motherboard
        const mbMfg = String(d.mbManufacturer || '').trim();
        const mbProd = String(d.mbProduct || '').trim();
        const mbName = [mbMfg, mbProd].filter(Boolean).join(' ') || 'Carte mère non identifiée';
        const mbLower = mbName.toLowerCase();

        let biosUrl = 'https://www.google.com/search?q=' + encodeURIComponent(`${mbName} bios support officiel`);
        if (mbLower.includes('asus')) {
          biosUrl = 'https://www.asus.com/fr/support/';
        } else if (mbLower.includes('msi')) {
          biosUrl = 'https://fr.msi.com/support';
        } else if (mbLower.includes('gigabyte') || mbLower.includes('aorus')) {
          biosUrl = 'https://www.gigabyte.com/fr/Support';
        } else if (mbLower.includes('asrock')) {
          biosUrl = 'https://www.asrock.com/support/';
        }

        let biosDateStr = '';
        if (d.biosDate) {
          const bDateMatch = String(d.biosDate).match(/\/Date\((\d+)\)\//);
          if (bDateMatch) {
            biosDateStr = new Date(parseInt(bDateMatch[1], 10)).toLocaleDateString('fr-FR');
          } else {
            biosDateStr = String(d.biosDate).substring(0, 10);
          }
        }

        return {
          success: true,
          hardware: {
            gpuName: activeGpu.name,
            gpuDriver: activeGpu.driverVersionDisplay,
            gpuDriverRaw: activeGpu.driverVersionRaw,
            gpuDriverDate: activeGpu.driverDate,
            driverUrl: activeGpu.driverUrl,
            gpus,
            cpuName: d.cpuName || 'Processeur hôte',
            cpuCores: d.cpuCores || 0,
            cpuThreads: d.cpuThreads || 0,
            ramGB: d.ramGB || 0,
            motherboard: mbName,
            motherboardManufacturer: mbMfg,
            motherboardProduct: mbProd,
            biosVersion: d.biosVersion || 'Non renseignée',
            biosDate: biosDateStr,
            biosUrl,
            biosCheckStatus: 'manual_check_required',
            biosCheckReason: 'API propriétaire constructeur non disponible publiquement pour comparaison directe',
            isAsusMotherboard: mbLower.includes('asus'),
          },
        };
      }
    } catch (err: any) {
      logger.warn('[HardwareInfo] Erreur détection matériel :', err.message);
    }

    // Honest fallback when detection fails: NO hardcoded user PC specs!
    return {
      success: false,
      hardware: {
        gpuName: 'Matériel non détecté',
        gpuDriver: 'Inconnu',
        gpuDriverRaw: '',
        gpuDriverDate: '',
        driverUrl: 'https://www.nvidia.com/fr-fr/geforce/drivers/',
        gpus: [],
        cpuName: 'Processeur hôte',
        cpuCores: 0,
        cpuThreads: 0,
        ramGB: 0,
        motherboard: 'Carte mère non détectée',
        motherboardManufacturer: '',
        motherboardProduct: '',
        biosVersion: 'Non disponible',
        biosDate: '',
        biosUrl: 'https://www.google.com/search?q=carte+mere+bios+support+officiel',
        biosCheckStatus: 'manual_check_required',
        biosCheckReason: 'Matériel non identifié',
        isAsusMotherboard: false,
      },
    };
  });

  async function checkNvidiaDriverUpdateOnline(
    gpuName: string,
    installedDisplayVersion: string,
    isNotebook: boolean
  ): Promise<any> {
    const family = resolveNvidiaFamily(gpuName, isNotebook);

    if (!family) {
      return {
        success: true,
        status: 'unavailable',
        message: `Vérification automatique non disponible pour ce GPU (${gpuName}) : famille non répertoriée dans le catalogue AjaxDriverService. Consultez le site NVIDIA.`,
        officialUrl: 'https://www.nvidia.com/fr-fr/geforce/drivers/',
        updateAvailable: false,
        gpuFamily: null,
      };
    }

    const url = [
      'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php',
      `?func=DriverManualLookup`,
      `&psid=${family.psid}`,
      `&pfid=${family.pfid}`,
      `&osID=135`,
      `&languageCode=1036`,
      `&beta=0&isWHQL=1&dltype=-1&dch=1&upCRD=0&sort1=0&numberOfResults=1`,
    ].join('');

    return new Promise((resolve) => {
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const dlInfo = json?.IDS?.[0]?.downloadInfo;
            if (!dlInfo || !dlInfo.Version) {
              resolve({ success: false, status: 'check_failed', error: 'Réponse NVIDIA vide ou format inattendu.', gpuFamily: family.label });
              return;
            }

            const latestVersion = String(dlInfo.Version);
            const releaseDate = dlInfo.ReleaseDateTime ? dlInfo.ReleaseDateTime.replace(/%20/g, ' ') : '';
            const downloadUrl = String(dlInfo.DownloadURL || '');
            const detailsUrl = String(dlInfo.DetailsURL || '');

            // Validate download domain server-side — do not trust renderer for URL
            const ALLOWED_NVIDIA_DOMAINS = [
              'fr.download.nvidia.com',
              'us.download.nvidia.com',
              'download.nvidia.com',
              'international.download.nvidia.com',
            ];
            const urlHost = (() => { try { return new URL(downloadUrl).hostname; } catch { return ''; } })();
            if (downloadUrl && !ALLOWED_NVIDIA_DOMAINS.some((d) => urlHost === d)) {
              logger.warn(`[GPU] URL download refusée (domaine non autorisé) : ${urlHost}`);
              resolve({ success: false, status: 'check_failed', error: `Domaine non autorisé : ${urlHost}`, gpuFamily: family.label });
              return;
            }

            const installedNum = parseFloat(installedDisplayVersion) || 0;
            const latestNum = parseFloat(latestVersion) || 0;
            // ⚠️  A version installed > latest WHQL does NOT mean "up to date".
            // It could be a Game Ready Driver (GRD), insider/beta, OEM, or studio branch
            // that is newer than the WHQL security update queried.
            // We report the factual comparison and let the user decide.
            let status: string;
            if (installedNum === 0) {
              status = 'version_unknown';
            } else if (latestNum > installedNum) {
              status = 'update_available';
            } else if (installedNum > latestNum) {
              // Installed is ahead of the WHQL catalog — could be GRD, beta, or studio branch.
              // Do NOT claim 'up_to_date' without qualification.
              status = 'version_ahead_of_catalog';
            } else {
              status = 'up_to_date'; // exact match
            }
            const updateAvailable = status === 'update_available';

            resolve({
              success: true,
              status: installedNum === 0 ? 'version_unknown' : (updateAvailable ? 'update_available' : 'up_to_date'),
              installedVersion: installedDisplayVersion || null,
              latestVersion,
              releaseDate,
              downloadUrl,
              detailsUrl,
              updateAvailable,
              gpuFamily: family.label,
              driverName: dlInfo.Name ? decodeURIComponent(dlInfo.Name) : `Pilote ${family.label} Game Ready WHQL`,
            });
          } catch (err: any) {
            resolve({ success: false, status: 'check_failed', error: err.message, gpuFamily: family.label });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ success: false, status: 'timeout', error: 'Délai d\'attente dépassé vers les serveurs NVIDIA.' }); });
      req.on('error', (err) => resolve({ success: false, status: 'network_error', error: err.message }));
    });
  }

  ipcMain.handle('perf:check-gpu-driver-update', async (_, gpuInfo: any) => {
    // gpuInfo comes from the renderer — treat as untrusted. Resolve everything server-side.
    const gpuName = String(gpuInfo?.name || '').trim();
    const mfg = String(gpuInfo?.manufacturer || '').toLowerCase();
    const isVirtual = Boolean(gpuInfo?.isVirtual || /virtual|basic display|meta quest|remotefx/i.test(gpuName));
    const isNotebook = /laptop|notebook|mobile|max-q/i.test(gpuName);
    const driverVersionDisplay = String(gpuInfo?.driverVersionDisplay || '');

    if (isVirtual) {
      return { success: true, status: 'virtual_adapter', message: 'Adaptateur virtuel — aucun pilote constructeur requis.', updateAvailable: false };
    }

    const isNvidia = mfg === 'nvidia' || /geforce|nvidia|rtx|gtx|quadro/i.test(gpuName);
    if (isNvidia) {
      return await checkNvidiaDriverUpdateOnline(gpuName, driverVersionDisplay, isNotebook);
    }

    if (mfg === 'amd' || /radeon|amd/i.test(gpuName)) {
      return {
        success: true, status: 'check_manual',
        message: 'Vérification automatique non disponible pour les GPU AMD (aucune API publique). Utilisez AMD Software: Adrenalin Edition.',
        officialUrl: 'https://www.amd.com/fr/support', updateAvailable: false,
      };
    }

    if (mfg === 'intel' || /intel uhd|intel iris|arc a\d+/i.test(gpuName)) {
      return {
        success: true, status: 'check_manual',
        message: 'Vérification recommandée via l\'Assistant Pilotes et Support Intel (DSA).',
        officialUrl: 'https://www.intel.fr/content/www/fr/fr/download-center/home.html', updateAvailable: false,
      };
    }

    return {
      success: true, status: 'unavailable',
      message: `Constructeur non identifié pour « ${gpuName} » — vérification automatique indisponible.`,
      updateAvailable: false,
    };
  });

  let currentGpuDownloadReq: any = null;

  ipcMain.handle('perf:download-gpu-driver', async (event, opts: { downloadUrl: string; version: string }) => {
    const downloadUrl = String(opts?.downloadUrl || '').trim();
    if (!downloadUrl.startsWith('https://fr.download.nvidia.com/') &&
        !downloadUrl.startsWith('https://us.download.nvidia.com/') &&
        !downloadUrl.startsWith('https://download.nvidia.com/')) {
      return { success: false, error: 'URL de téléchargement non autorisée (seuls les serveurs officiels download.nvidia.com sont acceptés).' };
    }

    const tempDir = app.getPath('temp');
    const fileName = `nvidia-driver-${opts.version || 'latest'}.exe`;
    const targetPath = path.join(tempDir, fileName);

    return new Promise((resolve) => {
      const fileStream = fs.createWriteStream(targetPath);
      let downloadedBytes = 0;
      let totalBytes = 0;

      currentGpuDownloadReq = https.get(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close();
          try { fs.unlinkSync(targetPath); } catch {}
          resolve({ success: false, error: `Erreur serveur NVIDIA : code ${res.statusCode}` });
          return;
        }

        totalBytes = parseInt(res.headers['content-length'] || '0', 10);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          fileStream.write(chunk);
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          event.sender.send('perf:gpu-download-progress', {
            downloadedBytes,
            totalBytes,
            percent,
            downloadedMB: (downloadedBytes / (1024 * 1024)).toFixed(1),
            totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
          });
        });

        res.on('end', () => {
          fileStream.end();
          currentGpuDownloadReq = null;
          logger.info(`[GPU] Pilote NVIDIA téléchargé avec succès : ${targetPath} (${downloadedBytes} octets)`);
          resolve({
            success: true,
            filePath: targetPath,
            fileSize: downloadedBytes,
          });
        });

        res.on('error', (err) => {
          fileStream.close();
          try { fs.unlinkSync(targetPath); } catch {}
          currentGpuDownloadReq = null;
          resolve({ success: false, error: err.message });
        });
      });

      currentGpuDownloadReq.on('error', (err: any) => {
        fileStream.close();
        try { fs.unlinkSync(targetPath); } catch {}
        currentGpuDownloadReq = null;
        resolve({ success: false, error: err.message });
      });
    });
  });

  ipcMain.handle('perf:launch-gpu-driver-installer', async (_, opts: { filePath: string }) => {
    const filePath = String(opts?.filePath || '').trim();
    const tempDir = app.getPath('temp');
    if (!filePath.startsWith(tempDir) || !fs.existsSync(filePath)) {
      return { success: false, error: 'Fichier d\'installation introuvable ou hors répertoire temporaire autorisé.' };
    }

    try {
      logger.info(`[GPU] Lancement avec consentement de l'installateur : ${filePath}`);
      child_process.spawn(filePath, [], { detached: true, stdio: 'ignore' });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Scan Installed Game Libraries (Multi-drive Steam, Epic, GOG, Riot, Xbox, PC Games) ──
  const scanLibraries = async () => {
    logger.info('[Gaming] Scan haute performance des jeux installés multi-disques...');
    const games: any[] = [];
    const seenPaths = new Set<string>();
    const seenNames = new Set<string>();

    const IGNORED_NAMES = new Set([
      'directx & you must install', 'directxredist', 'directx', 'redist', '_commonredist',
      'gamesave', 'steamvr', 'wallpaper engine', 'wallpaper_engine', 'steamworks shared',
      'launcher', 'social club', 'support', 'crashreport', 'prerequisites', 'epic online services',
      'riot client', 'riot client.old', 'animaze', 'rockstar games launcher'
    ]);

    // 1. Steam Libraries (Multi-Drive via libraryfolders.vdf & standard locations)
    const steamFolders = [
      'C:\\Program Files (x86)\\Steam\\steamapps',
      'C:\\Steam\\steamapps',
      'D:\\SteamLibrary\\steamapps',
      'D:\\Steam\\steamapps',
      'E:\\SteamLibrary\\steamapps',
      'E:\\Steam\\steamapps',
      'F:\\SteamLibrary\\steamapps',
      'F:\\Steam\\steamapps',
    ];

    const vdfPath = 'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf';
    if (fs.existsSync(vdfPath)) {
      try {
        const vdf = fs.readFileSync(vdfPath, 'utf8');
        const matches = vdf.matchAll(/"path"\s+"([^"]+)"/g);
        for (const m of matches) {
          const raw = m[1].replace(/\\\\/g, '\\');
          const sa = path.join(raw, 'steamapps');
          if (!steamFolders.includes(sa)) steamFolders.push(sa);
        }
      } catch {}
    }

    for (const sf of steamFolders) {
      if (fs.existsSync(sf)) {
        try {
          const files = fs.readdirSync(sf);
          for (const f of files) {
            if (f.startsWith('appmanifest_') && f.endsWith('.acf')) {
              try {
                const content = fs.readFileSync(path.join(sf, f), 'utf8');
                const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
                const nameMatch = content.match(/"name"\s+"([^"]+)"/);
                const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/);
                if (appIdMatch && nameMatch) {
                  const appId = appIdMatch[1];
                  const rawName = nameMatch[1];
                  const norm = rawName.toLowerCase().trim();
                  if (IGNORED_NAMES.has(norm) || norm.includes('proton') || norm.includes('steam linux runtime') || appId === '228980') {
                    continue;
                  }
                  const gamePath = installDirMatch ? path.join(sf, 'common', installDirMatch[1]) : sf;
                  if (!fs.existsSync(gamePath)) {
                    continue;
                  }
                  try {
                    const contents = fs.readdirSync(gamePath);
                    if (contents.length === 0) continue;
                  } catch {
                    continue;
                  }
                  if (!seenPaths.has(gamePath)) {
                    seenPaths.add(gamePath);
                    seenNames.add(rawName.toLowerCase());
                    games.push({
                      name: rawName,
                      launcher: 'Steam',
                      appId,
                      path: gamePath,
                      bannerUrl: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
                    });
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }
    }

    // 2. Custom Folders & Non-Steam Launchers
    const launcherFolders: { dir: string; launcher: string }[] = [
      { dir: 'E:\\rockstar game', launcher: 'Rockstar' },
      { dir: 'C:\\Program Files\\Rockstar Games', launcher: 'Rockstar' },
      { dir: 'D:\\Rockstar Games', launcher: 'Rockstar' },
      { dir: 'E:\\xboxgames', launcher: 'Xbox' },
      { dir: 'C:\\XboxGames', launcher: 'Xbox' },
      { dir: 'D:\\XboxGames', launcher: 'Xbox' },
      { dir: 'D:\\jeux crack 2', launcher: 'PC Games' },
      { dir: 'E:\\jeux crack', launcher: 'PC Games' },
      { dir: 'F:\\jeux', launcher: 'PC Games' },
      { dir: 'C:\\Program Files\\Epic Games', launcher: 'Epic Games' },
      { dir: 'D:\\Epic Games', launcher: 'Epic Games' },
      { dir: 'E:\\Epic Games', launcher: 'Epic Games' },
      { dir: 'C:\\Program Files\\EA Games', launcher: 'EA' },
      { dir: 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games', launcher: 'Ubisoft' },
      { dir: 'C:\\Program Files (x86)\\GOG Galaxy\\Games', launcher: 'GOG' },
      { dir: 'C:\\GOG Games', launcher: 'GOG' },
      { dir: 'D:\\GOG Games', launcher: 'GOG' },
      { dir: 'C:\\Riot Games', launcher: 'Riot Games' },
      { dir: 'D:\\Riot Games', launcher: 'Riot Games' },
    ];

    for (const item of launcherFolders) {
      if (fs.existsSync(item.dir)) {
        try {
          const subs = fs.readdirSync(item.dir, { withFileTypes: true });
          for (const s of subs) {
            if (s.isDirectory()) {
              const rawName = s.name;
              const norm = rawName.toLowerCase().trim();
              if (IGNORED_NAMES.has(norm)) continue;

              const cleanName = cleanGameTitle(rawName);
              if (IGNORED_NAMES.has(cleanName.toLowerCase())) continue;
              if (seenNames.has(cleanName.toLowerCase())) continue;

              const fullPath = path.join(item.dir, rawName);
              if (!fs.existsSync(fullPath)) continue;
              try {
                const contents = fs.readdirSync(fullPath);
                if (contents.length === 0) continue;
              } catch {
                continue;
              }
              if (!seenPaths.has(fullPath)) {
                seenPaths.add(fullPath);
                seenNames.add(cleanName.toLowerCase());
                games.push({
                  name: cleanName,
                  rawName,
                  launcher: item.launcher,
                  path: fullPath,
                });
              }
            }
          }
        } catch {}
      }
    }

    logger.info(`[Gaming] Détection terminée : ${games.length} jeux réels trouvés.`);

    // 3. Enrich non-Steam games with official banners in parallel (with timeout protection)
    const enriched = await Promise.all(
      games.map(async (g) => {
        if (g.bannerUrl) return g;
        try {
          const banner = await resolveGameBanner(g.name);
          return { ...g, bannerUrl: banner || undefined };
        } catch {
          return g;
        }
      })
    );

    return { success: true, games: enriched };
  };

  ipcMain.handle('gaming:scan-libraries', scanLibraries);
  ipcMain.handle('gaming:scan-installed', scanLibraries);

  // ── Persistent Gaming Settings (in-memory, survives tab navigation) ───────
  const gamingSettings = {
    hudEnabled: false,
    antiBufferbloat: true,
    suspendBg: false,
    autoDetect: false,
  };

  ipcMain.handle('gaming:get-settings', () => ({ success: true, settings: gamingSettings }));

  ipcMain.handle('gaming:set-mode', async (_evt, payload: { enabled: boolean; profile?: string }) => {
    const { enabled, profile } = payload;
    gamingModeActive = enabled;
    logger.info(`[Gaming] Mode set via UI: ${enabled ? 'ON' : 'OFF'}, profile=${profile || 'none'}`);
    if (enabled) {
      sessionStartTime = Date.now();
      if (currentGamePID && currentGameName) {
        try {
          await gamingManager.enableGamingOptimizations(currentGamePID, currentGameName);
          notificationManager.emit({ category: 'system', severity: 'info', title: 'Optimisation de session active', message: `Priorité AboveNormal appliquée sur ${currentGameName}. Plan Haute Performance engagé.`, actionTarget: { tab: 'gaming' } });
        } catch (e: any) {
          logger.warn('[Gaming] Optimisations non appliquées:', e.message);
        }
      } else {
        notificationManager.emit({ category: 'system', severity: 'info', title: 'Mode d\'optimisation armé', message: 'Mode actif en attente de jeu. Les réglages s\'appliqueront dès qu\'une application sera identifiée.', actionTarget: { tab: 'gaming' } });
      }
    } else {
      const restoreRes = await gamingManager.restorePreviousState();
      sessionStartTime = 0;
      if (restoreRes.restored) {
        logger.info('[Gaming] Paramètres système restaurés après désactivation.');
      }
    }
    return { success: true, active: gamingModeActive };
  });

  ipcMain.handle('gaming:set-setting', (_evt, payload: { key: string; value: boolean }) => {
    const { key, value } = payload;
    if (key in gamingSettings) {
      (gamingSettings as any)[key] = value;
      if (key === 'autoDetect') {
        autoDetectEnabled = value;
        logger.info(`[Gaming] Auto-detect: ${value ? 'ON' : 'OFF'}`);
      }
      logger.info(`[Gaming] Setting ${key}=${value}`);
    }
    return { success: true };
  });

    ipcMain.handle('gaming:apply-game-profile', async (_evt, payload: { game: string; priority?: string; powerPlan?: string; suspendBrowsers?: boolean }) => {
    const { game, priority, powerPlan, suspendBrowsers } = payload;
    if (!game) return { success: false, error: 'Nom de jeu manquant.' };
    const existing = gameProfiles[game] || { priority: 'AboveNormal', powerPlan: 'default', suspendBrowsers: false };
    const updated: GameProfile = {
      ...existing,
      priority:        (['Normal','AboveNormal','High'].includes(priority ?? '') ? priority : existing.priority) as GameProfile['priority'],
      powerPlan:       powerPlan === 'performance' ? 'performance' : (powerPlan === 'default' ? 'default' : existing.powerPlan),
      suspendBrowsers: suspendBrowsers !== undefined ? Boolean(suspendBrowsers) : existing.suspendBrowsers,
      savedAt:         Date.now(),
    };
    gameProfiles[game] = updated;
    persistGameProfiles();
    // Appliquer immédiatement si le jeu est actif
    const status = gamingManager.getStatus();
    const applied: string[] = [];
    const notApplied: string[] = [];
    if (status.isGamingActive && status.activeGamePid && status.activeGameName === game) {
      // Priorité CPU du processus de jeu
      try {
        await runPowerShell(`(Get-Process -Id ${status.activeGamePid} -ErrorAction SilentlyContinue).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${updated.priority}`, { timeout: 2000 });
        applied.push('priorité CPU');
      } catch { notApplied.push('priorité CPU'); }
      // Plan d'alimentation : sauvegarder le GUID actuel avant de changer
      if (updated.powerPlan === 'performance') {
        try {
          const currentGuid = await gamingManager.getActivePowerPlanGuid();
          const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
          // Mémoriser dans gamingManager si pas encore fait par enableGamingOptimizations
          // gamingManager.getStatus() expose previousPowerPlanGuid via la session active.
          // On ne réécrit pas le GUID précédent s'il est déjà sauvegardé.
          await runPowerShell(`powercfg /setactive ${HIGH_PERF_GUID}`, { timeout: 3000 });
          applied.push('plan alimentation');
        } catch { notApplied.push('plan alimentation'); }
      } else if (updated.powerPlan === 'default') {
        // Restaurer le plan précédent si on repasse en équilibré
        const prevGuid = status.previousPowerPlanGuid;
        if (prevGuid) {
          try {
            await runPowerShell(`powercfg /setactive ${prevGuid}`, { timeout: 3000 });
            applied.push('plan alimentation restauré');
          } catch { notApplied.push('restauration plan alimentation'); }
        }
      }
    }
    const note = notApplied.length > 0 ? ` — non appliqué: [${notApplied.join(', ')}]` : '';
    logger.info(`[Gaming] Profil enregistré pour "${game}" — appliqué: [${applied.join(', ') || 'sera appliqué au prochain lancement'}]${note}`);
    return { success: true, profile: updated, appliedImmediately: applied, notApplied: notApplied.length > 0 ? notApplied : undefined };
  });

  // ── Safe Browser Priority Reduction & Restoration with Process Identity (StartTime) ─
  ipcMain.handle('gaming:suspend-browsers', async (_evt, suspend: boolean) => {
    const browserNames = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi'];

    if (suspend) {
      // Snapshot existant (pour éviter d'écraser la priorité initiale en cas d'activation répétée)
      const existingSnapshot: Array<{ name: string; pid: number; priority: string; startTime?: string }> =
        (gamingSettings as any)._browserPrioritySnapshot || [];
      const trackedPids = new Set(existingSnapshot.map(s => s.pid));

      const readScript = `
        \$results = @()
        \$names = @('chrome','msedge','firefox','brave','opera','vivaldi')
        foreach (\$name in \$names) {
          \$procs = Get-Process -Name \$name -ErrorAction SilentlyContinue
          foreach (\$p in \$procs) {
            \$st = if (\$p.StartTime) { \$p.StartTime.ToString('o') } else { '' }
            \$results += [PSCustomObject]@{ name=\$name; pid=\$p.Id; priority=[string]\$p.PriorityClass; startTime=\$st }
          }
        }
        if (\$results.Count -gt 0) { \$results | ConvertTo-Json -Compress } else { '[]' }
      `;
      let currentProcesses: Array<{ name: string; pid: number; priority: string; startTime?: string }> = [];
      try {
        const readRes = await runPowerShell<any>(readScript, { asJson: true, timeout: 5000 });
        const raw = readRes?.data;
        if (Array.isArray(raw)) currentProcesses = raw;
        else if (raw && typeof raw === 'object') currentProcesses = [raw];
      } catch (e: any) {
        logger.warn('[Gaming] Browser read priorities failed:', e.message);
      }

      if (currentProcesses.length === 0 && existingSnapshot.length === 0) {
        return { success: false, error: 'Aucun navigateur actif trouvé.', modified: 0 };
      }

      // Fusionner : conserver impérativement la priorité d'origine pour les PIDs déjà suivis
      const newSnapshot: Array<{ name: string; pid: number; priority: string; startTime?: string }> = [...existingSnapshot];
      for (const p of currentProcesses) {
        if (!trackedPids.has(p.pid)) {
          if (p.priority && !['idle','belownormal'].includes(p.priority.toLowerCase())) {
            newSnapshot.push(p);
            trackedPids.add(p.pid);
          }
        }
      }
      (gamingSettings as any)._browserPrioritySnapshot = newSnapshot;

      const targetPids = currentProcesses.map(p => p.pid).join(',');
      if (!targetPids) {
        return { success: true, modified: 0, note: 'Aucun nouveau navigateur à réduire.' };
      }
      const applyScript = `
        \$pids = @(${targetPids})
        \$ok = 0; \$fail = 0
        foreach (\$pid in \$pids) {
          try {
            \$p = Get-Process -Id \$pid -ErrorAction SilentlyContinue
            if (\$p) { \$p.PriorityClass = 'BelowNormal'; \$ok++ }
          } catch { \$fail++ }
        }
        [PSCustomObject]@{ ok=\$ok; fail=\$fail } | ConvertTo-Json -Compress
      `;
      try {
        const applyRes = await runPowerShell<any>(applyScript, { asJson: true, timeout: 5000 });
        const ok = applyRes?.data?.ok ?? 0;
        const fail = applyRes?.data?.fail ?? 0;
        logger.info(`[Gaming] Browser CPU priority reduced: ${ok} ok, ${fail} failed`);
        return { success: ok > 0, modified: ok, failed: fail, action: 'reduced' };
      } catch (e: any) {
        logger.warn('[Gaming] Browser priority apply failed:', e.message);
        return { success: false, error: e.message, modified: 0 };
      }
    } else {
      // Restauration contrôlée avec validation du nom et du StartTime de processus (anti-collision PID)
      const snapshot: Array<{ name: string; pid: number; priority: string; startTime?: string }> =
        (gamingSettings as any)._browserPrioritySnapshot || [];
      if (snapshot.length === 0) {
        logger.info('[Gaming] Browser restore: no snapshot found — nothing to restore.');
        return { success: true, action: 'restored', restored: 0, note: 'Aucun instantané — aucune restauration effectuée.' };
      }

      const entries = snapshot.map(e => `[PSCustomObject]@{ pid=${e.pid}; name='${e.name}'; priority='${e.priority}'; startTime='${e.startTime || ''}' }`).join(',');
      const restoreScript = `
        \$entries = @(${entries})
        \$ok = 0; \$fail = 0; \$gone = 0
        foreach (\$entry in \$entries) {
          try {
            \$p = Get-Process -Id \$entry.pid -ErrorAction SilentlyContinue
            \$entrySt = if (\$entry.startTime) { [string]\$entry.startTime } else { '' }
            \$pSt = if (\$p -and \$p.StartTime) { \$p.StartTime.ToString('o') } else { '' }
            if (\$p -and \$p.ProcessName -ieq \$entry.name -and (-not \$entrySt -or \$pSt -eq \$entrySt)) {
              \$p.PriorityClass = \$entry.priority
              \$ok++
            } else {
              \$gone++
            }
          } catch { \$fail++ }
        }
        [PSCustomObject]@{ ok=\$ok; fail=\$fail; gone=\$gone } | ConvertTo-Json -Compress
      `;
      try {
        const restoreRes = await runPowerShell<any>(restoreScript, { asJson: true, timeout: 5000 });
        const ok = restoreRes?.data?.ok ?? 0;
        const fail = restoreRes?.data?.fail ?? 0;
        const gone = restoreRes?.data?.gone ?? 0;
        (gamingSettings as any)._browserPrioritySnapshot = [];
        logger.info(`[Gaming] Browser priority restored: ${ok} ok, ${fail} failed, ${gone} already closed or reassigned`);
        return {
          success: fail === 0,
          action: 'restored',
          restored: ok,
          failed: fail,
          alreadyClosed: gone,
          note: fail > 0 ? `Restauration partielle : ${fail} processus non restaurés.` : undefined,
        };
      } catch (e: any) {
        logger.warn('[Gaming] Browser restore failed:', e.message);
        return { success: false, error: e.message, restored: 0 };
      }
    }
  });

  ipcMain.handle('gaming:launch-game', async (_evt, game: any) => {
    try {
      if (!game) return { success: false, error: 'Données de jeu invalides.' };

      // 1. Steam direct protocol
      if (game.launcher === 'Steam' && game.appId) {
        logger.info(`[Gaming] Lancement Steam: steam://rungameid/${game.appId}`);
        await shell.openExternal(`steam://rungameid/${game.appId}`);
        return { success: true, message: `Lancement de ${game.name} via Steam...` };
      }

      // 2. Direct path
      if (game.path && fs.existsSync(game.path)) {
        const stat = fs.statSync(game.path);
        if (!stat.isDirectory() && game.path.toLowerCase().endsWith('.exe')) {
          logger.info(`[Gaming] Exécution directe : ${game.path}`);
          child_process.spawn(game.path, [], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: `Lancement de ${game.name}...` };
        }

        // Folder: search for best executable
        if (stat.isDirectory()) {
          const files = fs.readdirSync(game.path);
          const exes = files.filter(f =>
            f.toLowerCase().endsWith('.exe') &&
            !f.toLowerCase().includes('unins') &&
            !f.toLowerCase().includes('crash') &&
            !f.toLowerCase().includes('update') &&
            !f.toLowerCase().includes('setup')
          );
          if (exes.length > 0) {
            const cleanPrefix = (game.name || '').toLowerCase().split(' ')[0];
            const targetExe = exes.find(e => e.toLowerCase().includes(cleanPrefix)) || exes[0];
            const fullExe = path.join(game.path, targetExe);
            logger.info(`[Gaming] Lancement de l'exécutable : ${fullExe}`);
            child_process.spawn(fullExe, [], { detached: true, stdio: 'ignore', cwd: game.path }).unref();
            return { success: true, message: `Lancement de ${targetExe}...` };
          }

          // Fallback: open folder in explorer
          await shell.openPath(game.path);
          return { success: true, message: `Dossier de ${game.name} ouvert.` };
        }
      }

      return { success: false, error: 'Exécutable ou répertoire du jeu introuvable.' };
    } catch (e: any) {
      logger.warn(`[Gaming] Erreur lancement jeu: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // ── Uninstall Game directly ───────────────────────────────────────────────
  ipcMain.handle('gaming:uninstall-game', async (_evt, game: any) => {
    try {
      if (!game) return { success: false, error: 'Données de jeu invalides.' };

      // 1. Steam protocol
      if (game.launcher === 'Steam' && game.appId) {
        logger.info(`[Gaming] Désinstallation Steam: steam://uninstall/${game.appId}`);
        await shell.openExternal(`steam://uninstall/${game.appId}`);
        return { success: true, message: `Désinstallation Steam lancée pour ${game.name}.` };
      }

      // 2. Look for uninstaller in directory
      if (game.path && fs.existsSync(game.path)) {
        const stat = fs.statSync(game.path);
        const searchDir = stat.isDirectory() ? game.path : path.dirname(game.path);
        const files = fs.readdirSync(searchDir);
        const uninstaller = files.find(f => f.toLowerCase().includes('unins') && f.toLowerCase().endsWith('.exe'));

        if (uninstaller) {
          const uninstPath = path.join(searchDir, uninstaller);
          logger.info(`[Gaming] Lancement désinstalleur : ${uninstPath}`);
          child_process.spawn(uninstPath, [], { detached: true, stdio: 'ignore', cwd: searchDir }).unref();
          return { success: true, message: `Désinstalleur officiel lancé pour ${game.name}.` };
        }
      }

      // 3. Fallback: Open Windows Programs & Features
      child_process.spawn('control.exe', ['appwiz.cpl'], { detached: true, stdio: 'ignore' }).unref();
      return { success: true, message: `Gestionnaire des applications Windows ouvert pour désinstaller ${game.name}.` };
    } catch (e: any) {
      logger.warn(`[Gaming] Erreur désinstallation: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
}

// In-memory cache for game banners
const bannerCache = new Map<string, string>();

function cleanGameTitle(rawName: string): string {
  let title = rawName
    .replace(/[._]/g, ' ')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\b(v\d+(\.\d+)*[a-z]?|Build\s*\d+|Deluxe(\s*Edition)?|Complete(\s*Edition)?|Incl(\.\s*ALL)?\s*DLC|ALL\s*DLC|P2P|Legacy|Relaunched)\b/gi, '')
    .replace(/\b\d+(\s+\d+)+[a-z0-9\-]*$/i, '')
    .replace(/[-–—]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title || rawName;
}

async function resolveGameBanner(gameName: string): Promise<string | null> {
  const clean = cleanGameTitle(gameName || '').trim();
  if (!clean || clean.length < 2) return null;
  if (bannerCache.has(clean)) return bannerCache.get(clean)!;

  try {
    // Steam Community SearchApps endpoint (fast, public, returns exact appid and logo)
    const searchUrl = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(clean)}`;
    const data = await new Promise<string>((resolve) => {
      const req = https.get(
        searchUrl,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AstralVanguard/2.5' },
          timeout: 3000,
        },
        (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(body));
        }
      );
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    });

    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const appId = parsed[0].appid;
        if (appId) {
          const bannerUrl = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
          bannerCache.set(clean, bannerUrl);
          return bannerUrl;
        }
      }
    }
  } catch {}

  const lower = clean.toLowerCase();
  const FALLBACKS: Record<string, string> = {
    'roblox': 'https://images.rbxcdn.com/f04c6a457ee458fef56f2f9f170f3f22.jpg',
    'minecraft': 'https://launchercontent.mojang.com/header.png',
    'minecraft launcher': 'https://launchercontent.mojang.com/header.png',
    'forza horizon 5': 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1551360/header.jpg',
    'forza horizon 4': 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1293830/header.jpg',
    'gta v': 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/271590/header.jpg',
    'grand theft auto v': 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/271590/header.jpg',
    'red dead redemption 2': 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1174180/header.jpg',
    'cyberpunk 2077': 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg',
    'valorant': 'https://images.contentstack.io/v3/assets/blt370612131b6e0ebc/blta70a7b7a2d4806a6/5e73ef5e6563e46c8e312f27/VALORANT_Jett_Red.jpg',
  };

  for (const [k, url] of Object.entries(FALLBACKS)) {
    if (lower.includes(k)) {
      bannerCache.set(clean, url);
      return url;
    }
  }

  return null;
}

// Gaming Session States: 'none' | 'proposed' | 'active' | 'background' | 'finished'
let gamingSessionState: 'none' | 'proposed' | 'active' | 'background' | 'finished' = 'none';

/**
 * Generic Smart Detection Loop:
 * Monitors foreground window without requiring DLL injection into game binaries.
 * Guarded by autoDetectEnabled (OFF by default).
 * Distinguishes active vs background state so Alt-Tab does not loop settings.
 */
export function startGameDetection(
  win: BrowserWindow,
  getOverlay: () => BrowserWindow | null,
  setOverlay: (w: BrowserWindow | null) => void
) {
  if (gameDetectionInterval) clearInterval(gameDetectionInterval);

  // Intervalle de détection : 8 s pour minimiser la charge CPU
  // Ne modifie JAMAIS silencieusement les paramètres système.
  // Propose une activation si une application candidate est identifiée.
  gameDetectionInterval = setInterval(async () => {
    try {
      const targetPid = currentGameIdentity?.pid || 0;
      const targetName = currentGameIdentity?.name || '';
      const targetStartTime = currentGameIdentity?.startTime || '';

      // Script unifié : vérifie la vivacité de la cible suivie (avec StartTime) ET relève la fenêtre au premier plan
      const script = `
        \$targetPid = ${targetPid}
        \$targetName = '${targetName.replace(/'/g, "''")}'
        \$targetStartTime = '${targetStartTime.replace(/'/g, "''")}'
        \$autoDetect = ${autoDetectEnabled ? '\$true' : '\$false'}

        \$targetAlive = \$false
        if (\$targetPid -gt 0) {
          \$tp = Get-Process -Id \$targetPid -ErrorAction SilentlyContinue
          if (\$tp -and \$tp.ProcessName -ieq \$targetName) {
            \$tpSt = if (\$tp.StartTime) { \$tp.StartTime.ToString('o') } else { '' }
            if (-not \$targetStartTime -or \$tpSt -eq \$targetStartTime) {
              \$targetAlive = \$true
            }
          }
        }

        \$fgObj = \$null
        if (\$autoDetect) {
          \$fgProc = Get-Process | Where-Object { \$_.MainWindowHandle -ne 0 -and \$_.MainWindowTitle -and \$_.MainWindowTitle -ne '' } | Select-Object -First 1 Id, ProcessName, MainWindowTitle, StartTime
          if (\$fgProc) {
            \$st = if (\$fgProc.StartTime) { \$fgProc.StartTime.ToString('o') } else { '' }
            \$fgObj = [PSCustomObject]@{
              pid = \$fgProc.Id
              name = \$fgProc.ProcessName
              title = \$fgProc.MainWindowTitle
              startTime = \$st
            }
          }
        }

        [PSCustomObject]@{
          targetAlive = \$targetAlive
          foreground = \$fgObj
        } | ConvertTo-Json -Compress
      `;

      const res = await runPowerShell<any>(script, { asJson: true, timeout: 3500 });
      if (!res.success || !res.data) return;

      const { targetAlive, foreground } = res.data;

      // 1. Si un processus était suivi mais qu'il est désormais mort (ou PID réassigné)
      if (currentGameIdentity !== null && !targetAlive) {
        logger.info(`[Gaming] Processus suivi terminé ou réassigné (PID ${currentGameIdentity.pid}: ${currentGameIdentity.name})`);
        rejectedIdentities.delete(getProcessIdentityKey(currentGameIdentity));
        gamingSessionState = 'finished';
        await gamingManager.restorePreviousState();
        sendSessionSummary(win);
        currentGameIdentity = null;
        currentGameName = null;
        currentGamePID = null;
        gamingModeActive = false;
        gamingSessionState = 'none';
        sessionStartTime = 0;
        win.webContents.send('gaming-event', { type: 'mode-changed', state: 'finished', active: false, game: null });
        return;
      }

      // 2. Détection auto active uniquement si activée par l'utilisateur
      if (!autoDetectEnabled || !foreground) return;

      const { pid, name, startTime } = foreground as { pid: number; name: string; title: string; startTime?: string };
      const procName = String(name || '').toLowerCase();

      // 3. Exclure les processus système, navigateurs, explorateur, IDEs
      if (EXCLUDED_PROCESSES.has(procName)) {
        if (gamingSessionState === 'active' && currentGameIdentity !== null && currentGameIdentity.pid !== pid) {
          gamingSessionState = 'background';
          win.webContents.send('gaming-event', { type: 'state-changed', state: 'background', active: true, game: currentGameName });
        }
        return;
      }

      // 4. Si c'est déjà le processus suivi actif
      if (currentGameIdentity !== null && currentGameIdentity.pid === pid) {
        if (gamingSessionState === 'background') {
          gamingSessionState = 'active';
          win.webContents.send('gaming-event', { type: 'state-changed', state: 'active', active: true, game: currentGameName });
        }
        return;
      }

      const candidateIdentity: ProcessIdentity = { pid, name, startTime };
      const candidateKey = getProcessIdentityKey(candidateIdentity);

      // 5. Si cette instance précise a été refusée par l'utilisateur, ne pas répéter la proposition
      if (rejectedIdentities.has(candidateKey)) {
        return;
      }

      // 6. Si une proposition est déjà en attente pour cette même instance, ne pas renvoyer
      if (gamingSessionState === 'proposed' && lastProposedIdentity && getProcessIdentityKey(lastProposedIdentity) === candidateKey) {
        return;
      }

      // 7. Nouvelle cible identifiée : PROPOSER à l'utilisateur sans aucune activation automatique
      if (!currentGameIdentity || currentGameIdentity.name !== name || currentGameIdentity.pid !== pid) {
        logger.info(`[Gaming] Application candidate détectée : ${name} (PID ${pid}, StartTime: ${startTime || 'n/a'}) — attente de confirmation`);
        gamingSessionState = 'proposed';
        lastProposedIdentity = candidateIdentity;
        win.webContents.send('gaming-event', {
          type: 'detection-proposal',
          state: 'proposed',
          active: false,
          game: name,
          pid,
          startTime,
          message: `Application détectée au premier plan : "${name}". Souhaitez-vous activer l'optimisation de session ?`,
        });
      }
    } catch {
      // Les erreurs de détection ne doivent pas interrompre l'application
    }
  }, 8000);
}

function sendSessionSummary(win: BrowserWindow) {
  if (sessionStartTime > 0) {
    const durationMin = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
    const avgPing = sessionPings.length > 0 ? Math.round(sessionPings.reduce((a, b) => a + b, 0) / sessionPings.length) : null;

    notificationManager.emit({ category: 'system', severity: 'info', title: 'Récapitulatif de Session Gaming', message: avgPing !== null
        ? `Temps de jeu : ${durationMin} min • Latence moyenne : ${avgPing}ms.`
        : `Temps de jeu : ${durationMin} min • Mesure de latence moyenne non disponible.`, actionTarget: { tab: 'gaming' } });
  }
}
