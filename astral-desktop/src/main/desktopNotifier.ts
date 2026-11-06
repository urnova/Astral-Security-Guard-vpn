/**
 * Vanguard desktop notifications.
 *
 * A dedicated, borderless Vanguard window shown near the Windows notification area. It is NOT a native
 * Windows toast and does not appear in the Windows notification centre. It is the single visual and audio
 * channel for notifications: nothing is drawn over the main window, and the sound is played here, once.
 *
 * - one window at a time, short bounded queue, window destroyed on close (nothing invisible stays on top)
 * - never takes focus, never appears in the taskbar, placed inside the work area of the primary display
 */
import { BrowserWindow, screen, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from './logger.ts';
import { loadPreferences } from './profile.ts';
import { playNotificationTone, type NotificationToneKind } from '../shared/notificationSound.ts';

export interface DesktopToast {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'alert' | 'critical';
  tone?: 'success';
  label: string;
  soundEnabled: boolean;
  volume: number; // 0..1
  onClick?: () => void;
}

type ThemeId = 'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled';
const PALETTES: Record<ThemeId, { bg: string; surface: string; line: string; text: string; muted: string; a1: string }> = {
  'vanguard-dark': { bg: '#131518', surface: '#1b1e23', line: '#2c3037', text: '#eceef0', muted: '#a0a6af', a1: '#8eaee8' },
  'cyber-cyan': { bg: '#111619', surface: '#191e22', line: '#2a3138', text: '#eceef0', muted: '#a0a6af', a1: '#90b5ce' },
  'midnight-purple': { bg: '#131218', surface: '#1c1b22', line: '#2d2b38', text: '#eceef0', muted: '#a0a6af', a1: '#b4a9d6' },
  'stealth-oled': { bg: '#080909', surface: '#121514', line: '#252d29', text: '#e8edea', muted: '#a0a6af', a1: '#9bbdaa' },
};
const SEVERITY_COLORS = { ok: '#68b894', warn: '#d6ad68', bad: '#df8585', info: '#7aa7d4' };

const WIDTH = 360;
const HEIGHT = 92;
const MARGIN = 16;
const MAX_QUEUE = 4;
const GAP_MS = 250;

let current: { win: BrowserWindow; timer: NodeJS.Timeout; onClick?: () => void } | null = null;
const queue: DesktopToast[] = [];
let shownCount = 0;

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

let logoDataUrl: string | null = null;
function logo(): string {
  if (logoDataUrl !== null) return logoDataUrl;
  logoDataUrl = '';
  try {
    for (const candidate of [
      path.join(app.getAppPath(), 'public', 'images', 'vanguard-logo.png'),
      path.join(app.getAppPath(), 'dist', 'images', 'vanguard-logo.png'),
      path.join(process.env.PUBLIC || '', 'images', 'vanguard-logo.png'),
    ]) {
      if (candidate && fs.existsSync(candidate)) {
        logoDataUrl = `data:image/png;base64,${fs.readFileSync(candidate).toString('base64')}`;
        break;
      }
    }
  } catch { /* the notification works without a logo */ }
  return logoDataUrl;
}

function placement(): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay(); // the taskbar and its notification area live here
  const area = display.workArea; // never overlaps the taskbar
  const width = Math.max(240, Math.min(WIDTH, area.width - 2 * MARGIN));
  const height = Math.min(HEIGHT, Math.max(72, area.height - 2 * MARGIN));
  const taskbarOnTop = area.y > display.bounds.y;
  return {
    width,
    height,
    x: Math.round(area.x + area.width - width - MARGIN),
    y: Math.round(taskbarOnTop ? area.y + MARGIN : area.y + area.height - height - MARGIN),
  };
}

function toneKind(t: DesktopToast): NotificationToneKind {
  if (t.severity === 'critical' || t.severity === 'alert') return 'alert';
  if (t.severity === 'warning') return 'warning';
  return t.tone === 'success' ? 'success' : 'info';
}

