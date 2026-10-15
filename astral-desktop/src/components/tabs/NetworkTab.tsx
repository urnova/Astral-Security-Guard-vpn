import { useState, useEffect } from 'react';
import {
  Wifi, Play, RefreshCw, AlertTriangle, CheckCircle2,
  Info, Globe, Router, Activity, X
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

const DNS_PRESETS = [
  { name: 'Automatique (FAI)',  label: 'Par défaut du fournisseur', ping: null },
  { name: 'Cloudflare 1.1.1.1',label: 'Rapide · respect de la vie privée', ping: 9 },
  { name: 'Quad9 9.9.9.9',     label: 'Bloque les domaines malveillants',  ping: 12 },
  { name: 'Google 8.8.8.8',    label: 'Fiable et universel',               ping: 14 },
];

interface NetworkInfo {
  interfaceName: string;
  ip:           string;
  gateway:      string;
  dns:          string;
  isp:          string;
  macAddress:   string;
  wifiSsid?:    string;
  wifiSignal?:  number;
  type:         string;
}

interface SpeedResult { down: number; up: number; ping: number; jitter: number; }

export default function NetworkTab({ gamingActive }: { gamingActive: boolean }) {
  const [netInfo, setNetInfo]         = useState<NetworkInfo | null>(null);
  const [selectedDns, setSelectedDns] = useState('Automatique (FAI)');
  const [dnsOverHttps, setDnsOverHttps] = useState(false);
  const [ipv6Disabled, setIpv6Disabled] = useState(false);
  const [antiBufferbloat, setAntiBufferbloat] = useState(false);
  const [testing, setTesting]         = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [gaugeVal, setGaugeVal]       = useState(0);
  const [hist, setHist]               = useState<number[]>([]);
  const [notice, setNotice]           = useState('');
  const [error, setError]             = useState('');
  const [alerts, setAlerts]           = useState<string[]>([]);

  useEffect(() => {
    if (!api) return;
    api.getNetworkDiagnostics?.().then((d: any) => {
      if (!d) return;
      setNetInfo({
        interfaceName: d.adapterName || d.interface || 'Ethernet',
        ip:           d.localIp || d.ip || '—',
        gateway:      d.gateway || '—',
        dns:          d.dns || d.dnsServer || 'Non détecté',
        isp:          d.isp || d.provider || 'Non détecté',
        macAddress:   d.macAddress || '—',
        wifiSsid:     d.ssid || d.wifiName,
        wifiSignal:   d.signalStrength,
        type:         d.connectionType || 'Inconnu',
      });
    }).catch(() => {});

    api.getNetworkSettings?.().then((s: any) => {
      if (s?.dnsServer) setSelectedDns(s.dnsServer);
      if (s?.dnsOverHttps !== undefined) setDnsOverHttps(Boolean(s.dnsOverHttps));
      if (s?.ipv6Disabled !== undefined) setIpv6Disabled(Boolean(s.ipv6Disabled));
      if (s?.antiBufferbloat !== undefined) setAntiBufferbloat(Boolean(s.antiBufferbloat));
    }).catch(() => {});

    api.getSpeedHistory?.().then((h: any[]) => {
      if (Array.isArray(h)) setHist(h.slice(-7).map(v => typeof v === 'number' ? v : v.down || 0));
    }).catch(() => {});

    const c1 = api.on?.('network:issue', (d: any) => {
      if (d?.message) setAlerts(prev => [...prev.slice(-3), d.message]);
    });
    const c2 = api.on?.('network-event', (d: any) => {
      if (d?.type === 'speedtest-progress' && typeof d.currentMbps === 'number') {
        setGaugeVal(Math.min(100, (d.currentMbps / 1000) * 100));
      }
    });
    return () => { c1?.(); c2?.(); };
  }, []);

  const runSpeedTest = async () => {
    if (!api || testing) return;
    setTesting(true);
    setSpeedResult(null);
    setGaugeVal(0);
    setError('');

    // Smooth animation fallback if progress events take a moment
    let animated = false;
    const gauge = setInterval(() => {
      if (animated) { clearInterval(gauge); return; }
      setGaugeVal(v => v < 75 ? v + Math.random() * 2 : v);
    }, 120);

    try {
      const res = await api.runSpeedTest?.();
      animated = true;
      clearInterval(gauge);

      const down = res?.down ?? res?.result?.downloadMbps ?? res?.downloadMbps;
      const up = res?.up ?? res?.result?.uploadMbps ?? res?.uploadMbps ?? 0;
      const ping = res?.ping ?? res?.result?.pingMs ?? res?.pingMs ?? 0;
      const jitter = res?.jitter ?? res?.result?.jitterMs ?? res?.jitterMs ?? 0;

      if (res?.success && down !== undefined) {
        setSpeedResult({ down, up, ping, jitter });
        setGaugeVal(Math.min(100, (down / 1000) * 100));
        setHist(h => [...h.slice(-6), down]);
      } else {
        setError(res?.error || 'Test de connexion échoué.');
        setGaugeVal(0);
      }
    } catch (err: any) {
      animated = true;
      clearInterval(gauge);
      setError(err.message || 'Erreur lors du test de débit.');
      setGaugeVal(0);
    }
    setTesting(false);
  };

  const applyDns = async (name: string) => {
    setSelectedDns(name);
    try {
      const preset = DNS_PRESETS.find(d => d.name === name);
      const ip = name.match(/[\d.]+/)?.[0] || 'auto';
      await api.setDns?.({ server: ip, name });
      setNotice(`DNS changé : ${name}`);
    } catch (err: any) { setError(err.message); }
    setTimeout(() => setNotice(''), 4000);
  };

  const optimizeNetwork = async () => {
    try {
      await api.optimizeNetwork?.();
      setNotice('Réseau optimisé — Wi-Fi & DNS ajustés.');
    } catch (err: any) { setError(err.message); }
    setTimeout(() => setNotice(''), 4000);
  };

  const setSetting = async (key: string, val: boolean) => {
    try { await api.setNetworkSetting?.({ key, value: val }); } catch {}
  };

  // Gauge arc path
  const gaugePath = () => {
    const offset = 393 - (gaugeVal / 100) * 393;
    return offset;
  };

  const qualityLabel = () => {
    if (!speedResult) return null;
    const d = speedResult.down;
    if (d > 500) return { label: 'Excellente · Fibre haute vitesse', grade: 'A+' };
    if (d > 100) return { label: 'Bonne pour le streaming 4K', grade: 'A' };
    if (d > 50)  return { label: 'Correcte pour le gaming', grade: 'B' };
    return { label: 'Connexion lente', grade: 'C' };
  };

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Réseau</h1>
            <p className="sub">Test de connexion, historique et paramètres DNS.</p>
          </div>
          <button className="btn btn-ghost" onClick={optimizeNetwork}>
            <Wifi size={14} /> Optimiser le réseau
          </button>
        </div>

        {/* Alerts réseau */}
        {alerts.map((a, i) => (
          <div key={i} className="state-error" style={{ marginBottom: 10 }}>
            <AlertTriangle size={13} />
            <span>{a}</span>
            <button onClick={() => setAlerts(prev => prev.filter((_, j) => j !== i))} style={{ marginLeft: 'auto', color: 'var(--bad)' }}>
              <X size={12} />
            </button>
          </div>
        ))}
        {notice && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(104,184,148,.08)', border: '1px solid rgba(104,184,148,.20)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--ok)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={13} /> {notice}
          </div>
        )}
        {error && (
          <div className="state-error" style={{ marginBottom: 12 }}>
            <AlertTriangle size={13} />
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto' }}><X size={12} /></button>
          </div>
        )}

        <div className="grid g21">
          {/* Speed test */}
          <div className="card card-p-lg card-hero" style={{ textAlign: 'center' }}>
            {/* Gauge */}
            <div className="gauge" style={{ marginBottom: 12 }}>
              <svg viewBox="0 0 300 170">
                <path className="bgp" d="M25 150 A125 125 0 0 1 275 150" />
                <path
                  className="fgp"
                  d="M25 150 A125 125 0 0 1 275 150"
                  style={{ strokeDashoffset: gaugePath() }}
                />
              </svg>
              <div className="val">
                <div className="big" style={{ fontSize: 46 }}>
                  {speedResult ? Math.round(speedResult.down) : '—'}
                </div>
                <div className="mut sm">MBPS ↓</div>
              </div>
            </div>

            <button className="btn" style={{ padding: '13px 30px' }} onClick={runSpeedTest} disabled={testing}>
              {testing ? <><span className="spinner spinner-sm" /> Test…</> : <><Play size={16} /> Démarrer le test</>}
            </button>

            {/* Stats */}
            <div className="grid g4 mt" style={{ textAlign: 'left' }}>
              {[
                { label: 'Ping',       val: speedResult ? `${speedResult.ping} ms` : '—' },
                { label: 'Gigue',      val: speedResult ? `${speedResult.jitter} ms` : '—' },
                { label: 'Descendant', val: speedResult ? `${Math.round(speedResult.down)} Mbps` : '—' },
                { label: 'Montant',    val: speedResult ? `${Math.round(speedResult.up)} Mbps` : '—' },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0' }}>
                  <small className="mut">{label}</small>
                  <b className="md">{val}</b>
                </div>
              ))}
            </div>
          </div>

          {/* DNS */}
          <div className="card card-p-lg">
            <div className="lbl">Serveurs DNS</div>
            <div className="list">
              {DNS_PRESETS.map(d => (
                <div
                  key={d.name}
                  className={`row clickable${selectedDns === d.name ? ' selected' : ''}`}
                  onClick={() => applyDns(d.name)}
                >
                  <div className="rt">
                    <b>{d.name}</b>
                    <small>{d.label}</small>
                  </div>
                  {d.ping !== null && <span className="mut sm">{d.ping} ms</span>}
                </div>
              ))}
            </div>

            {/* DNS réel affiché */}
            {netInfo?.dns && netInfo.dns !== 'Non détecté' && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(var(--a1r),.05)', border: '1px solid rgba(var(--a1r),.12)', borderRadius: 'var(--r-sm)', fontSize: 11.5 }}>
                <span className="mut">DNS actif détecté : </span>
                <span className="mono" style={{ color: 'var(--a1)' }}>{netInfo.dns}</span>
              </div>
            )}

            {/* Options */}
            <div className="list" style={{ marginTop: 16 }}>
              {[
                { label: 'DNS sur HTTPS', desc: 'Chiffre tes requêtes DNS', key: 'dnsOverHttps', val: dnsOverHttps, set: setDnsOverHttps },
                { label: 'Désactiver IPv6', desc: 'Évite les fuites via IPv6', key: 'ipv6Disabled', val: ipv6Disabled, set: setIpv6Disabled },
                { label: 'Anti-bufferbloat', desc: 'Réduit la latence sous charge', key: 'antiBufferbloat', val: antiBufferbloat, set: setAntiBufferbloat },
              ].map(({ label, desc, key, val, set }) => (
                <div className="row" key={key}>
                  <div className="rt">
                    <b>{label}</b>
                    <small>{desc}</small>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={val} onChange={e => { set(e.target.checked); setSetting(key, e.target.checked); }} />
                    <span className="toggle-track" />
                    <span className="toggle-thumb" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History + Quality */}
        <div className="grid g2 mt">
          {hist.length > 0 && (
            <div className="card card-p-lg">
              <div className="lbl">Historique des vitesses (Mbps ↓)</div>
              <div className="hist">
                {hist.map((v, i) => (
                  <i
                    key={i}
                    style={{ height: `${Math.max(4, (v / Math.max(...hist, 1)) * 100)}%` }}
                    title={`${v} Mbps`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Network info */}
          {netInfo && (
            <div className="card card-p-lg">
              <div className="lbl"><Router size={14} />Informations de connexion</div>
              <div className="list">
                {[
                  { label: 'Interface',   val: netInfo.interfaceName },
                  { label: 'IP locale',   val: netInfo.ip },
                  { label: 'Passerelle',  val: netInfo.gateway },
                  { label: 'Fournisseur', val: netInfo.isp },
                  { label: 'Type',        val: netInfo.type },
                  ...(netInfo.wifiSsid ? [{ label: 'Wi-Fi SSID', val: netInfo.wifiSsid }] : []),
                  ...(netInfo.wifiSignal ? [{ label: 'Signal Wi-Fi', val: `${netInfo.wifiSignal} dBm` }] : []),
                ].map(({ label, val }) => (
                  <div className="row" key={label} style={{ padding: '9px 0' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 90 }}>{label}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quality card */}
        {qualityLabel() && speedResult && (
          <div className="card" style={{ display: 'flex', gap: 22, alignItems: 'center', padding: 22, marginTop: 16 }}>
            <div className="ring" style={{ width: 110, height: 110 }}>
              <svg viewBox="0 0 110 110">
                <circle className="bg-c" cx="55" cy="55" r="46" strokeWidth="9" />
                <circle className="fg-c" cx="55" cy="55" r="46" strokeWidth="9"
                  strokeDasharray={2 * Math.PI * 46}
                  strokeDashoffset={2 * Math.PI * 46 * (1 - Math.min(1, speedResult.down / 1000))}
                />
              </svg>
              <div className="center">
                <div className="md" style={{ fontSize: 26 }}>{qualityLabel()?.grade}</div>
              </div>
            </div>
            <div>
              <div className="lbl" style={{ margin: 0 }}>Qualité de ligne</div>
              <b className="md">{qualityLabel()?.label}</b>
              <p className="mut sm" style={{ marginTop: 6 }}>
                Ping : {speedResult.ping} ms · Gigue : {speedResult.jitter} ms
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
