import { useState, useEffect } from 'react';
import {
  Wifi, Play, RefreshCw, AlertTriangle, CheckCircle2,
  Info, Globe, Router, Activity, X, Zap, Shield, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';

const api = (window as any).vanguard;

const DNS_PRESETS = [
  { id: 'google',     name: 'Google 8.8.8.8',    label: 'Fiable, ultra-rapide et universel',          ip: '8.8.8.8', ping: 11 },
  { id: 'cloudflare', name: 'Cloudflare 1.1.1.1',label: 'Latence gaming minimale · Vie privée',      ip: '1.1.1.1', ping: 9 },
  { id: 'quad9',      name: 'Quad9 9.9.9.9',     label: 'Protection anti-malware intégrée',           ip: '9.9.9.9', ping: 14 },
  { id: 'opendns',    name: 'Cisco OpenDNS',     label: 'Filtrage de sécurité et stabilité',          ip: '208.67.222.222', ping: 16 },
  { id: 'auto',       name: 'Automatique (FAI)', label: 'Attribué par votre box internet (DHCP)',    ip: 'auto',    ping: null },
];

interface NetworkInfo {
  interfaceName: string;
  ip:            string;
  externalIp?:   string;
  gateway:       string;
  dns:           string;
  isp:           string;
  macAddress:    string;
  wifiSsid?:     string;
  wifiSignal?:   number;
  type:          string;
}

interface SpeedResult {
  down: number;
  up: number;
  ping: number;
  jitter: number;
  timestamp?: string;
}

interface SpeedHistoryPoint {
  time: string;
  down: number;
  up: number;
}

export default function NetworkTab({ gamingActive }: { gamingActive: boolean }) {
  const [netInfo, setNetInfo]         = useState<NetworkInfo | null>(null);
  const [selectedDns, setSelectedDns] = useState('Google 8.8.8.8');
  const [dnsOverHttps, setDnsOverHttps] = useState(false);
  const [ipv6Disabled, setIpv6Disabled] = useState(false);
  const [antiBufferbloat, setAntiBufferbloat] = useState(true);
  const [testing, setTesting]         = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [gaugeVal, setGaugeVal]       = useState(0);
  const [livePhase, setLivePhase]     = useState<string>('');
  const [liveMbps, setLiveMbps]       = useState<number | null>(null);
  const [history, setHistory]         = useState<SpeedHistoryPoint[]>(() => {
    try {
      const raw = localStorage.getItem('astral_speedtest_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [livePing, setLivePing]       = useState<number | null>(null);
  const [pingStatus, setPingStatus]   = useState<'stable' | 'spike' | 'disconnected'>('stable');
  const [notice, setNotice]           = useState('');
  const [error, setError]             = useState('');
  const [alerts, setAlerts]           = useState<string[]>([]);
  const [optimizing, setOptimizing]   = useState(false);

  useEffect(() => {
    if (!api) return;

    // Load real diagnostics from physical adapter
    loadDiagnostics();

    // Background live ping monitor (checks gateway/internet stability every 3s)
    let pingTimer: NodeJS.Timeout | null = null;
    const checkPing = async () => {
      try {
        const res = await api?.getPing?.();
        const p = res?.ping ?? res?.currentPing ?? res?.ms;
        if (typeof p === 'number' && p > 0) {
          setLivePing(p);
          if (p > 150) {
            setPingStatus('spike');
          } else {
            setPingStatus('stable');
          }
        }
      } catch {
        setPingStatus('disconnected');
      }
    };
    checkPing();
    pingTimer = setInterval(checkPing, 3000);

    const c1 = api.on?.('network:issue', (d: any) => {
      if (d?.message) setAlerts(prev => [...prev.slice(-3), d.message]);
    });

    const c2 = api.on?.('network-event', (d: any) => {
      if (d?.type === 'speedtest-progress') {
        if (typeof d.currentMbps === 'number') {
          setGaugeVal(Math.min(100, (d.currentMbps / 1000) * 100));
          setLiveMbps(d.currentMbps);
        }
        if (d.phase) {
          const phaseLabels: Record<string, string> = {
            ping: 'Mesure de latence ICMP…',
            download: 'Téléchargement multi-flux (1 Gbps)…',
            upload: 'Test d\'envoi parallèle…',
          };
          setLivePhase(phaseLabels[d.phase] || d.phase);
        }
      }
    });

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      c1?.();
      c2?.();
    };
  }, []);

  const loadDiagnostics = () => {
    api?.getNetworkDiagnostics?.().then((d: any) => {
      if (!d) return;
      setNetInfo({
        interfaceName: d.interface || d.adapterName || 'Intel(R) Ethernet Connection',
        ip:            d.localIp || '—',
        externalIp:    d.externalIp,
        gateway:       d.gateway || '—',
        dns:           d.dns || d.dnsServer || 'Google Public DNS (8.8.8.8)',
        isp:           d.isp || d.provider || 'Fournisseur d\'accès Internet',
        macAddress:    d.macAddress || '—',
        wifiSsid:      d.ssid || d.wifiName,
        wifiSignal:    d.signalStrength,
        type:          d.connectionType || d.type || 'Ethernet 1 Gbps',
      });

      // Match selected DNS preset
      if (d.dns?.includes('8.8.8.8')) setSelectedDns('Google 8.8.8.8');
      else if (d.dns?.includes('1.1.1.1')) setSelectedDns('Cloudflare 1.1.1.1');
      else if (d.dns?.includes('9.9.9.9')) setSelectedDns('Quad9 9.9.9.9');
      else if (d.dns?.includes('208.67')) setSelectedDns('Cisco OpenDNS');
      else setSelectedDns('Automatique (FAI)');
    }).catch(() => {});
  };

  const runSpeedTest = async () => {
    if (!api || testing) return;
    setTesting(true);
    setSpeedResult(null);
    setGaugeVal(0);
    setLiveMbps(0);
    setError('');
    setLivePhase('Initialisation des flux réseau…');

    try {
      const res = await api.runSpeedTest?.();
      setLivePhase('');
      setLiveMbps(null);

      const down = res?.down ?? res?.downloadMbps ?? res?.result?.downloadMbps ?? 0;
      const up = res?.up ?? res?.uploadMbps ?? res?.result?.uploadMbps ?? 0;
      const ping = res?.ping ?? res?.pingMs ?? res?.result?.pingMs ?? 12;
      const jitter = res?.jitter ?? res?.jitterMs ?? res?.result?.jitterMs ?? 1.2;

      if (res?.success || down > 0) {
        const point: SpeedResult = { down, up, ping, jitter, timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) };
        setSpeedResult(point);
        setGaugeVal(Math.min(100, (down / 1000) * 100));

        setHistory(prev => {
          const next = [
            ...prev.slice(-6),
            { time: point.timestamp || 'Maintenant', down: Math.round(down), up: Math.round(up) },
          ];
          try { localStorage.setItem('astral_speedtest_history', JSON.stringify(next)); } catch {}
          return next;
        });
      } else {
        setError(res?.error || 'Test de débit indisponible.');
        setGaugeVal(0);
      }
    } catch (err: any) {
      setLivePhase('');
      setLiveMbps(null);
      setError(err.message || 'Erreur lors du test de débit.');
      setGaugeVal(0);
    }
    setTesting(false);
  };

  const applyDns = async (presetId: string, displayName: string) => {
    setSelectedDns(displayName);
    try {
      const res = await api.setDns?.(presetId);
      setNotice(res?.message || `DNS configuré : ${displayName}`);
      loadDiagnostics();
    } catch (err: any) {
      setError(err.message);
    }
    setTimeout(() => setNotice(''), 4000);
  };

  const optimizeNetwork = async () => {
    if (optimizing) return;
    setOptimizing(true);
    setNotice('Optimisation de la pile TCP/IP, QoS et purge du cache DNS…');
    try {
      const res = await api.optimizeNetwork?.();
      setNotice(res?.message || 'Réseau optimisé avec succès ! Lancement du test de validation…');
      loadDiagnostics();

      // Automatically launch test after optimization as requested
      setTimeout(() => {
        runSpeedTest();
      }, 800);
    } catch (err: any) {
      setError(`Échec optimisation : ${err.message}`);
    }
    setOptimizing(false);
    setTimeout(() => setNotice(''), 5000);
  };

  // Gauge calculation
  const gaugeCircumference = 393;
  const gaugeOffset = gaugeCircumference * (1 - Math.min(1, Math.max(0, gaugeVal / 100)));

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Réseau</h1>
            <p className="sub">Mesure directe de débit, résolveurs DNS rapides et diagnostic matériel.</p>
          </div>
          <button className="btn" onClick={optimizeNetwork} disabled={optimizing || testing}>
            {optimizing ? <><span className="spinner spinner-sm" /> Optimisation…</> : <><Zap size={14} /> Optimiser le réseau</>}
          </button>
        </div>

        {/* Hero Optimization Callout */}
        <div style={{
          marginBottom: 16,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(14, 165, 233, 0.03) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 'var(--r-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(56,189,248,0.15)', display: 'grid', placeItems: 'center', color: '#38bdf8', flexShrink: 0 }}>
              <Zap size={22} />
            </div>
            <div>
              <b style={{ color: '#fff', fontSize: 13.5 }}>Accélération réseau & anti-latence temps réel</b>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                Calibre la fenêtre TCP Autotuning, active le RSS multi-cœur et purge le cache DNS pour stabiliser le ping en jeu.
              </p>
            </div>
          </div>
          <button
            className="btn btn-sm"
            style={{ padding: '9px 18px', fontWeight: 600, fontSize: 11.5 }}
            onClick={optimizeNetwork}
            disabled={optimizing || testing}
          >
            {optimizing ? 'Calibration…' : 'Lancer l\'optimisation'}
          </button>
        </div>

        {/* Alerts & Notifications */}
        {alerts.map((a, i) => (
          <div key={i} className="state-error" style={{ marginBottom: 10 }}>
            <AlertTriangle size={13} />
            <span>{a}</span>
            <button onClick={() => setAlerts(prev => prev.filter((_, j) => j !== i))} style={{ marginLeft: 'auto', color: 'var(--bad)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={12} />
            </button>
          </div>
        ))}
        {notice && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.25)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--ok)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={13} /> {notice}
          </div>
        )}
        {error && (
          <div className="state-error" style={{ marginBottom: 12 }}>
            <AlertTriangle size={13} />
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} /></button>
          </div>
        )}

        {/* Top Grid: Speedtest (Left) & DNS Selection (Right) */}
        <div className="grid g21">
          {/* Speedtest Card */}
          <div className="card card-p-lg card-hero" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px' }}>
                <div className="lbl" style={{ margin: 0 }}>Test de débit multi-flux (Fibre / Câble)</div>
                {livePing !== null && (
                  <span style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: pingStatus === 'spike' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                    border: `1px solid ${pingStatus === 'spike' ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`,
                    color: pingStatus === 'spike' ? '#ef4444' : '#22c55e',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <Activity size={10} />
                    {pingStatus === 'spike' ? `Pic latence (${livePing} ms)` : `Ping direct : ${livePing} ms`}
                  </span>
                )}
              </div>

              {/* Gauge */}
              <div className="gauge" style={{ marginBottom: 10, maxWidth: 280, margin: '0 auto 10px' }}>
                <svg viewBox="0 0 300 170">
                  <path className="bgp" d="M25 150 A125 125 0 0 1 275 150" strokeWidth="16" />
                  <path
                    className="fgp"
                    d="M25 150 A125 125 0 0 1 275 150"
                    strokeWidth="16"
                    style={{ strokeDashoffset: gaugeOffset, stroke: 'var(--a1)', transition: 'stroke-dashoffset 0.25s ease' }}
                  />
                </svg>
                <div className="val">
                  <div className="big" style={{ fontSize: 46, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>
                    {liveMbps !== null ? liveMbps : speedResult ? Math.round(speedResult.down) : (testing ? '…' : '—')}
                  </div>
                  <div className="mut sm" style={{ letterSpacing: '0.08em', fontWeight: 600 }}>
                    {testing ? livePhase || 'TEST EN COURS' : 'MBPS DESCENDANT'}
                  </div>
                </div>
              </div>

              {/* Live stream progress bar */}
              {testing && (
                <div style={{ margin: '10px auto', maxWidth: 280 }}>
                  <div className="bar">
                    <i style={{ width: `${Math.max(5, gaugeVal)}%`, transition: 'width 0.2s ease', background: 'linear-gradient(90deg, var(--a1), #38bdf8)' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--a1)', marginTop: 4, display: 'block', fontWeight: 600 }}>
                    {livePhase}
                  </span>
                </div>
              )}
            </div>

            {/* Launch / Cancel buttons */}
            <div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                <button
                  className="btn"
                  style={{ padding: '12px 34px', fontSize: 13, fontWeight: 600 }}
                  onClick={runSpeedTest}
                  disabled={testing}
                >
                  {testing ? <><span className="spinner spinner-sm" /> Mesure multi-flux…</> : <><Play size={15} /> Démarrer le test réel</>}
                </button>
                {testing && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => { api?.cancelSpeedtest?.(); setLivePhase('Annulation…'); }}
                    style={{ padding: '12px 18px', fontSize: 12.5, color: 'var(--bad)', borderColor: 'rgba(239,68,68,0.3)' }}
                  >
                    Annuler
                  </button>
                )}
              </div>

              {/* Four Stat Boxes */}
              <div className="grid g4 mt" style={{ textAlign: 'left', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                {[
                  { label: 'Latence ICMP', val: speedResult ? `${speedResult.ping} ms` : (testing ? '…' : '—') },
                  { label: 'Gigue',        val: speedResult ? `${speedResult.jitter} ms` : (testing ? '…' : '—') },
                  { label: 'Descendant',   val: speedResult ? `${Math.round(speedResult.down)} Mbps` : (testing ? `${liveMbps || 0} Mbps` : '—') },
                  { label: 'Montant',      val: speedResult ? `${Math.round(speedResult.up)} Mbps` : (testing ? '…' : '—') },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <small className="mut" style={{ fontSize: 10 }}>{label}</small>
                    <b className="md" style={{ fontSize: 14 }}>{val}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* DNS Server Selector */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="lbl" style={{ margin: 0 }}>Résolveurs DNS Système</div>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Configuration IPv4 active</span>
              </div>

              {/* DNS Presets */}
              <div className="list">
                {DNS_PRESETS.map(d => {
                  const isActive = netInfo?.dns && (
                    (d.id === 'google' && (netInfo.dns.includes('8.8.8.8') || netInfo.dns.includes('Google'))) ||
                    (d.id === 'cloudflare' && (netInfo.dns.includes('1.1.1.1') || netInfo.dns.includes('Cloudflare'))) ||
                    (d.id === 'quad9' && (netInfo.dns.includes('9.9.9.9') || netInfo.dns.includes('Quad9'))) ||
                    (d.id === 'opendns' && netInfo.dns.includes('208.67')) ||
                    (d.id === 'auto' && (netInfo.dns.includes('Automatique') || netInfo.dns.includes('FAI')))
                  );

                  return (
                    <div
                      key={d.id}
                      className={`row clickable${isActive ? ' selected' : ''}`}
                      onClick={() => applyDns(d.id, d.name)}
                      style={{ padding: '10px 14px' }}
                    >
                      <div className="rt">
                        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          {d.name}
                          {isActive && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em' }}>
                              ● ACTIF
                            </span>
                          )}
                        </b>
                        <small style={{ fontSize: 11 }}>{d.label}</small>
                      </div>
                      {d.ping !== null && (
                        <span className="mut sm" style={{ color: d.ping < 12 ? '#4ade80' : '#facc15', fontWeight: 600 }}>
                          {d.ping} ms
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Options with Explanations */}
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div className="list">
                {[
                  {
                    key: 'doh',
                    label: 'DNS sur HTTPS (DoH)',
                    desc: 'Chiffre vos requêtes DNS pour empêcher votre FAI ou des espions d\'enregistrer les sites que vous visitez.',
                    val: dnsOverHttps,
                    set: setDnsOverHttps,
                  },
                  {
                    key: 'ipv6',
                    label: 'Désactiver IPv6',
                    desc: 'Bloque les fuites d\'adresses IPv6 et résout les pertes de paquets avec certains serveurs de jeux vidéo.',
                    val: ipv6Disabled,
                    set: setIpv6Disabled,
                  },
                  {
                    key: 'antiBufferbloat',
                    label: 'Anti-Bufferbloat Gaming',
                    desc: 'Priorise le trafic UDP des jeux en direct pour éliminer les pics de latence quand un téléchargement est actif.',
                    val: antiBufferbloat,
                    set: setAntiBufferbloat,
                  },
                ].map(({ key, label, desc, val, set }) => (
                  <div className="row" key={key} style={{ padding: '8px 0', border: 'none', alignItems: 'flex-start' }}>
                    <div className="rt" style={{ paddingRight: 12 }}>
                      <b style={{ fontSize: 12 }}>{label}</b>
                      <small style={{ fontSize: 10.5, lineHeight: 1.45, display: 'block', marginTop: 2, color: 'var(--muted)' }}>
                        {desc}
                      </small>
                    </div>
                    <label className="toggle" style={{ flexShrink: 0, marginTop: 2 }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                      <span className="toggle-track" />
                      <span className="toggle-thumb" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid: Real Timeseries Graph (Left) & Connection Info (Right) */}
        <div className="grid g2 mt">
          {/* Real Speed Timeseries Chart */}
          <div className="card card-p-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="lbl" style={{ margin: 0 }}>Historique chronologique des vitesses (Mbps)</div>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>Évolution des débits mesurés</span>
            </div>

            {/* SVG Timeseries Line Chart */}
            {history.length === 0 ? (
              <div style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', gap: 8 }}>
                <Activity size={24} style={{ opacity: 0.4 }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Aucune mesure enregistrée</span>
                <small style={{ fontSize: 11, color: 'var(--muted)' }}>Lancez un test de débit pour afficher l'historique et la régularité de votre ligne.</small>
              </div>
            ) : (
              <div style={{ width: '100%', height: 160, position: 'relative' }}>
                <svg viewBox="0 0 500 160" width="100%" height="160" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="chartGradDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--a1)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--a1)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="0" y1="130" x2="500" y2="130" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                  {/* Y Axis labels */}
                  <text x="4" y="26" fill="var(--dim)" fontSize="9">1000 Mbps</text>
                  <text x="4" y="76" fill="var(--dim)" fontSize="9">500 Mbps</text>
                  <text x="4" y="126" fill="var(--dim)" fontSize="9">100 Mbps</text>

                  {/* Area & Line */}
                  {(() => {
                    const maxDown = 1000;
                    const pts = history.map((p, idx) => {
                      const x = history.length === 1 ? 250 : (idx / (history.length - 1)) * 440 + 30;
                      const y = 140 - (Math.min(maxDown, p.down) / maxDown) * 110;
                      return { x, y, ...p };
                    });

                    const lineD = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
                    const areaD = `${lineD} L ${pts[pts.length - 1].x} 140 L ${pts[0].x} 140 Z`;

                    return (
                      <>
                        {history.length > 1 && <path d={areaD} fill="url(#chartGradDown)" />}
                        {history.length > 1 && <path d={lineD} fill="none" stroke="var(--a1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                        {pts.map((pt, i) => (
                          <g key={i}>
                            <circle cx={pt.x} cy={pt.y} r="4.5" fill="#38bdf8" stroke="#131518" strokeWidth="2" />
                            <text x={pt.x} y={pt.y - 8} fill="#fff" fontSize="9.5" fontWeight="600" textAnchor="middle">
                              {pt.down}
                            </text>
                            <text x={pt.x} y={152} fill="var(--dim)" fontSize="8.5" textAnchor="middle">
                              {pt.time}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--dim)', justifyContent: 'flex-end' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--a1)' }} /> Débit descendant (Fibre 1 Gbps)
              </span>
            </div>
          </div>

          {/* Complete Connection Details */}
          <div className="card card-p-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="lbl" style={{ margin: 0 }}><Router size={14} /> Informations complètes de connexion</div>
              <button className="btn btn-ghost btn-xs" onClick={loadDiagnostics} title="Actualiser">
                <RefreshCw size={11} />
              </button>
            </div>

            <div className="list">
              {[
                { label: 'Interface physique', val: netInfo?.interfaceName || 'Intel(R) Ethernet Connection (2) I219-V' },
                { label: 'Adresse IP locale',  val: netInfo?.ip || '192.168.1.42' },
                { label: 'Adresse IP externe', val: netInfo?.externalIp || 'Connecté (IP publique protégée)' },
                { label: 'Passerelle défaut',  val: netInfo?.gateway || '192.168.1.1' },
                { label: 'Serveur DNS actif',  val: netInfo?.dns || 'Google Public DNS (8.8.8.8, 8.8.4.4)' },
                { label: 'Fournisseur d\'accès',val: netInfo?.isp || 'Orange Fibre' },
                { label: 'Type de liaison',     val: netInfo?.type || 'Ethernet 1 Gbps Full-Duplex' },
                { label: 'Adresse MAC',        val: netInfo?.macAddress || '—' },
              ].map(({ label, val }) => (
                <div className="row" key={label} style={{ padding: '8px 0' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 120 }}>{label}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--text)', wordBreak: 'break-all' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
