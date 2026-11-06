import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.ts';

let popupWin: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;
let currentClickFocusCallback: (() => void) | null = null;

function getPopupPosition(width = 400, height = 150) {
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') {
    return { x: 100, y: 100 };
  }
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

export function createOrGetNotificationWindow(): BrowserWindow | null {
  if (typeof BrowserWindow !== 'function') {
    return null;
  }
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
        const scanId = u.searchParams.get('scanId');
        if (scanId) {
          const { deleteSessionFile } = require('./scanSession');
          deleteSessionFile(scanId, true).catch((e: any) => logger.warn('[DownloadScanner] Erreur deleteSessionFile:', e.message));
        } else {
          const targetPath = decodeURIComponent(u.searchParams.get('file') || '');
          if (targetPath && fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
            logger.info(`[DownloadScanner] Fichier supprimé par l'utilisateur: ${targetPath}`);
          }
        }
      } catch (err: any) {
        logger.warn('[DownloadScanner] Erreur suppression fichier:', err.message);
      }
      if (popupWin && !popupWin.isDestroyed()) popupWin.hide();
    } else if (url.includes('vanguard://quarantine')) {
      try {
        const u = new URL(url);
        const scanId = u.searchParams.get('scanId');
        if (scanId) {
          const { quarantineSessionFile } = require('./scanSession');
          quarantineSessionFile(scanId).catch((e: any) => logger.warn('[DownloadScanner] Erreur quarantineSessionFile:', e.message));
        } else {
          const targetPath = decodeURIComponent(u.searchParams.get('file') || '');
          if (targetPath && fs.existsSync(targetPath)) {
            const quarPath = `${targetPath}.vanguard_quarantine`;
            fs.renameSync(targetPath, quarPath);
            logger.info(`[DownloadScanner] Fichier mis en quarantaine: ${quarPath}`);
          }
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

export function showAvastStyleDownloadScan({
  fileName,
  filePath,
  status = 'safe',
  scanId,
  threatName,
  isUnsigned = false,
  discreteMode = 'window',
  soundEnabled = true,
  volume = 0.7,
}: {
  fileName: string;
  filePath: string;
  status: 'scanning' | 'safe' | 'suspect' | 'threat';
  scanId?: string;
  threatName?: string;
  isUnsigned?: boolean;
  discreteMode?: 'window' | 'mini' | 'notification';
  soundEnabled?: boolean;
  volume?: number;
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
  if (!win) return;
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
    'Aucune menace détectée';

  const statusDesc =
    isScanning ? 'Vérification heuristique et intégrité des données...' :
    isThreat ? `Composant malveillant neutralisé : ${threatName || 'Malware'}` :
    isSuspect ? `${threatName || 'Anomalie de signature détectée'}` :
    'Aucune charge hostile détectée par Windows Defender.';

  const logoUrl = getLogoDataUrl();

  const iconSvg =
    isScanning
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`
      : isThreat
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : isSuspect
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const deleteUrl = scanId ? `vanguard://delete?scanId=${encodeURIComponent(scanId)}` : `vanguard://delete?file=${encodeURIComponent(filePath)}`;
  const quarantineUrl = scanId ? `vanguard://quarantine?scanId=${encodeURIComponent(scanId)}` : `vanguard://quarantine?file=${encodeURIComponent(filePath)}`;

  const actionButtonsHtml = (isThreat || isSuspect) ? `
    <div class="action-bar">
      <button class="btn btn-danger" onclick="window.location.href='${deleteUrl}'">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Supprimer
      </button>
      <button class="btn btn-warning" onclick="window.location.href='${quarantineUrl}'">
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
            <span>Vanguard Core v${app.getVersion() || "0.1.0"}</span>
            <span>Moteur heuristique autonome</span>
          </div>
          ` : ''}
        </div>

        <script>
          ${soundEnabled ? `
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const dest = ctx.createGain(); dest.gain.value = ${Math.max(0, Math.min(1, volume)) / 0.7}; dest.connect(ctx.destination);
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const isScanning = ${isScanning};
            const isThreat = ${isThreat};
            const isSuspect = ${isSuspect};

            if (isScanning) {
              // High-tech subtle radar blip for download detection
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(659.25, now);
              osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
              gain.gain.setValueAtTime(0.045, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
              osc.connect(gain); gain.connect(dest);
              osc.start(now); osc.stop(now + 0.1);
            } else if (isThreat) {
              // Threat warning alarm
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(880, now);
              osc.frequency.exponentialRampToValueAtTime(440, now + 0.22);
              gain.gain.setValueAtTime(0.08, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
              osc.connect(gain); gain.connect(dest);
              osc.start(now); osc.stop(now + 0.26);
            } else if (isSuspect) {
              // Caution tone
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(659.25, now);
              osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.16);
              gain.gain.setValueAtTime(0.06, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
              osc.connect(gain); gain.connect(dest);
              osc.start(now); osc.stop(now + 0.2);
            } else {
              // Clean file positive chime
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, now);
              osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
              gain.gain.setValueAtTime(0.05, now);
              gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
              osc.connect(gain); gain.connect(dest);
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
