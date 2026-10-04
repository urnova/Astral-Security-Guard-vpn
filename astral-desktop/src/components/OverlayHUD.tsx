import { useState, useEffect } from 'react';
import { X, Minus, Maximize2, Zap } from 'lucide-react';

const api = (window as any).vanguard;

export default function OverlayHUD() {
  const [metrics, setMetrics] = useState({ cpu: 14, ramPercent: 42 });
  const [ping, setPing] = useState<number>(12);
  const [compact, setCompact] = useState(false);
  const [presentmon, setPresentmon] = useState<{
    status: string;
    fps: number | null;
    onePercentLowFps: number | null;
    isCapturing: boolean;
  }>({
    status: 'Indisponible',
    fps: null,
    onePercentLowFps: null,
    isCapturing: false,
  });

  useEffect(() => {
    if (!api) return;

    api.getMetrics?.().then((res: any) => {
      if (res?.data) {
        setMetrics({
          cpu: Math.round(res.data.cpuPercent || 14),
          ramPercent: Math.round((res.data.ramUsed / (res.data.ramTotal || 16)) * 100),
        });
      }
    }).catch(() => {});

    api.getPresentMonStatus?.().then((res: any) => {
      if (res?.data) {
        setPresentmon(res.data);
      }
    }).catch(() => {});

    const cleanupMetrics = api.on('overlay-metrics', (data: any) => {
      if (data) setMetrics(data);
    });

    const cleanupPing = api.on('doctor:ping-update', (data: any) => {
      if (data?.ping) setPing(data.ping);
    });

    const cleanupPm = api.on('overlay-presentmon', (data: any) => {
      if (data) setPresentmon(data);
    });

    return () => {
      cleanupMetrics?.();
      cleanupPing?.();
      cleanupPm?.();
    };
  }, []);

  const handleClose = () => {
    api?.overlayHide?.();
  };

  const cpuColor = metrics.cpu > 80 ? '#f87171' : metrics.cpu > 60 ? '#fbbf24' : '#38bdf8';
  const ramColor = metrics.ramPercent > 80 ? '#f87171' : metrics.ramPercent > 65 ? '#fbbf24' : '#818cf8';
  const pingColor = ping > 80 ? '#f87171' : ping > 40 ? '#fbbf24' : '#34d399';

  return (
    <div
      style={{
        padding: compact ? '7px 14px' : '14px 16px',
        backgroundColor: 'rgba(9, 13, 22, 0.90)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        fontFamily: "'JetBrains Mono', -apple-system, monospace",
        color: '#f8fafc',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 0 : 10,
        width: compact ? 360 : 230,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Draggable Titlebar Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: compact ? 0 : 8,
          borderBottom: compact ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          cursor: 'grab',
          // @ts-ignore
          WebkitAppRegion: 'drag',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981',
            }}
          />
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#f8fafc',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            VANGUARD HUD
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...({ WebkitAppRegion: 'no-drag' } as any) }}>
          <button
            onClick={() => setCompact(!compact)}
            title={compact ? 'Agrandir' : 'Mode bandeau compact'}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.45)',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            {compact ? <Maximize2 size={11} /> : <Minus size={11} />}
          </button>
          <button
            onClick={handleClose}
            title="Masquer (Ctrl+Shift+O)"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.45)',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Main metrics display */}
      {!compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 11.5 }}>
          {/* FPS & 1% Low Section */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontWeight: 600 }}>IPS (FPS)</span>
              {presentmon.isCapturing && presentmon.fps !== null ? (
                <span style={{ color: '#10b981', fontSize: 13, fontWeight: 800 }}>
                  {Math.round(presentmon.fps)} IPS
                </span>
              ) : (
                <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700 }}>INDISPONIBLE</span>
              )}
            </div>

            {presentmon.isCapturing && presentmon.onePercentLowFps !== null ? (
              <div style={{ fontSize: 9.5, color: 'rgba(255, 255, 255, 0.65)', marginTop: 3 }}>
                1% Low : {Math.round(presentmon.onePercentLowFps)} IPS
              </div>
            ) : (
              <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', marginTop: 3, lineHeight: 1.3 }}>
                FPS indisponibles — PresentMon non installé
              </div>
            )}
          </div>

          {/* CPU Metric */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontWeight: 600 }}>PROCESSEUR</span>
              <span style={{ color: cpuColor, fontWeight: 700 }}>{metrics.cpu}%</span>
            </div>
            <div style={{ height: 3, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${metrics.cpu}%`, backgroundColor: cpuColor, transition: 'width 0.2s ease' }} />
            </div>
          </div>

          {/* RAM Metric */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontWeight: 600 }}>MÉMOIRE VIVE</span>
              <span style={{ color: ramColor, fontWeight: 700 }}>{metrics.ramPercent}%</span>
            </div>
            <div style={{ height: 3, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${metrics.ramPercent}%`, backgroundColor: ramColor, transition: 'width 0.2s ease' }} />
            </div>
          </div>

          {/* Latency Metric */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontWeight: 600 }}>LATENCE</span>
            <span style={{ color: pingColor, fontWeight: 800 }}>{ping} ms</span>
          </div>
        </div>
      ) : (
        /* Compact horizontal ribbon */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, gap: 12, paddingTop: 4 }}>
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 9.5 }}>FPS </span>
            {presentmon.isCapturing && presentmon.fps !== null ? (
              <strong style={{ color: '#10b981' }}>{Math.round(presentmon.fps)}</strong>
            ) : (
              <span style={{ color: '#f59e0b' }}>N/D</span>
            )}
          </div>
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 9.5 }}>CPU </span>
            <strong style={{ color: cpuColor }}>{metrics.cpu}%</strong>
          </div>
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 9.5 }}>RAM </span>
            <strong style={{ color: ramColor }}>{metrics.ramPercent}%</strong>
          </div>
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 9.5 }}>PING </span>
            <strong style={{ color: pingColor }}>{ping}ms</strong>
          </div>
        </div>
      )}
    </div>
  );
}
