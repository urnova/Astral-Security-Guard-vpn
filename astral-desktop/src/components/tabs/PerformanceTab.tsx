import { useState, useEffect, useCallback } from 'react';
import { Cpu, HardDrive, Trash2, Zap, RefreshCw, XCircle, Activity, CheckCircle } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface DiskHealth {
  model: string;
  status: string;
  mediaType: string;
  health: 'Bon' | 'Attention' | 'Inconnu';
}

interface ProcessItem {
  pid: number;
  name: string;
  cpu: number;
  memoryMb: number;
}

export default function PerformanceTab({ gamingActive }: { gamingActive: boolean }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [gamingOn, setGamingOn] = useState(gamingActive);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState('');
  const [startup, setStartup] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);
  const [diskHealth, setDiskHealth] = useState<DiskHealth[]>([]);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  const loadMetrics = useCallback(async () => {
    if (!api) return;
    try {
      const m = await api.getMetrics();
      if (m?.success) setMetrics(m.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadMetrics();
    const id = setInterval(loadMetrics, 4000);

    // Initial load for disk health
    api?.getDiskHealth?.().then((res: any) => {
      if (res?.success && Array.isArray(res.disks)) {
        setDiskHealth(res.disks);
      }
    });

    return () => clearInterval(id);
  }, [loadMetrics]);

  useEffect(() => {
    setGamingOn(gamingActive);
  }, [gamingActive]);

  const toggleGamingMode = async () => {
    if (!api) return;
    setErrorInfo(null);
    try {
      if (!gamingOn) {
        await api.gamingModeOn();
        await api.networkGamingOn();
        setGamingOn(true);
        setNotice('🎮 Mode Gaming appliqué (Plan Haute Performance & Priorité processus).');
      } else {
        await api.gamingModeOff();
        await api.networkGamingOff();
        setGamingOn(false);
        setNotice('Mode standard restauré.');
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors du basculement du mode gaming', technical: err.message });
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const runCleanup = async () => {
    if (!api) return;
    setCleaning(true);
    setErrorInfo(null);
    try {
      const [ramRes, diskRes] = await Promise.all([api.cleanRam(), api.diskCleanup()]);
      const freed = diskRes?.freedMB || 0;
      setCleanResult(`Mémoire RAM purgée · ${freed} Mo libérés sur les caches temporaires.`);
      loadMetrics();
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur pendant le nettoyage système', technical: err.message });
    } finally {
      setCleaning(false);
      setTimeout(() => setCleanResult(''), 4500);
    }
  };

  const loadStartup = async () => {
    if (!api) return;
    setLoadingStartup(true);
    setErrorInfo(null);
    try {
      const res = await api.getStartup();
      setStartup(res?.items || []);
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lecture programmes au démarrage', technical: err.message });
    } finally {
      setLoadingStartup(false);
    }
  };

  const handleDisableStartup = async (item: any) => {
    if (!api) return;
    try {
      await api.disableStartup(item.Name, item.Location);
      setStartup((prev) => prev.filter((i) => i.Name !== item.Name));
      setNotice(`✅ Entrée de démarrage "${item.Name}" désactivée.`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de désactiver cette entrée', technical: err.message });
    }
  };

  const ramPct = metrics ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const diskTotal = metrics ? metrics.diskUsedGB + metrics.diskFreeGB : 0;
  const diskPct = diskTotal ? Math.round((metrics.diskUsedGB / diskTotal) * 100) : 0;

  return (
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Cpu className="w-6 h-6 text-purple-400" />
            Performance & Maintenance Système
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gestionnaire de démarrage · Purge RAM & Disque · Santé SMART matérielle
          </p>
        </div>

        {gamingOn && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            HAUTE PERFORMANCE ACTIVE
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-medium">
          {notice}
        </div>
      )}

      {cleanResult && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{cleanResult}</span>
        </div>
      )}

      {errorInfo && (
        <CollapsibleError
          message={errorInfo.message}
          technicalError={errorInfo.technical}
        />
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5">
          <span className="text-xs text-zinc-400 font-medium">Charge Processeur (CPU)</span>
          <p className="text-2xl font-black text-cyan-400 mt-1">
            {metrics?.cpuPercent ?? 0}%
          </p>
          <div className="w-full h-1.5 rounded-full bg-white/5 mt-3 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${Math.min(100, metrics?.cpuPercent ?? 0)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5">
          <span className="text-xs text-zinc-400 font-medium">Mémoire Vive (RAM)</span>
          <p className="text-2xl font-black text-purple-400 mt-1">
            {ramPct}%
          </p>
          <div className="w-full h-1.5 rounded-full bg-white/5 mt-3 overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${Math.min(100, ramPct)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5">
          <span className="text-xs text-zinc-400 font-medium">Espace Disque (C:)</span>
          <p className="text-2xl font-black text-amber-400 mt-1">
            {diskPct}%
          </p>
          <p className="text-[10px] text-zinc-500 mt-2 font-mono">
            {metrics?.diskFreeGB ?? 0} Go libres
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5">
          <span className="text-xs text-zinc-400 font-medium">Temps d'activité (Uptime)</span>
          <p className="text-2xl font-black text-emerald-400 mt-1">
            {metrics?.uptimeHours ?? 0}h
          </p>
          <p className="text-[10px] text-zinc-500 mt-2">Depuis le dernier démarrage</p>
        </div>
      </div>

      {/* Action Row: Cleaner & High Perf Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cleaner */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-purple-400" />
              Nettoyeur de Résidus & Mémoire
            </h3>
            <button
              onClick={runCleanup}
              disabled={cleaning}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              {cleaning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>{cleaning ? 'Nettoyage en cours...' : 'Nettoyer maintenant'}</span>
            </button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Exécute le ramasse-miettes système (.NET GC), purge les fichiers temporaires de <code className="text-purple-300">%TEMP%</code> et vide la corbeille en toute sécurité.
          </p>
        </div>

        {/* High Perf Toggle */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Plan d'Alimentation Haute Performance
            </h3>
            <button
              onClick={toggleGamingMode}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                gamingOn ? 'bg-cyan-500 text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/15'
              }`}
            >
              {gamingOn ? 'Actif' : 'Standard'}
            </button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Active le plan d'alimentation Windows Performance Maximale (GUID 8c5e7fda), éliminant le bridage des cœurs CPU et maintenant les fréquences Turbo au maximum.
          </p>
        </div>
      </div>

      {/* Disk Health SMART & Startup Apps Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Startup Programs */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Applications au Démarrage ({startup.length})
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">Registre Windows (Run & RunOnce)</p>
            </div>

            <button
              onClick={loadStartup}
              disabled={loadingStartup}
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium"
            >
              <RefreshCw className={`w-3 h-3 ${loadingStartup ? 'animate-spin' : ''}`} />
              <span>{startup.length === 0 ? 'Charger la liste' : 'Actualiser'}</span>
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {startup.length === 0 && !loadingStartup ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                Cliquez sur « Charger la liste » pour analyser les logiciels lancés au boot.
              </p>
            ) : (
              startup.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-zinc-200 truncate">{item.Name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                      {item.Command}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDisableStartup(item)}
                    className="p-1 rounded-md text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                    title="Désactiver ce programme au démarrage"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Disk SMART Health */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              État de Santé des Disques (SMART)
            </h3>
            <span className="text-xs text-zinc-500">{diskHealth.length} disque(s)</span>
          </div>

          <div className="space-y-2.5">
            {diskHealth.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3">Inspection matérielle en cours...</p>
            ) : (
              diskHealth.map((d, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-zinc-200">{d.model || `Disque physique #${idx}`}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Type : {d.mediaType || 'Disque NVMe / SSD'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    <span className="font-bold text-emerald-400 text-xs">
                      {d.status === 'OK' || d.health === 'Bon' ? 'Sain (OK)' : d.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
