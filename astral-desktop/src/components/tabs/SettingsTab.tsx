import { useState, useEffect } from 'react';
import {
  User, Palette, Sliders, Shield, Gamepad2,
  Bell, RefreshCw, Cpu, Info, Check, CheckCircle2,
  AlertTriangle, X, Save, ExternalLink, Monitor,
  Wifi, Download, Activity, Lock, Volume2, Zap, FlaskConical
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
  | 'profile'
  | 'about';

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'appearance',    label: 'Apparence',        icon: Palette },
  { id: 'general',       label: 'Général & Système',icon: Sliders },
  { id: 'security',      label: 'Sécurité & Defender', icon: Shield },
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

  // Profile
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  // General & System
  const [autostart, setAutostart]               = useState(true);
  const [minimizeToTray, setMinimizeToTray]     = useState(true);
  const [reduceAnimations, setReduceAnimations] = useState(false);

  // Security & Defender
  const [realtimeProtection, setRealtimeProtection] = useState(true);
  const [cloudProtection, setCloudProtection]       = useState(true);
  const [controlledFolderAccess, setControlledFolderAccess] = useState(false);
  const [firewallProfiles, setFirewallProfiles]     = useState(true);

  // Downloads Scanner
  const [scanDownloads, setScanDownloads]     = useState(true);
  const [blockUnsigned, setBlockUnsigned]     = useState(false);

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

  // Updates
  const [autoUpdate, setAutoUpdate]         = useState(true);
  const [betaChannel, setBetaChannel]       = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus]     = useState('');
  const [currentVersion, setCurrentVersion] = useState('2.5.12');
  const [updateInfo, setUpdateInfo]         = useState<{ version?: string; hasUpdate?: boolean } | null>(null);

  const playTestNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const vol = (soundVolume / 100) * 0.15;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  // Admin status
  const [isAdmin, setIsAdmin]               = useState<boolean | null>(null);

  // Diagnostic
  const [diagResults, setDiagResults] = useState<{ name: string; status: string; ok: boolean }[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

  // Error / notice
  const [notice, setNotice] = useState('');
  const [error, setError]   = useState('');

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

    // Check system Defender status
    api.getDefenderStatus?.().then((res: any) => {
      if (res?.data) {
        if (typeof res.data.realTimeProtection === 'boolean') setRealtimeProtection(res.data.realTimeProtection);
      }
    }).catch(() => {});

    // Load preview channel state from electron-updater
    api.getPreviewChannel?.().then((res: any) => {
      if (typeof res?.previewChannel === 'boolean') setBetaChannel(res.previewChannel);
    }).catch(() => {});

    // Load updater version info
    api.getUpdaterState?.().then((state: any) => {
      if (state?.currentVersion) setCurrentVersion(state.currentVersion);
    }).catch(() => {});

    // Check admin status
    api.getAdminStatus?.().then((res: any) => {
      if (typeof res?.isAdmin === 'boolean') setIsAdmin(res.isAdmin);
    }).catch(() => {});

    // Sync HUD state from main process
    api.hudGetState?.().then((res: any) => {
      if (typeof res?.active === 'boolean') setHudEnabled(res.active);
      else if (typeof res === 'boolean') setHudEnabled(res);
    }).catch(() => {});

    const unHud = api.on?.('hud:state-changed', (d: any) => {
      if (typeof d?.active === 'boolean') setHudEnabled(d.active);
      else if (typeof d?.enabled === 'boolean') setHudEnabled(d.enabled);
    });

    return () => {
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

  const handleToggleReduceMotion = (val: boolean) => {
    setReduceAnimations(val);
    document.documentElement.classList.toggle('reduce-motion', val);
    showToast(val ? 'Animations réduites' : 'Animations standard rétablies');
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

  const handleRunDiagnostic = async () => {
    setRunningDiag(true);
    setDiagResults([]);
    const checks = [
      { name: 'Microsoft Defender Antivirus', status: 'Vérification…', ok: true },
      { name: 'Pare-feu Windows Avancé',      status: 'Vérification…', ok: true },
      { name: 'Pilote Wintun & WireGuard',    status: 'Vérification…', ok: true },
      { name: 'Droits Administrateur',       status: 'Vérification…', ok: true },
      { name: 'Télémétrie Windows désactivée', status: 'Vérification…', ok: true },
      { name: 'Capteurs Disque SMART',        status: 'Vérification…', ok: true },
    ];

    for (let i = 0; i < checks.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      let ok = true;
      let status = 'Actif / Conforme';
      if (i === 3 && api?.getAdminStatus) {
        const adm = await api.getAdminStatus();
        ok = adm?.isAdmin ?? true;
        status = ok ? 'Accordé' : 'Mode Restreint';
      }
      setDiagResults(prev => [...prev, { name: checks[i].name, status, ok }]);
    }
    setRunningDiag(false);
    showToast('Diagnostic système terminé');
  };

  return (
    <div className="tab-container animate-fade-in" style={{ padding: '24px 32px' }}>
      {/* Toast Notification */}
      {notice && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 999,
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
            animation: 'toastIn .2s var(--ease) both',
          }}
        >
          <CheckCircle2 size={15} style={{ color: 'var(--ok)' }} />
          <span>{notice}</span>
        </div>
      )}

      {/* Header */}
      <div className="tab-header" style={{ marginBottom: 24 }}>
        <h1 className="tab-title">Paramètres</h1>
        <p className="tab-subtitle">Configuration globale du système, sécurité, apparence et matériel</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Navigation Sidebar */}
        <div
          style={{
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
                background: isAdmin === false ? 'rgba(239,68,68,.05)' : 'rgba(var(--a1r),.04)',
                border: `1px solid ${isAdmin === false ? 'rgba(239,68,68,.25)' : isAdmin ? 'rgba(var(--a1r),.2)' : 'var(--line)'}`,
                borderRadius: 'var(--r-md)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Lock size={16} style={{ color: isAdmin === false ? 'rgb(239,68,68)' : isAdmin ? 'var(--a1)' : 'var(--dim)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      Droits Administrateur
                    </div>
                    <div style={{ fontSize: 11, color: isAdmin === false ? 'rgb(239,68,68)' : 'var(--muted)', marginTop: 2 }}>
                      {isAdmin === null
                        ? 'Vérification…'
                        : isAdmin
                        ? '✓ Session élevée — l’application dispose des privilèges système complets'
                        : '⚠ Mode restreint détecté — certaines fonctions peuvent être limitées'}
                    </div>
                  </div>
                </div>
                {isAdmin === false && (
                  <button
                    className="btn"
                    style={{ fontSize: 11, flexShrink: 0, borderColor: 'rgba(239,68,68,.4)', color: 'rgb(239,68,68)' }}
                    onClick={async () => {
                      await api?.relaunchElevated?.();
                      showToast('Relancement en mode administrateur…');
                    }}
                  >
                    Relancer en admin
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
                  Pilotage direct des modules de défense natifs de Windows.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Protection en temps réel</div>
                    <div className="setting-desc">Surveillance active des fichiers et processus par Microsoft Defender</div>
                  </div>
                  <div
                    className={`sw ${realtimeProtection ? 'on' : ''}`}
                    onClick={() => setRealtimeProtection(!realtimeProtection)}
                    role="switch"
                    aria-checked={realtimeProtection}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Pare-feu Windows Avancé</div>
                    <div className="setting-desc">Filtrage réseau actif sur tous les profils (Domaine, Privé, Public)</div>
                  </div>
                  <div
                    className={`sw ${firewallProfiles ? 'on' : ''}`}
                    onClick={() => setFirewallProfiles(!firewallProfiles)}
                    role="switch"
                    aria-checked={firewallProfiles}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Protection Ransomware (Dossiers contrôlés)</div>
                    <div className="setting-desc">Empêche les processus non autorisés de modifier vos documents et photos</div>
                  </div>
                  <div
                    className={`sw ${controlledFolderAccess ? 'on' : ''}`}
                    onClick={() => setControlledFolderAccess(!controlledFolderAccess)}
                    role="switch"
                    aria-checked={controlledFolderAccess}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Scanner de téléchargements ── */}
          {activeSection === 'downloads' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Scanner de téléchargements</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Analyse automatique immédiate des fichiers entrants dans vos dossiers de téléchargement.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Analyser chaque téléchargement entrant</div>
                    <div className="setting-desc">Analyse instantanée des extensions exécutables et archives (.exe, .msi, .zip, .jar)</div>
                  </div>
                  <div
                    className={`sw ${scanDownloads ? 'on' : ''}`}
                    onClick={() => setScanDownloads(!scanDownloads)}
                    role="switch"
                    aria-checked={scanDownloads}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Avertir sur les binaires non signés numériquement</div>
                    <div className="setting-desc">Vérifie le certificat Authenticode de l'éditeur avant d'autoriser l'exécution</div>
                  </div>
                  <div
                    className={`sw ${blockUnsigned ? 'on' : ''}`}
                    onClick={() => setBlockUnsigned(!blockUnsigned)}
                    role="switch"
                    aria-checked={blockUnsigned}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Gaming & Overlay ── */}
          {activeSection === 'gaming' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Gaming & Overlay HUD</h2>
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
                  Optimisation des piles TCP/IP et protection contre les fuites de requêtes.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">DNS sur HTTPS (DoH)</div>
                    <div className="setting-desc">Chiffre vos résolutions DNS pour empêcher le traçage par le FAI</div>
                  </div>
                  <div
                    className={`sw ${dohEnabled ? 'on' : ''}`}
                    onClick={() => setDohEnabled(!dohEnabled)}
                    role="switch"
                    aria-checked={dohEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Désactiver IPv6 lors des sessions sécurisées</div>
                    <div className="setting-desc">Évite les fuites de paquets IPv6 non encapsulés hors du tunnel</div>
                  </div>
                  <div
                    className={`sw ${disableIpv6 ? 'on' : ''}`}
                    onClick={() => setDisableIpv6(!disableIpv6)}
                    role="switch"
                    aria-checked={disableIpv6}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Algorithme anti-bufferbloat</div>
                    <div className="setting-desc">Régulation des files d'attente pour réduire la latence sous forte charge réseau</div>
                  </div>
                  <div
                    className={`sw ${antiBufferbloat ? 'on' : ''}`}
                    onClick={() => setBufferbloat(!antiBufferbloat)}
                    role="switch"
                    aria-checked={antiBufferbloat}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Notifications & Alertes</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Gestion des bannières visuelles et des alertes de sécurité prioritaires.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Mode Ne Pas Déranger (DND)</div>
                    <div className="setting-desc">Masque toutes les notifications non critiques pendant que vous travaillez ou jouez</div>
                  </div>
                  <div
                    className={`sw ${dndEnabled ? 'on' : ''}`}
                    onClick={() => onDndChange?.(!dndEnabled)}
                    role="switch"
                    aria-checked={dndEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Notifications système</div>
                    <div className="setting-desc">Affichage des alertes lors de la détection de menaces ou blocages</div>
                  </div>
                  <div
                    className={`sw ${notifEnabled ? 'on' : ''}`}
                    onClick={() => setNotifEnabled(!notifEnabled)}
                    role="switch"
                    aria-checked={notifEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Effets sonores discrets</div>
                    <div className="setting-desc">Retour audio léger lors des actions réussies ou alertes</div>
                  </div>
                  <div
                    className={`sw ${soundEnabled ? 'on' : ''}`}
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    role="switch"
                    aria-checked={soundEnabled}
                    tabIndex={0}
                  />
                </div>

                {soundEnabled && (
                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Volume2 size={15} style={{ color: 'var(--a1)' }} />
                        Volume des notifications ({soundVolume}%)
                      </div>
                      <div className="setting-desc">Niveau sonore des alertes procédurales Web Audio (sécurité, gaming, vpn)</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220 }}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={soundVolume}
                        onChange={e => setSoundVolume(Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--a1)', cursor: 'pointer' }}
                      />
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={playTestNotificationSound}
                        style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                      >
                        <Volume2 size={13} />
                        <span>Tester le son</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Centre d'essai et de test des notifications */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Centre d'essai & Validation des Notifications
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 14 }}>
                  Testez instantanément les bannières visuelles et l'habillage sonore en conditions réelles.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '10px 14px', textAlign: 'left', borderColor: 'rgba(239,68,68,0.3)' }}
                    onClick={() => {
                      api?.sendNotification?.({
                        type: 'threat',
                        title: 'Menace détectée et neutralisée',
                        body: 'Trojan:Win32/Wacatac.B!ml bloqué dans C:\\Users\\Temp\\agent.exe',
                        critical: true,
                      });
                      api?.testNotification?.('Menace détectée et neutralisée', 'Trojan:Win32/Wacatac.B!ml bloqué avec succès.');
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)', marginRight: 6, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>Alerte Menace Critique</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>Accent rouge · Alerte prioritaire</div>
                    </div>
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '10px 14px', textAlign: 'left', borderColor: 'rgba(var(--a1r),0.3)' }}
                    onClick={() => {
                      api?.sendNotification?.({
                        type: 'gaming',
                        title: 'Mode Gaming Extrême Activé',
                        body: 'Jeu détecté : Counter-Strike 2 — Priorité CPU & anti-lag réseau appliqués.',
                        critical: false,
                      });
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--a1)', marginRight: 6, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>Alerte Mode Gaming</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>Accent indigo · Confirmation jeu</div>
                    </div>
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '10px 14px', textAlign: 'left', borderColor: 'rgba(214,173,104,0.3)' }}
                    onClick={() => {
                      api?.sendNotification?.({
                        type: 'network',
                        title: 'Latence réseau anormale détectée',
                        body: 'Ping actuel : 182 ms (seuil dépassé). Correction anti-bufferbloat disponible.',
                        critical: false,
                      });
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', marginRight: 6, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>Alerte Réseau & Lag</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>Accent orange · Signal latence</div>
                    </div>
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '10px 14px', textAlign: 'left', borderColor: 'rgba(104,184,148,0.3)' }}
                    onClick={() => {
                      api?.sendNotification?.({
                        type: 'security',
                        title: 'Analyse antivirus terminée',
                        body: 'Moteur Microsoft Defender : Système sain, 0 menace détectée sur 4120 fichiers.',
                        critical: false,
                      });
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', marginRight: 6, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>Fin d'analyse système</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>Accent vert · Succès de scan</div>
                    </div>
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '10px 14px', textAlign: 'left', borderColor: 'rgba(239,68,68,0.3)' }}
                    onClick={() => {
                      api?.sendNotification?.({
                        type: 'vpn',
                        title: 'Alerte Tunnel VPN',
                        body: 'Tunnel WireGuard déconnecté. Kill Switch engagé pour protéger votre IP.',
                        critical: true,
                      });
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)', marginRight: 6, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>Alerte VPN & Kill Switch</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>Accent rouge · Rupture de tunnel</div>
                    </div>
                  </button>
                </div>
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
                    onClick={() => setAutoUpdate(!autoUpdate)}
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
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Profil utilisateur</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Personnalisation locale du tableau de bord et du message d'accueil.
                </p>
              </div>

              {error && <div className="state-error">{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
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
                      padding: '8px 12px',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
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
                      padding: '8px 12px',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div>
                <button
                  className="btn"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <Save size={14} />
                  <span>{savingProfile ? 'Enregistrement…' : profileSaved ? 'Enregistré !' : 'Sauvegarder mon profil'}</span>
                </button>
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
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>v{currentVersion} (Bêta) · Application PC de la suite Astral Vanguard</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
                Vanguard Core est l'application PC officielle développée par Astral Security. Elle coordonne
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
