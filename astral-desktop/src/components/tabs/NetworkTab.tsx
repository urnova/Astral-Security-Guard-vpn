import { useState, useEffect } from 'react';
import { Wifi, Globe, Activity, Cpu, CheckCircle, RefreshCw, Radio, Zap } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface SpeedResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
}

interface WifiDiag {
  ssid: string;
  signalPercent: number;
  channel: number;
  radioType: string;
  recommendation?: string;
  isInterfering?: boolean;
}

interface DnsBenchmarkItem {
  provider: string;
  ip: string;
  latencyMs: number;
  status: 'fastest' | 'good' | 'slow';
}

interface Props {
  gamingActive: boolean;
}

export default function NetworkTab({ gamingActive: _gamingActive }: Props) {
  const [testing, setTesting] = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [netProcs, setNetProcs] = useState<any[]>([]);
  const [dns, setDns] = useState<'cloudflare' | 'google' | 'auto'>('auto');
  const [gamingNet, setGamingNet] = useState(false);
  const [wifiDiag, setWifiDiag] = useState<WifiDiag | null>(null);
  const [loadingWifi, setLoadingWifi] = useState(false);
  const [dnsBenchmark, setDnsBenchmark] = useState<DnsBenchmarkItem[]>([]);
  const [benchmarkingDns, setBenchmarkingDns] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getAdapters?.().then((r: any) => setAdapters(r?.adapters || []));
  }, []);

  const runSpeedtest = async () => {
    if (!api) return;
    setTesting(true);
    setSpeedResult(null);
    setErrorInfo(null);
    try {
      const res = await api.speedtest();
      if (res?.success && res.result) {
        setSpeedResult(res.result);
      } else {
        setErrorInfo({
          message: 'Échec du test de débit réseau.',
          technical: res?.error,
        });
      }
    } catch (err: any) {
      setErrorInfo({
        message: 'Erreur inattendue pendant le test de vitesse.',
        technical: err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const runWifiDiagnostic = async () => {
    if (!api) return;
    setLoadingWifi(true);
    setErrorInfo(null);
    try {
      const res = await api.wifiInterference();
      if (res?.success && res.data) {
        setWifiDiag(res.data);
      } else {
        setWifiDiag(null);
        setNotice('ℹ️ Aucun adaptateur Wi-Fi actif ou interface filaire (Ethernet) détectée.');
        setTimeout(() => setNotice(''), 4000);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur diagnostic Wi-Fi', technical: err.message });
    } finally {
      setLoadingWifi(false);
    }
  };

  const runDnsBenchmark = async () => {
    if (!api) return;
    setBenchmarkingDns(true);
    setErrorInfo(null);
    try {
      const res = await api.dnsBenchmark();
      if (res?.success && res.results) {
        setDnsBenchmark(res.results);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur benchmark DNS', technical: err.message });
    } finally {
      setBenchmarkingDns(false);
    }
  };

  const applyDns = async () => {
    if (!api) return;
    setErrorInfo(null);
    const res = await api.setDns(dns);
    if (res?.success) {
      setNotice(`✅ DNS configuré sur ${dns === 'auto' ? 'Automatique (DHCP)' : dns.toUpperCase()}`);
    } else {
      setErrorInfo({
        message: 'Impossible de modifier la configuration DNS.',
        technical: res?.error,
      });
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const toggleGamingNet = async () => {
    if (!api) return;
    setErrorInfo(null);
    if (!gamingNet) {
      const res = await api.networkGamingOn();
      if (res?.success) {
        setGamingNet(true);
        setNotice('⚡ Optimisations TCP/IP Gaming activées (AckFrequency & Nagle désactivé)');
      } else {
        setErrorInfo({ message: 'Droits administrateur requis pour optimiser TCP/IP.', technical: res?.error });
      }
    } else {
      await api.networkGamingOff();
      setGamingNet(false);
      setNotice('Paramètres réseau réinitialisés.');
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const loadProcesses = async () => {
    if (!api) return;
    const res = await api.getNetworkProcesses();
    setNetProcs(res?.processes || []);
  };

  const getSpeedColor = (mbps: number) => {
    if (mbps >= 100) return 'text-emerald-400';
    if (mbps >= 30) return 'text-cyan-400';
    if (mbps >= 10) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-cyan-400" />
            Réseau, Latence & Wi-Fi
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Test de débit Cloudflare CDN · Diagnostic interférences Wi-Fi · Benchmark DNS · Anti-Nagle
          </p>
        </div>

        {gamingNet && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            TCP NO-DELAY ACTIF
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-medium">
          {notice}
        </div>
      )}

      {errorInfo && (
        <CollapsibleError
          message={errorInfo.message}
          technicalError={errorInfo.technical}
        />
      )}

      {/* Speed Test Card */}
      <div className="p-6 rounded-2xl bg-[#0c0c24]/90 border border-cyan-500/20 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              Test de débit & Gigue (Cloudflare Edge Multi-Chunk)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Mesure directe haute précision sans proxy tiers ni clé API
            </p>
          </div>

          <button
            onClick={runSpeedtest}
            disabled={testing}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition-all ${
              testing
                ? 'bg-cyan-950/60 text-cyan-300 cursor-not-allowed border border-cyan-500/30'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
            }`}
          >
            {testing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                <span>Test en cours...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Lancer le test de débit</span>
              </>
            )}
          </button>
        </div>

        {speedResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-black/40 border border-white/5">
              <span className="text-xs text-zinc-400 font-medium">Téléchargement</span>
              <p className={`text-2xl font-black mt-1 ${getSpeedColor(speedResult.downloadMbps)}`}>
                {speedResult.downloadMbps}
                <span className="text-xs text-zinc-400 font-normal ml-1">Mbps</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5">
              <span className="text-xs text-zinc-400 font-medium">Upload</span>
              <p className={`text-2xl font-black mt-1 ${getSpeedColor(speedResult.uploadMbps)}`}>
                {speedResult.uploadMbps}
                <span className="text-xs text-zinc-400 font-normal ml-1">Mbps</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5">
              <span className="text-xs text-zinc-400 font-medium">Latence (Ping)</span>
              <p className={`text-2xl font-black mt-1 ${speedResult.pingMs < 25 ? 'text-emerald-400' : speedResult.pingMs < 60 ? 'text-cyan-400' : 'text-amber-400'}`}>
                {speedResult.pingMs}
                <span className="text-xs text-zinc-400 font-normal ml-1">ms</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5">
              <span className="text-xs text-zinc-400 font-medium">Gigue (Jitter)</span>
              <p className={`text-2xl font-black mt-1 ${speedResult.jitterMs < 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {speedResult.jitterMs}
                <span className="text-xs text-zinc-400 font-normal ml-1">ms</span>
              </p>
            </div>
          </div>
        )}

        {testing && !speedResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 border border-white/5" />
            ))}
          </div>
        )}
      </div>

      {/* Grid 2 Columns: Gaming Net & Wi-Fi / DNS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TCP Gaming Mode */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Optimisation TCP / Nagle Gaming
            </h3>
            <button
              onClick={toggleGamingNet}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                gamingNet ? 'bg-cyan-500 text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/15'
              }`}
            >
              {gamingNet ? 'Activé' : 'Désactivé'}
            </button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Désactive le buffer Nagle et force <code className="text-cyan-300">TcpAckFrequency=1</code> sur toutes les interfaces réseau actives pour réduire le temps de réponse des paquets de jeu.
          </p>
        </div>

        {/* DNS Optimizer & Benchmark */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              Sélection & Benchmark DNS
            </h3>
            <button
              onClick={runDnsBenchmark}
              disabled={benchmarkingDns}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${benchmarkingDns ? 'animate-spin' : ''}`} />
              <span>Comparer les pings</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { val: 'cloudflare' as const, label: 'Cloudflare', ip: '1.1.1.1' },
              { val: 'google' as const, label: 'Google', ip: '8.8.8.8' },
              { val: 'auto' as const, label: 'Auto (DHCP)', ip: 'Défaut' },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => setDns(item.val)}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  dns === item.val
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                    : 'bg-black/30 border-white/5 text-zinc-400 hover:bg-white/5'
                }`}
              >
                <p className="text-xs font-semibold">{item.label}</p>
                <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{item.ip}</p>
              </button>
            ))}
          </div>

          <button
            onClick={applyDns}
            className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
          >
            Appliquer le serveur DNS sélectionné
          </button>

          {dnsBenchmark.length > 0 && (
            <div className="pt-2 border-t border-white/5 space-y-1.5">
              <p className="text-[11px] font-semibold text-zinc-400">Résultats du Benchmark :</p>
              {dnsBenchmark.map((bench) => (
                <div key={bench.provider} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/[0.02]">
                  <span className="text-zinc-300 font-medium">{bench.provider} ({bench.ip})</span>
                  <span className={`font-mono text-xs ${bench.latencyMs < 25 ? 'text-emerald-400 font-bold' : 'text-zinc-400'}`}>
                    {bench.latencyMs} ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Wi-Fi Channel Diagnostics */}
      <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-cyan-400" />
            Diagnostic Interférences Canaux Wi-Fi
          </h3>
          <button
            onClick={runWifiDiagnostic}
            disabled={loadingWifi}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingWifi ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Analyser le signal</span>
          </button>
        </div>

        {wifiDiag ? (
          <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/20 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-zinc-500">Réseau (SSID)</span>
              <p className="font-semibold text-zinc-200 mt-0.5">{wifiDiag.ssid || 'Inconnu'}</p>
            </div>
            <div>
              <span className="text-zinc-500">Qualité du signal</span>
              <p className="font-semibold text-emerald-400 mt-0.5">{wifiDiag.signalPercent}%</p>
            </div>
            <div>
              <span className="text-zinc-500">Canal Wi-Fi</span>
              <p className="font-semibold text-cyan-400 mt-0.5">{wifiDiag.channel}</p>
            </div>
            <div>
              <span className="text-zinc-500">Recommandation</span>
              <p className="font-semibold text-zinc-300 mt-0.5">{wifiDiag.recommendation || 'Canal optimal'}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Cliquez sur « Analyser le signal » pour inspecter le canal et détecter d'éventuelles interférences avec les réseaux voisins.
          </p>
        )}
      </div>

      {/* Network Processes */}
      <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Connexions TCP Actives & Processus Réseau
          </h3>
          <button
            onClick={loadProcesses}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
          >
            Actualiser les connexions
          </button>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {netProcs.length === 0 ? (
            <p className="text-xs text-zinc-500 py-3">Cliquez sur « Actualiser les connexions » pour lister les processus connectés.</p>
          ) : (
            netProcs.slice(0, 12).map((proc, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-200">{proc.name || `PID ${proc.pid}`}</span>
                  <span className="text-[10px] text-zinc-500">PID {proc.pid}</span>
                </div>
                <span className="font-mono text-[11px] text-zinc-400">{proc.remote}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
