import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

interface VpnServer {
  id: string;
  country: string;
  location: string;
  flag: string;
  ping: number;
  ip: string;
  load: number;
}

const DEFAULT_SERVERS: VpnServer[] = [
  { id: 'fr-par', country: 'France', location: 'Paris', flag: '🇫🇷', ping: 18, ip: '185.220.101.5', load: 32 },
  { id: 'de-fra', country: 'Allemagne', location: 'Francfort', flag: '🇩🇪', ping: 24, ip: '194.36.191.12', load: 45 },
  { id: 'nl-ams', country: 'Pays-Bas', location: 'Amsterdam', flag: '🇳🇱', ping: 22, ip: '45.154.255.8', load: 28 },
  { id: 'us-nyc', country: 'États-Unis', location: 'New York', flag: '🇺🇸', ping: 84, ip: '198.51.100.42', load: 60 },
  { id: 'jp-tyo', country: 'Japon', location: 'Tokyo', flag: '🇯🇵', ping: 195, ip: '203.0.113.19', load: 52 },
  { id: 'ch-zrh', country: 'Suisse', location: 'Zurich (Stealth)', flag: '🇨🇭', ping: 26, ip: '185.107.56.2', load: 19 },
];

export default function VpnTab() {
  const [servers, setServers] = useState<VpnServer[]>(DEFAULT_SERVERS);
  const [selectedServer, setSelectedServer] = useState<VpnServer>(DEFAULT_SERVERS[0]);
  const [vpnState, setVpnState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [killSwitch, setKillSwitch] = useState(true);
  const [dnsLeakProtection, setDnsLeakProtection] = useState(true);
  const [stealthProtocol, setStealthProtocol] = useState(true);
  const [search, setSearch] = useState('');

  // VPN events
  useEffect(() => {
    if (!api) return;

    const cleanup = api.on('vpn-event', (event: any) => {
      if (event.type === 'connecting') setVpnState('connecting');
      if (event.type === 'connected') setVpnState('connected');
      if (event.type === 'disconnected') {
        setVpnState('disconnected');
        setUptimeSeconds(0);
      }
    });

    api.vpnFetchServers?.().then((res: any[]) => {
      if (res && res.length > 0) {
        const mapped = res.map((s, idx) => ({
          id: s.id || `srv-${idx}`,
          country: s.country || 'Serveur Astral',
          location: s.location || 'Automatique',
          flag: s.country?.toLowerCase().includes('france') ? '🇫🇷' : s.country?.toLowerCase().includes('japan') ? '🇯🇵' : '🌐',
          ping: s.ping || 35,
          ip: s.ip || '10.8.0.1',
          load: Math.floor(Math.random() * 40) + 20,
        }));
        setServers(mapped);
        setSelectedServer(mapped[0]);
      }
    }).catch(() => {});

    return () => cleanup?.();
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
    if (vpnState === 'connected') {
      setVpnState('disconnected');
      await api?.vpnDisconnect?.();
    } else if (vpnState === 'disconnected') {
      setVpnState('connecting');
      await api?.vpnConnect?.(selectedServer.id);
      setTimeout(() => setVpnState('connected'), 1200);
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
      s.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="tab-pane">
      <div className="tab-header">
        <div>
          <h1 className="tab-title">Tunnel Sécurisé Astral VPN</h1>
          <p className="tab-desc">Chiffrement AES-256 militaire, anti-DDoS gaming et contournement de bridage</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={`status-pill ${vpnState === 'connected' ? 'active' : ''}`}>
            <span className="dot" />
            <span>{vpnState === 'connected' ? 'PROTÉGÉ' : vpnState === 'connecting' ? 'CONNEXION...' : 'DÉCONNECTÉ'}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginTop: 16 }}>
        {/* Left: Main Connection Card */}
        <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', position: 'relative' }}>
          {/* Status Indicator */}
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: vpnState === 'connected'
                ? 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, rgba(7,7,26,0.6) 70%)'
                : vpnState === 'connecting'
                ? 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, rgba(7,7,26,0.6) 70%)'
                : 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(7,7,26,0.6) 70%)',
              border: `2px solid ${
                vpnState === 'connected' ? 'var(--emerald)' : vpnState === 'connecting' ? 'var(--amber)' : 'rgba(255,255,255,0.1)'
              }`,
              boxShadow: vpnState === 'connected' ? '0 0 35px rgba(16,185,129,0.3)' : 'none',
              marginBottom: 20,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onClick={handleToggleConnect}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke={vpnState === 'connected' ? 'var(--emerald)' : vpnState === 'connecting' ? 'var(--amber)' : '#94a3b8'}
              strokeWidth="2"
            >
              <path d="M12 2v10M18.4 6.6a9 9 0 11-12.8 0"/>
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              {vpnState === 'connected' ? 'Actif' : vpnState === 'connecting' ? 'En cours' : 'Activer'}
            </span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            {vpnState === 'connected' ? `Connecté à ${selectedServer.country}` : 'Protection Hors-Ligne'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            {vpnState === 'connected'
              ? `IP Virtuelle : ${selectedServer.ip} • Durée : ${formatTime(uptimeSeconds)}`
              : 'Cliquez sur le bouclier ou le bouton ci-dessous pour sécuriser vos paquets'}
          </p>

          <button
            className={`btn ${vpnState === 'connected' ? 'btn-danger' : 'btn-primary'}`}
            style={{ width: '80%', padding: '12px 24px', fontSize: 14, fontWeight: 600 }}
            onClick={handleToggleConnect}
            disabled={vpnState === 'connecting'}
          >
            {vpnState === 'connected' ? 'Déconnecter le Tunnel' : vpnState === 'connecting' ? 'Établissement du Chiffrement...' : 'Connexion Immédiate'}
          </button>

          {/* Quick Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Latence estimée</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cyan)' }}>{selectedServer.ping} ms</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chiffrement</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#a78bfa' }}>AES-GCM-256</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Charge relais</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--emerald)' }}>{selectedServer.load}%</div>
            </div>
          </div>
        </div>

        {/* Right: Security Switches & Protocol options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 18 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              Boucliers Anti-Fuite & Furtivité
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Kill Switch Automatique</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Coupe tout trafic si la connexion VPN saute</div>
                </div>
                <input
                  type="checkbox"
                  checked={killSwitch}
                  onChange={(e) => setKillSwitch(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Protection Anti-Fuite DNS (Zero-Leak)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Force les requêtes DNS sur le résolveur Astral chiffré</div>
                </div>
                <input
                  type="checkbox"
                  checked={dnsLeakProtection}
                  onChange={(e) => setDnsLeakProtection(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Protocole Astral Stealth (Anti-DPI)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Masque les signatures OpenVPN pour éviter les blocages</div>
                </div>
                <input
                  type="checkbox"
                  checked={stealthProtocol}
                  onChange={(e) => setStealthProtocol(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                />
              </label>
            </div>
          </div>

          {/* Server List */}
          <div className="glass-card" style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Serveurs Optimisés Gaming & Sécurité</h3>
              <input
                type="text"
                placeholder="Filtrer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '4px 10px',
                  fontSize: 12,
                  width: 120,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {filteredServers.map((server) => {
                const isSelected = selectedServer.id === server.id;
                return (
                  <div
                    key={server.id}
                    onClick={() => {
                      if (vpnState === 'disconnected') setSelectedServer(server);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: isSelected ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.02)',
                      border: isSelected ? '1px solid var(--violet)' : '1px solid transparent',
                      cursor: vpnState === 'disconnected' ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{server.flag}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#fff' : '#cbd5e1' }}>
                          {server.country} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({server.location})</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>IP: {server.ip}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: server.ping < 50 ? 'var(--emerald)' : server.ping < 120 ? 'var(--amber)' : '#94a3b8',
                        }}
                      >
                        {server.ping} ms
                      </span>
                      {isSelected && <span style={{ color: 'var(--cyan)', fontSize: 12 }}>●</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
