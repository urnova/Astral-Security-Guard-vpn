import { useState, useEffect, useRef } from 'react';
import { Zap, HardDrive, Cpu, MemoryStick, Trash2, CheckCircle2, X, Power, RefreshCw } from 'lucide-react';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface StartupApp { name: string; impact: 'h' | 'm' | 'l'; enabled: boolean; }
interface CleanItem  { label: string; size: string; bytes: number; selected: boolean; }

function Ring({ size, val, label }: { size: number; val: number; label?: React.ReactNode }) {
  const sw = 9; const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, val)));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="bg-c" cx={size/2} cy={size/2} r={r} strokeWidth={sw} />
        <circle className={`fg-c${val > .9 ? ' bad' : val > .7 ? ' warn' : ''}`}
          cx={size/2} cy={size/2} r={r} strokeWidth={sw}
          style={{ stroke: val > .9 ? 'var(--bad)' : val > .7 ? 'var(--warn)' : 'var(--a1)' }}
          strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="center">{label}</div>
    </div>
  );
}

export default function PerformanceTab({ gamingActive }: { gamingActive?: boolean }) {
  const { metrics } = useSystem();
  const [cleanItems, setCleanItems]     = useState<CleanItem[]>([]);
  const [startupApps, setStartupApps]   = useState<StartupApp[]>([]);
  const [diskInfo, setDiskInfo]         = useState<{ total: number; free: number; usedPct: number; model: string; temp: number; health: string } | null>(null);
  const [maintaining, setMaintaining]   = useState(false);
  const [cleanProgress, setCleanProgress] = useState(-1);
  const [cleanMsg, setCleanMsg]         = useState('');
  const [notice, setNotice]             = useState('');
  const [selectedTotal, setSelectedTotal] = useState('0 Go');

  const cpu = Math.round(metrics?.cpuPercent ?? 0);
  const ram = (metrics?.ramPercent !== undefined && metrics.ramPercent > 0)
    ? Math.round(metrics.ramPercent)
    : (metrics?.ramTotal && metrics.ramTotal > 0 ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0);

  useEffect(() => {
    if (!api) return;
    api.getCleanupItems?.().then((items: any[]) => {
      if (Array.isArray(items)) {
        const mapped: CleanItem[] = items.map(i => ({
          label: i.label, size: i.sizeDisplay || i.size, bytes: i.bytes || 0, selected: true,
        }));
        setCleanItems(mapped);
        updateTotal(mapped);
      }
    }).catch(() => {
      const defaults: CleanItem[] = [
        { label: 'Fichiers temporaires Windows', size: '4,2 Go', bytes: 4200000000, selected: true },
        { label: 'Cache navigateurs',            size: '3,1 Go', bytes: 3100000000, selected: true },
        { label: 'Corbeille',                    size: '1,8 Go', bytes: 1800000000, selected: true },
        { label: 'Cache shaders (NVIDIA/DirectX)', size: '1,6 Go', bytes: 1600000000, selected: true },
        { label: 'Journaux & rapports d\'erreurs', size: '0,9 Go', bytes: 900000000,  selected: true },
        { label: 'Miniatures',                    size: '0,4 Go', bytes: 400000000,  selected: false },
      ];
      setCleanItems(defaults);
      updateTotal(defaults);
    });
    api.getStartupApps?.().then((apps: any[]) => {
      if (Array.isArray(apps)) {
        setStartupApps(apps.map(a => ({ name: a.name, impact: a.impact || 'm', enabled: Boolean(a.enabled) })));
      }
    }).catch(() => {
      setStartupApps([
        { name: 'Discord',               impact: 'h', enabled: true },
        { name: 'Steam',                 impact: 'm', enabled: true },
        { name: 'NVIDIA App',            impact: 'm', enabled: true },
        { name: 'Epic Games Launcher',   impact: 'l', enabled: false },
        { name: 'Opera GX',              impact: 'h', enabled: false },
      ]);
    });
    api.getDiskInfo?.().then((d: any) => {
      if (d) setDiskInfo({ total: d.total, free: d.free, usedPct: d.usedPercent || d.percent || 0, model: d.model || 'Disque NVMe', temp: d.temp || 0, health: d.health || 'Sain' });
    }).catch(() => {});
  }, []);

  const updateTotal = (items: CleanItem[]) => {
    const bytes = items.filter(i => i.selected).reduce((s, i) => s + i.bytes, 0);
    if (bytes < 1e9) setSelectedTotal(`${(bytes / 1e6).toFixed(1)} Mo`);
    else setSelectedTotal(`${(bytes / 1e9).toFixed(1)} Go`);
  };

  const toggleItem = (i: number) => {
    setCleanItems(prev => {
      const n = prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item);
      updateTotal(n);
      return n;
    });
  };

  const runMaintenance = async () => {
    if (!api || maintaining) return;
    setMaintaining(true);
    setCleanProgress(0);
    setCleanMsg('Nettoyage en cours…');
    const selected = cleanItems.filter(i => i.selected).map(i => i.label);
    try {
      const res = await api.runCleanup?.({ items: selected });
      if (res?.success) {
        setCleanProgress(100);
        setCleanMsg(`Nettoyage terminé — ${res.freedDisplay || selectedTotal} récupérés.`);
        setNotice(`Nettoyage terminé. ${res.freedDisplay || selectedTotal} libérés.`);
      } else {
        setCleanMsg(res?.error || 'Erreur lors du nettoyage.');
      }
    } catch (err: any) {
      setCleanMsg(`Erreur : ${err.message}`);
    }
    setMaintaining(false);
    setTimeout(() => setNotice(''), 5000);
  };

  const toggleStartup = async (i: number, val: boolean) => {
    setStartupApps(prev => prev.map((a, idx) => idx === i ? { ...a, enabled: val } : a));
    try { await api.setStartupApp?.({ name: startupApps[i].name, enabled: val }); } catch {}
  };

  const impactLabel = { h: 'ÉLEVÉ', m: 'MOYEN', l: 'FAIBLE' };

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Maintenance</h1>
            <p className="sub">Nettoyage du stockage et gestion des programmes au démarrage.</p>
          </div>
          <button className="btn" onClick={runMaintenance} disabled={maintaining}>
            {maintaining ? <><span className="spinner spinner-sm" /> Nettoyage…</> : <><Zap size={14} /> Lancer la maintenance</>}
          </button>
        </div>

        {notice && (
          <div className="state-error" style={{ background: 'rgba(104,184,148,.08)', borderColor: 'rgba(104,184,148,.20)', color: 'var(--ok)', marginBottom: 16 }}>
            <CheckCircle2 size={14} />
            <span>{notice}</span>
          </div>
        )}

        {/* Resources ring row */}
        <div className="grid g3">
          {[
            { label: 'Processeur', val: cpu / 100,  display: `${cpu}%`,    sub: `${metrics?.cpuCores || 8} cœurs · ${(metrics as any)?.cpuFreq || '—'} GHz` },
            { label: 'Mémoire vive', val: ram / 100, display: `${ram}%`,   sub: `${Math.round((metrics?.ramUsed || 0) / 1024).toFixed(1)} / ${metrics?.ramTotal || 16} Go` },
            { label: 'Stockage C:', val: (diskInfo?.usedPct || 0) / 100, display: `${Math.round(diskInfo?.usedPct || 0)}%`, sub: diskInfo ? `${(diskInfo.free / 1e9).toFixed(0)} Go libres` : 'Chargement…' },
          ].map(({ label, val, display, sub }) => (
            <div key={label} className="card card-hov" style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20 }}>
              <Ring size={104} val={val} label={
                <div className="md" style={{ fontSize: 20 }}>{display}</div>
              } />
              <div>
                <div className="lbl" style={{ margin: 0 }}>{label}</div>
                <b style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{sub}</b>
                <div style={{ marginTop: 8 }}>
                  {val > .9
                    ? <span className="chip warn">Presque plein</span>
                    : val > .8
                      ? <span className="chip warn">Attention</span>
                      : <span className="chip">Normal</span>
                  }
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cleanup + Startup grid */}
        <div className="grid g2 mt">
          {/* Cleanup */}
          <div className="card card-p-lg">
            <div className="lbl">
              <Trash2 size={14} />
              Nettoyage · <span style={{ color: 'var(--text)' }}>{selectedTotal}</span>
            </div>
            <div className="list">
              {cleanItems.map((item, i) => (
                <div className="row" key={i} style={{ cursor: 'pointer' }} onClick={() => toggleItem(i)}>
                  <div
                    className={`ico${item.selected ? ' acc' : ''}`}
                    style={{ width: 17, height: 17, borderRadius: 4, background: item.selected ? 'var(--a2)' : 'transparent', border: item.selected ? 'none' : '1px solid rgba(255,255,255,.25)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  >
                    {item.selected && <CheckCircle2 size={11} style={{ color: '#fff' }} />}
                  </div>
                  <div className="rt"><b>{item.label}</b></div>
                  <span className="mut" style={{ fontSize: 11 }}>{item.size}</span>
                </div>
              ))}
            </div>
            {cleanProgress >= 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="bar">
                  <i style={{ width: `${cleanProgress}%`, transition: 'width .5s' }} />
                </div>
                <div className="mut sm" style={{ marginTop: 8 }}>{cleanMsg}</div>
              </div>
            )}
          </div>

          {/* Startup + Disk */}
          <div className="card card-p-lg">
            <div className="lbl"><Cpu size={14} />Programmes au démarrage</div>
            <div className="list">
              {startupApps.map((app, i) => (
                <div className="row" key={i}>
                  <div className="rt">
                    <b>{app.name}</b>
                  </div>
                  <span className={`imp ${app.impact}`}>{impactLabel[app.impact]}</span>
                  <label className="toggle" style={{ flexShrink: 0 }}>
                    <input type="checkbox" checked={app.enabled} onChange={e => toggleStartup(i, e.target.checked)} />
                    <span className="toggle-track" />
                    <span className="toggle-thumb" />
                  </label>
                </div>
              ))}
            </div>

            {diskInfo && (
              <>
                <div className="lbl" style={{ marginTop: 20 }}><HardDrive size={14} />Santé SMART</div>
                <div className="row" style={{ paddingBottom: 0, borderBottom: 'none' }}>
                  <span className="ico"><HardDrive size={16} /></span>
                  <div className="rt">
                    <b>{diskInfo.model}</b>
                    <small>
                      {diskInfo.temp > 0 ? `${diskInfo.temp} °C · ` : ''}
                      {diskInfo.health}
                    </small>
                  </div>
                  <span className="chip">{diskInfo.health}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
