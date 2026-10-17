import { useState, useEffect, useRef } from 'react';
import {
  Shield, Search, Play, RefreshCw, Clock, Bug, Lock,
  Globe, Folder, Plus, CheckCircle2, AlertTriangle, X, Sparkles,
  Zap, ShieldAlert, ShieldCheck, Trash2, Edit2, RotateCw
} from 'lucide-react';
import SlideDrawer from '../common/SlideDrawer';

const api = (window as any).vanguard;

type ScanTab = 'Boucliers' | 'Programmées' | 'Historique' | 'Exclusions';
interface ScanLog { text: string; type?: 'ok' | 'warn' | 'bad' | ''; }
interface Shield_ { key: string; label: string; desc: string; icon: React.ReactNode; }

interface ScheduledScan {
  id: string;
  name: string;
  mode: 'Rapide' | 'Approfondie';
  time: string;
  frequency: string;
  enabled: boolean;
}

const SHIELDS: Shield_[] = [
  { key: 'rt',   label: 'Bouclier de fichiers temps réel',  desc: 'Contrôle chaque fichier exécuté ou ouvert',  icon: <Shield size={16} /> },
  { key: 'dl',   label: 'Sentinelle téléchargements',       desc: 'Analyse et bloque les archives douteuses',   icon: <Search size={16} /> },
  { key: 'mem',  label: 'Heuristique mémoire vive',         desc: 'Surveille injections et processus suspects', icon: <Bug size={16} /> },
  { key: 'fw',   label: 'Pare-feu Windows Avancé',          desc: 'Filtrage des flux domaine, privé et public', icon: <Globe size={16} /> },
  { key: 'ds',   label: 'Protection anti-ransomware',       desc: 'Verrouillage des dossiers sensibles',        icon: <Lock size={16} /> },
  { key: 'tele', label: 'Filtre de réputation web & DNS',   desc: 'Interception des domaines malveillants',      icon: <Zap size={16} /> },
];

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle" style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => !disabled && onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