function pageHtml(t: DesktopToast, width: number): string {
  let themeId: ThemeId = 'vanguard-dark';
  try { const id = loadPreferences().theme as ThemeId; if (PALETTES[id]) themeId = id; } catch { /* default theme */ }
  const p = PALETTES[themeId];
  const accent = t.severity === 'critical' || t.severity === 'alert' ? SEVERITY_COLORS.bad
    : t.severity === 'warning' ? SEVERITY_COLORS.warn
    : t.tone === 'success' ? SEVERITY_COLORS.ok : SEVERITY_COLORS.info;
  const sound = t.soundEnabled && t.volume > 0
    ? `(${playNotificationTone.toString()})(${JSON.stringify(toneKind(t))}, ${Number(t.volume.toFixed(2))});`
    : '';
  const logoUrl = logo();
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;user-select:none}
.card{position:relative;width:100%;height:100%;display:flex;gap:12px;align-items:flex-start;padding:12px 38px 12px 14px;background:${p.surface};color:${p.text};border:1px solid ${p.line};border-left:3px solid ${accent};border-radius:10px;cursor:pointer;outline:none}
.card:hover,.card:focus-visible{border-color:${p.a1};border-left-color:${accent}}
.logo{width:28px;height:28px;flex:none;object-fit:contain;margin-top:1px}
.body{min-width:0;flex:1}
.label{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:${p.muted};margin-bottom:2px;display:flex;align-items:center;gap:6px}
.dot{width:6px;height:6px;border-radius:50%;background:${accent};flex:none}
.title{font-size:13px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msg{font-size:12px;line-height:1.4;color:${p.muted};margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.close{position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:6px;border:1px solid transparent;background:transparent;color:${p.muted};font-size:13px;cursor:pointer;display:grid;place-items:center}
.close:hover,.close:focus-visible{background:${p.bg};border-color:${p.line};color:${p.text};outline:none}
@media (prefers-reduced-motion:no-preference){.card{animation:in .18s ease-out both}}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style></head><body>
<div class="card" id="card" role="alert" tabindex="0" title="Ouvrir Vanguard Core">
${logoUrl ? `<img class="logo" src="${logoUrl}" alt="">` : ''}
<div class="body"><div class="label"><span class="dot"></span>${escapeHtml(t.label)}</div>
<div class="title">${escapeHtml(t.title)}</div><div class="msg">${escapeHtml(t.message)}</div></div>
<button class="close" id="close" aria-label="Fermer la notification" title="Fermer">✕</button></div>
<script>
document.getElementById('card').addEventListener('click',function(){location.href='vanguard://open'});
document.getElementById('card').addEventListener('keydown',function(e){if(e.key==='Enter')location.href='vanguard://open';if(e.key==='Escape')location.href='vanguard://close'});
document.getElementById('close').addEventListener('click',function(e){e.stopPropagation();location.href='vanguard://close'});
${sound}
</script></body></html>`;
}

function finish(opened: boolean): void {
  const slot = current;
  if (!slot) return;
  current = null;
  clearTimeout(slot.timer);
  const onClick = slot.onClick;
  try { if (!slot.win.isDestroyed()) slot.win.destroy(); } catch { /* already gone */ }
  if (opened && onClick) { try { onClick(); } catch (err: any) { logger.warn('[DesktopNotifier] Action du clic en échec :', err?.message); } }
  setTimeout(showNext, GAP_MS);
}

function showNext(): void {
  if (current || queue.length === 0) return;
  const toast = queue.shift()!;
  try {
    const spot = placement();
    const win = new BrowserWindow({
      ...spot,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, thickFrame: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, autoplayPolicy: 'no-user-gesture-required', spellcheck: false },
    });
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const duration = toast.severity === 'critical' || toast.severity === 'alert' ? 10000 : 6000;
    const timer = setTimeout(() => finish(false), duration);
    current = { win, timer, onClick: toast.onClick };
    win.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (url.startsWith('vanguard://open')) finish(true);
      else if (url.startsWith('vanguard://close')) finish(false);
    });
    win.on('closed', () => { if (current && current.win === win) finish(false); });
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) { win.setAlwaysOnTop(true, 'pop-up-menu'); win.showInactive(); }
    });
    win.webContents.once('did-fail-load', () => finish(false));
    shownCount++;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageHtml(toast, spot.width))}`);
  } catch (err: any) {
    logger.warn('[DesktopNotifier] Affichage impossible :', err?.message);
    current = null;
    setTimeout(showNext, GAP_MS);
  }
}

/** Queue a notification. Beyond the bound, the oldest non-critical waiting item is dropped. */
export function showDesktopNotification(toast: DesktopToast): void {
  if (queue.length >= MAX_QUEUE) {
    const drop = queue.findIndex(q => q.severity !== 'critical');
    queue.splice(drop === -1 ? 0 : drop, 1);
  }
  queue.push(toast);
  showNext();
}

/** Diagnostics for tests: what is on screen and how many were shown since start. */
export function desktopNotifierState(): { visible: boolean; queued: number; shown: number } {
  return { visible: current !== null, queued: queue.length, shown: shownCount };
}

export function closeDesktopNotification(): void {
  queue.length = 0;
  finish(false);
}
