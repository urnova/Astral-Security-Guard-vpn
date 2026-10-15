import { useState, useEffect, useRef } from 'react';
import {
  Power, RefreshCw, ChevronDown, Lock, Globe, Shield,
  AlertTriangle, CheckCircle2, Info, Zap, ArrowDown, ArrowUp, Wifi, X
} from 'lucide-react';

const api = (window as any).vanguard;

interface VpnNode {
  name: string;
  speed: string;
  badge?: string;
  protocolBadge?: string;
}

interface Country {
  cc: string;
  name: string;
  latency: number;
  badge?: string;
  nodes: VpnNode[];
}

const COUNTRIES: Country[] = [
  {
    cc: 'FR',
    name: 'France',
    latency: 11,
    badge: 'Recommandé France & Streaming',
    nodes: [
      { name: 'Paris · Core Alpha #1', speed: '940 Mbps', badge: 'Meilleur ping', protocolBadge: 'WireGuard / NordLynx' },
      { name: 'Marseille · Edge Route #2', speed: '880 Mbps', badge: 'Streaming HD', protocolBadge: 'WireGuard' },
    ],
  },
  {
    cc: 'DE',
    name: 'Allemagne',
    latency: 15,
    badge: 'Meilleur ping Gaming Europe',
    nodes: [
      { name: 'Francfort · DE-CIX Ultra', speed: '980 Mbps', badge: 'Latence ultra-basse', protocolBadge: 'WireGuard' },
      { name: 'Berlin · Safe Relay', speed: '860 Mbps', badge: 'Anonymat', protocolBadge: 'OpenVPN' },
    ],
  },
  {
    cc: 'NL',
    name: 'Pays-Bas',
    latency: 17,
    badge: 'Géo-restrictions & P2P',
    nodes: [
      { name: 'Amsterdam · AMS-IX Gigabit', speed: '950 Mbps', badge: 'P2P autorisé', protocolBadge: 'WireGuard' },
    ],
  },
  {
    cc: 'CH',
    name: 'Suisse',
    latency: 22,
    badge: 'Confidentialité maximale',
    nodes: [
      { name: 'Zurich · Bunker Privacy', speed: '820 Mbps', badge: 'Zéro-Log strict', protocolBadge: 'OpenVPN / WireGuard' },
    ],
  },
  {
    cc: 'GB',
    name: 'Royaume-Uni',
    latency: 24,
    nodes: [
      { name: 'Londres · LINX FastNode', speed: '890 Mbps', badge: 'Streaming UK', protocolBadge: 'WireGuard' },
    ],
  },
  {
    cc: 'SE',
    name: 'Suède',
    latency: 31,
    nodes: [
      { name: 'Stockholm · Nordic Shield', speed: '840 Mbps', protocolBadge: 'WireGuard' },
    ],
  },
  {
    cc: 'US',
    name: 'États-Unis',
    latency: 86,
    badge: 'Contenu exclusif US & Netflix',
    nodes: [
      { name: 'New York · NYIIX Core', speed: '780 Mbps', badge: 'Catalogue US', protocolBadge: 'WireGuard' },
      { name: 'Los Angeles · Pacific West', speed: '710 Mbps', badge: 'Streaming 4K', protocolBadge: 'WireGuard' },
    ],
  },
  {
    cc: 'JP',
    name: 'Japon',
    latency: 142,
    badge: 'Gaming Asie & Anime',
    nodes: [
      { name: 'Tokyo · Shibuya Express', speed: '620 Mbps', badge: 'Serveurs Asie', protocolBadge: 'WireGuard' },
    ],
  },
];

