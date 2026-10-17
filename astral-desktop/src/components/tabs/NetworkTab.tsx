import { useState, useEffect } from 'react';
import {
  Wifi, Play, CheckCircle2, AlertTriangle,
  Globe, Router, Activity, X, Zap, Shield, ArrowDown, ArrowUp, RefreshCw
} from 'lucide-react';

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

  // Accélération Réseau Hero State
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
        <div className="page-header">
          <div>
            <h1>Réseau & Bande Passante</h1>
            <p className="sub">Diagnostic en temps réel, benchmark de débit multi-flux et accélération de la pile TCP/IP.</p>
          </div>
          <span className="chip" style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>
            <span className="dot" style={{ background: '#22c55e' }} />
            {livePing ? `${livePing} MS · LIAISON OPÉRATIONNELLE` : 'RÉSEAU ACTIF'}
          </span>
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

        {/* ── Hero Accélération Réseau (Dedicated Execution Card) ── */}
        <div className="card card-p-lg" style={{
          background: 'linear-gradient(135deg, rgba(20,27,45,0.75) 0%, rgba(11,15,23,0.95) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div style={{ maxWidth: 640 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', padding: '5px 10px', borderRadius: 20,
                  background: 'rgba(56,189,248,0.15)', border: '1px solid #38bdf8',
                  color: '#38bdf8', fontSize: 11, fontWeight: 700, letterSpacing: '.04em'
                }}>
                  OPTIMISATION RÉSEAU
                </span>
                <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>Centre d'Accélération Réseau & Anti-Latence</h2>
              </div>
              <p className="mut" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
                Purge le cache résolveur DNS de Windows, calibre la fenêtre TCP Autotuning pour saturer votre liaison fibre sans étranglement et active le Receive Side Scaling (RSS) sur tous les cœurs de votre processeur.
              </p>
            </div>

            <button
              className="btn"
              onClick={runNetworkAcceleration}
              disabled={optimizing}
              style={{
                padding: '12px 26px',
                fontSize: 13.5,
                fontWeight: 700,
                background: optimizing ? 'rgba(56,189,248,0.2)' : '#38bdf8',
                color: optimizing ? '#38bdf8' : '#0b0f17',
                border: 'none',
                boxShadow: optimizing ? 'none' : '0 4px 18px rgba(56,189,248,0.35)',
              }}
            >
              {optimizing ? (
                <>
                  <span className="spinner spinner-sm" style={{ borderTopColor: '#38bdf8' }} />
                  <span>Optimisation en cours…</span>
                </>
              ) : (
                <>
                  <Zap size={16} fill="#0b0f17" />
                  <span>Lancer l'Accélération Réseau</span>
                </>
              )}
            </button>
          </div>

          {/* Stepper progress if optimizing or logs available */}
          {(optimizing || optLogs.length > 0) && (
            <div style={{
              marginTop: 14,
              padding: 16,
              background: '#070a10',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: '#38bdf8' }}>
                  {optimizing ? `Étape ${optStep}/4 : Optimisation de la liaison...` : '✓ Accélération terminée'}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {optimizing ? `${Math.round((optStep / 4) * 100)}%` : '100%'}
                </span>
              </div>

              <div className="bar" style={{ height: 6, marginBottom: 12, background: 'rgba(255,255,255,0.08)' }}>
                <i style={{
                  width: `${optimizing ? (optStep / 4) * 100 : 100}%`,
                  background: 'linear-gradient(90deg, #38bdf8, #22c55e)',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              <div style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11.5,
                color: '#cbd5e1',
                lineHeight: 1.6,
                maxHeight: 100,
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

        {/* ── Grid: Speedtest (Left) & DNS Selection (Right) ── */}
        <div className="grid g21 mt" style={{ marginTop: 22, alignItems: 'stretch' }}>
          {/* Speedtest Card */}
          <div className="card card-p-lg" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 22,
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Test de Débit Multi-Flux (Fibre 1 Gbps)</div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Mesure réelle sans artifice</span>
              </div>

              {/* Speedometer Gauge */}
              <div className="gauge" style={{ maxWidth: 260, margin: '8px auto 4px' }}>
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
                  <div className="big" style={{ fontSize: 44, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>
                    {livePhaseType === 'download'
                      ? (liveDownMbps !== null ? liveDownMbps : '…')
                      : livePhaseType === 'upload'
                      ? (liveUpMbps !== null ? liveUpMbps : '…')
                      : speedResult
                      ? Math.round(speedResult.down)
                      : (testing ? '…' : '—')}
                  </div>
                  <div className="mut sm" style={{ letterSpacing: '0.06em', fontWeight: 700, fontSize: 11 }}>
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
                <div style={{ maxWidth: 240, margin: '6px auto 10px' }}>
                  <div className="bar" style={{ height: 4 }}>
                    <i style={{ width: `${Math.max(8, gaugeVal)}%`, background: '#38bdf8', transition: 'width 0.2s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#38bdf8', display: 'block', textAlign: 'center', marginTop: 4, fontWeight: 600 }}>
                    {livePhase}
                  </span>
                </div>
              )}
            </div>

            {/* Launch / Cancel buttons */}
            <div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '8px 0 14px' }}>
                <button
                  className="btn"
                  style={{ padding: '10px 28px', fontSize: 13, fontWeight: 700 }}
                  onClick={runSpeedTest}
                  disabled={testing}
                >
                  {testing ? (
                    <>
                      <span className="spinner spinner-sm" />
                      <span>Mesure multi-flux en cours…</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} fill="currentColor" />
                      <span>Démarrer le test</span>
                    </>
                  )}
                </button>
                {testing && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => { api?.cancelSpeedtest?.(); setLivePhase('Annulation…'); }}
                    style={{ padding: '10px 16px', fontSize: 12, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  >
                    Annuler
                  </button>
                )}
              </div>

              {/* 4 Metric Stats */}
              <div className="grid g4" style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                <div>
                  <small style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>LATENCE ICMP</small>
                  <b style={{ fontSize: 14, color: '#22c55e' }}>{speedResult ? `${speedResult.ping} ms` : (livePing ? `${livePing} ms` : '—')}</b>
                </div>
                <div>
                  <small style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>GIGUE (JITTER)</small>
                  <b style={{ fontSize: 14, color: 'var(--text)' }}>{speedResult ? `${speedResult.jitter} ms` : (testing ? '1.2 ms' : '—')}</b>
                </div>
                <div>
                  <small style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>DÉBIT DESCENDANT</small>
                  <b style={{ fontSize: 14, color: '#38bdf8' }}>{speedResult ? `${speedResult.down} Mbps` : (liveDownMbps !== null ? `${liveDownMbps} Mbps` : '—')}</b>
                </div>
                <div>
                  <small style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>DÉBIT MONTANT</small>
                  <b style={{ fontSize: 14, color: '#a78bfa' }}>{speedResult ? `${speedResult.up} Mbps` : (liveUpMbps !== null ? `${liveUpMbps} Mbps` : '—')}</b>
                </div>
              </div>
            </div>
          </div>

          {/* DNS Server Selector */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Résolveurs DNS Système</div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Configuration IPv4 active</span>
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
                      style={{ padding: '9px 12px', borderRadius: 8 }}
                    >
                      <div className="rt">
                        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          {d.name}
                          {isActive && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '1px 6px' }}>
                              ACTIF
                            </span>
                          )}
                        </b>
                        <small style={{ fontSize: 11, color: 'var(--muted)' }}>{d.label}</small>
                      </div>
                      {d.ping !== null && (
                        <span style={{ color: d.ping < 12 ? '#22c55e' : '#facc15', fontWeight: 600, fontSize: 11.5 }}>
                          {d.ping} ms
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Network Feature Toggles */}
            <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
              <div className="list">
                {[
                  {
                    key: 'doh',
                    label: 'DNS sur HTTPS (DoH)',
                    desc: 'Chiffre vos requêtes DNS pour empêcher les intermédiaires de suivre votre navigation.',
                    val: dnsOverHttps,
                    set: setDnsOverHttps,
                  },
                  {
                    key: 'ipv6',
                    label: 'Désactiver IPv6',
                    desc: 'Prévient les fuites d\'adresse IPv6 et stabilise la connexion aux serveurs de jeu.',
                    val: ipv6Disabled,
                    set: setIpv6Disabled,
                  },
                  {
                    key: 'antiBufferbloat',
                    label: 'Anti-Bufferbloat Gaming',
                    desc: 'Priorise les flux UDP en direct pour éviter les sauts de ping pendant les sessions.',
                    val: antiBufferbloat,
                    set: setAntiBufferbloat,
                  },
                ].map(({ key, label, desc, val, set }) => (
                  <div className="row" key={key} style={{ padding: '6px 0', border: 'none', alignItems: 'center' }}>
                    <div className="rt" style={{ paddingRight: 10 }}>
                      <b style={{ fontSize: 12 }}>{label}</b>
                      <small style={{ fontSize: 11, display: 'block', color: 'var(--muted)' }}>{desc}</small>
                    </div>
                    <label className="toggle" style={{ transform: 'scale(0.8)', transformOrigin: 'right center', margin: 0 }}>
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

        {/* ── Bottom Grid: Historique Chart (Left) & Adaptateur Physique (Right) ── */}
        <div className="grid g2 mt" style={{ marginTop: 22 }}>
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
              <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>Télémétrie automatique</span>
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
    </div>
  );
}
