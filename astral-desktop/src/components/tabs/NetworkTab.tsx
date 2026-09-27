import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

interface SpeedResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
}

interface Props { gamingActive: boolean; }

export default function NetworkTab({ gamingActive }: Props) {
  const [testing, setTesting] = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [netProcs, setNetProcs] = useState<any[]>([]);
  const [dns, setDns] = useState<'cloudflare' | 'google' | 'auto'>('auto');
  const [gamingNet, setGamingNet] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getAdapters().then((r: any) => setAdapters(r.adapters || []));

    const cleanup = api.on('network-event', (event: any) => {
      if (event.type === 'speedtest-complete') {
        setSpeedResult(event.result);
        setTesting(false);
      }
    });
    return cleanup;
  }, []);

  const runSpeedtest = async () => {
    if (!api) return;
    setTesting(true);
    setSpeedResult(null);
    api.speedtest();
  };

  const applyDns = async () => {
    if (!api) return;
    const res = await api.setDns(dns);
    setNotice(res.success ? `✅ DNS configuré sur ${dns}` : '❌ Erreur lors de la configuration DNS');
    setTimeout(() => setNotice(''), 3000);
  };

  const toggleGamingNet = async () => {
    if (!api) return;
    if (!gamingNet) {
      await api.networkGamingOn();
      setGamingNet(true);
      setNotice('⚡ Optimisation réseau gaming activée');
    } else {
      await api.networkGamingOff();
      setGamingNet(false);
      setNotice('Optimisation réseau désactivée');
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const loadProcesses = async () => {
    if (!api) return;
    const res = await api.getNetworkProcesses();
    setNetProcs(res.processes || []);
  };

  const getSpeedColor = (mbps: number) => {
    if (mbps >= 100) return 'green';
    if (mbps >= 30) return 'cyan';
    if (mbps >= 10) return 'orange';
    return 'red';
  };

  return (
    <div className="tab-scroll animate-in">
      <div className="tab-header">
        <div>
          <h1 className="tab-title">Réseau & Wi-Fi</h1>
          <p className="tab-subtitle">Speed test · Optimisation · DNS · Mode gaming réseau</p>
        </div>
        {gamingNet && <span className="badge badge-cyan badge-dot">RÉSEAU OPTIMISÉ</span>}
      </div>

      {notice && <div className="notice notice-success animate-in" style={{ marginBottom: 16 }}>{notice}</div>}

      {/* Speed Test */}
      <div className="card card-glow-cyan animate-in" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>🌐 Test de vitesse</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Powered by Fast.com · Aucune clé API requise</p>
          </div>
          <button className="btn btn-cyan" onClick={runSpeedtest} disabled={testing}>
            {testing ? <><div className="spinner" /> Test en cours...</> : 'Lancer le test'}
          </button>
        </div>

        {speedResult && (
          <div className="grid-4 animate-in">
            {[
              { label: 'Téléchargement', val: `${speedResult.downloadMbps}`, unit: 'Mbps', color: getSpeedColor(speedResult.downloadMbps) },
              { label: 'Upload', val: `${speedResult.uploadMbps}`, unit: 'Mbps', color: getSpeedColor(speedResult.uploadMbps) },
              { label: 'Ping', val: `${speedResult.pingMs}`, unit: 'ms', color: speedResult.pingMs < 20 ? 'green' : speedResult.pingMs < 60 ? 'cyan' : speedResult.pingMs < 120 ? 'orange' : 'red' },
              { label: 'Gigue', val: `${speedResult.jitterMs}`, unit: 'ms', color: speedResult.jitterMs < 5 ? 'green' : 'orange' },
            ].map((m) => (
              <div key={m.label} className="metric-card" style={{ padding: 14 }}>
                <span className="metric-label">{m.label}</span>
                <span className="metric-value" style={{ color: `var(--${m.color})`, fontSize: 26 }}>
                  {m.val}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}> {m.unit}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {testing && !speedResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Téléchargement', 'Upload', 'Ping', 'Gigue'].map((label) => (
              <div key={label} className="skeleton" style={{ height: 70, borderRadius: 10 }} />
            ))}
          </div>
        )}
      </div>

      {/* Two columns */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Gaming Network Mode */}
        <div className={`card ${gamingNet ? 'card-glow-cyan' : ''}`}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⚡ Optimisation Gaming</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Désactive l'algorithme Nagle, active QoS gaming, priorise la bande passante.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: gamingNet ? 'var(--cyan)' : 'var(--text-muted)' }}>
              {gamingNet ? 'Latence minimisée' : 'Mode standard'}
            </span>
            <label className="toggle">
              <input type="checkbox" checked={gamingNet} onChange={toggleGamingNet} />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </div>
        </div>

        {/* DNS Optimizer */}
        <div className="card">
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>🔧 Optimisation DNS</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Change le DNS pour réduire la latence de résolution.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { val: 'cloudflare' as const, label: '☁️ Cloudflare', sub: '1.1.1.1' },
              { val: 'google' as const, label: '🔍 Google', sub: '8.8.8.8' },
              { val: 'auto' as const, label: '🔄 Auto DHCP', sub: 'Default' },
            ].map((d) => (
              <button
                key={d.val}
                onClick={() => setDns(d.val)}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  borderRadius: 8,
                  border: `1px solid ${dns === d.val ? 'var(--border-cyan)' : 'var(--border)'}`,
                  background: dns === d.val ? 'rgba(0,212,255,0.08)' : 'var(--bg-card)',
                  color: dns === d.val ? 'var(--cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: 'center',
                  transition: 'var(--transition)',
                }}
              >
                <div>{d.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7, fontFamily: 'monospace' }}>{d.sub}</div>
              </button>
            ))}
          </div>
          <button className="btn btn-cyan btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={applyDns}>
            Appliquer le DNS
          </button>
        </div>
      </div>

      {/* Adapters */}
      {adapters.length > 0 && (
        <div className="card animate-in" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🔌 Adaptateurs réseau actifs</p>
          {adapters.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{a.Name}</span>
              <div style={{ display: 'flex', gap: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                <span>{a.LinkSpeed}</span>
                <span className="mono">{a.MacAddress}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Network Processes */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>📊 Processus réseau actifs</p>
          <button className="btn btn-ghost btn-sm" onClick={loadProcesses}>Actualiser</button>
        </div>
        {netProcs.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cliquez sur Actualiser pour voir les connexions actives.</p>
        ) : (
          netProcs.slice(0, 10).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ fontWeight: 500 }}>{p.name || `PID ${p.pid}`}</span>
              <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.remote}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
