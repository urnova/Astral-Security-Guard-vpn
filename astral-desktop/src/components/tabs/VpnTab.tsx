import { useState, useEffect, useRef } from 'react';
import { Power, RefreshCw, ChevronDown, Lock, Globe, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getFeature } from '../../shared/featureAvailability';

const api = (window as any).vanguard;

/* ─────────────── Types ─────────────── */
interface VpnNode   { name: string; latency?: number; }
interface Country   { cc: string; name: string; latency: number; nodes: VpnNode[]; }
interface ThirdPartyVpn {
  id:         string;   // 'nordvpn' | 'expressvpn' | 'protonvpn' | ...
  name:       string;
  detected:   boolean;
  connected:  boolean;
  serverName: string;
  ip?:        string;
  servers?:   Country[];
}

/* ─────────────── VPN Countries (Astral) ─────────────── */
const ASTRAL_COUNTRIES: Country[] = [
  { cc: 'FR', name: 'France',          latency: 12,  nodes: [{ name: 'Paris Core Alpha' }, { name: 'Marseille Edge' }] },
  { cc: 'DE', name: 'Allemagne',       latency: 16,  nodes: [{ name: 'Francfort DE-CIX Main' }, { name: 'Berlin Relay' }] },
  { cc: 'NL', name: 'Pays-Bas',        latency: 18,  nodes: [{ name: 'Amsterdam AMS-IX' }] },
  { cc: 'GB', name: 'Royaume-Uni',     latency: 22,  nodes: [{ name: 'Londres LINX' }] },
  { cc: 'CH', name: 'Suisse',          latency: 24,  nodes: [{ name: 'Zurich Core' }] },
  { cc: 'SE', name: 'Suède',           latency: 31,  nodes: [{ name: 'Stockholm Nord' }] },
  { cc: 'JP', name: 'Japon',           latency: 148, nodes: [{ name: 'Tokyo Gaming Route #1' }] },
  { cc: 'CA', name: 'Canada',          latency: 90,  nodes: [{ name: 'Montréal QIX' }] },
  { cc: 'US', name: 'États-Unis',      latency: 110, nodes: [{ name: 'New York NYIIX' }, { name: 'Los Angeles Any2' }] },
];

/* ─────────────── Subcomponents ─────────────── */
function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle" style={{ opacity: disabled ? .4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => !disabled && onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

