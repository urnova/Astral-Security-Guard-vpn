import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

let popupWin: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;
let currentClickFocusCallback: (() => void) | null = null;

function getPopupPosition(width = 400, height = 150) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  return {
    x: Math.round(workArea.x + workArea.width - width - 20),
    y: Math.round(workArea.y + workArea.height - height - 20),
  };
}

let cachedLogoBase64: string | null = null;
function getLogoDataUrl(): string {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const candidates = [
      path.join(app.getAppPath(), 'public/images/vanguard-logo.png'),
      path.join(app.getAppPath(), 'public/logo.png'),
      path.join(__dirname, '../../public/images/vanguard-logo.png'),
      path.join(__dirname, '../../public/logo.png'),
      path.join(__dirname, '../assets/vanguard-logo.png'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        cachedLogoBase64 = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
        return cachedLogoBase64;
      }
    }
  } catch {}
  return '';
}

export function createOrGetNotificationWindow(): BrowserWindow {
  if (popupWin && !popupWin.isDestroyed()) {
    return popupWin;
  }

  const { x, y } = getPopupPosition(400, 150);

  popupWin = new BrowserWindow({
    width: 400,
    height: 150,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    hasShadow: false,
    thickFrame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'no-user-gesture-required' as any,
    },
  });

  popupWin.setAlwaysOnTop(true, 'screen-saver');
  popupWin.setMenu(null);
  popupWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Navigation interceptor for custom actions
  popupWin.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.includes('vanguard://close')) {
      if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
    } else if (url.includes('vanguard://focus')) {
      if (currentClickFocusCallback) currentClickFocusCallback();
      if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
    } else if (url.includes('vanguard://delete')) {
      try {
        const u = new URL(url);
        const targetPath = decodeURIComponent(u.searchParams.get('file') || '');
        if (targetPath && fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          logger.info(`[DownloadScanner] Fichier supprimé par l'utilisateur: ${targetPath}`);
        }
      } catch (err: any) {
        logger.warn('[DownloadScanner] Erreur suppression fichier:', err.message);
      }
      if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
    } else if (url.includes('vanguard://quarantine')) {
      try {
        const u = new URL(url);
        const targetPath = decodeURIComponent(u.searchParams.get('file') || '');
        if (targetPath && fs.existsSync(targetPath)) {
          const quarPath = `${targetPath}.vanguard_quarantine`;
          fs.renameSync(targetPath, quarPath);
          logger.info(`[DownloadScanner] Fichier mis en quarantaine: ${quarPath}`);
        }
      } catch (err: any) {
        logger.warn('[DownloadScanner] Erreur mise en quarantaine:', err.message);
      }
      if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
    }
  });

  popupWin.on('closed', () => {
    popupWin = null;
  });

  return popupWin;
}

// Anti-flood notification limiter
let recentNotifTimestamps: number[] = [];

