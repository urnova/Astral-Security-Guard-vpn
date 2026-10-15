import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

let popupWin: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;
let currentClickFocusCallback: (() => void) | null = null;

function getPopupPosition(width = 390, height = 150) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24),
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

  const { x, y } = getPopupPosition(390, 150);

  popupWin = new BrowserWindow({
    width: 390,
    height: 150,
    x,
    y,
    frame: false,
    transparent: true,
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
  type?: 'info' | 'threat' | 'gaming' | 'success';
  onClickFocus?: () => void;
}) {
  currentClickFocusCallback = onClickFocus || null;

  const win = createOrGetNotificationWindow();
  const { x, y } = getPopupPosition(390, 150);
  win.setBounds({ x, y, width: 390, height: 150 });

  const borderColor =
    type === 'threat' ? 'rgba(223, 133, 133, 0.6)' :
    type === 'gaming' ? 'rgba(214, 173, 104, 0.6)' :
    type === 'success' ? 'rgba(104, 184, 148, 0.6)' :
    '#2c3037';

  const accentColor =
    type === 'threat' ? '#df8585' :
    type === 'gaming' ? '#d6ad68' :
    type === 'success' ? '#68b894' :
    '#8eaee8';

  const badgeText =
    type === 'threat' ? 'ALERTE SÉCURITÉ' :
    type === 'gaming' ? 'MODE GAMING' :
    type === 'success' ? 'SYSTÈME PROTÉGÉ' :
    'NOTIFICATION VANGUARD';

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
            padding: 0;
            user-select: none;
          }
          .card {
            width: 100%;
            height: 100%;
            background: linear-gradient(145deg, #1b1e23 0%, #131518 100%);
            border: 1px solid ${borderColor};
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 0.5px rgba(255,255,255,0.04) inset;
            border-radius: 10px;
            padding: 13px 15px 10px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            color: #eceef0;
            cursor: pointer;
            position: relative;
            animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            transition: border-color 0.15s ease;
          }
          .card:hover { border-color: ${accentColor}; }
          @keyframes slideIn {
            from { transform: translateY(14px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .brand {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 6px;
            padding-right: 26px;
          }
          .logo-img { width: 16px; height: 16px; object-fit: contain; }
          .close-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.12);
            color: #777f8b;
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
            background: rgba(223,133,133,0.22);
            border-color: #df8585;
            color: #ffffff;
          }
          .title {
            font-size: 13px;
            font-weight: 600;
            color: #eceef0;
            line-height: 1.3;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .message {
            font-size: 11.5px;
            color: #a0a6af;
            line-height: 1.4;
            max-height: 44px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 10px;
            color: #777f8b;
            border-top: 1px solid rgba(255,255,255,0.06);
            padding-top: 6px;
            margin-top: 4px;
          }
          .action-hint { color: ${accentColor}; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="card" id="card" onclick="window.location.href='vanguard://focus'">
          <button class="close-btn" title="Fermer" onclick="event.stopPropagation(); window.location.href='vanguard://close'">✕</button>
          <div>
            <div class="brand">
              ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="" />` : ''}
              <span>${badgeText}</span>
            </div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="message">${escapeHtml(message)}</div>
          </div>
          <div class="footer">
            <span>Astral Vanguard v2.5.4</span>
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

  const accentColor = isThreat ? '#df8585' : isSuspect ? '#d6ad68' : '#68b894';
  const statusTitle = isThreat
    ? 'Menace bloquée dans le téléchargement'
    : isSuspect
    ? 'Fichier téléchargé suspect'
    : 'Téléchargement sain et vérifié';

  const statusDesc = isThreat
    ? `Composant malveillant bloqué : ${threatName || 'Malware'}`
    : isSuspect
    ? `${threatName || 'Anomalie détectée'}`
    : 'Aucune charge hostile détectée. Le fichier est intègre.';

  const logoUrl = getLogoDataUrl();

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
            justifyContent: center;
            height: 100vh;
            padding: 8px;
            user-select: none;
          }
          .card {
            width: 100%;
            height: 100%;
            background: linear-gradient(145deg, #1b1e23 0%, #131518 100%);
            border: 1px solid ${accentColor};
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
            border-radius: 10px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            color: #eceef0;
            animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes slideIn {
            from { transform: translateY(16px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .header {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            margin-bottom: 6px;
          }
          .brand {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 7px;
          }
          .logo-img {
            width: 16px;
            height: 16px;
            object-fit: contain;
          }
          .close-btn {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #777f8b;
            border-radius: 5px;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justifyContent: center;
            cursor: pointer;
            font-size: 10px;
            line-height: 1;
            transition: all 0.15s ease;
          }
          .close-btn:hover {
            background: rgba(223, 133, 133, 0.2);
            border-color: #df8585;
            color: #ffffff;
          }
          .title {
            font-size: 13px;
            font-weight: 600;
            color: #eceef0;
            margin-bottom: 2px;
          }
          .file-name {
            font-size: 11px;
            font-family: monospace;
            color: ${accentColor};
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .message {
            font-size: 11px;
            color: #a0a6af;
            line-height: 1.35;
          }
          .footer {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            border-top: 1px solid #2c3037;
            padding-top: 6px;
            font-size: 10px;
            color: #777f8b;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div>
            <div class="header">
              <div class="brand">
                ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="" />` : ''}
                <span>SENTINELLE TÉLÉCHARGEMENTS</span>
              </div>
              <button class="close-btn" title="Fermer" onclick="window.location.href='vanguard://close'">✕</button>
            </div>
            <div class="title">${escapeHtml(statusTitle)}</div>
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="message">${escapeHtml(statusDesc)}</div>
          </div>
          <div class="footer">
            <span>Astral Vanguard v2.5.1</span>
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
