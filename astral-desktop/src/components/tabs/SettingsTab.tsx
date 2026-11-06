import { useState, useEffect } from 'react';
import { playNotificationTone } from '../../shared/notificationSound';
import {
  User, Palette, Sliders, Shield, Gamepad2,
  Bell, RefreshCw, Cpu, Info, Check, CheckCircle2,
  AlertTriangle, X, Save, ExternalLink, Monitor,
  Wifi, Download, Activity, Lock, Volume2, Zap, FlaskConical, Sparkles
} from 'lucide-react';

const api = (window as any).vanguard;

export interface SettingsTabProps {
  dndEnabled?:           boolean;
  onDndChange?:          (val: boolean) => void;
  onProfileSaved?:       () => void;
  onRelaunchOnboarding?: () => void;
  currentTheme?:         string;
  onThemeChange?:        (theme: string) => void;
}

type Section =
  | 'appearance'
  | 'general'
  | 'security'
  | 'downloads'
  | 'gaming'
  | 'network'
  | 'notifications'
  | 'updates'
  | 'diagnostic'
  | 'aibrief'
  | 'profile'
  | 'about';

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'appearance',    label: 'Apparence',        icon: Palette },
  { id: 'general',       label: 'Général & Système',icon: Sliders },
  { id: 'security',      label: 'Sécurité & Defender', icon: Shield },
  { id: 'aibrief',       label: 'Brief IA & Synthèse', icon: Sparkles },
  { id: 'downloads',     label: 'Scanner de fichiers', icon: Download },
  { id: 'gaming',        label: 'Gaming & Overlay', icon: Gamepad2 },
  { id: 'network',       label: 'Réseau & DNS',     icon: Wifi },
  { id: 'notifications', label: 'Notifications',    icon: Bell },
  { id: 'updates',       label: 'Mises à jour',     icon: RefreshCw },
  { id: 'diagnostic',    label: 'Diagnostic',       icon: Activity },
  { id: 'profile',       label: 'Profil',          icon: User },
  { id: 'about',         label: 'À propos',         icon: Info },
];

const THEMES = [
  {
    id: 'vanguard-dark',
    name: 'Graphite',
    desc: 'Neutre sobre — Recommandé',
    bg: '#131518',
    a1: '#8eaee8',
    a2: '#577bc0',
  },
  {
    id: 'cyber-cyan',
    name: 'Ardoise',
    desc: 'Nuances bleu minéral',
    bg: '#111619',
    a1: '#90b5ce',
    a2: '#507e9d',
  },
  {
    id: 'midnight-purple',
    name: 'Prune',
    desc: 'Ambiance feutrée indigo',
    bg: '#131218',
    a1: '#b4a9d6',
    a2: '#8172aa',
  },
  {
    id: 'stealth-oled',
    name: 'Noir OLED',
    desc: 'Noir absolu haute économie',
    bg: '#080909',
    a1: '#9bbdaa',
    a2: '#557e69',
  },
];

