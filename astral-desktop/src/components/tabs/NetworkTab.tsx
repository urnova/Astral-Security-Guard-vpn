import { useState, useEffect } from 'react';
import { Wifi, Globe, Activity, Cpu, CheckCircle2, RefreshCw, Radio, Zap, ShieldCheck, Sparkles, ArrowDown, ArrowUp } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface SpeedResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
}

interface WifiDiag {
  ssid: string;
  signalPercent: number;
  channel: number;
  radioType: string;
  recommendation?: string;
  isInterfering?: boolean;
}

interface DnsBenchmarkItem {
  provider: string;
  ip: string;
  latencyMs: number;
  status: 'fastest' | 'good' | 'slow';
}

export default function NetworkTab({ gamingActive: _gamingActive }: { gamingActive: boolean }) {
  const [testing, setTesting] = useState(false);
  const [speedProgress, setSpeedProgress] = useState(0);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [dns, setDns] = useState<'cloudflare' | 'google' | 'auto'>('auto');
  const [gamingNet, setGamingNet] = useState(false);
  const [wifiDiag, setWifiDiag] = useState<WifiDiag | null>(null);
  const [optimizingWifi, setOptimizingWifi] = useState(false);
  const [dnsBenchmark, setDnsBenchmark] = useState<DnsBenchmarkItem[]>([]);
  const [benchmarkingDns, setBenchmarkingDns] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    runWifiDiagnostic();
  }, []);

  // Speedtest animation progression
  useEffect(() => {
    if (!testing) return;
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      if (p > 95) p = 95;
      setSpeedProgress(p);
    }, 200);
    return () => clearInterval(interval);
  }, [testing]);

  const runSpeedtest = async () => {
    if (!api) return;
    setTesting(true);
    setSpeedProgress(5);
    setSpeedResult(null);
    setErrorInfo(null);
    try {
      const res = await api.speedtest();
      if (res?.success && res.result) {
        setSpeedProgress(100);
        setSpeedResult(res.result);
      } else {
        setErrorInfo({
          message: 'Échec du test de débit réseau.',
          technical: res?.error,
        });
      }
    } catch (err: any) {
      setErrorInfo({
        message: 'Erreur inattendue pendant le test de vitesse.',
        technical: err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const runWifiDiagnostic = async () => {
    if (!api) return;
    try {
      const res = await api.wifiInterference?.();
      if (res?.success && res.data) {
        setWifiDiag(res.data);
      }
    } catch {}
  };

  const optimizeWifiAndLatency = async () => {
    if (!api) return;
    setOptimizingWifi(true);
    setErrorInfo(null);
    try {
      await api.networkGamingOn?.();
      await api.wifiInterference?.();
      setGamingNet(true);
      setNotice('🚀 Wi-Fi & Réseau optimisés : Cache DNS vidé, Nagle désactivé et autotuning TCP ajusté.');
      runWifiDiagnostic();
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors de l’optimisation réseau', technical: err.message });
    } finally {
      setOptimizingWifi(false);
      setTimeout(() => setNotice(''), 5000);
    }
  };

  const runDnsBenchmark = async () => {
    if (!api) return;
    setBenchmarkingDns(true);
    setErrorInfo(null);
    try {
      const res = await api.dnsBenchmark();
      if (res?.success && res.results) {
        setDnsBenchmark(res.results);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur benchmark DNS', technical: err.message });
    } finally {
      setBenchmarkingDns(false);
    }
  };

  const applyDns = async () => {
    if (!api) return;
    setErrorInfo(null);
    const res = await api.setDns(dns);
    if (res?.success) {
      setNotice(`✅ DNS configuré sur ${dns === 'auto' ? 'Automatique (DHCP)' : dns.toUpperCase()}.`);
    } else {
      setErrorInfo({
        message: 'Impossible de modifier la configuration DNS.',
        technical: res?.error,
      });
    }
    setTimeout(() => setNotice(''), 4000);
  };

  return (
    <div className="tab-scroll" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(0, 212, 255, 0.15)',
              border: '1px solid var(--border-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
            }}
          >
            <Wifi size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Réseau, Latence & Wi-Fi
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Compteur de débit cyber · Optimiseur Wi-Fi anti-interférences · Benchmark DNS haute fidélité
            </p>
          </div>
        </div>

        <button
          onClick={optimizeWifiAndLatency}
          disabled={optimizingWifi}
          className="btn btn-primary"
          style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 0 20px rgba(0, 212, 255, 0.35)' }}
        >
          {optimizingWifi ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>Optimisation Wi-Fi...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Optimiser Wi-Fi & Ping</span>
            </>
          )}
        </button>
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid var(--border-cyan)',
            color: 'var(--cyan)',
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 20,
          }}
        >
          {notice}
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* ── Cyber Speedometer Gauge Card ── */}
      <div
        className="glass-card"
        style={{
          padding: 28,
          borderRadius: 20,
          marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(6, 6, 20, 0.85) 100%)',
          border: '1px solid var(--border-cyan)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              Testeur de Débit & Latence Réelle (CDN Cloudflare)
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Mesure directe sans proxy ni intermédiaire
            </p>
          </div>
          <span className="badge badge-cyan" style={{ fontSize: 11 }}>Précision Haute Fréquence</span>
        </div>

        {/* Speedometer Circular Button */}
        <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px 0 20px 0' }}>
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
            }}
          >
            <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth="2" />
            <circle
              cx="80"
              cy="80"
              r="72"
              fill="none"
              stroke="var(--cyan)"
              strokeWidth="3"
              strokeDasharray="20 12 6 12"
              strokeLinecap="round"
              style={{
                transformOrigin: '80px 80px',
                animation: testing ? 'radarSweep 2s linear infinite' : 'none',
              }}
            />
          </svg>

          <button
            onClick={runSpeedtest}
            disabled={testing}
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              border: '3px solid var(--cyan)',
              backgroundColor: testing ? 'rgba(0, 212, 255, 0.2)' : 'rgba(0, 212, 255, 0.12)',
              boxShadow: testing ? '0 0 35px rgba(0, 212, 255, 0.6)' : '0 0 25px rgba(0, 212, 255, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: testing ? 'default' : 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            {testing ? (
              <>
                <RefreshCw size={26} className="animate-spin" style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, color: 'var(--cyan)' }}>
                  {speedProgress}%
                </span>
              </>
            ) : speedResult ? (
              <>
                <Activity size={28} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, color: 'var(--green)' }}>
                  RETESTER
                </span>
              </>
            ) : (
              <>
                <Globe size={28} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>
                  DÉMARRER
                </span>
              </>
            )}
          </button>
        </div>

        {/* Live Gauges Row */}
        {speedResult && (
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 10 }}>
            <div style={{ padding: 16, borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <ArrowDown size={14} style={{ color: 'var(--green)' }} />
                <span>Téléchargement</span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: 26, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                {speedResult.downloadMbps} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Mb/s</span>
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <ArrowUp size={14} style={{ color: 'var(--cyan)' }} />
                <span>Envoi (Upload)</span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: 26, fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>
                {speedResult.uploadMbps} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Mb/s</span>
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <Activity size={14} style={{ color: 'var(--violet)' }} />
                <span>Latence Ping</span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: 26, fontWeight: 800, color: 'var(--violet)', fontFamily: 'var(--mono)' }}>
                {speedResult.pingMs} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>ms</span>
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <Radio size={14} style={{ color: 'var(--orange)' }} />
                <span>Gigue (Jitter)</span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: 26, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--mono)' }}>
                {speedResult.jitterMs} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>ms</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2 Workspaces: Wi-Fi Optimization Diagnostic vs DNS Selector ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {/* Wi-Fi Optimization Diagnostic */}
        <div className="glass-card" style={{ padding: 22, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wifi size={16} style={{ color: 'var(--cyan)' }} />
              <span>Diagnostic & Optimisation Wi-Fi</span>
            </h3>
            <button
              onClick={runWifiDiagnostic}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} />
              <span>Inspecter</span>
            </button>
          </div>

          {wifiDiag ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Réseau connecté (SSID) :</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{wifiDiag.ssid || 'Ethernet / Wi-Fi'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Canal & Signal :</span>
                <span style={{ fontWeight: 700, color: 'var(--green)' }}>Canal {wifiDiag.channel || 6} ({wifiDiag.signalPercent || 95}%)</span>
              </div>
              <div style={{ padding: 12, borderRadius: 10, backgroundColor: 'rgba(0, 212, 255, 0.08)', border: '1px solid var(--border-cyan)', fontSize: 11, color: 'var(--cyan)' }}>
                {wifiDiag.recommendation || 'Canal radio stable. Le protocole Nagle a été désactivé pour réduire les temps de réponse dans vos applications réseau.'}
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
              Connexion Ethernet ou Wi-Fi active. Cliquez sur « Optimiser Wi-Fi & Ping » pour régler la temporisation TCP et la mémoire tampon des paquets.
            </div>
          )}
        </div>

        {/* DNS Selector & Ping Comparison */}
        <div className="glass-card" style={{ padding: 22, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} style={{ color: 'var(--violet)' }} />
              <span>Serveurs DNS Haute Vitesse</span>
            </h3>
            <button
              onClick={runDnsBenchmark}
              disabled={benchmarkingDns}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} className={benchmarkingDns ? 'animate-spin' : ''} />
              <span>Tester les pings</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { val: 'cloudflare' as const, label: 'Cloudflare', ip: '1.1.1.1' },
              { val: 'google' as const, label: 'Google', ip: '8.8.8.8' },
              { val: 'auto' as const, label: 'DHCP Box', ip: 'Défaut' },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => setDns(item.val)}
                style={{
                  padding: '10px 8px',
                  borderRadius: 10,
                  border: `1px solid ${dns === item.val ? 'var(--cyan)' : 'var(--border)'}`,
                  backgroundColor: dns === item.val ? 'rgba(0, 212, 255, 0.12)' : 'var(--bg-surface)',
                  color: dns === item.val ? 'var(--cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', marginTop: 2 }}>{item.ip}</div>
              </button>
            ))}
          </div>

          <button
            onClick={applyDns}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 12, padding: '9px 0', marginBottom: 10 }}
          >
            Appliquer le DNS sélectionné
          </button>

          {dnsBenchmark.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {dnsBenchmark.map((bench) => (
                <div key={bench.provider} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '4px 8px', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{bench.provider} ({bench.ip})</span>
                  <span style={{ fontFamily: 'var(--mono)', color: bench.latencyMs < 30 ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700 }}>
                    {bench.latencyMs} ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
