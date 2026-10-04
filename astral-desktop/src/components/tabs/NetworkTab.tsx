import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Wifi, Globe, Activity, CheckCircle2, Radio,
  ArrowDown, ArrowUp, Gauge, X, ShieldCheck, RotateCcw
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface SpeedResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  bytesTransferred?: number;
  timestamp?: string;
}

interface WifiDiagReport {
  ssid: string;
  signalPercent: number;
  channel: number;
  radioType: string;
  interferenceCount: number;
  recommendedChannel: number;
  isOptimal: boolean;
  recommendation: string;
}

export default function NetworkTab({ gamingActive: _gamingActive }: { gamingActive: boolean }) {
  const [testing, setTesting] = useState(false);
  const [testPhase, setTestPhase] = useState<'idle' | 'ping' | 'download' | 'upload' | 'complete'>('idle');
  const [liveDownloadMbps, setLiveDownloadMbps] = useState(0);
  const [liveUploadMbps, setLiveUploadMbps] = useState(0);
  const [livePing, setLivePing] = useState(0);
  const [liveJitter, setLiveJitter] = useState(0);
  const [liveBytes, setLiveBytes] = useState(0);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [activeView, setActiveView] = useState<'download' | 'upload'>('download');

  // DNS State
  const [activeDns, setActiveDns] = useState<'cloudflare' | 'google' | 'quad9' | 'auto'>('cloudflare');
  const [dnsBenchmarking, setDnsBenchmarking] = useState(false);
  const [dnsLatencies, setDnsLatencies] = useState<Record<string, number>>({});
  const [dnsNotice, setDnsNotice] = useState('');

  // Wi-Fi Diagnostic Modal State (Diagnostic réel via netsh)
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [loadingWifiDiag, setLoadingWifiDiag] = useState(false);
  const [wifiReport, setWifiReport] = useState<WifiDiagReport | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  // Listen to network speedtest streaming events
  useEffect(() => {
    if (!api) return;

    const cleanup = api.on('network-event', (event: any) => {
      if (event.type === 'speedtest-progress') {
        if (event.phase === 'ping') {
          setTestPhase('ping');
          if (event.ping) setLivePing(event.ping);
          if (event.jitter) setLiveJitter(event.jitter);
        } else if (event.phase === 'download') {
          setTestPhase('download');
          if (event.currentMbps !== undefined) setLiveDownloadMbps(event.currentMbps);
          if (event.ping) setLivePing(event.ping);
          if (event.jitter) setLiveJitter(event.jitter);
          if (event.bytesTransferred) setLiveBytes(event.bytesTransferred);
        } else if (event.phase === 'upload') {
          setTestPhase('upload');
          if (event.currentMbps !== undefined) setLiveUploadMbps(event.currentMbps);
          if (event.ping) setLivePing(event.ping);
          if (event.jitter) setLiveJitter(event.jitter);
          if (event.bytesTransferred) setLiveBytes(event.bytesTransferred);
        }
      } else if (event.type === 'speedtest-complete') {
        if (event.result) {
          setSpeedResult(event.result);
          setLiveDownloadMbps(event.result.downloadMbps);
          setLiveUploadMbps(event.result.uploadMbps);
          setLivePing(event.result.pingMs);
          setLiveJitter(event.result.jitterMs);
          if (event.result.bytesTransferred) setLiveBytes(event.result.bytesTransferred);
          setTestPhase('complete');
          setTesting(false);
        }
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const runOoklaSpeedtest = async () => {
    if (!api || testing) return;
    setTesting(true);
    setTestPhase('ping');
    setSpeedResult(null);
    setErrorInfo(null);
    setLiveDownloadMbps(0);
    setLiveUploadMbps(0);
    setLivePing(0);
    setLiveJitter(0);
    setLiveBytes(0);

    try {
      const res = await api.speedtest();
      if (res?.success && res.result) {
        setSpeedResult(res.result);
        setTestPhase('complete');
      } else {
        setTestPhase('idle');
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Échec de mesure du débit réseau.', technical: err.message });
      setTestPhase('idle');
    } finally {
      setTesting(false);
    }
  };

  const cancelSpeedtest = async () => {
    if (!api || !testing) return;
    try {
      await api.cancelSpeedtest?.();
    } catch {
      // Ignoré
    }
    setTesting(false);
    setTestPhase('idle');
  };

  const handleApplyDns = async (dns: 'cloudflare' | 'google' | 'quad9' | 'auto') => {
    setActiveDns(dns);
    setDnsNotice(`Passerelle DNS appliquée : ${dns.toUpperCase()}`);
    try {
      if (api?.setDns) {
        await api.setDns(dns);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de modifier le DNS.', technical: err.message });
    }
    setTimeout(() => setDnsNotice(''), 4000);
  };

  const handleRestoreDns = async () => {
    try {
      if (api?.restorePreviousDns) {
        const res = await api.restorePreviousDns();
        if (res?.success) {
          setDnsNotice(res.message || 'DNS d’origine restauré avec succès.');
        } else {
          setErrorInfo({ message: res?.error || 'Aucun DNS précédent sauvegardé.' });
        }
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors de la restauration du DNS.', technical: err.message });
    }
    setTimeout(() => setDnsNotice(''), 4000);
  };

  const benchmarkDnsServers = async () => {
    if (!api?.testDnsLatencies && !api?.dnsBenchmark) return;
    setDnsBenchmarking(true);
    try {
      const fn = api.testDnsLatencies || api.dnsBenchmark;
      const res = await fn();
      if (res?.success && res.results) {
        const mapping: Record<string, number> = {};
        for (const item of res.results) {
          mapping[item.id] = item.latencyMs;
        }
        setDnsLatencies(mapping);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Test de latence DNS indisponible.', technical: err.message });
    } finally {
      setDnsBenchmarking(false);
    }
  };

  const runWifiDiagnostic = async () => {
    setShowWifiModal(true);
    setLoadingWifiDiag(true);
    setWifiReport(null);
    try {
      if (api?.getWifiDiag) {
        const res = await api.getWifiDiag();
        if (res?.success && res.diag) {
          setWifiReport(res.diag);
        } else {
          setErrorInfo({ message: res?.error || 'Diagnostic Wi-Fi indisponible sur cette interface (ex: connexion filaire).' });
        }
      } else {
        setErrorInfo({ message: 'API de diagnostic réseau indisponible.' });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors du diagnostic Wi-Fi.', technical: err.message });
    } finally {
      setLoadingWifiDiag(false);
    }
  };

  // Speedometer calculation
  const currentSpeed = testing
    ? (testPhase === 'upload' ? liveUploadMbps : liveDownloadMbps)
    : (speedResult ? (activeView === 'download' ? speedResult.downloadMbps : speedResult.uploadMbps) : 0);

  // Exact Trigonometric Geometry for Radial Gauge:
  // Center: (160, 160), Radius: 105
  // Angular Span: -120deg to +120deg (240deg total)
  const needleAngle = Math.min(120, Math.max(-120, (currentSpeed / 1000) * 240 - 120));
  const arcLength = 440; // 2 * PI * 105 * (240 / 360) = 439.82
  const progressOffset = Math.max(0, arcLength - (arcLength * Math.min(1000, currentSpeed)) / 1000);

  // Precomputed Ticks (0, 100, 250, 500, 750, 1000 Mbps)
  const ticks = [
    { value: 0, label: '0', angle: -120 },
    { value: 100, label: '100', angle: -72 },
    { value: 250, label: '250', angle: -24 },
    { value: 500, label: '500', angle: 24 },
    { value: 750, label: '750', angle: 72 },
    { value: 1000, label: '1G', angle: 120 },
  ];

  return (
    <div className="tab-scroll">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Réseau & Bande Passante</h1>
          <p className="page-subtitle">Mesure réelle de débit Cloudflare, latence DNS et audit Wi-Fi netsh</p>
        </div>

        <button onClick={runWifiDiagnostic} className="btn btn-secondary">
          <Wifi size={15} style={{ color: 'var(--cyan)' }} />
          <span>Diagnostic Wi-Fi Réel</span>
        </button>
      </div>

      {errorInfo && (
        <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
      )}

      {dnsNotice && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: 'var(--cyan)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{dnsNotice}</span>
        </div>
      )}

      {/* Main Speedtest Cockpit */}
      <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        {/* Phase Pill */}
        <div style={{ marginBottom: 12 }}>
          <span className={`badge ${testing ? 'badge-cyan' : speedResult ? 'badge-green' : 'badge-purple'}`}>
            {testPhase === 'idle' && 'PRÊT POUR MESURE'}
            {testPhase === 'ping' && 'MESURE DE LA LATENCE...'}
            {testPhase === 'download' && 'TEST DÉBIT DESCENDANT'}
            {testPhase === 'upload' && 'TEST DÉBIT MONTANT'}
            {testPhase === 'complete' && 'ANALYSE TERMINÉE'}
          </span>
        </div>

        {/* Mathematically Centered Radial Gauge */}
        <div style={{ position: 'relative', width: 320, height: 210 }}>
          <svg viewBox="0 0 320 220" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <linearGradient id="speedArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="60%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Gauge Background Track Arc */}
            {/* Center: (160, 160), R: 105. Angle span: -120deg to +120deg */}
            {/* Start point: 160 + 105 * sin(-120) = 69.07, 160 - 105 * cos(-120) = 212.50 */}
            {/* End point:   160 + 105 * sin(120) = 250.93, 160 - 105 * cos(120) = 212.50 */}
            <path
              d="M 69.07,212.50 A 105,105 0 1,1 250.93,212.50"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="10"
              strokeLinecap="round"
            />

            {/* Active Progress Arc */}
            <path
              d="M 69.07,212.50 A 105,105 0 1,1 250.93,212.50"
              fill="none"
              stroke="url(#speedArcGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              strokeDashoffset={progressOffset}
              style={{ transition: 'stroke-dashoffset 0.22s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />

            {/* Ticks and Numerical Labels */}
            {ticks.map((t, idx) => {
              const rad = (t.angle * Math.PI) / 180;
              const x1 = 160 + 105 * Math.sin(rad);
              const y1 = 160 - 105 * Math.cos(rad);
              const x2 = 160 + 96 * Math.sin(rad);
              const y2 = 160 - 96 * Math.cos(rad);
              const lx = 160 + 82 * Math.sin(rad);
              const ly = 160 - 82 * Math.cos(rad) + 4;

              return (
                <g key={idx}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1.5" />
                  <text
                    x={lx}
                    y={ly}
                    fill="#64748b"
                    fontSize="9.5"
                    fontFamily="'JetBrains Mono', monospace"
                    textAnchor="middle"
                  >
                    {t.label}
                  </text>
                </g>
              );
            })}

            {/* Needle Pivot Group: perfectly centered at (160, 160) */}
            <g
              transform={`rotate(${needleAngle}, 160, 160)`}
              style={{ transition: 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
              {/* Sleek needle pointer pointing straight UP to Y=65 */}
              <polygon points="158,160 160,65 162,160" fill="var(--cyan)" />
              {/* Outer hub ring */}
              <circle cx="160" cy="160" r="9" fill="#090d16" stroke="var(--cyan)" strokeWidth="2.5" />
              {/* Inner pin */}
              <circle cx="160" cy="160" r="3.5" fill="#f8fafc" />
            </g>
          </svg>

          {/* Central Live Speed Value Readout */}
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: 0,
              right: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 38,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {currentSpeed.toFixed(1)}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--cyan)',
                letterSpacing: '0.08em',
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 4,
              }}
            >
              MBPS {testPhase === 'upload' || (!testing && activeView === 'upload') ? '· ENVOI' : '· DESCENTE'}
            </div>
          </div>
        </div>

        {/* View Toggle (Descendant vs Montant) */}
        {!testing && speedResult && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={() => setActiveView('download')}
              className={`btn btn-sm ${activeView === 'download' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <ArrowDown size={13} />
              <span>Descendant ({speedResult.downloadMbps} Mbps)</span>
            </button>
            <button
              onClick={() => setActiveView('upload')}
              className={`btn btn-sm ${activeView === 'upload' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <ArrowUp size={13} />
              <span>Montant ({speedResult.uploadMbps} Mbps)</span>
            </button>
          </div>
        )}

        {/* Primary Action Button */}
        <div style={{ marginTop: 18 }}>
          {testing ? (
            <button onClick={cancelSpeedtest} className="btn btn-danger btn-lg">
              <X size={16} />
              <span>INTERROMPRE LE TEST</span>
            </button>
          ) : (
            <button onClick={runOoklaSpeedtest} className="btn btn-primary btn-lg">
              <Gauge size={16} />
              <span>LANCER LE SPEEDTEST RÉEL</span>
            </button>
          )}
        </div>

        {/* Honest Real-Time Telemetry Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginTop: 24,
            padding: '16px 20px',
            borderRadius: 10,
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: 640,
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>LATENCE PING</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              {livePing > 0 ? `${livePing} ms` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>GIGUE (JITTER)</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              {liveJitter > 0 ? `${liveJitter} ms` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>VOLUME TRANSFÉRÉ</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              {liveBytes > 0 ? `${(liveBytes / (1024 * 1024)).toFixed(1)} Mo` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>INFRASTRUCTURE</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
              Cloudflare Edge
            </div>
          </div>
        </div>
      </div>

      {/* DNS Management Section */}
      <div className="card card-p-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Passerelles DNS Sécurisées</h2>
            <p className="card-subtitle">Réduisez la latence et bloquez les traqueurs avec des résolveurs Anycast certifiés</p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRestoreDns} className="btn btn-ghost btn-sm" title="Restaurer la configuration DNS Windows précédente">
              <RotateCcw size={14} />
              <span>Restaurer DNS Précédent</span>
            </button>
            <button onClick={benchmarkDnsServers} disabled={dnsBenchmarking} className="btn btn-secondary btn-sm">
              <Activity size={14} />
              <span>{dnsBenchmarking ? 'Mesure en cours...' : 'Tester les Latences'}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {/* Cloudflare */}
          <div
            onClick={() => handleApplyDns('cloudflare')}
            style={{
              padding: 16,
              borderRadius: 10,
              backgroundColor: activeDns === 'cloudflare' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: activeDns === 'cloudflare' ? '1px solid var(--cyan)' : '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Cloudflare 1.1.1.1</strong>
              {activeDns === 'cloudflare' && <CheckCircle2 size={15} style={{ color: 'var(--cyan)' }} />}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>1.1.1.1 · 1.0.0.1</div>
            <div style={{ fontSize: 11, color: '#10b981', marginTop: 8, fontWeight: 600 }}>
              {dnsLatencies['cloudflare'] ? `${dnsLatencies['cloudflare']} ms` : 'Ultra-rapide · Anycast'}
            </div>
          </div>

          {/* Quad9 */}
          <div
            onClick={() => handleApplyDns('quad9')}
            style={{
              padding: 16,
              borderRadius: 10,
              backgroundColor: activeDns === 'quad9' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: activeDns === 'quad9' ? '1px solid var(--cyan)' : '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Quad9 Security</strong>
              {activeDns === 'quad9' && <CheckCircle2 size={15} style={{ color: 'var(--cyan)' }} />}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>9.9.9.9 · 149.112.112.112</div>
            <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 8, fontWeight: 600 }}>
              {dnsLatencies['quad9'] ? `${dnsLatencies['quad9']} ms` : 'Anti-Malware & Confidentialité'}
            </div>
          </div>

          {/* Google */}
          <div
            onClick={() => handleApplyDns('google')}
            style={{
              padding: 16,
              borderRadius: 10,
              backgroundColor: activeDns === 'google' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: activeDns === 'google' ? '1px solid var(--cyan)' : '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Google Public DNS</strong>
              {activeDns === 'google' && <CheckCircle2 size={15} style={{ color: 'var(--cyan)' }} />}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>8.8.8.8 · 8.8.4.4</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, fontWeight: 600 }}>
              {dnsLatencies['google'] ? `${dnsLatencies['google']} ms` : 'Résolution mondiale stable'}
            </div>
          </div>

          {/* Automatic / DHCP */}
          <div
            onClick={() => handleApplyDns('auto')}
            style={{
              padding: 16,
              borderRadius: 10,
              backgroundColor: activeDns === 'auto' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: activeDns === 'auto' ? '1px solid var(--cyan)' : '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Automatique (DHCP)</strong>
              {activeDns === 'auto' && <CheckCircle2 size={15} style={{ color: 'var(--cyan)' }} />}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>Fourni par la Box / FAI</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontWeight: 600 }}>
              Configuration réseau par défaut
            </div>
          </div>
        </div>
      </div>

      {/* Wi-Fi Diagnostic Modal */}
      {showWifiModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(5, 8, 15, 0.85)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            className="card card-p-lg"
            style={{ width: '100%', maxWidth: 520, position: 'relative' }}
          >
            <button
              onClick={() => setShowWifiModal(false)}
              style={{
                position: 'absolute',
                top: 18,
                right: 18,
                color: 'var(--text-muted)',
                padding: 4,
              }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Wifi size={20} style={{ color: 'var(--cyan)' }} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                Rapport de Diagnostic Wi-Fi (netsh)
              </h3>
            </div>

            {loadingWifiDiag ? (
              <div className="state-loading">
                <Radio size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
                <span>Interrogation de l'interface réseau sans fil...</span>
              </div>
            ) : wifiReport ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Réseau Connecté (SSID)</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{wifiReport.ssid}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qualité du Signal</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: wifiReport.signalPercent > 70 ? '#10b981' : '#f59e0b', marginTop: 2 }}>
                      {wifiReport.signalPercent}%
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Canal Utilisé</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>Canal {wifiReport.channel}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Interférences Voisines (wifiInterference)</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: wifiReport.interferenceCount > 5 ? '#ef4444' : '#10b981', marginTop: 2 }}>
                      {wifiReport.interferenceCount} réseaux
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    backgroundColor: wifiReport.isOptimal ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                    border: wifiReport.isOptimal ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                    fontSize: 12.5,
                    color: wifiReport.isOptimal ? '#34d399' : '#fbbf24',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Analyse technique :</strong> {wifiReport.recommendation}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button onClick={() => setShowWifiModal(false)} className="btn btn-secondary">
                    Fermer le rapport
                  </button>
                </div>
              </div>
            ) : (
              <div className="state-empty">
                <ShieldCheck size={28} />
                <span>Aucune interface Wi-Fi active détectée (connexion Ethernet filaire active).</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
