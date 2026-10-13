import { useState, useEffect } from 'react';
import { X, Minimize2, Activity, Wifi, Cpu, Layers } from 'lucide-react';

const api = (window as any).vanguard;

interface Metrics {
  cpu: number;
  ramPercent: number;
}

interface PresentMon {
  status: string;
  fps: number | null;
  onePercentLowFps: number | null;
  isCapturing: boolean;
}

function MetricBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ width: 44, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

function getCpuColor(v: number) {
  return v > 85 ? 'var(--bad)' : v > 65 ? 'var(--warn)' : 'var(--ok)';
}

function getRamColor(v: number) {
  return v > 85 ? 'var(--bad)' : v > 70 ? 'var(--warn)' : 'var(--a1)';
}

function getFpsColor(fps: number | null) {
  if (fps === null || fps === undefined) return 'var(--muted)';
  if (fps >= 60) return 'var(--ok)';
  if (fps >= 30) return 'var(--warn)';
  return 'var(--bad)';
}

export default function OverlayHUD() {
  const [metrics, setMetrics]       = useState<Metrics>({ cpu: 0, ramPercent: 0 });
  const [ping, setPing]             = useState<number>(0);
  const [compact, setCompact]       = useState(false);
  const [presentmon, setPresentmon] = useState<PresentMon>({
    status: '—',
    fps: null,
    onePercentLowFps: null,
    isCapturing: false,
  });

  useEffect(() => {
    if (!api) return;

    api.getMetrics?.().then((res: any) => {
      if (res?.data) {
        setMetrics({
          cpu: Math.round(res.data.cpuPercent || 0),
          ramPercent: res.data.ramTotal > 0 ? Math.round((res.data.ramUsed / res.data.ramTotal) * 100) : 0,
        });
      }
    }).catch(() => {});

    api.getPresentMonStatus?.().then((res: any) => {
      if (res?.data) setPresentmon(res.data);
    }).catch(() => {});

    const c1 = api.on?.('overlay-metrics', (d: any) => {
      if (d) setMetrics(d);
    });
    const c2 = api.on?.('doctor:ping-update', (d: any) => {
      if (d?.ping) setPing(d.ping);
    });
    const c3 = api.on?.('overlay-presentmon', (d: any) => {
      if (d) setPresentmon(d);
    });

    return () => {
      c1?.();
      c2?.();
      c3?.();
    };
  }, []);

  const handleClose = () => api?.overlayHide?.();

  const DRAG: React.CSSProperties = { WebkitAppRegion: 'drag' } as any;
  const NODRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as any;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        pointerEvents: 'none',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'rgba(19, 21, 24, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
          minWidth: compact ? 120 : 160,
          pointerEvents: 'auto',
          userSelect: 'none',
          overflow: 'hidden',
          fontFamily: 'Inter, -apple-system, sans-serif',
          color: 'var(--text)',
          ...DRAG,
        }}
      >
        {/* Header Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)',
            ...NODRAG,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: presentmon.isCapturing ? 'var(--ok)' : 'var(--a1)',
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: 'var(--text)',
                textTransform: 'uppercase',
              }}
            >
              Vanguard HUD
            </span>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setCompact(c => !c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 4,
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
              title={compact ? 'Développer' : 'Compacter'}
            >
              <Minimize2 size={10} />
            </button>
            <button
              onClick={handleClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 4,
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
              title="Fermer"
            >
              <X size={10} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: compact ? '8px 10px' : '10px 12px', ...NODRAG }}>
          {/* FPS Counter */}
          {presentmon.fps !== null && presentmon.fps !== undefined ? (
            <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                  FPS
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 22,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: getFpsColor(presentmon.fps),
                  }}
                >
                  {presentmon.fps}
                </span>
              </div>
              {!compact && presentmon.onePercentLowFps !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9 }}>
                  <span style={{ color: 'var(--dim)' }}>1% Low</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: getFpsColor(presentmon.onePercentLowFps) }}>
                    {presentmon.onePercentLowFps} fps
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* CPU Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.04em' }}>CPU</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!compact && <MetricBar value={metrics.cpu} color={getCpuColor(metrics.cpu)} />}
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: getCpuColor(metrics.cpu) }}>
                {metrics.cpu}%
              </span>
            </div>
          </div>

          {/* RAM Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.04em' }}>RAM</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!compact && <MetricBar value={metrics.ramPercent} color={getRamColor(metrics.ramPercent)} />}
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: getRamColor(metrics.ramPercent) }}>
                {metrics.ramPercent}%
              </span>
            </div>
          </div>

          {/* Latency (Ping) Row */}
          {ping > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.04em' }}>PING</span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  color: ping < 35 ? 'var(--ok)' : ping < 75 ? 'var(--warn)' : 'var(--bad)',
                }}
              >
                {ping} ms
              </span>
            </div>
          )}
        </div>

        {/* Capture state footer */}
        {!compact && !presentmon.isCapturing && (
          <div
            style={{
              padding: '4px 10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              fontSize: 9,
              color: 'var(--dim)',
              textAlign: 'center',
            }}
          >
            {presentmon.status || 'En attente de jeu'}
          </div>
        )}
      </div>
    </div>
  );
}
