import { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Globe, Lock, Power, RefreshCw, AlertCircle, Wifi } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

export interface VpnServer {
  id: string;
  country: string;
  location: string;
  flag: string;
  ping: number;
  ip: string;
  speedMbps: number;
  uptimeHours: number;
  sessions: number;
}

export default function VpnTab() {
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<VpnServer | null>(null);
  const [vpnState, setVpnState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [killSwitch, setKillSwitch] = useState(false);
  const [loadingServers, setLoadingServers] = useState(false);
  const [search, setSearch] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

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
      setFallbackMessage('Aucun serveur VPN disponible actuellement, réessayez plus tard.');
      setErrorInfo({ message: 'Erreur lors de la récupération des serveurs VPN.', technical: err.message });
    } finally {
      setLoadingServers(false);
    }
  };

  useEffect(() => {
    if (!api) return;

    fetchServers();

    // Query Kill Switch initial state
    api.vpnGetKillSwitch?.().then((res: any) => {
      if (res && typeof res.enabled === 'boolean') {
        setKillSwitch(res.enabled);
      }
    });

    // Listen to VPN events from main process
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
          message: 'Erreur de connexion OpenVPN.',
          technical: event.error,
        });
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
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
    if (!selectedServer && vpnState === 'disconnected') return;
    setErrorInfo(null);

    if (vpnState === 'connected') {
      setVpnState('disconnected');
      await api?.vpnDisconnect?.();
    } else if (vpnState === 'disconnected') {
      setVpnState('connecting');
      try {
        const res = await api?.vpnConnect?.(selectedServer!.id);
        if (!res?.success) {
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
          message: 'Impossible de modifier le Kill Switch pare-feu.',
          technical: res?.error,
        });
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
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Lock className="w-6 h-6 text-purple-400" />
            Tunnel Chiffré Astral VPN
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Chiffrement OpenVPN AES-256 · Kill Switch pare-feu natif Windows · Relais dynamiques mondiaux
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            vpnState === 'connected'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : vpnState === 'connecting'
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
              : 'bg-zinc-800/80 border-white/10 text-zinc-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              vpnState === 'connected'
                ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                : vpnState === 'connecting'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-zinc-500'
            }`} />
            <span>
              {vpnState === 'connected' ? 'PROTÉGÉ' : vpnState === 'connecting' ? 'CONNEXION...' : 'DÉCONNECTÉ'}
            </span>
          </div>

          <button
            onClick={fetchServers}
            disabled={loadingServers}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            title="Actualiser la liste des serveurs"
          >
            <RefreshCw className={`w-4 h-4 ${loadingServers ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {errorInfo && (
        <CollapsibleError
          message={errorInfo.message}
          technicalError={errorInfo.technical}
        />
      )}

      {/* Fallback Warning if servers unavailable */}
      {fallbackMessage && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center gap-3 text-amber-200 text-xs font-medium">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span>{fallbackMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Main Connection Card (5 cols) */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/20 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
          {/* Subtle Ambient Ring */}
          <div className="absolute inset-0 bg-radial-gradient pointer-events-none opacity-20" />

          {/* Connect Button Ring */}
          <button
            onClick={handleToggleConnect}
            disabled={vpnState === 'connecting' || (!selectedServer && vpnState === 'disconnected')}
            className={`w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-300 relative group cursor-pointer mb-6 ${
              vpnState === 'connected'
                ? 'bg-emerald-950/40 border-2 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.35)]'
                : vpnState === 'connecting'
                ? 'bg-amber-950/40 border-2 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.25)]'
                : 'bg-purple-950/30 border-2 border-purple-500/40 hover:border-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.15)]'
            }`}
          >
            <Power className={`w-10 h-10 transition-transform group-hover:scale-110 ${
              vpnState === 'connected'
                ? 'text-emerald-400'
                : vpnState === 'connecting'
                ? 'text-amber-400 animate-pulse'
                : 'text-purple-400'
            }`} />
            <span className="text-[10px] font-bold tracking-wider uppercase mt-2 text-zinc-300">
              {vpnState === 'connected' ? 'DÉCONNECTER' : vpnState === 'connecting' ? 'EN COURS...' : 'CONNECTER'}
            </span>
          </button>

          <h3 className="text-lg font-bold text-white mb-1">
            {vpnState === 'connected' && selectedServer
              ? `${selectedServer.flag} Connecté à ${selectedServer.country}`
              : selectedServer
              ? `Prêt : ${selectedServer.country} (${selectedServer.location})`
              : 'Aucun serveur sélectionné'}
          </h3>

          <p className="text-xs text-zinc-400 mb-6 font-mono">
            {vpnState === 'connected' && selectedServer
              ? `IP: ${selectedServer.ip} · Durée : ${formatTime(uptimeSeconds)}`
              : selectedServer
              ? `IP Relais : ${selectedServer.ip} · Latence : ${selectedServer.ping} ms`
              : 'Sélectionnez un relais dans la liste'}
          </p>

          <div className="w-full pt-4 border-t border-white/5 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-zinc-500 block">Ping Relais</span>
              <span className="font-semibold text-cyan-400 font-mono">
                {selectedServer ? `${selectedServer.ping} ms` : '–'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Chiffrement</span>
              <span className="font-semibold text-purple-400 font-mono">AES-256</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Débit Relais</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {selectedServer && selectedServer.speedMbps ? `${selectedServer.speedMbps} Mb` : 'Direct'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Kill Switch & Server Selector (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Windows Firewall Kill Switch Banner */}
          <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <ShieldAlert className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Kill Switch Pare-Feu Windows (Anti-Leak)
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Bloque le trafic sortant non chiffré via les règles de pare-feu si le tunnel tombe
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggleKillSwitch(!killSwitch)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                killSwitch
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-zinc-400 hover:bg-white/15'
              }`}
            >
              {killSwitch ? 'Actif' : 'Inactif'}
            </button>
          </div>

          {/* Server List */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Globe className="w-4 h-4 text-purple-400" />
                Relais VPN Disponibles ({filteredServers.length})
              </h3>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer par pays..."
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500 w-36 sm:w-48"
              />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {loadingServers && servers.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Chargement des serveurs dynamiques...</span>
                </div>
              ) : filteredServers.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  {fallbackMessage || 'Aucun serveur ne correspond à votre recherche.'}
                </div>
              ) : (
                filteredServers.map((srv) => {
                  const isSelected = selectedServer?.id === srv.id;
                  return (
                    <div
                      key={srv.id}
                      onClick={() => {
                        if (vpnState === 'disconnected') setSelectedServer(srv);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl leading-none">{srv.flag}</span>
                        <div>
                          <p className="font-semibold text-zinc-200">
                            {srv.country} <span className="font-normal text-zinc-400">({srv.location})</span>
                          </p>
                          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                            IP: {srv.ip} {srv.speedMbps > 0 ? `· ${srv.speedMbps} Mbps` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-xs font-semibold ${
                          srv.ping < 40 ? 'text-emerald-400' : srv.ping < 100 ? 'text-cyan-400' : 'text-amber-400'
                        }`}>
                          {srv.ping} ms
                        </span>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-purple-400" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
