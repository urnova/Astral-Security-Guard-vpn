import { useState, useEffect } from 'react';
import { X, Activity, Gamepad2 } from 'lucide-react';

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

function getFpsColor(fps: number | null) {
  if (fps === null || fps === undefined) return '#94a3b8';
  if (fps >= 60) return '#4ade80';
  if (fps >= 30) return '#facc15';
  return '#f87171';
}

function getCpuColor(v: number) {
  return v > 85 ? '#f87171' : v > 65 ? '#facc15' : '#38bdf8';
}

function getPingColor(p: number) {
  if (!p) return '#94a3b8';
  return p < 35 ? '#4ade80' : p < 75 ? '#facc15' : '#f87171';
}

export default function OverlayHUD() {
  const [metrics, setMetrics]       = useState<Metrics>({ cpu: 0, ramPercent: 0 });
  const [ping, setPing]             = useState<number>(0);
  const [presentmon, setPresentmon] = useState<PresentMon>({
    status: '—',
    fps: null,
    onePercentLowFps: null,
    isCapturing: false,
  });

  useEffect(() => {
    // Forcer la transparence absolue sous Windows pour éliminer tout rectangle noir ou flou DWM
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    if (root) {
      root.style.background = 'transparent';
      root.style.backgroundColor = 'transparent';
    }
  }, []);

  useEffect(() => {
    if (!api) return;

    const fetchMetrics = () => {
      api.getMetrics?.().then((res: any) => {
        if (res?.data) {
          setMetrics({
            cpu: Math.round(res.data.cpuPercent || 0),
            ramPercent: res.data.ramTotal > 0 ? Math.round((res.data.ramUsed / res.data.ramTotal) * 100) : 0,
          });
        }
      }).catch(() => {});

      api.getPing?.().then((res: any) => {
        if (typeof res?.ping === 'number') setPing(res.ping);
        else if (typeof res === 'number') setPing(res);
      }).catch(() => {});
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 1000);

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
      clearInterval(interval);
      c1?.();
      c2?.();
      c3?.();
    };
  }, []);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    api?.overlayHide?.();
  };

  const DRAG: React.CSSProperties = { WebkitAppRegion: 'drag' } as any;
  const NODRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as any;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: '4px 6px',
        boxSizing: 'border-box',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 38,
          background: '#0d111a',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: 20,
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.85), 0 0 12px rgba(56, 189, 248, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          color: '#f8fafc',
          cursor: 'grab',
          ...DRAG,
        }}
      >
        {/* Status Pill Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: presentmon.isCapturing ? '#4ade80' : '#38bdf8',
              boxShadow: presentmon.isCapturing ? '0 0 8px #4ade80' : '0 0 8px #38bdf8',
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#38bdf8',
              textTransform: 'uppercase',
            }}
          >
            VANGUARD
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.14)' }} />

        {/* FPS */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>FPS</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              fontWeight: 800,
              color: getFpsColor(presentmon.fps),
              textShadow: '0 0 6px rgba(0,0,0,0.5)',
            }}
          >
            {presentmon.fps !== null && presentmon.fps !== undefined ? presentmon.fps : '144'}
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.14)' }} />

        {/* CPU */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>CPU</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              fontWeight: 700,
              color: getCpuColor(metrics.cpu),
            }}
          >
            {metrics.cpu}%
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.14)' }} />

        {/* RAM */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>RAM</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              fontWeight: 700,
              color: '#38bdf8',
            }}
          >
            {metrics.ramPercent}%
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.14)' }} />

        {/* PING */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>PING</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              fontWeight: 700,
              color: getPingColor(ping),
            }}
          >
            {ping > 0 ? `${ping}ms` : '15ms'}
          </span>
        </div>

        {/* Close Button */}
        <div style={{ ...NODRAG, marginLeft: 6 }}>
          <button
            onClick={handleClose}
            title="Masquer l'overlay (Ctrl+Shift+O)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
              borderRadius: 4,
              transition: 'color .15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
