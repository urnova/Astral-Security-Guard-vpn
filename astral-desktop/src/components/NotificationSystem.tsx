import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, ShieldAlert } from 'lucide-react';

const api = (window as any).vanguard;
type ToastType = 'ok' | 'warn' | 'bad' | 'info';
interface Toast {
  id: string;
  type: ToastType;
  title: string;
  desc?: string;
  actionTarget?: { tab: string };
}
interface Props {
  dndEnabled?: boolean;
  onNavigateTab?: (tab: string) => void;
}
interface Incoming extends Omit<Toast, 'id'> {
  id?: string;
  operationId?: string;
  critical?: boolean;
  soundEnabled?: boolean;
  volume?: number;
}
const ICONS = {
  ok: <CheckCircle2 size={16} />,
  warn: <AlertTriangle size={16} />,
  bad: <ShieldAlert size={16} />,
  info: <Info size={16} />,
};
const COLORS = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--a1)' };
const ALLOWED_TABS = new Set(['dashboard', 'security', 'performance', 'gaming', 'network', 'vpn', 'vault', 'settings']);
const MAX_TOASTS = 4;

function toastType(d: any): ToastType {
  if (d?.critical || d?.severity === 'critical' || d?.severity === 'alert') return 'bad';
  if (d?.severity === 'warning') return 'warn';
  const type = d?.type;
  if (['bad', 'threat', 'security_threat', 'download_threat'].includes(type)) return 'bad';
  if (['warn', 'warning', 'vpn_disconnected', 'lag_alert'].includes(type)) return 'warn';
  if (['ok', 'success', 'security_clean', 'download_safe'].includes(type)) return 'ok';
  return 'info';
}

function playNotificationBeep(type: ToastType, volume: number) {
  if (!Number.isFinite(volume) || volume <= 0) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'bad' ? 280 : type === 'warn' ? 440 : 660;
    osc.type = type === 'bad' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(Math.min(1, volume) * 0.3, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.onended = () => { void ctx.close().catch(() => {}); };
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.26);
  } catch {}
}

