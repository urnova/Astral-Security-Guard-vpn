import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Globe, Lock, Power, RefreshCw, AlertCircle, Wifi, CheckCircle2, Info } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

export interface VpnServer {
  id: string;
  country: string;
  location: string;
  countryCode?: string;
  flag?: string;
  ping: number;
  ip: string;
  speedMbps: number;
  uptimeHours?: number;
  sessions?: number;
}

interface CoexistenceStatus {
  thirdPartyActive: boolean;
  vpnName?: string;
  adapterName?: string;
  details?: string;
}

export default function VpnTab() {
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<VpnServer | null>(null);
  const [vpnState, setVpnState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [killSwitch, setKillSwitch] = useState(false);
  const [loadingServers, setLoadingServers] = useState(false);
  const [search, setSearch] = useState('');
  const [coexistence, setCoexistence] = useState<CoexistenceStatus>({ thirdPartyActive: false });
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkCoexistence = async () => {
    if (!api?.vpnGetCoexistenceStatus) return;
    try {
      const status = await api.vpnGetCoexistenceStatus();
      if (status) {
        setCoexistence(status);
      }
    } catch {}
  };

  const fetchServers = async () => {
    if (!api) return;
    setLoadingServers(true);
    setFallbackMessage(null);
    setErrorInfo(null);

    try {
      const res = await api.vpnFetchServers?.();
      if (res?.success && Array.isArray(res.servers) && res.servers.length > 0) {
        setServers(res.servers);
        if (!selectedServer) {
          setSelectedServer(res.servers[0]);
        }
      } else {
        setServers([]);
        setFallbackMessage(res?.message || 'Aucun serveur VPN disponible actuellement, réessayez plus tard.');
      }
    } catch (err: any) {
      setServers([]);
      setFallbackMessage('Serveurs VPN temporairement indisponibles.');
      setErrorInfo({ message: 'Erreur lors de la récupération des serveurs VPN.', technical: err.message });
    } finally {
      setLoadingServers(false);
    }
  };

  useEffect(() => {
    if (!api) return;

    checkCoexistence();
    fetchServers();

    api.vpnGetKillSwitch?.().then((res: any) => {
      if (res && typeof res.enabled === 'boolean') {
        setKillSwitch(res.enabled);
      }
    });

    const cleanup = api.on('vpn-event', (event: any) => {
      if (event.type === 'connecting') setVpnState('connecting');
      if (event.type === 'connected') setVpnState('connected');
      if (event.type === 'disconnected') {
        setVpnState('disconnected');
        setUptimeSeconds(0);
      }
      if (event.type === 'error') {
        setVpnState('disconnected');
        setErrorInfo({
          message: 'Erreur de connexion VPN.',
          technical: event.error,
        });
      }
    });

    // Periodically re-check coexistence in background
    const coexInterval = setInterval(checkCoexistence, 10000);

    return () => {
      if (typeof cleanup === 'function') cleanup();
      clearInterval(coexInterval);
    };
  }, []);

  // Timer
  useEffect(() => {
    let interval: any = null;
    if (vpnState === 'connected') {
      interval = setInterval(() => setUptimeSeconds((s) => s + 1), 1000);
    } else {
      setUptimeSeconds(0);
    }
    return () => clearInterval(interval);
  }, [vpnState]);

  const handleToggleConnect = async () => {
    // If third-party VPN is active, enforce peaceful coexistence
    if (coexistence.thirdPartyActive && vpnState === 'disconnected') {
      setNotice(`🛡️ ${coexistence.vpnName} est actif. Mode Coexistence engagé : vos connexions et votre VPN actuel restent préservés sans conflit.`);
      setTimeout(() => setNotice(null), 5000);
      return;
    }

    if (!selectedServer && vpnState === 'disconnected') return;
    setErrorInfo(null);

    if (vpnState === 'connected') {
      setVpnState('disconnected');
      await api?.vpnDisconnect?.();
    } else if (vpnState === 'disconnected') {
      setVpnState('connecting');
      try {
        const res = await api?.vpnConnect?.(selectedServer!.id);
        if (res?.blockedByCoexistence) {
          setVpnState('disconnected');
          setNotice(res.message);
          setTimeout(() => setNotice(null), 6000);
        } else if (!res?.success) {
          setVpnState('disconnected');
          setErrorInfo({
            message: 'Impossible d’établir le tunnel VPN.',
            technical: res?.error,
          });
        }
      } catch (err: any) {
        setVpnState('disconnected');
        setErrorInfo({ message: 'Échec de la connexion VPN.', technical: err.message });
      }
    }
  };

  const handleToggleKillSwitch = async (enabled: boolean) => {
    setKillSwitch(enabled);
    if (!api) return;
    try {
      const res = await api.vpnSetKillSwitch(enabled);
      if (!res?.success) {
        setKillSwitch(!enabled);
        setErrorInfo({
          message: 'Impossible de modifier le Kill Switch.',
          technical: res?.error,
        });
      } else {
        setNotice(enabled ? 'Kill Switch sécurisé activé (mode passif non-destructif).' : 'Kill Switch désactivé.');
        setTimeout(() => setNotice(null), 3500);
      }
    } catch (err: any) {
      setKillSwitch(!enabled);
      setErrorInfo({ message: 'Erreur Kill Switch', technical: err.message });
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filteredServers = servers.filter(
    (s) =>
      s.country.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase()) ||
      s.ip.includes(search)
  );

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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid var(--border-violet)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--violet)',
              }}
            >
              <Lock size={18} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Tunnel Chiffré & Coexistence VPN
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Chiffrement sécurisé · Détection intelligente de vos VPN tiers · Zéro conflit réseau
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {coexistence.thirdPartyActive && (
            <span
              className="badge badge-green"
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ShieldCheck size={14} />
              <span>{coexistence.vpnName} Détecté</span>
            </span>
          )}

          <div
            className={`badge ${
              vpnState === 'connected'
                ? 'badge-green'
                : vpnState === 'connecting'
                ? 'badge-orange'
                : 'badge-gray'
            }`}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600 }}
          >
            <span
              className="badge-dot"
              style={{
                backgroundColor:
                  vpnState === 'connected' ? 'var(--green)' : vpnState === 'connecting' ? 'var(--orange)' : 'var(--text-muted)',
              }}
            />
            {vpnState === 'connected'
              ? 'TUNNEL ACTIF'
              : vpnState === 'connecting'
              ? 'CONNEXION...'
              : coexistence.thirdPartyActive
              ? 'COEXISTENCE PASSIVE'
              : 'DÉCONNECTÉ'}
          </div>

          <button
            onClick={() => {
              checkCoexistence();
              fetchServers();
            }}
            disabled={loadingServers}
            className="btn btn-ghost"
            style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            title="Actualiser l'état et les relais"
          >
            <RefreshCw size={14} className={loadingServers ? 'animate-spin' : ''} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: 'rgba(16, 217, 160, 0.1)',
            border: '1px solid rgba(16, 217, 160, 0.3)',
            color: 'var(--green)',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {/* Third-Party Coexistence Card */}
      {coexistence.thirdPartyActive && (
        <div
          className="glass-card"
          style={{
            padding: '16px 20px',
            borderRadius: 14,
            marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(16, 217, 160, 0.08), rgba(6, 6, 20, 0.6))',
            border: '1px solid rgba(16, 217, 160, 0.3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: 'rgba(16, 217, 160, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--green)',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Bouclier de Coexistence Actif — {coexistence.vpnName}
              </h3>
              <span className="badge badge-green" style={{ fontSize: 10 }}>Sécurité Maximale</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Votre logiciel VPN principal (<strong>{coexistence.vpnName}</strong>) est détecté en activité. Astral Vanguard respecte scrupuleusement vos configurations de routage, vos adaptateurs virtuels et vos serveurs DNS : <strong>aucune modification conflictuelle</strong> n'est appliquée, garantissant une navigation 100% ininterrompue.
            </p>
          </div>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {fallbackMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: 'rgba(255, 140, 66, 0.1)',
            border: '1px solid var(--border-orange)',
            color: 'var(--orange)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <AlertCircle size={16} />
          <span>{fallbackMessage}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 24 }}>
        {/* Connection Widget Card (5 cols) */}
        <div
          className="glass-card"
          style={{
            gridColumn: 'span 5',
            padding: 24,
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Main Power Button */}
          <div style={{ margin: '16px 0 20px 0', position: 'relative' }}>
            <button
              onClick={handleToggleConnect}
              disabled={vpnState === 'connecting'}
              style={{
                width: 130,
                height: 130,
                borderRadius: '50%',
                border: `3px solid ${
                  vpnState === 'connected'
                    ? 'var(--green)'
                    : coexistence.thirdPartyActive
                    ? 'var(--green)'
                    : 'var(--violet)'
                }`,
                backgroundColor:
                  vpnState === 'connected'
                    ? 'rgba(16, 217, 160, 0.15)'
                    : coexistence.thirdPartyActive
                    ? 'rgba(16, 217, 160, 0.10)'
                    : 'rgba(139, 92, 246, 0.12)',
                boxShadow:
                  vpnState === 'connected'
                    ? '0 0 32px rgba(16, 217, 160, 0.4)'
                    : coexistence.thirdPartyActive
                    ? '0 0 24px rgba(16, 217, 160, 0.25)'
                    : '0 0 24px rgba(139, 92, 246, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              <Power
                size={34}
                style={{
                  color:
                    vpnState === 'connected'
                      ? 'var(--green)'
                      : coexistence.thirdPartyActive
                      ? 'var(--green)'
                      : 'var(--violet)',
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  marginTop: 6,
                  color: 'var(--text-secondary)',
                }}
              >
                {vpnState === 'connected'
                  ? 'DÉCONNECTER'
                  : vpnState === 'connecting'
                  ? 'CONNEXION...'
                  : coexistence.thirdPartyActive
                  ? 'COEXISTENCE'
                  : 'CONNECTER'}
              </span>
            </button>
          </div>

          <h3 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {vpnState === 'connected' && selectedServer
              ? `Connecté à ${selectedServer.country}`
              : coexistence.thirdPartyActive
              ? `Protégé via ${coexistence.vpnName}`
              : selectedServer
              ? `Prêt : ${selectedServer.country}`
              : 'Aucun relais sélectionné'}
          </h3>

          <p style={{ margin: '0 0 20px 0', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {vpnState === 'connected' && selectedServer
              ? `IP: ${selectedServer.ip} · Durée : ${formatTime(uptimeSeconds)}`
              : coexistence.thirdPartyActive
              ? `Tunnels et cartes réseau protégés contre tout conflit`
              : selectedServer
              ? `Relais : ${selectedServer.location} · Latence : ${selectedServer.ping} ms`
              : 'Sélectionnez un relais dans l\'annuaire'}
          </p>

          <div
            style={{
              width: '100%',
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              textAlign: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Latence</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>
                {selectedServer ? `${selectedServer.ping} ms` : '–'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Protocole</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet)', fontFamily: 'var(--mono)' }}>
                {coexistence.thirdPartyActive ? coexistence.vpnName : 'AES-256'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Débit estimé</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                {selectedServer && selectedServer.speedMbps ? `${selectedServer.speedMbps} Mbps` : 'Direct'}
              </span>
            </div>
          </div>

          {/* Kill Switch Toggle Safe Card */}
          <div
            style={{
              width: '100%',
              marginTop: 18,
              padding: 14,
              borderRadius: 12,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={14} style={{ color: 'var(--cyan)' }} />
                <span>Kill Switch Intelligent</span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Isolation sécurisée sans coupure de vos applications tierces
              </p>
            </div>
            <label className="toggle-switch" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={killSwitch}
                onChange={(e) => handleToggleKillSwitch(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* Server List Card (7 cols) */}
        <div
          className="glass-card"
          style={{
            gridColumn: 'span 7',
            padding: 20,
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} style={{ color: 'var(--cyan)' }} />
              <span>Annuaire des Relais VPN Chiffrés</span>
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {filteredServers.length} relais disponibles
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Rechercher par pays, ville, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 14px',
                borderRadius: 10,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>

          <div
            style={{
              flex: 1,
              maxHeight: 380,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingRight: 4,
            }}
          >
            {filteredServers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Aucun serveur ne correspond à votre recherche.
              </div>
            ) : (
              filteredServers.map((s) => {
                const isSelected = selectedServer?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedServer(s)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      backgroundColor: isSelected ? 'rgba(0, 212, 255, 0.08)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--border-cyan)' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {s.countryCode || 'UN'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.country}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                          {s.location} · {s.ip}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        className={`badge ${s.ping < 60 ? 'badge-green' : s.ping < 120 ? 'badge-cyan' : 'badge-orange'}`}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {s.ping} ms
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--mono)', minWidth: 50, textAlign: 'right' }}>
                        {s.speedMbps} Mb/s
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
