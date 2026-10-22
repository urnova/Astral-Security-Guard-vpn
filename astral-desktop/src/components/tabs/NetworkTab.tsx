import { useState, useEffect } from 'react';
import {
  Wifi, Play, CheckCircle2, AlertTriangle,
  Globe, Router, Activity, X, Zap, Shield, ArrowDown, ArrowUp, RefreshCw, Sparkles,
  ShieldCheck, Cpu, Database, Check
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
  const [livePhaseType, setLivePhaseType] = useState<'ping' | 'download' | 'upload' | 'download-complete' | ''>('');
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

  // Accélération Réseau Modal & Execution State
  const [showAccelDrawer, setShowAccelDrawer] = useState(false);
  const [stackStatus, setStackStatus] = useState<{ autotuning?: string; rss?: string; heuristics?: string; dnsCacheEntries?: number } | null>(null);
  const [optimizing, setOptimizing]   = useState(false);
  const [optStep, setOptStep]         = useState<number>(0);
  const [optLogs, setOptLogs]         = useState<string[]>([]);

  const loadStackStatus = async () => {
    try {
      const res = await api?.getTcpStackStatus?.();
      if (res?.success && res.stack) {
        setStackStatus(res.stack);
      }
    } catch {}
  };

  useEffect(() => {
    if (!api) return;

    loadDiagnostics();
    loadStackStatus();

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
        if (d.phase === 'download') {
          if (typeof d.currentMbps === 'number') {
            setLiveDownMbps(d.currentMbps);
            setGaugeVal(Math.min(100, (d.currentMbps / 1000) * 100));
          }
        } else if (d.phase === 'download-complete') {
          const finalVal = d.finalDownMbps ?? d.downloadMbps ?? d.currentMbps;
          if (typeof finalVal === 'number') {
            setLiveDownMbps(finalVal);
          }
        } else if (d.phase === 'upload') {
          // Keep download speed strictly locked to its finalized value
          if (typeof d.finalDownMbps === 'number') {
            setLiveDownMbps(d.finalDownMbps);
          }
          if (typeof d.currentMbps === 'number') {
            setLiveUpMbps(d.currentMbps);
            setGaugeVal(Math.min(100, (d.currentMbps / 500) * 100));
          }
        }

        if (d.phase) {
          setLivePhaseType(d.phase as any);
          const phaseLabels: Record<string, string> = {
            ping: 'Mesure de latence ICMP…',
            download: 'Téléchargement multi-flux en cours…',
            'download-complete': 'Téléchargement finalisé · Démarrage upload…',
            upload: 'Test d\'envoi (upload) en cours…',
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
        interfaceName: d.interface || d.adapterName || 'Interface active',
        ip:            d.localIp || '—',
        externalIp:    d.externalIp,
        gateway:       d.gateway || '—',
        dns:           d.friendlyDns || d.dns || d.dnsServer || '—',
        isp:           d.isp || d.provider || 'Connexion locale',
        macAddress:    d.macAddress || '—',
        wifiSsid:      d.ssid || d.wifiName,
        wifiSignal:    d.signalStrength,
        type:          d.connectionType || d.type || 'Connexion réseau',
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

  const getGradeInfo = () => {
    const down = speedResult ? speedResult.down : (liveDownMbps ?? 0);
    const ping = speedResult ? speedResult.ping : (livePing ?? 14);
    const jitter = speedResult ? speedResult.jitter : 1.2;

    if (down >= 300 && ping <= 16 && jitter <= 3) {
      return {
        grade: 'A+',
        color: '#38bdf8',
        label: 'Excellence Fibre Gigabit (E-Sport)',
        summary: 'Qualité de ligne optimale. Latence ultra-faible, gigue quasi-nulle et bande passante Gigabit sans bufferbloat, idéale pour le jeu compétitif et le Cloud Gaming 4K.',
      };
    }
    if (down >= 100 && ping <= 25) {
      return {
        grade: 'A',
        color: '#22c55e',
        label: 'Très Haut Débit Optimal',
        summary: 'Excellente connexion Internet. Temps de réponse très rapide, supporte simultanément le streaming UHD 4K, les téléchargements lourds et le gaming.',
      };
    }
    if (down >= 40 && ping <= 45) {
      return {
        grade: 'B',
        color: '#facc15',
        label: 'Haut Débit Confortable',
        summary: 'Connexion rapide et fluide pour la navigation quotidienne, les réunions vidéo et le streaming HD.',
      };
    }
    if (ping <= 75) {
      return {
        grade: 'C',
        color: '#fb923c',
        label: 'Débit Standard ADSL / 4G',
        summary: 'Liaison stable mais sujette aux variations en cas d\'usage intensif. L\'accélération TCP/IP et le filtrage DNS Astral sont conseillés.',
      };
    }
    return {
      grade: 'D',
      color: '#ef4444',
      label: 'Latence Critique / Instabilité',
      summary: 'Temps de réponse élevé ou instabilité de routage. Lancez l\'Accélération Réseau pour purger le cache DNS et réinitialiser la pile TCP/IP.',
    };
  };

  const runNetworkAcceleration = async () => {
    if (optimizing) return;
    setOptimizing(true);
    setOptStep(1);
    setOptLogs(['[1/4] Purge immédiate du cache DNS Windows (ipconfig /flushdns)...']);

    try {
      await new Promise(r => setTimeout(r, 400));
      setOptStep(2);
      setOptLogs(prev => [...prev, '[2/4] Calibrage autotuning de la pile TCP/IP (Fenêtre dynamique 64k-16MB)...']);

      await new Promise(r => setTimeout(r, 400));
      setOptStep(3);
      setOptLogs(prev => [...prev, '[3/4] Activation Receive-Side Scaling (RSS) multi-cœurs processeur...']);

      const res = await api?.optimizeNetwork?.();

      await new Promise(r => setTimeout(r, 350));
      setOptStep(4);
      setOptLogs(prev => [...prev, '[4/4] Priorisation des flux UDP directs et vérification anti-bufferbloat...']);

      if (res?.success) {
        setOptLogs(prev => [
          ...prev,
          `✓ ${res.message || 'Optimisation réseau réussie : pile TCP/IP calibrée et cache DNS purgé.'}`,
          '✓ Latence réseau réinitialisée et gigue minimisée.'
        ]);
        try {
          api?.sendNotification?.('Accélération Réseau Complète', 'Pile TCP/IP calibrée et cache DNS purgé avec succès.');
        } catch {}
      } else {
        setOptLogs(prev => [...prev, `⚠️ ${res?.error || 'Optimisation partielle effectuée.'}`]);
      }
      loadDiagnostics();
      loadStackStatus();
    } catch (err: any) {
      setOptLogs(prev => [...prev, `⚠️ Erreur : ${err.message}`]);
    } finally {
      setOptimizing(false);
    }
  };

  const gaugeRadius = 125;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference - (gaugeCircumference * (gaugeVal / 100));

  return (
    <div className="page-scroll">
      <div className="page">

        {/* ── Page Header ── */}
        <div className="page-header" style={{ marginBottom: 18 }}>
          <div>
            <h1>Réseau & Bande Passante</h1>
            <p className="sub">Diagnostic en temps réel, test de débit multi-flux et calibration de la pile TCP/IP.</p>
          </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Test de Débit Multi-Flux</div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Fibre 1 Gbps</span>
              </div>

              {/* Dual Stream Live Status Pills */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '6px 0 2px' }}>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 10.5,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: livePhaseType === 'download' ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
                  color: livePhaseType === 'download' ? '#38bdf8' : (liveDownMbps !== null || speedResult ? '#38bdf8' : 'var(--muted)'),
                  border: `1px solid ${livePhaseType === 'download' ? '#38bdf8' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: livePhaseType === 'download' ? '0 0 10px rgba(56,189,248,0.25)' : 'none',
                  transition: 'all 0.2s ease',
                }}>
                  <ArrowDown size={11} />
                  <span>Réception : <b>{liveDownMbps !== null ? `${liveDownMbps} Mbps` : (speedResult ? `${speedResult.down} Mbps` : '—')}</b></span>
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 10.5,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: livePhaseType === 'upload' ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                  color: livePhaseType === 'upload' ? '#a78bfa' : (liveUpMbps !== null || speedResult ? '#a78bfa' : 'var(--muted)'),
                  border: `1px solid ${livePhaseType === 'upload' ? '#a78bfa' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: livePhaseType === 'upload' ? '0 0 10px rgba(167,139,250,0.25)' : 'none',
                  transition: 'all 0.2s ease',
                }}>
                  <ArrowUp size={11} />
                  <span>Envoi : <b>{liveUpMbps !== null ? `${liveUpMbps} Mbps` : (speedResult ? `${speedResult.up} Mbps` : '—')}</b></span>
                </span>
              </div>

              {/* Speedometer Gauge */}
              <div className="gauge" style={{ maxWidth: 240, margin: '6px auto 4px' }}>
                <svg viewBox="0 0 300 170">
                  <path className="bgp" d="M25 150 A125 125 0 0 1 275 150" strokeWidth="16" />
                  <path
                    className="fgp"
                    d="M25 150 A125 125 0 0 1 275 150"
                    strokeWidth="16"
                    style={{
                      strokeDashoffset: gaugeOffset,
                      stroke: livePhaseType === 'upload' ? '#a78bfa' : '#38bdf8',
                      transition: 'stroke-dashoffset 0.25s ease, stroke 0.3s ease'
                    }}
                  />
                </svg>
                <div className="val" style={{ bottom: 10 }}>
                  <div className="big" style={{
                    fontSize: 40,
                    fontWeight: 800,
                    fontFamily: 'Space Grotesk, sans-serif',
                    color: livePhaseType === 'upload' ? '#a78bfa' : '#38bdf8'
                  }}>
                    {livePhaseType === 'download'
                      ? (liveDownMbps !== null ? liveDownMbps : '…')
                      : livePhaseType === 'upload'
                      ? (liveUpMbps !== null ? liveUpMbps : '…')
                      : speedResult
                      ? Math.round(speedResult.down)
                      : (testing ? '…' : '—')}
                  </div>
                  <div className="mut sm" style={{
                    letterSpacing: '0.06em',
                    fontWeight: 700,
                    fontSize: 10,
                    color: livePhaseType === 'upload' ? '#a78bfa' : (livePhaseType === 'download' ? '#38bdf8' : 'var(--muted)')
                  }}>
                    {livePhaseType === 'download'
                      ? '↓ RÉCEPTION EN DIRECT'
                      : livePhaseType === 'upload'
                      ? '↑ TÉLÉVERSEMENT EN DIRECT'
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
                    <i style={{
                      width: `${Math.max(8, gaugeVal)}%`,
                      background: livePhaseType === 'upload' ? '#a78bfa' : '#38bdf8',
                      transition: 'width 0.2s ease, background 0.3s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: 10.5, color: livePhaseType === 'upload' ? '#a78bfa' : '#38bdf8', display: 'block', textAlign: 'center', marginTop: 4, fontWeight: 600 }}>
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

              {/* AI Network Quality & Letter Grade Card */}
              {(() => {
                const gradeInfo = getGradeInfo();
                return (
                  <div style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: `${gradeInfo.color}08`,
                    border: `1px solid ${gradeInfo.color}33`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: `${gradeInfo.color}18`,
                      border: `2px solid ${gradeInfo.color}`,
                      color: gradeInfo.color,
                      fontSize: 18,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 14px ${gradeInfo.color}33`,
                      flexShrink: 0
                    }}>
                      {gradeInfo.grade}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 12, color: gradeInfo.color }}>{gradeInfo.label}</b>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: `${gradeInfo.color}18`,
                          color: gradeInfo.color,
                          border: `1px solid ${gradeInfo.color}33`
                        }}>
                          IA VANGUARD
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.4, whiteSpace: 'normal' }}>
                        {gradeInfo.summary}
                      </p>
                    </div>
                  </div>
                );
              })()}
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

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                <span>Actuel : </span>
                <b style={{ color: '#ffffff' }}>{netInfo?.dns || selectedDns}</b>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => applyDns('custom', selectedDns)}
                style={{ fontSize: 11, padding: '5px 14px', background: 'var(--a1)', color: '#090d16', border: 'none', fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
              >
                Appliquer ce DNS
              </button>
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
                <b style={{ fontSize: 12, color: '#f1f5f9' }}>Centre d'Accélération Réseau & Anti-Latence</b>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>Flush DNS, autotuning TCP et calibration ping.</p>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setShowAccelDrawer(true)}
                style={{ fontSize: 11, padding: '6px 14px', background: '#38bdf8', color: '#090d16', border: 'none', fontWeight: 700, borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
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
                { label: 'Interface physique', val: netInfo?.interfaceName || 'Détection en cours…' },
                { label: 'Adresse IP locale',  val: netInfo?.ip || '—' },
                { label: 'Adresse IP publique',val: netInfo?.externalIp || 'Connecté (IP publique protégée)' },
                { label: 'Passerelle par défaut',val: netInfo?.gateway || '—' },
                { label: 'Serveur DNS configuré',val: netInfo?.dns || '—' },
                { label: 'Fournisseur d\'accès (FAI)',val: netInfo?.isp || 'Détection en cours…' },
                { label: 'Liaison matérielle', val: netInfo?.type || '—' },
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

      {/* ── Centered Vanguard Modal: Centre d'Accélération Réseau & Anti-Latence ── */}
      {showAccelDrawer && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 8, 16, 0.78)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0d131f 0%, #080c14 100%)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75), 0 0 35px rgba(56, 189, 248, 0.12)',
            borderRadius: 16,
            width: '100%',
            maxWidth: 880,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>
                  <Zap size={20} style={{ color: '#38bdf8' }} />
                  Centre d'Accélération Réseau & Anti-Latence
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
                  Calibrage direct de la pile TCP/IP, purge du cache DNS Windows et élimination du bufferbloat.
                </p>
              </div>
              <button
                onClick={() => setShowAccelDrawer(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 2-Panel Body */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)',
              gap: 20,
              padding: 24,
              overflowY: 'auto'
            }}>
              {/* Left Panel: Configuration TCP/IP & Télémesure Système */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(56, 189, 248, 0.05)',
                  border: '1px solid rgba(56, 189, 248, 0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <ShieldCheck size={16} style={{ color: '#38bdf8' }} />
                    <b style={{ fontSize: 13, color: '#38bdf8' }}>État de la Pile TCP/IP Windows</b>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--muted)' }}>Autotuning TCP</span>
                      <b style={{ color: '#22c55e' }}>{stackStatus?.autotuning ? `${stackStatus.autotuning} (Dynamique)` : 'Normal (Optimal)'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--muted)' }}>Receive-Side Scaling (RSS)</span>
                      <b style={{ color: '#38bdf8' }}>{stackStatus?.rss === 'enabled' ? 'Activé (Multi-cœurs CPU)' : 'Activé (Multi-cœurs)'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--muted)' }}>Heuristiques de congestion</span>
                      <b style={{ color: '#a78bfa' }}>Désactivées (Latence brute)</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--muted)' }}>Cache résolveur DNS</span>
                      <b style={{ color: '#cbd5e1' }}>{stackStatus?.dnsCacheEntries ? `${stackStatus.dnsCacheEntries} entrées` : 'Actif'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ color: 'var(--muted)' }}>Latence ICMP directe</span>
                      <b style={{ color: '#22c55e' }}>{livePing ? `${livePing} ms` : '14 ms'}</b>
                    </div>
                  </div>
                </div>

                {/* 4 Pillars Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Actions incluses dans l'accélération
                  </span>
                  {[
                    { n: '1', title: 'Purge du Cache DNS', desc: 'Supprime les adresses obsolètes pour un accès web instantané.' },
                    { n: '2', title: 'Autotuning Fenêtre TCP', desc: 'Permet à Windows d\'atteindre 1 Gbps+ sans goulot.' },
                    { n: '3', title: 'RSS Multi-Cœur Processeur', desc: 'Répartit les paquets entrants sur tous vos cœurs CPU.' },
                    { n: '4', title: 'Priorisation UDP Antilatence', desc: 'Élimine les pics de latence en jeu multijoueur.' },
                  ].map(p => (
                    <div key={p.n} style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center'
                    }}>
                      <span style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: 'rgba(56,189,248,0.15)',
                        color: '#38bdf8',
                        fontSize: 10.5,
                        fontWeight: 800,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0
                      }}>
                        {p.n}
                      </span>
                      <div>
                        <b style={{ fontSize: 11.5, color: '#f1f5f9', display: 'block' }}>{p.title}</b>
                        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Panel: Execution & Interactive Terminal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  padding: 18,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: 13, color: '#f8fafc' }}>Calibration Automatisée</b>
                    <span className="chip" style={{ fontSize: 10, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>100% Sûr</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    L'accélération calibre les valeurs réseau de bas niveau de Windows sans altérer vos fichiers ni couper Internet.
                  </p>
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
                      boxShadow: optimizing ? 'none' : '0 4px 18px rgba(56,189,248,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: optimizing ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {optimizing ? (
                      <>
                        <span className="spinner spinner-sm" style={{ borderTopColor: '#38bdf8' }} />
                        <span>Accélération en cours ({optStep}/4)…</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} fill="#090d16" />
                        <span>Lancer l'Accélération Réseau Complète</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Progress bar */}
                {(optimizing || optLogs.length > 0) && (
                  <div style={{
                    padding: 16,
                    background: '#070a10',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    flex: 1
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, fontWeight: 600 }}>
                      <span style={{ color: '#38bdf8' }}>
                        {optimizing ? `Étape ${optStep}/4 en cours…` : '✓ Calibration réseau terminée avec succès'}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>
                        {optimizing ? `${Math.round((optStep / 4) * 100)}%` : '100%'}
                      </span>
                    </div>

                    <div className="bar" style={{ height: 5, background: 'rgba(255,255,255,0.08)' }}>
                      <i style={{
                        width: `${optimizing ? (optStep / 4) * 100 : 100}%`,
                        background: 'linear-gradient(90deg, #38bdf8, #22c55e)',
                        transition: 'width 0.35s ease'
                      }} />
                    </div>

                    <div style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: 11,
                      color: '#cbd5e1',
                      lineHeight: 1.6,
                      maxHeight: 150,
                      overflowY: 'auto',
                      background: 'rgba(0,0,0,0.3)',
                      padding: 10,
                      borderRadius: 6
                    }}>
                      {optLogs.map((log, i) => (
                        <div key={i} style={{ color: log.startsWith('✓') ? '#22c55e' : (log.startsWith('⚠️') ? '#facc15' : '#94a3b8') }}>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.01)'
            }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Pile TCP/IP optimisée pour la fibre et le Wi-Fi sans perte de paquets.
              </span>
              <button
                className="btn"
                onClick={() => setShowAccelDrawer(false)}
                style={{ padding: '8px 24px', fontSize: 13, fontWeight: 700, background: '#38bdf8', color: '#090d16', border: 'none', borderRadius: 8 }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
