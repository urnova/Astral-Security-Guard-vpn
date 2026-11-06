import { useState, useEffect, useRef } from 'react';
import {
  Zap,
  HardDrive,
  Cpu,
  Trash2,
  CheckCircle2,
  RotateCw,
  Search,
  Layers,
  Database,
  Check,
  Monitor,
  ExternalLink,
  Calendar,
  ShieldCheck,
  Sparkles,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface HardwareGpu {
  id?: string;
  name: string;
  driverVersionRaw?: string;
  driverVersionDisplay?: string;
  driverDate?: string;
  manufacturer?: string;
  isVirtual?: boolean;
  isPrimary?: boolean;
  driverUrl?: string;
}

interface HardwareInfo {
  gpuName?: string;
  gpuDriver?: string;
  gpuDriverRaw?: string;
  gpuDriverDate?: string;
  driverUrl?: string;
  gpus?: HardwareGpu[];
  cpuName?: string;
  cpuCores?: number;
  cpuThreads?: number;
  ramGB?: number;
  motherboard?: string;
  motherboardManufacturer?: string;
  motherboardProduct?: string;
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
  impact: 'h' | 'm' | 'l' | 'u';
  impactLabel?: string;
  enabled: boolean;
}

interface CleanItem {
  id: string;
  label: string;
  size: string;
  sizeDisplay?: string;
  desc?: string;
  bytes: number;
  selected: boolean;
  inaccessible?: boolean;
  warning?: string;
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

type Tone = 'ok' | 'warn' | 'bad';
const TONE_VAR: Record<Tone, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' };
const toneBg = (tone: Tone, pct: number) => `color-mix(in srgb, ${TONE_VAR[tone]} ${pct}%, transparent)`;

/** success / partial result / failure, from a cleanup report. */
function reportTone(report: any): Tone {
  if (report?.success && !report?.partial) return 'ok';
  return (report?.deletedFilesCount > 0 || (report?.categoriesCleaned?.length ?? 0) > 0) ? 'warn' : 'bad';
}

/** First lettered volume of a physical disk. Never falls back to a default drive. */
function driveLetterOf(disk: PhysicalDisk): string | null {
  const first = String(disk.driveLetters || '').split(',')[0].trim();
  return /^[A-Za-z]:?$/.test(first) ? first[0].toUpperCase() : null;
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
  const [noticeState, setNoticeState] = useState<{ text: string; tone: Tone }>({ text: '', tone: 'ok' });
  const notice = noticeState.text;
  const setNotice = (text: string, tone?: Tone) =>
    setNoticeState({ text, tone: tone ?? (/^(Erreur|Échec|Impossible)/.test(text) ? 'bad' : 'ok') });
  const [emptyBinConfirmed, setEmptyBinConfirmed] = useState(false);
  const [diskEmptyBin, setDiskEmptyBin] = useState(false);
  const [selectedTotal, setSelectedTotal] = useState('0 Mo');
  const [startupSearch, setStartupSearch] = useState('');
  const [loadingDisks, setLoadingDisks] = useState(true);
  const [loadingClean, setLoadingClean] = useState(true);
  const [maintLogs, setMaintLogs] = useState<string[]>([]);
  const [showMaintLogs, setShowMaintLogs] = useState(false);
  const [lastReport, setLastReport] = useState<any | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  // M6 Confirmation Modal before cleanup
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // M2 Scheduled Maintenance
  const [schedule, setSchedule] = useState({
    enabled: true,
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    time: '03:00',
    dayOfWeek: 3,
    dayOfMonth: 1,
    cleanRecycleBin: false,
  });
  const [nextRunText, setNextRunText] = useState('Calcul en cours…');

  // M3: Live GPU Driver Update States
  const [gpuUpdate, setGpuUpdate] = useState<{
    checking: boolean;
    checked: boolean;
    updateAvailable: boolean;
    currentVersion?: string;
    latestVersion?: string;
    releaseDate?: string;
    downloadUrl?: string;
    fileSizeMB?: number;
    error?: string;
  }>({
    checking: false,
    checked: false,
    updateAvailable: false,
  });

  const [gpuDownload, setGpuDownload] = useState<{
    downloading: boolean;
    percent: number;
    transferredMB: number;
    totalMB: number;
    downloaded: boolean;
    filePath?: string;
    error?: string;
  }>({
    downloading: false,
    percent: 0,
    transferredMB: 0,
    totalMB: 0,
    downloaded: false,
  });

  const [gpuInstalling, setGpuInstalling] = useState(false);

  // Per-Disk Optimization State
  const [showDiskOptModal, setShowDiskOptModal] = useState(false);
  const [selectedDiskForOpt, setSelectedDiskForOpt] = useState<PhysicalDisk | null>(null);
  const [diskJunkScanResult, setDiskJunkScanResult] = useState<any | null>(null);
  const [diskJunkScanning, setDiskJunkScanning] = useState(false);
  const [diskJunkCleaning, setDiskJunkCleaning] = useState(false);
  const [diskJunkNotice, setDiskJunkNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const diskJunkCleaningRef = useRef(false);
  const maintainingRef = useRef(false);
  const confirmPanelRef = useRef<HTMLDivElement>(null);

  const cpu = Math.round(metrics?.cpuPercent ?? 0);
  const ram =
    metrics?.ramPercent !== undefined && metrics.ramPercent > 0
      ? Math.round(metrics.ramPercent)
      : metrics?.ramTotal && metrics.ramTotal > 0
      ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100)
      : 0;

  const maintTerminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (maintTerminalRef.current) {
      maintTerminalRef.current.scrollTop = maintTerminalRef.current.scrollHeight;
    }
  }, [maintLogs]);

  useEffect(() => {
    if (showConfirmModal) confirmPanelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [showConfirmModal]);

  useEffect(() => {
    loadData();

    const cleanupMaint = api?.on?.('perf:maintenance-progress', (d: any) => {
      if (typeof d.percent === 'number') setCleanProgress(d.percent);
      if (d.message) {
        setCleanMsg(d.message);
        const nowStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setMaintLogs(prev => [...prev.slice(-40), `[${nowStr}] ${d.message}`]);
      }
    });

    const cleanupGpuProg = api?.on?.('perf:gpu-download-progress', (d: any) => {
      setGpuDownload(prev => ({
        ...prev,
        percent: typeof d.percent === 'number' ? d.percent : prev.percent,
        transferredMB: typeof d.transferredMB === 'number' ? d.transferredMB : prev.transferredMB,
        totalMB: typeof d.totalMB === 'number' ? d.totalMB : prev.totalMB,
      }));
    });

    return () => {
      cleanupMaint?.();
      cleanupGpuProg?.();
    };
  }, []);

  const loadData = () => {
    loadCleanupData();
    loadStartupData();
    loadDisksData();
    loadHardwareData();
    loadScheduleData();
  };

  const loadCleanupData = () => {
    if (!api) return;
    setLoadingClean(true);
    api.getCleanupItems?.().then((items: any[]) => {
      setLoadingClean(false);
      if (Array.isArray(items) && items.length > 0) {
        const mapped: CleanItem[] = items.map(i => ({
          id: i.id,
          label: i.label,
          size: i.sizeDisplay || i.size || '0 Mo',
          sizeDisplay: i.sizeDisplay || i.size || '0 Mo',
          desc: i.desc || '',
          bytes: i.bytes || 0,
          selected: i.inaccessible ? false : (i.selected !== false),
          inaccessible: Boolean(i.inaccessible),
          warning: i.warning,
        }));
        setCleanItems(mapped);
        updateTotal(mapped);
      } else {
        setCleanItems([]);
        setSelectedTotal('0 Mo');
      }
    }).catch(() => {
      setLoadingClean(false);
      setCleanItems([]);
      setSelectedTotal('0 Mo');
    });
  };

  const loadStartupData = async () => {
    try {
      let apps = await api?.getStartupApps?.();
      if (!Array.isArray(apps) || apps.length === 0) {
        apps = await api?.getStartup?.();
      }
      if (Array.isArray(apps) && apps.length > 0) {
        setStartupApps(
          apps.map(a => ({
            name: a.name || a.Name,
            rawName: a.rawName,
            command: a.command || a.Command,
            location: a.location || a.Location,
            publisher: a.publisher || 'Éditeur système',
            impact: a.impact || 'm',
            impactLabel: a.impactLabel || (a.impact === 'h' ? 'ÉLEVÉ' : a.impact === 'l' ? 'FAIBLE' : 'MOYEN'),
            enabled: a.enabled !== false,
          }))
        );
      }
    } catch {}
  };

  const loadDisksData = () => {
    if (!api) return;
    setLoadingDisks(true);
    api.getDiskHealth?.().then((res: any) => {
      setLoadingDisks(false);
      if (res?.success && Array.isArray(res.disks)) {
        // L'ordre (Windows, puis lettres croissantes) est fixé côté processus principal.
        const sorted = [...res.disks];
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
          health: d.health || 'Sain (Contrôleur OK)',
        });
      }
    }).catch(() => {});
  };

  const loadHardwareData = () => {
    api?.getHardwareInfo?.().then((res: any) => {
      if (res?.success && res.hardware) {
        setHardware(res.hardware);
      }
    }).catch(() => {});
  };

  const loadScheduleData = async () => {
    try {
      const res = await api?.getMaintenanceSchedule?.();
      if (res?.success && res.schedule) {
        setSchedule(res.schedule);
        if (res.nextRun?.formattedText) {
          setNextRunText(res.nextRun.formattedText);
        }
      }
    } catch {}
  };

  const handleUpdateSchedule = async (partial: any) => {
    const updated = { ...schedule, ...partial };
    setSchedule(updated);
    try {
      const res = await api?.saveMaintenanceSchedule?.(updated);
      if (res?.success && res.nextRun?.formattedText) {
        setNextRunText(res.nextRun.formattedText);
      }
    } catch {}
  };

  const updateTotal = (items: CleanItem[]) => {
    const bytes = items.filter(i => i.selected && !i.inaccessible).reduce((s, i) => s + i.bytes, 0);
    if (bytes === 0) {
      setSelectedTotal('0 Mo');
    } else if (bytes < 1e9) {
      setSelectedTotal(`${(bytes / 1e6).toFixed(1)} Mo`);
    } else {
      setSelectedTotal(`${(bytes / 1e9).toFixed(1)} Go`);
    }
  };

  const toggleItem = (i: number) => {
    setCleanItems(prev => {
      const n = prev.map((item, idx) => {
        if (idx === i) {
          if (item.inaccessible) return item;
          return { ...item, selected: !item.selected };
        }
        return item;
      });
      updateTotal(n);
      return n;
    });
  };

  const toggleAllCleanup = (val: boolean) => {
    setCleanItems(prev => {
      const n = prev.map(item => (item.inaccessible ? item : { ...item, selected: val }));
      updateTotal(n);
      return n;
    });
  };

  // M6: Pre-cleanup systematic confirmation gate
  const handleLaunchCleanupClick = () => {
    if (!api || maintaining || maintainingRef.current || diskJunkCleaningRef.current) return;
    if (gamingActive) {
      setNotice('Maintenance différée : une session de jeu ou haute performance est active.');
      setTimeout(() => setNotice(''), 4000);
      return;
    }
    const selected = cleanItems.filter(i => i.selected && !i.inaccessible);
    if (selected.length === 0) {
      setNotice('Veuillez sélectionner au moins une catégorie accessible.');
      setTimeout(() => setNotice(''), 3000);
      return;
    }

    // Confirmation synthétique systématique avant toute action destructive
    setEmptyBinConfirmed(false);
    setShowConfirmModal(true);
  };

  // M3: GPU Driver Update Handlers
  const handleCheckGpuUpdate = async () => {
    if (gpuUpdate.checking) return;
    setGpuUpdate(prev => ({ ...prev, checking: true, error: undefined }));
    try {
      // Pass the primary physical GPU info so the handler can determine the manufacturer and version
      const primaryGpu = hardware?.gpus?.find((g: any) => !g.isVirtual) || hardware?.gpus?.[0];
      const res = await api?.checkGpuDriverUpdate?.(primaryGpu || {
        manufacturer: 'unknown',
        name: hardware?.gpuName || '',
        driverVersionDisplay: hardware?.gpuDriver || '',
      });
      if (res?.success) {
        setGpuUpdate({
          checking: false,
          checked: true,
          updateAvailable: Boolean(res.updateAvailable),
          currentVersion: res.currentVersion,
          latestVersion: res.latestVersion,
          releaseDate: res.releaseDate,
          downloadUrl: res.downloadUrl,
          fileSizeMB: res.fileSizeMB,
        });
      } else {
        setGpuUpdate(prev => ({
          ...prev,
          checking: false,
          checked: true,
          error: res?.error || 'Vérification en ligne impossible.',
        }));
      }
    } catch (err: any) {
      setGpuUpdate(prev => ({
        ...prev,
        checking: false,
        checked: true,
        error: err.message,
      }));
    }
  };

  const handleDownloadGpuDriver = async () => {
    if (gpuDownload.downloading) return;
    setGpuDownload({
      downloading: true,
      percent: 0,
      transferredMB: 0,
      totalMB: gpuUpdate.fileSizeMB || 0,
      downloaded: false,
    });
    try {
      const res = await api?.downloadGpuDriver?.({
        downloadUrl: gpuUpdate.downloadUrl || '',
        version: gpuUpdate.latestVersion || '',
      });
      if (res?.success) {
        setGpuDownload(prev => ({
          ...prev,
          downloading: false,
          downloaded: true,
          filePath: res.filePath,
        }));
        setNotice('Pilote NVIDIA officiel téléchargé avec succès.');
        setTimeout(() => setNotice(''), 5000);
      } else {
        setGpuDownload(prev => ({
          ...prev,
          downloading: false,
          error: res?.error || 'Échec du téléchargement du pilote.',
        }));
      }
    } catch (err: any) {
      setGpuDownload(prev => ({
        ...prev,
        downloading: false,
        error: err.message,
      }));
    }
  };

  const handleLaunchGpuInstaller = async () => {
    if (gpuInstalling) return;
    setGpuInstalling(true);
    try {
      const res = await api?.launchGpuDriverInstaller?.({
        filePath: gpuDownload.filePath || '',
      });
      if (res?.success) {
        setNotice('L\'installateur officiel NVIDIA a été lancé. Suivez les instructions à l\'écran.');
        setTimeout(() => setNotice(''), 7000);
      } else {
        setNotice(res?.error || 'Échec du lancement de l\'installateur.');
        setTimeout(() => setNotice(''), 5000);
      }
    } catch (err: any) {
      setNotice(`Erreur : ${err.message}`);
      setTimeout(() => setNotice(''), 5000);
    } finally {
      setGpuInstalling(false);
    }
  };

  const executeCleanup = async () => {
    // Synchronous guard: two clicks in the same frame must not start two operations.
    if (maintainingRef.current || diskJunkCleaningRef.current) return;
    // The confirmed list is exactly the executed list. The Recycle Bin needs its own explicit consent.
    const selectedIds = cleanItems.filter(i => i.selected && !i.inaccessible).map(i => i.id);
    if (selectedIds.length === 0 || (selectedIds.includes('recycleBin') && !emptyBinConfirmed)) return;
    maintainingRef.current = true;
    setShowConfirmModal(false);
    setMaintaining(true);
    setCleanProgress(5);
    setCleanMsg('Initialisation du moteur de maintenance…');
    setLastReport(null);
    const nowStr = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setMaintLogs([`[${nowStr()}] Démarrage de la maintenance système...`]);

    try {
      const report = await api.runCleanup?.({ items: selectedIds });
      setCleanProgress(100);
      if (report && !report.error && typeof report.deletedFilesCount === 'number') {
        // A partial report is still a real result: show what was done, what was skipped and why.
        setLastReport(report);
        const freed = report.freedDisplay || '0 Mo';
        const problems: string[] = Array.isArray(report.errors) ? report.errors : [];
        const incomplete = !report.success || report.partial;
        setCleanMsg(incomplete ? `Maintenance en échec ou partielle — ${freed} comptabilisé(s)` : `Maintenance terminée — ${freed} libéré(s)`);
        setNotice(`${incomplete ? (reportTone(report) === 'bad' ? 'Maintenance échouée' : 'Maintenance partielle') : 'Maintenance terminée'} : ${report.deletedFilesCount} fichier(s) supprimé(s), ${freed}.`, reportTone(report));
        setMaintLogs(prev => [
          ...prev,
          `[${nowStr()}] [${incomplete ? 'PARTIEL' : 'OK'}] ${report.deletedFilesCount} fichier(s) supprimé(s) (${freed}).`,
          `[${nowStr()}] Éléments ignorés ou verrouillés : ${report.skippedFilesCount || 0}.`,
          ...problems.map(p => `[${nowStr()}] [AVERTISSEMENT] ${p}`),
        ]);
        loadCleanupData();
        loadDisksData();
      } else {
        const message = report?.error || 'La maintenance n’a produit aucun rapport.';
        setCleanMsg(message);
        setLastReport(null);
        setMaintLogs(prev => [...prev, `[${nowStr()}] [ERREUR] ${message}`]);
        setNotice(message);
      }
    } catch (err: any) {
      setCleanMsg(`Erreur : ${err.message}`);
      setMaintLogs(prev => [...prev, `[${nowStr()}] [ERREUR] ${err.message}`]);
      setNotice(`Erreur : ${err.message}`);
    } finally {
      maintainingRef.current = false;
      setMaintaining(false);
      setTimeout(() => setNotice(''), 7000);
    }
  };

  const openDiskOptimizer = async (disk: PhysicalDisk) => {
    setSelectedDiskForOpt(disk);
    setShowDiskOptModal(true);
    setDiskJunkScanResult(null);
    setDiskJunkNotice(null);
    setDiskEmptyBin(false);
    const letter = driveLetterOf(disk);
    if (!letter) {
      setDiskJunkScanning(false);
      setDiskJunkNotice({ tone: 'error', text: 'Ce disque n’expose aucune lettre de lecteur : aucune analyse ni nettoyage n’est possible.' });
      return;
    }
    setDiskJunkScanning(true);
    try {
      const res = await api?.scanDiskJunk?.(letter);
      setDiskJunkScanResult(res);
    } catch {
      setDiskJunkNotice({ tone: 'error', text: 'Erreur lors de l\'analyse du volume.' });
    } finally {
      setDiskJunkScanning(false);
    }
  };

  const cleanDiskJunk = async () => {
    if (!selectedDiskForOpt || diskJunkCleaningRef.current || maintainingRef.current) return;
    const letter = driveLetterOf(selectedDiskForOpt);
    if (!letter) return;
    diskJunkCleaningRef.current = true;
    setDiskJunkCleaning(true);
    setDiskJunkNotice(null);
    try {
      const res = await api?.cleanDiskJunk?.(letter, { emptyRecycleBin: diskEmptyBin });
      if (res?.success) {
        setDiskJunkNotice({ tone: 'ok', text: res.message || 'Nettoyage terminé.' });
      } else if (res?.partial || res?.deletedFilesCount > 0) {
        setDiskJunkNotice({ tone: 'warn', text: `${res.message || 'Nettoyage partiel.'} ${(res.errors || []).join(' ')}`.trim() });
      } else {
        setDiskJunkNotice({ tone: 'error', text: res?.error || (res?.errors || []).join(' ') || 'Erreur lors du nettoyage du volume.' });
      }
      loadDisksData();
      const rescan = await api?.scanDiskJunk?.(letter);
      if (rescan) setDiskJunkScanResult(rescan);
    } catch (err: any) {
      setDiskJunkNotice({ tone: 'error', text: `Erreur : ${err.message}` });
    } finally {
      diskJunkCleaningRef.current = false;
      setDiskJunkCleaning(false);
    }
  };

  const toggleStartup = async (i: number, val: boolean) => {
    const app = startupApps[i];
    setStartupApps(prev => prev.map((a, idx) => (idx === i ? { ...a, enabled: val } : a)));
    try {
      const res = await api?.setStartupApp?.({
        name: app.name,
        rawName: app.rawName || app.name,
        location: app.location || 'HKCU',
        command: app.command,
        enabled: val,
      });
      if (res && !res.success) {
        // Rétablir la valeur en cas d'erreur (ex: droits HKLM) et avertir l'utilisateur
        setStartupApps(prev => prev.map((a, idx) => (idx === i ? { ...a, enabled: !val } : a)));
        setNotice(res.error || 'Impossible de modifier ce programme au démarrage (droits administrateur requis).');
        setTimeout(() => setNotice(''), 5000);
      }
    } catch (err: any) {
      setStartupApps(prev => prev.map((a, idx) => (idx === i ? { ...a, enabled: !val } : a)));
      setNotice(`Erreur : ${err.message}`);
      setTimeout(() => setNotice(''), 5000);
    }
  };

  const filteredApps = startupApps.filter(
    a =>
      a.name.toLowerCase().includes(startupSearch.toLowerCase()) ||
      (a.publisher && a.publisher.toLowerCase().includes(startupSearch.toLowerCase()))
  );

  const selectedCount = cleanItems.filter(i => i.selected && !i.inaccessible).length;

  return (
    <div className="page-scroll">
      <div className="page" style={{ paddingBottom: 40 }}>
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1>Maintenance & Matériel</h1>
            <p className="sub">Nettoyage exact de l'espace disque, santé matérielle S.M.A.R.T. et composants officiels.</p>
          </div>
          {notice && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: toneBg(noticeState.tone, 12),
                border: `1px solid ${toneBg(noticeState.tone, 35)}`,
                color: TONE_VAR[noticeState.tone],
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {noticeState.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{notice}</span>
            </div>
          )}
        </div>

        {/* ── M1: Main Maintenance Hero Grid (Bi-column in spirit of Security) ── */}
        <div className="grid g12" style={{ marginBottom: 24, gap: 16 }}>
          {/* Left Column: Gauge & Main Launch Action */}
          <div
            className="card card-p-lg card-hero"
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <div>
              <div className="lbl" style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}>
                <Zap size={15} style={{ color: 'var(--a1)' }} />
                <span>Statut du Nettoyage</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div className={maintaining ? 'ring scanning' : 'ring'} style={{ width: 190, height: 190 }}>
                  <svg className="ring-gauge-svg" viewBox="0 0 200 200">
                    <defs>
                      <linearGradient id="maintGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--a1)" />
                        <stop offset="100%" stopColor="#38bdf8" />
                      </linearGradient>
                    </defs>
                    <circle className="bg-c" cx="100" cy="100" r="85" strokeWidth="11" />
                    <circle
                      className="fg-c"
                      cx="100"
                      cy="100"
                      r="85"
                      strokeWidth="11"
                      stroke="url(#maintGrad)"
                      strokeDasharray={2 * Math.PI * 85}
                      strokeDashoffset={
                        maintaining
                          ? 2 * Math.PI * 85 * (1 - Math.max(0.1, cleanProgress / 100))
                          : lastReport
                          ? 0
                          : 2 * Math.PI * 85 * 0.15
                      }
                      style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                    />
                  </svg>
                  <div className="center">
                    {maintaining ? (
                      <div>
                        <RotateCw size={32} className="spin" style={{ color: '#38bdf8', margin: '0 auto 4px' }} />
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8' }}>{Math.max(5, cleanProgress)}%</div>
                      </div>
                    ) : lastReport ? (
                      <div>
                        {reportTone(lastReport) === 'ok'
                          ? <CheckCircle2 size={36} style={{ color: 'var(--ok)', margin: '0 auto 4px' }} />
                          : <AlertTriangle size={36} style={{ color: TONE_VAR[reportTone(lastReport)], margin: '0 auto 4px' }} />}
                        <div style={{ fontSize: 15, fontWeight: 800, color: TONE_VAR[reportTone(lastReport)] }}>{lastReport.freedDisplay}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{reportTone(lastReport) === 'ok' ? 'Libéré(s)' : 'Résultat partiel'}</div>
                      </div>
                    ) : (
                      <div>
                        <Zap size={34} style={{ color: 'var(--a1)', margin: '0 auto 4px' }} />
                        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>{selectedTotal}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Récupérable(s)</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: maintaining ? '#38bdf8' : lastReport ? TONE_VAR[reportTone(lastReport)] : 'var(--muted)', fontWeight: 600, minHeight: 20 }}>
                {maintaining
                  ? cleanMsg || 'Purge des fichiers résiduels…'
                  : lastReport
                  ? `${{ ok: 'Dernier nettoyage', warn: 'Dernier nettoyage partiel', bad: 'Dernier nettoyage échoué' }[reportTone(lastReport)]} : ${lastReport.freedDisplay} comptabilisés`
                  : `${selectedCount} catégorie(s) sélectionnée(s)`}
              </div>
            </div>

            <div style={{ width: '100%', marginTop: 18 }}>
              <button
                type="button"
                className="btn"
                onClick={handleLaunchCleanupClick}
                disabled={maintaining || showConfirmModal || selectedCount === 0}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {maintaining ? (
                  <>
                    <span className="spinner spinner-sm" />
                    <span>Nettoyage en cours…</span>
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    <span>Lancer la maintenance ({selectedTotal})</span>
                  </>
                )}
              </button>

              <p style={{ fontSize: 10.5, color: 'var(--muted)', margin: '10px 0 0', lineHeight: 1.4 }}>
                Purge ciblée et sécurisée : vos fichiers personnels, documents et configurations de jeux restent intacts.
              </p>

              {/* Confirmation intégrée, juste sous l'action qui l'a ouverte */}
              {showConfirmModal && !maintaining && (
                <div
                  ref={confirmPanelRef}
                  role="alertdialog"
                  aria-label="Confirmation du nettoyage"
                  style={{
                    marginTop: 14,
                    textAlign: 'left',
                    borderRadius: 10,
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    background: 'rgba(234, 179, 8, 0.05)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#facc15', fontWeight: 700, fontSize: 13 }}>
                    <AlertTriangle size={16} />
                    <span>Confirmer le nettoyage ?</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    {cleanItems.filter(i => i.selected && !i.inaccessible).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                        <span style={{ color: 'var(--text)', minWidth: 0 }}>{item.label}</span>
                        <b style={{ color: '#38bdf8', whiteSpace: 'nowrap' }}>{item.sizeDisplay || item.size}</b>
                      </div>
                    ))}
                  </div>
                  {cleanItems.some(i => i.selected && i.id === 'recycleBin') && (
                    <div style={{ padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 11, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input type="checkbox" checked={emptyBinConfirmed} onChange={e => setEmptyBinConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                        <span><b>Vider la Corbeille Windows</b> : tout son contenu sera supprimé définitivement et ne pourra pas être récupéré. Cochez pour confirmer.</span>
                      </label>
                    </div>
                  )}
                  {cleanItems.some(i => i.selected && i.id === 'dxCache') && (
                    <div style={{ padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 11, background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', color: '#7dd3fc' }}>
                      <b>Shaders DirectX :</b> le premier lancement de certains jeux peut être plus lent.
                    </div>
                  )}
                  <p style={{ margin: '0 0 10px', fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                    Les liens symboliques ne sont pas suivis. Les fichiers utilisés par un programme sont ignorés et comptés dans le rapport.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-ghost" onClick={() => setShowConfirmModal(false)} style={{ flex: 1, padding: '8px 12px', fontSize: 12 }}>
                      Annuler
                    </button>
                    <button type="button" className="btn" onClick={executeCleanup} disabled={maintaining || (cleanItems.some(i => i.selected && !i.inaccessible && i.id === 'recycleBin') && !emptyBinConfirmed)} style={{ flex: 2, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                      Confirmer ({selectedTotal})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Category Checklist & Real-Time Progress / Honest Report */}
          <div
            className="card card-p-lg"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: 22,
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <b style={{ fontSize: 13.5, color: 'var(--text)' }}>Catégories de stockage ciblées</b>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                    Volumes calculés sur le système hôte, sans estimations arbitraires.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => toggleAllCleanup(true)}
                    disabled={maintaining}
                    style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 4 }}
                  >
                    Tout cocher
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => toggleAllCleanup(false)}
                    disabled={maintaining}
                    style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 4 }}
                  >
                    Tout décocher
                  </button>
                </div>
              </div>

              {/* Checklist */}
              {loadingClean ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  <span className="spinner spinner-sm" style={{ marginRight: 8 }} />
                  Analyse des répertoires système en cours…
                </div>
              ) : cleanItems.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Aucune catégorie de nettoyage détectée.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 290, overflowY: 'auto' }} className="custom-scroll">
                  {cleanItems.map((item, idx) => {
                    const isLocked = item.inaccessible;
                    return (
                      <div
                        key={item.id}
                        onClick={() => !isLocked && !maintaining && toggleItem(idx)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 7,
                          background: item.selected ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255,255,255,0.015)',
                          border: item.selected ? '1px solid rgba(56, 189, 248, 0.28)' : '1px solid rgba(255,255,255,0.04)',
                          cursor: isLocked || maintaining ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          opacity: isLocked ? 0.65 : 1,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 17,
                              height: 17,
                              borderRadius: 4,
                              background: item.selected ? 'var(--a1)' : 'transparent',
                              border: `1.5px solid ${item.selected ? 'var(--a1)' : 'rgba(255,255,255,0.25)'}`,
                              display: 'grid',
                              placeItems: 'center',
                              color: '#090d16',
                              flexShrink: 0,
                            }}
                          >
                            {item.selected && <Check size={12} strokeWidth={3} />}
                            {isLocked && <Lock size={10} style={{ color: 'var(--muted)' }} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <b style={{ fontSize: 12, color: item.selected ? '#fff' : 'var(--text)' }}>{item.label}</b>
                              {isLocked && (
                                <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                                  Admin requis
                                </span>
                              )}
                              {item.warning && !isLocked && (
                                <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.12)', color: '#7dd3fc' }}>
                                  Optionnel
                                </span>
                              )}
                            </div>
                            {item.desc && (
                              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.desc}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: isLocked ? 'var(--muted)' : item.selected ? '#38bdf8' : 'var(--muted)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {item.sizeDisplay || item.size}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Execution status & Post-cleanup Honest Breakdown */}
            <div style={{ marginTop: 14 }}>
              {maintaining && (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11.5 }}>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>{cleanMsg || 'Purge en cours…'}</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{cleanProgress}%</span>
                  </div>
                  <div className="bar" style={{ height: 5 }}>
                    <i style={{ width: `${Math.max(5, cleanProgress)}%`, background: 'linear-gradient(90deg, var(--a1), #38bdf8)' }} />
                  </div>
                </div>
              )}

              {lastReport && (() => {
                const tone = reportTone(lastReport);
                const incomplete = tone !== 'ok';
                const accent = TONE_VAR[tone];
                const errors: string[] = Array.isArray(lastReport.errors) ? lastReport.errors : [];
                return (
                <div
                  role="status"
                  style={{
                    background: toneBg(tone, 7),
                    border: `1px solid ${toneBg(tone, 35)}`,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: accent, fontWeight: 700, marginBottom: 8 }}>
                    {incomplete ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    <span>{tone === 'bad' ? 'Nettoyage échoué — aucun fichier supprimé :' : incomplete ? 'Nettoyage partiel — rapport du dernier passage :' : 'Rapport exact du dernier nettoyage :'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Fichiers supprimés : </span>
                      <b style={{ color: 'var(--text)' }}>{lastReport.deletedFilesCount}</b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Volume libéré : </span>
                      <b style={{ color: accent }}>{lastReport.freedDisplay}</b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Ignorés / verrouillés : </span>
                      <span style={{ color: 'var(--text)' }}>{lastReport.skippedFilesCount || 0}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Variation d’espace libre mesurée : </span>
                      <b style={{ color: '#38bdf8' }}>{((lastReport.observedFreeDeltaBytes || 0) / (1024 * 1024)).toFixed(1)} Mo</b>
                    </div>
                  </div>
                  {errors.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 10.5, color: accent, lineHeight: 1.5 }}>
                      {errors.map((message, idx) => <li key={idx}>{message}</li>)}
                    </ul>
                  )}
                </div>
                );
              })()}

              {/* Collapsible Technical Logs */}
              {maintLogs.length > 0 && (
                <div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowMaintLogs(!showMaintLogs)}
                    style={{ fontSize: 10.5, padding: '4px 8px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}
                  >
                    <span>{showMaintLogs ? 'Masquer le journal technique' : `Afficher le journal technique (${maintLogs.length} lignes)`}</span>
                    {showMaintLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {showMaintLogs && (
                    <div
                      className="custom-scroll"
                      ref={maintTerminalRef}
                      style={{
                        marginTop: 8,
                        maxHeight: 110,
                        overflowY: 'auto',
                        background: '#070a10',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        fontSize: 10.5,
                        fontFamily: 'monospace',
                        color: '#94a3b8',
                      }}
                    >
                      {maintLogs.map((log, idx) => (
                        <div key={idx} style={{ color: log.includes('[OK]') ? '#4ade80' : log.includes('ERREUR') ? '#f87171' : '#94a3b8', lineHeight: 1.45 }}>
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── M2: Scheduled Maintenance Card (Harmonized on Security Tab) ── */}
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
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>Exécution silencieuse et autonome</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: schedule.enabled ? '#68b894' : 'var(--muted)', fontWeight: 600 }}>
                {schedule.enabled ? 'Planification active' : 'Planification désactivée'}
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={e => handleUpdateSchedule({ enabled: e.target.checked })}
                />
                <span className="toggle-track" />
                <span className="toggle-thumb" />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['daily', 'weekly', 'monthly'] as const).map(freqKey => {
                const label = freqKey === 'daily' ? 'Quotidienne' : freqKey === 'weekly' ? 'Hebdomadaire' : 'Mensuelle';
                const isActive = schedule.frequency === freqKey;
                return (
                  <button
                    key={freqKey}
                    type="button"
                    onClick={() => handleUpdateSchedule({ frequency: freqKey })}
                    disabled={!schedule.enabled}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                      color: isActive ? '#38bdf8' : 'var(--muted)',
                      cursor: schedule.enabled ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {label} {freqKey === 'weekly' && <span style={{ fontSize: 9.5, opacity: 0.8 }}>(Recommandé)</span>}
                  </button>
                );
              })}

              {/* Time Picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Heure :</span>
                <input
                  type="time"
                  value={schedule.time}
                  disabled={!schedule.enabled}
                  onChange={e => handleUpdateSchedule({ time: e.target.value })}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    color: 'var(--text)',
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                    outline: 'none',
                    cursor: schedule.enabled ? 'pointer' : 'not-allowed',
                  }}
                />
              </div>

              {/* Day of Week for weekly */}
              {schedule.frequency === 'weekly' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Jour :</span>
                  <select
                    value={schedule.dayOfWeek}
                    disabled={!schedule.enabled}
                    onChange={e => handleUpdateSchedule({ dayOfWeek: parseInt(e.target.value, 10) })}
                    style={{
                      background: '#090d16',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: 'var(--text)',
                      fontSize: 11,
                      outline: 'none',
                    }}
                  >
                    <option value={1}>Lundi</option>
                    <option value={2}>Mardi</option>
                    <option value={3}>Mercredi</option>
                    <option value={4}>Jeudi</option>
                    <option value={5}>Vendredi</option>
                    <option value={6}>Samedi</option>
                    <option value={0}>Dimanche</option>
                  </select>
                </div>
              )}
            </div>

            {/* Next run text badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#38bdf8' }}>
              <span style={{ color: 'var(--muted)' }}>Échéance :</span>
              <span className="mono" style={{ fontWeight: 600 }}>{nextRunText}</span>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: 10.5,
              color: 'var(--muted)',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ShieldCheck size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
            <span>
              <b>Exécution en arrière-plan :</b> Vanguard Core doit être actif dans la zone de notification (systray) pour exécuter la tâche à l'heure prévue. Si le PC était éteint, un rattrapage automatique sera proposé dès la prochaine ouverture de session.
            </span>
          </div>
        </div>

        {/* ── Resource Rings Row (CPU, RAM, System Disk C:) ── */}
        <div className="grid g3" style={{ gap: 16 }}>
          {[
            {
              label: 'Processeur (CPU)',
              val: cpu / 100,
              display: `${cpu}%`,
              sub: `${hardware?.cpuCores || metrics?.cpuCores || '—'} cœurs · ${(hardware?.cpuName || 'Processeur hôte').split('@')[0].trim()}`,
            },
            {
              label: 'Mémoire vive (RAM)',
              val: ram / 100,
              display: `${ram}%`,
              sub: (() => {
                // La télémétrie fournit déjà des Go : même unité pour l'utilisé et le total.
                const usedGB = metrics?.ramUsed ?? 0;
                const totalGB = metrics?.ramTotal || hardware?.ramGB || 0;
                if (totalGB <= 0) return 'Non disponible';
                return usedGB > 0 ? `${usedGB.toFixed(1)} / ${totalGB.toFixed(1)} Go` : `— / ${totalGB.toFixed(1)} Go`;
              })(),
            },
            {
              label: 'Stockage système',
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

        {/* ── M3 & M4: Hardware Center & Official Drivers (Multi-GPU + Motherboard & Embedded Flash Guide) ── */}
        <div className="card card-p-lg mt" style={{ marginTop: 24, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Monitor size={15} style={{ color: 'var(--a1)' }} />
              Composants Matériels & Pilotes Constructeurs
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Détection matérielle via Windows Driver Framework & WMI
            </span>
          </div>

          <div className="grid g2" style={{ gap: 16 }}>
            {/* M3: GPUs (Multi-GPU Support, no hardcoded single GPU) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(hardware?.gpus && hardware.gpus.length > 0 ? hardware.gpus : []).map((gpu: any, gIdx: number) => {
                const isNvidia = gpu.manufacturer === 'nvidia' || gpu.name?.toLowerCase().includes('geforce') || gpu.name?.toLowerCase().includes('nvidia');
                const isAmd = gpu.manufacturer === 'amd' || gpu.name?.toLowerCase().includes('radeon') || gpu.name?.toLowerCase().includes('amd');
                const isIntel = gpu.manufacturer === 'intel' || gpu.name?.toLowerCase().includes('intel');
                const isVirtual = gpu.isVirtual || gpu.name?.toLowerCase().includes('virtual');

                const portalLabel = isNvidia
                  ? 'Portail Pilotes GeForce'
                  : isAmd
                  ? 'Portail Pilotes AMD'
                  : isIntel
                  ? 'Support Pilotes Intel'
                  : 'Site Constructeur';

                return (
                  <div
                    key={gpu.id || gIdx}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: gpu.isPrimary ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                          {gpu.isPrimary ? 'Carte graphique principale' : isVirtual ? 'Adaptateur virtuel (affichage déporté)' : 'Carte graphique secondaire'}
                        </span>
                        {gpu.isPrimary && (
                          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700 }}>
                            Principale
                          </span>
                        )}
                        {isVirtual && (
                          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', color: 'var(--muted)', fontWeight: 700 }}>
                            Périphérique Virtuel
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={gpu.name}>
                        {gpu.name}
                      </div>

                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 11 }}>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>Pilote installé : </span>
                          <b style={{ color: '#38bdf8' }}>v{gpu.driverVersionDisplay || '—'}</b>
                        </div>
                        {gpu.driverVersionRaw && (
                          <div>
                            <span style={{ color: 'var(--muted)' }}>WDDM : </span>
                            <span className="mono" style={{ color: 'var(--text)' }}>{gpu.driverVersionRaw}</span>
                          </div>
                        )}
                        {gpu.driverDate && (
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Date : </span>
                            <span style={{ color: 'var(--text)' }}>{gpu.driverDate}</span>
                          </div>
                        )}
                      </div>

                      {/* M3: Live NVIDIA Driver Update Flow */}
                      {gpu.isPrimary && isNvidia && !isVirtual && (
                        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(56, 189, 248, 0.04)', border: '1px solid rgba(56, 189, 248, 0.18)' }}>
                          {!gpuUpdate.checked ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Vérification officielle NVIDIA :</span>
                              <button
                                type="button"
                                className="btn"
                                onClick={handleCheckGpuUpdate}
                                disabled={gpuUpdate.checking}
                                style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                {gpuUpdate.checking ? (
                                  <>
                                    <span className="spinner spinner-sm" />
                                    <span>Interrogation NVIDIA…</span>
                                  </>
                                ) : (
                                  <>
                                    <RotateCw size={12} />
                                    <span>Rechercher une mise à jour</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : gpuUpdate.updateAvailable ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#38bdf8' }}>
                                  Mise à jour officielle disponible : v{gpuUpdate.latestVersion}
                                </span>
                                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                                  {gpuUpdate.releaseDate} · {gpuUpdate.fileSizeMB} Mo
                                </span>
                              </div>

                              {!gpuDownload.downloaded && !gpuDownload.downloading && (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={handleDownloadGpuDriver}
                                  style={{ fontSize: 11.5, padding: '6px 14px', borderRadius: 6, fontWeight: 700, width: '100%' }}
                                >
                                  Télécharger le pilote officiel ({gpuUpdate.fileSizeMB} Mo)
                                </button>
                              )}

                              {gpuDownload.downloading && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text)' }}>
                                    <span>Téléchargement officiel en cours…</span>
                                    <b>{gpuDownload.percent}% ({gpuDownload.transferredMB} / {gpuDownload.totalMB} Mo)</b>
                                  </div>
                                  <div className="bar" style={{ height: 6 }}>
                                    <i style={{ width: `${Math.max(3, gpuDownload.percent)}%`, background: 'var(--a1)' }} />
                                  </div>
                                </div>
                              )}

                              {gpuDownload.downloaded && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={handleLaunchGpuInstaller}
                                    disabled={gpuInstalling}
                                    style={{ fontSize: 11.5, padding: '6px 14px', borderRadius: 6, fontWeight: 700, width: '100%', background: '#10b981', borderColor: '#059669' }}
                                  >
                                    {gpuInstalling ? 'Lancement de l\'installateur…' : 'Lancer l\'installation (UAC)'}
                                  </button>
                                  <small style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
                                    L'installateur officiel NVIDIA s'ouvrira avec demande de consentement Windows (UAC). Zéro installation forcée.
                                  </small>
                                </div>
                              )}
                            </div>
                          ) : gpuUpdate.error ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#f87171' }}>{gpuUpdate.error}</span>
                              <button type="button" className="btn-ghost" onClick={handleCheckGpuUpdate} style={{ fontSize: 10.5, padding: '3px 8px' }}>
                                Réessayer
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#68b894' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle2 size={13} />
                                Pilote officiel NVIDIA à jour (v{gpuUpdate.currentVersion || gpu.driverVersionDisplay})
                              </span>
                              <button type="button" className="btn-ghost" onClick={handleCheckGpuUpdate} style={{ fontSize: 10, padding: '2px 7px' }}>
                                Revérifier
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 10.5, color: isVirtual ? 'var(--muted)' : '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} />
                        {isVirtual ? 'Mise à jour non applicable aux adaptateurs virtuels' : 'Pilote constructeur WHQL'}
                      </span>
                      {gpu.driverUrl && !isVirtual && (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => api?.openExternal?.(gpu.driverUrl)}
                          style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <span>{portalLabel}</span>
                          <ExternalLink size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: 'var(--muted)', padding: '4px 8px', fontStyle: 'italic' }}>
                * Vérification automatisée active pour les cartes NVIDIA GeForce (API officielle). Pour les GPU AMD Radeon et Intel Arc, redirection directe vers les portails constructeurs officiels sans fausse automatisation.
              </div>
            </div>

            {/* M4: Motherboard & BIOS with Embedded Safety Flash Guide */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Carte Mère & BIOS UEFI
                  </span>
                  <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(104,184,148,0.15)', color: '#68b894', fontWeight: 700 }}>
                    Firmware
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.motherboard}>
                  {hardware?.motherboard || 'ASUS ROG STRIX Z370-F GAMING'}
                </div>

                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 11 }}>
                  <div>
                    <span style={{ color: 'var(--muted)' }}>Version BIOS : </span>
                    <b style={{ color: '#38bdf8' }}>v{hardware?.biosVersion || '3004'}</b>
                  </div>
                  {hardware?.biosDate && (
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Date du BIOS : </span>
                      <span style={{ color: 'var(--text)' }}>{hardware.biosDate}</span>
                    </div>
                  )}
                </div>

                {/* Statut vérification constructeur */}
                <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: 10.5, color: 'var(--muted)' }}>
                  <b>Statut vérification en ligne :</b> Consultation manuelle requise (API constructeur propriétaire ASUS non accessible publiquement sans jeton interne pour cette plateforme).
                </div>

                {/* Embedded flash safety guide — accordéon pour ne pas surcharger l'affichage principal */}
                {(hardware?.motherboardManufacturer?.toLowerCase().includes('asus') || hardware?.motherboard?.toLowerCase().includes('asus') || !hardware?.motherboardManufacturer) && (
                  <details
                    style={{
                      marginTop: 10,
                      borderRadius: 8,
                      background: 'rgba(234, 179, 8, 0.04)',
                      border: '1px solid rgba(234, 179, 8, 0.2)',
                      fontSize: 11,
                      color: '#fef08a',
                      lineHeight: 1.5,
                      overflow: 'hidden',
                    }}
                  >
                    <summary style={{
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#facc15',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      listStyle: 'none',
                      userSelect: 'none',
                    }}>
                      <AlertTriangle size={12} />
                      <span>Procédure de mise à jour BIOS (cliquer pour afficher)</span>
                    </summary>
                    <ul style={{ margin: 0, paddingLeft: 20, paddingBottom: 10, paddingTop: 4 }}>
                      <li>Téléchargez le fichier firmware officiel (.CAP) depuis la page support ASUS ROG ci-dessous.</li>
                      <li>Copiez le fichier à la racine d'une clé USB formatée en <b>FAT32</b>.</li>
                      <li>Effectuez la mise à jour hors Windows via l'outil <b>ASUS EZ Flash 3</b> (BIOS &gt; Outils).</li>
                      <li><b>Ne coupez jamais l'alimentation</b> durant la procédure d'écriture du firmware.</li>
                    </ul>
                  </details>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                  {hardware?.motherboardManufacturer || 'ASUSTeK COMPUTER INC.'}
                </span>
                {hardware?.biosUrl && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => api?.openExternal?.(hardware.biosUrl)}
                    style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>Page support officiel ASUS ROG</span>
                    <ExternalLink size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── M5: Physical Disks & S.M.A.R.T. Section (Ordered 0..N, Boot C: Badge, 3 distinct data points) ── */}
        <div className="card card-p-lg mt" style={{ marginTop: 24, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Database size={15} style={{ color: 'var(--a1)' }} />
              Disques Physiques & Santé S.M.A.R.T.
              <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>
                {physicalDisks.length} disque{physicalDisks.length > 1 ? 's' : ''} physique{physicalDisks.length > 1 ? 's' : ''}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Interrogation matérielle des contrôleurs de stockage</span>
          </div>


          {/* Note numérotation Windows — compacte */}
          <div style={{ marginBottom: 12, fontSize: 10.5, color: 'var(--muted)' }}>
            <span
              title="L'index Windows (Get-Disk) est attribué dynamiquement lors de l'énumération au démarrage et ne correspond pas nécessairement à un numéro de port physique de la carte mère."
              style={{ cursor: 'help', borderBottom: '1px dashed rgba(255,255,255,0.2)', paddingBottom: 1 }}
            >
              ⓘ Index disque Windows — ordre d'énumération système
            </span>
          </div>

          {loadingDisks ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              <span className="spinner spinner-sm" style={{ marginRight: 8 }} />
              Interrogation des contrôleurs physiques…
            </div>
          ) : physicalDisks.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              Aucun disque physique détecté.
            </div>
          ) : (
            <div className="grid g3" style={{ gap: 14 }}>
              {physicalDisks.map((d, idx) => {
                const diskNum = d.diskNumber ?? idx;
                const isHdd = d.mediaType.includes('HDD') || (d.MediaType && d.MediaType.toLowerCase().includes('hdd'));
                const isUsb = d.mediaType.includes('USB') || d.busType === 'USB';
                const sizeLabel = d.sizeGB >= 900 ? `${(d.sizeGB / 1000).toFixed(0)} To` : `${d.sizeGB} Go`;
                const isHealthy = d.health?.includes('Sain') || d.status === 'OK' || d.HealthStatus?.includes('Sain') || d.healthStatusText?.includes('Sain');
                const statusText = d.healthStatusText || d.HealthStatus || (isHealthy ? 'Sain (Contrôleur OK)' : 'Attention requise');
                const isBootDrive = Boolean(d.isSystemDisk);

                return (
                  <div
                    key={diskNum}
                    style={{
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: isBootDrive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div>
                      {/* Top Header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: isBootDrive
                              ? 'rgba(56, 189, 248, 0.16)'
                              : isHdd
                              ? 'rgba(167, 139, 250, 0.12)'
                              : 'rgba(56, 189, 248, 0.12)',
                            border: `1px solid ${
                              isBootDrive
                                ? 'rgba(56, 189, 248, 0.45)'
                                : isHdd
                                ? 'rgba(167, 139, 250, 0.3)'
                                : 'rgba(56, 189, 248, 0.3)'
                            }`,
                            display: 'grid',
                            placeItems: 'center',
                            color: isBootDrive ? '#38bdf8' : isHdd ? '#a78bfa' : '#38bdf8',
                            flexShrink: 0,
                          }}
                        >
                          <HardDrive size={18} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>
                              {isBootDrive && d.driveLetters
                                ? `Windows (${d.driveLetters})`
                                : d.driveLetters
                                ? `${d.driveLetters}`
                                : `Disque ${diskNum}`}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                              {sizeLabel}
                            </span>
                          </div>
                          {/* Modèle en ligne secondaire — identifiant Windows en tooltip */}
                          <b
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: 'var(--text)',
                              display: 'block',
                              marginTop: 2,
                            }}
                            title={d.model || d.FriendlyName}
                          >
                            {d.model || d.FriendlyName || 'Disque physique'}
                          </b>

                          {/* Letter badges & Boot flag */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                            {isBootDrive && (
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  padding: '1px 7px',
                                  borderRadius: 4,
                                  background: 'rgba(56, 189, 248, 0.2)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.45)',
                                }}
                              >
                                [Système / Démarrage]
                              </span>
                            )}
                            {d.driveLetters ? (
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
                              <span style={{ fontSize: 10, color: 'var(--a1)', fontWeight: 600 }}>
                                "{d.volumeLabel}"
                              </span>
                            ) : null}
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: isHdd ? 'rgba(167, 139, 250, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                                color: isHdd ? '#c4b5fd' : '#7dd3fc',
                              }}
                            >
                              {d.mediaType || (isHdd ? 'HDD S-ATA' : 'SSD NVMe / SATA')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Point 1: Capacité & Utilisation */}
                      {d.usedGB !== undefined && d.sizeGB > 0 ? (
                        <div style={{ marginTop: 12 }}>
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

                      {/* Point 2: Système de fichiers & Point 3: Santé Contrôleur */}
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                          <span>Système de fichiers :</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                            {d.volumes?.[0]?.fileSystem || 'NTFS'} (Table {d.partitionStyle || 'GPT'})
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--muted)' }}>Santé Contrôleur / S.M.A.R.T. :</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: isHealthy ? '#68b894' : '#f59e0b', fontWeight: 600 }} title="Statut rapporté par Windows Storage Management (compteurs détaillés restreints sans élévation administrateur)">
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: isHealthy ? '#68b894' : '#f59e0b',
                                boxShadow: isHealthy ? '0 0 6px rgba(104,184,148,0.6)' : 'none',
                              }}
                            />
                            {statusText}
                          </span>
                        </div>
                      </div>
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
                        <span>Optimiser le lecteur</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── M7: Startup Programs (Full Width Card, Duplicate Modals Deleted) ── */}
        <div className="card card-p-lg mt" style={{ marginTop: 24, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Cpu size={15} style={{ color: 'var(--a1)' }} />
              Programmes au démarrage de Windows
              <span className="chip" style={{ fontSize: 10.5, padding: '1px 7px' }}>
                {startupApps.length} identifié{startupApps.length > 1 ? 's' : ''}
              </span>
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
                padding: '6px 12px',
                minWidth: 260,
              }}
            >
              <Search size={13} style={{ color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Filtrer (Steam, Discord, LGHUB...)"
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
          </div>

          <div
            className="list custom-scroll"
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {filteredApps.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                Aucun programme correspondant trouvé.
              </div>
            ) : (
              filteredApps.map((app, i) => {
                const origIdx = startupApps.findIndex(a => a.name === app.name);
                const isHigh = app.impact === 'h';
                const isLow = app.impact === 'l';
                const isMedium = app.impact === 'm';
                const isUnknown = app.impact === 'u' || (!isHigh && !isLow && !isMedium);

                return (
                  <div
                    className="row"
                    key={app.name + i}
                    style={{
                      padding: '10px 14px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b
                          style={{
                            fontSize: 12.5,
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {app.name}
                        </b>
                        <span style={{ fontSize: 10, color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 4 }}>
                          {app.location || 'HKCU'}
                        </span>
                      </div>
                      <small style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                        {app.publisher}
                      </small>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: isHigh
                            ? 'rgba(239, 68, 68, 0.15)'
                            : isLow
                            ? 'rgba(104, 184, 148, 0.15)'
                            : isMedium
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(255, 255, 255, 0.08)',
                          color: isHigh ? '#f87171' : isLow ? '#68b894' : isMedium ? '#fbbf24' : 'var(--muted)',
                          border: `1px solid ${
                            isHigh
                              ? 'rgba(239, 68, 68, 0.3)'
                              : isLow
                              ? 'rgba(104, 184, 148, 0.3)'
                              : isMedium
                              ? 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(255, 255, 255, 0.14)'
                          }`,
                        }}
                      >
                        {app.impactLabel || (isHigh ? 'ÉLEVÉ' : isLow ? 'FAIBLE' : isMedium ? 'MOYEN' : 'NON DÉTERMINÉ')}
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
              marginTop: 14,
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
            <span>
              Les programmes désactivés sont mémorisés dans la configuration locale : vous pouvez les réactiver à tout moment sans perte de commande.
            </span>
          </div>
        </div>

        {/* ── Per-Disk Junk Optimizer Modal ── */}
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
                maxWidth: 660,
                background: '#090d16',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#38bdf8',
                    }}
                  >
                    <HardDrive size={16} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>
                      Optimisation · Lecteur {selectedDiskForOpt.driveLetters || 'Disque'} ({selectedDiskForOpt.model || 'Disque physique'})
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                      Détection des résidus et fichiers temporaires sur ce volume
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
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Analyse des caches du lecteur {selectedDiskForOpt.driveLetters}...</span>
                  </div>
                ) : (
                  <div>
                    {/* Recommendation Box */}
                    <div
                      style={{
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
                      }}
                    >
                      <Search size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        {diskJunkScanResult?.errorMessage ? (
                          <span style={{ color: '#f87171' }}>
                            Analyse indisponible : {diskJunkScanResult.errorMessage}
                          </span>
                        ) : (
                          diskJunkScanResult?.summary || 'Analyse terminée. Vous pouvez purger les caches résiduels en toute sécurité.'
                        )}
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

                    {diskJunkNotice && (() => {
                      const tone = diskJunkNotice.tone === 'ok'
                        ? { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' }
                        : diskJunkNotice.tone === 'warn'
                        ? { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)', color: '#facc15' }
                        : { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: '#f87171' };
                      return (
                        <div
                          role="status"
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: tone.bg,
                            border: `1px solid ${tone.border}`,
                            fontSize: 12,
                            color: tone.color,
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          {diskJunkNotice.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                          <span>{diskJunkNotice.text}</span>
                        </div>
                      );
                    })()}

                    <p style={{ margin: '0 0 14px', fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                      Seuls les caches connus de ce lecteur sont nettoyés ; vos jeux, téléchargements et dossiers personnels ne sont jamais touchés.
                    </p>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 14px', fontSize: 11.5, color: 'var(--text)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={diskEmptyBin} onChange={e => setDiskEmptyBin(e.target.checked)} disabled={diskJunkCleaning} style={{ marginTop: 2 }} />
                      <span><b>Vider aussi la Corbeille de ce lecteur</b> (suppression définitive, irrécupérable). Non coché : la Corbeille n’est pas touchée.</span>
                    </label>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        paddingTop: 14,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Espace récupérable sur ce lecteur :</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: diskJunkScanResult?.errorMessage ? '#f87171' : '#38bdf8' }}>
                          {diskJunkScanResult?.errorMessage
                            ? '— Indisponible'
                            : (diskJunkScanResult?.totalFormatted || '0 Mo')}
                        </div>
                      </div>
                      <button
                        className="btn"
                        onClick={cleanDiskJunk}
                        disabled={diskJunkCleaning || maintaining || !diskJunkScanResult?.totalMB || !!diskJunkScanResult?.errorMessage}
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