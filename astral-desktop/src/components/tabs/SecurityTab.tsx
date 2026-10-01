import { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Zap, FolderPlus, Trash2, RotateCcw, AlertTriangle, CheckCircle2, FileText, Check, Unlock, FolderCheck, Download } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

type ScanState = 'idle' | 'scanning' | 'done';
type AiState = 'idle' | 'loading' | 'done';

export default function SecurityTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanType, setScanType] = useState<'quick' | 'full' | 'custom'>('quick');
  const [threats, setThreats] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiState, setAiState] = useState<AiState>('idle');
  const [rollbackLog, setRollbackLog] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newExclusionPath, setNewExclusionPath] = useState('');
  const [remediationScript, setRemediationScript] = useState('');
  const [remediating, setRemediating] = useState(false);
  const [updatingSignatures, setUpdatingSignatures] = useState(false);
  const [unblockingDownloads, setUnblockingDownloads] = useState(false);
  const [unblockingFile, setUnblockingFile] = useState(false);
  const [defenderStatus, setDefenderStatus] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  const handleUnblockDownloads = async () => {
    if (!api) return;
    setUnblockingDownloads(true);
    setErrorInfo(null);
    try {
      const res = await api.unblockDownloads?.();
      if (res?.success) {
        setNotice(`✅ Dossier Téléchargements débloqué : ${res.count} fichier(s) libéré(s) de l'attribut Zone.Identifier.`);
      } else {
        setErrorInfo({ message: 'Erreur lors du déblocage des téléchargements', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur inattendue', technical: err.message });
    } finally {
      setUnblockingDownloads(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const handleSelectAndUnblock = async () => {
    if (!api) return;
    setUnblockingFile(true);
    setErrorInfo(null);
    try {
      const res = await api.selectAndUnblock?.();
      if (res?.success) {
        setNotice(`✅ Fichier débloqué avec succès : ${res.filePath}`);
      } else if (!res?.canceled) {
        setErrorInfo({ message: 'Impossible de débloquer ce fichier', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur inattendue', technical: err.message });
    } finally {
      setUnblockingFile(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

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
        setNotice('✅ Signatures antivirales Microsoft Defender mises à jour avec succès.');
        loadData();
      } else {
        setErrorInfo({
          message: 'Impossible de mettre à jour les signatures Defender.',
          technical: res?.error,
        });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur signatures', technical: err.message });
    } finally {
      setUpdatingSignatures(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const handleAddExclusion = async () => {
    if (!api || !newExclusionPath.trim()) return;
    setErrorInfo(null);
    try {
      const res = await api.addExclusion(newExclusionPath.trim());
      if (res?.success) {
        setExclusions((prev) => [...prev, newExclusionPath.trim()]);
        setNewExclusionPath('');
        setNotice('✅ Exclusion ajoutée à Microsoft Defender.');
      } else {
        setErrorInfo({ message: 'Erreur lors de l’ajout de l’exclusion.', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur exclusion', technical: err.message });
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const handleRemoveExclusion = async (path: string) => {
    if (!api) return;
    setErrorInfo(null);
    try {
      const res = await api.removeExclusion(path);
      if (res?.success) {
        setExclusions((prev) => prev.filter((p) => p !== path));
        setNotice('✅ Exclusion retirée de Defender.');
        setTimeout(() => setNotice(''), 3000);
      }
    } catch (err: any) {
      setErrorInfo({
        message: 'Impossible de supprimer cette exclusion',
        technical: err.message,
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
            <Shield size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Sécurité & Bouclier Defender
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Supervision native Microsoft Defender · Heuristique autonome zéro-cloud · Points de restauration
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={scanType}
            onChange={(e) => setScanType(e.target.value as any)}
            disabled={scanState === 'scanning'}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-violet)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="quick">Analyse Rapide (QuickScan)</option>
            <option value="full">Analyse Complète (FullScan)</option>
            <option value="custom">Analyse Personnalisée (Dossier)</option>
          </select>

          <button
            onClick={async () => {
              if (scanType === 'custom') {
                const folderRes = await api?.selectScannerFolder?.();
                if (folderRes?.success && folderRes.folderPath) {
                  setNotice(`Analyse personnalisée lancée sur : ${folderRes.folderPath}`);
                  startScan();
                }
              } else {
                startScan();
              }
            }}
            disabled={scanState === 'scanning'}
            className="btn btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {scanState === 'scanning' ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Analyse en cours...</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>Lancer l'analyse</span>
              </>
            )}
          </button>
        </div>
      </div>

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
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Defender Status Banner (3 Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div
          className="glass-card"
          style={{
            padding: 16,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: 'rgba(16, 217, 160, 0.12)',
                border: '1px solid var(--border-green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--green)',
              }}
            >
              <ShieldCheck size={18} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Protection Temps Réel</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {defenderStatus?.RealTimeProtectionEnabled ? 'Activée (OK)' : 'Non confirmée'}
              </p>
            </div>
          </div>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: defenderStatus?.RealTimeProtectionEnabled ? 'var(--green)' : 'var(--orange)',
              boxShadow: defenderStatus?.RealTimeProtectionEnabled ? '0 0 8px rgba(16, 217, 160, 0.6)' : 'none',
            }}
          />
        </div>

        <div
          className="glass-card"
          style={{
            padding: 16,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                border: '1px solid var(--border-violet)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--violet)',
              }}
            >
              <Shield size={18} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Moteur Antivirus</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {defenderStatus?.AntivirusEnabled ? 'Microsoft Defender' : 'Désactivé / Inconnu'}
              </p>
            </div>
          </div>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: defenderStatus?.AntivirusEnabled ? 'var(--green)' : 'var(--red)',
              boxShadow: defenderStatus?.AntivirusEnabled ? '0 0 8px rgba(16, 217, 160, 0.6)' : 'none',
            }}
          />
        </div>

        <div
          className="glass-card"
          style={{
            padding: 16,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Signatures Antivirales</p>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
              {defenderStatus?.AntivirusSignatureVersion || 'À jour'}
            </p>
          </div>
          <button
            onClick={handleUpdateSignatures}
            disabled={updatingSignatures}
            className="btn btn-ghost"
            style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={12} className={updatingSignatures ? 'animate-spin' : ''} />
            <span>{updatingSignatures ? 'Mise à jour...' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      {/* Heuristic AI Box */}
      {aiState !== 'idle' && (
        <div
          className="glass-card"
          style={{
            padding: 20,
            borderRadius: 16,
            marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 6, 20, 0.8))',
            border: '1px solid var(--border-violet)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: 'rgba(139, 92, 246, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--violet)',
                }}
              >
                <Zap size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Bouclier IA Heuristique Autonome
                </h3>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                  Détection locale sans cloud · Analyse des faux-positifs gaming
                </p>
              </div>
            </div>

            {aiAnalysis && (
              <span
                className={`badge ${
                  aiAnalysis.riskLevel === 'sain'
                    ? 'badge-green'
                    : aiAnalysis.riskLevel === 'faible'
                    ? 'badge-cyan'
                    : 'badge-orange'
                }`}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                Risque : {aiAnalysis.riskLevel}
              </span>
            )}
          </div>

          {aiAnalysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {aiAnalysis.summary}
              </p>
              {aiAnalysis.explanation && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.5,
                  }}
                >
                  {aiAnalysis.explanation}
                </div>
              )}

              {remediationScript && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: 11, fontWeight: 600, color: 'var(--violet)' }}>
                    Script de remédiation sécurisé proposé :
                  </p>
                  <pre className="code-block" style={{ marginBottom: 10 }}>
                    {remediationScript}
                  </pre>
                  <button
                    onClick={runRemediation}
                    disabled={remediating}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {remediating ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                    <span>Appliquer la remédiation sécurisée</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* File & Download Unblocker (Zone.Identifier ADS) */}
      <div className="glass-card" style={{ padding: 22, borderRadius: 16, marginBottom: 24, border: '1px solid rgba(16, 217, 160, 0.25)', background: 'linear-gradient(135deg, rgba(16, 217, 160, 0.05), rgba(6, 6, 20, 0.6))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                backgroundColor: 'rgba(16, 217, 160, 0.12)',
                border: '1px solid rgba(16, 217, 160, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--green)',
                boxShadow: '0 0 16px rgba(16, 217, 160, 0.2)',
              }}
            >
              <Unlock size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Débloqueur de Fichiers & Téléchargements
                </h3>
                <span className="badge badge-green" style={{ fontSize: 10 }}>Zone.Identifier ADS</span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Supprime le blocage Windows « Ce fichier provient d'un autre ordinateur » et libère l'accès direct aux exécutables, mods et photos.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleUnblockDownloads}
              disabled={unblockingDownloads}
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {unblockingDownloads ? <RefreshCw size={13} className="animate-spin" /> : <FolderCheck size={13} />}
              <span>{unblockingDownloads ? 'Déblocage en cours...' : 'Débloquer Téléchargements'}</span>
            </button>

            <button
              onClick={handleSelectAndUnblock}
              disabled={unblockingFile}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {unblockingFile ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
              <span>Choisir un fichier à débloquer</span>
            </button>
          </div>
        </div>

        <div style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
          <span>
            Le scanner de téléchargements en arrière-plan d'Astral Vanguard débloque automatiquement les nouveaux fichiers sains dès leur validation par Microsoft Defender.
          </span>
        </div>
      </div>

      {/* Exclusions & Restore Points Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {/* Exclusions */}
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderPlus size={16} style={{ color: 'var(--violet)' }} />
              <span>Exceptions Windows Defender</span>
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{exclusions.length} active(s)</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              value={newExclusionPath}
              onChange={(e) => setNewExclusionPath(e.target.value)}
              placeholder="Ex: C:\Games\MonJeu"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 10,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              onClick={handleAddExclusion}
              disabled={!newExclusionPath.trim()}
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600 }}
            >
              Ajouter
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {exclusions.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
                Aucune exception configurée dans Defender.
              </p>
            ) : (
              exclusions.map((path, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {path}
                  </span>
                  <button
                    onClick={() => handleRemoveExclusion(path)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                    title="Supprimer cette exclusion"
                  >
                    <Trash2 size={13} style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Restore Points */}
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <RotateCcw size={16} style={{ color: 'var(--cyan)' }} />
                <span>Journal de Restauration & Sauvegardes</span>
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Sauvegardes locales automatiques (.reg / fichiers)
              </p>
            </div>
            <button
              onClick={() => api?.openSystemRestore?.()}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px' }}
              title="Ouvrir l'assistant natif Windows"
            >
              rstrui.exe
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 250, overflowY: 'auto' }}>
            {rollbackLog.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
                Aucune sauvegarde locale enregistrée.
              </p>
            ) : (
              rollbackLog.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.description}
                      </p>
                      <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        {new Date(item.timestamp).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestoreEntry(item)}
                      className="btn btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      Restaurer
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 6px' }}>
                      💾 Registre & Paramètres
                    </span>
                    {item.hasSystemRestorePoint && (
                      <span className="badge badge-violet" style={{ fontSize: 9, padding: '1px 6px' }}>
                        🛡️ Point Windows #{item.systemRestoreSeq || ''}
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
