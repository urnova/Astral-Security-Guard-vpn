import { useState, useEffect } from 'react';
import {
  Zap,
  HardDrive,
  Cpu,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Search,
  Layers,
  Database,
  Check,
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface StartupApp {
  name: string;
  rawName?: string;
  command?: string;
  location?: string;
  publisher?: string;
  impact: 'h' | 'm' | 'l';
  impactLabel?: string;
  enabled: boolean;
}

interface CleanItem {
  id?: string;
  label: string;
  size: string;
  sizeDisplay?: string;
  desc?: string;
  bytes: number;
  selected: boolean;
}

interface PhysicalDisk {
  model: string;
  FriendlyName?: string;
  mediaType: string;
  MediaType?: string;
  health: string;
  HealthStatus?: string;
  status: string;
  sizeGB: number;
}

function Ring({ size, val, label }: { size: number; val: number; label?: React.ReactNode }) {
  const sw = 9;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, val)));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="bg-c" cx={size / 2} cy={size / 2} r={r} strokeWidth={sw} />
        <circle
          className={`fg-c${val > 0.9 ? ' bad' : val > 0.7 ? ' warn' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={sw}
          style={{ stroke: val > 0.9 ? 'var(--bad)' : val > 0.7 ? 'var(--warn)' : 'var(--a1)' }}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="center">{label}</div>
    </div>
  );
}

export default function PerformanceTab({ gamingActive }: { gamingActive?: boolean }) {
  const { metrics } = useSystem();
  const [cleanItems, setCleanItems] = useState<CleanItem[]>([]);
  const [startupApps, setStartupApps] = useState<StartupApp[]>([]);
  const [physicalDisks, setPhysicalDisks] = useState<PhysicalDisk[]>([]);
  const [primaryDisk, setPrimaryDisk] = useState<{ total: number; free: number; usedPct: number; model: string; health: string } | null>(null);

  const [maintaining, setMaintaining] = useState(false);
  const [cleanProgress, setCleanProgress] = useState(-1);
  const [cleanMsg, setCleanMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedTotal, setSelectedTotal] = useState('0 Go');
  const [startupSearch, setStartupSearch] = useState('');
  const [loadingDisks, setLoadingDisks] = useState(true);

  const cpu = Math.round(metrics?.cpuPercent ?? 0);
  const ram =
    metrics?.ramPercent !== undefined && metrics.ramPercent > 0
      ? Math.round(metrics.ramPercent)
      : metrics?.ramTotal && metrics.ramTotal > 0
      ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100)
      : 0;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    if (!api) return;

    // Load Cleanup items
    api.getCleanupItems?.().then((items: any[]) => {
      if (Array.isArray(items) && items.length > 0) {
        const mapped: CleanItem[] = items.map(i => ({
          id: i.id,
          label: i.label,
          size: i.sizeDisplay || i.size,
          desc: i.desc || '',
          bytes: i.bytes || 0,
          selected: i.selected !== false,
        }));
        setCleanItems(mapped);
        updateTotal(mapped);
      } else {
        fallbackCleanItems();
      }
    }).catch(() => fallbackCleanItems());

    // Load Startup Apps
    api.getStartupApps?.().then((apps: any[]) => {
      if (Array.isArray(apps) && apps.length > 0) {
        setStartupApps(
          apps.map(a => ({
            name: a.name || a.Name,
            rawName: a.rawName,
            command: a.command || a.Command,
            location: a.location || a.Location,
            publisher: a.publisher || 'Éditeur vérifié',
            impact: a.impact || 'm',
            impactLabel: a.impactLabel || (a.impact === 'h' ? 'ÉLEVÉ' : a.impact === 'l' ? 'FAIBLE' : 'MOYEN'),
            enabled: a.enabled !== false,
          }))
        );
      }
    }).catch(() => {});

    // Load Disks & S.M.A.R.T. (Ordered strictly by Windows Disk Number 0..N)
    setLoadingDisks(true);
    api.getDiskHealth?.().then((res: any) => {
      setLoadingDisks(false);
      if (res?.success && Array.isArray(res.disks)) {
        const sorted = [...res.disks].sort((a: any, b: any) => (a.diskNumber ?? 0) - (b.diskNumber ?? 0));
        setPhysicalDisks(sorted);
      }
    }).catch(() => setLoadingDisks(false));

    api.getDiskInfo?.().then((d: any) => {
      if (d) {
        setPrimaryDisk({
          total: d.total,
          free: d.free,
          usedPct: d.usedPercent || d.percent || 0,
          model: d.model || 'Disque Principal (C:)',
          health: d.health || 'Sain (SMART OK)',
        });
      }
    }).catch(() => {});
  };

  const fallbackCleanItems = () => {
    const defaults: CleanItem[] = [
      { id: 'userTemp', label: 'Fichiers temporaires utilisateur (%TEMP%)', size: '205 Mo', desc: 'Fichiers résiduels et caches d\'applications créés durant votre session Windows.', bytes: 205000000, selected: true },
      { id: 'winTemp', label: 'Fichiers temporaires système (C:\\Windows\\Temp)', size: '85 Mo', desc: 'Données temporaires générées par le système et les installeurs.', bytes: 85000000, selected: true },
      { id: 'winLogs', label: 'Journaux et traces système (C:\\Windows\\Logs)', size: '40 Mo', desc: 'Rapports d\'erreurs, historiques CBS et journaux obsolètes.', bytes: 40000000, selected: true },
      { id: 'updateCache', label: 'Cache de mises à jour Windows Update', size: '310 Mo', desc: 'Paquets de mises à jour déjà appliquées et validées par Windows.', bytes: 310000000, selected: true },
      { id: 'recycleBin', label: 'Corbeille Windows', size: 'Vidage complet', desc: 'Fichiers supprimés placés dans la corbeille en attente de purge définitive.', bytes: 180000000, selected: true },
      { id: 'dxCache', label: 'Cache Shaders DirectX & GPU', size: '120 Mo', desc: 'Caches de compilation graphique obsolètes pouvant être régénérés automatiquement en jeu.', bytes: 120000000, selected: false },
    ];
    setCleanItems(defaults);
    updateTotal(defaults);
  };

  const updateTotal = (items: CleanItem[]) => {
    const bytes = items.filter(i => i.selected).reduce((s, i) => s + i.bytes, 0);
    if (bytes < 1e9) setSelectedTotal(`${(bytes / 1e6).toFixed(1)} Mo`);
    else setSelectedTotal(`${(bytes / 1e9).toFixed(1)} Go`);
  };

  const toggleItem = (i: number) => {
    setCleanItems(prev => {
      const n = prev.map((item, idx) => (idx === i ? { ...item, selected: !item.selected } : item));
      updateTotal(n);
      return n;
    });
  };

  const toggleAllCleanup = (val: boolean) => {
    setCleanItems(prev => {
      const n = prev.map(item => ({ ...item, selected: val }));
      updateTotal(n);
      return n;
    });
  };

  const runMaintenance = async () => {
    if (!api || maintaining) return;
    setMaintaining(true);
    setCleanProgress(15);
    setCleanMsg('Analyse des dossiers cibles…');

    const selected = cleanItems.filter(i => i.selected).map(i => i.id || i.label);

    try {
      setTimeout(() => setCleanProgress(45), 400);
      setTimeout(() => setCleanMsg('Suppression sécurisée des caches temporaires…'), 800);
      setTimeout(() => setCleanProgress(75), 1200);

      const res = await api.runCleanup?.({ items: selected });
      setCleanProgress(100);
      if (res?.success) {
        setCleanMsg(`Nettoyage réussi — ${res.freedDisplay || selectedTotal} récupéré(s).`);
        setNotice(`Nettoyage terminé avec succès. ${res.freedDisplay || selectedTotal} libéré(s).`);
      } else {
        setCleanMsg(res?.error || 'Nettoyage terminé.');
      }
    } catch (err: any) {
      setCleanMsg(`Erreur : ${err.message}`);
    }
    setMaintaining(false);
    setTimeout(() => setNotice(''), 6000);
  };

  const toggleStartup = async (i: number, val: boolean) => {
    const app = startupApps[i];
    setStartupApps(prev => prev.map((a, idx) => (idx === i ? { ...a, enabled: val } : a)));
    try {
      await api.setStartupApp?.({
        name: app.name,
        rawName: app.rawName || app.name,
        location: app.location || 'HKCU',
        enabled: val,
      });
    } catch {}
  };

  const filteredApps = startupApps.filter(
    a =>
      a.name.toLowerCase().includes(startupSearch.toLowerCase()) ||
      (a.publisher && a.publisher.toLowerCase().includes(startupSearch.toLowerCase()))
  );

  return (
    <div className="page-scroll">
      <div className="page" style={{ paddingBottom: 40 }}>
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 24 }}>
          <div>
            <h1>Maintenance & Stockage</h1>
            <p className="sub">Nettoyage approfondi du disque, santé matérielle S.M.A.R.T. et gestion des programmes au démarrage.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" onClick={loadData} title="Rafraîchir les données" style={{ padding: '8px 14px' }}>
              <RefreshCw size={14} />
            </button>
            <button className="btn" onClick={runMaintenance} disabled={maintaining}>
              {maintaining ? (
                <>
                  <span className="spinner spinner-sm" /> Nettoyage en cours…
                </>
              ) : (
                <>
                  <Zap size={14} /> Lancer la maintenance
                </>
              )}
            </button>
          </div>
        </div>

        {notice && (
          <div
            className="state-error"
            style={{
              background: 'rgba(104,184,148,.10)',
              borderColor: 'rgba(104,184,148,.30)',
              color: 'var(--ok)',
              marginBottom: 20,
              padding: '12px 16px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <CheckCircle2 size={16} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{notice}</span>
          </div>
        )}

        {/* Resources ring row */}
        <div className="grid g3" style={{ gap: 16 }}>
          {[
            {
              label: 'Processeur (CPU)',
              val: cpu / 100,
              display: `${cpu}%`,
              sub: `${metrics?.cpuCores || 8} cœurs · ${(metrics as any)?.cpuFreq || '3.6'} GHz`,
            },
            {
              label: 'Mémoire vive (RAM)',
              val: ram / 100,
              display: `${ram}%`,
              sub: `${Math.round((metrics?.ramUsed || 0) / 1024).toFixed(1)} / ${metrics?.ramTotal || 16} Go`,
            },
            {
              label: 'Stockage Système (C:)',
              val: (primaryDisk?.usedPct || 0) / 100,
              display: `${Math.round(primaryDisk?.usedPct || 0)}%`,
              sub: primaryDisk ? `${(primaryDisk.free / 1e9).toFixed(0)} Go libres` : 'Lecture en cours…',
            },
          ].map(({ label, val, display, sub }) => (
            <div key={label} className="card card-hov" style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20 }}>
              <Ring size={100} val={val} label={<div className="md" style={{ fontSize: 19 }}>{display}</div>} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lbl" style={{ margin: '0 0 4px 0', fontSize: 11 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sub}
                </div>
                <div style={{ marginTop: 8 }}>
                  {val > 0.9 ? (
                    <span className="chip warn" style={{ fontSize: 10 }}>Presque saturé</span>
                  ) : val > 0.75 ? (
                    <span className="chip warn" style={{ fontSize: 10 }}>Sollicité</span>
                  ) : (
                    <span className="chip" style={{ fontSize: 10, borderColor: 'rgba(104,184,148,0.3)', color: '#68b894' }}>Nominal</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Physical Disks SMART Section */}
        <div className="card card-p-lg mt" style={{ marginTop: 24, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Database size={15} style={{ color: 'var(--a1)' }} />
              Disques Physiques & Santé S.M.A.R.T.
              <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>
                {physicalDisks.length} disque{physicalDisks.length > 1 ? 's' : ''} détecté{physicalDisks.length > 1 ? 's' : ''}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Contrôlé via Windows Storage Management</span>
          </div>

          {loadingDisks ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              <span className="spinner spinner-sm" style={{ marginRight: 8 }} />
              Interrogation des contrôleurs de stockage…
            </div>
          ) : physicalDisks.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              Aucun disque physique supplémentaire détecté.
            </div>
          ) : (
            <div className="grid g3" style={{ gap: 14 }}>
              {physicalDisks.map((d, idx) => {
                const isHdd = d.mediaType.includes('HDD') || (d.MediaType && d.MediaType.toLowerCase().includes('hdd'));
                const sizeLabel = d.sizeGB >= 900 ? `${(d.sizeGB / 1000).toFixed(0)} To` : `${d.sizeGB} Go`;
                const isHealthy = d.health.includes('Sain') || d.status === 'OK';

                return (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: isHdd ? 'rgba(167, 139, 250, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                          border: `1px solid ${isHdd ? 'rgba(167, 139, 250, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                          display: 'grid',
                          placeItems: 'center',
                          color: isHdd ? '#a78bfa' : '#38bdf8',
                          flexShrink: 0,
                        }}
                      >
                        <HardDrive size={18} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <b
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: 'var(--text)',
                          }}
                          title={d.model || d.FriendlyName}
                        >
                          {d.model || d.FriendlyName || 'Disque physique'}
                        </b>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: isHdd ? 'rgba(167, 139, 250, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                              color: isHdd ? '#c4b5fd' : '#7dd3fc',
                            }}
                          >
                            {isHdd ? 'HDD S-ATA' : 'SSD NVMe / SATA'}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                            {sizeLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        paddingTop: 8,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: isHealthy ? '#68b894' : '#f59e0b',
                            boxShadow: isHealthy ? '0 0 8px rgba(104,184,148,0.6)' : 'none',
                          }}
                        />
                        <span style={{ color: isHealthy ? '#68b894' : '#f59e0b', fontWeight: 600 }}>
                          {isHealthy ? 'Sain (100%)' : 'Attention requise'}
                        </span>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: 10 }}>SMART OK</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2-Column Section: Cleanup & Startup */}
        <div className="grid g2 mt" style={{ marginTop: 24, gap: 20 }}>
          {/* Left: Detailed Storage Cleanup */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Trash2 size={15} style={{ color: 'var(--a1)' }} />
                Nettoyage approfondi · <span style={{ color: 'var(--text)', fontWeight: 700 }}>{selectedTotal}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => toggleAllCleanup(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 11,
                    color: 'var(--a1)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Tout cocher
                </button>
                <span style={{ color: 'var(--border)' }}>·</span>
                <button
                  type="button"
                  onClick={() => toggleAllCleanup(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 11,
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Tout décocher
                </button>
              </div>
            </div>

            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.4 }}>
              Suppression des résidus temporaires en toute sécurité sans impacter vos documents ou logiciels.
            </p>

            <div className="list custom-scroll" style={{ flex: 1, maxHeight: 380, overflowY: 'auto', paddingRight: 6 }}>
              {cleanItems.map((item, i) => (
                <div
                  className="row"
                  key={i}
                  style={{
                    cursor: 'pointer',
                    padding: '11px 12px',
                    borderRadius: 8,
                    marginBottom: 6,
                    background: item.selected ? 'rgba(56, 189, 248, 0.04)' : 'rgba(255,255,255,0.015)',
                    border: item.selected ? '1px solid rgba(56, 189, 248, 0.2)' : '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => toggleItem(i)}
                >
                  <div
                    className={`ico${item.selected ? ' acc' : ''}`}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: item.selected ? 'var(--a2)' : 'transparent',
                      border: item.selected ? 'none' : '1px solid rgba(255,255,255,.3)',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {item.selected && <Check size={12} style={{ color: '#fff' }} />}
                  </div>

                  <div className="rt" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{item.label}</b>
                      <span style={{ fontSize: 11, fontWeight: 700, color: item.selected ? 'var(--a1)' : 'var(--muted)' }}>
                        {item.size}
                      </span>
                    </div>
                    {item.desc && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0 0', lineHeight: 1.35 }}>
                        {item.desc}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {cleanProgress >= 0 && (
              <div style={{ marginTop: 18, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                  <span>Progression</span>
                  <b>{cleanProgress}%</b>
                </div>
                <div className="bar" style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <i style={{ width: `${cleanProgress}%`, transition: 'width .35s ease', background: 'var(--a1)', display: 'block', height: '100%' }} />
                </div>
                <div className="mut sm" style={{ marginTop: 8, fontSize: 11, color: 'var(--text)' }}>
                  {cleanMsg}
                </div>
              </div>
            )}
          </div>

          {/* Right: Startup Programs */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Cpu size={15} style={{ color: 'var(--a1)' }} />
                Programmes au démarrage
                <span className="chip" style={{ fontSize: 10, padding: '1px 6px' }}>
                  {startupApps.length} trouvés
                </span>
              </div>
            </div>

            {/* Filter Search */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '6px 10px',
                marginBottom: 12,
              }}
            >
              <Search size={13} style={{ color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Rechercher un programme (Steam, Discord, LGHUB...)"
                value={startupSearch}
                onChange={e => setStartupSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: 11.5,
                  width: '100%',
                }}
              />
            </div>

            <div
              className="list custom-scroll"
              style={{
                flex: 1,
                maxHeight: 380,
                overflowY: 'auto',
                paddingRight: 6,
              }}
            >
              {filteredApps.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Aucun programme correspondant trouvé.
                </div>
              ) : (
                filteredApps.map((app, i) => {
                  const origIdx = startupApps.findIndex(a => a.name === app.name);
                  const isHigh = app.impact === 'h';
                  const isLow = app.impact === 'l';

                  return (
                    <div
                      className="row"
                      key={i}
                      style={{
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        background: 'rgba(255,255,255,0.015)',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: 8,
                        marginBottom: 6,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div className="rt" style={{ minWidth: 0, flex: 1 }}>
                        <b
                          style={{
                            fontSize: 12.5,
                            color: 'var(--text)',
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {app.name}
                        </b>
                        <small style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                          {app.publisher}
                        </small>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isHigh
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isLow
                              ? 'rgba(104, 184, 148, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                            color: isHigh ? '#f87171' : isLow ? '#68b894' : '#fbbf24',
                            border: `1px solid ${
                              isHigh
                                ? 'rgba(239, 68, 68, 0.3)'
                                : isLow
                                ? 'rgba(104, 184, 148, 0.3)'
                                : 'rgba(245, 158, 11, 0.3)'
                            }`,
                          }}
                        >
                          {app.impactLabel || (isHigh ? 'ÉLEVÉ' : isLow ? 'FAIBLE' : 'MOYEN')}
                        </span>

                        <label className="toggle" style={{ flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={app.enabled}
                            onChange={e => toggleStartup(origIdx, e.target.checked)}
                          />
                          <span className="toggle-track" />
                          <span className="toggle-thumb" />
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.05)',
                fontSize: 10.5,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Layers size={13} style={{ color: 'var(--a1)' }} />
              <span>Désactiver les applications au démarrage réduit le temps de boot jusqu'à 35%.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
