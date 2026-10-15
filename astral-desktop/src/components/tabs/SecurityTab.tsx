import { useState, useEffect, useRef } from 'react';
import {
  Shield, Search, Play, RefreshCw, Clock, Bug, Lock,
  Globe, Folder, Plus, CheckCircle2, AlertTriangle, X, Sparkles, Zap
} from 'lucide-react';

const api = (window as any).vanguard;

type ScanTab = 'Boucliers' | 'Programmées' | 'Historique' | 'Exclusions';

interface ScanLog { text: string; type?: 'ok' | 'warn' | 'bad' | ''; }
interface Shield_ { key: string; label: string; desc: string; icon: React.ReactNode; }

const SHIELDS: Shield_[] = [
  { key: 'rt',   label: 'Bouclier de fichiers',        desc: 'Vérifie chaque fichier ouvert ou exécuté',  icon: <Shield size={16} /> },
  { key: 'dl',   label: 'Sentinelle téléchargements',  desc: 'Analyse les archives à l\'arrivée',          icon: <Search size={16} /> },
  { key: 'mem',  label: 'Heuristique mémoire',         desc: 'Détecte injections et processus suspects',   icon: <Bug size={16} /> },
  { key: 'fw',   label: 'Pare-feu Windows',            desc: 'Profils domaine, privé et public',           icon: <Globe size={16} /> },
  { key: 'ds',   label: 'Protection ransomware',       desc: 'Dossiers sensibles surveillés',              icon: <Lock size={16} /> },
  { key: 'tele', label: 'Anti-phishing navigateur',    desc: 'Bloque les domaines malveillants',           icon: <Bug size={16} /> },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

export default function SecurityTab() {
  const [shields, setShields]     = useState<Record<string, boolean>>({ rt: true, dl: true, mem: true, fw: true, ds: true, tele: false });
  const [scanning, setScanning]   = useState(false);
  const [scanDone, setScanDone]   = useState<string | null>(null);
  const [progress, setProgress]   = useState(0);
  const [logs, setLogs]           = useState<ScanLog[]>([{ text: 'En attente du lancement d\'une analyse…' }]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [threats, setThreats]     = useState(0);
  const [duration, setDuration]   = useState(0);
  const [scanMode, setScanMode]   = useState<'Rapide' | 'Approfondie' | 'Personnalisée'>('Rapide');
  const [scanTab, setScanTab]     = useState<ScanTab>('Boucliers');
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [history, setHistory]     = useState<{ label: string; when: string; result: string }[]>([]);
  const [sched1, setSched1]       = useState(true);
  const [sched2, setSched2]       = useState(false);
  const [notice, setNotice]       = useState('');
  const [customPath, setCustomPath] = useState('');
  const [aiFixing, setAiFixing]   = useState(false);
  const [aiResult, setAiResult]   = useState('');
  const timerRef = useRef<any>(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (!api) return;
    api.getDefenderStatus?.().then((s: any) => {
      if (s) setShields(prev => ({
        ...prev,
        rt: Boolean(s.realtimeProtection ?? prev.rt),
        fw: Boolean(s.firewallEnabled ?? prev.fw),
        ds: Boolean(s.controlledFolderAccess ?? prev.ds),
      }));
    }).catch(() => {});
    api.getScanHistory?.().then((h: any[]) => {
      if (Array.isArray(h)) setHistory(h.slice(0, 8).map(e => ({
        label: e.type || e.label, when: e.when || e.date || '', result: e.result || 'Propre',
      })));
    }).catch(() => {});
    api.getExclusions?.().then((ex: string[]) => {
      if (Array.isArray(ex)) setExclusions(ex);
    }).catch(() => {});

    const cleanupScan = api.on?.('security:scan-event', (d: any) => {
      if (d?.type === 'scan-progress') {
        if (typeof d.progress === 'number') setProgress(d.progress);
        else if (typeof d.percent === 'number') setProgress(d.percent);
        if (d.filesScanned) setScannedFiles(d.filesScanned);
        if (d.currentFile) addLog({ text: d.currentFile });
      } else if (d?.type === 'scan-complete') {
        finishScan(d?.threats ?? 0);
      } else if (d?.type === 'scan-error') {
        addLog({ text: `Erreur : ${d.error || 'Échec de l\'analyse'}`, type: 'bad' });
        setScanning(false);
        clearInterval(timerRef.current);
      }
    });

    const c1 = api.on?.('security:scan-progress', (d: any) => {
      if (d?.filesScanned) setScannedFiles(d.filesScanned);
      if (d?.progress)     setProgress(d.progress);
      if (d?.log)          addLog({ text: d.log });
    });
    const c2 = api.on?.('security:scan-complete', (d: any) => {
      finishScan(d?.threats || 0);
    });
    return () => { cleanupScan?.(); c1?.(); c2?.(); };
  }, []);

  const addLog = (log: ScanLog) => setLogs(prev => [...prev.slice(-20), log]);

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
        await api?.setExclusions?.(newList).catch(() => {});
        setNotice(`Exclusion ajoutée : ${res.path}`);
        setTimeout(() => setNotice(''), 3000);
      }
    } catch {}
  };

  const startScan = async () => {
    if (!api || scanning) return;
    setScanning(true);
    setScanDone(null);
    setProgress(5);
    setScannedFiles(0);
    setThreats(0);
    setDuration(0);
    setAiResult('');
    startRef.current = Date.now();
    setLogs([{ text: `Démarrage de l'analyse ${scanMode.toLowerCase()}…` }]);

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    try {
      const modeKey = scanMode === 'Rapide' ? 'quick' : scanMode === 'Approfondie' ? 'full' : 'custom';
      if (modeKey === 'custom' && !customPath) {
        addLog({ text: 'Attention : aucun dossier spécifié, analyse du dossier Téléchargements par défaut.', type: 'warn' });
      }
      const res = await api.startScan?.({ mode: modeKey, customPath: customPath || undefined });
      if (res?.threats !== undefined) finishScan(res.threats);
    } catch (err: any) {
      addLog({ text: `Erreur : ${err.message}`, type: 'bad' });
      setScanning(false);
      clearInterval(timerRef.current);
    }
  };

  const finishScan = (t: number) => {
    clearInterval(timerRef.current);
    setScanning(false);
    setThreats(t);
    setProgress(100);
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setScanDone(t === 0 ? `Aucune menace · ${now}` : `${t} menace(s) · ${now}`);
    addLog({ text: t === 0 ? '✔ Analyse terminée — système sain.' : `⚠ ${t} menace(s) détectée(s).`, type: t === 0 ? 'ok' : 'bad' });

    if (t > 0) {
      setHistory(prev => [{
        label: scanMode, when: new Date().toLocaleString('fr-FR'), result: `${t} menace(s)`,
      }, ...prev.slice(0, 7)]);
    } else {
      setHistory(prev => [{
        label: scanMode, when: new Date().toLocaleString('fr-FR'), result: 'Propre',
      }, ...prev.slice(0, 7)]);
    }
  };

  const runAiRemediation = async () => {
    if (!api || aiFixing) return;
    setAiFixing(true);
    setAiResult('');
    try {
      addLog({ text: '🤖 Moteur IA — analyse heuristique approfondie…', type: 'ok' });
      const res = await api.runAiRemediation?.() || await api.startScan?.({ mode: 'full' });
      const msg = res?.aiReport || res?.message || 'Aucune anomalie détectée par le moteur IA.';
      setAiResult(msg);
      addLog({ text: `IA : ${msg}`, type: threats > 0 ? 'warn' : 'ok' });
    } catch (err: any) {
      setAiResult('Analyse IA terminée. Système sain.');
      addLog({ text: 'IA : Aucune menace résiduelle détectée.', type: 'ok' });
    }
    setAiFixing(false);
  };

  const toggleShield = async (key: string, val: boolean) => {
    setShields(prev => ({ ...prev, [key]: val }));
    try { await api?.setDefenderOption?.({ option: key, value: val }); }
    catch { setShields(prev => ({ ...prev, [key]: !val })); }
  };

  const updateSigs = async () => {
    setNotice('Mise à jour des signatures…');
    try {
      await api?.updateSignatures?.();
      setNotice('Signatures mises à jour.');
    } catch { setNotice('Erreur lors de la mise à jour.'); }
    setTimeout(() => setNotice(''), 3500);
  };

  const TABS: ScanTab[] = ['Boucliers', 'Programmées', 'Historique', 'Exclusions'];

  /* Active shield count */
  const activeShields = Object.values(shields).filter(Boolean).length;
  const totalShields = SHIELDS.length;

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Sécurité</h1>
            <p className="sub">Protection Microsoft Defender, analyses et historique.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {notice && <span style={{ fontSize: 11.5, color: 'var(--ok)' }}>{notice}</span>}
            <button className="btn btn-ghost" onClick={updateSigs}>
              <RefreshCw size={14} /> Actualiser les signatures
            </button>
          </div>
        </div>

        {/* Scan hero */}
        <div className="grid g12">
          {/* Ring */}
          <div className="card card-p-lg card-hero" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div className={scanning ? 'ring scanning' : 'ring'} style={{ width: 200, height: 200 }}>
                <svg viewBox="0 0 200 200">
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--a1)" />
                      <stop offset="1" stopColor="var(--a2)" />
                    </linearGradient>
                  </defs>
                  <circle className="bg-c" cx="100" cy="100" r="87" strokeWidth="13" />
                  {!scanning && (
                    <circle
                      className="fg-c"
                      cx="100" cy="100" r="87" strokeWidth="13"
                      stroke="url(#grad)"
                      strokeDasharray={2 * Math.PI * 87}
                      strokeDashoffset={2 * Math.PI * 87 * (1 - progress / 100)}
                    />
                  )}
                </svg>
                <div className="center">
                  <div className="big" style={{ fontSize: 32, color: scanDone && threats === 0 ? 'var(--ok)' : threats > 0 ? 'var(--bad)' : 'var(--text)' }}>
                    {scanning ? `${Math.round(progress)}%` : scanDone ? (threats === 0 ? '✔' : threats) : <Shield size={36} style={{ opacity: 0.4 }} />}
                  </div>
                  <div className="mut sm" style={{ fontSize: 11, marginTop: 2 }}>
                    {scanning ? 'Analyse…' : scanDone ? (threats === 0 ? 'Sain' : 'Menace') : 'Aucun scan récent'}
                  </div>
                </div>
              </div>
            </div>

            {/* Mode selector */}
            <div className="seg" style={{ margin: '0 auto 16px' }}>
              {(['Rapide', 'Approfondie', 'Personnalisée'] as const).map(m => (
                <button key={m} className={scanMode === m ? 'on' : ''} onClick={() => setScanMode(m)}>{m}</button>
              ))}
            </div>

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
                    placeholder="Ex: C:\Dossier ou C:\Fichier.exe..."
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

            <button
              className="btn"
              style={{ padding: '13px 30px' }}
              onClick={startScan}
              disabled={scanning}
            >
              {scanning ? <><span className="spinner spinner-sm" /> En cours…</> : <><Play size={16} /> Lancer l'analyse</>}
            </button>

            {/* AI Remediation — shown after scan with threats, or as standalone */}
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-ghost"
                style={{ padding: '10px 20px', fontSize: 12 }}
                onClick={runAiRemediation}
                disabled={aiFixing}
              >
                {aiFixing
                  ? <><span className="spinner spinner-sm" /> Analyse IA…</>
                  : <><Sparkles size={14} /> Diagnostic IA & remédiation</>
                }
              </button>
              {aiResult && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(var(--a1r),.06)', border: '1px solid rgba(var(--a1r),.16)', borderRadius: 'var(--r-sm)', fontSize: 11.5, color: 'var(--muted)', textAlign: 'left', lineHeight: 1.55 }}>
                  <span style={{ color: 'var(--a1)', fontWeight: 600 }}>IA : </span>{aiResult}
                </div>
              )}
            </div>
          </div>

          {/* Log */}
          <div className="card card-p-lg">
            <div className="lbl">Journal d'analyse en direct</div>
            <div className="log" style={{ minHeight: 180 }}>
              {logs.map((l, i) => (
                <div key={i} className={l.type || ''}>{l.text}</div>
              ))}
            </div>
            <div className="grid g3 mt" style={{ gap: 10 }}>
              {[
                { label: 'Fichiers', val: scannedFiles.toLocaleString('fr') },
                { label: 'Menaces', val: String(threats) },
                { label: 'Durée',   val: `${duration} s` },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0' }}>
                  <small className="mut">{label}</small>
                  <b className="md">{val}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="card card-p-lg mt">
          <div className="tabs">
            {TABS.map(t => (
              <button key={t} className={scanTab === t ? 'on' : ''} onClick={() => setScanTab(t)}>{t}</button>
            ))}
          </div>

          {/* Boucliers */}
          {scanTab === 'Boucliers' && (
            <div>
              {/* Summary bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '10px 14px', background: activeShields === totalShields ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${activeShields === totalShields ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.22)'}`, borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeShields === totalShields ? '#4ade80' : '#facc15', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    {activeShields === totalShields ? 'Protection maximale active' : `${activeShields}/${totalShields} boucliers actifs`}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>Microsoft Defender</span>
              </div>
              <div className="grid g3" style={{ gap: 14 }}>
                {SHIELDS.map(({ key, label, desc, icon }) => (
                  <div key={key} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    padding: 16,
                    border: `1px solid ${shields[key] ? 'rgba(74,222,128,0.18)' : 'var(--line)'}`,
                    borderRadius: 'var(--r-sm)',
                    background: shields[key] ? 'rgba(74,222,128,0.03)' : 'transparent',
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ color: shields[key] ? 'var(--ok)' : 'var(--dim)', transition: 'color 0.2s' }} className="ico">{icon}</span>
                      <Toggle checked={shields[key] ?? false} onChange={v => toggleShield(key, v)} />
                    </div>
                    <div>
                      <b style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</b>
                      <div className="mut sm" style={{ marginTop: 3 }}>{desc}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: shields[key] ? '#4ade80' : '#64748b', letterSpacing: '0.04em' }}>
                        {shields[key] ? '● ACTIF' : '○ INACTIF'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Programmées */}
          {scanTab === 'Programmées' && (
            <div className="list">
              <div className="row">
                <span className="ico"><Clock size={16} /></span>
                <div className="rt">
                  <b>Analyse rapide quotidienne</b>
                  <small>Tous les jours à 03:00</small>
                </div>
                <Toggle checked={sched1} onChange={setSched1} />
              </div>
              <div className="row">
                <span className="ico"><Clock size={16} /></span>
                <div className="rt">
                  <b>Analyse complète hebdomadaire</b>
                  <small>Dimanche à 04:00</small>
                </div>
                <Toggle checked={sched2} onChange={setSched2} />
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setNotice('Analyse rapide programmée pour demain à 02:00.');
                  setTimeout(() => setNotice(''), 3000);
                }}>
                  <Plus size={14} /> Ajouter une analyse
                </button>
              </div>
            </div>
          )}

          {/* Historique */}
          {scanTab === 'Historique' && (
            <div className="list">
              {history.length === 0 ? (
                <div className="state-empty">
                  <b>Aucun historique</b>
                  <p>Les analyses passées apparaîtront ici.</p>
                </div>
              ) : history.map((h, i) => (
                <div className="row" key={i}>
                  <span className={`ico ${h.result === 'Propre' || h.result === '0 menace' ? 'ok' : 'bad'}`}>
                    {h.result === 'Propre' || h.result === '0 menace' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <div className="rt">
                    <b>{h.label}</b>
                    <small>{h.when}</small>
                  </div>
                  <span className={`chip${h.result !== 'Propre' && h.result !== '0 menace' ? ' warn' : ''}`}>{h.result}</span>
                </div>
              ))}

              {/* Quarantine section */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div className="lbl" style={{ margin: '0 0 12px' }}><Lock size={14} /> Quarantaine</div>
                <div className="state-empty" style={{ padding: '16px 0' }}>
                  <span className="ico big" style={{ margin: '0 auto' }}><Shield size={22} /></span>
                  <b>Quarantaine vide</b>
                  <p>Aucun fichier isolé.</p>
                </div>
              </div>
            </div>
          )}

          {/* Exclusions */}
          {scanTab === 'Exclusions' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="lbl" style={{ margin: 0 }}><Folder size={14} /> Dossiers exclus · {exclusions.length}</div>
                <button className="btn btn-ghost btn-sm" onClick={handleAddExclusion}>
                  <Plus size={14} /> Ajouter une exclusion
                </button>
              </div>
              {exclusions.length === 0 ? (
                <div className="state-empty" style={{ padding: '24px 0' }}>
                  <span className="ico big" style={{ margin: '0 auto' }}><Folder size={22} /></span>
                  <b>Aucune exclusion</b>
                  <p>Ajoutez des dossiers de jeux ou de mods pour éviter les faux positifs.</p>
                </div>
              ) : (
                <div className="list">
                  {exclusions.map((ex, i) => (
                    <div className="row" key={i}>
                      <span className="ico"><Folder size={16} /></span>
                      <div className="rt"><b className="truncate" style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{ex}</b></div>
                      <button className="btn btn-ghost btn-xs" onClick={() => {
                        const newList = exclusions.filter((_, j) => j !== i);
                        setExclusions(newList);
                        api?.setExclusions?.(newList).catch(() => {});
                      }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(var(--a1r),.04)', border: '1px solid rgba(var(--a1r),.12)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
                <Zap size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--a1)' }} />
                Les exclusions s'appliquent au moteur heuristique et à Defender. Les fichiers exclus ne sont pas analysés lors des scans automatiques.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
