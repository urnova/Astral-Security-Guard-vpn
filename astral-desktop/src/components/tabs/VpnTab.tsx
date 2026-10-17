import { useState, useEffect, useRef } from 'react';
import {
  Power, RefreshCw, ChevronDown, Lock, Globe, Shield,
  AlertTriangle, CheckCircle2, Info, Zap, ArrowDown, ArrowUp, Wifi, X, Check
} from 'lucide-react';

const api = (window as any).vanguard;

interface VpnNode {
  name: string;
  speed: string;
  badge?: string;
  protocolBadge: string;
  ip: string;
  virtualIp: string;
}

interface Country {
  cc: string;
  name: string;
  latency: number;
  badge?: string;
  nodes: VpnNode[];
}

const DEFAULT_INITIAL_COUNTRIES: Country[] = [
  {
    cc: 'FR',
    name: 'France',
    latency: 14,
    badge: 'Recommandé · France',
    nodes: [
      { name: 'France · Relais OpenVPN #1', speed: '940 Mbps', badge: 'Meilleur ping', protocolBadge: 'OpenVPN', ip: '185.125.190.42', virtualIp: '10.8.0.2' },
    ],
  },
  {
    cc: 'DE',
    name: 'Allemagne',
    latency: 18,
    badge: 'Ultra-rapide Europe',
    nodes: [
      { name: 'Allemagne · Relais OpenVPN #1', speed: '910 Mbps', badge: 'Latence basse', protocolBadge: 'OpenVPN', ip: '194.26.29.11', virtualIp: '10.8.1.4' },
    ],
  },
  {
    cc: 'NL',
    name: 'Pays-Bas',
    latency: 21,
    badge: 'P2P autorisé',
    nodes: [
      { name: 'Pays-Bas · Relais OpenVPN #1', speed: '880 Mbps', badge: 'Haut débit', protocolBadge: 'OpenVPN', ip: '45.138.97.20', virtualIp: '10.8.2.10' },
    ],
  },
  {
    cc: 'CH',
    name: 'Suisse',
    latency: 24,
    badge: 'Confidentialité',
    nodes: [
      { name: 'Suisse · Relais OpenVPN #1', speed: '820 Mbps', badge: 'Sécurisé', protocolBadge: 'OpenVPN', ip: '179.43.142.15', virtualIp: '10.8.3.5' },
    ],
  },
  {
    cc: 'JP',
    name: 'Japon (VPN Gate)',
    latency: 135,
    badge: 'VPN Gate Asie',
    nodes: [
      { name: 'Japon · Tsukuba University', speed: '620 Mbps', badge: 'VPN Gate', protocolBadge: 'OpenVPN', ip: '103.149.162.2', virtualIp: '10.8.7.8' },
    ],
  },
];

