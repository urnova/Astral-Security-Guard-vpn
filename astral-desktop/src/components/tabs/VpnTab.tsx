import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, Globe, Lock, Power, RefreshCw,
  ChevronDown, ChevronUp, Zap, Sparkles, Activity, ArrowDown, ArrowUp, Info, CheckCircle2
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';
import { useSystem, VpnNode, VpnCountryGroup } from '../../context/SystemContext';

const api = (window as any).vanguard;

export default function VpnTab() {
  const {
    vpnCountries,
    activeVpnNode,
    isVpnConnected,
    isVpnConnecting,
    killSwitchEnabled,
    vpnConnectTime,
    vpnBytesIn,
    vpnBytesOut,
    setKillSwitchEnabled,
    connectVpn,
    disconnectVpn,
  } = useSystem();

  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<VpnNode | null>(activeVpnNode || vpnCountries[0]?.nodes[0]);
  const [search, setSearch] = useState('');
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [coexistenceInfo, setCoexistenceInfo] = useState<string | null>(null);

  useEffect(() => {
    if (activeVpnNode) {
      setSelectedNode(activeVpnNode);
    }
  }, [activeVpnNode]);

  // Check third-party VPN coexistence
  useEffect(() => {
    if (api?.vpnGetCoexistenceStatus) {
      api.vpnGetCoexistenceStatus().then((res: any) => {
        if (res?.thirdPartyActive && res?.vpnName) {
          setCoexistenceInfo(`Coexistence active : ${res.vpnName} détecté sur votre système.`);
        }
      }).catch(() => {});
    }
  }, []);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatBytes = (b: number) => {
    if (b > 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} Go`;
    if (b > 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
    return `${Math.round(b / 1024)} Ko`;
  };

  const handleToggleConnect = async () => {
    setErrorInfo(null);
    if (isVpnConnected) {
      await disconnectVpn();
    } else {
      const nodeToConnect = selectedNode || vpnCountries[0]?.nodes[0];
      if (!nodeToConnect) return;
      const ok = await connectVpn(nodeToConnect);
      if (!ok) {
        setErrorInfo({ message: 'Échec de connexion au tunnel VPN.', technical: 'Vérifiez la connexion réseau ou vos autorisations.' });
      }
    }
  };

  const handleSelectNode = async (node: VpnNode) => {
    setSelectedNode(node);
    if (isVpnConnected && activeVpnNode?.id !== node.id) {
      // Hot-switch to the new node smoothly
      await connectVpn(node);
    }
  };

  const filteredCountries = vpnCountries.filter((c) =>
    c.country.toLowerCase().includes(search.toLowerCase()) ||
    c.nodes.some((n) => n.city.toLowerCase().includes(search.toLowerCase()) || n.name.toLowerCase().includes(search.toLowerCase()))
  );

  const currentNode = isVpnConnected ? activeVpnNode || selectedNode : selectedNode;

  return (
    <div className="tab-scroll animate-in" style={{ padding: '24px 32px', maxWidth: 1260, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Réseau Privé Virtuel (Astral VPN)
            </h1>
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '3px 8px',
                borderRadius: 6,
                backgroundColor: 'rgba(0, 245, 255, 0.1)',
                border: '1px solid rgba(0, 245, 255, 0.3)',
                color: 'var(--cyan)',
                fontWeight: 700,
              }}
            >
              WIREGUARD PROTOCOL
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Chiffrement de trafic haute vitesse avec sélection dynamique des relais à faible latence
          </p>
        </div>

        {/* Coexistence Badge if 3rd-party VPN detected */}
        {coexistenceInfo && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            <span>{coexistenceInfo}</span>
          </div>
        )}
      </div>

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Split 2-Column Cockpit Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.25fr) minmax(360px, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* LEFT COLUMN: Server Vault Catalogue */}
        <div>
          {/* Search & Filter Header */}
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                Relais Disponibles ({filteredCountries.length} Pays)
              </h2>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Cliquez pour sélectionner le relais. La flèche déroule les nœuds spécifiques.
              </div>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par pays, ville..."
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                fontSize: 12,
                width: 170,
              }}
            />
          </div>

          {/* List of Countries */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 540, overflowY: 'auto', paddingRight: 4 }}>
            {filteredCountries.map((countryGroup) => {
              const isExpanded = expandedCountry === countryGroup.country;
              const bestNode = countryGroup.nodes.reduce((prev, curr) => (curr.ping < prev.ping ? curr : prev), countryGroup.nodes[0]);
              const isSelectedCountry = currentNode && countryGroup.nodes.some((n) => n.id === currentNode.id);

              return (
                <div
                  key={countryGroup.country}
                  className="glass-card"
                  style={{
                    borderRadius: 12,
                    border: isSelectedCountry ? '1px solid rgba(0, 245, 255, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                    backgroundColor: isSelectedCountry ? 'rgba(0, 245, 255, 0.05)' : 'rgba(15, 23, 42, 0.6)',
                    overflow: 'hidden',
                    transition: 'all 0.18s ease',
                  }}
                >
                  {/* Country Row: Click selects & connects; Chevron toggle expands/collapses */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelectNode(bestNode)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{countryGroup.flag}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{countryGroup.country}</span>
                          {isSelectedCountry && (
                            <span
                              className="badge badge-cyan"
                              style={{ fontSize: 9, padding: '2px 6px', fontWeight: 800, letterSpacing: '0.04em' }}
                            >
                              {isVpnConnected ? 'CONNECTÉ' : 'SÉLECTIONNÉ'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {bestNode.city} · {countryGroup.nodes.length} serveur(s)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Latency badge */}
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          fontWeight: 700,
                          color: countryGroup.bestPing < 25 ? '#10b981' : countryGroup.bestPing < 60 ? '#38bdf8' : '#fbbf24',
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        ⚡ {countryGroup.bestPing} ms
                      </span>

                      {/* Accordion toggle: expands/collapses ONLY on click */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCountry(isExpanded ? null : countryGroup.country);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                        }}
                        title={isExpanded ? 'Replier' : 'Déplier les nœuds'}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Sub-Nodes Accordion Content */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '8px 14px 12px 14px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: 'rgba(0, 0, 0, 0.35)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Nœuds spécifiques dans ce pays :
                      </div>

                      {countryGroup.nodes.map((node) => {
                        const isNodeActive = currentNode?.id === node.id;
                        return (
                          <div
                            key={node.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectNode(node);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: 8,
                              backgroundColor: isNodeActive ? 'rgba(0, 245, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                              border: isNodeActive ? '1px solid rgba(0, 245, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.04)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  backgroundColor: isNodeActive ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.3)',
                                }}
                              />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{node.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{node.city} · {node.ip}</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{node.speedMbps} Mbps</span>
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 11,
                                  color: node.ping < 25 ? '#10b981' : node.ping < 60 ? '#38bdf8' : '#fbbf24',
                                  fontWeight: 700,
                                }}
                              >
                                {node.ping} ms
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: VPN Shield Cockpit & Telemetry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Main Shield Cockpit Card */}
          <div
            className="glass-card"
            style={{
              padding: '28px 24px',
              background: isVpnConnected
                ? 'radial-gradient(ellipse at 50% 25%, rgba(0, 245, 255, 0.14) 0%, rgba(8, 12, 28, 0.95) 75%)'
                : 'radial-gradient(ellipse at 50% 25%, rgba(99, 102, 241, 0.08) 0%, rgba(8, 12, 28, 0.9) 75%)',
              border: isVpnConnected ? '1px solid rgba(0, 245, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: isVpnConnected ? '0 12px 36px rgba(0, 245, 255, 0.2)' : '0 8px 32px rgba(0, 0, 0, 0.4)',
              borderRadius: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {/* Cyber Connect Button */}
            <div style={{ position: 'relative', margin: '8px 0 18px 0' }}>
              {isVpnConnected && (
                <div
                  style={{
                    position: 'absolute',
                    inset: -10,
                    borderRadius: '50%',
                    border: '2px solid rgba(0, 245, 255, 0.5)',
                    animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                    pointerEvents: 'none',
                  }}
                />
              )}

              <button
                onClick={handleToggleConnect}
                disabled={isVpnConnecting}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  backgroundColor: isVpnConnected ? '#00f5ff' : 'rgba(15, 23, 42, 0.9)',
                  border: isVpnConnected ? '4px solid #ffffff' : '3px solid rgba(0, 245, 255, 0.4)',
                  boxShadow: isVpnConnected
                    ? '0 0 35px rgba(0, 245, 255, 0.7), inset 0 2px 4px rgba(255, 255, 255, 0.6)'
                    : '0 0 20px rgba(0, 245, 255, 0.2), inset 0 2px 6px rgba(0, 0, 0, 0.6)',
                  color: isVpnConnected ? '#05070e' : '#00f5ff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  cursor: isVpnConnecting ? 'wait' : 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  outline: 'none',
                }}
              >
                <Power size={32} className={isVpnConnecting ? 'animate-spin' : ''} />
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {isVpnConnecting ? 'CONNEXION...' : isVpnConnected ? 'DÉCONNECTER' : 'ACTIVER'}
                </span>
              </button>
            </div>

            {/* Connection Status Text */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isVpnConnected ? '#10b981' : isVpnConnecting ? '#ff9f1c' : 'rgba(255,255,255,0.3)',
                    boxShadow: isVpnConnected ? '0 0 10px #10b981' : 'none',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em' }}>
                  {isVpnConnecting
                    ? 'NÉGOCIATION DU TUNNEL...'
                    : isVpnConnected
                    ? 'TUNNEL WIREGUARD SÉCURISÉ'
                    : 'TUNNEL DÉCONNECTÉ'}
                </span>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {isVpnConnected
                  ? `Relais : ${currentNode?.name} (${currentNode?.city})`
                  : `Prêt à connecter : ${currentNode?.name || 'Sélectionnez un serveur'}`}
              </div>
            </div>

            {/* IP Virtual Mask Box */}
            <div
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: 16,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>ADRESSE IP VIRTUELLE</span>
                <span style={{ color: isVpnConnected ? '#10b981' : '#fbbf24', fontWeight: 700 }}>
                  {isVpnConnected ? 'MASQUÉE' : 'VOTRE IP RÉELLE'}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
                {isVpnConnected ? currentNode?.ip : 'Protégée dès activation'}
              </div>
            </div>

            {/* Live Telemetry Row (when connected) */}
            {isVpnConnected && (
              <div
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  textAlign: 'left',
                }}
              >
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>DURÉE DU TUNNEL</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{formatTime(vpnConnectTime)}</div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>LATENCE ESTIMÉE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)' }}>{currentNode?.ping || 14} ms</div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>DONNÉES ENTRANTES</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{formatBytes(vpnBytesIn)}</div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>DONNÉES SORTANTES</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>{formatBytes(vpnBytesOut)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Kill Switch Card */}
          <div
            className="glass-card"
            style={{
              padding: '16px 20px',
              borderRadius: 14,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 2 }}>
                <Lock size={14} style={{ color: '#c084fc' }} />
                <span>Kill Switch Anti-Fuite</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Bloque tout trafic non chiffré si le tunnel est interrompu
              </div>
            </div>
            <CyberToggle
              checked={killSwitchEnabled}
              onChange={setKillSwitchEnabled}
              glowColor="purple"
              ariaLabel="Kill Switch"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
