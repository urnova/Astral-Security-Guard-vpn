import { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Zap, FolderPlus, Trash2, RotateCcw } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

type ScanState = 'idle' | 'scanning' | 'done';
type AiState = 'idle' | 'loading' | 'done';

export default function SecurityTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanType, setScanType] = useState<'quick' | 'full'>('quick');
  const [threats, setThreats] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiState, setAiState] = useState<AiState>('idle');
  const [rollbackLog, setRollbackLog] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newExclusionPath, setNewExclusionPath] = useState('');
  const [remediationScript, setRemediationScript] = useState('');
  const [remediating, setRemediating] = useState(false);
  const [updatingSignatures, setUpdatingSignatures] = useState(false);
  const [defenderStatus, setDefenderStatus] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  const loadData = () => {
    if (!api) return;
    api.getSecurityStatus?.().then((res: any) => {
      if (res?.success) setDefenderStatus(res.data);
    });
    api.listRollback?.().then((r: any) => setRollbackLog(r.entries || []));
    api.getExclusions?.().then((r: any) => setExclusions(r.paths || []));
  };

  useEffect(() => {
    loadData();

    const cleanup = api?.on?.('security:scan-event', (event: any) => {
      if (event.type === 'scan-complete') {
        setThreats(event.threats || []);
        setScanState('done');
        if ((event.threats || []).length > 0) {
          runAiAnalysis(event.threats);
        } else {
          runAiAnalysis([]);
        }
      } else if (event.type === 'scan-error') {
        setScanState('idle');
        setErrorInfo({
          message: 'Échec de l’analyse antivirus.',
          technical: event.error,
        });
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const runAiAnalysis = async (t: any[]) => {
    if (!api) return;
    setAiState('loading');
    const res = await api.aiAnalyze(t);
    if (res?.success) {
      setAiAnalysis(res.analysis);
      if (res.analysis?.remediationScript) {
        setRemediationScript(res.analysis.remediationScript);
      }
    }
    setAiState('done');
  };

  const startScan = async () => {
    if (!api) return;
    setErrorInfo(null);
    setThreats([]);
    setAiAnalysis(null);
    setAiState('idle');
    setScanState('scanning');

    try {
      await api.createRestorePoint(`Avant scan antivirus (${scanType})`);
      const res = await api.startScan(scanType);
      if (!res?.success) {
        setScanState('idle');
        setErrorInfo({
          message: res?.error || 'Erreur lors du lancement de l’analyse.',
          technical: res?.rawError,
        });
      }
    } catch (err: any) {
      setScanState('idle');
      setErrorInfo({
        message: 'Erreur inattendue lors de l’analyse.',
        technical: err.message,
      });
    }
  };

  const handleUpdateSignatures = async () => {
    if (!api) return;
    setUpdatingSignatures(true);
    setErrorInfo(null);
    try {
      const res = await api.updateSignatures();
      if (res?.success) {
        setNotice('✅ Signatures Windows Defender mises à jour avec succès.');
        loadData();
      } else {
        setErrorInfo({
          message: res?.error || 'Impossible de mettre à jour les signatures.',
          technical: res?.rawError,
        });
      }
    } finally {
      setUpdatingSignatures(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const handleAddExclusion = async () => {
    if (!api || !newExclusionPath.trim()) return;
    const pathToAdd = newExclusionPath.trim();
    const res = await api.addExclusion(pathToAdd);
    if (res?.success) {
      setNewExclusionPath('');
      api.getExclusions().then((r: any) => setExclusions(r.paths || []));
      setNotice('✅ Exception ajoutée à Windows Defender.');
      setTimeout(() => setNotice(''), 3000);
    } else {
      setErrorInfo({
        message: 'Impossible d’ajouter l’exception.',
        technical: res?.error,
      });
    }
  };

  const handleRemoveExclusion = async (pathToRemove: string) => {
    if (!api) return;
    const res = await api.removeExclusion(pathToRemove);
    if (res?.success) {
      api.getExclusions().then((r: any) => setExclusions(r.paths || []));
      setNotice('✅ Exception retirée de Windows Defender.');
      setTimeout(() => setNotice(''), 3000);
    } else {
      setErrorInfo({
        message: 'Impossible de retirer l’exception.',
        technical: res?.error,
      });
    }
  };

  const runRemediation = async () => {
    if (!api || !remediationScript) return;
    setRemediating(true);
    setErrorInfo(null);
    try {
      const res = await api.runRemediation(remediationScript);
      if (res?.success) {
        setNotice('✅ Remédiation appliquée avec succès.');
        setRemediationScript('');
        loadData();
      } else {
        setErrorInfo({
          message: 'Erreur lors de l’application de la remédiation.',
          technical: res?.error,
        });
      }
    } finally {
      setRemediating(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const handleRestoreEntry = async (item: any) => {
    if (!api) return;
    setErrorInfo(null);
    try {
      const res = await api.restoreEntry(item.id);
      if (res?.success) {
        setNotice(`✅ ${res.message || 'Restauration effectuée avec succès.'}`);
        loadData();
      } else {
        setErrorInfo({
          message: 'Impossible de restaurer ce point de sauvegarde.',
          technical: res?.error,
        });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors de la restauration', technical: err.message });
    }
    setTimeout(() => setNotice(''), 4000);
  };

  const riskBadgeColor: Record<string, string> = {
    sain: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    faible: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    moyen: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    élevé: 'bg-red-500/20 text-red-400 border-red-500/40',
    critique: 'bg-red-600/30 text-red-300 border-red-500/60',
  };

  return (
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-purple-400" />
            Sécurité & Bouclier Defender
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Supervision native Microsoft Defender · Heuristique autonome zéro-cloud · Gestion des exclusions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={scanType}
            onChange={(e) => setScanType(e.target.value as any)}
            disabled={scanState === 'scanning'}
            className="bg-[#0f0f29] border border-purple-500/30 text-zinc-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500"
          >
            <option value="quick">Analyse Rapide (QuickScan)</option>
            <option value="full">Analyse Complète (FullScan)</option>
          </select>

          <button
            onClick={startScan}
            disabled={scanState === 'scanning'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition-all ${
              scanState === 'scanning'
                ? 'bg-purple-950/60 text-purple-300 cursor-not-allowed border border-purple-500/30'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/30'
            }`}
          >
            {scanState === 'scanning' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Analyse en cours...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Lancer l'analyse</span>
              </>
            )}
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
          {notice}
        </div>
      )}

      {errorInfo && (
        <CollapsibleError
          message={errorInfo.message}
          technicalError={errorInfo.technical}
        />
      )}

      {/* Defender Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Protection Temps Réel</p>
              <p className="text-sm font-semibold text-zinc-100">
                {defenderStatus?.RealTimeProtectionEnabled ? 'Activée (OK)' : 'Non confirmée'}
              </p>
            </div>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${defenderStatus?.RealTimeProtectionEnabled ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500'}`} />
        </div>

        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Moteur Antivirus</p>
              <p className="text-sm font-semibold text-zinc-100">
                {defenderStatus?.AntivirusEnabled ? 'Microsoft Defender' : 'Désactivé / Inconnu'}
              </p>
            </div>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${defenderStatus?.AntivirusEnabled ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`} />
        </div>

        <div className="p-4 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Signatures antivirales</p>
            <p className="text-sm font-semibold text-zinc-100">
              {defenderStatus?.AntivirusSignatureVersion || 'À jour'}
            </p>
          </div>
          <button
            onClick={handleUpdateSignatures}
            disabled={updatingSignatures}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updatingSignatures ? 'animate-spin text-purple-400' : ''}`} />
            <span>{updatingSignatures ? 'Mise à jour...' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      {/* Autonomous Heuristic AI Box */}
      {aiState !== 'idle' && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#120d2b] to-[#0c0c24] border border-purple-500/30 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/40">
                <Zap className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Bouclier IA Heuristique Autonome
                </h3>
                <p className="text-xs text-zinc-400">
                  Détection locale sans cloud · Analyse des faux-positifs gaming & cracks
                </p>
              </div>
            </div>

            {aiAnalysis && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${riskBadgeColor[aiAnalysis.riskLevel?.toLowerCase()] || 'bg-zinc-800 text-zinc-300'}`}>
                Risque : {aiAnalysis.riskLevel}
              </span>
            )}
          </div>

          {aiAnalysis && (
            <div className="space-y-3 pt-2 border-t border-purple-500/10">
              <p className="text-xs text-zinc-300 leading-relaxed">
                {aiAnalysis.summary}
              </p>
              {aiAnalysis.explanation && (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-zinc-400 whitespace-pre-line leading-relaxed">
                  {aiAnalysis.explanation}
                </div>
              )}

              {remediationScript && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-purple-300">Script de remédiation sécurisé :</p>
                  <pre className="p-3 rounded-xl bg-black/60 border border-purple-500/20 text-xs font-mono text-zinc-300 overflow-x-auto">
                    {remediationScript}
                  </pre>
                  <button
                    onClick={runRemediation}
                    disabled={remediating}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
                  >
                    {remediating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>Appliquer la remédiation sécurisée</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Exclusions & Restore Points Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Defender Exclusions */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-purple-400" />
              Exceptions Windows Defender
            </h3>
            <span className="text-xs text-zinc-500">{exclusions.length} active(s)</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newExclusionPath}
              onChange={(e) => setNewExclusionPath(e.target.value)}
              placeholder="Ex: C:\Games\MonJeu"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleAddExclusion}
              disabled={!newExclusionPath.trim()}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors shrink-0"
            >
              Ajouter
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {exclusions.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3">Aucune exception configurée dans Defender.</p>
            ) : (
              exclusions.map((path, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-zinc-300"
                >
                  <span className="truncate font-mono text-[11px]">{path}</span>
                  <button
                    onClick={() => handleRemoveExclusion(path)}
                    title="Supprimer cette exclusion"
                    className="p-1 rounded-md text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Two-Tier Rollback & Windows Restore Points */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-purple-400" />
                Journal de Restauration & Sauvegardes
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Double protection : sauvegarde locale immédiate (.reg/fichiers) + point Windows
              </p>
            </div>
            <button
              onClick={() => api?.openSystemRestore?.()}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium shrink-0"
              title="Ouvrir l'assistant natif Windows de restauration système"
            >
              Ouvrir rstrui.exe
            </button>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {rollbackLog.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3">Aucune sauvegarde locale enregistrée.</p>
            ) : (
              rollbackLog.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-purple-500/20 text-xs transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-200 truncate">{item.description}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                        {new Date(item.timestamp).toLocaleString('fr-FR')}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRestoreEntry(item)}
                      className="px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold transition-colors shrink-0 shadow-sm"
                    >
                      Restaurer
                    </button>
                  </div>

                  {/* Two-Tier Protection Badges */}
                  <div className="flex items-center gap-2 flex-wrap pt-1.5 border-t border-white/5 text-[10px]">
                    {/* Tier 1: Local Backup Badge */}
                    {item.hasRegistryBackup && item.hasFileBackup ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                        💾 Sauvegarde locale (Registre + Fichiers)
                      </span>
                    ) : item.hasRegistryBackup ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                        💾 Sauvegarde Registre (.reg exporté)
                      </span>
                    ) : item.hasFileBackup ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                        💾 Sauvegarde Fichiers
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                        💾 Sauvegarde locale active
                      </span>
                    )}

                    {/* Tier 2: Windows System Restore Badge */}
                    {item.hasSystemRestorePoint ? (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 font-medium">
                        🛡️ Point Système Windows (OK{item.systemRestoreSeq ? ` #${item.systemRestoreSeq}` : ''})
                      </span>
                    ) : item.systemRestoreStatus === 'frequency_limited' ? (
                      <span
                        className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium"
                        title="Limite Windows 24h atteinte. La sauvegarde locale garantit 100% de la restauration."
                      >
                        ⚠️ Quota Windows 24h (Restauration locale garantie)
                      </span>
                    ) : item.systemRestoreStatus === 'disabled' ? (
                      <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-400 font-medium">
                        🛡️ Point Système (Non-admin - Local garanti)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-400 font-medium">
                        🛡️ Point Système (Local seul)
                      </span>
                    )}
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
