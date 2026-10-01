import { useState, useEffect } from 'react';
import { Wifi, Globe, Activity, Cpu, CheckCircle, RefreshCw, Radio, Zap, ShieldCheck } from 'lucide-react';
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

interface Props {
  gamingActive: boolean;
}

export default function NetworkTab({ gamingActive: _gamingActive }: Props) {
  const [testing, setTesting] = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [netProcs, setNetProcs] = useState<any[]>([]);
  const [dns, setDns] = useState<'cloudflare' | 'google' | 'auto'>('auto');
  const [gamingNet, setGamingNet] = useState(false);
  const [wifiDiag, setWifiDiag] = useState<WifiDiag | null>(null);
  const [loadingWifi, setLoadingWifi] = useState(false);
  const [dnsBenchmark, setDnsBenchmark] = useState<DnsBenchmarkItem[]>([]);
  const [benchmarkingDns, setBenchmarkingDns] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getAdapters?.().then((r: any) => setAdapters(r?.adapters || []));
  }, []);

  const runSpeedtest = async () => {
    if (!api) return;
    setTesting(true);
    setSpeedResult(null);
    setErrorInfo(null);
    try {
      const res = await api.speedtest();
      if (res?.success && res.result) {
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
    setLoadingWifi(true);
    setErrorInfo(null);
    try {
      const res = await api.wifiInterference();
      if (res?.success && res.data) {
        setWifiDiag(res.data);
      } else {
        setWifiDiag(null);
        setNotice('ℹ️ Aucun adaptateur Wi-Fi actif ou interface filaire (Ethernet) détectée.');
        setTimeout(() => setNotice(''), 4000);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur diagnostic Wi-Fi', technical: err.message });
    } finally {
      setLoadingWifi(false);
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
      setNotice(`✅ DNS configuré sur ${dns === 'auto' ? 'Automatique (DHCP)' : dns.toUpperCase()} (Tunnels VPN tiers protégés)`);
    } else {
      setErrorInfo({
        message: 'Impossible de modifier la configuration DNS.',
        technical: res?.error,
      });
    }
    setTimeout(() => setNotice(''), 4000);
  };

  const toggleGamingNet = async () => {
    if (!api) return;
    setErrorInfo(null);
    if (!gamingNet) {
      const res = await api.networkGamingOn();
      if (res?.success) {
        setGamingNet(true);
        setNotice('⚡ Optimisations TCP/IP Gaming activées (AckFrequency & Nagle désactivé)');
      } else {
        setErrorInfo({ message: 'Droits administrateur requis pour optimiser TCP/IP.', technical: res?.error });
      }
    } else {
      await api.networkGamingOff();
      setGamingNet(false);
      setNotice('Paramètres réseau réinitialisés.');
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const loadProcesses = async () => {
    if (!api) return;
    const res = await api.getNetworkProcesses();
    setNetProcs(res?.processes || []);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(0, 212, 255, 0.15)',
              border: '1px solid var(--border-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
            }}
          >
            <Radio size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Réseau, Latence & Wi-Fi
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Test de débit Cloudflare Edge · Diagnostic Wi-Fi · Benchmark DNS · Coexistence VPN
            </p>
          </div>
        </div>

        {gamingNet && (
          <div className="badge badge-cyan" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>
            <span className="badge-dot" style={{ backgroundColor: 'var(--cyan)' }} />
            <span>TCP NO-DELAY ACTIF</span>
          </div>
        )}
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

      {/* Speed Test Card */}
      <div className="glass-card" style={{ padding: 24, borderRadius: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={18} style={{ color: 'var(--cyan)' }} />
              <span>Test de Débit & Latence Réelle (Cloudflare CDN)</span>
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Mesure directe haute précision sans proxy tiers
            </p>
          </div>

          <button
            onClick={runSpeedtest}
            disabled={testing}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {testing ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Test en cours...</span>
              </>
            ) : (
              <>
                <Activity size={14} />
                <span>Lancer le test de débit</span>
              </>
            )}
          </button>
        </div>

        {speedResult && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div style={{ padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Téléchargement</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                {speedResult.downloadMbps} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Mb/s</span>
              </p>
            </div>

            <div style={{ padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Envoi (Upload)</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 24, fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>
                {speedResult.uploadMbps} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Mb/s</span>
              </p>
            </div>

            <div style={{ padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Latence TCP</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 24, fontWeight: 800, color: 'var(--violet)', fontFamily: 'var(--mono)' }}>
                {speedResult.pingMs} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>ms</span>
              </p>
            </div>

            <div style={{ padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gigue (Jitter)</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 24, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--mono)' }}>
                {speedResult.jitterMs} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>ms</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grid 2 Columns: Gaming Net & DNS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 24 }}>
        {/* TCP Gaming Mode */}
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} style={{ color: 'var(--cyan)' }} />
              <span>Optimisation TCP / Nagle Gaming</span>
            </h3>
            <button
              onClick={toggleGamingNet}
              className={`btn ${gamingNet ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              {gamingNet ? 'Activé' : 'Désactivé'}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Désactive la temporisation Nagle (<code style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>TcpAckFrequency=1</code>) sur vos interfaces filaires et Wi-Fi pour éliminer les micro-saccades de paquets réseau.
          </p>
        </div>

        {/* DNS Optimizer & Benchmark */}
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} style={{ color: 'var(--violet)' }} />
              <span>Sélection & Benchmark DNS</span>
            </h3>
            <button
              onClick={runDnsBenchmark}
              disabled={benchmarkingDns}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} className={benchmarkingDns ? 'animate-spin' : ''} />
              <span>Comparer les pings</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { val: 'cloudflare' as const, label: 'Cloudflare', ip: '1.1.1.1' },
              { val: 'google' as const, label: 'Google', ip: '8.8.8.8' },
              { val: 'auto' as const, label: 'Auto (DHCP)', ip: 'Défaut' },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => setDns(item.val)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${dns === item.val ? 'var(--cyan)' : 'var(--border)'}`,
                  backgroundColor: dns === item.val ? 'rgba(0, 212, 255, 0.1)' : 'var(--bg-surface)',
                  color: dns === item.val ? 'var(--cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{item.label}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 10, fontFamily: 'var(--mono)' }}>{item.ip}</p>
              </button>
            ))}
          </div>

          <button
            onClick={applyDns}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 12, padding: '8px 0', marginBottom: 10 }}
          >
            Appliquer le DNS sélectionné
          </button>

          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={13} style={{ color: 'var(--green)' }} />
            <span>Protection Coexistence : les adaptateurs VPN tiers ne sont jamais modifiés.</span>
          </p>

          {dnsBenchmark.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dnsBenchmark.map((bench) => (
                <div key={bench.provider} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
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

      {/* Wi-Fi Channel Diagnostics */}
      <div className="glass-card" style={{ padding: 20, borderRadius: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wifi size={16} style={{ color: 'var(--cyan)' }} />
            <span>Diagnostic Interférences Canaux Wi-Fi</span>
          </h3>
          <button
            onClick={runWifiDiagnostic}
            disabled={loadingWifi}
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={12} className={loadingWifi ? 'animate-spin' : ''} />
            <span>Analyser le signal</span>
          </button>
        </div>

        {wifiDiag ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Réseau (SSID)</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{wifiDiag.ssid || 'Inconnu'}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qualité du signal</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{wifiDiag.signalPercent}%</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Canal Wi-Fi</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--cyan)' }}>{wifiDiag.channel}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recommandation</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{wifiDiag.recommendation || 'Canal optimal'}</p>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Cliquez sur « Analyser le signal » pour inspecter le canal et détecter d'éventuelles interférences avec les réseaux voisins.
          </p>
        )}
      </div>

      {/* Network Processes */}
      <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={16} style={{ color: 'var(--violet)' }} />
            <span>Connexions TCP Actives & Processus Réseau</span>
          </h3>
          <button
            onClick={loadProcesses}
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 8px' }}
          >
            Actualiser
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {netProcs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
              Cliquez sur « Actualiser » pour lister les processus disposant de sockets ouvertes.
            </p>
          ) : (
            netProcs.slice(0, 12).map((proc, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{proc.name || `PID ${proc.pid}`}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>PID {proc.pid}</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{proc.remote}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
