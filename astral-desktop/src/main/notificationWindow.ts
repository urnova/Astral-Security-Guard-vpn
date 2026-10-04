import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
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
    type === 'threat' ? 'rgba(239, 68, 68, 0.7)' :
    type === 'gaming' ? 'rgba(168, 85, 247, 0.7)' :
    type === 'success' ? 'rgba(16, 185, 129, 0.7)' :
    'rgba(0, 245, 255, 0.6)';

  const accentColor =
    type === 'threat' ? '#ef4444' :
    type === 'gaming' ? '#c084fc' :
    type === 'success' ? '#10b981' :
    '#00f5ff';

  const glowRgba =
    type === 'threat' ? 'rgba(239, 68, 68, 0.25)' :
    type === 'gaming' ? 'rgba(168, 85, 247, 0.25)' :
    type === 'success' ? 'rgba(16, 185, 129, 0.25)' :
    'rgba(0, 245, 255, 0.25)';

  const badgeText =
    type === 'threat' ? 'ALERTE SÉCURITÉ' :
    type === 'gaming' ? 'MODE E-SPORT' :
    type === 'success' ? 'SYSTÈME PROTÉGÉ' :
    'ASTRAL VANGUARD';

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
            background: linear-gradient(145deg, rgba(12, 16, 32, 0.96) 0%, rgba(6, 8, 20, 0.98) 100%);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid ${borderColor};
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 24px ${glowRgba};
            border-radius: 14px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            color: #ffffff;
            cursor: pointer;
            position: relative;
            animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
          }
          .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 20px 48px rgba(0, 0, 0, 0.9), 0 0 30px ${glowRgba};
          }
          @keyframes slideIn {
            from { transform: translateY(24px) scale(0.96); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
          .header {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            margin-bottom: 6px;
          }
          .brand {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.14em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background-color: ${accentColor};
            box-shadow: 0 0 8px ${accentColor};
          }
          .close-btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #94a3b8;
            border-radius: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            transition: all 0.2s ease;
          }
          .close-btn:hover {
            background: rgba(239, 68, 68, 0.4);
            border-color: #ef4444;
            color: #ffffff;
            transform: scale(1.1);
          }
          .title {
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
            line-height: 1.3;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .message {
            font-size: 11px;
            color: #94a3b8;
            line-height: 1.4;
            max-height: 44px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .footer {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            font-size: 10px;
            color: rgba(148, 163, 184, 0.6);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 6px;
            margin-top: 4px;
          }
          .action-hint {
            color: ${accentColor};
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="card" id="card" onclick="window.location.href='vanguard://focus'">
          <div>
            <div class="header">
              <div class="brand">
                <span class="dot"></span>
                <span>${badgeText}</span>
              </div>
              <button class="close-btn" title="Fermer" onclick="event.stopPropagation(); window.location.href='vanguard://close'">✕</button>
            </div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="message">${escapeHtml(message)}</div>
          </div>
          <div class="footer">
            <span>Astral Vanguard v2.4</span>
            <span class="action-hint">Cliquer pour afficher ➔</span>
          </div>
        </div>

        <script>
          // High-tech sound chime
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(${type === 'threat' ? 440 : 587.33}, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(${type === 'threat' ? 220 : 880}, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.33);
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
  const { x, y } = getPopupPosition(420, 190);
  win.setBounds({ x, y, width: 420, height: 190 });

  const isThreat = status === 'threat';
  const isSuspect = status === 'suspect';
  const isClean = !isThreat && !isSuspect;

  const accentColor = isThreat ? '#ef4444' : isSuspect ? '#f59e0b' : '#10b981';
  const statusTitle = isThreat
    ? 'Menace détectée dans le téléchargement'
    : isSuspect
    ? 'Fichier téléchargé suspect'
    : 'Téléchargement sécurisé et intègre';

  const statusDesc = isThreat
    ? `Composant malveillant bloqué : ${threatName || 'Malware'}`
    : isSuspect
    ? `${threatName || 'Anomalie détectée'}`
    : 'Aucune charge hostile détectée. Le fichier peut être exécuté en toute sécurité.';

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
            background: linear-gradient(145deg, rgba(12, 16, 32, 0.97) 0%, rgba(6, 8, 20, 0.99) 100%);
            backdrop-filter: blur(24px);
            border: 1px solid ${accentColor};
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 24px ${accentColor}40;
            border-radius: 14px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            color: #ffffff;
            animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes slideIn {
            from { transform: translateY(24px); opacity: 0; }
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
            font-weight: 800;
            letter-spacing: 0.14em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .close-btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #94a3b8;
            border-radius: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            transition: all 0.2s ease;
          }
          .close-btn:hover {
            background: rgba(239, 68, 68, 0.4);
            border-color: #ef4444;
            color: #ffffff;
          }
          .title {
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
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
            color: #94a3b8;
            line-height: 1.35;
          }
          .footer {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 6px;
            font-size: 10px;
            color: rgba(148, 163, 184, 0.6);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div>
            <div class="header">
              <div class="brand">
                <span>SENTINELLE TÉLÉCHARGEMENTS</span>
              </div>
              <button class="close-btn" title="Fermer" onclick="window.location.href='vanguard://close'">✕</button>
            </div>
            <div class="title">${escapeHtml(statusTitle)}</div>
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="message">${escapeHtml(statusDesc)}</div>
          </div>
          <div class="footer">
            <span>Astral Vanguard Defender</span>
            <span>Moteur heuristique actif</span>
          </div>
        </div>

        <script>
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(${isThreat ? 300 : 659.25}, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(${isThreat ? 150 : 880}, ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.36);
          } catch(e) {}
        </script>
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