export default function SettingsTab({
  dndEnabled = false,
  onDndChange,
  onProfileSaved,
  onRelaunchOnboarding,
  currentTheme = 'vanguard-dark',
  onThemeChange,
}: SettingsTabProps) {
  const [activeSection, setActiveSection] = useState<Section>('appearance');
  const [aiConsent, setAiConsent] = useState<'granted' | 'declined' | 'unprompted'>('unprompted');
  const [aiConsentInfo, setAiConsentInfo] = useState<any>(null);

  // Profile
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  // General & System
  const [autostart, setAutostart]               = useState(true);
  const [minimizeToTray, setMinimizeToTray]     = useState(true);
  const [reduceAnimations, setReduceAnimations] = useState(false);

  // Security & Defender (statuts mesurés factuels en lecture seule)
  type SecurityStatusValue = 'active' | 'disabled' | 'unknown' | 'unavailable';
  const [realtimeStatus, setRealtimeStatus] = useState<SecurityStatusValue>('unknown');
  const [antivirusStatus, setAntivirusStatus] = useState<SecurityStatusValue>('unknown');
  const [defenderAvailable, setDefenderAvailable] = useState<boolean | null>(null);

  // Downloads Scanner
  const [scanDownloads, setScanDownloads]     = useState(true);
  const [blockUnsigned, setBlockUnsigned]     = useState(false);
  const [usbScanEnabled, setUsbScanEnabled]   = useState(true);
  const [downloadSound, setDownloadSound]     = useState(true);
  const [showModalEvenIfSafe, setShowModalEvenIfSafe] = useState(false);
  const [watchDirs, setWatchDirs]             = useState<string[]>([]);
  const [discreteMode, setDiscreteMode]       = useState<'window' | 'mini' | 'notification'>('window');

  // Gaming / Overlay
  const [hudEnabled, setHudEnabled]           = useState(false);
  const [autoDetectGames, setAutoDetectGames] = useState(false);
  const [overlayFPS, setOverlayFPS]           = useState(true);
  const [overlayCPU, setOverlayCPU]           = useState(true);
  const [overlayRAM, setOverlayRAM]           = useState(true);
  const [overlayPing, setOverlayPing]         = useState(true);

  // Network & DNS
  const [dohEnabled, setDohEnabled]       = useState(false);
  const [disableIpv6, setDisableIpv6]     = useState(false);
  const [antiBufferbloat, setBufferbloat] = useState(false);

  // Notifications
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume]   = useState(70);
  const [categories, setCategories]     = useState<Record<string, boolean>>({
    security: true,
    scanner: true,
    maintenance: true,
    network: true,
    vpn: true,
    vault: true,
    updater: true,
    system: true,
  });

  // Updates
  const [autoUpdate, setAutoUpdate]         = useState(true);
  const [betaChannel, setBetaChannel]       = useState(true);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus]     = useState('');
  const [currentVersion, setCurrentVersion] = useState('0.1.4');
  const [updateInfo, setUpdateInfo]         = useState<{ version?: string; hasUpdate?: boolean } | null>(null);

  const [notifHistory, setNotifHistory] = useState<any[]>([]);
  const [testingNotif, setTestingNotif] = useState(false);
  const [notifTestResult, setNotifTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const loadNotifHistory = () => {
    api?.notifications?.getHistory?.().then((h: any) => setNotifHistory(Array.isArray(h) ? h : [])).catch(() => {});
  };

  const REASONS: Record<string, string> = {
    notifications_disabled: 'Les notifications sont désactivées : l\'événement est dans l\'historique, sans fenêtre ni son.',
    category_disabled: 'La catégorie « Système et jeux » est désactivée : l\'événement est dans l\'historique, sans fenêtre ni son.',
    do_not_disturb: 'Le mode Ne pas déranger est actif : l\'événement est dans l\'historique, sans fenêtre ni son.',
  };
  const runNotificationTest = async (kind: 'success' | 'warning' | 'error') => {
    setTestingNotif(true);
    setNotifTestResult(null);
    try {
      const res = await api?.notifications?.test?.(kind);
      if (res?.delivered) {
        setNotifTestResult({ ok: true, text: soundEnabled && soundVolume > 0 ? 'Notification envoyée près de la zone de notification, avec son.' : 'Notification envoyée près de la zone de notification (sans son : sons désactivés ou volume à 0).' });
      } else {
        setNotifTestResult({ ok: false, text: REASONS[res?.reason] || 'La notification n\'a pas pu être envoyée.' });
      }
      loadNotifHistory();
    } catch (err: any) {
      setNotifTestResult({ ok: false, text: `Erreur : ${err?.message || 'envoi impossible'}` });
    } finally {
      setTestingNotif(false);
    }
  };

  // Admin status
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminPersistent, setAdminPersistent] = useState<boolean>(false);

  // Diagnostic
  const [diagResults, setDiagResults] = useState<{ name: string; status: string; ok: boolean }[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

  // Error / notice
  const [notice, setNotice] = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    if (activeSection !== 'notifications') return;
    loadNotifHistory();
    const off = api?.on?.('notifications:updated', () => loadNotifHistory());
    return () => { off?.(); };
  }, [activeSection]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  useEffect(() => {
    if (!api) return;

    // Load user profile
    api.getProfile?.().then((p: any) => {
      if (p) {
        if (p.firstName) setFirstName(p.firstName);
        if (p.lastName) setLastName(p.lastName);
        if (typeof p.soundEnabled === 'boolean') setSoundEnabled(p.soundEnabled);
        if (typeof p.notificationsEnabled === 'boolean') setNotifEnabled(p.notificationsEnabled);
        if (typeof p.reduceAnimations === 'boolean') {
          setReduceAnimations(p.reduceAnimations);
          document.documentElement.classList.toggle('reduce-motion', p.reduceAnimations);
        }
        if (p.network) {
          if (typeof p.network.dnsOverHttps === 'boolean') setDohEnabled(p.network.dnsOverHttps);
          if (typeof p.network.ipv6Disabled === 'boolean') setDisableIpv6(p.network.ipv6Disabled);
          if (typeof p.network.antiBufferbloat === 'boolean') setBufferbloat(p.network.antiBufferbloat);
        }
      }
    }).catch(() => {});

    // Load autostart status
    api.getAutostart?.().then((res: any) => {
      if (res && typeof res.openAtLogin === 'boolean') setAutostart(res.openAtLogin);
    }).catch(() => {});

    // Load minimize to tray
    api.getMinimizeToTray?.().then((res: any) => {
      if (res && typeof res.minimizeToTray === 'boolean') setMinimizeToTray(res.minimizeToTray);
    }).catch(() => {});

    // Check system Defender status (lecture seule factuelle)
    api.getDefenderStatus?.().then((res: any) => {
      if (res?.data) {
        const available = Boolean(res.data.AMServiceEnabled);
        setDefenderAvailable(available);
        if (!available) {
          setRealtimeStatus('unavailable');
          setAntivirusStatus('unavailable');
        } else {
          setRealtimeStatus(res.data.RealTimeProtectionEnabled === true ? 'active' : (res.data.RealTimeProtectionEnabled === false ? 'disabled' : 'unknown'));
          setAntivirusStatus(res.data.AntivirusEnabled === true ? 'active' : (res.data.AntivirusEnabled === false ? 'disabled' : 'unknown'));
        }
      } else {
        setRealtimeStatus('unavailable');
        setAntivirusStatus('unavailable');
        setDefenderAvailable(false);
      }
    }).catch(() => {
      setRealtimeStatus('unavailable');
      setAntivirusStatus('unavailable');
      setDefenderAvailable(false);
    });

    // Load preview channel state from electron-updater
    api.getPreviewChannel?.().then((res: any) => {
      if (typeof res?.previewChannel === 'boolean') setBetaChannel(res.previewChannel);
    }).catch(() => {});

    // Load auto-update setting
    api.getAutoUpdate?.().then((res: any) => {
      if (typeof res?.autoUpdateEnabled === 'boolean') setAutoUpdate(res.autoUpdateEnabled);
    }).catch(() => {});

    // Load updater version info
    api.getUpdaterState?.().then((state: any) => {
      if (state?.currentVersion) setCurrentVersion(state.currentVersion);
    }).catch(() => {});

    // Check admin status & persistent permissions
    api.getAdminStatus?.().then((res: any) => {
      if (typeof res?.isAdmin === 'boolean') {
        setIsAdmin(res.isAdmin);
        setAdminPersistent(Boolean(res.isPersistent || res.isAdmin));
      }
    }).catch(() => {});

    // Sync HUD state from main process
    api.hudGetState?.().then((res: any) => {
      if (typeof res?.active === 'boolean') setHudEnabled(res.active);
      else if (typeof res === 'boolean') setHudEnabled(res);
    }).catch(() => {});

    // Sync download scanner config
    api.getScannerConfig?.().then((res: any) => {
      if (res?.config) {
        if (typeof res.config.enabled === 'boolean') setScanDownloads(res.config.enabled);
        if (typeof res.config.usbScanEnabled === 'boolean') setUsbScanEnabled(res.config.usbScanEnabled);
        if (typeof res.config.soundEnabled === 'boolean') setDownloadSound(res.config.soundEnabled);
        if (typeof res.config.showModalEvenIfSafe === 'boolean') setShowModalEvenIfSafe(res.config.showModalEvenIfSafe);
        if (res.config.discreteMode) setDiscreteMode(res.config.discreteMode);
        if (Array.isArray(res.config.watchDirs)) setWatchDirs(res.config.watchDirs);
      }
    }).catch(() => {});

    // Sync notification preferences & categories from central notificationManager
    api.notifications?.getPrefs?.().then((res: any) => {
      if (res) {
        if (typeof res.soundVolume === 'number') setSoundVolume(res.soundVolume);
        if (typeof res.soundEnabled === 'boolean') setSoundEnabled(res.soundEnabled);
        if (typeof res.notificationsEnabled === 'boolean') setNotifEnabled(res.notificationsEnabled);
        if (res.categories && typeof res.categories === 'object') {
          setCategories(prev => ({ ...prev, ...res.categories }));
        }
      }
    }).catch(() => {});

    const unAdmin = api.on?.('admin:status', (res: any) => {
      if (typeof res?.isAdmin === 'boolean') {
        setIsAdmin(res.isAdmin);
        setAdminPersistent(Boolean(res.isPersistent || res.isAdmin));
      }
    });

    const unHud = api.on?.('hud:state-changed', (d: any) => {
      if (typeof d?.active === 'boolean') setHudEnabled(d.active);
      else if (typeof d?.enabled === 'boolean') setHudEnabled(d.enabled);
    });

    return () => {
      unAdmin?.();
      unHud?.();
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!api) return;
    setSavingProfile(true);
    setError('');
    try {
      await api.saveUserProfile?.({ firstName, lastName });
      setProfileSaved(true);
      onProfileSaved?.();
      showToast('Profil enregistré avec succès');
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleAutostart = async (val: boolean) => {
    setAutostart(val);
    if (api?.setAutostart) {
      await api.setAutostart(val);
      showToast(val ? 'Démarrage automatique activé' : 'Démarrage automatique désactivé');
    }
  };

  const handleToggleMinimize = async (val: boolean) => {
    setMinimizeToTray(val);
    if (api?.setMinimizeToTray) {
      await api.setMinimizeToTray(val);
      showToast(val ? 'Réduction dans la zone de notification' : 'Fermeture directe de l’application');
    }
  };

  const handleToggleReduceMotion = async (val: boolean) => {
    setReduceAnimations(val);
    document.documentElement.classList.toggle('reduce-motion', val);
    await api?.saveUserProfile?.({ reduceAnimations: val });
    showToast(val ? 'Animations réduites' : 'Animations standard rétablies');
  };

  const handleToggleCategory = async (catKey: string, val: boolean) => {
    const next = { ...categories, [catKey]: val };
    setCategories(next);
    await api?.notifications?.savePrefs?.({ categories: next });
    showToast(`Catégorie « ${catKey} » ${val ? 'activée' : 'désactivée'}`);
  };

  const handleVolumeChange = async (vol: number) => {
    setSoundVolume(vol);
    await api?.notifications?.savePrefs?.({ soundVolume: vol });
  };

  const handleDiscreteModeChange = async (mode: 'window' | 'mini' | 'notification') => {
    setDiscreteMode(mode);
    await api?.saveScannerConfig?.({ discreteMode: mode });
    showToast(`Mode sentinelle : ${mode === 'window' ? 'Fenêtre modale' : (mode === 'mini' ? 'Miniature' : 'Notification de bureau')}`);
  };

  const handleToggleOverlay = async () => {
    try {
      const res = await api?.hudToggle?.();
      const active = Boolean(res?.active ?? res?.enabled);
      setHudEnabled(active);
      showToast(active ? 'Overlay HUD affiché en jeu (Ctrl+Shift+O)' : 'Overlay HUD masqué');
    } catch {
      showToast('Action HUD exécutée');
    }
  };

  const isNewerVersion = (remote: string, current: string): boolean => {
    try {
      const r = remote.replace(/^v/i, '').split('-')[0].split('.').map(Number);
      const c = current.replace(/^v/i, '').split('-')[0].split('.').map(Number);
      for (let i = 0; i < Math.max(r.length, c.length); i++) {
        const rNum = r[i] || 0;
        const cNum = c[i] || 0;
        if (rNum > cNum) return true;
        if (rNum < cNum) return false;
      }
    } catch {}
    return false;
  };

  const handleCheckUpdate = async () => {
    if (!api) return;
    setCheckingUpdate(true);
    setUpdateInfo(null);
    setUpdateStatus('Connexion aux serveurs GitHub Releases…');
    try {
      const res = await api.checkUpdate?.();
      const remoteVer = res?.updateInfo?.version;
      if (remoteVer && isNewerVersion(remoteVer, currentVersion)) {
        setUpdateInfo({ version: remoteVer, hasUpdate: true });
        setUpdateStatus(`🎉 Nouvelle version v${remoteVer} disponible !`);
        showToast(`Mise à jour v${remoteVer} disponible — téléchargement possible`);
      } else {
        setUpdateInfo({ hasUpdate: false });
        setUpdateStatus(`✓ Version v${currentVersion} — vous utilisez la version la plus récente`);
        showToast('Votre système est à jour — aucune nouvelle version nécessaire');
      }
    } catch {
      setUpdateStatus('⚠ Impossible de contacter le serveur de mise à jour.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleToggleBetaChannel = async (val: boolean) => {
    setBetaChannel(val);
    try {
      await api?.setPreviewChannel?.(val);
      showToast(val
        ? '🧪 Canal Préversion activé — mises à jour bêta autorisées'
        : 'Canal stable rétabli — mises à jour officielles uniquement'
      );
    } catch {
      showToast('Erreur lors du changement de canal');
    }
  };

  const handleToggleAutoUpdate = async (val: boolean) => {
    setAutoUpdate(val);
    try {
      await api?.setAutoUpdate?.(val);
      showToast(val
        ? '⚡ Mises à jour automatiques activées — téléchargement silencieux en arrière-plan'
        : 'Mises à jour automatiques désactivées'
      );
    } catch {
      showToast('Erreur lors du paramétrage des mises à jour automatiques');
    }
  };

  const handleRunDiagnostic = async () => {
    setRunningDiag(true);
    setDiagResults([]);

    const items: { name: string; status: string; ok: boolean }[] = [];

    // 1. Defender Antivirus
    try {
      const def = await api.getDefenderStatus?.();
      const isActive = def?.data?.realTimeProtection ?? def?.antivirusEnabled ?? false;
      items.push({
        name: 'Protection Microsoft Defender',
        status: isActive ? 'Protection temps réel active' : 'Service arrêté ou non détecté',
        ok: Boolean(isActive),
      });
    } catch {
      items.push({ name: 'Protection Microsoft Defender', status: 'Vérification non disponible', ok: false });
    }

    // 2. Privilèges Administrateur
    try {
      const adm = await api.getAdminStatus?.();
      items.push({
        name: 'Privilèges Administrateur',
        status: adm?.isAdmin ? 'Session Administrateur active' : 'Session Standard (Mode restreint)',
        ok: true,
      });
    } catch {
      items.push({ name: 'Privilèges Administrateur', status: 'Non évalué', ok: false });
    }

    // 3. Espace disque C:
    try {
      const d = await api.getDiskInfo?.();
      const freeGB = d?.freeGB || 0;
      const pct = d?.usedPercent || 0;
      const isOk = pct < 90 && freeGB > 15;
      items.push({
        name: 'Espace Disque Système C:',
        status: `${freeGB} Go disponibles (${pct}% utilisé)`,
        ok: isOk,
      });
    } catch {
      items.push({ name: 'Espace Disque Système C:', status: 'Non mesuré', ok: false });
    }

    // 4. Latence réseau (Cloudflare 1.1.1.1)
    try {
      const p = await api.getPing?.();
      const pingMs = p?.ping || 0;
      items.push({
        name: 'Connectivité WAN & Latence (1.1.1.1)',
        status: pingMs > 0 ? `Liaison active (${pingMs} ms)` : 'Passerelle non jointe',
        ok: pingMs > 0,
      });
    } catch {
      items.push({ name: 'Connectivité WAN & Latence', status: 'Non mesuré', ok: false });
    }

    // 5. Service Interactif OpenVPN
    try {
      const vpnInfo = await api.vpnGetInstallerInfo?.();
      const svcRunning = vpnInfo?.components?.serviceRunning;
      const svcInstalled = vpnInfo?.components?.serviceInstalled;
      items.push({
        name: 'Service Interactif OpenVPN',
        status: svcRunning ? 'Service actif (démarré)' : svcInstalled ? 'Installé mais arrêté' : 'Non installé sur l\'hôte',
        ok: Boolean(svcRunning),
      });
    } catch {
      items.push({ name: 'Service Interactif OpenVPN', status: 'Non vérifié', ok: false });
    }

    // 6. Sentinelle de Téléchargements
    try {
      const sc = await api.getScannerConfig?.();
      const isEnabled = sc?.config?.enabled;
      items.push({
        name: 'Scanner Téléchargements & Sentinelle',
        status: isEnabled ? 'Surveillance active (%USERPROFILE%\\Downloads)' : 'Désactivé',
        ok: Boolean(isEnabled),
      });
    } catch {
      items.push({ name: 'Scanner Téléchargements & Sentinelle', status: 'Non configuré', ok: false });
    }

    setDiagResults(items);
    setRunningDiag(false);
    showToast('Diagnostic factuel terminé');
  };

  return (
    <div
      className="tab-container animate-fade-in"
      style={{ padding: '24px 32px' }}
      onKeyDown={e => {
        const el = e.target as HTMLElement;
        if (el?.getAttribute?.('role') === 'switch' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); el.click(); }
      }}
    >
      {/* Confirmation affichée dans la page (pas de bulle flottante) */}
      {notice && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            padding: '10px 16px',
            boxShadow: 'var(--shadow-md)',
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          <CheckCircle2 size={15} style={{ color: 'var(--ok)' }} />
          <span>{notice}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>Paramètres</h1>
        <p className="sub">Apparence, système, sécurité, notifications et mises à jour</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Navigation Sidebar */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--text)' : 'var(--muted)',
                  background: active ? 'var(--line)' : 'transparent',
                  transition: 'background var(--dur-fast), color var(--dur-fast)',
                  textAlign: 'left',
                }}
              >
                <Icon size={14} style={{ color: active ? 'var(--a1)' : 'var(--dim)' }} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Pane */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            padding: 24,
            minHeight: 480,
          }}
        >
          {/* ── Apparence ── */}
          {activeSection === 'appearance' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Thème de l'interface</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Palettes colorimétriques feutrées et professionnelles adaptées aux environnements sombres.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {THEMES.map(th => {
                  const sel = currentTheme === th.id;
                  return (
                    <div
                      key={th.id}
                      onClick={() => onThemeChange?.(th.id)}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${sel ? 'var(--a1)' : 'var(--line)'}`,
                        background: sel ? 'rgba(var(--a1r), 0.04)' : 'var(--bg)',
                        cursor: 'pointer',
                        transition: 'border-color var(--dur-fast), background var(--dur-fast)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{th.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{th.desc}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: th.bg, border: '1px solid #fff3' }} />
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: th.a1 }} />
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: th.a2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="setting-row" style={{ marginTop: 8 }}>
                <div className="setting-info">
                  <div className="setting-title">Réduire les animations</div>
                  <div className="setting-desc">Désactive les transitions CSS pour privilégier la réactivité maximale</div>
                </div>
                <div
                  className={`sw ${reduceAnimations ? 'on' : ''}`}
                  onClick={() => handleToggleReduceMotion(!reduceAnimations)}
                  role="switch"
                  aria-checked={reduceAnimations}
                  tabIndex={0}
                />
              </div>

              {onRelaunchOnboarding && (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <button className="btn s" onClick={onRelaunchOnboarding}>
                    Relancer l'assistant de démarrage (Onboarding)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Général & Système ── */}
          {activeSection === 'general' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Général & Système</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Comportement de l'exécutable au démarrage de session et réduction en arrière-plan.
                </p>
              </div>

              {/* Admin Status Card */}
              <div style={{
                background: isAdmin ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)',
                border: `1px solid ${isAdmin ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                borderRadius: 'var(--r-md)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Shield size={20} style={{ color: isAdmin ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        Permissions Administrateur
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: isAdmin ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                        color: isAdmin ? '#22c55e' : '#ef4444',
                        border: `1px solid ${isAdmin ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                        letterSpacing: '0.04em',
                      }}>
                        {isAdmin ? '✓ Actif' : '⚠ Inactif'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {isAdmin
                        ? 'Droits administrateur enregistrés de manière persistante (tâche système & compatibilité Windows). Aucun avertissement UAC ne sera redemandé au redémarrage ou lors des mises à jour.'
                        : 'L’application s’exécute actuellement en mode utilisateur standard. Les optimisations système, VPN et antivirus nécessitent les privilèges administrateur.'}
                    </div>
                  </div>
                </div>

                {!isAdmin && (
                  <button
                    className="btn"
                    style={{
                      fontSize: 11,
                      flexShrink: 0,
                      borderColor: 'rgba(56, 189, 248, 0.4)',
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8',
                      fontWeight: 600,
                    }}
                    onClick={async () => {
                      showToast('Demande des privilèges administrateur…');
                      await api?.relaunchElevated?.();
                    }}
                  >
                    Activer les privilèges administrateur
                  </button>
                )}
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Lancer au démarrage de Windows</div>
                    <div className="setting-desc">Démarre l'agent de sécurité discrètement en arrière-plan avec Windows</div>
                  </div>
                  <div
                    className={`sw ${autostart ? 'on' : ''}`}
                    onClick={() => handleToggleAutostart(!autostart)}
                    role="switch"
                    aria-checked={autostart}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Réduire dans la zone de notification (systray)</div>
                    <div className="setting-desc">La croix de fermeture minimise l'application sans interrompre la protection</div>
                  </div>
                  <div
                    className={`sw ${minimizeToTray ? 'on' : ''}`}
                    onClick={() => handleToggleMinimize(!minimizeToTray)}
                    role="switch"
                    aria-checked={minimizeToTray}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Langue de l'interface</div>
                    <div className="setting-desc">Français (système)</div>
                  </div>
                  <span className="chip idle">FR</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Sécurité & Defender ── */}
          {activeSection === 'security' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Sécurité & Microsoft Defender</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  État réel des protections système observé sans altération unilatérale des politiques Windows.
                </p>
              </div>

              <div className="list">
                <div className="setting-row" style={{ alignItems: 'center', padding: '14px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>Protection en temps réel</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.4 }}>
                      Surveillance continue des fichiers et processus. État lu via l'API système de Microsoft Defender.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span className={`badge ${
                      realtimeStatus === 'active' ? 'badge-ok' :
                      realtimeStatus === 'disabled' ? 'badge-danger' :
                      'badge-neutral'
                    }`}>
                      {realtimeStatus === 'active' ? 'Protection active' :
                       realtimeStatus === 'disabled' ? 'Désactivée' :
                       realtimeStatus === 'unavailable' ? 'Service indisponible' :
                       'État non déterminé'}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => api?.openExternal?.('windowsdefender:')}
                      title="Ouvrir les paramètres dans la Sécurité Windows"
                    >
                      Sécurité Windows ↗
                    </button>
                  </div>
                </div>

                <div className="setting-row" style={{ alignItems: 'center', padding: '14px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>Antivirus résident Defender</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.4 }}>
                      Service système de protection contre les logiciels malveillants (AMService).
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span className={`badge ${
                      antivirusStatus === 'active' ? 'badge-ok' :
                      antivirusStatus === 'disabled' ? 'badge-danger' :
                      'badge-neutral'
                    }`}>
                      {antivirusStatus === 'active' ? 'Moteur actif' :
                       antivirusStatus === 'disabled' ? 'Moteur arrêté' :
                       antivirusStatus === 'unavailable' ? 'Service indisponible' :
                       'État non déterminé'}
                    </span>
                  </div>
                </div>

                <div className="setting-row" style={{ alignItems: 'center', padding: '14px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>Pare-feu & Dossiers protégés</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.4 }}>
                      Pour éviter tout blocage réseau ou conflit d'administration, les règles de pare-feu et l'accès contrôlé aux dossiers se pilotent directement dans la console Sécurité Windows.
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ fontSize: 11, padding: '4px 12px' }}
                      onClick={() => api?.openExternal?.('windowsdefender:')}
                    >
                      Gérer dans Windows ↗
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          
          {/* ── Brief Quotidien & IA ── */}
          {activeSection === 'aibrief' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Brief Quotidien & Synthèse IA</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Configuration du moteur de synthèse du Brief Quotidien affiché sur l'écran d'accueil.
                </p>
              </div>

              <div className="list">
                <div className="setting-row" style={{ alignItems: 'flex-start', padding: '16px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>Mode de synthèse du Brief</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.5 }}>
                      Choisissez entre l'interprétation par le modèle de langage distant ou la synthèse déterministe locale 100% hors-ligne.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      className={`btn btn-sm ${aiConsent === 'granted' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: 11 }}
                      onClick={async () => {
                        await api?.setAiConsent?.('granted');
                        setAiConsent('granted');
                        showToast('Brief IA activé via OVHcloud AI Endpoints');
                      }}
                    >
                      Brief IA (OVHcloud)
                    </button>
                    <button
                      className={`btn btn-sm ${aiConsent === 'declined' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: 11 }}
                      onClick={async () => {
                        await api?.setAiConsent?.('declined');
                        setAiConsent('declined');
                        showToast('Synthèse locale déterministe activée (Hors-ligne)');
                      }}
                    >
                      Synthèse locale hors-ligne
                    </button>
                  </div>
                </div>
              </div>

              {/* Encadré d'information et de consentement */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-md)',
                padding: 18,
                fontSize: 12,
                color: 'var(--text)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700 }}>
                  <Sparkles size={16} style={{ color: 'var(--a1)' }} />
                  <span>Transparence & Confidentialité des données</span>
                </div>
                <p style={{ color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
                  Lorsque le Brief IA est activé, Vanguard interroge <strong>OVHcloud AI Endpoints</strong> (modèle <em>Mistral-Nemo-Instruct-2407</em>) en accès direct sans compte utilisateur ni clé API requise. Le quota public est de <strong>2 requêtes par minute par adresse IP</strong>.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
                  <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                    <b style={{ color: '#22c55e', display: 'block', marginBottom: 6 }}>✓ Données strictement minimisées transmises :</b>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 11.5, lineHeight: 1.5 }}>
                      <li>Temps d'activité du système (heures)</li>
                      <li>Mémoire vive totale et utilisée (Go, arrondi)</li>
                      <li>Espace disque C: total et libre (Go, arrondi)</li>
                      <li>Statut de l'antivirus Defender (booléen)</li>
                      <li>Nombre de menaces actives isolées (entier)</li>
                    </ul>
                  </div>

                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                    <b style={{ color: '#ef4444', display: 'block', marginBottom: 6 }}>✗ Données formellement exclues :</b>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 11.5, lineHeight: 1.5 }}>
                      <li>Nom et prénom de l'utilisateur</li>
                      <li>Chemins et noms de fichiers sur le disque</li>
                      <li>Adresses IP dans le contenu du prompt</li>
                      <li>Mots de passe, tokens et clés de chiffrement</li>
                      <li>Fichiers et métadonnées du futur Astral Vault</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Scanner de téléchargements ── */}
          {activeSection === 'downloads' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Scanner de téléchargements & Sentinelle USB</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Surveillance native des dossiers entrants (%USERPROFILE%\Downloads) et contrôle des clés USB sans charge CPU.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Surveillance proactive des téléchargements</div>
                    <div className="setting-desc">Analyse instantanée des exécutables et archives (.exe, .msi, .zip, .rar, .iso) dès stabilisation d'écriture</div>
                  </div>
                  <div
                    className={`sw ${scanDownloads ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !scanDownloads;
                      setScanDownloads(next);
                      await api?.saveScannerConfig?.({ enabled: next });
                      showToast(next ? 'Scanner de téléchargements activé' : 'Scanner de téléchargements désactivé');
                    }}
                    role="switch"
                    aria-checked={scanDownloads}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Sentinelle des périphériques USB & amovibles</div>
                    <div className="setting-desc">Détecte l'insertion de clés USB et analyse les fichiers détectés sur les volumes amovibles</div>
                  </div>
                  <div
                    className={`sw ${usbScanEnabled ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !usbScanEnabled;
                      setUsbScanEnabled(next);
                      await api?.saveScannerConfig?.({ usbScanEnabled: next });
                      showToast(next ? 'Sentinelle USB activée' : 'Sentinelle USB désactivée');
                    }}
                    role="switch"
                    aria-checked={usbScanEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Alertes sonores lors de la détection de menaces</div>
                    <div className="setting-desc">Émet un signal sonore distinctif lorsqu'un fichier malveillant ou suspect est neutralisé</div>
                  </div>
                  <div
                    className={`sw ${downloadSound ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !downloadSound;
                      setDownloadSound(next);
                      await api?.saveScannerConfig?.({ soundEnabled: next });
                      showToast(next ? 'Alertes sonores activées' : 'Alertes sonores désactivées');
                    }}
                    role="switch"
                    aria-checked={downloadSound}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Afficher la notification même si le fichier est sain</div>
                    <div className="setting-desc">Recommandé : Désactivé (mode discret sans interruption pour les fichiers sûrs)</div>
                  </div>
                  <div
                    className={`sw ${showModalEvenIfSafe ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !showModalEvenIfSafe;
                      setShowModalEvenIfSafe(next);
                      await api?.saveScannerConfig?.({ showModalEvenIfSafe: next });
                      showToast(next ? 'Affichage pour tous les fichiers activé' : 'Mode discret activé (alertes uniquement)');
                    }}
                    role="switch"
                    aria-checked={showModalEvenIfSafe}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Style d'affichage de la Sentinelle</div>
                    <div className="setting-desc">Déterminez la visibilité lors de la détection ou l'analyse des téléchargements</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(
                      [
                        { id: 'window', label: 'Fenêtre modale', desc: 'Complète au centre' },
                        { id: 'mini', label: 'Miniature', desc: 'Bannière coin inférieur' },
                        { id: 'notification', label: 'Notification de bureau', desc: 'Petite fenêtre près de la zone de notification' },
                      ] as const
                    ).map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className={`btn btn-sm ${discreteMode === item.id ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handleDiscreteModeChange(item.id)}
                        style={{
                          fontSize: 11,
                          padding: '6px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: 2,
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <span style={{ fontSize: 9.5, opacity: 0.75 }}>{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dossiers sous surveillance */}
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-md)',
                padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <b style={{ fontSize: 13, color: 'var(--text)' }}>Dossiers sous surveillance continue</b>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>Emplacements analysés automatiquement par le FileSystemWatcher natif.</p>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      try {
                        const res = await api?.selectScannerFolder?.();
                        if (res?.success && res.folderPath) {
                          const next = Array.from(new Set([...watchDirs, res.folderPath]));
                          setWatchDirs(next);
                          await api?.saveScannerConfig?.({ watchDirs: next });
                          showToast(`Dossier ajouté : ${res.folderPath}`);
                        }
                      } catch {}
                    }}
                    style={{ fontSize: 11, padding: '5px 12px' }}
                  >
                    + Ajouter un dossier
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(watchDirs.length > 0 ? watchDirs : ['%USERPROFILE%\\Downloads (Dossier Téléchargements par défaut)']).map((dir, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 11.5,
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <span className="mono">{dir}</span>
                      <span style={{ fontSize: 9.5, color: '#22c55e', background: 'rgba(34,197,94,0.12)', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                        SURVEILLÉ
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Banc d'essai sentinelle & EICAR test */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--r-md)',
                padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ef4444',
                      flexShrink: 0
                    }}>
                      <FlaskConical size={18} />
                    </div>
                    <div>
                      <b style={{ fontSize: 13, color: 'var(--text)' }}>Banc d'essai : Tester la Sentinelle & l'Alerte Sonore</b>
                      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
                        Générez un fichier de test inoffensif conforme au standard international <b>EICAR</b> (68 octets sans danger).
                        La sentinelle l'interceptera immédiatement et déclenchera la bannière rouge et l'alarme sonore.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          showToast('🧪 Génération du fichier de test EICAR dans Téléchargements...');
                          const res = await api?.createEicarTestFile?.();
                          if (res?.success) {
                            showToast('✓ Fichier EICAR créé ! Interception par Vanguard en cours...');
                          } else {
                            showToast(`Erreur : ${res?.error || 'Échec de génération'}`);
                          }
                        } catch (e: any) {
                          showToast(`Erreur : ${e.message}`);
                        }
                      }}
                      style={{
                        fontSize: 11,
                        padding: '7px 14px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        color: '#f87171',
                        fontWeight: 600,
                      }}
                    >
                      <FlaskConical size={13} style={{ marginRight: 6 }} />
                      Tester la Sentinelle (EICAR)
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        api?.openExternal?.('https://astral-security-guard-vpn.vercel.app/test-sentinel');
                      }}
                      style={{
                        fontSize: 11,
                        padding: '7px 12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      title="Ouvrir le laboratoire de test web dans le navigateur"
                    >
                      <ExternalLink size={13} />
                      <span>Test Web</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Gaming & Overlay ── */}
          {activeSection === 'gaming' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Jeux & Performances</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Superposition en jeu légère à zéro impact graphique (DirectX / PresentMon).
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Afficher l'overlay HUD en jeu</div>
                    <div className="setting-desc">Raccourci global clavier : <span className="kbd">Ctrl</span> + <span className="kbd">Shift</span> + <span className="kbd">O</span></div>
                  </div>
                  <div
                    className={`sw ${hudEnabled ? 'on' : ''}`}
                    onClick={handleToggleOverlay}
                    role="switch"
                    aria-checked={hudEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Détection automatique des jeux</div>
                    <div className="setting-desc">Active automatiquement le mode haute performance au lancement d'un titre Steam, Epic, Riot</div>
                  </div>
                  <div
                    className={`sw ${autoDetectGames ? 'on' : ''}`}
                    onClick={() => setAutoDetectGames(!autoDetectGames)}
                    role="switch"
                    aria-checked={autoDetectGames}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Afficher les compteurs FPS & 1% Low</div>
                    <div className="setting-desc">Mesures d'images par seconde en temps réel via PresentMon</div>
                  </div>
                  <div
                    className={`sw ${overlayFPS ? 'on' : ''}`}
                    onClick={() => setOverlayFPS(!overlayFPS)}
                    role="switch"
                    aria-checked={overlayFPS}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Afficher la charge CPU & Mémoire vive</div>
                    <div className="setting-desc">Taux d'occupation matériel en cours de partie</div>
                  </div>
                  <div
                    className={`sw ${overlayCPU ? 'on' : ''}`}
                    onClick={() => setOverlayCPU(!overlayCPU)}
                    role="switch"
                    aria-checked={overlayCPU}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Réseau & DNS ── */}
          {activeSection === 'network' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Réseau & DNS</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Paramètres de connectivité et configuration des résolveurs DNS.
                </p>
              </div>

              <div className="list">
                <div className="setting-row" style={{ alignItems: 'flex-start', padding: '14px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>DNS sur HTTPS (DoH)</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.4 }}>
                      La résolution DoH dépend de la prise en charge par les adaptateurs et la pile réseau du système d'exploitation Windows. Vanguard configure vos résolveurs IPv4 sans forcer de règle DoH unilatérale.
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <span className="badge badge-neutral">Géré par le système d'exploitation</span>
                  </div>
                </div>

                <div className="setting-row" style={{ alignItems: 'flex-start', padding: '14px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>Pile réseau IPv6</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.4 }}>
                      Vanguard ne modifie pas la configuration physique IPv6 de vos interfaces réseau. Le tunnel VPN gère les flux IPv4.
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <span className="badge badge-neutral">Non altéré par Vanguard</span>
                  </div>
                </div>

                <div className="setting-row" style={{ alignItems: 'flex-start', padding: '14px 0' }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ fontSize: 13.5, fontWeight: 600 }}>Algorithme anti-bufferbloat</div>
                    <div className="setting-desc" style={{ marginTop: 4, lineHeight: 1.4 }}>
                      La régulation active des files d'attente réseau n'est pas implémentée dans cette pré-release. Le module Réseau fournit une mesure indicative de l'écart de latence sous charge.
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <span className="badge badge-neutral">Non implémenté</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Notifications</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Les notifications s'affichent dans une petite fenêtre Vanguard près de la zone de notification Windows, y compris quand l'application est réduite dans la barre système. Ce ne sont pas des notifications natives du centre de notifications Windows. Aucune n'apparaît si Vanguard est fermé.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Afficher les notifications</div>
                    <div className="setting-desc">Désactivé : les événements restent dans l'historique ci-dessous, sans fenêtre ni son. Les alertes critiques s'affichent toujours.</div>
                  </div>
                  <div
                    className={`sw ${notifEnabled ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !notifEnabled;
                      setNotifEnabled(next);
                      await api?.saveUserProfile?.({ notificationsEnabled: next });
                      await api?.notifications?.savePrefs?.({ notificationsEnabled: next });
                    }}
                    role="switch"
                    aria-checked={notifEnabled}
                    aria-label="Afficher les notifications"
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Ne pas déranger</div>
                    <div className="setting-desc">Masque les notifications non critiques et coupe leur son</div>
                  </div>
                  <div
                    className={`sw ${dndEnabled ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !dndEnabled;
                      onDndChange?.(next);
                      await api?.notifications?.savePrefs?.({ dndEnabled: next });
                    }}
                    role="switch"
                    aria-checked={dndEnabled}
                    aria-label="Ne pas déranger"
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Sons</div>
                    <div className="setting-desc">Un son bref par notification affichée, selon sa gravité</div>
                  </div>
                  <div
                    className={`sw ${soundEnabled ? 'on' : ''}`}
                    onClick={async () => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      await api?.saveUserProfile?.({ soundEnabled: next });
                      await api?.notifications?.savePrefs?.({ soundEnabled: next });
                    }}
                    role="switch"
                    aria-checked={soundEnabled}
                    aria-label="Sons des notifications"
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Volume2 size={15} style={{ color: 'var(--a1)' }} />
                      Volume ({soundVolume}%)
                    </div>
                    <div className="setting-desc">{soundEnabled ? 'Écoutez un son pour régler le volume' : 'Les sons sont désactivés'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={soundVolume}
                      disabled={!soundEnabled}
                      aria-label="Volume des notifications"
                      onChange={e => handleVolumeChange(Number(e.target.value))}
                      style={{ width: 140, accentColor: 'var(--a1)' }}
                    />
                    {(['success', 'warning', 'error'] as const).map(kind => (
                      <button
                        key={kind}
                        type="button"
                        className="btn-ghost"
                        disabled={!soundEnabled || soundVolume === 0}
                        onClick={() => playNotificationTone(kind === 'success' ? 'success' : kind === 'warning' ? 'warning' : 'alert', soundVolume / 100)}
                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        title="Écouter ce son"
                      >
                        <Volume2 size={12} />
                        {kind === 'success' ? 'Succès' : kind === 'warning' ? 'Avertissement' : 'Erreur'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Catégories</h3>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
                  Les alertes critiques ignorent ce filtre.
                </p>
                <div className="list">
                  {[
                    { key: 'security', title: 'Sécurité', desc: 'Détections et neutralisations' },
                    { key: 'scanner', title: 'Téléchargements et clés USB', desc: 'Fichiers analysés par la Sentinelle' },
                    { key: 'maintenance', title: 'Maintenance', desc: 'Nettoyages et résultats' },
                    { key: 'network', title: 'Réseau', desc: 'Déconnexions et instabilité' },
                    { key: 'vpn', title: 'VPN', desc: 'Connexion et déconnexion du tunnel' },
                    { key: 'vault', title: 'Vault', desc: 'Verrouillage et sauvegardes' },
                    { key: 'updater', title: 'Mises à jour', desc: 'Nouvelles versions' },
                    { key: 'system', title: 'Système et jeux', desc: 'Mode jeu, profils et divers' },
                  ].map(cat => {
                    const isChecked = categories[cat.key] !== false;
                    return (
                      <div key={cat.key} className="setting-row">
                        <div className="setting-info">
                          <div className="setting-title" style={{ fontSize: 13 }}>{cat.title}</div>
                          <div className="setting-desc" style={{ fontSize: 11 }}>{cat.desc}</div>
                        </div>
                        <div
                          className={`sw ${isChecked ? 'on' : ''}`}
                          onClick={() => handleToggleCategory(cat.key, !isChecked)}
                          role="switch"
                          aria-checked={isChecked}
                          aria-label={cat.title}
                          tabIndex={0}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Tester</h3>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
                  Envoie une vraie notification par le même circuit que les événements de l'application, avec vos réglages actuels. Aucun réglage n'est modifié.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([['success', 'Succès'], ['warning', 'Avertissement'], ['error', 'Erreur']] as const).map(([kind, label]) => (
                    <button key={kind} type="button" className="btn btn-ghost" disabled={testingNotif} onClick={() => runNotificationTest(kind)}>
                      Tester : {label}
                    </button>
                  ))}
                </div>
                {notifTestResult && (
                  <p role="status" style={{ fontSize: 12, marginTop: 10, color: notifTestResult.ok ? 'var(--ok)' : 'var(--warn)' }}>
                    {notifTestResult.text}
                  </p>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Historique</h3>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={notifHistory.length === 0}
                    onClick={async () => { await api?.notifications?.clearHistory?.(); setNotifHistory([]); }}
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    Effacer l'historique
                  </button>
                </div>
                {notifHistory.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aucun événement enregistré.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {notifHistory.slice(0, 20).map((n: any) => (
                      <li key={n.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                        <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(n.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <b style={{ color: 'var(--text)', fontWeight: 600 }}>{n.title}</b>
                          <span style={{ color: 'var(--muted)' }}> — {n.message}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {/* ── Mises à jour ── */}
          {activeSection === 'updates' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Mises à jour logicielles</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Mises à jour automatiques sécurisées via GitHub Releases avec vérification SHA-256.
                </p>
              </div>

              {/* Version Card */}
              <div style={{
                background: 'var(--bg)',
                border: `1px solid ${updateInfo?.hasUpdate ? 'var(--a1)' : 'var(--line)'}`,
                borderRadius: 'var(--r-md)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--r-sm)',
                    background: updateInfo?.hasUpdate ? 'rgba(var(--a1r),.12)' : 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--line)',
                  }}>
                    <Zap size={16} style={{ color: updateInfo?.hasUpdate ? 'var(--a1)' : 'var(--muted)' }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        Vanguard Core v{currentVersion}
                      </span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Bêta pré-release
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: updateInfo?.hasUpdate ? 'var(--a1)' : 'var(--muted)', marginTop: 2 }}>
                      {updateStatus || (betaChannel ? '🧪 Canal Préversion actif' : 'Canal officiel pré-release')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {updateInfo?.hasUpdate && (
                    <button className="btn" style={{ fontSize: 11 }}
                      onClick={() => api?.downloadUpdate?.()}>
                      Télécharger v{updateInfo.version}
                    </button>
                  )}
                  <button
                    className="btn s"
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RefreshCw size={12} className={checkingUpdate ? 'animate-spin' : ''} />
                    {checkingUpdate ? 'Vérification…' : 'Rechercher'}
                  </button>
                </div>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Mises à jour automatiques</div>
                    <div className="setting-desc">Téléchargement et préparation en arrière-plan sans interrompre l'utilisateur</div>
                  </div>
                  <div
                    className={`sw ${autoUpdate ? 'on' : ''}`}
                    onClick={() => handleToggleAutoUpdate(!autoUpdate)}
                    role="switch"
                    aria-checked={autoUpdate}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                  <div className="setting-info">
                    <div className="setting-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FlaskConical size={13} style={{ color: betaChannel ? 'var(--a1)' : 'var(--dim)' }} />
                      Canal Préversion (Bêta)
                    </div>
                    <div className="setting-desc">
                      Recevoir les nouvelles fonctionnalités et optimisations en avant-première.
                      Les versions bêta sont distribuées exclusivement via ce canal — elles n'apparaissent
                      pas sur le site officiel.
                    </div>
                    {betaChannel && (
                      <div style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: 'rgba(var(--a1r),.06)',
                        border: '1px solid rgba(var(--a1r),.18)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 11,
                        color: 'var(--a1)',
                      }}>
                        🧪 Les versions marquées <strong>prerelease</strong> sur GitHub seront proposées au téléchargement.
                      </div>
                    )}
                  </div>
                  <div
                    className={`sw ${betaChannel ? 'on' : ''}`}
                    onClick={() => handleToggleBetaChannel(!betaChannel)}
                    role="switch"
                    aria-checked={betaChannel}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Diagnostic système ── */}
          {activeSection === 'diagnostic' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Diagnostic de conformité système</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Vérification de l'intégrité des composants, privilèges Windows et services requis.
                </p>
              </div>

              <div>
                <button
                  className="btn"
                  onClick={handleRunDiagnostic}
                  disabled={runningDiag}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <Activity size={14} className={runningDiag ? 'animate-spin' : ''} />
                  <span>{runningDiag ? 'Analyse des composants…' : 'Lancer le diagnostic complet'}</span>
                </button>
              </div>

              {diagResults.length > 0 && (
                <div className="list" style={{ marginTop: 12 }}>
                  {diagResults.map((r, i) => (
                    <div key={i} className="setting-row">
                      <div className="setting-info">
                        <div className="setting-title">{r.name}</div>
                        <div className="setting-desc">{r.status}</div>
                      </div>
                      <span className={`chip ${r.ok ? 'ok' : 'bad'}`}>
                        {r.ok ? 'CONFORME' : 'ATTENTION'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Profil utilisateur ── */}
          {activeSection === 'profile' && (
            <div className="stack" style={{ gap: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(var(--a1r), 0.25), rgba(var(--a1r), 0.05))',
                      border: '2px solid var(--a1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      fontWeight: 800,
                      color: 'var(--a1)',
                      boxShadow: '0 0 18px rgba(var(--a1r), 0.25)',
                      flexShrink: 0,
                    }}
                  >
                    {((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || 'VC'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                        {firstName ? `${firstName} ${lastName}`.trim() : 'Utilisateur Vanguard'}
                      </h2>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Personnalisation locale du tableau de bord et du message d'accueil Astral Vanguard.
                    </p>
                  </div>
                </div>

                {onRelaunchOnboarding && (
                  <button
                    className="btn btn-ghost"
                    onClick={onRelaunchOnboarding}
                    style={{ fontSize: 12, padding: '7px 14px', borderRadius: 'var(--r-sm)' }}
                  >
                    <span>Relancer l'assistant initial</span>
                  </button>
                )}
              </div>

              {error && <div className="state-error">{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, letterSpacing: '0.04em' }}>
                    PRÉNOM
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="ex: Alex"
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                      padding: '10px 14px',
                      color: 'var(--text)',
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, letterSpacing: '0.04em' }}>
                    NOM (OPTIONNEL)
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="ex: Dupont"
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                      padding: '10px 14px',
                      color: 'var(--text)',
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <button
                  className="btn"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700 }}
                >
                  <Save size={15} />
                  <span>{savingProfile ? 'Enregistrement…' : profileSaved ? '✓ Enregistré !' : 'Sauvegarder mon profil'}</span>
                </button>

                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  🔒 Zéro télémétrie · Stockage local exclusif dans votre espace utilisateur
                </div>
              </div>
            </div>
          )}

          {/* ── À propos ── */}
          {activeSection === 'about' && (
            <div className="stack" style={{ gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--r-md)',
                    background: 'var(--line)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 16,
                    color: 'var(--a1)',
                  }}
                >
                  VC
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Vanguard Core</h2>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>v{currentVersion} (Bêta Pré-release) · Application PC de la suite Vanguard par Astral Security</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
                Vanguard Core est une application PC autonome de sécurité et de performances. Elle coordonne
                la protection proactive des téléchargements, la maintenance système et les profils e-sport réversibles
                sans compte, sans publicité et avec un respect strict de la confidentialité locale.
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: 16,
                  display: 'flex',
                  gap: 12,
                  fontSize: 11,
                  color: 'var(--dim)',
                }}
              >
                <span>Moteur : Windows Security API</span>
                <span>·</span>
                <span>Pilote : Wintun x64</span>
                <span>·</span>
                <span>FPS Engine : PresentMon v2.3</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
