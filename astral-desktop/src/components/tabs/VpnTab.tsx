import { useState, useEffect, useMemo } from 'react';
import {
  Power, RefreshCw, ChevronDown, Lock, Globe,
  AlertTriangle, CheckCircle2, Info, Zap, ArrowDown, ArrowUp, X, Check, ExternalLink, Download, Shield
} from 'lucide-react';

const api = (window as any).vanguard;

interface VpnNode {
  id?: string;
  name: string;
  speed: string;
  speedMbps: number;
  protocolBadge: string;
  ip: string;
  ping: number;
  sessions: number;
  disclaimer?: string;
}

interface Country {
  cc: string;
  name: string;
  latency: number;
  nodes: VpnNode[];
}

type SortCriteria = 'ping' | 'speed' | 'sessions' | 'name';

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
        <span className="cc" style={{ fontSize: 13, fontWeight: 700, minWidth: 26, color: 'var(--a1)' }}>
          {country.cc}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: 'var(--text)' }}>{country.name}</b>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              · {country.nodes.length} relais communautaire{country.nodes.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <span className={`chip${country.latency > 100 ? ' warn' : ''}`} style={{ fontSize: 11 }}>
          {country.latency > 0 ? `${country.latency} ms` : '—'}
        </span>
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
            color: 'var(--muted)',
          }}
        >
          <ChevronDown size={15} />
        </span>
      </div>

      {/* Nodes Sub-List */}
      {isOpen && (
        <div style={{ padding: '6px 14px 12px', background: 'rgba(0,0,0,0.25)' }}>
          {country.nodes.map((node) => {
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
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background:
                        isSelected && connected ? '#22c55e' : isSelected ? 'var(--a1)' : 'rgba(255,255,255,0.2)',
                      boxShadow: isSelected && connected ? '0 0 8px #22c55e' : undefined,
                    }}
                  />
                  <div>
                    <b style={{ fontSize: 12.5, color: isSelected ? '#fff' : 'var(--text)' }}>{node.name}</b>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{node.speed}</span>
                      <span
                        style={{
                          fontSize: 9.5,
                          color: '#38bdf8',
                          background: 'rgba(56,189,248,0.1)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          border: '1px solid rgba(56,189,248,0.2)',
                        }}
                      >
                        {node.protocolBadge}
                      </span>
                      {node.sessions > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                          · {node.sessions} session{node.sessions > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {node.ping > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {node.ping} ms
                    </span>
                  )}
                  {isSelected && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: connected ? '#22c55e' : 'var(--a1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
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
  const [connected, setConnected]                 = useState(false);
  const [vpnState, setVpnState]                   = useState<string>('disconnected');
  const [statusMessage, setStatusMessage]         = useState('');
  const [countries, setCountries]                 = useState<Country[]>([]);
  const [catalogLoading, setCatalogLoading]       = useState(true);
  const [catalogError, setCatalogError]           = useState<string | null>(null);
  const [catalogSource, setCatalogSource]         = useState<{ count: number; timestamp: number; isCache: boolean } | null>(null);
  const [selectedNode, setSelectedNode]           = useState('');
  const [selectedNodeData, setSelectedNodeData]   = useState<VpnNode | null>(null);
  const [realPublicIp, setRealPublicIp]           = useState('');
  const [publicIpVerified, setPublicIpVerified]   = useState(false);
  const [dnsVerified, setDnsVerified]             = useState(false);
  const [elapsed, setElapsed]                     = useState('00:00');
  const [downBytes, setDownBytes]                 = useState<number | null>(null);
  const [upBytes, setUpBytes]                     = useState<number | null>(null);
  const [bytesAvailable, setBytesAvailable]       = useState(false);
  const [query, setQuery]                         = useState('');
  const [sortMode, setSortMode]                   = useState<SortCriteria>('ping');
  const [error, setError]                         = useState('');
  const [openVpnInstalled, setOpenVpnInstalled]   = useState<boolean | null>(null);
  const [openCountry, setOpenCountry]             = useState<string | null>(null);
  const [routingMode, setRoutingMode]             = useState<string>('none');
  const [routingDetails, setRoutingDetails]       = useState<string>('');
  const [ipv6Qualification, setIpv6Qualification] = useState<any>({
    state: 'unsupported_by_engine',
    details: 'Tunnel IPv4 exclusif. Le relais VPN Gate ne supporte pas l\'IPv6.',
    riskWarning: false,
    leakConfirmed: false,
  });
  const [installerInfo, setInstallerInfo]         = useState<any>(null);
  const [showInstallerModal, setShowInstallerModal] = useState(false);

  // Charger le catalogue officiel VPN Gate
  const fetchCatalog = async (forceRefresh = false) => {
    if (!api?.vpnFetchServers) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await api.vpnFetchServers(forceRefresh);
      if (res?.success && Array.isArray(res.servers) && res.servers.length > 0) {
        const map = new Map<string, Country>();
        for (const s of res.servers) {
          const cc = (s.countryCode || 'UN').toUpperCase();
          const name = s.country || cc;
          if (!map.has(cc)) {
            map.set(cc, {
              cc,
              name,
              latency: s.ping || 999,
              nodes: [],
            });
          }
          const c = map.get(cc)!;
          if (s.ping && s.ping < c.latency) {
            c.latency = s.ping;
          }
          c.nodes.push({
            id: s.id,
            name: `${name} · ${s.ip}`,
            speed: s.speedMbps > 0 ? `${s.speedMbps} Mbps` : 'Débit non précisé',
            speedMbps: s.speedMbps || 0,
            protocolBadge: 'OpenVPN',
            ip: s.ip,
            ping: s.ping || 0,
            sessions: s.sessions || 0,
            disclaimer: s.disclaimer,
          });
        }
        const list = Array.from(map.values());
        setCountries(list);
        setCatalogSource(res.catalogSource || null);

        // Sélectionner par défaut le premier serveur si aucun sélectionné
        if (list.length > 0 && list[0].nodes.length > 0) {
          setSelectedNode((prev) => prev || list[0].nodes[0].name);
          setSelectedNodeData((prev) => prev || list[0].nodes[0]);
          setOpenCountry((prev) => prev || list[0].cc);
        }
      } else {
        setCountries([]);
        setCatalogError(res?.message || 'Aucun relais communautaire disponible dans le catalogue.');
      }
    } catch (err: any) {
      setCountries([]);
      setCatalogError(err.message || 'Impossible de contacter le service VPN Gate.');
    } finally {
      setCatalogLoading(false);
    }
  };

  // Chargement initial du catalogue et vérification moteur
  useEffect(() => {
    fetchCatalog(false);

    if (api?.vpnGetEngineStatus) {
      api.vpnGetEngineStatus().then((eng: any) => {
        if (eng && typeof eng.installed === 'boolean') {
          setOpenVpnInstalled(eng.installed);
        }
      }).catch(() => {});
    }

    if (api?.vpnGetInstallerInfo) {
      api.vpnGetInstallerInfo().then((info: any) => {
        if (info?.success) {
          setInstallerInfo(info);
          if (typeof info.installed === 'boolean') {
            setOpenVpnInstalled(info.installed);
          }
        }
      }).catch(() => {});
    }

    if (api?.vpnGetStatus) {
      api.vpnGetStatus().then((s: any) => {
        if (s?.status) {
          const st = s.status;
          if (typeof st.openVpnInstalled === 'boolean') {
            setOpenVpnInstalled(st.openVpnInstalled);
          }
          if (st.state) {
            setVpnState(st.state);
            setConnected(st.state === 'connected');
          }
          if (st.statusMessage) setStatusMessage(st.statusMessage);
          if (st.publicIp) setRealPublicIp(st.publicIp);
          if (typeof st.publicIpVerified === 'boolean') setPublicIpVerified(st.publicIpVerified);
          if (typeof st.dnsVerified === 'boolean') setDnsVerified(st.dnsVerified);
          if (typeof st.bytesAvailable === 'boolean') setBytesAvailable(st.bytesAvailable);
          if (typeof st.bytesReceived === 'number') setDownBytes(st.bytesReceived);
          if (typeof st.bytesSent === 'number') setUpBytes(st.bytesSent);
          if (st.verificationDetails) {
            if (st.verificationDetails.routingMode) setRoutingMode(st.verificationDetails.routingMode);
            if (st.verificationDetails.routingDetails) setRoutingDetails(st.verificationDetails.routingDetails);
            if (st.verificationDetails.ipv6Qualification) setIpv6Qualification(st.verificationDetails.ipv6Qualification);
          }
          if (st.activeServer) {
            setSelectedNode(`${st.activeServer.country} · ${st.activeServer.ip}`);
          }
        }
      }).catch(() => {});
    }

    // Abonnements aux événements d'état du moteur
    const unsubState = api?.on?.('vpn-event', (d: any) => {
      if (d?.type === 'state-change' && d.status) {
        const st = d.status;
        setVpnState(st.state || 'disconnected');
        setConnected(st.state === 'connected');
        if (st.statusMessage) setStatusMessage(st.statusMessage);
        if (st.publicIp) setRealPublicIp(st.publicIp);
        if (typeof st.publicIpVerified === 'boolean') setPublicIpVerified(st.publicIpVerified);
        if (typeof st.dnsVerified === 'boolean') setDnsVerified(st.dnsVerified);
        if (typeof st.bytesAvailable === 'boolean') setBytesAvailable(st.bytesAvailable);
        if (typeof st.bytesReceived === 'number') setDownBytes(st.bytesReceived);
        if (typeof st.bytesSent === 'number') setUpBytes(st.bytesSent);
        if (st.verificationDetails) {
          if (st.verificationDetails.routingMode) setRoutingMode(st.verificationDetails.routingMode);
          if (st.verificationDetails.routingDetails) setRoutingDetails(st.verificationDetails.routingDetails);
          if (st.verificationDetails.ipv6Qualification) setIpv6Qualification(st.verificationDetails.ipv6Qualification);
        }
        if (typeof st.durationSeconds === 'number') {
          const m = Math.floor(st.durationSeconds / 60);
          const s = st.durationSeconds % 60;
          setElapsed(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }
      } else if (d?.type === 'disconnected') {
        setConnected(false);
        setVpnState('disconnected');
        setStatusMessage('Déconnecté.');
        setRealPublicIp('');
        setPublicIpVerified(false);
        setDnsVerified(false);
        setRoutingMode('none');
        setRoutingDetails('');
        setDownBytes(null);
        setUpBytes(null);
        setBytesAvailable(false);
        setElapsed('00:00');
      }
    });

    return () => {
      unsubState?.();
    };
  }, []);

  // Polling de télémétrie si connecté
  useEffect(() => {
    let timer: any = null;
    if (connected) {
      timer = setInterval(async () => {
        try {
          const s = await api?.vpnGetStatus?.();
          if (s?.status) {
            const st = s.status;
            if (st.state) {
              setVpnState(st.state);
              setConnected(st.state === 'connected');
            }
            if (st.statusMessage) setStatusMessage(st.statusMessage);
            if (st.publicIp) setRealPublicIp(st.publicIp);
            if (typeof st.publicIpVerified === 'boolean') setPublicIpVerified(st.publicIpVerified);
            if (typeof st.dnsVerified === 'boolean') setDnsVerified(st.dnsVerified);
            if (typeof st.bytesAvailable === 'boolean') setBytesAvailable(st.bytesAvailable);
            if (typeof st.bytesReceived === 'number') setDownBytes(st.bytesReceived);
            if (typeof st.bytesSent === 'number') setUpBytes(st.bytesSent);
            if (typeof st.durationSeconds === 'number') {
              const m = Math.floor(st.durationSeconds / 60);
              const s = st.durationSeconds % 60;
              setElapsed(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
          }
        } catch {}
      }, 2000);
    } else {
      setElapsed('00:00');
      setDownBytes(null);
      setUpBytes(null);
      setBytesAvailable(false);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [connected]);

  // Connexion / Déconnexion
  const handleToggleConnect = async () => {
    if (vpnState !== 'disconnected' && vpnState !== 'connected' && vpnState !== 'error') {
      return; // Transition en cours
    }
    setError('');

    if (connected) {
      setVpnState('disconnecting');
      try {
        await api?.vpnDisconnect?.();
        setConnected(false);
        setVpnState('disconnected');
        setStatusMessage('Déconnecté.');
        setRealPublicIp('');
      } catch (err: any) {
        setError(err.message || 'Erreur lors de la déconnexion.');
        setVpnState('disconnected');
      }
    } else {
      if (!selectedNodeData) {
        setError('Veuillez sélectionner un relais dans le catalogue.');
        return;
      }
      setVpnState('preparing');
      try {
        const coex = await api?.vpnGetCoexistenceStatus?.();
        if (coex?.status === 'conflict_confirmed') {
          setVpnState('disconnected');
          setError(`⚠️ Conflit détecté : ${coex.vpnName || 'Un VPN tiers'} route l'ensemble du trafic (${coex.adapterName || 'tunnel actif'}). Déconnectez-le pour éviter tout conflit de routage.`);
          return;
        }

        const targetId = selectedNodeData.id || selectedNodeData.ip;
        const res = await api?.vpnConnect?.(targetId);
        if (res && res.success === false) {
          setError(res.message || 'Impossible d\'établir le tunnel OpenVPN.');
          setVpnState('error');
        } else {
          setConnected(true);
          setVpnState('connected');
        }
      } catch (err: any) {
        setError(err.message || 'Impossible d\'établir le tunnel OpenVPN.');
        setVpnState('error');
      }
    }
  };

  // Sélection d'un relais
  const handleSelectNode = async (node: VpnNode) => {
    setSelectedNode(node.name);
    setSelectedNodeData(node);

    if (connected) {
      setVpnState('disconnecting');
      setError('');
      try {
        await api?.vpnDisconnect?.();
        await new Promise((r) => setTimeout(r, 600));
        setVpnState('preparing');
        const targetId = node.id || node.ip;
        const res = await api?.vpnConnect?.(targetId);
        if (res && res.success === false) {
          setError(res.message || `Erreur de bascule vers ${node.name}.`);
          setConnected(false);
          setVpnState('error');
        } else {
          setConnected(true);
          setVpnState('connected');
        }
      } catch (err: any) {
        setError(err.message || `Erreur de bascule vers ${node.name}.`);
        setConnected(false);
        setVpnState('error');
      }
    }
  };

  // Tri et filtrage objectif des pays et relais
  const sortedCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = countries.map((c) => {
      const matched = c.nodes.filter((n) =>
        !q ||
        n.name.toLowerCase().includes(q) ||
        n.ip.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.cc.toLowerCase().includes(q)
      );
      return { ...c, nodes: matched };
    }).filter((c) => c.nodes.length > 0);

    return filtered.sort((a, b) => {
      if (sortMode === 'ping') return a.latency - b.latency;
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'speed') {
        const maxA = Math.max(...a.nodes.map((n) => n.speedMbps), 0);
        const maxB = Math.max(...b.nodes.map((n) => n.speedMbps), 0);
        return maxB - maxA;
      }
      if (sortMode === 'sessions') {
        const sumA = a.nodes.reduce((acc, n) => acc + n.sessions, 0);
        const sumB = b.nodes.reduce((acc, n) => acc + n.sessions, 0);
        return sumA - sumB;
      }
      return 0;
    });
  }, [countries, query, sortMode]);

  const fmtBytes = (b: number | null) => {
    if (b === null || b === undefined) return 'Non disponible';
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
    return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
  };

  // Libellé et couleur du bouton selon l'état réel fin
  const getButtonState = () => {
    switch (vpnState) {
      case 'connected':
        return { label: 'DÉCONNECTER', color: '#22c55e', bg: 'rgba(34,197,94,0.22)', border: '#22c55e' };
      case 'preparing':
        return { label: 'PRÉPARATION…', color: '#38bdf8', bg: 'rgba(56,189,248,0.22)', border: '#38bdf8' };
      case 'connecting':
        return { label: 'NÉGOCIATION…', color: '#38bdf8', bg: 'rgba(56,189,248,0.22)', border: '#38bdf8' };
      case 'authenticating':
        return { label: 'AUTHENTIFICATION…', color: '#38bdf8', bg: 'rgba(56,189,248,0.22)', border: '#38bdf8' };
      case 'assigning_ip':
        return { label: 'ROUTAGE IP…', color: '#38bdf8', bg: 'rgba(56,189,248,0.22)', border: '#38bdf8' };
      case 'verifying_tunnel':
        return { label: 'VÉRIFICATION…', color: '#eab308', bg: 'rgba(234,179,8,0.22)', border: '#eab308' };
      case 'reconnecting':
        return { label: 'RECONNEXION…', color: '#f97316', bg: 'rgba(249,115,22,0.22)', border: '#f97316' };
      case 'disconnecting':
        return { label: 'FERMETURE…', color: 'var(--muted)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)' };
      case 'error':
        return { label: 'RÉESSAYER', color: '#ef4444', bg: 'rgba(239,68,68,0.22)', border: '#ef4444' };
      default:
        return { label: 'CONNECTER', color: '#ffffff', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)' };
    }
  };

  const btnConfig = getButtonState();
  const isTransitioning = ['preparing', 'connecting', 'authenticating', 'assigning_ip', 'verifying_tunnel', 'disconnecting'].includes(vpnState);

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>VPN & Anonymat</h1>
            <p className="sub">
              Routage chiffré via le réseau communautaire VPN Gate et contrôle d'étanchéité IP.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {connected ? (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#22c55e',
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 20,
                  padding: '4px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                TUNNEL ACTIF
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  padding: '4px 14px',
                }}
              >
                TUNNEL INACTIF
              </span>
            )}
          </div>
        </div>

        {/* Bannière de transparence obligatoire VPN Gate */}
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'rgba(56,189,248,0.06)',
            border: '1px solid rgba(56,189,248,0.2)',
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
            <Globe size={15} />
            <span>Relais communautaires bénévoles (Projet académique VPN Gate — Université de Tsukuba)</span>
          </div>
          <div style={{ color: 'var(--muted)' }}>
            Ces serveurs sont hébergés par des volontaires bénévoles à travers le monde. Leur disponibilité, débit et chiffrement peuvent fluctuer sans préavis.
            Conformément à la politique anti-abus de VPN Gate, des journaux de connexion sont conservés par les opérateurs de relais.
            Vanguard ne garantit aucun « anonymat absolu » ni « zéro log » sur cette infrastructure publique.{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                api?.openExternal?.('https://www.vpngate.net/en/about_abuse.aspx');
              }}
              style={{ color: 'var(--a1)', textDecoration: 'underline', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
            >
              Consulter la politique anti-abus officielle <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Message d'erreur utilisateur */}
        {error && (
          <div className="state-error" style={{ marginBottom: 16 }}>
            <AlertTriangle size={15} />
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Parcours d'Installation Accompagnée OpenVPN */}
        {openVpnInstalled === false && (
          <div
            style={{
              marginBottom: 16,
              padding: '16px 20px',
              background: 'rgba(234,179,8,0.06)',
              border: '1px solid rgba(234,179,8,0.25)',
              borderRadius: 12,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <Info size={22} style={{ color: '#eab308', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                  <strong style={{ color: '#facc15', fontSize: 13.5 }}>
                    Moteur OpenVPN officiel requis pour établir le tunnel physique
                  </strong>
                  <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, background: 'rgba(234,179,8,0.15)', color: '#fde047', fontWeight: 600 }}>
                    Installation accompagnée disponible
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, marginBottom: 12 }}>
                  Pour monter l'interface virtuelle Wintun et acheminer le trafic chiffré, OpenVPN Core et le pilote réseau doivent être installés.
                  Vanguard oriente vers le portail officiel de l'éditeur ou la commande winget (l'installation et la vérification des empreintes restent à effectuer par l'utilisateur).
                </div>

                {/* État des composants individuels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>COMPOSANT CLI (OPENVPN.EXE)</div>
                    <div style={{ fontSize: 12, color: installerInfo?.components?.binaryInstalled ? '#22c55e' : '#f59e0b', fontWeight: 700, marginTop: 2 }}>
                      {installerInfo?.components?.binaryInstalled ? '✓ Présent sur le système' : '✗ Manquant'}
                    </div>
                  </div>
                  <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>PILOTE TUN WINDOWS (WINTUN.DLL)</div>
                    <div style={{ fontSize: 12, color: installerInfo?.components?.driverInstalled ? '#22c55e' : '#f59e0b', fontWeight: 700, marginTop: 2 }}>
                      {installerInfo?.components?.driverInstalled ? '✓ Pilote disponible' : '✗ Manquant'}
                    </div>
                  </div>
                  <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>SERVICE INTERACTIF (OPENVPN SERVICE)</div>
                    <div style={{ fontSize: 12, color: installerInfo?.components?.serviceInstalled ? (installerInfo?.components?.serviceRunning ? '#22c55e' : '#f59e0b') : '#f59e0b', fontWeight: 700, marginTop: 2 }}>
                      {installerInfo?.components?.serviceInstalled ? (installerInfo?.components?.serviceRunning ? '✓ Service actif (démarré)' : '⚠️ Installé mais arrêté') : '✗ Non installé'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setShowInstallerModal(true)}
                    className="btn btn-sm"
                    style={{
                      background: 'rgba(56,189,248,0.2)',
                      border: '1px solid rgba(56,189,248,0.4)',
                      color: '#38bdf8',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      padding: '6px 14px',
                    }}
                  >
                    <Download size={14} />
                    Préparer l'installation accompagnée
                  </button>

                  <button
                    onClick={() => api?.openExternal?.('https://openvpn.net/community-downloads/')}
                    className="btn btn-sm"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--fg-2)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ExternalLink size={13} />
                    Portail OpenVPN Community
                  </button>

                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Ou via terminal : <code style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4, color: '#93c5fd' }}>winget install OpenVPNTechnologies.OpenVPN</code>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal descriptif de préparation de l'installation accompagnée */}
        {showInstallerModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 540,
                background: '#0d111a',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 14,
                padding: 24,
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <b style={{ fontSize: 15, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={18} style={{ color: '#38bdf8' }} />
                  Installation Accompagnée OpenVPN Community
                </b>
                <button
                  onClick={() => setShowInstallerModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 16 }}>
                Vanguard ne modifie pas votre machine en arrière-plan. L'installation installe le package officiel
                <strong> OpenVPN Community x64</strong> signé numériquement par <em>OpenVPN Inc.</em>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 11.5 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>Éditeur : </span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>OpenVPN Inc. / Projet OpenVPN</span>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>Source officielle : </span>
                  <span style={{ color: '#38bdf8', wordBreak: 'break-all' }}>https://build.openvpn.net/downloads/releases/</span>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>Composants système : </span>
                  <span style={{ color: '#fff' }}>Binaire OpenVPN Core (openvpn.exe), pilote Wintun (wintun.dll)</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Privilèges requis : </span>
                  <span style={{ color: '#facc15' }}>Élévation administrateur (UAC) lors de l'installation du pilote</span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '10px 12px', borderRadius: 8, marginBottom: 20 }}>
                ⚠️ <strong>Note de gouvernance :</strong> L'exécution réelle de l'installateur sur votre système hôte est soumise à votre confirmation explicite. Vanguard pilote directement les connexions via le moteur en arrière-plan sans imposer l'utilisation de l'interface OpenVPN GUI.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setShowInstallerModal(false)}
                  className="btn btn-sm"
                  style={{ padding: '8px 16px' }}
                >
                  Fermer
                </button>
                <button
                  onClick={() => {
                    api?.openExternal?.('https://openvpn.net/community-downloads/');
                    setShowInstallerModal(false);
                  }}
                  className="btn btn-sm"
                  style={{
                    background: 'rgba(56,189,248,0.2)',
                    border: '1px solid rgba(56,189,248,0.5)',
                    color: '#38bdf8',
                    padding: '8px 16px',
                    fontWeight: 700,
                  }}
                >
                  Ouvrir le portail de téléchargement officiel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contrôles de sécurité : Kill Switch et Basculement automatique (Honnêtement désactivés) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}
        >
          {/* Card 1: Kill Switch Pare-Feu */}
          <div
            style={{
              padding: '16px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <Lock size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ color: '#fff', fontSize: 13 }}>Kill Switch Pare-Feu</b>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      padding: '2px 7px',
                      borderRadius: 6,
                    }}
                  >
                    INDISPONIBLE DANS CETTE VERSION
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
                  Indisponible dans cette version v0.1.6. En cas d'interruption du tunnel VPN, votre trafic Internet ordinaire reprend automatiquement sur votre connexion standard.
                </p>
              </div>
            </div>

            <label
              className="toggle"
              style={{ transform: 'scale(1.05)', opacity: 0.5, cursor: 'not-allowed', margin: 0, flexShrink: 0 }}
              title="Indisponible dans cette version"
            >
              <input type="checkbox" checked={false} disabled={true} />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>

          {/* Card 2: Basculement automatique */}
          <div
            style={{
              padding: '16px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <Zap size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ color: '#fff', fontSize: 13 }}>Basculement automatique</b>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      padding: '2px 7px',
                      borderRadius: 6,
                    }}
                  >
                    NON IMPLÉMENTÉ
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
                  La bascule automatique et transparente entre relais n'est pas implémentée dans cette version v0.1.6.
                </p>
              </div>
            </div>

            <label
              className="toggle"
              style={{ transform: 'scale(1.05)', opacity: 0.5, cursor: 'not-allowed', margin: 0, flexShrink: 0 }}
              title="Non implémenté"
            >
              <input type="checkbox" checked={false} disabled={true} />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>
        </div>

        {/* Grille principale : Radar de connexion (gauche) & Catalogue de relais (droite) */}
        <div className="grid g12" style={{ alignItems: 'stretch' }}>
          {/* Gauche : Bouton radar et télémétrie de session */}
          <div
            className="card card-p-lg"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'center',
              padding: 24,
              background: 'linear-gradient(135deg, rgba(13,17,26,0.95) 0%, rgba(9,11,18,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
            }}
          >
            <div style={{ width: '100%' }}>
              <div className="lbl" style={{ margin: '0 0 20px', fontSize: 13 }}>
                Tunnel OpenVPN Communautaire
              </div>

              {/* Bouton radar avec états réels */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 20px' }}>
                <div
                  onClick={handleToggleConnect}
                  style={{
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: btnConfig.bg,
                    border: `2.5px solid ${btnConfig.border}`,
                    boxShadow: connected
                      ? '0 0 35px rgba(34,197,94,0.4), inset 0 0 20px rgba(34,197,94,0.2)'
                      : isTransitioning
                      ? '0 0 35px rgba(56,189,248,0.45), inset 0 0 20px rgba(56,189,248,0.2)'
                      : '0 8px 24px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isTransitioning ? 'wait' : 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                  }}
                >
                  {isTransitioning && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: -8,
                        borderRadius: '50%',
                        border: '2px dashed #38bdf8',
                        animation: 'spin 2.5s linear infinite',
                        opacity: 0.85,
                      }}
                    />
                  )}

                  <Power size={48} style={{ color: btnConfig.color, transition: 'color 0.2s ease' }} />
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      marginTop: 10,
                      color: btnConfig.color,
                      maxWidth: 130,
                    }}
                  >
                    {btnConfig.label}
                  </span>
                </div>
              </div>

              {/* Message d'état dynamique */}
              <div style={{ marginBottom: 16 }}>
                <b style={{ fontSize: 13.5, color: '#ffffff', display: 'block' }}>
                  {selectedNode || 'Aucun relais sélectionné'}
                </b>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <span>État :</span>
                  <span style={{ color: btnConfig.color, fontWeight: 600 }}>
                    {statusMessage || (connected ? 'Connecté' : 'Déconnecté')}
                  </span>
                </span>
              </div>
            </div>

            {/* Télémétrie réelle de la session */}
            <div
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '12px 14px',
                textAlign: 'left',
                marginTop: 10,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 11.5 }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>
                    INTERFACE TUNNEL
                  </span>
                  <span style={{ color: connected ? '#22c55e' : 'var(--muted)', fontWeight: 600 }}>
                    {connected ? 'Tunnel actif (TUN)' : 'Inactif'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>
                    ROUTAGE PAR DÉFAUT
                  </span>
                  <span
                    style={{ color: connected ? '#22c55e' : 'var(--muted)', fontWeight: 600 }}
                    title={routingDetails || 'Table de routage Windows'}
                  >
                    {connected
                      ? (routingMode === 'def1_pair'
                          ? 'Paire /1 (def1)'
                          : routingMode === 'default_0'
                          ? '0.0.0.0/0 direct'
                          : routingMode === 'def1_incomplete'
                          ? 'Paire /1 incomplète'
                          : 'Tunnel actif')
                      : '—'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>
                    IP PUBLIQUE OBSERVÉE
                  </span>
                  <span
                    style={{
                      color: connected ? '#22c55e' : 'var(--muted)',
                      fontWeight: 700,
                      fontFamily: 'ui-monospace, monospace',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {connected ? (realPublicIp || 'Vérification…') : '— (Non masquée)'}
                    {connected && publicIpVerified && (
                      <span title="IP publique confirmée délocalisée par écho externe" style={{ display: 'inline-flex' }}>
                        <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>
                    RÉSOLVEUR DNS
                  </span>
                  <span
                    style={{
                      color: connected ? (dnsVerified ? '#22c55e' : '#f59e0b') : 'var(--muted)',
                      fontWeight: 600,
                    }}
                  >
                    {connected ? (dnsVerified ? 'Résolution via tunnel OK' : 'Non vérifiée') : '—'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>
                    TRAFIC IPV6
                  </span>
                  <span
                    style={{
                      color: connected
                        ? (ipv6Qualification?.leakConfirmed
                            ? '#ef4444'
                            : ipv6Qualification?.riskWarning
                            ? '#f59e0b'
                            : 'var(--muted)')
                        : 'var(--muted)',
                      fontWeight: 600,
                      fontSize: 10.5,
                    }}
                    title={ipv6Qualification?.details || 'Tunnel IPv4'}
                  >
                    {connected
                      ? (ipv6Qualification?.leakConfirmed
                          ? 'Fuite confirmée'
                          : ipv6Qualification?.riskWarning
                          ? 'Exposition potentielle'
                          : 'Non routé (IPv4)')
                      : '—'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 10, fontWeight: 600 }}>
                    DURÉE SESSION
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                    {connected ? elapsed : '00:00'}
                  </span>
                </div>
              </div>

              {/* Compteurs d'octets de session */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  marginTop: 10,
                  paddingTop: 8,
                  fontSize: 11,
                }}
              >
                {connected && bytesAvailable && downBytes !== null && upBytes !== null ? (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#22c55e' }}>
                      <ArrowDown size={12} />
                      <span>{fmtBytes(downBytes)} reçus</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#38bdf8' }}>
                      <ArrowUp size={12} />
                      <span>{fmtBytes(upBytes)} envoyés</span>
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: 10.5, fontStyle: 'italic' }}>
                    {connected
                      ? 'Compteurs d\'octets indisponibles sur ce binaire OpenVPN'
                      : 'Transfert inactif (déconnecté)'}
                  </span>
                )}
              </div>

              {/* Note transparente sur les limites de vérification */}
              {connected && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {ipv6Qualification?.riskWarning ? (
                    <span style={{ color: '#f59e0b', display: 'block', marginBottom: 2 }}>
                      ⚠️ <strong>Avertissement IPv6 :</strong> {ipv6Qualification.details}
                    </span>
                  ) : null}
                  <span>L'observation d'un routage par défaut et d'une résolution DNS réussie confirme la traversée du tunnel par la sonde Vanguard, mais ne garantit pas l'absence de fuites pour les sockets directs ou le trafic IPv6 en l'absence de kill switch.</span>
                </div>
              )}
            </div>
          </div>

          {/* Droite : Catalogue dynamique des serveurs */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', padding: 22 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <div className="lbl" style={{ margin: 0, fontSize: 13 }}>
                  Relais Communautaires VPN Gate
                </div>
                <small style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {catalogSource
                    ? `${catalogSource.count} relais disponibles (${catalogSource.isCache ? 'données déclarées du cache local' : 'données déclarées en direct'})`
                    : 'Sélectionnez un relais bénévole'}
                </small>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="inp"
                  style={{ width: 160, fontSize: 11.5, height: 32 }}
                  placeholder="Rechercher pays ou IP…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  onClick={() => fetchCatalog(true)}
                  className="btn btn-sm"
                  title="Actualiser le catalogue VPN Gate"
                  disabled={catalogLoading}
                  style={{ height: 32, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RefreshCw size={13} className={catalogLoading ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {/* Critères de tri objectif */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>Trier par :</span>
              {[
                { id: 'ping', label: 'Latence déclarée (catalogue)' },
                { id: 'speed', label: 'Débit déclaré (catalogue)' },
                { id: 'sessions', label: 'Sessions déclarées' },
                { id: 'name', label: 'Pays (A-Z)' },
              ].map((crit) => (
                <button
                  key={crit.id}
                  onClick={() => setSortMode(crit.id as SortCriteria)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    borderRadius: 14,
                    border: `1px solid ${sortMode === crit.id ? 'var(--a1)' : 'rgba(255,255,255,0.08)'}`,
                    background: sortMode === crit.id ? 'rgba(var(--a1r),.15)' : 'rgba(255,255,255,0.03)',
                    color: sortMode === crit.id ? 'var(--a1)' : 'var(--fg-2)',
                    cursor: 'pointer',
                    transition: 'all .15s ease',
                  }}
                >
                  {crit.label}
                </button>
              ))}
            </div>

            {/* Conteneur de liste avec gestion des états vide/chargement/erreur */}
            <div
              style={{
                flex: 1,
                maxHeight: 460,
                overflowY: 'auto',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {catalogLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', color: 'var(--a1)' }} />
                  <p style={{ fontSize: 12 }}>Chargement du catalogue communautaire VPN Gate…</p>
                  <small style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Interrogation des miroirs et validation d'intégrité des profils
                  </small>
                </div>
              ) : catalogError ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                  <AlertTriangle size={24} style={{ margin: '0 auto 10px', color: '#f59e0b' }} />
                  <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>{catalogError}</p>
                  <button
                    onClick={() => fetchCatalog(true)}
                    className="btn btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto' }}
                  >
                    <RefreshCw size={13} />
                    Réessayer
                  </button>
                </div>
              ) : sortedCountries.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                  <p style={{ fontSize: 12 }}>Aucun relais ne correspond à votre recherche.</p>
                </div>
              ) : (
                sortedCountries.map((c) => (
                  <CountryRow
                    key={c.cc + c.name}
                    country={c}
                    isOpen={openCountry === c.cc}
                    onToggle={() => setOpenCountry((prev) => (prev === c.cc ? null : c.cc))}
                    selectedNode={selectedNode}
                    onSelectNode={handleSelectNode}
                    connected={connected}
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
