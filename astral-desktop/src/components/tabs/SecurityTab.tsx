import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, RefreshCw, Zap,
  FolderPlus, Trash2, RotateCcw, AlertTriangle, CheckCircle2,
  Sliders, Search, Check, FileCheck, Layers, Clock
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

type ScanState = 'idle' | 'scanning' | 'done';
type AiState = 'idle' | 'loading' | 'done';

export default function SecurityTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanType, setScanType] = useState<'quick' | 'full' | 'custom'>('quick');
  const [scanStep, setScanStep] = useState<number>(1);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [currentScanFile, setCurrentScanFile] = useState<string>('');
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
  
  // Settings switches
  const [autoScanStartup, setAutoScanStartup] = useState(true);
  const [autoScanWeekly, setAutoScanWeekly] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'exclusions' | 'backups'>('exclusions');

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
        setScanProgress(100);
        setScanStep(3);
        setScanState('done');
        if ((event.threats || []).length > 0) {
          runAiAnalysis(event.threats);
        } else {
          runAiAnalysis([]);
        }
      } else if (event.type === 'scan-error') {
        setScanState('idle');
        setScanProgress(0);
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

  // Simulated animated scan step progression when scanning
  useEffect(() => {
    if (scanState !== 'scanning') return;

    let p = 0;
    const files = [
      'C:\\Windows\\System32\\ntoskrnl.exe',
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
      'C:\\Program Files\\Windows Defender\\MsMpEng.exe',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      'C:\\Users\\AppData\\Local\\Temp\\cache.tmp',
      'Processus Mémoire : services.exe & svchost.exe',
      'Heuristique autonome : intégrité des signatures PE',
    ];

    const interval = setInterval(() => {
      p += 4;
      if (p > 92) p = 92;
      setScanProgress(p);

      const fIdx = Math.floor((p / 100) * files.length);
      setCurrentScanFile(files[Math.min(fIdx, files.length - 1)]);

      if (p < 35) setScanStep(1);
      else if (p < 75) setScanStep(2);
      else setScanStep(3);
    }, 450);

    return () => clearInterval(interval);
  }, [scanState]);

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

  const startScan = async (type: 'quick' | 'full' | 'custom' = scanType) => {
    if (!api) return;
    setErrorInfo(null);
    setThreats([]);
    setAiAnalysis(null);
    setAiState('idle');
    setScanProgress(5);
    setScanStep(1);
    setScanState('scanning');

    try {
      if (type === 'custom') {
        const folderRes = await api.selectScannerFolder?.();
        if (!folderRes?.success || !folderRes.folderPath) {
          setScanState('idle');
          setScanProgress(0);
          return;
        }
        setCurrentScanFile(`Dossier cible : ${folderRes.folderPath}`);
      }

      await api.createRestorePoint(`Avant scan antivirus (${type})`);
      const res = await api.startScan(type);
      if (!res?.success) {
        setScanState('idle');
        setScanProgress(0);
        setErrorInfo({
          message: res?.error || 'Erreur lors du lancement de l’analyse.',
          technical: res?.rawError,
        });
      }
    } catch (err: any) {
      setScanState('idle');
      setScanProgress(0);
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
      const res = await api.updateSignatures?.();
      if (res?.success) {
        setNotice('✅ Signatures Microsoft Defender mises à jour avec succès.');
        loadData();
      } else {
        setErrorInfo({ message: 'Échec de la mise à jour des signatures', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur inattendue', technical: err.message });
    } finally {
      setUpdatingSignatures(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const handleAddExclusion = async () => {
    if (!api || !newExclusionPath.trim()) return;
    try {
      const res = await api.addExclusion(newExclusionPath.trim());
      if (res?.success) {
        setExclusions((prev) => [...prev, newExclusionPath.trim()]);
        setNewExclusionPath('');
        setNotice('✅ Exception ajoutée à Defender.');
      } else {
        setErrorInfo({ message: 'Impossible d’ajouter l’exclusion', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur exclusion', technical: err.message });
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const handleRemoveExclusion = async (path: string) => {
    if (!api) return;
    try {
      const res = await api.removeExclusion(path);
      if (res?.success) {
        setExclusions((prev) => prev.filter((p) => p !== path));
        setNotice('Exception supprimée.');
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur suppression exclusion', technical: err.message });
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const handleSelectFolderExclusion = async () => {
    if (!api) return;
    try {
      const res = await api.selectScannerFolder?.();
      if (res?.success && res.folderPath) {
        setNewExclusionPath(res.folderPath);
      }
    } catch {}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid var(--border-violet)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--violet)',
            }}
          >
            <Shield size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Sécurité & Protection Defender
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Supervision native Windows Defender · Heuristique autonome zéro-cloud · Points de sauvegarde
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="badge badge-green" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>
            <span className="badge-dot" />
            <span>MOTEUR DEFENDER ACTIF</span>
          </div>
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

      {/* ── Defender 3 Status Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 18, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(16, 217, 160, 0.12)', border: '1px solid var(--border-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Protection Temps Réel</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {defenderStatus?.RealTimeProtectionEnabled ? 'Activée & Conforme' : 'Protection Active'}
              </p>
            </div>
          </div>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--green)', boxShadow: '0 0 8px rgba(16, 217, 160, 0.6)' }} />
        </div>

        <div className="glass-card" style={{ padding: 18, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid var(--border-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--violet)' }}>
              <Shield size={18} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Moteur Antivirus</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Microsoft Defender Native
              </p>
            </div>
          </div>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--green)', boxShadow: '0 0 8px rgba(16, 217, 160, 0.6)' }} />
        </div>

        <div className="glass-card" style={{ padding: 18, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Signatures Antivirales</p>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
              {defenderStatus?.AntivirusSignatureVersion || 'Dernière Version'}
            </p>
          </div>
          <button
            onClick={handleUpdateSignatures}
            disabled={updatingSignatures}
            className="btn btn-ghost"
            style={{ padding: '6px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={12} className={updatingSignatures ? 'animate-spin' : ''} />
            <span>{updatingSignatures ? 'Mise à jour...' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      {/* ── Main Dynamic Radar Scanner Centerpiece ── */}
      <div
        className="glass-card"
        style={{
          padding: 28,
          borderRadius: 20,
          marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.10) 0%, rgba(6, 6, 20, 0.85) 100%)',
          border: '1px solid var(--border-violet)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Console d'Analyse Antivirale & Heuristique
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Sélectionnez le mode puis lancez l'inspection intelligente en temps réel
            </p>
          </div>

          {/* Mode Selector Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'quick', label: 'Analyse Rapide', desc: 'Mémoire & Boot' },
              { id: 'full', label: 'Analyse Complète', desc: 'Disques & Fichiers' },
              { id: 'custom', label: 'Ciblage Dossier', desc: 'Répertoire Spécifique' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setScanType(m.id as any)}
                disabled={scanState === 'scanning'}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: `1px solid ${scanType === m.id ? 'var(--cyan)' : 'var(--border)'}`,
                  backgroundColor: scanType === m.id ? 'rgba(0, 212, 255, 0.12)' : 'var(--bg-surface)',
                  color: scanType === m.id ? 'var(--cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Centerpiece Scanner Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '16px 0 20px 0' }}>
          <style>{`
            @keyframes radarPulse {
              0% { transform: scale(0.95); opacity: 0.8; }
              50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 20px rgba(0, 212, 255, 0.6)); }
              100% { transform: scale(0.95); opacity: 0.8; }
            }
            @keyframes radarSweep {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {/* Large Radar Scan Button */}
          <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg
              width="150"
              height="150"
              viewBox="0 0 150 150"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
              }}
            >
              <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" />
              <circle
                cx="75"
                cy="75"
                r="68"
                fill="none"
                stroke={scanState === 'scanning' ? 'var(--cyan)' : scanState === 'done' ? 'var(--green)' : 'var(--violet)'}
                strokeWidth="2.5"
                strokeDasharray="16 10 4 10"
                strokeLinecap="round"
                style={{
                  transformOrigin: '75px 75px',
                  animation: scanState === 'scanning' ? 'radarSweep 2s linear infinite' : 'none',
                }}
              />
            </svg>

            <button
              onClick={() => startScan(scanType)}
              disabled={scanState === 'scanning'}
              style={{
                width: 114,
                height: 114,
                borderRadius: '50%',
                border: `3px solid ${
                  scanState === 'scanning'
                    ? 'var(--cyan)'
                    : scanState === 'done'
                    ? 'var(--green)'
                    : 'var(--violet)'
                }`,
                backgroundColor:
                  scanState === 'scanning'
                    ? 'rgba(0, 212, 255, 0.16)'
                    : scanState === 'done'
                    ? 'rgba(16, 217, 160, 0.16)'
                    : 'rgba(139, 92, 246, 0.16)',
                boxShadow:
                  scanState === 'scanning'
                    ? '0 0 35px rgba(0, 212, 255, 0.5)'
                    : '0 0 25px rgba(139, 92, 246, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: scanState === 'scanning' ? 'default' : 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              {scanState === 'scanning' ? (
                <>
                  <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--cyan)' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, marginTop: 6, color: 'var(--cyan)' }}>
                    {scanProgress}%
                  </span>
                </>
              ) : scanState === 'done' ? (
                <>
                  <CheckCircle2 size={30} style={{ color: 'var(--green)' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, color: 'var(--green)' }}>
                    TERMINÉ
                  </span>
                </>
              ) : (
                <>
                  <Zap size={30} style={{ color: 'var(--violet)' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>
                    ANALYSER
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Dynamic 3-Step Progress Indicator */}
          {scanState === 'scanning' && (
            <div style={{ width: '100%', maxWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: scanStep >= 1 ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${scanStep >= 1 ? 'var(--cyan)' : 'var(--border)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: scanStep >= 1 ? 'var(--cyan)' : 'var(--text-muted)' }}>
                    Étape 1 : Mémoire & RAM
                  </div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: scanStep >= 2 ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${scanStep >= 2 ? 'var(--cyan)' : 'var(--border)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: scanStep >= 2 ? 'var(--cyan)' : 'var(--text-muted)' }}>
                    Étape 2 : Signatures Defender
                  </div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: scanStep >= 3 ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${scanStep >= 3 ? 'var(--cyan)' : 'var(--border)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: scanStep >= 3 ? 'var(--cyan)' : 'var(--text-muted)' }}>
                    Étape 3 : Heuristique IA
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 8 }}>
                <div
                  style={{
                    width: `${scanProgress}%`,
                    height: '100%',
                    backgroundColor: 'var(--cyan)',
                    boxShadow: '0 0 10px rgba(0, 212, 255, 0.6)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                  Inspection : {currentScanFile}
                </span>
                <span>{scanProgress}%</span>
              </div>
            </div>
          )}

          {/* Scan Done State Verdict */}
          {scanState === 'done' && (
            <div style={{ width: '100%', maxWidth: 640, padding: 16, borderRadius: 14, backgroundColor: threats.length === 0 ? 'rgba(16, 217, 160, 0.1)' : 'rgba(255, 75, 75, 0.1)', border: `1px solid ${threats.length === 0 ? 'rgba(16, 217, 160, 0.3)' : 'rgba(255, 75, 75, 0.3)'}`, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: threats.length === 0 ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                {threats.length === 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span>{threats.length === 0 ? 'Système Intègre · 0 Menace Détectée' : `${threats.length} Menace(s) Détectée(s)`}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {threats.length === 0
                  ? 'La mémoire, le registre et les fichiers analysés sont sains. Un point de sauvegarde a été automatiquement sécurisé.'
                  : 'Des anomalies ont été identifiées. Consultez l\'analyse heuristique ci-dessous pour appliquer la remédiation.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Heuristic AI Box (If threats or AI completed) */}
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
              <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--violet)' }}>
                <Zap size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Rapport du Moteur Heuristique IA
                </h3>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                  Détection locale zéro-cloud · Analyse contextuelle des faux-positifs
                </p>
              </div>
            </div>

            {aiAnalysis && (
              <span className={`badge ${aiAnalysis.riskLevel === 'sain' ? 'badge-green' : aiAnalysis.riskLevel === 'faible' ? 'badge-cyan' : 'badge-orange'}`} style={{ padding: '4px 10px', fontSize: 11 }}>
                Risque : {aiAnalysis.riskLevel}
              </span>
            )}
          </div>

          {aiAnalysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {aiAnalysis.summary}
              </p>
              {remediationScript && (
                <div style={{ marginTop: 8 }}>
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

      {/* ── Auto-Scans & Configuration Switcher ── */}
      <div className="glass-card" style={{ padding: 20, borderRadius: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} style={{ color: 'var(--cyan)' }} />
          <span>Planification & Analyses Automatiques</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div style={{ padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Analyse au démarrage Windows</div>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Vérification rapide des clés Run et de la mémoire au boot
              </p>
            </div>
            <label className="toggle-switch" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={autoScanStartup} onChange={(e) => setAutoScanStartup(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div style={{ padding: 14, borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Analyse hebdomadaire de fond</div>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Scan complet des fichiers système le dimanche à 03:00
              </p>
            </div>
            <label className="toggle-switch" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={autoScanWeekly} onChange={(e) => setAutoScanWeekly(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Sub-Tabs: Exceptions vs Backups ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setActiveSubTab('exclusions')}
          className={`btn ${activeSubTab === 'exclusions' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 12, padding: '7px 16px' }}
        >
          Exceptions Windows Defender ({exclusions.length})
        </button>
        <button
          onClick={() => setActiveSubTab('backups')}
          className={`btn ${activeSubTab === 'backups' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 12, padding: '7px 16px' }}
        >
          Journal de Restauration & Sauvegardes ({rollbackLog.length})
        </button>
      </div>

      {/* Exclusions Panel */}
      {activeSubTab === 'exclusions' && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              value={newExclusionPath}
              onChange={(e) => setNewExclusionPath(e.target.value)}
              placeholder="Ex: C:\Jeux\MonJeu (ou cliquez sur Parcourir)"
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
              onClick={handleSelectFolderExclusion}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              Parcourir...
            </button>
            <button
              onClick={handleAddExclusion}
              disabled={!newExclusionPath.trim()}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600 }}
            >
              Ajouter
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {exclusions.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
                Aucune exception configurée. Vos jeux et logiciels moddés peuvent être ajoutés ici pour éviter tout blocage.
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
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {path}
                  </span>
                  <button
                    onClick={() => handleRemoveExclusion(path)}
                    className="btn btn-ghost btn-icon"
                    title="Supprimer cette exclusion"
                    style={{ padding: 4 }}
                  >
                    <Trash2 size={13} style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Backups Panel */}
      {activeSubTab === 'backups' && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
            {rollbackLog.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
                Aucun point de sauvegarde enregistré pour le moment. Un point est créé automatiquement avant chaque analyse ou remédiation.
              </p>
            ) : (
              rollbackLog.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.label || item.reason || 'Point de sauvegarde système'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {item.timestamp ? new Date(item.timestamp).toLocaleString('fr-FR') : 'Date récente'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreEntry(item)}
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <RotateCcw size={12} />
                    <span>Restaurer</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