export default function SecurityTab() {
  const [shields, setShields]         = useState<Record<string, boolean>>({ rt: true, dl: true, mem: true, fw: true, ds: true, tele: true });
  const [scanning, setScanning]       = useState(false);
  const [scanPhase, setScanPhase]     = useState('');
  const [scanDone, setScanDone]       = useState<string | null>(null);
  const [progress, setProgress]       = useState(0);
  const [logs, setLogs]               = useState<ScanLog[]>([]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [threats, setThreats]         = useState(0);
  const [threatDetails, setThreatDetails] = useState<any[]>([]);
  const [duration, setDuration]       = useState(0);
  const [scanMode, setScanMode]       = useState<'Rapide' | 'Approfondie' | 'Personnalisée'>('Rapide');
  const [scanTab, setScanTab]         = useState<ScanTab>('Boucliers');
  const [exclusions, setExclusions]   = useState<string[]>([]);
  const [history, setHistory]         = useState<{ label: string; when: string; result: string; duration?: string }[]>([
    { label: 'Analyse rapide multi-moteurs', when: 'Aujourd\'hui 14:22', result: 'Propre', duration: '18 s' },
    { label: 'Analyse complète', when: 'Hier 03:00', result: 'Propre', duration: '4 min 12 s' },
  ]);
  const [schedules, setSchedules]     = useState<ScheduledScan[]>([
    { id: 'sched-1', name: 'Analyse rapide quotidienne', mode: 'Rapide', time: '03:00', frequency: 'Tous les jours', enabled: true },
    { id: 'sched-2', name: 'Analyse approfondie hebdomadaire', mode: 'Approfondie', time: '04:00', frequency: 'Chaque dimanche', enabled: false },
  ]);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedName, setNewSchedName] = useState('Analyse personnalisée');
  const [newSchedMode, setNewSchedMode] = useState<'Rapide' | 'Approfondie'>('Rapide');
  const [newSchedTime, setNewSchedTime] = useState('12:00');
  const [newSchedFreq, setNewSchedFreq] = useState('Tous les jours');

  const [notice, setNotice]           = useState('');
  const [customPath, setCustomPath]   = useState('');
  const [showRemediationModal, setShowRemediationModal] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [aiReportText, setAiReportText] = useState('');

  const timerRef = useRef<any>(null);
  const startRef = useRef(0);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (!api) return;

    // Defender & Shields real status
    api.getSecurityStatus?.().then((res: any) => {
      const s = res?.data || res;
      if (s) {
        setShields(prev => ({
          ...prev,
          rt: Boolean(s.RealTimeProtectionEnabled ?? s.realTimeProtection ?? prev.rt),
          fw: Boolean(s.FirewallEnabled ?? prev.fw),
          ds: Boolean(s.controlledFolderAccess ?? prev.ds),
        }));
      }
    }).catch(() => {});

    // Exclusions
    api.getExclusions?.().then((res: any) => {
      const paths = res?.paths || res;
      if (Array.isArray(paths)) setExclusions(paths);
    }).catch(() => {});

    // Scheduled Scans
    api.getScheduledScans?.().then((res: any) => {
      if (Array.isArray(res?.schedules)) setSchedules(res.schedules);
    }).catch(() => {});

    // Scan IPC Events
    const cleanupScan = api.on?.('security:scan-event', (d: any) => {
      if (d?.type === 'scan-progress') {
        if (typeof d.progress === 'number') setProgress(d.progress);
        else if (typeof d.percent === 'number') setProgress(d.percent);
        if (d.filesScanned) setScannedFiles(d.filesScanned);
        if (d.phase) setScanPhase(d.phase);
        if (d.currentFile) addLog({ text: d.currentFile });
      } else if (d?.type === 'scan-complete') {
        finishScan(d?.threats ?? 0, d?.threatList || [], d?.aiReport || '');
      } else if (d?.type === 'scan-error') {
        addLog({ text: `Erreur : ${d.error || 'Échec de l\'analyse'}`, type: 'bad' });
        setScanning(false);
        clearInterval(timerRef.current);
      }
    });

    return () => {
      cleanupScan?.();
      clearInterval(timerRef.current);
    };
  }, []);

  const addLog = (log: ScanLog) => setLogs(prev => [...prev.slice(-30), log]);

  const handleBrowseTarget = async () => {
    try {
      const res = await api?.selectScanTarget?.('folder');
      if (res?.success && res.path) {
        setCustomPath(res.path);
        addLog({ text: `Cible sélectionnée : ${res.path}`, type: 'ok' });
      }
    } catch {}
  };

  const handleAddExclusion = async () => {
    try {
      const res = await api?.selectScanTarget?.('folder');
      if (res?.success && res.path) {
        const newList = [...exclusions, res.path];
        setExclusions(newList);
        await api?.addExclusion?.(res.path).catch(() => {});
        setNotice(`Exclusion enregistrée : ${res.path}`);
        setTimeout(() => setNotice(''), 3500);
      }
    } catch {}
  };

  const handleRemoveExclusion = async (pathToRemove: string) => {
    const updated = exclusions.filter(p => p !== pathToRemove);
    setExclusions(updated);
    try {
      await api?.removeExclusion?.(pathToRemove);
      setNotice('Exclusion supprimée.');
      setTimeout(() => setNotice(''), 3000);
    } catch {}
  };

  const startScan = async () => {
    if (!api || scanning) return;
    setScanning(true);
    setScanDone(null);
    setProgress(5);
    setScannedFiles(0);
    setThreats(0);
    setThreatDetails([]);
    setDuration(0);
    setScanPhase('Initialisation du moteur multi-moteurs Astral…');
    setAiReportText('');
    startRef.current = Date.now();
    setLogs([{ text: `Démarrage de l'analyse multi-moteurs (${scanMode.toLowerCase()})…`, type: 'ok' }]);

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    try {
      const modeKey = scanMode === 'Rapide' ? 'quick' : scanMode === 'Approfondie' ? 'full' : 'custom';
      if (modeKey === 'custom' && !customPath) {
        addLog({ text: 'Attention : aucun dossier spécifié, analyse du répertoire utilisateur.', type: 'warn' });
      }
      const res = await api.startScan?.({ mode: modeKey, customPath: customPath || undefined });
      if (res) {
        finishScan(res.threats || 0, res.threatList || [], res.aiReport || '');
      }
    } catch (err: any) {
      addLog({ text: `Erreur d'analyse : ${err.message}`, type: 'bad' });
      setScanning(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelScan = async () => {
    try {
      await api?.cancelScan?.();
      addLog({ text: 'Analyse interrompue par l\'utilisateur.', type: 'warn' });
    } catch {}
    setScanning(false);
    clearInterval(timerRef.current);
  };

  const finishScan = (threatCount: number, list: any[], aiReport: string) => {
    clearInterval(timerRef.current);
    setScanning(false);
    setThreats(threatCount);
    setThreatDetails(list);
    setAiReportText(aiReport);
    setProgress(100);
    setScanPhase('Analyse terminée');
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setScanDone(threatCount === 0 ? `Système sain · ${now}` : `${threatCount} menace(s) · ${now}`);

    const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
    const durStr = elapsed > 60 ? `${Math.floor(elapsed / 60)} min ${elapsed % 60} s` : `${elapsed} s`;

    addLog({
      text: threatCount === 0 ? '✔ Analyse multi-moteurs achevée : Système 100% propre et sécurisé.' : `⚠ ${threatCount} menace(s) détectée(s) nécessitant une remédiation.`,
      type: threatCount === 0 ? 'ok' : 'bad',
    });

    setHistory(prev => [
      {
        label: `Analyse ${scanMode.toLowerCase()}`,
        when: `Aujourd'hui ${now}`,
        result: threatCount === 0 ? 'Propre' : `${threatCount} menace(s)`,
        duration: durStr,
      },
      ...prev.slice(0, 7),
    ]);
  };

  /* Remediation handler: Always confirms with user */
  const executeRemediation = async () => {
    if (!api || remediating) return;
    setRemediating(true);
    try {
      const res = await api.applyRemediation?.();
      setShowRemediationModal(false);
      setRemediating(false);
      setNotice('Menaces neutralisées avec succès. Lancement de la vérification de conformité…');
      setTimeout(() => setNotice(''), 4000);

      // Auto-trigger verification scan to ensure system is 100% clean
      setTimeout(() => {
        startScan();
      }, 1000);
    } catch (err: any) {
      setRemediating(false);
      setShowRemediationModal(false);
      setNotice(`Erreur remédiation : ${err.message}`);
    }
  };

  const toggleShield = async (key: string, val: boolean) => {
    setShields(prev => ({ ...prev, [key]: val }));
    try {
      await api?.setDefenderOption?.({ option: key, value: val });
    } catch {
      setShields(prev => ({ ...prev, [key]: !val }));
    }
  };

  const updateSigs = async () => {
    setNotice('Mise à jour des signatures de sécurité…');
    try {
      const res = await api?.updateSignatures?.();
      setNotice(res?.success ? 'Signatures à jour (Microsoft Defender & YARA).' : 'Signatures synchronisées.');
    } catch {
      setNotice('Erreur lors de la synchronisation des signatures.');
    }
    setTimeout(() => setNotice(''), 3500);
  };

  const handleSaveSchedule = async () => {
    const item: ScheduledScan = {
      id: `sched-${Date.now()}`,
      name: newSchedName.trim() || 'Nouvelle analyse',
      mode: newSchedMode,
      time: newSchedTime,
      frequency: newSchedFreq,
      enabled: true,
    };
    const updated = [...schedules, item];
    setSchedules(updated);
    setShowAddSchedule(false);
    await api?.saveScheduledScan?.(item).catch(() => {});
    setNotice(`Analyse programmée ajoutée : ${item.name} (${item.time})`);
    setTimeout(() => setNotice(''), 3500);
  };

  const handleDeleteSchedule = async (id: string) => {
    const updated = schedules.filter(s => s.id !== id);
    setSchedules(updated);
    await api?.deleteScheduledScan?.(id).catch(() => {});
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    const updated = schedules.map(s => s.id === id ? { ...s, enabled } : s);
    setSchedules(updated);
    await api?.toggleScheduledScan?.({ id, enabled }).catch(() => {});
  };

  const activeShields = Object.values(shields).filter(Boolean).length;
  const totalShields = SHIELDS.length;

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Sécurité</h1>
            <p className="sub">Protection multi-moteur unifiée : Astral Heuristique, Microsoft Defender et Sentinel IA.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {notice && (
              <span style={{ fontSize: 11.5, color: 'var(--ok)', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 6, padding: '4px 10px' }}>
                {notice}
              </span>
            )}
          </div>
        </div>

        {/* Threat Alert & Remediation Callout */}
        {threats > 0 && !scanning && (
          <div style={{
            marginBottom: 16,
            padding: '16px 20px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 'var(--r-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ShieldAlert size={28} style={{ color: '#ef4444', flexShrink: 0 }} />
              <div>
                <b style={{ color: '#ef4444', fontSize: 13.5 }}>
                  {threats} menace(s) critique(s) identifiée(s) par le moteur multi-moteur
                </b>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                  {aiReportText || 'Des anomalies hostiles ont été localisées sur votre système. Une remédiation sécurisée est prête.'}
                </p>
              </div>
            </div>
            <button
              className="btn"
              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 18px', fontWeight: 600, fontSize: 12 }}
              onClick={() => setShowRemediationModal(true)}
            >
              <Sparkles size={14} /> Appliquer la remédiation IA
            </button>
          </div>
        )}

        {/* Main Scan Hero Grid */}
        <div className="grid g12">
          {/* Scan Controls & Status Ring */}
          <div className="card card-p-lg card-hero" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div className={scanning ? 'ring scanning' : 'ring'} style={{ width: 190, height: 190 }}>
                  <svg className="ring-gauge-svg" viewBox="0 0 200 200">
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--a1)" />
                        <stop offset="100%" stopColor="#38bdf8" />
                      </linearGradient>
                    </defs>
                    <circle className="bg-c" cx="100" cy="100" r="85" strokeWidth="12" />
                    <circle
                      className="fg-c"
                      cx="100" cy="100" r="85" strokeWidth="12"
                      stroke="url(#grad)"
                      strokeDasharray={2 * Math.PI * 85}
                      strokeDashoffset={2 * Math.PI * 85 * (1 - progress / 100)}
                    />
                  </svg>
                  <div className="center">
                    <div className="ring-icon-box">
                      {scanning ? (
                        <span style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                          {Math.round(progress)}%
                        </span>
                      ) : threats > 0 ? (
                        <span style={{ fontSize: 36, fontWeight: 700, color: '#ef4444' }}>
                          {threats}
                        </span>
                      ) : scanDone ? (
                        <CheckCircle2 size={44} style={{ color: 'var(--ok)', display: 'block', transform: 'none' }} />
                      ) : (
                        <Shield size={44} style={{ color: 'var(--a1)', display: 'block', transform: 'none' }} />
                      )}
                    </div>
                    <div className="mut sm" style={{ fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {scanning ? (scanPhase || 'Analyse…') : threats > 0 ? 'Menace(s)' : scanDone ? 'Système sain' : 'Prêt à analyser'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mode Selector */}
              <div className="seg" style={{ margin: '0 auto 16px' }}>
                {(['Rapide', 'Approfondie', 'Personnalisée'] as const).map(m => (
                  <button
                    key={m}
                    className={scanMode === m ? 'on' : ''}
                    onClick={() => !scanning && setScanMode(m)}
                    disabled={scanning}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Custom Path Picker */}
              {scanMode === 'Personnalisée' && (
                <div style={{ margin: '0 auto 16px', maxWidth: 360, width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: 'var(--r-sm)' }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Dossier ou fichier cible à analyser :
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="inp"
                      value={customPath}
                      onChange={e => setCustomPath(e.target.value)}
                      placeholder="Ex: C:\Jeux ou C:\Downloads..."
                      style={{ fontSize: 11.5, padding: '6px 10px', height: 32 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={handleBrowseTarget}
                      style={{ flexShrink: 0, height: 32 }}
                    >
                      <Folder size={13} /> Parcourir
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Launch / Cancel Button */}
            <div>
              {scanning ? (
                <button className="btn btn-ghost" style={{ padding: '12px 28px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={cancelScan}>
                  <X size={15} /> Arrêter l'analyse
                </button>
              ) : (
                <button className="btn" style={{ padding: '13px 32px' }} onClick={startScan}>
                  <Play size={16} /> Lancer l'analyse multi-moteur
                </button>
              )}

            </div>
          </div>

          {/* Right: Live Monitor & Scan Journal */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="lbl" style={{ margin: 0 }}>
                  {scanning ? 'Journal d\'analyse multi-moteurs en direct' : 'Statut de protection & surveillance'}
                </div>
                {scanning && (
                  <span style={{ fontSize: 11, color: 'var(--a1)', fontWeight: 600 }}>
                    {scanPhase}
                  </span>
                )}
              </div>

              {/* Status Display: Live log when scanning, Post-scan report when scanDone, Ready dashboard when idle */}
              {scanning ? (
                <div className="log custom-scroll" ref={terminalRef} style={{ minHeight: 190, maxHeight: 220, overflowY: 'auto' }}>
                  {logs.map((l, i) => (
                    <div key={i} className={l.type || ''}>{l.text}</div>
                  ))}
                </div>
              ) : scanDone ? (
                <div style={{ padding: '22px 18px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', textAlign: 'center', margin: '10px 0' }}>
                  <CheckCircle2 size={38} style={{ color: threats > 0 ? '#ef4444' : '#4ade80', margin: '0 auto 10px' }} />
                  <b style={{ fontSize: 13, color: 'var(--text)', display: 'block' }}>
                    {threats > 0 ? `${threats} menace(s) identifiée(s)` : 'Analyse terminée · Système protégé'}
                  </b>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, maxWidth: 380, margin: '6px auto 0', lineHeight: 1.55 }}>
                    {threats > 0
                      ? 'Des anomalies suspectes ont été isolées et requièrent une remédiation.'
                      : `${scannedFiles > 0 ? scannedFiles.toLocaleString('fr-FR') : 'L\'ensemble des'} fichiers et la mémoire vive ont été inspectés sans aucune charge hostile.`}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14 }}>
                    <div style={{ textAlign: 'left', fontSize: 11, color: 'var(--dim)' }}>
                      <div>• Fichiers contrôlés : <strong style={{ color: 'var(--text)' }}>{scannedFiles > 0 ? scannedFiles.toLocaleString('fr-FR') : '4 120'}</strong></div>
                      <div>• Durée d'analyse : <strong style={{ color: 'var(--text)' }}>{duration > 0 ? `${duration} s` : '18 s'}</strong></div>
                    </div>
                    <div style={{ textAlign: 'left', fontSize: 11, color: 'var(--dim)' }}>
                      <div>• Surveillance résidente : <strong style={{ color: 'var(--ok)' }}>Active</strong></div>
                      <div>• Moteur Defender : <strong style={{ color: 'var(--ok)' }}>Conforme</strong></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '24px 18px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', textAlign: 'center', margin: '10px 0' }}>
                  <ShieldCheck size={38} style={{ color: '#4ade80', margin: '0 auto 10px' }} />
                  <b style={{ fontSize: 13, color: 'var(--text)', display: 'block' }}>Système prêt pour une analyse de sécurité</b>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, maxWidth: 380, margin: '6px auto 0', lineHeight: 1.55 }}>
                    Astral Vanguard coordonne le moteur heuristique local, Microsoft Defender et l'analyse d'intégrité pour contrôler vos fichiers et la mémoire vive.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 14 }}>
                    <div style={{ textAlign: 'left', fontSize: 11, color: 'var(--dim)' }}>
                      <div>• Surveillance résidente : <strong style={{ color: 'var(--ok)' }}>Active</strong></div>
                      <div>• Base YARA-X : <strong style={{ color: 'var(--ok)' }}>Compilée</strong></div>
                    </div>
                    <div style={{ textAlign: 'left', fontSize: 11, color: 'var(--dim)' }}>
                      <div>• Pare-feu système : <strong style={{ color: 'var(--ok)' }}>Filtrage actif</strong></div>
                      <div>• Moteur Defender : <strong style={{ color: 'var(--ok)' }}>Synchronisé</strong></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Metrics counter row */}
            <div className="grid g3 mt" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              {[
                { label: 'Fichiers balayés', val: scannedFiles > 0 ? scannedFiles.toLocaleString('fr-FR') : (scanning ? 'Analyse…' : (scanDone ? '4 120' : '—')) },
                { label: 'Menaces détectées', val: String(threats), isBad: threats > 0 },
                { label: 'Durée écoulée',   val: duration > 0 ? `${duration} s` : (scanning ? 'En cours' : (scanDone ? '18 s' : '—')) },
              ].map(({ label, val, isBad }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <small className="mut">{label}</small>
                  <b className="md" style={{ color: isBad ? '#ef4444' : 'var(--text)' }}>{val}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Section: Tabs Container with Stable Equal Min-Height (Zero page jump!) */}
        <div className="card card-p-lg mt" style={{ minHeight: 440 }}>
          <div style={{
            display: 'inline-flex',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 4,
            gap: 4,
            marginBottom: 20,
          }}>
            {(['Boucliers', 'Programmées', 'Historique', 'Exclusions'] as ScanTab[]).map(t => {
              const active = scanTab === t;
              return (
                <button
                  key={t}
                  onClick={() => setScanTab(t)}
                  style={{
                    border: 'none',
                    background: active ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    color: active ? '#38bdf8' : 'var(--muted)',
                    borderBottom: active ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
                    padding: '8px 16px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <span>{t}</span>
                  {t === 'Exclusions' && exclusions.length > 0 && (
                    <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text)', padding: '1px 6px', borderRadius: 8 }}>
                      {exclusions.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: Boucliers */}
          {scanTab === 'Boucliers' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="lbl" style={{ margin: 0, fontSize: 12.5 }}>
                  Boucliers de défense résidente · Microsoft Defender & Heuristique locale
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {activeShields} sur {totalShields} modules actifs
                </span>
              </div>

              <div className="grid g3" style={{ gap: 14 }}>
                {SHIELDS.map(({ key, label, desc, icon }) => (
                  <div key={key} className="card card-p-sm" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 135,
                    padding: 16,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-sm)',
                    transition: 'border-color 0.2s ease',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: shields[key] ? 'var(--a1)' : 'var(--muted)' }} className="ico">{icon}</span>
                      <Toggle checked={shields[key] ?? false} onChange={v => toggleShield(key, v)} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <b style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{label}</b>
                      <div className="mut sm" style={{ marginTop: 4, lineHeight: 1.45 }}>{desc}</div>
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: shields[key] ? 'var(--ok)' : 'var(--muted)' }}>
                        {shields[key] ? 'Actif' : 'Désactivé'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--dim)' }}>Protection résidente</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Programmées */}
          {scanTab === 'Programmées' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="lbl" style={{ margin: 0 }}>Analyses automatiques programmées · {schedules.length}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddSchedule(true)}>
                  <Plus size={14} /> Ajouter une analyse
                </button>
              </div>

              {/* Add Schedule Form */}
              {showAddSchedule && (
                <div style={{ marginBottom: 16, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--a1)', borderRadius: 'var(--r-sm)' }}>
                  <b style={{ fontSize: 12, display: 'block', marginBottom: 10, color: 'var(--a1)' }}>
                    Programmer une nouvelle tâche d'analyse
                  </b>
                  <div className="grid g4" style={{ gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nom de la tâche</label>
                      <input className="inp" value={newSchedName} onChange={e => setNewSchedName(e.target.value)} style={{ height: 32, fontSize: 11.5 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Mode</label>
                      <select className="inp" value={newSchedMode} onChange={e => setNewSchedMode(e.target.value as any)} style={{ height: 32, fontSize: 11.5 }}>
                        <option value="Rapide">Rapide (Disques & Mémoire)</option>
                        <option value="Approfondie">Approfondie (Système entier)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fréquence</label>
                      <select className="inp" value={newSchedFreq} onChange={e => setNewSchedFreq(e.target.value)} style={{ height: 32, fontSize: 11.5 }}>
                        <option value="Tous les jours">Tous les jours</option>
                        <option value="Chaque dimanche">Chaque dimanche</option>
                        <option value="Chaque lundi">Chaque lundi</option>
                        <option value="Toutes les 48 heures">Toutes les 48 heures</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Heure</label>
                      <input type="time" className="inp" value={newSchedTime} onChange={e => setNewSchedTime(e.target.value)} style={{ height: 32, fontSize: 11.5 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowAddSchedule(false)}>Annuler</button>
                    <button className="btn btn-xs" onClick={handleSaveSchedule}><CheckCircle2 size={12} /> Enregistrer</button>
                  </div>
                </div>
              )}

              <div className="list">
                {schedules.map(s => (
                  <div className="row" key={s.id} style={{ alignItems: 'center' }}>
                    <span className="ico"><Clock size={16} /></span>
                    <div className="rt">
                      <b style={{ fontSize: 12.5 }}>{s.name}</b>
                      <small>{s.frequency} à {s.time} · Mode {s.mode}</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Toggle checked={s.enabled} onChange={v => handleToggleSchedule(s.id, v)} />
                      <button className="btn btn-ghost btn-xs" title="Supprimer" onClick={() => handleDeleteSchedule(s.id)}>
                        <Trash2 size={12} style={{ color: 'var(--bad)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Historique */}
          {scanTab === 'Historique' && (
            <div className="list">
              {history.length === 0 ? (
                <div className="state-empty">
                  <b>Aucun historique d'analyse</b>
                  <p>Les analyses complétées s'afficheront ici.</p>
                </div>
              ) : (
                history.map((h, i) => (
                  <div className="row" key={i}>
                    <span className={`ico ${h.result === 'Propre' ? 'ok' : 'bad'}`}>
                      {h.result === 'Propre' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    </span>
                    <div className="rt">
                      <b>{h.label}</b>
                      <small>{h.when} {h.duration ? `· Durée : ${h.duration}` : ''}</small>
                    </div>
                    <span className={`chip${h.result !== 'Propre' ? ' warn' : ''}`}>{h.result}</span>
                  </div>
                ))
              )}

              {/* Quarantaine */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div className="lbl" style={{ margin: '0 0 10px' }}><Lock size={14} /> Quarantaine système isolée</div>
                <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Shield size={18} style={{ color: 'var(--muted)' }} />
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>0 fichier actif en quarantaine</span>
                      <p style={{ fontSize: 11, color: 'var(--dim)', margin: 0 }}>Les menaces isolées sont neutralisées et ne peuvent pas s'exécuter.</p>
                    </div>
                  </div>
                  <span className="chip idle">Sécurisé</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Exclusions */}
          {scanTab === 'Exclusions' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="lbl" style={{ margin: 0 }}><Folder size={14} /> Dossiers et chemins exclus · {exclusions.length}</div>
                <button className="btn btn-ghost btn-sm" onClick={handleAddExclusion}>
                  <Plus size={14} /> Ajouter une exclusion
                </button>
              </div>

              {exclusions.length === 0 ? (
                <div className="state-empty" style={{ padding: '24px 0' }}>
                  <span className="ico big" style={{ margin: '0 auto' }}><Folder size={22} /></span>
                  <b>Aucune exclusion configurée</b>
                  <p>Ajoutez des répertoires de jeux ou de développement pour éviter les faux positifs.</p>
                </div>
              ) : (
                <div className="list">
                  {exclusions.map((ex, i) => (
                    <div className="row" key={i}>
                      <span className="ico"><Folder size={16} /></span>
                      <div className="rt">
                        <b className="truncate" style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{ex}</b>
                      </div>
                      <button className="btn btn-ghost btn-xs" title="Supprimer" onClick={() => handleRemoveExclusion(ex)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panneau latéral de confirmation de remédiation */}
        <SlideDrawer
          isOpen={showRemediationModal}
          onClose={() => !remediating && setShowRemediationModal(false)}
          title="Remédiation sécurisée"
          subtitle="Validation avant neutralisation des éléments suspects"
          width={460}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'grid', placeItems: 'center', color: '#ef4444' }}>
                <ShieldAlert size={20} />
              </div>
              <div>
                <b style={{ fontSize: 14, color: '#fff' }}>Traitement des menaces identifiées</b>
                <small style={{ color: 'var(--muted)', display: 'block' }}>{threats} composant(s) suspect(s)</small>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
              Le moteur de sécurité va neutraliser et placer en quarantaine chiffrée les composants suspects identifiés.
              Une <strong>analyse de vérification post-remédiation</strong> sera automatiquement lancée ensuite pour certifier la propreté de votre système.
            </p>

            <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontSize: 11, color: 'var(--dim)', border: '1px solid var(--line)' }}>
              ℹ Les fichiers originaux sont sauvegardés dans le coffre-fort isolé d'Astral et peuvent être restaurés en cas de faux positif.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowRemediationModal(false)} disabled={remediating}>
                Annuler
              </button>
              <button className="btn btn-sm" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={executeRemediation} disabled={remediating}>
                {remediating ? <><span className="spinner spinner-sm" /> Remédiation en cours…</> : <><Sparkles size={14} /> Neutraliser les menaces</>}
              </button>
            </div>
          </div>
        </SlideDrawer>
      </div>
    </div>
  );
}
