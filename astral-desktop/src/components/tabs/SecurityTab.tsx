import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, RefreshCw, Zap,
  FolderPlus, Trash2, RotateCcw, AlertTriangle, CheckCircle2,
  Search, Check, FileCheck, Layers, Clock, Calendar, Sparkles
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

type ScanState = 'idle' | 'scanning' | 'done';

export default function SecurityTab() {
  const { securityStatus: ctxSec, updateSecurityStatus } = useSystem();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanType, setScanType] = useState<'quick' | 'full'>('quick');
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [currentScanFile, setCurrentScanFile] = useState<string>('');
  const [filesScanned, setFilesScanned] = useState<number>(0);
  const [threats, setThreats] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newExclusionPath, setNewExclusionPath] = useState('');
  const [updatingSignatures, setUpdatingSignatures] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'protection' | 'schedule' | 'exclusions'>('protection');

  // Protection Toggles
  const [realTimeGuard, setRealTimeGuard] = useState(true);
  const [downloadShield, setDownloadShield] = useState(true);
  const [memoryHeuristic, setMemoryHeuristic] = useState(true);
  const [scheduledFrequency, setScheduledFrequency] = useState<'daily' | 'weekly'>('weekly');
  const [scheduledEnabled, setScheduledEnabled] = useState(true);

  useEffect(() => {
    if (!api) return;
    api.getExclusions?.().then((r: any) => setExclusions(r.paths || []));

    const cleanup = api.on?.('security:scan-event', (event: any) => {
      if (event.type === 'scan-progress') {
        setScanProgress(event.percent);
        if (event.currentFile) setCurrentScanFile(event.currentFile);
        if (event.filesScanned) setFilesScanned(event.filesScanned);
      } else if (event.type === 'scan-complete') {
        setScanProgress(100);
        setScanState('done');
        setThreats(event.threats || []);
        if (event.filesScanned) setFilesScanned(event.filesScanned);
      } else if (event.type === 'scan-error') {
        setScanState('idle');
        setErrorInfo({ message: 'Échec de l’analyse.', technical: event.error });
      } else if (event.type === 'scan-cancelled') {
        setScanState('idle');
        setScanProgress(0);
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const startScan = async () => {
    if (!api) return;
    setScanState('scanning');
    setScanProgress(5);
    setFilesScanned(0);
    setCurrentScanFile('Initialisation des flux de mémoire...');
    setErrorInfo(null);
    setThreats([]);

    try {
      await api.startScan(scanType);
    } catch (err: any) {
      setScanState('idle');
      setErrorInfo({ message: 'Impossible de lancer l’analyse', technical: err.message });
    }
  };

  const cancelScan = async () => {
    if (!api) return;
    await api.cancelScan?.();
    setScanState('idle');
    setScanProgress(0);
  };

  const updateSignatures = async () => {
    if (!api) return;
    setUpdatingSignatures(true);
    setNotice('Mise à jour des signatures en cours...');
    try {
      const res = await api.updateSignatures();
      if (res?.success) {
        updateSecurityStatus({ signaturesVersion: res.version || 'v2.4.1026-LIVE' });
        setNotice('✅ Signatures du moteur Astral Vanguard actualisées.');
      }
    } finally {
      setUpdatingSignatures(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const addExclusion = async () => {
    if (!api || !newExclusionPath.trim()) return;
    const res = await api.addExclusion(newExclusionPath.trim());
    if (res?.success) {
      setExclusions([...exclusions, newExclusionPath.trim()]);
      setNewExclusionPath('');
      setNotice('✅ Règle d’exclusion ajoutée.');
      setTimeout(() => setNotice(''), 3000);
    }
  };

  const removeExclusion = async (p: string) => {
    if (!api) return;
    const res = await api.removeExclusion(p);
    if (res?.success) {
      setExclusions(exclusions.filter((e) => e !== p));
    }
  };

  return (
    <div className="tab-scroll animate-in" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Centre de Sécurité & Antivirus
            </h1>
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '3px 8px',
                borderRadius: 6,
                backgroundColor: 'rgba(0, 245, 255, 0.1)',
                border: '1px solid rgba(0, 245, 255, 0.3)',
                color: 'var(--cyan)',
                fontWeight: 700,
              }}
            >
              ASTRAL VANGUARD CORE v2.4
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Moteur de protection heuristique autonome & bouclier e-sport temps réel
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={updateSignatures}
            disabled={updatingSignatures}
            className="btn btn-ghost btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <RefreshCw size={13} className={updatingSignatures ? 'animate-spin' : ''} />
            <span>{updatingSignatures ? 'Mise à jour...' : 'Actualiser Signatures'}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 10,
            backgroundColor: 'rgba(0, 245, 255, 0.08)',
            border: '1px solid rgba(0, 245, 255, 0.25)',
            fontSize: 13,
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles size={16} style={{ color: 'var(--cyan)' }} />
          <span>{notice}</span>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Main Scan Hero Card with Radar Animation */}
      <div
        className="glass-card"
        style={{
          padding: '28px 32px',
          marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(8, 12, 28, 0.85) 0%, rgba(15, 23, 42, 0.75) 100%)',
          border: '1px solid rgba(0, 245, 255, 0.2)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          {/* Left info & controls */}
          <div style={{ flex: '1 1 340px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="badge badge-cyan" style={{ fontSize: 11, padding: '3px 10px' }}>
                <span className="badge-dot" style={{ animation: 'dotPulse 1.4s infinite' }} />
                BOUCLIER ACTIF
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Signatures : <strong style={{ color: '#ffffff' }}>{ctxSec.signaturesVersion}</strong>
              </span>
            </div>

            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
              {scanState === 'scanning'
                ? 'Analyse heuristique en cours...'
                : scanState === 'done'
                ? 'Analyse système terminée'
                : 'Système intègre et sécurisé'}
            </h2>

            <p style={{ margin: '6px 0 18px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {scanState === 'scanning'
                ? 'Le moteur examine les flux de mémoire, les entrées système critiques et les bibliothèques d’exécution.'
                : scanState === 'done'
                ? `Analyse achevée avec succès. ${filesScanned} cibles vérifiées, ${threats.length} menace(s).`
                : 'Scannez votre machine pour détecter les anomalies de registre, injecteurs non autorisés et menaces dormantes.'}
            </p>

            {/* Scan Type Selector & Action Buttons */}
            {scanState === 'idle' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: 4, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <button
                    onClick={() => setScanType('quick')}
                    className={`btn btn-sm ${scanType === 'quick' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    Rapide (Mémoire & Registres)
                  </button>
                  <button
                    onClick={() => setScanType('full')}
                    className={`btn btn-sm ${scanType === 'full' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    Approfondie (Système Entier)
                  </button>
                </div>

                <button
                  onClick={startScan}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 24px',
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: '0 0 20px rgba(0, 245, 255, 0.45)',
                    transition: 'all 0.25s ease',
                  }}
                >
                  <Zap size={16} />
                  <span>Lancer l'Analyse</span>
                </button>
              </div>
            )}

            {scanState === 'scanning' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={cancelScan} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>
                  Annuler l'analyse
                </button>
                <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {filesScanned} fichiers analysés
                </span>
              </div>
            )}

            {scanState === 'done' && (
              <button onClick={() => setScanState('idle')} className="btn btn-ghost btn-sm">
                Fermer le rapport et réinitialiser
              </button>
            )}
          </div>

          {/* Right Circular Radar Visual */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: '50%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle, rgba(0, 245, 255, 0.05) 0%, rgba(6, 6, 20, 0.8) 70%)',
                border: '2px solid rgba(0, 245, 255, 0.3)',
                boxShadow: scanState === 'scanning' ? '0 0 30px rgba(0, 245, 255, 0.4)' : 'none',
              }}
            >
              {/* Radar Sweeping Beam */}
              {scanState === 'scanning' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'conic-gradient(from 0deg, transparent 70%, rgba(0, 245, 255, 0.5) 100%)',
                    animation: 'spin 1.8s linear infinite',
                  }}
                />
              )}

              {/* Central Badge */}
              <div style={{ zIndex: 2, textAlign: 'center' }}>
                {scanState === 'scanning' ? (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--cyan)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {scanProgress}%
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>En cours</div>
                  </>
                ) : scanState === 'done' ? (
                  <CheckCircle2 size={46} style={{ color: '#10b981' }} />
                ) : (
                  <ShieldCheck size={46} style={{ color: 'var(--cyan)' }} />
                )}
              </div>
            </div>

            {scanState === 'scanning' && (
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(148, 163, 184, 0.85)',
                  maxWidth: 240,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={currentScanFile}
              >
                {currentScanFile}
              </div>
            )}
          </div>
        </div>

        {/* Linear Progress Indicator during scan */}
        {scanState === 'scanning' && (
          <div style={{ marginTop: 24 }}>
            <div style={{ height: 4, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 9999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${scanProgress}%`,
                  background: 'linear-gradient(90deg, #00f5ff, #818cf8)',
                  transition: 'width 0.3s ease',
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.7)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 12 }}>
        <button
          onClick={() => setActiveSubTab('protection')}
          className={`btn btn-sm ${activeSubTab === 'protection' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Boucliers de Protection
        </button>
        <button
          onClick={() => setActiveSubTab('schedule')}
          className={`btn btn-sm ${activeSubTab === 'schedule' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Analyses Programmées
        </button>
        <button
          onClick={() => setActiveSubTab('exclusions')}
          className={`btn btn-sm ${activeSubTab === 'exclusions' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Exclusions E-Sport & Mods ({exclusions.length})
        </button>
      </div>

      {/* SUBTAB 1: PROTECTION MODULES */}
      {activeSubTab === 'protection' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Card 1: File Guard */}
          <div className="glass-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(0, 245, 255, 0.1)', color: 'var(--cyan)' }}>
                  <FileCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Bouclier de Fichiers</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Interception I/O en temps réel</div>
                </div>
              </div>
              <CyberToggle checked={realTimeGuard} onChange={setRealTimeGuard} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Vérifie l'intégrité de chaque fichier accédé ou exécuté par vos applications et jeux.
            </p>
          </div>

          {/* Card 2: Download Shield */}
          <div className="glass-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--violet)' }}>
                  <Layers size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Sentinelle Téléchargements</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Analyse automatique immédiate</div>
                </div>
              </div>
              <CyberToggle checked={downloadShield} onChange={setDownloadShield} glowColor="purple" />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Déclenche le modal cyber instantané dès qu'une archive ou un exécutable est reçu.
            </p>
          </div>

          {/* Card 3: Memory Heuristics */}
          <div className="glass-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)' }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Heuristique Mémoire</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Anti-Injection & Processus Suspects</div>
                </div>
              </div>
              <CyberToggle checked={memoryHeuristic} onChange={setMemoryHeuristic} glowColor="green" />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Surveille la table d'adresses pour bloquer les tentatives de hollowing ou de crochet DLL.
            </p>
          </div>
        </div>
      )}

      {/* SUBTAB 2: SCHEDULED SCANS */}
      {activeSubTab === 'schedule' && (
        <div className="glass-card" style={{ padding: 24, maxWidth: 650 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Calendar size={22} style={{ color: 'var(--cyan)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Analyses Récurrentes Automatiques</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Exécution silencieuse en arrière-plan sans ralentir vos jeux</div>
              </div>
            </div>
            <CyberToggle checked={scheduledEnabled} onChange={setScheduledEnabled} />
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px 0' }}>
            Astral Vanguard planifie une inspection de sécurité périodique. Si un jeu est en cours d'exécution, l'analyse attend automatiquement la fermeture du jeu pour ne pas impacter votre FPS.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => setScheduledFrequency('daily')}
              className={`btn btn-sm ${scheduledFrequency === 'daily' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12 }}
            >
              Tous les jours (03:00)
            </button>
            <button
              onClick={() => setScheduledFrequency('weekly')}
              className={`btn btn-sm ${scheduledFrequency === 'weekly' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12 }}
            >
              Toutes les semaines (Dimanche 03:00)
            </button>
          </div>
        </div>
      )}

      {/* SUBTAB 3: EXCLUSIONS */}
      {activeSubTab === 'exclusions' && (
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
            Dossiers Exclus (Jeux, Mods & Émulateurs)
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Empêche les faux-positifs fréquents sur les modpacks indépendants, injecteurs de shaders ou émulateurs e-sport.
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              type="text"
              value={newExclusionPath}
              onChange={(e) => setNewExclusionPath(e.target.value)}
              placeholder="Ex: C:\Games\ModdedLauncher"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                fontSize: 13,
              }}
            />
            <button onClick={addExclusion} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FolderPlus size={15} />
              <span>Ajouter</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {exclusions.length === 0 ? (
              <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Aucun dossier exclu configuré.
              </div>
            ) : (
              exclusions.map((p) => (
                <div
                  key={p}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#ffffff' }}>{p}</span>
                  <button onClick={() => removeExclusion(p)} className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }}>
                    <Trash2 size={14} />
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