export function showAvastStyleToast({
  title,
  message,
  type = 'info',
  soundEnabled = true,
  volume = 0.8,
  onClickFocus,
}: {
  title: string;
  message: string;
  type?: 'info' | 'threat' | 'gaming' | 'success' | 'network' | 'ping' | 'stability' | 'vpn' | 'performance' | 'security';
  soundEnabled?: boolean;
  volume?: number;
  onClickFocus?: () => void;
}) {
  const now = Date.now();
  recentNotifTimestamps = recentNotifTimestamps.filter(t => now - t < 2500);
  if (recentNotifTimestamps.length >= 3 && type !== 'threat' && type !== 'security') {
    // Coalesce / throttle non-critical notifications to avoid avalanche
    return;
  }
  recentNotifTimestamps.push(now);

  currentClickFocusCallback = onClickFocus || null;

  const win = createOrGetNotificationWindow();
  const { x, y } = getPopupPosition(400, 150);
  win.setBounds({ x, y, width: 400, height: 150 });

  const borderColor =
    type === 'threat' || type === 'security' ? 'rgba(239, 68, 68, 0.45)' :
    type === 'gaming' ? 'rgba(56, 189, 248, 0.45)' :
    type === 'success' ? 'rgba(34, 197, 94, 0.45)' :
    type === 'network' || type === 'ping' ? 'rgba(96, 165, 250, 0.45)' :
    type === 'vpn' ? 'rgba(168, 85, 247, 0.45)' :
    type === 'performance' ? 'rgba(234, 179, 8, 0.45)' :
    type === 'stability' ? 'rgba(234, 179, 8, 0.45)' :
    'rgba(255, 255, 255, 0.15)';

  const accentColor =
    type === 'threat' || type === 'security' ? '#ef4444' :
    type === 'gaming' ? '#38bdf8' :
    type === 'success' ? '#22c55e' :
    type === 'network' || type === 'ping' ? '#60a5fa' :
    type === 'vpn' ? '#a855f7' :
    type === 'performance' ? '#eab308' :
    type === 'stability' ? '#eab308' :
    '#38bdf8';

  const badgeText =
    type === 'threat' || type === 'security' ? 'ALERTE SÉCURITÉ' :
    type === 'gaming' ? 'MODE GAMING' :
    type === 'success' ? 'SYSTÈME PROTÉGÉ' :
    type === 'network' || type === 'ping' ? 'RÉSEAU & LATENCE' :
    type === 'vpn' ? 'VPN SÉCURISÉ' :
    type === 'performance' ? 'PERFORMANCE & SYSTÈME' :
    type === 'stability' ? 'STABILITÉ SYSTÈME' :
    'ASTRAL VANGUARD';

  // SVG Icons according to notification type
  const iconSvg =
    type === 'threat' || type === 'security'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
      : type === 'gaming'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`
      : type === 'vpn'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      : type === 'performance'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
      : type === 'success'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : type === 'network' || type === 'ping'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  const logoUrl = getLogoDataUrl();
  const safeVol = Math.max(0.01, Math.min(1.0, volume));

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: transparent;
            overflow: hidden;
            display: flex;
            align-items: stretch;
            justify-content: stretch;
            height: 100vh;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none;
          }
          .card {
            width: 100%;
            height: 100%;
            background: #0d111a;
            border: 1px solid ${borderColor};
            border-radius: 10px;
            box-shadow: none;
            padding: 13px 16px 12px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            color: #f1f5f9;
            cursor: pointer;
            position: relative;
            box-sizing: border-box;
            animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            transition: border-color 0.2s ease;
          }
          .card:hover { border-color: ${accentColor}; }
          @keyframes slideIn {
            from { transform: translateY(16px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
            padding-right: 24px;
          }
          .brand {
            font-size: 10.5px;
            font-weight: 700;
            letter-spacing: 0.06em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 7px;
          }
          .icon-box { display: flex; align-items: center; justify-content: center; }
          .logo-img { width: 15px; height: 15px; object-fit: contain; }
          .close-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            color: #94a3b8;
            border-radius: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 11px;
            line-height: 1;
            transition: all 0.15s ease;
          }
          .close-btn:hover {
            background: rgba(239, 68, 68, 0.25);
            border-color: #ef4444;
            color: #ffffff;
          }
          .title {
            font-size: 13.5px;
            font-weight: 700;
            color: #ffffff;
            line-height: 1.3;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .message {
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.45;
            max-height: 44px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 10px;
            color: #64748b;
            border-top: 1px solid rgba(255,255,255,0.06);
            padding-top: 6px;
            margin-top: 4px;
          }
          .action-hint { color: ${accentColor}; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card" id="card" onclick="window.location.href='vanguard://focus'">
          <button class="close-btn" title="Fermer" onclick="event.stopPropagation(); window.location.href='vanguard://close'">✕</button>
          <div>
            <div class="header-row">
              <div class="brand">
                <span class="icon-box">${iconSvg}</span>
                ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="" />` : ''}
                <span>${badgeText}</span>
              </div>
            </div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="message">${escapeHtml(message)}</div>
          </div>
          <div class="footer">
            <span>Astral Vanguard v${app.getVersion() || "2.5.12"}</span>
            <span class="action-hint">Ouvrir l'application ➔</span>
          </div>
        </div>

        <script>
          ${soundEnabled ? `
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const notifType = '${type}';
            const baseVol = ${safeVol};

            if (notifType === 'threat' || notifType === 'security') {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(660, now);
              osc.frequency.exponentialRampToValueAtTime(330, now + 0.18);
              gain.gain.setValueAtTime(0.08 * baseVol, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.22);
            } else if (notifType === 'gaming') {
              // Quick upbeat 2-note blip
              const osc1 = ctx.createOscillator();
              const gain1 = ctx.createGain();
              osc1.type = 'triangle';
              osc1.frequency.setValueAtTime(587.33, now);
              gain1.gain.setValueAtTime(0.06 * baseVol, now);
              gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
              osc1.connect(gain1); gain1.connect(ctx.destination);
              osc1.start(now); osc1.stop(now + 0.09);

              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.type = 'triangle';
              osc2.frequency.setValueAtTime(880, now + 0.08);
              gain2.gain.setValueAtTime(0.06 * baseVol, now + 0.08);
              gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
              osc2.connect(gain2); gain2.connect(ctx.destination);
              osc2.start(now + 0.08); osc2.stop(now + 0.19);
            } else if (notifType === 'vpn') {
              // Double pleasant chime
              const osc1 = ctx.createOscillator();
              const gain1 = ctx.createGain();
              osc1.type = 'sine';
              osc1.frequency.setValueAtTime(523.25, now);
              gain1.gain.setValueAtTime(0.06 * baseVol, now);
              gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
              osc1.connect(gain1); gain1.connect(ctx.destination);
              osc1.start(now); osc1.stop(now + 0.11);

              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.type = 'sine';
              osc2.frequency.setValueAtTime(659.25, now + 0.09);
              gain2.gain.setValueAtTime(0.06 * baseVol, now + 0.09);
              gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
              osc2.connect(gain2); gain2.connect(ctx.destination);
              osc2.start(now + 0.09); osc2.stop(now + 0.23);
            } else if (notifType === 'network' || notifType === 'ping') {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(880, now);
              osc.frequency.exponentialRampToValueAtTime(1174, now + 0.12);
              gain.gain.setValueAtTime(0.05 * baseVol, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.14);
            } else if (notifType === 'performance') {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(440, now);
              osc.frequency.exponentialRampToValueAtTime(660, now + 0.14);
              gain.gain.setValueAtTime(0.05 * baseVol, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.16);
            } else {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, now);
              osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
              gain.gain.setValueAtTime(0.05 * baseVol, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.18);
            }
          } catch(e) {}
          ` : ''}
        </script>
      </body>
    </html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.showInactive();

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.hide();
    }
  }, 4500);
}

