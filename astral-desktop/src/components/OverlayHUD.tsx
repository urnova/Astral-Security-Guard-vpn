import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const api = (window as any).vanguard;

interface Metrics {
  cpu: number;
  gpu?: number | null;
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

function getUsageColor(v: number) {
  return v > 85 ? '#f87171' : v > 65 ? '#facc15' : '#38bdf8';
}

function getPingColor(p: number) {
  if (!p) return '#94a3b8';
  return p < 35 ? '#4ade80' : p < 75 ? '#facc15' : '#f87171';
}

export default function OverlayHUD() {
  const [metrics, setMetrics]       = useState<Metrics>({ cpu: 0, gpu: null, ramPercent: 0 });
  const [ping, setPing]             = useState<number>(0);
  const [presentmon, setPresentmon] = useState<PresentMon>({
    status: '—',
    fps: null,
    onePercentLowFps: null,
    isCapturing: false,
  });

  useEffect(() => {
    // Forcer la transparence absolue sous Windows pour éliminer tout flou ou ombre parasite
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
          const cpu = Math.round(res.data.cpuPercent || 0);
          const ram = res.data.ramTotal > 0 ? Math.round((res.data.ramUsed / res.data.ramTotal) * 100) : 0;
          const gpu = typeof res.data.gpuUtilization === 'number' ? Math.round(res.data.gpuUtilization) : null;
          setMetrics({ cpu, gpu, ramPercent: ram });
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

    const c1 = api.on?.('overlay:metrics', (d: any) => {
      if (d) {
        setMetrics(prev => ({
          cpu: typeof d.cpu === 'number' ? Math.round(d.cpu) : prev.cpu,
          gpu: typeof d.gpu === 'number' ? Math.round(d.gpu) : prev.gpu,
          ramPercent: typeof d.ramPercent === 'number' ? Math.round(d.ramPercent) : prev.ramPercent,
        }));
      }
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
    api?.hudToggle?.();
  };

  const handleMouseEnter = () => {
    api?.setIgnoreMouseEvents?.(false);
  };

  const handleMouseLeave = () => {
    api?.setIgnoreMouseEvents?.(true, { forward: true });
  };

  const DRAG: React.CSSProperties = { WebkitAppRegion: 'drag' } as any;
  const NODRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as any;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: '2px 4px',
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
          height: 34,
          background: '#0d111a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 8,
          boxShadow: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          color: '#f8fafc',
          cursor: 'grab',
          ...DRAG,
        }}
      >
        {/* Status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: presentmon.isCapturing ? '#4ade80' : '#38bdf8',
            }}
          />
        </div>

        {/* FPS */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>FPS</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              fontWeight: 800,
              color: getFpsColor(presentmon.fps),
            }}
          >
            {presentmon.fps !== null && presentmon.fps !== undefined ? presentmon.fps : '—'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)' }} />

        {/* CPU */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>CPU</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12.5,
              fontWeight: 700,
              color: getUsageColor(metrics.cpu),
            }}
          >
            {metrics.cpu > 0 ? `${metrics.cpu}%` : '—'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)' }} />

        {/* GPU */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>GPU</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12.5,
              fontWeight: 700,
              color: metrics.gpu !== null && metrics.gpu !== undefined ? getUsageColor(metrics.gpu) : '#94a3b8',
            }}
          >
            {metrics.gpu !== null && metrics.gpu !== undefined ? `${metrics.gpu}%` : '—'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)' }} />

        {/* RAM */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>RAM</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12.5,
              fontWeight: 700,
              color: '#38bdf8',
            }}
          >
            {metrics.ramPercent > 0 ? `${metrics.ramPercent}%` : '—'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)' }} />

        {/* PING */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>PING</span>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12.5,
              fontWeight: 700,
              color: getPingColor(ping),
            }}
          >
            {ping > 0 ? `${ping}ms` : '—'}
          </span>
        </div>

        {/* Close Button */}
        <div style={{ ...NODRAG, marginLeft: 4 }}>
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
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
