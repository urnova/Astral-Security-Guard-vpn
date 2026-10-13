import { useState, useEffect, useRef } from 'react';
import {
  Shield, Search, Play, RefreshCw, Clock, Bug, Lock,
  Globe, Folder, Plus, CheckCircle2, AlertTriangle, X
} from 'lucide-react';

const api = (window as any).vanguard;

type ScanTab = 'Boucliers' | 'Programmées' | 'Historique' | 'Exclusions';

interface ScanLog { text: string; type?: 'ok' | 'warn' | 'bad' | ''; }
interface Shield_ { key: string; label: string; desc: string; icon: any; }

const SHIELDS: Shield_[] = [
  { key: 'rt',    label: 'Bouclier de fichiers',        desc: 'Vérifie chaque fichier ouvert ou exécuté', icon: <Shield size={18} /> },
  { key: 'dl',    label: 'Sentinelle téléchargements',  desc: 'Analyse dès qu\'une archive arrive',       icon: <Search size={18} /> },
  { key: 'mem',   label: 'Heuristique mémoire',         desc: 'Détecte injections et processus suspects', icon: <Bug size={18} /> },
  { key: 'fw',    label: 'Pare-feu Windows',            desc: 'Profils domaine, privé et public',         icon: <Globe size={18} /> },
  { key: 'ds',    label: 'Protection ransomware',       desc: 'Dossiers sensibles surveillés',             icon: <Lock size={18} /> },
  { key: 'tele',  label: 'Anti-phishing navigateur',    desc: 'Bloque les domaines malveillants',          icon: <Bug size={18} /> },
];

function Ring({ size, val, children }: { size: number; val: number; children: React.ReactNode }) {
  const sw = 13;
  const r  = size / 2 - sw;
  const c  = 2 * Math.PI * r;
  const offset = c * (1 - val);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="bg-c" cx={size/2} cy={size/2} r={r} strokeWidth={sw} />
        <circle
          className="fg-c"
          cx={size/2} cy={size/2} r={r} strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

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

    const c1 = api.on?.('security:scan-progress', (d: any) => {
      if (d?.filesScanned) setScannedFiles(d.filesScanned);
      if (d?.progress)     setProgress(d.progress);
      if (d?.log)          addLog({ text: d.log });
    });
    const c2 = api.on?.('security:scan-complete', (d: any) => {
      finishScan(d?.threats || 0);
    });
    return () => { c1?.(); c2?.(); };
  }, []);

  const addLog = (log: ScanLog) => setLogs(prev => [...prev.slice(-15), log]);

  const startScan = async () => {
    if (!api || scanning) return;
    setScanning(true);
    setScanDone(null);
    setProgress(0);
    setScannedFiles(0);
    setThreats(0);
    setDuration(0);
    startRef.current = Date.now();
    setLogs([{ text: `Démarrage de l'analyse ${scanMode.toLowerCase()}…` }]);

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    try {
      const res = await api.startScan?.({ mode: scanMode.toLowerCase() });
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
  };

  const toggleShield = async (key: string, val: boolean) => {
    setShields(prev => ({ ...prev, [key]: val }));
    try { await api.setDefenderOption?.({ option: key, value: val }); }
    catch { setShields(prev => ({ ...prev, [key]: !val })); }
  };

  const updateSigs = async () => {
    setNotice('Mise à jour des signatures…');
    try {
      await api.updateSignatures?.();
      setNotice('Signatures mises à jour.');
    } catch { setNotice('Erreur lors de la mise à jour.'); }
    setTimeout(() => setNotice(''), 3500);
  };

  const TABS: ScanTab[] = ['Boucliers', 'Programmées', 'Historique', 'Exclusions'];

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
                    {scanning ? `${Math.round(progress)}%` : scanDone ? (threats === 0 ? '✔' : threats) : 'Prêt'}
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

            <button
              className="btn"
              style={{ padding: '13px 30px' }}
              onClick={startScan}
              disabled={scanning}
            >
              {scanning ? <><span className="spinner spinner-sm" /> En cours…</> : <><Play size={16} /> Lancer l'analyse</>}
            </button>
          </div>

          {/* Log */}
          <div className="card card-p-lg">
            <div className="lbl">Journal d'analyse en direct</div>
            <div className="log">
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
            <div className="grid g3" style={{ gap: 14 }}>
              {SHIELDS.map(({ key, label, desc, icon }) => (
                <div key={key} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: 18, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="ico">{icon}</span>
                    <Toggle checked={shields[key] ?? false} onChange={v => toggleShield(key, v)} />
                  </div>
                  <div>
                    <b style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</b>
                    <div className="mut sm" style={{ marginTop: 3 }}>{desc}</div>
                  </div>
                </div>
              ))}
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
                <button className="btn btn-ghost btn-sm" onClick={() => {}}>
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
                  <span className="ico ok"><CheckCircle2 size={16} /></span>
                  <div className="rt">
                    <b>{h.label}</b>
                    <small>{h.when} · {h.result}</small>
                  </div>
                  <span className="chip">{h.result === 'Propre' || h.result === '0 menace' ? 'Propre' : h.result}</span>
                </div>
              ))}
              <div className="state-empty" style={{ padding: '18px 0', marginTop: 8 }}>
                <span className="ico big" style={{ margin: '0 auto' }}><Shield size={22} /></span>
                <b>Quarantaine vide</b>
                <p>Aucun fichier isolé.</p>
              </div>
            </div>
          )}

          {/* Exclusions */}
          {scanTab === 'Exclusions' && (
            <div>
              {exclusions.length === 0 ? (
                <div className="state-empty">
                  <span className="ico big" style={{ margin: '0 auto' }}><Folder size={22} /></span>
                  <b>Aucune exclusion</b>
                  <p>Ajoute des dossiers de jeux ou de mods pour éviter les faux positifs.</p>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                    <Plus size={14} /> Ajouter une exclusion
                  </button>
                </div>
              ) : (
                <div className="list">
                  {exclusions.map((ex, i) => (
                    <div className="row" key={i}>
                      <span className="ico"><Folder size={16} /></span>
                      <div className="rt"><b className="truncate">{ex}</b></div>
                      <button className="btn btn-ghost btn-xs" onClick={() => setExclusions(prev => prev.filter((_, j) => j !== i))}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
