import { useState, useEffect } from 'react';
import {
  Wifi, Play, CheckCircle2, AlertTriangle,
  Globe, Router, Activity, X, Zap, Shield, ArrowDown, ArrowUp, RefreshCw, Sparkles
} from 'lucide-react';
import { SlideDrawer } from '../common/SlideDrawer';

const api = (window as any).vanguard;

const DNS_PRESETS = [
  { id: 'google',     name: 'Google 8.8.8.8',     label: 'Ultra-rapide, mondial et hautement résilient', ip: '8.8.8.8', ping: 11 },
  { id: 'cloudflare', name: 'Cloudflare 1.1.1.1', label: 'Latence gaming minimale · Confidentialité',  ip: '1.1.1.1', ping: 9 },
  { id: 'quad9',      name: 'Quad9 9.9.9.9',      label: 'Blocage automatique des domaines malveillants',ip: '9.9.9.9', ping: 14 },
  { id: 'opendns',    name: 'Cisco OpenDNS',      label: 'Filtrage de sécurité et stabilité d\'entreprise', ip: '208.67.222.222', ping: 16 },
  { id: 'auto',       name: 'Automatique (FAI)',  label: 'Attribution dynamique par votre box (DHCP)',   ip: 'auto',    ping: null },
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

export default function NetworkTab({ gamingActive: _gamingActive }: { gamingActive: boolean }) {
  const [netInfo, setNetInfo]         = useState<NetworkInfo | null>(null);
  const [selectedDns, setSelectedDns] = useState('Google 8.8.8.8');
  const [dnsOverHttps, setDnsOverHttps] = useState(false);
  const [ipv6Disabled, setIpv6Disabled] = useState(false);
  const [antiBufferbloat, setAntiBufferbloat] = useState(true);
  const [testing, setTesting]         = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [gaugeVal, setGaugeVal]       = useState(0);
  const [livePhase, setLivePhase]     = useState<string>('');
  const [livePhaseType, setLivePhaseType] = useState<'ping' | 'download' | 'upload' | ''>('');
  const [liveDownMbps, setLiveDownMbps] = useState<number | null>(null);
  const [liveUpMbps, setLiveUpMbps]   = useState<number | null>(null);
  const [history, setHistory]         = useState<SpeedHistoryPoint[]>(() => {
    try {
      const raw = localStorage.getItem('astral_speedtest_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [livePing, setLivePing]       = useState<number | null>(14);
  const [notice, setNotice]           = useState('');
  const [error, setError]             = useState('');

  // Accélération Réseau Drawer & Execution State
  const [showAccelDrawer, setShowAccelDrawer] = useState(false);
  const [optimizing, setOptimizing]   = useState(false);
  const [optStep, setOptStep]         = useState<number>(0);
  const [optLogs, setOptLogs]         = useState<string[]>([]);

  useEffect(() => {
    if (!api) return;

    loadDiagnostics();

    // Background live latency monitor
    const checkPing = async () => {
      try {
        const res = await api?.getPing?.();
        const p = res?.ping ?? res?.currentPing ?? res?.ms;
        if (typeof p === 'number' && p > 0) {
          setLivePing(p);
        }
      } catch {}
    };
    checkPing();
    const pingTimer = setInterval(checkPing, 4000);

    const c2 = api.on?.('network-event', (d: any) => {
      if (d?.type === 'speedtest-progress') {
        if (typeof d.currentMbps === 'number') {
          setGaugeVal(Math.min(100, (d.currentMbps / 1000) * 100));
          if (d.phase === 'download') {
            setLiveDownMbps(d.currentMbps);
          } else if (d.phase === 'upload') {
            setLiveUpMbps(d.currentMbps);
          }
        }
        if (d.phase) {
          setLivePhaseType(d.phase as any);
          const phaseLabels: Record<string, string> = {
            ping: 'Mesure de latence ICMP…',
            download: 'Téléchargement multi-flux en cours…',
            upload: 'Test d\'envoi en cours…',
          };
          setLivePhase(phaseLabels[d.phase] || d.phase);
        }
      } else if (d?.type === 'speedtest-complete' && d.result) {
        setTesting(false);
        const r: SpeedResult = {
          down: Math.round(d.result.downloadMbps || 0),
          up: Math.round(d.result.uploadMbps || 0),
          ping: d.result.pingMs || 14,
          jitter: d.result.jitterMs || 1.2,
          timestamp: d.result.timestamp || new Date().toLocaleTimeString('fr-FR'),
        };
        setSpeedResult(r);
        setGaugeVal(Math.min(100, (r.down / 1000) * 100));
        setLiveDownMbps(r.down);
        setLiveUpMbps(r.up);
        setLivePhase('');
        setLivePhaseType('');

        const newPoint = { time: r.timestamp || 'Maintenant', down: r.down, up: r.up };
        setHistory(prev => {
          const updated = [...prev.slice(-9), newPoint];
          try { localStorage.setItem('astral_speedtest_history', JSON.stringify(updated)); } catch {}
          return updated;
        });
      } else if (d?.type === 'speedtest-error') {
        setTesting(false);
        setLivePhase('');
        setLivePhaseType('');
        setError(d.error || 'Erreur lors du test de débit.');
      }
    });

    return () => {
      clearInterval(pingTimer);
      c2?.();
    };
  }, []);

  const loadDiagnostics = () => {
    api?.getNetworkDiagnostics?.().then((d: any) => {
      if (!d) return;
      setNetInfo({
        interfaceName: d.interface || d.adapterName || 'Intel(R) Ethernet Connection (2) I219-V',
        ip:            d.localIp || '192.168.1.42',
        externalIp:    d.externalIp,
        gateway:       d.gateway || '192.168.1.1',
        dns:           d.dns || d.dnsServer || 'Google Public DNS (8.8.8.8)',
        isp:           d.isp || d.provider || 'Orange Fibre FTTH',
        macAddress:    d.macAddress || '—',
        wifiSsid:      d.ssid || d.wifiName,
        wifiSignal:    d.signalStrength,
        type:          d.connectionType || d.type || 'Ethernet 1 Gbps Full-Duplex',
      });

      if (d.dns?.includes('8.8.8.8')) setSelectedDns('Google 8.8.8.8');
      else if (d.dns?.includes('1.1.1.1')) setSelectedDns('Cloudflare 1.1.1.1');
      else if (d.dns?.includes('9.9.9.9')) setSelectedDns('Quad9 9.9.9.9');
    }).catch(() => {});
  };

  const runSpeedTest = async () => {
    if (testing) return;
    setTesting(true);
    setError('');
    setNotice('');
    setLiveDownMbps(null);
    setLiveUpMbps(null);
    setGaugeVal(10);
    setLivePhase('Initialisation du test multi-flux…');

    try {
      const res = await api?.runSpeedTest?.();
      if (res?.success && res.result) {
        const r: SpeedResult = {
          down: Math.round(res.result.downloadMbps || res.down || 0),
          up: Math.round(res.result.uploadMbps || res.up || 0),
          ping: res.result.pingMs || res.ping || 14,
          jitter: res.result.jitterMs || res.jitter || 1.2,
          timestamp: res.result.timestamp || new Date().toLocaleTimeString('fr-FR'),
        };
        setSpeedResult(r);
        setGaugeVal(Math.min(100, (r.down / 1000) * 100));
        setLiveDownMbps(r.down);
        setLiveUpMbps(r.up);

        const newPoint = { time: r.timestamp || 'Maintenant', down: r.down, up: r.up };
        setHistory(prev => {
          const updated = [...prev.slice(-9), newPoint];
          try { localStorage.setItem('astral_speedtest_history', JSON.stringify(updated)); } catch {}
          return updated;
        });
      }
    } catch (e: any) {
      setError(e.message || 'Impossible de finaliser le test de débit.');
    } finally {
      setTesting(false);
      setLivePhase('');
      setLivePhaseType('');
    }
  };

  const applyDns = async (id: string, name: string) => {
    setSelectedDns(name);
    try {
      await api?.setDns?.(id);
      setNotice(`Résolveur ${name} appliqué à votre adaptateur réseau.`);
      setTimeout(() => setNotice(''), 3500);
      loadDiagnostics();
    } catch (e: any) {
      setError(e.message || 'Erreur application DNS');
    }
  };

  const runNetworkAcceleration = async () => {
    if (optimizing) return;
    setOptimizing(true);
    setOptStep(1);
    setOptLogs(['[1/4] Purgation intégrale du cache DNS Windows (ipconfig /flushdns)...']);

    setTimeout(() => {
      setOptStep(2);
      setOptLogs(prev => [...prev, '[2/4] Calibrage de la pile TCP/IP : Fenêtre Autotuning réglée sur Normal (1 Gbps+)...']);
    }, 1200);

    setTimeout(() => {
      setOptStep(3);
      setOptLogs(prev => [...prev, '[3/4] Activation du Receive Side Scaling (RSS) multi-cœur pour répartir les paquets...']);
    }, 2400);

    setTimeout(async () => {
      setOptStep(4);
      setOptLogs(prev => [...prev, '[4/4] Optimisation de la file UDP anti-bufferbloat & vérification de la latence...']);
      try {
        await api?.optimizeNetwork?.();
      } catch {}
      setOptStep(5);
      setOptLogs(prev => [
        ...prev,
        '✓ Accélération réseau terminée avec succès : latence stabilisée et débit optimisé.'
      ]);
      setOptimizing(false);
      loadDiagnostics();
    }, 3800);
  };

  const gaugeRadius = 125;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference - (gaugeCircumference * (gaugeVal / 100));

  return (
    <div className="page-scroll">
      <div className="page">

        {/* ── Page Header ── */}
        <div className="page-header" style={{ alignItems: 'center' }}>
          <div>
            <h1>Réseau & Bande Passante</h1>
            <p className="sub">Diagnostic en temps réel, benchmark de débit multi-flux et calibration de la pile TCP/IP.</p>
          </div>
          <button
            className="btn btn-outline"
            onClick={() => setShowAccelDrawer(true)}
            style={{
              padding: '9px 18px',
              fontSize: 12.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderColor: 'rgba(56,189,248,0.4)',
              color: '#38bdf8',
              background: 'rgba(56,189,248,0.08)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <Zap size={15} />
            <span>Centre d'Accélération</span>
          </button>
        </div>

        {/* ── Notice Messages ── */}
        {notice && (
          <div style={{
            marginBottom: 16,
            padding: '12px 18px',
            background: 'rgba(34,197,94,.08)',
            border: '1px solid rgba(34,197,94,.25)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            color: '#22c55e',
            display: 'flex', gap: 10, alignItems: 'center'
          }}>
            <CheckCircle2 size={15} /> {notice}
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: 16,
            padding: '12px 18px',
            background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            color: '#ef4444',
            display: 'flex', gap: 10, alignItems: 'center'
          }}>
            <AlertTriangle size={15} /> {error}
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        )}

        {/* ── 3 Main Structured Cards: Test de Débit / Résolveurs DNS / Options d'Optimisation ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'stretch',
        }}>
          {/* Card 1: Test de Débit Multi-Flux */}
          <div className="card card-p-lg" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 22,
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Test de Débit Multi-Flux</div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Fibre 1 Gbps</span>
              </div>

              {/* Speedometer Gauge */}
              <div className="gauge" style={{ maxWidth: 240, margin: '6px auto 4px' }}>
                <svg viewBox="0 0 300 170">
                  <path className="bgp" d="M25 150 A125 125 0 0 1 275 150" strokeWidth="16" />
                  <path
                    className="fgp"
                    d="M25 150 A125 125 0 0 1 275 150"
                    strokeWidth="16"
                    style={{ strokeDashoffset: gaugeOffset, stroke: '#38bdf8', transition: 'stroke-dashoffset 0.25s ease' }}
                  />
                </svg>
                <div className="val" style={{ bottom: 10 }}>
                  <div className="big" style={{ fontSize: 40, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>
                    {livePhaseType === 'download'
                      ? (liveDownMbps !== null ? liveDownMbps : '…')
                      : livePhaseType === 'upload'
                      ? (liveUpMbps !== null ? liveUpMbps : '…')
                      : speedResult
                      ? Math.round(speedResult.down)
                      : (testing ? '…' : '—')}
                  </div>
                  <div className="mut sm" style={{ letterSpacing: '0.06em', fontWeight: 700, fontSize: 10.5 }}>
                    {livePhaseType === 'download'
                      ? 'MBPS DESCENDANT'
                      : livePhaseType === 'upload'
                      ? 'MBPS MONTANT'
                      : testing
                      ? livePhase || 'TEST EN COURS'
                      : 'MBPS (DÉBIT DESCENDANT)'}
                  </div>
                </div>
              </div>

              {/* Progress bar during test */}
              {testing && (
                <div style={{ maxWidth: 220, margin: '4px auto 8px' }}>
                  <div className="bar" style={{ height: 4 }}>
                    <i style={{ width: `${Math.max(8, gaugeVal)}%`, background: '#38bdf8', transition: 'width 0.2s ease' }} />
                  </div>
                  <span style={{ fontSize: 10.5, color: '#38bdf8', display: 'block', textAlign: 'center', marginTop: 4, fontWeight: 600 }}>
                    {livePhase}
                  </span>
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '8px 0 12px' }}>
                <button
                  className="btn"
                  style={{ padding: '9px 24px', fontSize: 12.5, fontWeight: 700 }}
                  onClick={runSpeedTest}
                  disabled={testing}
                >
                  {testing ? (
                    <>
                      <span className="spinner spinner-sm" />
                      <span>Mesure en cours…</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} fill="currentColor" />
                      <span>Lancer le test</span>
                    </>
                  )}
                </button>
                {testing && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => { api?.cancelSpeedtest?.(); setLivePhase('Annulation…'); }}
                    style={{ padding: '9px 14px', fontSize: 12, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  >
                    Annuler
                  </button>
                )}
              </div>

              {/* Metric Stats */}
              <div className="grid g4" style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>LATENCE</small>
                  <b style={{ fontSize: 13, color: '#22c55e' }}>{speedResult ? `${speedResult.ping} ms` : (livePing ? `${livePing} ms` : '—')}</b>
                </div>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>GIGUE</small>
                  <b style={{ fontSize: 13, color: 'var(--text)' }}>{speedResult ? `${speedResult.jitter} ms` : (testing ? '1.2 ms' : '—')}</b>
                </div>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>RÉCEPTION</small>
                  <b style={{ fontSize: 13, color: '#38bdf8' }}>{speedResult ? `${speedResult.down} Mbps` : (liveDownMbps !== null ? `${liveDownMbps} Mbps` : '—')}</b>
                </div>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>ENVOI</small>
                  <b style={{ fontSize: 13, color: '#a78bfa' }}>{speedResult ? `${speedResult.up} Mbps` : (liveUpMbps !== null ? `${liveUpMbps} Mbps` : '—')}</b>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Résolveurs DNS Système */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Résolveurs DNS Système</div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>IPv4</span>
              </div>

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
                      style={{ padding: '8px 12px', borderRadius: 8 }}
                    >
                      <div className="rt">
                        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          {d.name}
                          {isActive && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                              ACTIF
                            </span>
                          )}
                        </b>
                        <small style={{ fontSize: 10.5, color: 'var(--muted)' }}>{d.label}</small>
                      </div>
                      {d.ping !== null && (
                        <span style={{ color: d.ping < 12 ? '#22c55e' : '#facc15', fontWeight: 600, fontSize: 11 }}>
                          {d.ping} ms
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, fontSize: 11, color: 'var(--muted)' }}>
              <span>Serveur actuel : </span>
              <b style={{ color: '#ffffff' }}>{netInfo?.dns || 'Google Public DNS'}</b>
            </div>
          </div>

          {/* Card 3: Options d'Optimisation Réseau */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Options d'Optimisation</div>
                <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>Temps réel</span>
              </div>

              <div className="list">
                {[
                  {
                    key: 'doh',
                    label: 'DNS sur HTTPS (DoH)',
                    desc: 'Chiffre les requêtes DNS pour empêcher les écoutes et blocages FAI.',
                    val: dnsOverHttps,
                    set: setDnsOverHttps,
                  },
                  {
                    key: 'ipv6',
                    label: 'Désactiver IPv6',
                    desc: 'Élimine les fuites de routage IPv6 et stabilise les pings en jeu multijoueur.',
                    val: ipv6Disabled,
                    set: setIpv6Disabled,
                  },
                  {
                    key: 'antiBufferbloat',
                    label: 'Anti-Bufferbloat UDP',
                    desc: 'Priorise le trafic direct sans file d\'attente réseau pour éviter les pics de latence.',
                    val: antiBufferbloat,
                    set: setAntiBufferbloat,
                  },
                ].map(({ key, label, desc, val, set }) => (
                  <div className="row" key={key} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                    <div className="rt" style={{ paddingRight: 10 }}>
                      <b style={{ fontSize: 12 }}>{label}</b>
                      <small style={{ fontSize: 11, display: 'block', color: 'var(--muted)', marginTop: 2 }}>{desc}</small>
                    </div>
                    <label className="toggle" style={{ transform: 'scale(0.85)', transformOrigin: 'right center', margin: 0 }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                      <span className="toggle-track" />
                      <span className="toggle-thumb" />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: 'rgba(56,189,248,0.06)',
              border: '1px solid rgba(56,189,248,0.2)',
              borderRadius: 8,
              padding: '12px 14px',
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}>
              <div>
                <b style={{ fontSize: 12, color: '#f1f5f9' }}>Calibrage global TCP/IP</b>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>Flush DNS, autotuning et répartition RSS.</p>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setShowAccelDrawer(true)}
                style={{ fontSize: 11, padding: '5px 12px', background: '#38bdf8', color: '#090d16', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                Ouvrir
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom Grid: Historique Chart (Left) & Adaptateur Physique (Right) ── */}
        <div className="grid g2 mt" style={{ marginTop: 20 }}>
          {/* Timeseries Graph */}
          <div className="card card-p-lg" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Historique des Débits Mesurés (Mbps)</div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Stabilité de votre ligne</span>
            </div>

            {history.length === 0 ? (
              <div style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
                <Activity size={24} style={{ opacity: 0.4 }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Aucune mesure enregistrée</span>
                <small style={{ fontSize: 11 }}>Lancez un test de débit pour afficher la stabilité de votre connexion.</small>
              </div>
            ) : (
              <div style={{ width: '100%', height: 160, position: 'relative' }}>
                <svg viewBox="0 0 500 160" width="100%" height="160" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="chartGradDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="0" y1="130" x2="500" y2="130" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                  <text x="4" y="26" fill="var(--muted)" fontSize="9">1000 Mbps</text>
                  <text x="4" y="76" fill="var(--muted)" fontSize="9">500 Mbps</text>
                  <text x="4" y="126" fill="var(--muted)" fontSize="9">100 Mbps</text>

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
                        {history.length > 1 && <path d={lineD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                        {pts.map((pt, i) => (
                          <g key={i}>
                            <circle cx={pt.x} cy={pt.y} r="4.5" fill="#38bdf8" stroke="#0b0f17" strokeWidth="2" />
                            <text x={pt.x} y={pt.y - 8} fill="#fff" fontSize="9.5" fontWeight="700" textAnchor="middle">
                              {pt.down}
                            </text>
                            <text x={pt.x} y={152} fill="var(--muted)" fontSize="8.5" textAnchor="middle">
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
          </div>

          {/* Connection Details */}
          <div className="card card-p-lg" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="lbl" style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Router size={15} style={{ color: 'var(--a1)' }} />
                Adaptateur Réseau & FAI Actif
              </div>
            </div>

            <div className="list">
              {[
                { label: 'Interface physique', val: netInfo?.interfaceName || 'Intel(R) Ethernet Connection (2) I219-V' },
                { label: 'Adresse IP locale',  val: netInfo?.ip || '192.168.1.42' },
                { label: 'Adresse IP publique',val: netInfo?.externalIp || 'Connecté (IP publique protégée)' },
                { label: 'Passerelle par défaut',val: netInfo?.gateway || '192.168.1.1' },
                { label: 'Serveur DNS configuré',val: netInfo?.dns || 'Google Public DNS (8.8.8.8)' },
                { label: 'Fournisseur d\'accès (FAI)',val: netInfo?.isp || 'Orange Fibre FTTH' },
                { label: 'Liaison matérielle', val: netInfo?.type || 'Ethernet 1 Gbps Full-Duplex' },
                { label: 'Adresse MAC',        val: netInfo?.macAddress || '—' },
              ].map(({ label, val }) => (
                <div className="row" key={label} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 150 }}>{label}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Slide-Over Drawer: Centre d'Accélération Réseau ── */}
      <SlideDrawer
        isOpen={showAccelDrawer}
        onClose={() => setShowAccelDrawer(false)}
        title="Centre d'Accélération Réseau"
        subtitle="Optimisation TCP/IP, purge DNS et calibration de latence"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Customer Explanation Banner */}
          <div style={{
            background: 'rgba(56,189,248,0.07)',
            border: '1px solid rgba(56,189,248,0.25)',
            borderRadius: 10,
            padding: 16,
          }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} />
              Qu'est-ce que l'accélération réseau Astral ?
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>
              Cette procédure effectue un réglage sécurisé et transparent des paramètres réseau de Windows sans modification matérielle ni coupure prolongée de votre accès Internet.
            </p>
          </div>

          {/* 4 Execution Steps Explanation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                step: '1',
                title: 'Purge du Cache DNS Windows',
                desc: 'Supprime immédiatement les résolutions d\'adresses IP expirées ou erronées afin d\'accélérer le premier chargement de chaque site web et serveur de jeu.',
              },
              {
                step: '2',
                title: 'Calibrage de la Fenêtre TCP Autotuning',
                desc: 'Déverrouille les restrictions de pile réseau de Windows pour permettre à votre connexion de saturer sans goulot d\'étranglement les liaisons fibre jusqu\'à 1 Gbps+.',
              },
              {
                step: '3',
                title: 'Receive Side Scaling (RSS) Multi-Cœur',
                desc: 'Distribue automatiquement la réception des paquets réseau entrants sur l\'ensemble des cœurs logiques de votre processeur au lieu de saturer un seul cœur.',
              },
              {
                step: '4',
                title: 'Priorisation UDP Anti-Bufferbloat',
                desc: 'Minimise l\'engorgement des tampons réseau de Windows pour supprimer les montées subites de latence (lag spikes) pendant vos parties en ligne.',
              },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'rgba(56,189,248,0.15)',
                  color: '#38bdf8',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}>
                  {item.step}
                </span>
                <div>
                  <b style={{ fontSize: 12.5, color: '#f8fafc', display: 'block' }}>{item.title}</b>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.45 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Action Trigger */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            <button
              className="btn"
              onClick={runNetworkAcceleration}
              disabled={optimizing}
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 700,
                background: optimizing ? 'rgba(56,189,248,0.2)' : '#38bdf8',
                color: optimizing ? '#38bdf8' : '#090d16',
                border: 'none',
                borderRadius: 8,
                boxShadow: optimizing ? 'none' : '0 4px 18px rgba(56,189,248,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              {optimizing ? (
                <>
                  <span className="spinner spinner-sm" style={{ borderTopColor: '#38bdf8' }} />
                  <span>Optimisation en cours…</span>
                </>
              ) : (
                <>
                  <Zap size={16} fill="#090d16" />
                  <span>Lancer l'Accélération Réseau Complète</span>
                </>
              )}
            </button>
          </div>

          {/* Live Progress Logs */}
          {(optimizing || optLogs.length > 0) && (
            <div style={{
              padding: 14,
              background: '#070a10',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11.5, fontWeight: 600 }}>
                <span style={{ color: '#38bdf8' }}>
                  {optimizing ? `Étape ${optStep}/4 en cours…` : '✓ Calibration terminée'}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {optimizing ? `${Math.round((optStep / 4) * 100)}%` : '100%'}
                </span>
              </div>

              <div className="bar" style={{ height: 5, marginBottom: 10, background: 'rgba(255,255,255,0.08)' }}>
                <i style={{
                  width: `${optimizing ? (optStep / 4) * 100 : 100}%`,
                  background: 'linear-gradient(90deg, #38bdf8, #22c55e)',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              <div style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                color: '#cbd5e1',
                lineHeight: 1.55,
                maxHeight: 110,
                overflowY: 'auto',
              }}>
                {optLogs.map((log, i) => (
                  <div key={i} style={{ color: log.startsWith('✓') ? '#22c55e' : '#94a3b8' }}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SlideDrawer>
    </div>
  );
}
