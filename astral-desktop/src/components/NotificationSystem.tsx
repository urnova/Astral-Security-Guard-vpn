import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, ShieldAlert } from 'lucide-react';

const api = (window as any).vanguard;

interface Toast {
  id:           string;
  type:         'ok' | 'warn' | 'bad' | 'info';
  title:        string;
  desc?:        string;
  actionTarget?: { tab: string };
  exiting?:     boolean;
}

interface Props {
  dndEnabled?: boolean;
  onNavigateTab?: (tab: string) => void;
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

/** Joue un bip court via Web Audio API (ne nécessite aucun fichier audio) */
function playNotificationBeep(type: Toast['type'], volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Fréquence selon le type
    osc.frequency.value = type === 'bad' ? 280 : type === 'warn' ? 440 : 660;
    osc.type = type === 'bad' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume * 0.3, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio non disponible dans cet environnement — silence silencieux
  }
}

export function NotificationSystem({ dndEnabled, onNavigateTab }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
  }, []);

  const add = useCallback((t: Omit<Toast, 'id' | 'exiting'>) => {
    if (dndEnabled) return;
    const id = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev.slice(-4), { ...t, id }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dndEnabled, dismiss]);

  useEffect(() => {
    if (!api?.on) return;
    const handlers: (() => void)[] = [];

    const on = (event: string, fn: (d: any) => void) => {
      const off = api.on(event, fn);
      if (typeof off === 'function') handlers.push(off);
    };

    // NotificationManager central event channel
    on('notification:toast', (d: any) => {
      const severity = d.severity || 'info';
      const type: 'ok' | 'warn' | 'bad' | 'info' =
        severity === 'critical' || severity === 'alert' ? 'bad' :
        severity === 'warning' ? 'warn' :
        d.category === 'security' || d.category === 'scanner' ? 'ok' : 'info';

      add({
        type,
        title: d.title || 'Vanguard Notification',
        desc: d.message || d.desc || '',
        actionTarget: d.actionTarget,
      });

      // Son de notification via Web Audio (si activé dans les préférences)
      if (d.soundEnabled && typeof d.volume === 'number' && d.volume > 0) {
        playNotificationBeep(type, d.volume);
      }
    });

    on('notification:trigger', (d: any) => {
      const t = d.type || (d.critical ? 'threat' : 'info');
      const mappedType: 'ok' | 'warn' | 'bad' | 'info' =
        t === 'threat' || t === 'security_threat' || t === 'download_threat' ? 'bad' :
        t === 'warn' || t === 'warning' || t === 'vpn_disconnected' || t === 'lag_alert' ? 'warn' :
        t === 'security_clean' || t === 'download_safe' || t === 'success' || t === 'ok' ? 'ok' : 'info';

      add({
        type: mappedType,
        title: d.title || 'Notification',
        desc: d.message || d.desc || '',
      });
    });

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
          style={{
            borderLeftColor: COLORS[t.type],
            borderLeftWidth: 2,
            cursor: t.actionTarget?.tab ? 'pointer' : 'default',
          }}
          onClick={() => {
            if (t.actionTarget?.tab && onNavigateTab) {
              onNavigateTab(t.actionTarget.tab);
              dismiss(t.id);
            }
          }}
        >
          <span className="toast-icon" style={{ color: COLORS[t.type] }}>
            {ICONS[t.type]}
          </span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.desc && <div className="toast-desc">{t.desc}</div>}
          </div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(t.id);
            }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
