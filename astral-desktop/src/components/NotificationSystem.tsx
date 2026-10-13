import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, ShieldAlert } from 'lucide-react';

const api = (window as any).vanguard;

interface Toast {
  id:       string;
  type:     'ok' | 'warn' | 'bad' | 'info';
  title:    string;
  desc?:    string;
  exiting?: boolean;
}

interface Props {
  dndEnabled: boolean;
}

const ICONS = {
  ok:   <CheckCircle2 size={16} />,
  warn: <AlertTriangle size={16} />,
  bad:  <ShieldAlert size={16} />,
  info: <Info size={16} />,
};
const COLORS = {
  ok:   'var(--ok)',
  warn: 'var(--warn)',
  bad:  'var(--bad)',
  info: 'var(--a1)',
};

export function NotificationSystem({ dndEnabled }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
  }, []);

  const add = useCallback((t: Omit<Toast, 'id' | 'exiting'>) => {
    if (dndEnabled) return;
    const id = Date.now().toString();
    setToasts(prev => [...prev.slice(-4), { ...t, id }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dndEnabled, dismiss]);

  useEffect(() => {
    if (!api?.on) return;
    const handlers: (() => void)[] = [];

    const on = (event: string, fn: (d: any) => void) => {
      const off = api.on(event, fn);
      if (typeof off === 'function') handlers.push(off);
    };

    on('notification:show', (d: any) => {
      add({ type: d.type || 'info', title: d.title || d.message || '', desc: d.desc || d.body });
    });
    on('security:threat-detected', (d: any) => {
      add({ type: 'bad', title: 'Menace détectée', desc: d.name || d.filePath || '' });
    });
    on('security:scan-complete', (d: any) => {
      add({ type: 'ok', title: 'Analyse terminée', desc: `${d.threats || 0} menace(s)` });
    });
    on('vpn:connected', (d: any) => {
      add({ type: 'ok', title: 'VPN connecté', desc: d.serverName || '' });
    });
    on('vpn:disconnected', () => {
      add({ type: 'warn', title: 'VPN déconnecté', desc: 'Le tunnel a été fermé.' });
    });
    on('network:issue', (d: any) => {
      add({ type: 'warn', title: 'Problème réseau détecté', desc: d.message || '' });
    });
    on('gaming:game-started', (d: any) => {
      add({ type: 'info', title: 'Mode Gaming activé', desc: d.gameName || 'Jeu détecté' });
    });
    on('updater:state-changed', (d: any) => {
      if (d?.status === 'available') {
        add({ type: 'info', title: `Mise à jour v${d.updateInfo?.version || '?'}`, desc: 'Disponible — cliquez sur Mises à jour.' });
      }
    });

    return () => handlers.forEach(fn => fn());
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast-item${t.exiting ? ' exiting' : ''}`}
          style={{ borderLeftColor: COLORS[t.type], borderLeftWidth: 2 }}
        >
          <span className="toast-icon" style={{ color: COLORS[t.type] }}>
            {ICONS[t.type]}
          </span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.desc && <div className="toast-desc">{t.desc}</div>}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
