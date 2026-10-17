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
    },
  });

  popupWin.setMenu(null);
  popupWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Navigation interceptor for custom actions
  popupWin.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.includes('vanguard://close')) {
      if (popupWin && !popupWin.isDestroyed()) {
        popupWin.hide();
      }
    } else if (url.includes('vanguard://focus')) {
      if (currentClickFocusCallback) {
        currentClickFocusCallback();
      }
      if (popupWin && !popupWin.isDestroyed()) {
        popupWin.hide();
      }
    }
  });

  popupWin.on('closed', () => {
    popupWin = null;
  });

  return popupWin;
}

export function showAvastStyleToast({
  title,
  message,
  type = 'info',
  onClickFocus,
}: {
  title: string;
  message: string;
  type?: 'info' | 'threat' | 'gaming' | 'success' | 'network' | 'ping' | 'stability';
  onClickFocus?: () => void;
}) {
  currentClickFocusCallback = onClickFocus || null;

  const win = createOrGetNotificationWindow();
  const { x, y } = getPopupPosition(400, 150);
  win.setBounds({ x, y, width: 400, height: 150 });

  const borderColor =
    type === 'threat' ? 'rgba(239, 68, 68, 0.45)' :
    type === 'gaming' ? 'rgba(56, 189, 248, 0.45)' :
    type === 'success' ? 'rgba(34, 197, 94, 0.45)' :
    type === 'network' || type === 'ping' ? 'rgba(96, 165, 250, 0.45)' :
    type === 'stability' ? 'rgba(234, 179, 8, 0.45)' :
    'rgba(255, 255, 255, 0.15)';

  const accentColor =
    type === 'threat' ? '#ef4444' :
    type === 'gaming' ? '#38bdf8' :
    type === 'success' ? '#22c55e' :
    type === 'network' || type === 'ping' ? '#60a5fa' :
    type === 'stability' ? '#eab308' :
    '#38bdf8';

  const badgeText =
    type === 'threat' ? 'ALERTE SÉCURITÉ' :
    type === 'gaming' ? 'MODE GAMING' :
    type === 'success' ? 'SYSTÈME PROTÉGÉ' :
    type === 'network' || type === 'ping' ? 'RÉSEAU & LATENCE' :
    type === 'stability' ? 'STABILITÉ SYSTÈME' :
    'ASTRAL VANGUARD';

  // SVG Icons according to notification type
  const iconSvg =
    type === 'threat'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
      : type === 'gaming'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`
      : type === 'success'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : type === 'network' || type === 'ping'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  const logoUrl = getLogoDataUrl();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body {
            width: 100%; height: 100%;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: transparent;
            overflow: hidden;
            display: flex;
            align-items: stretch;
            justify-content: stretch;
            height: 100vh;
            padding: 6px;
            box-sizing: border-box;
            user-select: none;
          }
          .card {
            width: 100%;
            height: 100%;
            background: #0b0f19;
            border: 1px solid ${borderColor};
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.9), 0 0 12px ${accentColor}20;
            border-radius: 12px;
            padding: 13px 16px 12px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            color: #f1f5f9;
            cursor: pointer;
            position: relative;
            animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
          }
          .card:hover {
            border-color: ${accentColor};
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.95), 0 0 20px ${accentColor}30;
          }
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
          .icon-box {
            display: flex;
            align-items: center;
            justify-content: center;
          }
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
            <span>Astral Vanguard v${app.getVersion() || "2.5.9"}</span>
            <span class="action-hint">Ouvrir l'application ➔</span>
          </div>
        </div>

        <script>
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(${type === 'threat' ? 440 : 587.33}, ctx.currentTime);
            gain.gain.setValueAtTime(0.04, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.23);
          } catch(e) {}
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
  }, 5000);
}

export function showAvastStyleDownloadScan({
  fileName,
  filePath,
  status = 'safe',
  threatName,
  isUnsigned = false,
}: {
  fileName: string;
  filePath: string;
  status: 'safe' | 'suspect' | 'threat';
  threatName?: string;
  isUnsigned?: boolean;
}) {
  const win = createOrGetNotificationWindow();
  const { x, y } = getPopupPosition(420, 180);
  win.setBounds({ x, y, width: 420, height: 180 });

  const isThreat = status === 'threat';
  const isSuspect = status === 'suspect';
  const isClean = !isThreat && !isSuspect;
  const accentColor = isThreat ? '#ef4444' : isSuspect ? '#f59e0b' : '#22c55e';
  const statusTitle = isThreat
    ? 'Menace bloquée dans le téléchargement'
    : isSuspect
    ? 'Fichier téléchargé suspect'
    : 'Téléchargement sain et vérifié';

  const statusDesc = isThreat
    ? `Composant malveillant neutralisé : ${threatName || 'Malware'}`
    : isSuspect
    ? `${threatName || 'Anomalie de signature détectée'}`
    : 'Aucune charge hostile détectée. Le fichier est intègre et validé.';

  const logoUrl = getLogoDataUrl();

  const iconSvg = isThreat
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : isSuspect
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: transparent;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            padding: 6px;
            box-sizing: border-box;
            user-select: none;
          }
          .card {
            width: 100%;
            height: 100%;
            background: #0b0f19;
            border: 1px solid ${isThreat ? 'rgba(239, 68, 68, 0.45)' : isSuspect ? 'rgba(245, 158, 11, 0.45)' : 'rgba(34, 197, 94, 0.45)'};
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.9), 0 0 12px ${accentColor}20;
            border-radius: 12px;
            padding: 13px 16px 12px;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            color: #f1f5f9;
            animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
          }
          .card:hover {
            border-color: ${accentColor};
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.95), 0 0 20px ${accentColor}30;
          }
          @keyframes slideIn {
            from { transform: translateY(16px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
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
            margin-bottom: 6px;
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
            font-size: 13.5px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 3px;
            line-height: 1.3;
          }
          .file-name {
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            color: ${accentColor};
            margin-bottom: 5px;
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
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.45;
          }
          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 6px;
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
              <span>SENTINELLE TÉLÉCHARGEMENTS</span>
            </div>
            <div class="title">${escapeHtml(statusTitle)}</div>
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="message">${escapeHtml(statusDesc)}</div>
          </div>
          <div class="footer">
            <span>Astral Vanguard v${app.getVersion() || "2.5.9"}</span>
            <span>Moteur heuristique autonome</span>
          </div>
        </div>
      </body>
    </html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.showInactive();

  if (hideTimer) clearTimeout(hideTimer);
  if (isClean) {
    hideTimer = setTimeout(() => {
      if (popupWin && !popupWin.isDestroyed()) {
        popupWin.hide();
      }
    }, 4500);
  }
}

function escapeHtml(str: string) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
