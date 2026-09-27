import { useState, useEffect, useCallback } from 'react';

const api = (window as any).vanguard;

interface Props { gamingActive: boolean; }

export default function PerformanceTab({ gamingActive }: Props) {
  const [metrics, setMetrics] = useState<any>(null);
  const [gamingOn, setGamingOn] = useState(gamingActive);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState('');
  const [startup, setStartup] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);
  const [boostActive, setBoostActive] = useState(false);
  const [notice, setNotice] = useState('');

  const loadMetrics = useCallback(async () => {
    if (!api) return;
    const m = await api.getMetrics();
    if (m.success) setMetrics(m.data);
  }, []);

  useEffect(() => {
    loadMetrics();
    const id = setInterval(loadMetrics, 5000);
    return () => clearInterval(id);
  }, [loadMetrics]);

  useEffect(() => { setGamingOn(gamingActive); }, [gamingActive]);

  const toggleGamingMode = async () => {
    if (!api) return;
    if (!gamingOn) {
      await api.gamingModeOn();
      await api.networkGamingOn();
      setGamingOn(true);
      setNotice('🎮 Mode Gaming activé — performances maximales !');
    } else {
      await api.gamingModeOff();
      await api.networkGamingOff();
      setGamingOn(false);
      setNotice('Mode Gaming désactivé');
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const runCleanup = async () => {
    if (!api) return;
    setCleaning(true);
    const [ramRes, diskRes] = await Promise.all([api.cleanRam(), api.diskCleanup()]);
    setCleaning(false);
    const freed = diskRes.freedMB || 0;
    setCleanResult(`RAM vidée · ${freed} Mo libérés sur le disque`);
    setTimeout(() => setCleanResult(''), 4000);
  };

  const loadStartup = async () => {
    if (!api) return;
    setLoadingStartup(true);
    const res = await api.getStartup();
    setStartup(res.items || []);
    setLoadingStartup(false);
  };

  const ramPct = metrics ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const diskTotal = metrics ? metrics.diskUsedGB + metrics.diskFreeGB : 0;
  const diskPct = diskTotal ? Math.round((metrics.diskUsedGB / diskTotal) * 100) : 0;

  return (
    <div className="tab-scroll animate-in">
      <div className="tab-header">
        <div>
          <h1 className="tab-title">Performance</h1>
          <p className="tab-subtitle">Booster système · Nettoyage · Démarrage</p>
        </div>
        {gamingOn && <span className="badge badge-cyan badge-dot">GAMING ACTIF</span>}
      </div>

      {notice && (
        <div className="notice notice-success animate-in" style={{ marginBottom: 16 }}>
          {notice}
        </div>
      )}

      {cleanResult && (
        <div className="notice notice-success animate-in" style={{ marginBottom: 16 }}>
          ✅ {cleanResult}
        </div>
      )}

      {/* Gaming Mode Toggle */}
      <div className={`card ${gamingOn ? 'card-glow-cyan' : ''} animate-in`} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              {gamingOn ? '⚡ Mode Gaming Actif' : '🎮 Mode Gaming'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Plan d'alimentation haute perf · Services désactivés · GPU prioritaire · Nagle désactivé
            </p>
          </div>
          <label className="toggle" aria-label="Mode Gaming">
            <input type="checkbox" checked={gamingOn} onChange={toggleGamingMode} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'CPU', val: `${metrics?.cpuPercent ?? 0}%`, pct: metrics?.cpuPercent ?? 0, color: (metrics?.cpuPercent ?? 0) > 80 ? 'red' : 'cyan' },
          { label: 'RAM', val: `${ramPct}%`, pct: ramPct, color: ramPct > 80 ? 'red' : 'green' },
          { label: 'RAM utilisée', val: metrics ? `${metrics.ramUsed} Mo` : '–', pct: 0, color: 'violet' },
          { label: 'Disque C:', val: `${diskPct}%`, pct: diskPct, color: diskPct > 85 ? 'red' : 'orange' },
        ].map((m, i) => (
          <div key={m.label} className="metric-card animate-in" style={{ animationDelay: `${i * 0.04}s` }}>
            <span className="metric-label">{m.label}</span>
            <span className="metric-value" style={{ color: `var(--${m.color})`, fontSize: 24 }}>{m.val}</span>
            {m.pct > 0 && <div className="progress-bar"><div className={`progress-fill progress-fill-${m.color}`} style={{ width: `${m.pct}%` }} /></div>}
          </div>
        ))}
      </div>

      {/* Action Cards */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Cleaner */}
        <div className="card animate-in">
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>🧹 Nettoyage système</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Vide la RAM, efface les fichiers temporaires et nettoie la corbeille.
          </p>
          <button className="btn btn-primary" onClick={runCleanup} disabled={cleaning}>
            {cleaning ? <><div className="spinner" /> Nettoyage...</> : 'Nettoyer maintenant'}
          </button>
        </div>

        {/* Boost */}
        <div className="card animate-in" style={{ animationDelay: '0.05s' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⚡ Booster des perfs</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Optimise les priorités processus et les paramètres réseau avancés.
          </p>
          <button
            className={`btn ${boostActive ? 'btn-ghost' : 'btn-cyan'}`}
            onClick={async () => {
              if (!api) return;
              setBoostActive(true);
              await api.gamingModeOn();
              setNotice('⚡ Boost appliqué !');
              setTimeout(() => { setNotice(''); setBoostActive(false); }, 3000);
            }}
            disabled={boostActive}
          >
            {boostActive ? '✅ Boost actif' : 'Appliquer le boost'}
          </button>
        </div>
      </div>

      {/* Startup Manager */}
      <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>🚀 Programmes au démarrage</p>
          <button className="btn btn-ghost btn-sm" onClick={loadStartup} disabled={loadingStartup}>
            {loadingStartup ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Chargement...</> : 'Charger la liste'}
          </button>
        </div>
        {startup.length === 0 && !loadingStartup && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Cliquez sur "Charger la liste" pour voir les programmes qui démarrent avec Windows.
          </p>
        )}
        {startup.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500 }}>{item.Name}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{item.Command?.slice(0, 60)}</p>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                api?.disableStartup(item.Name);
                setStartup(prev => prev.filter((_, idx) => idx !== i));
              }}
            >
              Désactiver
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
