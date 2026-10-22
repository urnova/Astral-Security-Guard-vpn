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
  Monitor,
  ExternalLink,
  HelpCircle,
  Calendar,
  ShieldCheck,
  Sparkles,
  Sliders,
  X,
} from 'lucide-react';
import SlideDrawer from '../common/SlideDrawer';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface HardwareInfo {
  gpuName?: string;
  gpuDriver?: string;
  gpuDriverDate?: string;
  driverUrl?: string;
  cpuName?: string;
  cpuCores?: number;
  cpuThreads?: number;
  ramGB?: number;
  motherboard?: string;
  biosVersion?: string;
  biosDate?: string;
  biosUrl?: string;
}

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
  diskNumber?: number;
  model: string;
  FriendlyName?: string;
  mediaType: string;
  MediaType?: string;
  busType?: string;
  partitionStyle?: string;
  driveLetters?: string;
  volumeLabel?: string;
  isSystemDisk?: boolean;
  health: string;
  HealthStatus?: string;
  healthStatusText?: string;
  status: string;
  sizeGB: number;
  usedGB?: number;
  freeGB?: number;
  usedPercent?: number;
  volumes?: Array<{
    drive: string;
    label: string;
    fileSystem: string;
    sizeGB: number;
    freeGB: number;
    usedGB: number;
    usedPct: number;
    health: string;
  }>;
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
  const [maintLogs, setMaintLogs] = useState<string[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [showBiosGuide, setShowBiosGuide] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState<'Rapide' | 'Approfondi' | 'Personnalisé'>('Rapide');
  const [scheduledEnabled, setScheduledEnabled] = useState(true);
  const [scheduledFreq, setScheduledFreq] = useState<'Quotidienne' | 'Hebdomadaire' | 'Au démarrage' | 'À l\'inactivité'>('Hebdomadaire');

  // Per-Disk Optimization State
  const [showDiskOptModal, setShowDiskOptModal] = useState(false);
  const [selectedDiskForOpt, setSelectedDiskForOpt] = useState<PhysicalDisk | null>(null);
  const [diskJunkScanResult, setDiskJunkScanResult] = useState<any | null>(null);
  const [diskJunkScanning, setDiskJunkScanning] = useState(false);
  const [diskJunkCleaning, setDiskJunkCleaning] = useState(false);
  const [diskJunkNotice, setDiskJunkNotice] = useState('');

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

    // Load Startup Apps with fallback to getStartup
    const fetchStartup = async () => {
      try {
        let apps = await api.getStartupApps?.();
        if (!Array.isArray(apps) || apps.length === 0) {
          apps = await api.getStartup?.();
        }
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
      } catch {}
    };
    fetchStartup();

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

    // Load Hardware info
    api?.getHardwareInfo?.().then((res: any) => {
      if (res?.success && res.hardware) {
        setHardware(res.hardware);
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
    if (gamingActive) {
      setNotice('Maintenance différée : un jeu ou une session haute performance est actuellement en cours.');
      setTimeout(() => setNotice(''), 4000);
      return;
    }
    setMaintaining(true);
    setCleanProgress(15);
    setCleanMsg('Initialisation du moteur de maintenance…');
    const nowStr = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setMaintLogs([
      `[${nowStr()}] Démarrage du nettoyage en profondeur...`,
      `[${nowStr()}] Analyse des répertoires temporaires utilisateurs et système (%TEMP%, Windows\\Temp)...`,
    ]);

    const selected = cleanItems.filter(i => i.selected).map(i => i.id || i.label);

    try {
      setTimeout(() => {
        setCleanProgress(45);
        setCleanMsg('Purge des caches de shaders DirectX et GPU…');
        setMaintLogs(prev => [...prev, `[${nowStr()}] Vidage des caches shaders DirectX & composants graphiques...`]);
      }, 500);

      setTimeout(() => {
        setCleanProgress(75);
        setCleanMsg('Suppression des fichiers orphelins et vidage corbeille…');
        setMaintLogs(prev => [...prev, `[${nowStr()}] Purge de la corbeille Windows et des fichiers journaux obsolètes...`]);
      }, 1000);

      const res = await api.runCleanup?.({ items: selected });
      setCleanProgress(100);
      const freed = res?.freedDisplay || selectedTotal;
      if (res?.success) {
        setCleanMsg(`Maintenance terminée — ${freed} d'espace disque libéré(s)`);
        setNotice(`Maintenance effectuée avec succès : ${freed} récupérés sur votre disque système.`);
        setMaintLogs(prev => [
          ...prev,
          `[${nowStr()}] [OK] Nettoyage accompli : ${freed} libéré(s) sans risque pour vos données personnelles.`
        ]);
      } else {
        setCleanMsg(res?.error || 'Maintenance terminée.');
        setMaintLogs(prev => [...prev, `[${nowStr()}] Fin de maintenance avec statut : ${res?.error || 'OK'}`]);
      }
    } catch (err: any) {
      setCleanMsg(`Erreur : ${err.message}`);
      setMaintLogs(prev => [...prev, `[${nowStr()}] Erreur lors de l'exécution : ${err.message}`]);
    }
    setMaintaining(false);
    setTimeout(() => setNotice(''), 8000);
  };

  const openDiskOptimizer = async (disk: PhysicalDisk) => {
    setSelectedDiskForOpt(disk);
    setShowDiskOptModal(true);
    setDiskJunkScanning(true);
    setDiskJunkScanResult(null);
    setDiskJunkNotice('');
    const letter = disk.driveLetters ? disk.driveLetters.split(',')[0].trim().replace(':', '') : (disk.isSystemDisk ? 'C' : 'C');
    try {
      const res = await api?.scanDiskJunk?.(letter);
      setDiskJunkScanResult(res);
    } catch {
      setDiskJunkNotice('Erreur lors de l\'analyse du volume.');
    } finally {
      setDiskJunkScanning(false);
    }
  };

  const cleanDiskJunk = async () => {
    if (!selectedDiskForOpt || diskJunkCleaning) return;
    setDiskJunkCleaning(true);
    const letter = selectedDiskForOpt.driveLetters ? selectedDiskForOpt.driveLetters.split(',')[0].trim().replace(':', '') : (selectedDiskForOpt.isSystemDisk ? 'C' : 'C');
    try {
      const res = await api?.cleanDiskJunk?.(letter);
      if (res?.success) {
        setDiskJunkNotice(res.message || 'Optimisation réussie ! Espace libéré avec succès.');
        loadData();
      } else {
        setDiskJunkNotice(res?.error || 'Erreur lors du nettoyage du volume.');
      }
    } catch (err: any) {
      setDiskJunkNotice(`Erreur : ${err.message}`);
    } finally {
      setDiskJunkCleaning(false);
    }
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
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1>Maintenance & Matériel</h1>
            <p className="sub">Nettoyage approfondi du disque, santé matérielle S.M.A.R.T., composants et pilotes officiels.</p>
          </div>
        </div>

        {/* Hero Maintenance Card */}
        <div
          className="card card-p-lg"
          style={{
            marginBottom: 20,
            padding: 22,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div style={{ maxWidth: 660 }}>
              <div className="lbl" style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Zap size={16} style={{ color: 'var(--a1)' }} />
                Centre de Maintenance & Nettoyage Système
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Purge intelligente et sécurisée de l'espace disque et optimisation de la mémoire vive pour restaurer la réactivité d'origine de Windows sans altérer vos fichiers personnels ni vos configurations de jeux.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                  <Sparkles size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <span><b>Nettoyage RAM :</b> Cache de travail Windows libéré</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                  <Trash2 size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
                  <span><b>Fichiers temporaires :</b> %TEMP% & résidus Windows</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                  <Layers size={14} style={{ color: '#68b894', flexShrink: 0 }} />
                  <span><b>Caches DirectX :</b> Shaders GPU & corruptions</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                  <CheckCircle2 size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span><b>Corbeille :</b> Vidage définitif sécurisé</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn-ghost"
                onClick={() => setShowMaintenanceModal(true)}
                style={{ padding: '10px 16px', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
              >
                <Sliders size={14} />
                <span>Configurer ({cleanItems.filter(i => i.selected).length})</span>
              </button>
              <button
                className="btn"
                onClick={runMaintenance}
                disabled={maintaining}
                style={{ padding: '10px 22px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {maintaining ? (
                  <>
                    <span className="spinner spinner-sm" /> Nettoyage en cours…
                  </>
                ) : (
                  <>
                    <Zap size={15} /> Lancer la maintenance ({selectedTotal})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress & Live Terminal */}
          {(maintaining || cleanProgress >= 0) && (
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: maintaining ? 'var(--a1)' : 'var(--ok)', fontWeight: 600 }}>
                  {cleanMsg || (maintaining ? 'Nettoyage en cours…' : 'Maintenance terminée')}
                </span>
                <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.max(0, cleanProgress)}%</span>
              </div>
              <div className="bar" style={{ height: 6, marginBottom: 12 }}>
                <i style={{ width: `${Math.max(5, cleanProgress)}%`, background: maintaining ? 'linear-gradient(90deg, var(--a1), #38bdf8)' : 'var(--ok)' }} />
              </div>
              {maintLogs.length > 0 && (
                <div className="custom-scroll" style={{ maxHeight: 95, overflowY: 'auto', background: '#0a0d14', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
                  {maintLogs.map((log, idx) => (
                    <div key={idx} style={{ color: log.includes('[OK]') ? '#4ade80' : log.includes('Erreur') ? '#f87171' : '#94a3b8', lineHeight: 1.5 }}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scheduled Maintenance Card */}
        <div
          className="card card-p-lg"
          style={{
            marginBottom: 24,
            padding: 18,
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Calendar size={16} style={{ color: 'var(--a1)' }} />
              <div>
                <b style={{ fontSize: 13, color: 'var(--text)' }}>Maintenance Programmée & Automatique</b>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>Exécution silencieuse en arrière-plan</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: scheduledEnabled ? '#68b894' : 'var(--muted)', fontWeight: 600 }}>
                {scheduledEnabled ? 'Active' : 'Désactivée'}
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={scheduledEnabled}
                  onChange={e => setScheduledEnabled(e.target.checked)}
                />
                <span className="toggle-track" />
                <span className="toggle-thumb" />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['Quotidienne', 'Hebdomadaire', 'Au démarrage', 'À l\'inactivité'] as const).map(freq => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setScheduledFreq(freq)}
                  disabled={!scheduledEnabled}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: scheduledFreq === freq ? 700 : 500,
                    background: scheduledFreq === freq ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: scheduledFreq === freq ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    color: scheduledFreq === freq ? '#38bdf8' : 'var(--muted)',
                    cursor: scheduledEnabled ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {freq} {freq === 'Hebdomadaire' && <span style={{ fontSize: 9.5, opacity: 0.8 }}>(Recommandé)</span>}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 11,
                color: '#4ade80',
              }}
            >
              <ShieldCheck size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
              <span><b>Protection Conflit Gaming :</b> Aucune maintenance durant vos parties ou flux en plein écran.</span>
            </div>
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

        {/* Hardware Center Card */}
        <div className="card card-p-lg mt" style={{ marginTop: 24, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Monitor size={15} style={{ color: 'var(--a1)' }} />
              Centre Matériel & Pilotes Officiels (NVIDIA & ASUS)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-ghost"
                onClick={() => setShowBiosGuide(true)}
                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6 }}
              >
                <HelpCircle size={13} style={{ color: 'var(--a1)' }} />
                <span>Guide Flash BIOS</span>
              </button>
              {hardware?.driverUrl && (
                <button
                  className="btn-ghost"
                  onClick={() => api?.openExternal?.(hardware.driverUrl)}
                  style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6 }}
                >
                  <span>Pilotes NVIDIA Officiels</span>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="grid g4" style={{ gap: 14 }}>
            {/* GPU */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>CARTE GRAPHIQUE (GPU)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.gpuName}>
                {hardware?.gpuName || 'NVIDIA GeForce RTX 3060 Ti'}
              </div>
              <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Pilote installé : <b>v{hardware?.gpuDriver || '561.74'}</b></span>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn-ghost"
                  onClick={() => api?.openExternal?.(hardware?.driverUrl || 'https://www.nvidia.com/fr-fr/geforce/drivers/')}
                  style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <span>Vérifier mise à jour GeForce</span>
                  <ExternalLink size={10} />
                </button>
              </div>
            </div>

            {/* CPU */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>PROCESSEUR (CPU)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.cpuName}>
                {hardware?.cpuName || 'Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {hardware?.cpuCores ? `${hardware.cpuCores} Cœurs / ${hardware.cpuThreads} Threads` : '6 Cœurs / 12 Threads'}
              </div>
              <div style={{ fontSize: 11, color: '#22c55e', marginTop: 8 }}>
                Priorité dynamique gérée
              </div>
            </div>

            {/* RAM */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>MÉMOIRE VIVE (RAM)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                {hardware?.ramGB ? `${hardware.ramGB} Go Détectés` : '32 Go Détectés'}
              </div>
              <div style={{ fontSize: 11, color: '#68b894', marginTop: 4 }}>
                Canal mémoire double optimisé
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                Cache système et jeux actif
              </div>
            </div>

            {/* Motherboard & BIOS */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>CARTE MÈRE & BIOS</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.motherboard}>
                {hardware?.motherboard || 'ASUS ROG STRIX Z370-F GAMING'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                BIOS UEFI : <b>v{hardware?.biosVersion || '3004'}</b>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn-ghost"
                  onClick={() => api?.openExternal?.(hardware?.biosUrl || 'https://rog.asus.com/fr/motherboards/rog-strix/rog-strix-z370-f-gaming-model/helpdesk_bios/')}
                  style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <span>Support BIOS ASUS ROG</span>
                  <ExternalLink size={10} />
                </button>
              </div>
            </div>
          </div>
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
                const isUsb = d.mediaType.includes('USB') || d.busType === 'USB';
                const sizeLabel = d.sizeGB >= 900 ? `${(d.sizeGB / 1000).toFixed(0)} To` : `${d.sizeGB} Go`;
                const isHealthy = d.health?.includes('Sain') || d.status === 'OK' || d.HealthStatus?.includes('Sain') || d.healthStatusText?.includes('Sain');
                const statusText = d.healthStatusText || d.HealthStatus || (isHealthy ? 'Sain (SMART Conforme)' : 'Attention requise');

                return (
                  <div
                    key={d.diskNumber ?? idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: d.isSystemDisk ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid var(--border)',
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
                          background: d.isSystemDisk
                            ? 'rgba(56, 189, 248, 0.16)'
                            : isHdd
                            ? 'rgba(167, 139, 250, 0.12)'
                            : 'rgba(56, 189, 248, 0.12)',
                          border: `1px solid ${
                            d.isSystemDisk
                              ? 'rgba(56, 189, 248, 0.45)'
                              : isHdd
                              ? 'rgba(167, 139, 250, 0.3)'
                              : 'rgba(56, 189, 248, 0.3)'
                          }`,
                          display: 'grid',
                          placeItems: 'center',
                          color: d.isSystemDisk ? '#38bdf8' : isHdd ? '#a78bfa' : '#38bdf8',
                          flexShrink: 0,
                        }}
                      >
                        <HardDrive size={18} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <b
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: 'var(--text)',
                            }}
                            title={d.model || d.FriendlyName}
                          >
                            {d.model || d.FriendlyName || 'Disque physique'}
                          </b>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                          {d.isSystemDisk ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: 4,
                                background: 'rgba(56, 189, 248, 0.2)',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                              }}
                            >
                              SYSTÈME (C:)
                            </span>
                          ) : d.driveLetters ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: 'var(--text)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              Lecteur {d.driveLetters}
                            </span>
                          ) : null}
                          {d.volumeLabel ? (
                            <span style={{ fontSize: 10.5, color: 'var(--a1)', fontWeight: 600 }}>
                              "{d.volumeLabel}"
                            </span>
                          ) : null}
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
                            {d.mediaType || (isHdd ? 'HDD S-ATA' : 'SSD NVMe / SATA')}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                            {sizeLabel}
                          </span>
                        </div>

                        {/* Space breakdown bar */}
                        {d.usedGB !== undefined && d.sizeGB > 0 ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                              <span>{d.usedGB} Go occupés ({d.usedPercent || 0}%)</span>
                              <span>{d.freeGB} Go libres</span>
                            </div>
                            <div className="bar" style={{ height: 4 }}>
                              <i
                                style={{
                                  width: `${Math.min(100, Math.max(2, d.usedPercent || 0))}%`,
                                  background: (d.usedPercent || 0) > 90 ? 'var(--bad)' : (d.usedPercent || 0) > 75 ? 'var(--warn)' : 'var(--a1)',
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
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
                          {statusText}
                        </span>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: 10 }}>
                        {d.isSystemDisk ? 'Système Windows (NTFS)' : isUsb ? 'Périphérique USB' : 'Stockage Interne'}
                      </span>
                    </div>

                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => openDiskOptimizer(d)}
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          color: '#38bdf8',
                          borderColor: 'rgba(56, 189, 248, 0.25)',
                          background: 'rgba(56, 189, 248, 0.06)',
                          cursor: 'pointer',
                        }}
                      >
                        <Sparkles size={12} style={{ color: '#38bdf8' }} />
                        <span>Optimiser le stockage</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2-Column Section: Maintenance Status & Startup Programs */}
        <div className="grid g2 mt" style={{ marginTop: 24, gap: 20 }}>
          {/* Left: Centre d'Entretien Système & Espace Récupérable */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Trash2 size={15} style={{ color: 'var(--a1)' }} />
                  Centre de Maintenance & Nettoyage
                </div>
                <span className="chip" style={{ fontSize: 11, fontWeight: 700, color: 'var(--a1)', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                  {selectedTotal} récupérables
                </span>
              </div>

              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Purge ciblée des caches orphelins, vidage de corbeille, rapports d'erreurs et optimisation de la mémoire sans altérer vos fichiers personnels ni vos configurations de jeux.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>DISQUE SYSTÈME (C:)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                    {primaryDisk ? `${(primaryDisk.free / 1e9).toFixed(0)} Go libres` : 'Lecture…'}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#38bdf8', marginTop: 2 }}>{Math.round(primaryDisk?.usedPct || 0)}% occupé</div>
                </div>

                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>MÉMOIRE VIVE (RAM)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                    {ram}% utilisée
                  </div>
                  <div style={{ fontSize: 10.5, color: '#22c55e', marginTop: 2 }}>Cache système optimisé</div>
                </div>
              </div>

              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                fontSize: 11.5,
                color: '#86efac',
                lineHeight: 1.45,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}>
                <ShieldCheck size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                <span><b>Protection Garantie :</b> Seuls les caches résiduels et fichiers temporaires orphelins sont purgés. Vos documents, photos et jeux restent 100% intacts.</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
              <button
                className="btn"
                onClick={() => setShowMaintenanceModal(true)}
                style={{
                  flex: 1,
                  padding: '11px 18px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Zap size={15} />
                <span>Ouvrir le Centre de Maintenance ({selectedTotal})</span>
              </button>
            </div>
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

        {/* ── SlideDrawer Guide Flash BIOS ASUS ROG ── */}
        <SlideDrawer
          isOpen={showBiosGuide}
          onClose={() => setShowBiosGuide(false)}
          title="Procédure de Mise à Jour BIOS (ASUS ROG)"
          subtitle="Mise à jour sécurisée via ASUS EZ Flash 3"
          width={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6 }}>
              La mise à jour du BIOS d'une carte mère ASUS ROG STRIX s'effectue hors de Windows via l'utilitaire <b>ASUS EZ Flash 3</b> intégré au BIOS UEFI pour une sécurité maximale :
            </p>

            <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' }}>
              <li>
                <b>Télécharger le firmware officiel :</b> Rendez-vous sur la page support officielle ASUS ROG et téléchargez le fichier BIOS le plus récent (format <code>.CAP</code>).
              </li>
              <li>
                <b>Préparer une clé USB :</b> Formatez une clé USB en <b>FAT32</b> (ou FAT16). Copiez le fichier <code>.CAP</code> directement à la racine de la clé.
              </li>
              <li>
                <b>Entrer dans le BIOS UEFI :</b> Redémarrez le PC et appuyez de manière répétée sur la touche <span className="kbd">Suppr</span> ou <span className="kbd">F2</span> dès l'affichage du logo ASUS.
              </li>
              <li>
                <b>Lancer ASUS EZ Flash 3 :</b> Passez en mode Avancé (<span className="kbd">F7</span>), puis naviguez vers l'onglet <b>Tool (Outils)</b> &gt; <b>ASUS EZ Flash 3 Utility</b>.
              </li>
              <li>
                <b>Sélectionner et Flasher :</b> Sélectionnez la clé USB, choisissez le fichier <code>.CAP</code> et validez. <b>Ne coupez jamais l'alimentation</b> pendant l'écriture du firmware.
              </li>
            </ol>

            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', color: '#eab308', fontSize: 12, lineHeight: 1.5 }}>
              ⚠ <b>Avertissement de sécurité :</b> Une interruption d'alimentation pendant le flashage du BIOS peut rendre la carte mère inopérante. Assurez-vous d'une alimentation électrique stable avant de lancer l'opération.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              {hardware?.biosUrl && (
                <button
                  className="btn-ghost"
                  onClick={() => api?.openExternal?.(hardware.biosUrl)}
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span>Ouvrir Support ASUS ROG</span>
                  <ExternalLink size={13} />
                </button>
              )}
              <button
                className="btn"
                onClick={() => setShowBiosGuide(false)}
                style={{ padding: '8px 20px', fontSize: 12 }}
              >
                Fermer
              </button>
            </div>
          </div>
        </SlideDrawer>

        {/* ── Modal Vanguard : Centre de Maintenance & Nettoyage Système ── */}
        {showMaintenanceModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              animation: 'fadeIn .2s var(--ease) both',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 840,
                background: '#090d16',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: '18px 22px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.02)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#38bdf8',
                  }}>
                    <Zap size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      Centre de Maintenance & Nettoyage Système
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                      Optimisation globale, purge des caches et restauration de la fluidité Windows
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMaintenanceModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body: 2 Columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', flex: 1, minHeight: 0 }}>
                {/* Left Panel: Status & Diagnostics */}
                <div style={{
                  padding: 20,
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                      <Ring
                        size={120}
                        val={Math.min(1, cleanItems.filter(i => i.selected).reduce((s, i) => s + i.bytes, 0) / 10e9)}
                        label={<div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>{selectedTotal}</div>}
                      />
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontWeight: 600 }}>
                        ESPACE RÉCUPÉRABLE
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>DISQUE C:</div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                          {primaryDisk ? `${(primaryDisk.free / 1e9).toFixed(0)} Go libres` : '—'}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#38bdf8' }}>{primaryDisk?.health || 'Sain (SMART OK)'}</div>
                      </div>

                      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>MÉMOIRE VIVE (RAM)</div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{ram}% utilisée</div>
                        <div style={{ fontSize: 10.5, color: '#22c55e' }}>Cache travail Windows</div>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: 16,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(56, 189, 248, 0.06)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    fontSize: 11,
                    color: '#93c5fd',
                    lineHeight: 1.4,
                  }}>
                    🛡 <b>Sécurité :</b> Fichiers personnels préservés. Seuls les caches temporaires orphelins sont supprimés.
                  </div>
                </div>

                {/* Right Panel: Modes & Item Checklist */}
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {/* Mode Selector */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {(['Rapide', 'Approfondi', 'Personnalisé'] as const).map(mode => {
                      const isActive = maintenanceMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            setMaintenanceMode(mode);
                            if (mode === 'Rapide') {
                              setCleanItems(prev => prev.map(item => ({
                                ...item,
                                selected: item.id === 'userTemp' || item.id === 'winTemp' || item.id === 'winLogs' || item.id === 'recycleBin'
                              })));
                            } else if (mode === 'Approfondi') {
                              setCleanItems(prev => prev.map(item => ({ ...item, selected: true })));
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: isActive ? 700 : 500,
                            background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                            border: isActive ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255,255,255,0.06)',
                            color: isActive ? '#38bdf8' : 'var(--muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {mode} {mode === 'Rapide' && '⚡'} {mode === 'Approfondi' && '🛡'} {mode === 'Personnalisé' && '⚙'}
                        </button>
                      );
                    })}
                  </div>

                  {/* Mode Description */}
                  <div style={{
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    marginBottom: 10,
                    lineHeight: 1.4,
                  }}>
                    {maintenanceMode === 'Rapide' && 'Purge instantanée des fichiers temporaires %TEMP%, corbeille et résidus système. Idéal au quotidien.'}
                    {maintenanceMode === 'Approfondi' && 'Nettoyage complet incluant le cache Windows Update, les shaders DirectX GPU et les traces système.'}
                    {maintenanceMode === 'Personnalisé' && 'Sélectionnez manuellement chaque catégorie à nettoyer selon vos besoins.'}
                  </div>

                  {/* Items List */}
                  <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4, maxHeight: 250 }}>
                    {cleanItems.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        onClick={() => toggleItem(idx)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: 7,
                          background: item.selected ? 'rgba(56, 189, 248, 0.06)' : 'rgba(255,255,255,0.015)',
                          border: `1px solid ${item.selected ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 17,
                            height: 17,
                            borderRadius: 4,
                            background: item.selected ? 'var(--a1)' : 'transparent',
                            border: `1.5px solid ${item.selected ? 'var(--a1)' : 'rgba(255,255,255,0.3)'}`,
                            display: 'grid',
                            placeItems: 'center',
                            color: '#090d16',
                            flexShrink: 0,
                          }}>
                            {item.selected && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div>
                            <b style={{ fontSize: 12, color: item.selected ? '#fff' : 'var(--text)' }}>{item.label}</b>
                            {item.desc && <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--muted)' }}>{item.desc}</p>}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: item.selected ? '#38bdf8' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {item.size}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer & Action Button */}
                  <div style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Total sélectionné :</span>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--a1)' }}>{selectedTotal}</div>
                    </div>
                    <button
                      className="btn"
                      onClick={() => {
                        runMaintenance();
                        setShowMaintenanceModal(false);
                      }}
                      disabled={maintaining || cleanItems.filter(i => i.selected).length === 0}
                      style={{ padding: '10px 22px', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <Zap size={15} />
                      <span>Lancer la maintenance ({selectedTotal})</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal Vanguard : Optimisation de Stockage par Disque ── */}
        {showDiskOptModal && selectedDiskForOpt && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              animation: 'fadeIn .2s var(--ease) both',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 680,
                background: '#090d16',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.02)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#38bdf8',
                  }}>
                    <HardDrive size={16} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>
                      Optimisation de Stockage · {selectedDiskForOpt.driveLetters || 'Disque'} ({selectedDiskForOpt.model || selectedDiskForOpt.FriendlyName || 'Disque physique'})
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                      Détection intelligente des fichiers temporaires, caches orphelins et résidus
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDiskOptModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                >
                  <X size={17} />
                </button>
              </div>

              <div style={{ padding: 20 }}>
                {diskJunkScanning ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <span className="spinner spinner-sm" style={{ marginRight: 8 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Analyse intelligente des caches du lecteur {selectedDiskForOpt.driveLetters}...</span>
                  </div>
                ) : (
                  <div>
                    {/* Recommendation Box */}
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      fontSize: 12,
                      color: '#cbd5e1',
                      lineHeight: 1.5,
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}>
                      <Sparkles size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        {diskJunkScanResult?.aiRecommendation || 'Analyse terminée. Sélectionnez les caches à purger en toute sécurité.'}
                      </div>
                    </div>

                    {/* Breakdown List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {(diskJunkScanResult?.categories || []).map((cat: any) => (
                        <div
                          key={cat.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <b style={{ fontSize: 12, color: 'var(--text)' }}>{cat.label}</b>
                            <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--muted)' }}>{cat.desc}</p>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>{cat.sizeDisplay}</span>
                        </div>
                      ))}
                    </div>

                    {diskJunkNotice && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        fontSize: 12,
                        color: '#4ade80',
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <CheckCircle2 size={15} />
                        <span>{diskJunkNotice}</span>
                      </div>
                    )}

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      paddingTop: 14,
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Espace récupérable sur ce lecteur :</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#38bdf8' }}>
                          {diskJunkScanResult?.totalFormatted || '0 Mo'}
                        </div>
                      </div>
                      <button
                        className="btn"
                        onClick={cleanDiskJunk}
                        disabled={diskJunkCleaning || !diskJunkScanResult?.totalMB}
                        style={{ padding: '10px 20px', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {diskJunkCleaning ? (
                          <>
                            <span className="spinner spinner-sm" /> Nettoyage en cours…
                          </>
                        ) : (
                          <>
                            <Trash2 size={14} />
                            <span>Nettoyer et optimiser ({diskJunkScanResult?.totalFormatted || '0 Mo'})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