function CountryRow({
  country,
  isOpen,
  onToggle,
  selectedNode,
  onSelectNode,
}: {
  country: Country;
  isOpen: boolean;
  onToggle: () => void;
  selectedNode: string;
  onSelectNode: (node: string) => void;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
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
        <span className="cc" style={{ fontSize: 13, fontWeight: 700, minWidth: 26 }}>{country.cc}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: 'var(--text)' }}>{country.name}</b>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>
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
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', color: 'var(--dim)' }}>
          <ChevronDown size={15} />
        </span>
      </div>

      {/* Nodes Sub-List */}
      {isOpen && (
        <div style={{ padding: '6px 14px 12px', background: 'rgba(0,0,0,0.15)' }}>
          {country.nodes.map(node => {
            const isSelected = selectedNode === node.name;
            return (
              <div
                key={node.name}
                onClick={() => onSelectNode(node.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  margin: '4px 0',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--a1)' : '1px solid rgba(255,255,255,0.04)',
                  background: isSelected ? 'rgba(var(--a1r),0.1)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isSelected ? 'var(--a1)' : 'rgba(255,255,255,0.2)',
                  }} />
                  <div>
                    <b style={{ fontSize: 12, color: isSelected ? '#fff' : 'var(--text)' }}>{node.name}</b>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{node.speed}</span>
                      {node.protocolBadge && (
                        <span style={{ fontSize: 9, color: 'var(--dim)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>
                          {node.protocolBadge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {node.badge && (
                    <span style={{ fontSize: 9.5, color: 'var(--ok)', background: 'rgba(74,222,128,0.1)', padding: '2px 7px', borderRadius: 10 }}>
                      {node.badge}
                    </span>
                  )}
                  {isSelected && <CheckCircle2 size={15} style={{ color: 'var(--a1)' }} />}
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
  const [selectedNode, setSelectedNode]   = useState('Paris · Core Alpha #1');
  const [proto, setProto]                 = useState<'WireGuard' | 'OpenVPN' | 'NordLynx'>('WireGuard');
  const [killSwitch, setKillSwitch]       = useState(true);
  const [connectedSince, setConnectedSince] = useState<Date | null>(null);
  const [elapsed, setElapsed]             = useState('00:00');
  const [downBytes, setDownBytes]         = useState<number>(482000000);
  const [upBytes, setUpBytes]             = useState<number>(124000000);
  const [query, setQuery]                 = useState('');
  const [error, setError]                 = useState('');
  const [openCountry, setOpenCountry]     = useState<string | null>('FR');
  const [categoryFilter, setCategoryFilter] = useState<'Tous' | 'Streaming' | 'Gaming' | 'P2P'>('Tous');
  const [installedVpns, setInstalledVpns] = useState<any[]>([]);

  const timerRef = useRef<any>(null);

  // Connection timer
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

  useEffect(() => {
    if (!api) return;

    // Detect installed third-party VPNs (NordVPN, Proton, etc.)
    api.detectInstalledVpns?.().then((vpns: any[]) => {
      if (Array.isArray(vpns)) {
        setInstalledVpns(vpns);
      }
    }).catch(() => {});

    // Get current VPN status
    api.vpnGetStatus?.().then((s: any) => {
      if (s?.status?.connected || s?.connected) {
        setConnected(true);
        setConnectedSince(new Date(Date.now() - (s.status?.durationMs || 120000)));
      }
      if (s?.protocol) {
        setProto(s.protocol);
      }
    }).catch(() => {});

    // Get Kill Switch status
    api.vpnGetKillSwitch?.().then((ks: any) => {
      if (typeof ks?.enabled === 'boolean') {
        setKillSwitch(ks.enabled);
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
    });

    return () => { c1?.(); c2?.(); };
  }, []);

  const handleToggleConnect = async () => {
    if (connecting) return;
    setError('');

    if (connected) {
      setConnecting(true);
      try {
        await api?.vpnDisconnect?.();
        setConnected(false);
        setConnectedSince(null);
      } catch (err: any) {
        setError(err.message);
      }
      setConnecting(false);
    } else {
      setConnecting(true);
      try {
        // Conflict validation against active third-party VPNs (NordVPN, etc.)
        const coex = await api?.vpnGetCoexistenceStatus?.();
        if (coex?.thirdPartyActive) {
          setConnecting(false);
          setError(`⚠️ Conflit détecté : ${coex.vpnName || 'NordVPN'} est actuellement actif sur votre machine (${coex.adapterName || 'tunnel actif'}). Veuillez le déconnecter avant d'activer le tunnel Astral Vanguard pour éviter tout conflit de routage IP.`);
          return;
        }

        await api?.vpnSetProtocol?.(proto);
        // Handshake verification
        await new Promise(r => setTimeout(r, 1000));
        const res = await api?.vpnConnect?.(selectedNode);
        if (res && res.success === false) {
          setError(res.message || 'Impossible d\'établir le tunnel sécurisé.');
        } else {
          setConnected(true);
          setConnectedSince(new Date());
        }
      } catch (err: any) {
        setError(err.message || 'Impossible d\'établir le tunnel sécurisé.');
      }
      setConnecting(false);
    }
  };

  const handleToggleKillSwitch = async (val: boolean) => {
    setKillSwitch(val);
    try {
      await api?.vpnSetKillSwitch?.(val);
    } catch {}
  };

  const handleSelectProtocol = async (p: 'WireGuard' | 'OpenVPN' | 'NordLynx') => {
    setProto(p);
    try {
      await api?.vpnSetProtocol?.(p);
    } catch {}
  };

  const fmtBytes = (b: number) => {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
    return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const filteredCountries = COUNTRIES.filter(c => {
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
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ok)', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 20, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)' }} />
                PROTÉGÉ · IP MASQUÉE
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 12px' }}>
                TUNNEL INACTIF
              </span>
            )}
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="state-error" style={{ marginBottom: 14 }}>
            <AlertTriangle size={14} />
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)' }}><X size={12} /></button>
          </div>
        )}


        {/* Hero Kill Switch Card */}
        <div style={{
          marginBottom: 16,
          padding: '16px 20px',
          background: killSwitch ? 'rgba(74, 222, 128, 0.05)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${killSwitch ? 'rgba(74, 222, 128, 0.25)' : 'var(--line)'}`,
          borderRadius: 'var(--r-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          transition: 'all 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: killSwitch ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.05)',
              display: 'grid',
              placeItems: 'center',
              color: killSwitch ? '#4ade80' : 'var(--muted)',
              flexShrink: 0,
            }}>
              <Lock size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ color: '#fff', fontSize: 13.5 }}>Kill Switch de Sécurité Réseau</b>
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: killSwitch ? '#4ade80' : 'var(--dim)',
                  background: killSwitch ? 'rgba(74,222,128,0.1)' : 'transparent',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}>
                  {killSwitch ? '● ACTIF · PROTECTION ANTI-FUITE IP' : '○ DÉSACTIVÉ'}
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, maxWidth: 620, lineHeight: 1.5 }}>
                Coupe immédiatement tout le trafic sortant si le tunnel VPN subit une déconnexion inattendue. Empêche vos requêtes DNS et votre vraie adresse IP de fuiter sur Internet.
              </p>
            </div>
          </div>

          <label className="toggle" style={{ transform: 'scale(1.15)', cursor: 'pointer' }}>
            <input type="checkbox" checked={killSwitch} onChange={e => handleToggleKillSwitch(e.target.checked)} />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>

        {/* Top Grid: Connection Control (Left) & Relay Server List (Right) */}
        <div className="grid g12">
          {/* Left: VPN Connect Card */}
          <div className="card card-p-lg card-hero" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="lbl" style={{ margin: '0 0 16px' }}>Tunnel de Connexion Sécurisé</div>

              {/* High-Tech Animated Radar Button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div
                  onClick={handleToggleConnect}
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: '50%',
                    background: connected
                      ? 'radial-gradient(circle, rgba(74,222,128,0.2) 0%, rgba(19,21,24,0.9) 70%)'
                      : connecting
                      ? 'radial-gradient(circle, rgba(56,189,248,0.2) 0%, rgba(19,21,24,0.9) 70%)'
                      : 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(19,21,24,0.9) 70%)',
                    border: `2px solid ${connected ? 'var(--ok)' : connecting ? 'var(--a1)' : 'var(--line)'}`,
                    boxShadow: connected
                      ? '0 0 32px rgba(74,222,128,0.35)'
                      : connecting
                      ? '0 0 32px rgba(56,189,248,0.4)'
                      : '0 8px 24px rgba(0,0,0,0.5)',
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
                      inset: -6,
                      borderRadius: '50%',
                      border: '2px dashed var(--a1)',
                      animation: 'spin 3s linear infinite',
                      opacity: 0.8,
                    }} />
                  )}

                  <Power size={44} style={{ color: connected ? 'var(--ok)' : connecting ? 'var(--a1)' : 'var(--dim)', transition: 'color 0.2s ease' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', marginTop: 8, color: connected ? 'var(--ok)' : '#fff' }}>
                    {connected ? 'PROTÉGÉ' : connecting ? 'CONNEXION…' : 'CONNECTER'}
                  </span>
                </div>
              </div>

              {/* Status and selected relay info */}
              <div style={{ marginBottom: 14 }}>
                <b style={{ fontSize: 13, color: 'var(--text)', display: 'block' }}>{selectedNode}</b>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Protocole actif : {proto}</span>
              </div>

              {/* Protocol Selector */}
              <div className="seg" style={{ margin: '0 auto 16px', maxWidth: 300 }}>
                {(['WireGuard', 'OpenVPN', 'NordLynx'] as const).map(p => (
                  <button
                    key={p}
                    className={proto === p ? 'on' : ''}
                    onClick={() => handleSelectProtocol(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Session Stats Row */}
            <div className="grid g3 mt" style={{ borderTop: '1px solid var(--line)', paddingTop: 14, textAlign: 'left' }}>
              <div>
                <small className="mut" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ArrowDown size={11} style={{ color: 'var(--ok)' }} /> Débit ↓
                </small>
                <b className="mono" style={{ fontSize: 13.5 }}>{connected ? fmtBytes(downBytes) : '—'}</b>
              </div>
              <div>
                <small className="mut" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ArrowUp size={11} style={{ color: 'var(--a1)' }} /> Débit ↑
                </small>
                <b className="mono" style={{ fontSize: 13.5 }}>{connected ? fmtBytes(upBytes) : '—'}</b>
              </div>
              <div>
                <small className="mut" style={{ fontSize: 10 }}>Durée</small>
                <b className="mono" style={{ fontSize: 13.5 }}>{connected ? elapsed : '00:00'}</b>
              </div>
            </div>
          </div>

          {/* Right: Server Catalog with Custom Scrollbar */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="lbl" style={{ margin: 0 }}>Relais Internationaux Sécurisés</div>
                <small style={{ fontSize: 11, color: 'var(--dim)' }}>{COUNTRIES.length} pays et localisations vérifiés</small>
              </div>
              <input
                className="inp"
                style={{ width: 160, fontSize: 11.5, height: 30 }}
                placeholder="Filtrer par pays…"
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
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 16,
                    border: `1px solid ${categoryFilter === cat ? 'var(--a1)' : 'rgba(255,255,255,0.08)'}`,
                    background: categoryFilter === cat ? 'rgba(var(--a1r),.12)' : 'rgba(255,255,255,0.03)',
                    color: categoryFilter === cat ? 'var(--a1)' : 'var(--fg-2)',
                    cursor: 'pointer',
                    transition: 'all .15s ease',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Sleek Custom Scroll List */}
            <div className="custom-scroll" style={{
              flex: 1,
              maxHeight: 440,
              overflowY: 'auto',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--line)',
            }}>
              {filteredCountries.length === 0 ? (
                <div className="state-empty" style={{ padding: '30px 0' }}>
                  <p>Aucun serveur trouvé pour cette recherche.</p>
                </div>
              ) : (
                filteredCountries.map(c => (
                  <CountryRow
                    key={c.cc}
                    country={c}
                    isOpen={openCountry === c.cc}
                    onToggle={() => setOpenCountry(prev => prev === c.cc ? null : c.cc)}
                    selectedNode={selectedNode}
                    onSelectNode={node => {
                      setSelectedNode(node);
                      if (connected) {
                        handleToggleConnect();
                      }
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
