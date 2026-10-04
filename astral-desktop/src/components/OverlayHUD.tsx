import { useState, useEffect } from 'react';
import { Activity, X, Minus, Move, Zap } from 'lucide-react';

const api = (window as any).vanguard;

export default function OverlayHUD() {
  const [metrics, setMetrics] = useState({ cpu: 14, ramPercent: 42 });
  const [ping, setPing] = useState<number>(12);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!api) return;

    api.getMetrics?.().then((res: any) => {
      if (res?.data) {
        setMetrics({
          cpu: Math.round(res.data.cpuPercent || 14),
          ramPercent: Math.round((res.data.ramUsed / (res.data.ramTotal || 16)) * 100),
        });
      }
    });

    const cleanupMetrics = api.on('overlay-metrics', (data: any) => {
      if (data) setMetrics(data);
    });

    const cleanupPing = api.on('doctor:ping-update', (data: any) => {
      if (data?.ping) setPing(data.ping);
    });

    return () => {
      cleanupMetrics?.();
      cleanupPing?.();
    };
  }, []);

  const handleClose = () => {
    api?.overlayHide?.();
  };

  const cpuColor = metrics.cpu > 80 ? '#ef4444' : metrics.cpu > 60 ? '#f59e0b' : '#00f5ff';
  const ramColor = metrics.ramPercent > 80 ? '#ef4444' : metrics.ramPercent > 65 ? '#f59e0b' : '#a855f7';
  const pingColor = ping > 80 ? '#ef4444' : ping > 40 ? '#f59e0b' : '#10b981';

  return (
    <div
      style={{
        padding: compact ? '6px 12px' : '12px 14px',
        backgroundColor: 'rgba(5, 7, 14, 0.92)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: '1px solid rgba(0, 245, 255, 0.35)',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.85), 0 0 20px rgba(0, 245, 255, 0.25)',
        borderRadius: 14,
        fontFamily: "'JetBrains Mono', monospace",
        color: '#ffffff',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 0 : 8,
        width: compact ? 340 : 210,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Draggable Titlebar Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: compact ? 0 : 6,
          borderBottom: compact ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          cursor: 'grab',
          // @ts-ignore
          WebkitAppRegion: 'drag',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: 'var(--cyan)' }}>
            VANGUARD HUD
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...({ WebkitAppRegion: 'no-drag' } as any) }}>
          <button
            onClick={() => setCompact(!compact)}
            title={compact ? 'Agrandir' : 'Mode barre compacte'}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer',
              padding: 2,
              lineHeight: 1,
            }}
          >
            <Minus size={12} />
          </button>
          <button
            onClick={handleClose}
            title="Masquer (Ctrl+Shift+O)"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer',
              padding: 2,
              lineHeight: 1,
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Expanded Grid or Compact Strip */}
      {!compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11 }}>
          {/* FPS Row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10 }}>IPS (FPS)</span>
              <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700 }}>INDISPONIBLE</span>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', lineHeight: 1.2 }}>
              FPS indisponibles — PresentMon non installé
            </div>
          </div>

          {/* CPU Row */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10 }}>PROCESSEUR</span>
              <span style={{ color: cpuColor, fontWeight: 700 }}>{metrics.cpu}%</span>
            </div>
            <div style={{ height: 3, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${metrics.cpu}%`, backgroundColor: cpuColor }} />
            </div>
          </div>

          {/* RAM Row */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10 }}>MÉMOIRE VIVE</span>
              <span style={{ color: ramColor, fontWeight: 700 }}>{metrics.ramPercent}%</span>
            </div>
            <div style={{ height: 3, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${metrics.ramPercent}%`, backgroundColor: ramColor }} />
            </div>
          </div>

          {/* Ping Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10 }}>LATENCE</span>
            <span style={{ color: pingColor, fontWeight: 800 }}>{ping} ms</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, paddingTop: 4 }}>
          <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>FPS </span><span style={{ color: '#f59e0b', fontSize: 9 }}>N/D</span></div>
          <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>CPU </span><strong style={{ color: cpuColor }}>{metrics.cpu}%</strong></div>
          <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>RAM </span><strong style={{ color: ramColor }}>{metrics.ramPercent}%</strong></div>
          <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>PING </span><strong style={{ color: pingColor }}>{ping}ms</strong></div>
        </div>
      )}
    </div>
  );
}
