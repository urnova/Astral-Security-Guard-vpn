import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import { logger } from './logger';

let popupWin: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;

function getPopupPosition(width = 380, height = 160) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  return {
    x: Math.round(workArea.x + workArea.width - width - 20),
    y: Math.round(workArea.y + workArea.height - height - 20),
  };
}

export function createOrGetNotificationWindow(): BrowserWindow {
  if (popupWin && !popupWin.isDestroyed()) {
    return popupWin;
  }

  const { x, y } = getPopupPosition(380, 160);

  popupWin = new BrowserWindow({
    width: 380,
    height: 160,
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
    },
  });

  popupWin.setMenu(null);
  popupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

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
  const win = createOrGetNotificationWindow();
  const { x, y } = getPopupPosition(380, 160);
  win.setBounds({ x, y, width: 380, height: 160 });

  const borderColor =
    type === 'threat' ? 'rgba(239, 68, 68, 0.6)' :
    type === 'gaming' ? 'rgba(168, 85, 247, 0.6)' :
    type === 'success' ? 'rgba(16, 185, 129, 0.6)' :
    'rgba(0, 245, 255, 0.5)';

  const accentColor =
    type === 'threat' ? '#ef4444' :
    type === 'gaming' ? '#c084fc' :
    type === 'success' ? '#10b981' :
    '#00f5ff';

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
            background: rgba(8, 12, 24, 0.94);
            backdrop-filter: blur(24px);
            border: 1px solid ${borderColor};
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 20px ${borderColor};
            border-radius: 14px;
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            color: #ffffff;
            cursor: pointer;
            animation: slideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          }
          @keyframes slideIn {
            from { transform: translateY(30px); opacity: 0; }
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
            letter-spacing: 0.12em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: ${accentColor};
            box-shadow: 0 0 6px ${accentColor};
          }
          .title {
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
            line-height: 1.3;
            margin-bottom: 4px;
          }
          .message {
            font-size: 11px;
            color: #94a3b8;
            line-height: 1.4;
            max-height: 48px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .footer {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.35);
            display: flex;
            justifyContent: flex-end;
          }
        </style>
      </head>
      <body>
        <div class="card" id="card">
          <div>
            <div class="header">
              <div class="brand">
                <span class="dot"></span>
                <span>ASTRAL VANGUARD</span>
              </div>
            </div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="message">${escapeHtml(message)}</div>
          </div>
          <div class="footer">Cliquer pour ouvrir</div>
        </div>

        <script>
          // High-tech audio chime using Web Audio API
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
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
  hideTimer = setTimeout(() => {
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.hide();
    }
  }, 4800);
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
  const { x, y } = getPopupPosition(420, 210);
  win.setBounds({ x, y, width: 420, height: 210 });

  const isThreat = status === 'threat';
  const isSuspect = status === 'suspect';
  const isClean = !isThreat && !isSuspect;

  const accentColor = isThreat ? '#ef4444' : isSuspect ? '#f59e0b' : '#10b981';
  const statusTitle = isThreat
    ? '🚨 Menace détectée dans le téléchargement'
    : isSuspect
    ? '⚠️ Fichier téléchargé suspect'
    : '✓ Fichier vérifié et sain';

  const statusDesc = isThreat
    ? `Contenu malveillant : ${threatName || 'Malware bloqué'}`
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
            background: rgba(6, 9, 20, 0.96);
            backdrop-filter: blur(28px);
            border: 1px solid ${accentColor}80;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 25px ${accentColor}40;
            border-radius: 14px;
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            color: #ffffff;
            animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          @keyframes slideIn {
            from { transform: translateY(30px); opacity: 0; }
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
            letter-spacing: 0.12em;
            color: ${accentColor};
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: ${accentColor};
            box-shadow: 0 0 6px ${accentColor};
          }
          .filename {
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 4px;
          }
          .status {
            font-size: 12px;
            font-weight: 600;
            color: ${accentColor};
            margin-bottom: 2px;
          }
          .desc {
            font-size: 11px;
            color: #94a3b8;
            line-height: 1.4;
          }
          .actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 8px;
          }
          .btn {
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            cursor: pointer;
          }
          .btn-danger {
            background: #ef4444;
            border-color: #ef4444;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div>
            <div class="header">
              <div class="brand">
                <span class="dot"></span>
                <span>SENTINELLE TÉLÉCHARGEMENT · ASTRAL VANGUARD</span>
              </div>
            </div>
            <div class="filename">📁 ${escapeHtml(fileName)}</div>
            <div class="status">${escapeHtml(statusTitle)}</div>
            <div class="desc">${escapeHtml(statusDesc)}</div>
          </div>
          <div class="actions">
            ${isThreat ? '<button class="btn btn-danger" onclick="window.close()">Mettre en quarantaine</button>' : ''}
            <button class="btn" onclick="window.close()">Fermer</button>
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
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
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
