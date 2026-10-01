import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

export default function OverlayHUD() {
  const [metrics, setMetrics] = useState({ cpu: 0, ramPercent: 0 });
  const [ping, setPing] = useState<number>(0);
  const [mode, setMode] = useState('E-SPORT');

  useEffect(() => {
    if (!api) return;

    api.getMetrics?.().then((res: any) => {
      if (res?.data) {
        setMetrics({
          cpu: Math.round(res.data.cpuPercent || 0),
          ramPercent: Math.round((res.data.ramUsed / (res.data.ramTotal || 1)) * 100),
        });
      }
    });

    api.getSystemMode?.().then((m: string) => {
      if (m) setMode(m.toUpperCase());
    });

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

  const cpuColor = metrics.cpu > 80 ? '#ff4b4b' : metrics.cpu > 55 ? '#ff9f1c' : '#00d4ff';
  const ramColor = metrics.ramPercent > 80 ? '#ff4b4b' : metrics.ramPercent > 65 ? '#ff9f1c' : '#a855f7';
  const pingColor = ping > 120 ? '#ff4b4b' : ping > 60 ? '#ff9f1c' : '#10d9a0';

  return (
    <div
      style={{
        width: 220,
        padding: '14px 16px',
        backgroundColor: 'rgba(6, 6, 20, 0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(0, 212, 255, 0.35)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 15px rgba(0, 212, 255, 0.2)',
        borderRadius: 14,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: '#ffffff',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#00d4ff' }}>
            ⚡ VANGUARD HUD
          </span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10d9a0', boxShadow: '0 0 8px #10d9a0' }} />
        </div>
        <button
          onClick={handleClose}
          title="Fermer HUD (Ctrl+Shift+O)"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* CPU Row */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>PROCESSEUR</span>
          <span style={{ fontWeight: 800, color: cpuColor }}>{metrics.cpu}%</span>
        </div>
        <div style={{ width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${metrics.cpu}%`, height: '100%', backgroundColor: cpuColor, boxShadow: `0 0 6px ${cpuColor}`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* RAM Row */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>MÉMOIRE RAM</span>
          <span style={{ fontWeight: 800, color: ramColor }}>{metrics.ramPercent}%</span>
        </div>
        <div style={{ width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${metrics.ramPercent}%`, height: '100%', backgroundColor: ramColor, boxShadow: `0 0 6px ${ramColor}`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Ping & Mode Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.08)', fontSize: 10 }}>
        <div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>PING : </span>
          <span style={{ fontWeight: 800, color: pingColor }}>{ping} ms</span>
        </div>
        <div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>MODE : </span>
          <span style={{ fontWeight: 800, color: '#a855f7' }}>{mode}</span>
        </div>
      </div>
    </div>
  );
}