function CountryRow({
  country, selected, onSelect,
}: {
  country: Country;
  selected: string | null;
  onSelect: (node: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ctry${open ? ' open' : ''}`} style={{ borderBottom: '1px solid var(--line)' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => setOpen(v => !v)}
      >
        <span className="cc">{country.cc}</span>
        <div className="rt">
          <b>{country.name}</b>
          <small>{country.nodes.length} nœud{country.nodes.length > 1 ? 's' : ''}</small>
        </div>
        <span className={`chip${country.latency > 60 ? ' warn' : ''}`}>{country.latency} ms</span>
        <span className="chev"><ChevronDown size={16} /></span>
      </div>
      <div className="ctry-nodes">
        {country.nodes.map(node => (
          <div
            key={node.name}
            className={`row clickable${selected === node.name ? ' selected' : ''}`}
            style={{ margin: '0 12px 10px', borderRadius: 'var(--r-sm)', padding: '11px 14px', border: selected === node.name ? '1px solid rgba(var(--a1r),.25)' : 'none', background: selected === node.name ? 'rgba(var(--a1r),.06)' : 'transparent' }}
            onClick={() => onSelect(node.name)}
          >
            <div className="rt">
              <b>{node.name}</b>
              <small>WireGuard · {900 - country.latency * 2} Mbps</small>
            </div>
            {selected === node.name && <CheckCircle2 size={14} style={{ color: 'var(--a1)' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Main Component ─────────────── */
export default function VpnTab() {
  const vpnFeature = getFeature('vpnConnection');
  const ksFeature  = getFeature('vpnKillSwitch');
  const vpnAvailable = vpnFeature.status === 'available' || vpnFeature.status === 'partially-available';
  const ksAvailable  = ksFeature.status === 'available';

  /* Astral VPN state */
  const [connected, setConnected]     = useState(false);
  const [connecting, setConnecting]   = useState(false);
  const [selectedNode, setSelectedNode] = useState('Paris Core Alpha');
  const [proto, setProto]             = useState<'WireGuard' | 'OpenVPN'>('WireGuard');
  const [killSwitch, setKillSwitch]   = useState(false);
  const [connectedSince, setConnectedSince] = useState<Date | null>(null);
  const [elapsed, setElapsed]         = useState('00:00');
  const [downBytes, setDownBytes]     = useState<number | null>(null);
  const [upBytes, setUpBytes]         = useState<number | null>(null);
  const [query, setQuery]             = useState('');
  const [error, setError]             = useState('');

  /* Third-party VPN state */
  const [thirdPartyVpns, setThirdPartyVpns] = useState<ThirdPartyVpn[]>([]);
  const [activeProvider, setActiveProvider]  = useState<string>('astral'); // 'astral' | vpn id
  const [loadingProviders, setLoadingProviders] = useState(true);

  const timerRef = useRef<any>(null);

  /* ── Timer ── */
  useEffect(() => {
    if (connected && connectedSince) {
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - connectedSince.getTime()) / 1000);
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        const h = Math.floor(s / 3600);
        setElapsed(h > 0 ? `${h.toString().padStart(2, '0')}:${m}:${sec}` : `${m}:${sec}`);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed('00:00');
    }
    return () => clearInterval(timerRef.current);
  }, [connected, connectedSince]);

  /* ── API init ── */
  useEffect(() => {
    if (!api) { setLoadingProviders(false); return; }

    /* Detect third-party VPNs */
    setLoadingProviders(true);
    api.detectThirdPartyVpns?.().then((vpns: any[]) => {
      if (Array.isArray(vpns)) {
        const mapped: ThirdPartyVpn[] = vpns.map(v => ({
          id:         v.id || v.name.toLowerCase().replace(/\s+/g, ''),
          name:       v.name,
          detected:   Boolean(v.detected),
          connected:  Boolean(v.connected),
          serverName: v.serverName || v.server || '',
          ip:         v.ip,
          servers:    v.servers,
        }));
        setThirdPartyVpns(mapped);

        // Auto-select the one that is currently connected
        const activeVpn = mapped.find(v => v.connected);
        if (activeVpn) setActiveProvider(activeVpn.id);
      }
    }).catch(() => {}).finally(() => setLoadingProviders(false));

    /* Astral VPN status */
    api.vpnGetStatus?.().then((s: any) => {
      if (s?.connected) {
        setConnected(true);
        setConnectedSince(new Date(Date.now() - (s.durationMs || 0)));
        if (s.serverName) setSelectedNode(s.serverName);
      }
    }).catch(() => {});

    /* Settings */
    api.vpnGetSettings?.().then((s: any) => {
      if (s?.killSwitch !== undefined) setKillSwitch(Boolean(s.killSwitch));
      if (s?.protocol) setProto(s.protocol);
    }).catch(() => {});

    /* Real-time events */
    const c1 = api.on?.('vpn:connected', (d: any) => {
      setConnected(true); setConnecting(false);
      setConnectedSince(new Date());
      if (d?.serverName) setSelectedNode(d.serverName);
    });
    const c2 = api.on?.('vpn:disconnected', () => {
      setConnected(false); setConnecting(false); setConnectedSince(null);
    });
    const c3 = api.on?.('vpn:stats', (d: any) => {
      if (d?.down !== undefined) setDownBytes(d.down);
      if (d?.up !== undefined)   setUpBytes(d.up);
    });
    const c4 = api.on?.('vpn:thirdparty-status-changed', (d: any) => {
      setThirdPartyVpns(prev => prev.map(v =>
        v.id === d.id ? { ...v, connected: d.connected, serverName: d.serverName || v.serverName } : v
      ));
      if (d.connected) setActiveProvider(d.id);
      else if (activeProvider === d.id) setActiveProvider('astral');
    });

    return () => { c1?.(); c2?.(); c3?.(); c4?.(); };
  }, []);

  /* ── Connect/Disconnect (Astral VPN) ── */
  const handleConnect = async () => {
    if (!api || !vpnAvailable) return;
    setError('');
    if (connected) {
      setConnecting(true);
      try { await api.vpnDisconnect?.(); } catch (err: any) { setError(err.message); }
      setConnecting(false);
    } else {
      setConnecting(true);
      try { await api.vpnConnect?.({ node: selectedNode, protocol: proto }); }
      catch (err: any) { setError(err.message); setConnecting(false); }
    }
  };

  /* ── Connect/Disconnect (Third-Party) ── */
  const handleThirdPartyToggle = async (vpn: ThirdPartyVpn) => {
    if (!api) return;
    setError('');
    try {
      if (vpn.connected) {
        await api.controlThirdPartyVpn?.({ id: vpn.id, action: 'disconnect' });
      } else {
        await api.controlThirdPartyVpn?.({ id: vpn.id, action: 'connect' });
      }
    } catch (err: any) { setError(err.message); }
  };

  const fmtBytes = (b: number | null) => {
    if (b === null) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
    return `${(b / 1024 / 1024).toFixed(1)} Mo`;
  };

  const filteredCountries = ASTRAL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.nodes.some(n => n.name.toLowerCase().includes(query.toLowerCase()))
  );

  /* Status chip for Astral VPN */
  const StatusChip = () => {
    if (connecting) return <span className="chip warn"><span className="dot" />CONNEXION EN COURS…</span>;
    if (connected)  return <span className="chip"><span className="dot" />CONNECTÉ · TUNNEL ACTIF</span>;
    return <span className="chip idle"><span className="dot" />DÉCONNECTÉ · AUCUN TUNNEL</span>;
  };

  const detectedVpns = thirdPartyVpns.filter(v => v.detected);

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>VPN</h1>
            <p className="sub">Gérez votre connexion et choisissez un serveur.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Kill switch</span>
            <Toggle checked={killSwitch} onChange={v => { setKillSwitch(v); api?.vpnSetKillSwitch?.({ enabled: v }); }} disabled={!ksAvailable} />
          </div>
        </div>

        {error && (
          <div className="state-error" style={{ marginBottom: 14 }}>
            <AlertTriangle size={13} />
            <span>{error}</span>
          </div>
        )}

        {/* Provider tabs — Astral + detected third-party VPNs */}
        {(detectedVpns.length > 0 || loadingProviders) && (
          <div style={{ marginBottom: 16 }}>
            <div className="seg">
              <button
                className={activeProvider === 'astral' ? 'on' : ''}
                onClick={() => setActiveProvider('astral')}
              >
                Astral VPN <span style={{ fontSize: 10, color: 'var(--ok)', marginLeft: 4 }}>Gratuit</span>
              </button>
              {detectedVpns.map(v => (
                <button
                  key={v.id}
                  className={activeProvider === v.id ? 'on' : ''}
                  onClick={() => setActiveProvider(v.id)}
                  style={{ position: 'relative' }}
                >
                  {v.name}
                  {v.connected && (
                    <span className="dot" style={{ color: 'var(--ok)', marginLeft: 6 }} />
                  )}
                </button>
              ))}
            </div>
            {loadingProviders && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--dim)', fontSize: 11 }}>
                <span className="spinner spinner-sm" />
                Détection des VPN installés…
              </div>
            )}
          </div>
        )}

        {/* ─── Astral VPN panel ─── */}
        {activeProvider === 'astral' && (
          <div className="grid g12">
            {/* Connection button */}
            <div className="card card-p-lg card-hero" style={{ textAlign: 'center' }}>
              {!vpnAvailable ? (
                <div className="state-empty">
                  <span className="ico big" style={{ margin: '0 auto' }}><Lock size={24} /></span>
                  <b>VPN en développement</b>
                  <p>{vpnFeature.reason}</p>
                </div>
              ) : (
                <>
                  {/* Circle button */}
                  <div
                    className={`vpn-btn${connected ? ' connected' : connecting ? ' loading' : ''}`}
                    onClick={handleConnect}
                  >
                    {connecting
                      ? <RefreshCw size={44} />
                      : <><Power size={44} /><span style={{ display: 'block', fontSize: 11, marginTop: 10, letterSpacing: .7 }}>{connected ? 'PROTÉGÉ' : 'CONNECTER'}</span></>
                    }
                  </div>

                  <StatusChip />
                  {connected && (
                    <div className="mut sm" style={{ marginTop: 6 }}>Nœud : {selectedNode}</div>
                  )}

                  {/* Protocol */}
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
                    <div className="seg">
                      {(['WireGuard', 'OpenVPN'] as const).map(p => (
                        <button key={p} className={proto === p ? 'on' : ''} onClick={() => setProto(p)}>{p}</button>
                      ))}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid g3 mt" style={{ gap: 10, textAlign: 'left' }}>
                    {[
                      { label: 'Débit ↓', val: fmtBytes(downBytes) },
                      { label: 'Débit ↑', val: fmtBytes(upBytes) },
                      { label: 'Durée',   val: elapsed },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0' }}>
                        <small className="mut">{label}</small>
                        <b className="mono">{val}</b>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Server list */}
            <div className="card card-p-lg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="lbl" style={{ margin: 0 }}>
                  Relais · {ASTRAL_COUNTRIES.length} régions
                </div>
                <input
                  className="inp"
                  style={{ width: 160 }}
                  placeholder="Filtrer…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                {filteredCountries.length === 0
                  ? <div className="state-empty"><p>Aucun pays trouvé.</p></div>
                  : filteredCountries.map(c => (
                    <CountryRow
                      key={c.cc}
                      country={c}
                      selected={selectedNode}
                      onSelect={node => { setSelectedNode(node); if (connected) handleConnect(); }}
                    />
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* ─── Third-party VPN panel ─── */}
        {activeProvider !== 'astral' && (() => {
          const vpn = thirdPartyVpns.find(v => v.id === activeProvider);
          if (!vpn) return null;
          return (
            <div className="grid g12">
              {/* Status card */}
              <div className="card card-p-lg card-hero" style={{ textAlign: 'center' }}>
                <div
                  className={`vpn-btn${vpn.connected ? ' connected' : ''}`}
                  onClick={() => handleThirdPartyToggle(vpn)}
                >
                  <Power size={44} />
                  <span style={{ display: 'block', fontSize: 11, marginTop: 10, letterSpacing: .7 }}>
                    {vpn.connected ? 'CONNECTÉ' : 'DÉCONNECTÉ'}
                  </span>
                </div>

                {vpn.connected
                  ? <span className="chip"><span className="dot" />TUNNEL ACTIF</span>
                  : <span className="chip idle"><span className="dot" />INACTIF</span>
                }

                {vpn.serverName && (
                  <div className="mut sm" style={{ marginTop: 8 }}>Serveur : {vpn.serverName}</div>
                )}
                {vpn.ip && (
                  <div className="mono sm" style={{ marginTop: 4, color: 'var(--dim)' }}>IP : {vpn.ip}</div>
                )}

                <div style={{ marginTop: 20, padding: '14px', background: 'rgba(var(--a1r),.04)', border: '1px solid rgba(var(--a1r),.12)', borderRadius: 'var(--r-sm)', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                  Le contrôle s'effectue via l'application native <b style={{ color: 'var(--text)' }}>{vpn.name}</b>.
                  Désactiver ici fermera le tunnel depuis {vpn.name}.
                </div>
              </div>

              {/* Server list if available */}
              <div className="card card-p-lg">
                <div className="lbl">Serveurs {vpn.name}</div>
                {vpn.servers && vpn.servers.length > 0 ? (
                  <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                    {vpn.servers.map(c => (
                      <CountryRow
                        key={c.cc}
                        country={c}
                        selected={vpn.serverName}
                        onSelect={node => {
                          api.controlThirdPartyVpn?.({ id: vpn.id, action: 'connect', server: node }).catch(() => {});
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="state-empty">
                    <span className="ico big" style={{ margin: '0 auto' }}><Globe size={22} /></span>
                    <b>Serveurs non disponibles</b>
                    <p>Ouvrez {vpn.name} pour choisir un serveur.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