function CountryRow({
  country,
  isOpen,
  onToggle,
  selectedNode,
  onSelectNode,
  connected,
}: {
  country: Country;
  isOpen: boolean;
  onToggle: () => void;
  selectedNode: string;
  onSelectNode: (node: VpnNode) => void;
  connected: boolean;
}) {
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Country Header Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
          background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent',
          transition: 'background 0.15s ease',
        }}
        onClick={onToggle}
      >
        <span className="cc" style={{ fontSize: 13, fontWeight: 700, minWidth: 26, color: 'var(--a1)' }}>{country.cc}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: 'var(--text)' }}>{country.name}</b>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              · {country.nodes.length} relais disponible{country.nodes.length > 1 ? 's' : ''}
            </span>
            {country.badge && (
              <span style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#38bdf8',
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 12,
                padding: '1px 8px',
              }}>
                {country.badge}
              </span>
            )}
          </div>
        </div>

        <span className={`chip${country.latency > 60 ? ' warn' : ''}`} style={{ fontSize: 11 }}>
          {country.latency} ms
        </span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', color: 'var(--muted)' }}>
          <ChevronDown size={15} />
        </span>
      </div>

      {/* Nodes Sub-List */}
      {isOpen && (
        <div style={{ padding: '6px 14px 12px', background: 'rgba(0,0,0,0.25)' }}>
          {country.nodes.map(node => {
            const isSelected = selectedNode === node.name;
            return (
              <div
                key={node.name}
                onClick={() => onSelectNode(node)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  margin: '4px 0',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--a1)' : '1px solid rgba(255,255,255,0.04)',
                  background: isSelected ? 'rgba(var(--a1r),0.12)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isSelected && connected ? '#22c55e' : isSelected ? 'var(--a1)' : 'rgba(255,255,255,0.2)',
                    boxShadow: isSelected && connected ? '0 0 8px #22c55e' : undefined,
                  }} />
                  <div>
                    <b style={{ fontSize: 12.5, color: isSelected ? '#fff' : 'var(--text)' }}>{node.name}</b>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{node.speed}</span>
                      <span style={{ fontSize: 9.5, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(56,189,248,0.2)' }}>
                        {node.protocolBadge}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {node.badge && (
                    <span style={{ fontSize: 9.5, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', padding: '2px 7px', borderRadius: 10 }}>
                      {node.badge}
                    </span>
                  )}
                  {isSelected && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: connected ? '#22c55e' : 'var(--a1)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={14} />
                      {connected ? 'ACTIF' : 'SÉLECTIONNÉ'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function VpnTab() {
  const [connected, setConnected]         = useState(false);
  const [connecting, setConnecting]       = useState(false);
  const [countries, setCountries]         = useState<Country[]>(DEFAULT_INITIAL_COUNTRIES);
  const [selectedNode, setSelectedNode]   = useState('France · Relais OpenVPN #1');
  const [selectedNodeData, setSelectedNodeData] = useState<VpnNode>(DEFAULT_INITIAL_COUNTRIES[0].nodes[0]);
  const [realPublicIp, setRealPublicIp]   = useState('');
  const [killSwitch, setKillSwitch]       = useState(true);
  const [autoFailover, setAutoFailover]   = useState(true);
  const [failoverThreshold, setFailoverThreshold] = useState(85);
  const [connectedSince, setConnectedSince] = useState<Date | null>(null);
  const [elapsed, setElapsed]             = useState('00:00');
  const [downBytes, setDownBytes]         = useState<number>(0);
  const [upBytes, setUpBytes]             = useState<number>(0);
  const [query, setQuery]                 = useState('');
  const [error, setError]                 = useState('');
  const [openCountry, setOpenCountry]     = useState<string | null>('FR');
  const [categoryFilter, setCategoryFilter] = useState<'Tous' | 'Streaming' | 'Gaming' | 'P2P'>('Tous');

  // Real connection statistics polling
  useEffect(() => {
    let statusInterval: any = null;
    if (connected) {
      statusInterval = setInterval(async () => {
        try {
          const st = await api?.vpnGetStatus?.();
          if (st?.status) {
            if (typeof st.status.bytesReceived === 'number') {
              setDownBytes(st.status.bytesReceived);
            }
            if (typeof st.status.bytesSent === 'number') {
              setUpBytes(st.status.bytesSent);
            }
            if (typeof st.status.durationSeconds === 'number') {
              const m = Math.floor(st.status.durationSeconds / 60);
              const s = st.status.durationSeconds % 60;
              setElapsed(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
            if (st.status.publicIp) {
              setRealPublicIp(st.status.publicIp);
            }
          }
        } catch {}
      }, 2000);
    } else {
      setElapsed('00:00');
      setDownBytes(0);
      setUpBytes(0);
      setRealPublicIp('');
    }
    return () => {
      if (statusInterval) clearInterval(statusInterval);
    };
  }, [connected]);

  // Load dynamic catalog from VPN Gate
  useEffect(() => {
    if (!api) return;

    api.vpnFetchServers?.().then((res: any) => {
      if (res?.servers && Array.isArray(res.servers) && res.servers.length > 0) {
        const map = new Map<string, Country>();
        for (const s of res.servers) {
          const cc = (s.countryCode || 'UN').toUpperCase();
          const name = s.country || cc;
          if (!map.has(cc)) {
            map.set(cc, {
              cc,
              name,
              latency: s.ping || 50,
              badge: s.badges?.[0] || (s.ping && s.ping < 30 ? 'Meilleur ping' : undefined),
              nodes: [],
            });
          }
          const c = map.get(cc)!;
          if (s.ping && s.ping < c.latency) {
            c.latency = s.ping;
          }
          c.nodes.push({
            name: `${name} · ${s.ip}`,
            speed: `${s.speedMbps || 450} Mbps`,
            badge: s.badges?.[0] || (s.ping && s.ping < 30 ? 'Meilleur ping' : 'Relais vérifié'),
            protocolBadge: 'OpenVPN',
            ip: s.ip,
            virtualIp: s.ip,
          });
        }
        const sorted = Array.from(map.values()).sort((a, b) => a.latency - b.latency);
        setCountries(sorted);
        if (sorted.length > 0 && sorted[0].nodes.length > 0 && !connected) {
          setSelectedNode(sorted[0].nodes[0].name);
          setSelectedNodeData(sorted[0].nodes[0]);
          setOpenCountry(sorted[0].cc);
        }
      }
    }).catch(() => {});
  }, [connected]);

  useEffect(() => {
    if (!api) return;

    // Get current VPN status
    api.vpnGetStatus?.().then((s: any) => {
      if (s?.status?.connected || s?.connected) {
        setConnected(true);
        if (s.serverName) setSelectedNode(s.serverName);
        if (s.status?.publicIp) setRealPublicIp(s.status.publicIp);
      }
    }).catch(() => {});

    // Get Kill Switch status
    api.vpnGetKillSwitch?.().then((ks: any) => {
      if (typeof ks?.enabled === 'boolean') {
        setKillSwitch(ks.enabled);
      }
    }).catch(() => {});

    // Get Auto-Failover status
    api.vpnGetAutoFailover?.().then((af: any) => {
      if (af?.success && af.config) {
        setAutoFailover(af.config.enabled ?? true);
        if (af.config.maxLatencyMs) setFailoverThreshold(af.config.maxLatencyMs);
      }
    }).catch(() => {});

    // Event listeners
    const c1 = api.on?.('vpn:connected', (d: any) => {
      setConnected(true);
      setConnecting(false);
      setConnectedSince(new Date());
      if (d?.serverName) setSelectedNode(d.serverName);
    });

    const c2 = api.on?.('vpn:disconnected', () => {
      setConnected(false);
      setConnecting(false);
      setConnectedSince(null);
      setRealPublicIp('');
    });

    const c3 = api.on?.('vpn:state-changed', (d: any) => {
      if (d) {
        if (d.connected) {
          setConnected(true);
          setConnecting(false);
          setConnectedSince(new Date());
          if (d.serverName) setSelectedNode(d.serverName);
        } else {
          setConnected(false);
          setConnecting(false);
          setConnectedSince(null);
          setRealPublicIp('');
        }
      }
    });

    return () => { c1?.(); c2?.(); c3?.(); };
  }, []);

  const flash = (_msg: string) => {
    // Discreet status
  };

  const handleToggleConnect = async () => {
    if (connecting) return;
    setError('');

    if (connected) {
      setConnecting(true);
      try {
        await api?.vpnDisconnect?.();
        setConnected(false);
        setConnectedSince(null);
        setRealPublicIp('');
      } catch (err: any) {
        setError(err.message);
      }
      setConnecting(false);
    } else {
      setConnecting(true);
      try {
        const coex = await api?.vpnGetCoexistenceStatus?.();
        if (coex?.thirdPartyActive) {
          setConnecting(false);
          setError(`⚠️ Conflit détecté : ${coex.vpnName || 'Un VPN tiers'} est actuellement actif (${coex.adapterName || 'tunnel actif'}). Veuillez le déconnecter pour éviter tout conflit de routage IP.`);
          return;
        }

        await api?.vpnSetProtocol?.('OpenVPN');
        const res = await api?.vpnConnect?.(selectedNode);
        if (res && res.success === false) {
          setError(res.message || 'Impossible d\'établir le tunnel sécurisé OpenVPN.');
        } else {
          setConnected(true);
          setConnectedSince(new Date());
          if (res?.publicIp) setRealPublicIp(res.publicIp);
        }
      } catch (err: any) {
        setError(err.message || 'Impossible d\'établir le tunnel sécurisé OpenVPN.');
      }
      setConnecting(false);
    }
  };

  // Seamless Server Switch
  const handleSelectNode = async (node: VpnNode) => {
    setSelectedNode(node.name);
    setSelectedNodeData(node);

    // If already connected, smoothly switch to the new server without breaking into error
    if (connected) {
      setConnecting(true);
      setError('');
      try {
        await api?.vpnDisconnect?.();
        await new Promise(r => setTimeout(r, 500));
        await api?.vpnConnect?.(node.name);
        setConnected(true);
        setConnectedSince(new Date());
      } catch (err: any) {
        setError(err.message || `Erreur lors de la bascule vers ${node.name}.`);
      } finally {
        setConnecting(false);
      }
    }
  };

  const handleToggleKillSwitch = async (val: boolean) => {
    setKillSwitch(val);
    try {
      await api?.vpnSetKillSwitch?.(val);
      flash(val ? 'Kill Switch activé : fuites IP bloquées.' : 'Kill Switch désactivé.');
    } catch {}
  };

  const handleToggleAutoFailover = async (val: boolean) => {
    setAutoFailover(val);
    try {
      await api?.vpnSetAutoFailover?.({ enabled: val, maxLatencyMs: failoverThreshold, cooldownSeconds: 30 });
    } catch {}
  };

  const fmtBytes = (b: number) => {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
    return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const filteredCountries = countries.filter(c => {
    const matchesQuery = c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.nodes.some(n => n.name.toLowerCase().includes(query.toLowerCase()));
    if (!matchesQuery) return false;
    if (categoryFilter === 'Tous') return true;
    if (categoryFilter === 'Streaming') {
      return (c.badge?.toLowerCase().includes('streaming') || c.badge?.toLowerCase().includes('netflix')) ||
        c.nodes.some(n => n.badge?.toLowerCase().includes('streaming') || n.name.toLowerCase().includes('stream'));
    }
    if (categoryFilter === 'Gaming') {
      return (c.badge?.toLowerCase().includes('gaming') || c.badge?.toLowerCase().includes('ping')) ||
        c.nodes.some(n => n.badge?.toLowerCase().includes('ping') || n.badge?.toLowerCase().includes('gaming') || n.badge?.toLowerCase().includes('basse'));
    }
    if (categoryFilter === 'P2P') {
      return (c.badge?.toLowerCase().includes('p2p') || c.badge?.toLowerCase().includes('géo')) ||
        c.nodes.some(n => n.badge?.toLowerCase().includes('p2p'));
    }
    return true;
  });

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>VPN & Anonymat</h1>
            <p className="sub">Tunnels chiffrés haute vitesse, sélection de relais mondiaux et protection anti-fuite IP.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {connected ? (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                PROTÉGÉ · IP MASQUÉE
              </span>
            ) : (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '4px 14px' }}>
                TUNNEL INACTIF
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="state-error" style={{ marginBottom: 16 }}>
            <AlertTriangle size={15} />
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)' }}><X size={14} /></button>
          </div>
        )}

        {/* Security & Routing Controls: 2 Cards Side-by-Side */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}>
          {/* Card 1: Kill Switch Pare-Feu */}
          <div style={{
            padding: '16px 18px',
            background: killSwitch ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${killSwitch ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            transition: 'all 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: killSwitch ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                display: 'grid',
                placeItems: 'center',
                color: killSwitch ? '#22c55e' : 'var(--muted)',
                flexShrink: 0,
                marginTop: 2,
              }}>
                <Lock size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ color: '#fff', fontSize: 13 }}>Kill Switch Pare-Feu</b>
                  <span style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: killSwitch ? '#22c55e' : 'var(--muted)',
                    background: killSwitch ? 'rgba(34,197,94,0.12)' : 'transparent',
                    padding: '2px 7px',
                    borderRadius: 6,
                    border: killSwitch ? '1px solid rgba(34,197,94,0.25)' : 'none',
                  }}>
                    {killSwitch ? 'ACTIF' : 'OFF'}
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
                  Bloque le trafic Internet non chiffré en cas de coupure inattendue du tunnel pour éviter toute fuite d'IP réelle.
                </p>
              </div>
            </div>

            <label className="toggle" style={{ transform: 'scale(1.05)', cursor: 'pointer', margin: 0, flexShrink: 0 }}>
              <input type="checkbox" checked={killSwitch} onChange={e => handleToggleKillSwitch(e.target.checked)} />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>

          {/* Card 2: Basculement automatique (Bêta) */}
          <div style={{
            padding: '16px 18px',
            background: autoFailover ? 'rgba(56,189,248,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${autoFailover ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            transition: 'all 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: autoFailover ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)',
                display: 'grid',
                placeItems: 'center',
                color: autoFailover ? '#38bdf8' : 'var(--muted)',
                flexShrink: 0,
                marginTop: 2,
              }}>
                <Zap size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ color: '#fff', fontSize: 13 }}>Basculement automatique</b>
                  <span style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: '#38bdf8',
                    background: 'rgba(56,189,248,0.15)',
                    padding: '2px 7px',
                    borderRadius: 6,
                    border: '1px solid rgba(56,189,248,0.3)',
                  }}>
                    BÊTA
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
                  Bascule automatiquement et sans coupure vers le relais optimal le plus proche si la latence dépasse {failoverThreshold} ms.
                </p>
              </div>
            </div>

            <label className="toggle" style={{ transform: 'scale(1.05)', cursor: 'pointer', margin: 0, flexShrink: 0 }}>
              <input type="checkbox" checked={autoFailover} onChange={e => handleToggleAutoFailover(e.target.checked)} />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>
        </div>

        {/* Top Grid: Connection Radar & Details (Left) & Relay Server List (Right) */}
        <div className="grid g12" style={{ alignItems: 'stretch' }}>

          {/* Left: Centered VPN Radar Card */}
          <div className="card card-p-lg" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            textAlign: 'center',
            padding: 24,
            background: 'linear-gradient(135deg, rgba(13,17,26,0.95) 0%, rgba(9,11,18,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
          }}>
            <div style={{ width: '100%' }}>
              <div className="lbl" style={{ margin: '0 0 20px', fontSize: 13 }}>Tunnel Sécurisé Astral Vanguard</div>

              {/* Centered Large High-Tech Radar Button */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 20px' }}>
                <div
                  onClick={handleToggleConnect}
                  style={{
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: connected
                      ? 'radial-gradient(circle, rgba(34,197,94,0.22) 0%, rgba(13,17,26,0.95) 70%)'
                      : connecting
                      ? 'radial-gradient(circle, rgba(56,189,248,0.22) 0%, rgba(13,17,26,0.95) 70%)'
                      : 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(13,17,26,0.95) 70%)',
                    border: `2.5px solid ${connected ? '#22c55e' : connecting ? '#38bdf8' : 'rgba(255,255,255,0.15)'}`,
                    boxShadow: connected
                      ? '0 0 35px rgba(34,197,94,0.4), inset 0 0 20px rgba(34,197,94,0.2)'
                      : connecting
                      ? '0 0 35px rgba(56,189,248,0.45), inset 0 0 20px rgba(56,189,248,0.2)'
                      : '0 8px 24px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                  }}
                >
                  {/* Rotating pulse radar when connecting */}
                  {connecting && (
                    <div style={{
                      position: 'absolute',
                      inset: -8,
                      borderRadius: '50%',
                      border: '2px dashed #38bdf8',
                      animation: 'spin 2.5s linear infinite',
                      opacity: 0.85,
                    }} />
                  )}

                  <Power size={48} style={{ color: connected ? '#22c55e' : connecting ? '#38bdf8' : 'var(--muted)', transition: 'color 0.2s ease' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginTop: 10, color: connected ? '#22c55e' : '#fff' }}>
                    {connected ? 'DÉCONNECTER' : connecting ? 'CONNEXION…' : 'CONNECTER'}
                  </span>
                </div>
              </div>

              {/* Status and selected relay info */}
              <div style={{ marginBottom: 16 }}>
                <b style={{ fontSize: 14, color: '#ffffff', display: 'block' }}>{selectedNode}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span>Protocole actif :</span>
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>OpenVPN (Chiffré AES-256 / Wintun)</span>
                </span>
              </div>
            </div>

            {/* NordVPN-style Live Detailed Parameters */}
            <div style={{
              width: '100%',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '12px 14px',
              textAlign: 'left',
              marginTop: 10,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 11.5 }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>IP PUBLIQUE</span>
                  <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                    {connected ? (realPublicIp || selectedNodeData.ip) : '— (Non masquée)'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>RELAIS ACTIF</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                    {connected ? selectedNodeData.ip : '—'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>CHIFFREMENT</span>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    AES-256-GCM / SHA-256
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>DURÉE SESSION</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                    {connected ? elapsed : '00:00'}
                  </span>
                </div>
              </div>

              {/* Data Transfer */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                marginTop: 10,
                paddingTop: 8,
                fontSize: 11,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#22c55e' }}>
                  <ArrowDown size={12} />
                  <span>{connected ? fmtBytes(downBytes) : '0 Mo'} reçus</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#38bdf8' }}>
                  <ArrowUp size={12} />
                  <span>{connected ? fmtBytes(upBytes) : '0 Mo'} envoyés</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Server Catalog with Seamless Click Switch */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Relais Internationaux Sécurisés</div>
                <small style={{ fontSize: 11, color: 'var(--muted)' }}>Cliquez sur un serveur pour basculer instantanément</small>
              </div>
              <input
                className="inp"
                style={{ width: 160, fontSize: 11.5, height: 32 }}
                placeholder="Rechercher pays…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['Tous', 'Streaming', 'Gaming', 'P2P'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 16,
                    border: `1px solid ${categoryFilter === cat ? 'var(--a1)' : 'rgba(255,255,255,0.08)'}`,
                    background: categoryFilter === cat ? 'rgba(var(--a1r),.15)' : 'rgba(255,255,255,0.03)',
                    color: categoryFilter === cat ? 'var(--a1)' : 'var(--fg-2)',
                    cursor: 'pointer',
                    transition: 'all .15s ease',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Server List */}
            <div style={{
              flex: 1,
              maxHeight: 460,
              overflowY: 'auto',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {filteredCountries.map(c => (
                <CountryRow
                  key={c.name}
                  country={c}
                  isOpen={openCountry === c.cc}
                  onToggle={() => setOpenCountry(prev => prev === c.cc ? null : c.cc)}
                  selectedNode={selectedNode}
                  onSelectNode={handleSelectNode}
                  connected={connected}
                />
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
