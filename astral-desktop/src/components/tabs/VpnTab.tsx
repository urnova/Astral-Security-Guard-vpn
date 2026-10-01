import { useState } from 'react';
import {
  Shield, ShieldCheck, Globe, Lock, Power, RefreshCw,
  ChevronDown, ChevronUp, Zap, Sparkles, Activity, ArrowDown, ArrowUp, Info
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';
import { useSystem, VpnNode, VpnCountryGroup } from '../../context/SystemContext';

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
      const nodeToConnect = selectedNode || vpnCountries[0].nodes[0];
      const ok = await connectVpn(nodeToConnect);
      if (!ok) {
        setErrorInfo({ message: 'Échec de connexion au relais VPN.', technical: 'Tunnel non initialisé.' });
      }
    }
  };

  const filteredCountries = vpnCountries.filter((c) =>
    c.country.toLowerCase().includes(search.toLowerCase()) ||
    c.nodes.some((n) => n.city.toLowerCase().includes(search.toLowerCase()) || n.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="tab-scroll animate-in" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Réseau Privé Virtuel (VPN E-Sport)
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
              RELAY VAULT
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Chiffrement WireGuard/AES-256 haute vitesse avec sélection intelligente de latence
          </p>
        </div>

        {/* Kill Switch Header Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 18px',
            borderRadius: 12,
            backgroundColor: 'rgba(6, 6, 20, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
              <span>Kill Switch d'Urgence</span>
              <span title="Coupe tout le trafic non chiffré en cas de déconnexion inopinée pour bloquer toute fuite d'IP." style={{ display: 'inline-flex', cursor: 'help' }}>
                <Info size={13} style={{ color: 'var(--cyan)' }} />
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Anti-fuite IP & DNS</div>
          </div>
          <CyberToggle
            checked={killSwitchEnabled}
            onChange={setKillSwitchEnabled}
            glowColor="purple"
            ariaLabel="Kill Switch"
          />
        </div>
      </div>

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Main Connection Hero Cockpit */}
      <div
        className="glass-card"
        style={{
          padding: '28px 32px',
          marginBottom: 24,
          background: isVpnConnected
            ? 'radial-gradient(ellipse at 50% 30%, rgba(0, 245, 255, 0.12) 0%, rgba(6, 6, 20, 0.9) 75%)'
            : 'radial-gradient(ellipse at 50% 30%, rgba(99, 102, 241, 0.08) 0%, rgba(6, 6, 20, 0.85) 75%)',
          border: isVpnConnected ? '1px solid rgba(0, 245, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: isVpnConnected ? '0 12px 36px rgba(0, 245, 255, 0.15)' : '0 8px 32px rgba(0, 0, 0, 0.4)',
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* Animated Cyber Connect Button with Hover Ripple */}
        <div style={{ position: 'relative', margin: '14px 0 20px 0' }}>
          {isVpnConnected && (
            <div
              style={{
                position: 'absolute',
                inset: -12,
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
              width: 108,
              height: 108,
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
              gap: 4,
              cursor: isVpnConnecting ? 'wait' : 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isVpnConnecting ? 'scale(0.95)' : 'scale(1)',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.06)';
              e.currentTarget.style.boxShadow = '0 0 35px rgba(0, 245, 255, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = isVpnConnected
                ? '0 0 35px rgba(0, 245, 255, 0.7)'
                : '0 0 20px rgba(0, 245, 255, 0.2)';
            }}
          >
            <Power size={38} className={isVpnConnecting ? 'animate-spin' : ''} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isVpnConnecting ? 'EN COURS' : isVpnConnected ? 'DÉCONNECTER' : 'CONNECTER'}
            </span>
          </button>
        </div>

        {/* Status text */}
        <div style={{ marginBottom: 16 }}>
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
            <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em' }}>
              {isVpnConnecting
                ? 'NÉGOCIATION DU TUNNEL WIREGUARD...'
                : isVpnConnected
                ? `CONNECTÉ · ${activeVpnNode?.name || selectedNode?.name}`
                : 'DÉCONNECTÉ · AUCUN TUNNEL ACTIF'}
            </span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {isVpnConnected
              ? `Tunnel chiffré via ${activeVpnNode?.city} · IP masquée : ${activeVpnNode?.ip}`
              : `Nœud sélectionné : ${selectedNode?.name} (${selectedNode?.city})`}
          </div>
        </div>

        {/* Live Telemetry Bar */}
        {isVpnConnected && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 28,
              padding: '12px 24px',
              borderRadius: 12,
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(0, 245, 255, 0.2)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>DURÉE : </span>
              <strong style={{ color: '#ffffff' }}>{formatTime(vpnConnectTime)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>LATENCE : </span>
              <strong style={{ color: 'var(--cyan)' }}>{activeVpnNode?.ping || selectedNode?.ping} ms</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <ArrowDown size={14} style={{ color: '#10b981' }} />
              <strong style={{ color: '#ffffff' }}>{formatBytes(vpnBytesIn)}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <ArrowUp size={14} style={{ color: '#38bdf8' }} />
              <strong style={{ color: '#ffffff' }}>{formatBytes(vpnBytesOut)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>CHIFFREMENT : </span>
              <strong style={{ color: '#a855f7' }}>AES-256-GCM</strong>
            </div>
          </div>
        )}
      </div>

      {/* Country Stacks Library */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#ffffff' }}>
            Catalogue des Relais par Pays ({vpnCountries.length} Régions)
          </h2>
          <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Chaque pays sélectionne automatiquement son nœud le plus rapide. Déroulez pour choisir un serveur spécifique.
          </p>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par pays, ville..."
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            fontSize: 12,
            minWidth: 220,
          }}
        />
      </div>

      {/* Country Stacks Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredCountries.map((countryGroup) => {
          const isExpanded = expandedCountry === countryGroup.country;
          const bestNode = countryGroup.nodes.reduce((prev, curr) => (curr.ping < prev.ping ? curr : prev), countryGroup.nodes[0]);
          const isSelectedCountry = selectedNode && countryGroup.nodes.some((n) => n.id === selectedNode.id);

          return (
            <div
              key={countryGroup.country}
              className="glass-card"
              style={{
                borderRadius: 12,
                border: isSelectedCountry ? '1px solid rgba(0, 245, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Country Summary Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  cursor: 'pointer',
                  backgroundColor: isSelectedCountry ? 'rgba(0, 245, 255, 0.04)' : 'transparent',
                }}
                onClick={() => {
                  setExpandedCountry(isExpanded ? null : countryGroup.country);
                  if (!isSelectedCountry) {
                    setSelectedNode(bestNode);
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 24 }}>{countryGroup.flag}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{countryGroup.country}</span>
                      {isSelectedCountry && (
                        <span className="badge badge-cyan" style={{ fontSize: 10, padding: '2px 6px' }}>
                          SÉLECTIONNÉ
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {countryGroup.nodes.length} nœud(s) disponibles · Plus rapide : {bestNode.name}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Lowest ping badge */}
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      color: bestNode.ping < 30 ? '#10b981' : bestNode.ping < 80 ? '#38bdf8' : '#fbbf24',
                      padding: '4px 10px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    ⚡ {countryGroup.bestPing} ms
                  </div>

                  <div style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
              </div>

              {/* Expandable Accordion with individual nodes */}
              {isExpanded && (
                <div
                  style={{
                    padding: '8px 16px 14px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, paddingLeft: 6 }}>
                    Nœuds individuels (cliquez pour sélectionner) :
                  </div>

                  {countryGroup.nodes.map((node) => {
                    const isNodeActive = selectedNode?.id === node.id;
                    return (
                      <div
                        key={node.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNode(node);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 8,
                          backgroundColor: isNodeActive ? 'rgba(0, 245, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          border: isNodeActive ? '1px solid rgba(0, 245, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.04)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              backgroundColor: isNodeActive ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.3)',
                            }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{node.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{node.city} · {node.ip}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{node.speedMbps} Mbps</span>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 12,
                              color: node.ping < 30 ? '#10b981' : node.ping < 80 ? '#38bdf8' : '#fbbf24',
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
  );
}
