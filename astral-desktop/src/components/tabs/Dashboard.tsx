import { useState, useEffect, useCallback } from 'react';

const api = (window as any).vanguard;

interface Metrics {
  cpuPercent: number;
  ramTotal: number;
  ramUsed: number;
  diskUsedGB: number;
  diskFreeGB: number;
  uptimeHours: number;
}

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onTabChange: (tab: string) => void;
}

export default function Dashboard({ gamingActive, currentGame, onTabChange }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [secStatus, setSecStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!api) { setLoading(false); return; }
    const [m, s] = await Promise.all([
      api.getMetrics(),
      api.getSecurityStatus(),
    ]);
    if (m.success) setMetrics(m.data);
    if (s.success) setSecStatus(s.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const ramPct = metrics ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const diskTotal = metrics ? metrics.diskUsedGB + metrics.diskFreeGB : 0;
  const diskPct = diskTotal ? Math.round((metrics!.diskUsedGB / diskTotal) * 100) : 0;
  const defenderOk = secStatus?.AntivirusEnabled && secStatus?.RealTimeProtectionEnabled;

  return (
    <div className="tab-scroll animate-in">
      {/* Header */}
      <div className="tab-header">
        <div>
          <h1 className="tab-title">
            {gamingActive ? `🎮 Mode Gaming · ${currentGame || 'Jeu détecté'}` : 'Vue d\'ensemble'}
          </h1>
          <p className="tab-subtitle">
            {gamingActive
              ? 'Toutes les optimisations gaming sont actives'
              : 'Votre système, sous contrôle d\'Astral Vanguard'}
          </p>
        </div>
        {gamingActive && (
          <div className="badge badge-cyan badge-dot" style={{ fontSize: 12 }}>
            GAMING ACTIF
          </div>
        )}
      </div>

      {/* Status Banner */}
      {!loading && (
        <div
          className={`card notice ${defenderOk ? 'notice-success' : 'notice-danger'} animate-in`}
          style={{ marginBottom: 20, animationDelay: '0.05s' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {defenderOk
              ? <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              : <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></>
            }
          </svg>
          <span style={{ fontWeight: 600 }}>
            {defenderOk
              ? 'Système protégé · Windows Defender actif · Surveillance HIDS active'
              : 'Attention · Protection incomplète · Cliquez sur Sécurité pour auditer'}
          </span>
        </div>
      )}

      {/* System Metrics */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          {
            label: 'CPU',
            value: loading ? '–' : `${metrics?.cpuPercent ?? 0}%`,
            sub: 'Charge processeur',
            pct: metrics?.cpuPercent ?? 0,
            color: (metrics?.cpuPercent ?? 0) > 80 ? 'red' : (metrics?.cpuPercent ?? 0) > 60 ? 'orange' : 'cyan',
          },
          {
            label: 'RAM',
            value: loading ? '–' : `${ramPct}%`,
            sub: metrics ? `${metrics.ramUsed} / ${metrics.ramTotal} Mo` : '',
            pct: ramPct,
            color: ramPct > 80 ? 'red' : ramPct > 60 ? 'orange' : 'green',
          },
          {
            label: 'DISQUE',
            value: loading ? '–' : `${diskPct}%`,
            sub: metrics ? `${metrics.diskFreeGB} Go libres` : '',
            pct: diskPct,
            color: diskPct > 90 ? 'red' : diskPct > 70 ? 'orange' : 'violet',
          },
          {
            label: 'UPTIME',
            value: loading ? '–' : `${metrics?.uptimeHours ?? 0}h`,
            sub: 'Depuis dernier démarrage',
            pct: 0,
            color: 'cyan',
          },
        ].map((m, i) => (
          <div
            key={m.label}
            className="metric-card animate-in"
            style={{ animationDelay: `${0.08 + i * 0.05}s` }}
          >
            <span className="metric-label">{m.label}</span>
            <span
              className="metric-value"
              style={{ color: `var(--${m.color})` }}
            >
              {loading ? <span className="skeleton" style={{ width: 60, height: 28, display: 'block' }} /> : m.value}
            </span>
            {m.pct > 0 && (
              <div className="progress-bar">
                <div
                  className={`progress-fill progress-fill-${m.color}`}
                  style={{ width: `${m.pct}%` }}
                />
              </div>
            )}
            <span className="metric-sub">{m.sub}</span>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 16 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Actions rapides & Outils d'Urgence</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none' }}
            onClick={() => onTabChange('settings')}
            title="Purge TCP/IP, flush DNS et stop upload P2P sans redémarrer le PC"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            ⚡ SOS Déblocage Ping (1002ms)
          </button>
          <button className="btn btn-primary" onClick={() => onTabChange('security')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Scanner les menaces
          </button>
          <button className="btn btn-cyan" onClick={() => onTabChange('performance')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            Booster les perfs
          </button>
          <button className="btn btn-ghost" onClick={() => onTabChange('gaming')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 12h4m-2-2v4M15 13h.01M18 11h.01"/>
              <rect x="2" y="7" width="20" height="14" rx="4"/>
            </svg>
            Mode Gaming
          </button>
          <button className="btn btn-ghost" onClick={() => api?.overlayToggle?.()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            HUD Transparent (Ctrl+Shift+O)
          </button>
          <button className="btn btn-ghost" onClick={() => onTabChange('settings')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="6" y1="8" x2="6.01" y2="8" /><line x1="10" y1="8" x2="10.01" y2="8" />
            </svg>
            Docteur Clavier
          </button>
        </div>
      </div>

      {/* Module Status Grid */}
      <div style={{ marginBottom: 8 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>État des modules</p>
      </div>
      <div className="grid-3" style={{ marginBottom: 0 }}>
        {[
          {
            title: 'Sécurité',
            status: defenderOk,
            statusLabel: defenderOk ? 'Protégé' : 'Incomplet',
            desc: 'Windows Defender · HIDS actif',
            color: defenderOk ? 'green' : 'red',
            tab: 'security',
          },
          {
            title: 'Mode Gaming',
            status: gamingActive,
            statusLabel: gamingActive ? 'Actif' + (currentGame ? ` · ${currentGame}` : '') : 'En veille',
            desc: 'Détection auto · Overlay HUD',
            color: gamingActive ? 'cyan' : 'muted',
            tab: 'gaming',
          },
          {
            title: 'VPN Astral',
            status: false,
            statusLabel: 'Déconnecté',
            desc: 'VPN Gate · OpenVPN gratuit',
            color: 'muted',
            tab: 'vpn',
          },
        ].map((mod, i) => (
          <button
            key={mod.title}
            className="card animate-in"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              animationDelay: `${0.2 + i * 0.05}s`,
              borderColor: mod.status ? `rgba(var(--${mod.color}),0.3)` : undefined,
            }}
            onClick={() => onTabChange(mod.tab)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.title}</span>
              <span className={`badge badge-${mod.color} badge-dot`}>{mod.statusLabel}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{mod.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
