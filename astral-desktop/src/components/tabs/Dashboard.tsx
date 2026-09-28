import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Zap, Activity, HardDrive, Clock, CheckCircle, RefreshCw, Radio, Gamepad2, Sliders } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface Metrics {
  cpuPercent: number;
  ramTotal: number;
  ramUsed: number;
  diskUsedGB: number;
  diskFreeGB: number;
  uptimeHours: number;
}

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onTabChange: (tab: string) => void;
}

export default function Dashboard({ gamingActive, currentGame, onTabChange }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [secStatus, setSecStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosResult, setSosResult] = useState<{ pingBefore?: number; pingAfter?: number; message?: string } | null>(null);
  const [currentMode, setCurrentMode] = useState<string>('gaming');
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!api) {
      setLoading(false);
      return;
    }
    try {
      const [m, s, modeRes] = await Promise.all([
        api.getMetrics?.(),
        api.getSecurityStatus?.(),
        api.getSystemMode?.(),
      ]);
      if (m?.success) setMetrics(m.data);
      if (s?.success) setSecStatus(s.data);
      if (modeRes) setCurrentMode(modeRes);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 5000);
    return () => clearInterval(id);
  }, [loadData]);

  const handleSosPing = async () => {
    if (!api) return;
    setSosLoading(true);
    setSosResult(null);
    setErrorInfo(null);
    try {
      const res = await api.emergencyPingReset();
      if (res?.success) {
        setSosResult({
          pingBefore: res.pingBefore,
          pingAfter: res.pingAfter,
          message: res.message,
        });
      } else {
        setErrorInfo({
          message: 'Échec de la procédure SOS Déblocage Réseau.',
          technical: res?.technicalError || res?.error,
        });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur inattendue lors du SOS Ping', technical: err.message });
    } finally {
      setSosLoading(false);
    }
  };

  const handleModeChange = async (mode: 'gaming' | 'office' | 'shield' | 'eco') => {
    if (!api) return;
    try {
      await api.setSystemMode(mode);
      setCurrentMode(mode);
    } catch {}
  };

  const ramPct = metrics && metrics.ramTotal > 0 ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const diskTotal = metrics ? metrics.diskUsedGB + metrics.diskFreeGB : 0;
  const diskPct = diskTotal > 0 ? Math.round((metrics!.diskUsedGB / diskTotal) * 100) : 0;
  const defenderOk = Boolean(secStatus?.AntivirusEnabled && secStatus?.RealTimeProtectionEnabled);

  return (
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            {gamingActive ? (
              <>
                <Gamepad2 className="w-6 h-6 text-cyan-400" />
                <span>Mode Gaming · {currentGame || 'Jeu détecté'}</span>
              </>
            ) : (
              <>
                <Zap className="w-6 h-6 text-purple-400" />
                <span>Tableau de Bord & Vue d'Ensemble</span>
              </>
            )}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {gamingActive
              ? 'Toutes les optimisations faible latence et priorité matérielle sont actives'
              : 'Votre système Windows 10/11 sous la surveillance proactive d’Astral Vanguard'}
          </p>
        </div>

        {gamingActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            GAMING ACTIF
          </div>
        )}
      </div>

      {errorInfo && (
        <CollapsibleError
          message={errorInfo.message}
          technicalError={errorInfo.technical}
        />
      )}

      {/* SOS Result Banner */}
      {sosResult && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-1.5 text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle className="w-4 h-4" />
            <span>SOS Réseau terminé : {sosResult.message}</span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] pt-1 text-zinc-300">
            <span>Latence avant : <strong className="text-red-400">{sosResult.pingBefore} ms</strong></span>
            <span>Latence après : <strong className="text-emerald-400">{sosResult.pingAfter} ms</strong></span>
          </div>
        </div>
      )}

      {/* Defender Status Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
        defenderOk
          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
          : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center gap-3">
          {defenderOk ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <span className="font-semibold">
            {defenderOk
              ? 'Protection Active · Microsoft Defender opérationnel · Surveillance HIDS en veille'
              : 'Attention · Moteur de protection à auditer · Cliquez sur Sécurité pour inspecter'}
          </span>
        </div>
        <button
          onClick={() => onTabChange('security')}
          className="text-xs underline hover:no-underline font-medium shrink-0"
        >
          Détails sécurité
        </button>
      </div>

      {/* System Metrics 4-Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5">
          <span className="text-xs text-zinc-400 font-medium">Charge Processeur (CPU)</span>
          <p className="text-2xl font-black text-cyan-400 mt-1">
            {loading ? '–' : `${metrics?.cpuPercent ?? 0}%`}
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
            {loading ? '–' : `${ramPct}%`}
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
            {loading ? '–' : `${diskPct}%`}
          </p>
          <p className="text-[10px] text-zinc-500 mt-2 font-mono">
            {metrics?.diskFreeGB ?? 0} Go libres
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-white/5">
          <span className="text-xs text-zinc-400 font-medium">Temps d'activité</span>
          <p className="text-2xl font-black text-emerald-400 mt-1">
            {loading ? '–' : `${metrics?.uptimeHours ?? 0}h`}
          </p>
          <p className="text-[10px] text-zinc-500 mt-2">Dernier redémarrage</p>
        </div>
      </div>

      {/* Quick Actions & Emergency Tools */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Actions Rapides & Procédures d'Urgence
        </h3>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Real SOS Button */}
          <button
            onClick={handleSosPing}
            disabled={sosLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-amber-900/20"
            title="Purge DNS/ARP, réinitialise sockets TCP et stoppe le P2P Windows Update"
          >
            {sosLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Déblocage en cours...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>⚡ SOS Déblocage Ping (1002ms)</span>
              </>
            )}
          </button>

          <button
            onClick={() => onTabChange('security')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-purple-900/20"
          >
            <Shield className="w-4 h-4" />
            <span>Audit Antivirus & Menaces</span>
          </button>

          <button
            onClick={() => onTabChange('network')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-cyan-900/20"
          >
            <Activity className="w-4 h-4" />
            <span>Test Débit & Gigue</span>
          </button>

          <button
            onClick={() => api?.overlayToggle?.()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold transition-colors border border-white/5"
          >
            <Radio className="w-4 h-4 text-purple-400" />
            <span>Overlay HUD (Ctrl+Shift+O)</span>
          </button>

          <button
            onClick={() => onTabChange('settings')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold transition-colors border border-white/5"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Docteur Clavier</span>
          </button>
        </div>
      </div>

      {/* System Modes Switcher Bar */}
      <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Mode Système Actif
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { id: 'gaming', label: 'Mode Gaming', sub: 'Faible latence & Turbo', color: 'cyan', icon: '🎮' },
            { id: 'office', label: 'Mode Bureau', sub: 'Équilibré & Multitâche', color: 'purple', icon: '💼' },
            { id: 'shield', label: 'Cyber-Shield', sub: 'Défense Defender max', color: 'emerald', icon: '🛡️' },
            { id: 'eco', label: 'Mode Éco', sub: 'Silencieux & Basse conso', color: 'amber', icon: '🍃' },
          ].map((m) => {
            const isSelected = currentMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id as any)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-purple-950/40 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                    : 'bg-black/30 border-white/5 hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{m.icon}</span>
                  <span className="text-xs font-bold text-white">{m.label}</span>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">{m.sub}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
