import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

export default function OverlayHUD() {
  const [metrics, setMetrics] = useState({ cpu: 24, ramPercent: 48 });
  const [ping, setPing] = useState<number>(22);
  const [mode, setMode] = useState('GAMING');

  useEffect(() => {
    if (!api) return;

    const cleanupMetrics = api.on('overlay-metrics', (data: any) => {
      if (data) setMetrics(data);
    });

    const cleanupPing = api.on('doctor:ping-update', (data: any) => {
      if (data?.ping) setPing(data.ping);
    });

    const cleanupMode = api.on('mode-changed', (data: any) => {
      if (data?.mode) setMode(data.mode.toUpperCase());
    });

    return () => {
      cleanupMetrics?.();
      cleanupPing?.();
      cleanupMode?.();
    };
  }, []);

  const handleClose = () => {
    api?.overlayHide?.();
  };

  const cpuColor = metrics.cpu > 85 ? 'var(--rose)' : metrics.cpu > 60 ? 'var(--amber)' : 'var(--cyan)';
  const ramColor = metrics.ramPercent > 85 ? 'var(--rose)' : metrics.ramPercent > 70 ? 'var(--amber)' : 'var(--emerald)';
  const pingColor = ping > 150 ? 'var(--rose)' : ping > 70 ? 'var(--amber)' : 'var(--emerald)';

  return (
    <div
      className="overlay-hud"
      style={{
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div className="hud-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="hud-brand">⚡ VANGUARD</span>
          <div className="hud-dot" />
        </div>
        <button
          onClick={handleClose}
          title="Fermer l'overlay (Raccourci: Ctrl+Shift+O)"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: '2px 4px',
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--rose)')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.4)')}
        >
          ✕
        </button>
      </div>

      <div className="hud-row">
        <span>CPU</span>
        <span className="hud-val" style={{ color: cpuColor }}>
          {metrics.cpu}%
        </span>
      </div>
      <div className="hud-bar">
        <div className="hud-bar-fill" style={{ width: `${metrics.cpu}%`, background: cpuColor }} />
      </div>

      <div className="hud-row" style={{ marginTop: 4 }}>
        <span>RAM</span>
        <span className="hud-val" style={{ color: ramColor }}>
          {metrics.ramPercent}%
        </span>
      </div>
      <div className="hud-bar">
        <div className="hud-bar-fill" style={{ width: `${metrics.ramPercent}%`, background: ramColor }} />
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

      <div className="hud-row">
        <span style={{ color: 'rgba(0,212,255,0.7)' }}>PING</span>
        <span className="hud-val" style={{ color: pingColor, fontSize: 10 }}>
          {ping} ms
        </span>
      </div>
      <div className="hud-row">
        <span style={{ color: 'rgba(0,212,255,0.7)' }}>PROFIL</span>
        <span className="hud-val" style={{ color: 'var(--violet)', fontSize: 10 }}>
          {mode}
        </span>
      </div>
    </div>
  );
}