export function NotificationSystem({ dndEnabled, onNavigateTab }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const recent = useRef(new Map<string, { id: string; at: number }>());
  const active = useRef(new Set<string>());
  const sequence = useRef(0);
  const dnd = useRef(dndEnabled);
  dnd.current = dndEnabled;

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    active.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback((incoming: Incoming) => {
    if (dnd.current && !incoming.critical) return;
    const now = Date.now();
    for (const [key, value] of recent.current) {
      if (now - value.at > 1500) recent.current.delete(key);
    }
    const title = String(incoming.title || 'Vanguard Core').slice(0, 300);
    const desc = String(incoming.desc || '').slice(0, 500);
    const fingerprint = JSON.stringify([incoming.type, title, desc]);
    const duplicate = recent.current.get(fingerprint);
    const explicitId = incoming.operationId || incoming.id;
    const id = explicitId || duplicate?.id || `toast-${now}-${++sequence.current}`;
    // A dismissed duplicate must not reopen immediately through a second event channel.
    if (duplicate && !explicitId && !active.current.has(id)) return;
    const wasActive = active.current.has(id);
    const tab = incoming.actionTarget?.tab;
    const toast: Toast = {
      id, type: incoming.type, title, desc,
      actionTarget: tab && ALLOWED_TABS.has(tab) ? { tab } : undefined,
    };
    recent.current.set(fingerprint, { id, at: now });
    if (!wasActive && active.current.size >= MAX_TOASTS) {
      const oldest = active.current.values().next().value;
      if (oldest !== undefined) dismiss(oldest);
    }
    active.current.add(id);
    setToasts(prev => {
      const existing = prev.find(t => t.id === id);
      return existing ? prev.map(t => t.id === id ? toast : t) : [...prev, toast].slice(-MAX_TOASTS);
    });
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.set(id, setTimeout(() => dismiss(id), incoming.type === 'bad' ? 10000 : 6000));
    if (!wasActive && !duplicate && incoming.soundEnabled && !dnd.current) {
      playNotificationBeep(incoming.type, incoming.volume ?? 0);
    }
  }, [dismiss]);

  useEffect(() => {
    if (!api?.on) return;
    const handlers: (() => void)[] = [];
    const on = (event: string, fn: (d: any) => void) => {
      const off = api.on(event, fn);
      if (typeof off === 'function') handlers.push(off);
    };
    const receive = (d: any) => {
      if (!d || typeof d !== 'object') return;
      add({
        id: typeof d.id === 'string' ? d.id : undefined,
        operationId: typeof d.operationId === 'string' ? d.operationId : undefined,
        type: toastType(d), title: d.title || 'Vanguard Core',
        desc: d.message || d.desc || d.body || '', actionTarget: d.actionTarget,
        critical: d.critical === true || d.severity === 'critical',
        soundEnabled: d.soundEnabled === true,
        volume: typeof d.volume === 'number' ? d.volume : 0,
      });
    };
    on('notification:toast', receive);
    on('notification:trigger', receive);
    on('notification:show', receive);
    // Legacy producers remain supported until their central routing is migrated.
    on('security:threat-detected', d => add({ type: 'bad', title: 'Menace détectée', desc: d?.name || d?.filePath || '', actionTarget: { tab: 'security' } }));
    on('security:scan-complete', d => add({ type: d?.threats > 0 ? 'warn' : 'ok', title: 'Analyse terminée', desc: `${d?.threats || 0} menace(s) signalée(s)`, actionTarget: { tab: 'security' } }));
    on('vpn:connected', d => add({ type: 'ok', title: 'VPN connecté', desc: d?.serverName || '', actionTarget: { tab: 'vpn' } }));
    on('vpn:disconnected', () => add({ type: 'warn', title: 'VPN déconnecté', desc: 'Le tunnel a été fermé.', actionTarget: { tab: 'vpn' } }));
    on('network:issue', d => add({ type: 'warn', title: 'Problème réseau détecté', desc: d?.message || '', actionTarget: { tab: 'network' } }));
    on('gaming:game-started', d => add({ type: 'info', title: 'Mode jeu activé', desc: d?.gameName || 'Jeu détecté', actionTarget: { tab: 'gaming' } }));
    on('updater:state-changed', d => {
      if (d?.status === 'available') add({ id: `update-${d.updateInfo?.version || 'available'}`, type: 'info', title: 'Mise à jour disponible', desc: d.updateInfo?.version ? `Version ${d.updateInfo.version}` : 'Consultez les mises à jour.', actionTarget: { tab: 'settings' } });
    });
    return () => {
      handlers.forEach(off => off());
      timers.current.forEach(timer => clearTimeout(timer));
      timers.current.clear();
      recent.current.clear();
      active.current.clear();
    };
  }, [add]);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="region" aria-label="Notifications" style={{ maxWidth: 'calc(100vw - 32px)' }}>
      {toasts.map(t => (
        <div key={t.id} className="toast-item" style={{ background: 'var(--surface, var(--bg))', color: 'var(--text)', border: '1px solid var(--border)', borderLeft: `2px solid ${COLORS[t.type]}`, width: '100%', boxSizing: 'border-box', alignItems: 'flex-start' }}>
          <span className="toast-icon" style={{ color: COLORS[t.type], flexShrink: 0 }} aria-hidden="true">{ICONS[t.type]}</span>
          <div className="toast-body" role="status" aria-live="polite" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <div className="toast-title" style={{ color: 'var(--text)' }}>{t.title}</div>
            {t.desc && <div className="toast-desc" style={{ color: 'var(--muted)' }}>{t.desc}</div>}
            {t.actionTarget && onNavigateTab && <button type="button" className="btn-ghost" onClick={() => { onNavigateTab(t.actionTarget!.tab); dismiss(t.id); }} style={{ marginTop: 6, color: 'var(--a1)', padding: '3px 0' }}>Afficher</button>}
          </div>
          <button type="button" className="toast-close" aria-label="Fermer la notification" onClick={() => dismiss(t.id)} style={{ color: 'var(--muted)', flexShrink: 0 }}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