export function showAvastStyleDownloadScan({
  fileName,
  filePath,
  status = 'safe',
  threatName,
  isUnsigned = false,
  discreteMode = 'window',
}: {
  fileName: string;
  filePath: string;
  status: 'scanning' | 'safe' | 'suspect' | 'threat';
  threatName?: string;
  isUnsigned?: boolean;
  discreteMode?: 'window' | 'mini' | 'notification';
}) {
  const isScanning = status === 'scanning';
  const isThreat = status === 'threat';
  const isSuspect = status === 'suspect';
  const isSafe = status === 'safe';

  // If discreteMode is mini, use compact dimensions
  const isMini = discreteMode === 'mini';
  const popupWidth = isMini ? 340 : 420;
  const popupHeight = isMini ? 110 : ((isThreat || isSuspect) ? 200 : 160);

  const win = createOrGetNotificationWindow();
  const { x, y } = getPopupPosition(popupWidth, popupHeight);
  win.setBounds({ x, y, width: popupWidth, height: popupHeight });

  const accentColor =
    isScanning ? '#38bdf8' :
    isThreat ? '#ef4444' :
    isSuspect ? '#f59e0b' :
    '#22c55e';

  const statusTitle =
    isScanning ? 'Analyse du téléchargement en cours…' :
    isThreat ? 'Menace bloquée dans le téléchargement' :
    isSuspect ? 'Fichier téléchargé suspect' :
    'Fichier sain';

  const statusDesc =
    isScanning ? 'Vérification heuristique et intégrité des données...' :
    isThreat ? `Composant malveillant neutralisé : ${threatName || 'Malware'}` :
    isSuspect ? `${threatName || 'Anomalie de signature détectée'}` :
    'Aucune charge hostile détectée. Le fichier est intègre et validé.';

  const logoUrl = getLogoDataUrl();

  const iconSvg =
    isScanning
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`
      : isThreat
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : isSuspect
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const actionButtonsHtml = (isThreat || isSuspect) ? `
    <div class="action-bar">
      <button class="btn btn-danger" onclick="window.location.href='vanguard://delete?file=${encodeURIComponent(filePath)}'">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Supprimer
      </button>
      <button class="btn btn-warning" onclick="window.location.href='vanguard://quarantine?file=${encodeURIComponent(filePath)}'">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Quarantaine
      </button>
      <button class="btn btn-ghost" onclick="window.location.href='vanguard://close'">
        Ignorer
      </button>
    </div>
  ` : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: transparent;
            overflow: hidden;
            display: flex;
            align-items: stretch;
            justify-content: stretch;
            height: 100vh;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none;
          }
          .card {
            width: 100%;
            height: 100%;
            background: #0d111a;
            border: 1px solid ${isScanning ? 'rgba(56, 189, 248, 0.45)' : isThreat ? 'rgba(239, 68, 68, 0.55)' : isSuspect ? 'rgba(245, 158, 11, 0.55)' : 'rgba(34, 197, 94, 0.55)'};
            border-radius: 10px;
            box-shadow: none;
            padding: ${isMini ? '10px 14px' : '13px 16px 12px'};
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            color: #f1f5f9;
            box-sizing: border-box;
            animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            transition: border-color 0.2s ease;
          }
          .card:hover { border-color: ${accentColor}; }
          @keyframes slideIn {
            from { transform: translateY(16px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .spin-icon {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          .brand {
            font-size: 10.5px;
            font-weight: 700;
            letter-spacing: 0.06em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 5px;
            padding-right: 26px;
          }
          .icon-box { display: flex; align-items: center; justify-content: center; }
          .logo-img { width: 15px; height: 15px; object-fit: contain; }
          .close-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #94a3b8;
            border-radius: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 11px;
            line-height: 1;
            transition: all 0.15s ease;
          }
          .close-btn:hover {
            background: rgba(239, 68, 68, 0.25);
            border-color: #ef4444;
            color: #ffffff;
          }
          .title {
            font-size: ${isMini ? '12.5px' : '13.5px'};
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 3px;
            line-height: 1.3;
          }
          .file-name {
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            color: ${accentColor};
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            background: rgba(255, 255, 255, 0.04);
            padding: 2px 7px;
            border-radius: 4px;
            display: inline-block;
            max-width: 100%;
          }
          .message {
            font-size: ${isMini ? '11px' : '12px'};
            color: #94a3b8;
            line-height: 1.4;
          }
          .action-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            margin-bottom: 2px;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 11px;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.15s ease;
          }
          .btn-danger {
            background: rgba(239, 68, 68, 0.18);
            border-color: rgba(239, 68, 68, 0.45);
            color: #fca5a5;
          }
          .btn-danger:hover {
            background: rgba(239, 68, 68, 0.32);
            color: #ffffff;
          }
          .btn-warning {
            background: rgba(245, 158, 11, 0.16);
            border-color: rgba(245, 158, 11, 0.4);
            color: #fde68a;
          }
          .btn-warning:hover {
            background: rgba(245, 158, 11, 0.3);
            color: #ffffff;
          }
          .btn-ghost {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.1);
            color: #94a3b8;
          }
          .btn-ghost:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
          }
          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 5px;
            font-size: 10px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div>
            <button class="close-btn" title="Fermer" onclick="window.location.href='vanguard://close'">✕</button>
            <div class="brand">
              <span class="icon-box">${iconSvg}</span>
              ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="" />` : ''}
              <span>${isScanning ? 'SCANNER TÉLÉCHARGEMENT' : 'SENTINELLE TÉLÉCHARGEMENT'}</span>
            </div>
            <div class="title">${escapeHtml(statusTitle)}</div>
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="message">${escapeHtml(statusDesc)}</div>
          </div>
          ${actionButtonsHtml}
          ${!isMini ? `
          <div class="footer">
            <span>Astral Vanguard v${app.getVersion() || "2.5.12"}</span>
            <span>Moteur heuristique autonome</span>
          </div>
          ` : ''}
        </div>

        <script>
          ${!isScanning ? `
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const isThreat = ${isThreat};
            const isSuspect = ${isSuspect};

            if (isThreat) {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(880, now);
              osc.frequency.exponentialRampToValueAtTime(440, now + 0.22);
              gain.gain.setValueAtTime(0.07, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.26);
            } else if (isSuspect) {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(659.25, now);
              osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.16);
              gain.gain.setValueAtTime(0.05, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.2);
            } else {
              // Fichier sain chime
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, now);
              osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
              gain.gain.setValueAtTime(0.04, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now); osc.stop(now + 0.18);
            }
          } catch(e) {}
          ` : ''}
        </script>
      </body>
    </html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.showInactive();

  if (hideTimer) clearTimeout(hideTimer);
  // Auto-dismiss after 3s ONLY if safe
  if (isSafe) {
    hideTimer = setTimeout(() => {
      if (popupWin && !popupWin.isDestroyed()) {
        popupWin.hide();
      }
    }, 3000);
  }
}

function escapeHtml(str: string) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
