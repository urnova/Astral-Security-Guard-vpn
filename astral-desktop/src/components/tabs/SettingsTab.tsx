import React, { useState, useEffect } from 'react';
import {
  User, Palette, Sliders, Shield, Download, Gamepad2,
  Wifi, Bell, RefreshCw, Cpu, Info, Check, AlertCircle,
  ExternalLink, Save, Sparkles, Monitor, ShieldCheck
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { playSound, setMasterVolume } from '../../lib/audioSynth';
import VanguardLogo from '../common/VanguardLogo';
import { CyberToggle } from '../common/CyberToggle';

const api = (window as any).vanguard;

export interface SettingsTabProps {
  dndEnabled?: boolean;
  onDndChange?: (val: boolean) => void;
  onProfileSaved?: () => void;
  onRelaunchOnboarding?: () => void;
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
}

type SettingsSection =
  | 'profile'
  | 'appearance'
  | 'general'
  | 'security'
  | 'downloads'
  | 'gaming'
  | 'network'
  | 'notifications'
  | 'updates'
  | 'diagnostic'
  | 'about';

interface NavSectionItem {
  id: SettingsSection;
  label: string;
  icon: React.ElementType;
}

const SECTIONS: NavSectionItem[] = [
  { id: 'profile',       label: 'Mon Profil',           icon: User },
  { id: 'appearance',    label: 'Apparence & Thèmes',   icon: Palette },
  { id: 'general',       label: 'Général & Système',    icon: Sliders },
  { id: 'security',      label: 'Sécurité & Defender',  icon: Shield },
  { id: 'downloads',     label: 'Scanner Fichiers',     icon: Download },
  { id: 'gaming',        label: 'Gaming & Overlay HUD', icon: Gamepad2 },
  { id: 'network',       label: 'Réseau & DNS',         icon: Wifi },
  { id: 'notifications', label: 'Notifications & Sons', icon: Bell },
  { id: 'updates',       label: 'Mises à jour',         icon: RefreshCw },
  { id: 'diagnostic',    label: 'Diagnostic Système',   icon: Cpu },
  { id: 'about',         label: 'À propos',             icon: Info },
];

export default function SettingsTab({
  dndEnabled = false,
  onDndChange,
  onProfileSaved,
  onRelaunchOnboarding,
  currentTheme = 'vanguard-dark',
  onThemeChange,
}: SettingsTabProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  // Profile State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // General Settings
  const [autostart, setAutostart] = useState(true);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  // Appearance
  const [reduceAnimations, setReduceAnimations] = useState(false);

  // Gaming & HUD
  const [autoDetectGames, setAutoDetectGames] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);

  // Network & Watchdog
  const [dnsProvider, setDnsProvider] = useState<'auto' | 'cloudflare' | 'google'>('auto');
  const [watchdogEnabled, setWatchdogEnabled] = useState(true);
  const [watchdogThreshold, setWatchdogThreshold] = useState(250);

  // Notifications & Sound
  const [volume, setVolume] = useState(70);
  const [testNotifSending, setTestNotifSending] = useState(false);

  // Downloads Scanner
  const [scannerConfig, setScannerConfig] = useState<{
    enabled: boolean;
    watchDirs: string[];
    ignoredExtensions: string[];
    showModalEvenIfSafe: boolean;
    soundEnabled: boolean;
    usbScanEnabled: boolean;
  }>({
    enabled: true,
    watchDirs: [],
    ignoredExtensions: ['.txt', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.mp4', '.pdf'],
    showModalEvenIfSafe: false,
    soundEnabled: true,
    usbScanEnabled: true,
  });

  // Updates State
  const [updaterState, setUpdaterState] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');

  // Diagnostic
  const [adminStatus, setAdminStatus] = useState<any>(null);

  // Global notice & error
  const [notice, setNotice] = useState('');
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  const showNotification = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  useEffect(() => {
    if (!api) return;

    // Load initial profile
    api.getProfile?.().then((res: any) => {
      if (res) {
        if (res.firstName) setFirstName(res.firstName);
        if (res.lastName) setLastName(res.lastName);
      }
    });

    // Load general settings
    api.getSettings?.().then((res: any) => {
      if (res) {
        if (res.openAtLogin !== undefined) setAutostart(res.openAtLogin);
        if (res.minimizeToTray !== undefined) setMinimizeToTray(res.minimizeToTray);
        if (res.overlayActive !== undefined) setOverlayActive(res.overlayActive);
      }
    });

    // Load gaming auto detect
    api.getGamingStatus?.().then((res: any) => {
      if (res?.autoDetectEnabled !== undefined) setAutoDetectGames(res.autoDetectEnabled);
    });

    // Load watchdog settings
    api.getPingWatchdog?.().then((res: any) => {
      if (res) {
        setWatchdogEnabled(res.enabled);
        setWatchdogThreshold(res.threshold || 250);
      }
    });

    // Load scanner config
    api.getScannerConfig?.().then((res: any) => {
      if (res?.success && res.config) setScannerConfig(res.config);
    });

    // Load updater state
    api.getUpdaterState?.().then((state: any) => {
      if (state) setUpdaterState(state);
    });

    // Load admin status
    api.getAdminStatus?.().then((res: any) => {
      if (res) setAdminStatus(res);
    });

    const cleanupUpdater = api.on?.('updater:state-changed', (state: any) => {
      setUpdaterState(state);
    });

    return () => {
      if (typeof cleanupUpdater === 'function') cleanupUpdater();
    };
  }, []);

  // Save User Profile
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!api) return;

    setSavingProfile(true);
    setErrorInfo(null);
    try {
      const res = await api.saveUserProfile?.({ firstName: firstName.trim(), lastName: lastName.trim() });
      if (res?.success) {
        setProfileSuccess(true);
        showNotification('Profil sauvegardé avec succès.');
        if (onProfileSaved) onProfileSaved();
        setTimeout(() => setProfileSuccess(false), 2500);
      } else {
        setErrorInfo({ message: 'Erreur lors de la sauvegarde du profil', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors de la sauvegarde du profil', technical: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  // Toggle autostart
  const handleToggleAutostart = async (val: boolean) => {
    setAutostart(val);
    await api?.setAutostart?.(val);
    showNotification(val ? 'Démarrage automatique activé' : 'Démarrage automatique désactivé');
  };

  // Toggle minimize to tray
  const handleToggleMinimize = async (val: boolean) => {
    setMinimizeToTray(val);
    await api?.setMinimizeToTray?.(val);
  };

  // Toggle HUD Overlay
  const handleToggleOverlay = async (val: boolean) => {
    setOverlayActive(val);
    await api?.overlayToggle?.(val);
  };

  // Check update
  const handleCheckUpdate = async () => {
    if (!api) return;
    setCheckingUpdate(true);
    setUpdateMessage('');
    setErrorInfo(null);
    try {
      const res = await api.checkUpdate();
      if (res?.success) {
        setUpdateMessage('Vérification effectuée avec succès sur GitHub.');
      } else {
        setUpdateMessage(res?.error || 'Aucune nouvelle version disponible.');
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur de recherche de mise à jour', technical: err.message });
    } finally {
      setCheckingUpdate(false);
      setTimeout(() => setUpdateMessage(''), 5000);
    }
  };

  // Test native notification
  const handleTestNativeNotification = async () => {
    if (!api) return;
    setTestNotifSending(true);
    try {
      await api.testNotification?.(
        'Astral Vanguard - Notification',
        'Notification native Windows opérationnelle. Système protégé.'
      );
      showNotification('Notification envoyée au centre Windows.');
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur d’envoi de notification', technical: err.message });
    } finally {
      setTestNotifSending(false);
    }
  };

  return (
    <div className="tab-scroll" style={{ maxWidth: 1220, margin: '0 auto', padding: '24px 32px 48px' }}>
      {/* Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={22} style={{ color: 'var(--cyan)' }} />
            Paramètres & Centre de Contrôle
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Profil persistant, thèmes d'interface, moteur de sécurité et préférences système
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge badge-purple" style={{ fontFamily: 'var(--mono)' }}>
            v2.5.0
          </span>
        </div>
      </div>

      {notice && (
        <div className="badge badge-green" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
          <Check size={16} />
          <span>{notice}</span>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 16 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Main Settings Layout: Sub-Nav on left, Content on right */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Secondary Navigation */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={16} style={{ color: isActive ? 'var(--cyan)' : 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section Content Panel */}
        <div className="glass-card" style={{ padding: 28, minHeight: 480 }}>
          {/* SECTION 1: PROFIL */}
          {activeSection === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Mon Profil Utilisateur</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Vos coordonnées sont stockées de façon chiffrée et préservées lors de chaque mise à jour applicative.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 540 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
                  <div style={{ width: 54, height: 54, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.2)', border: '2px solid rgba(99, 102, 241, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#c084fc' }}>
                    {firstName.trim() ? firstName.trim()[0].toUpperCase() : 'V'}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Utilisateur Astral Vanguard'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stocké dans %APPDATA%\Astral Vanguard\user-profile.json</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Prénom</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Votre prénom"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Nom</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Votre nom"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="btn btn-primary"
                    style={{ padding: '9px 18px' }}
                  >
                    {profileSuccess ? <Check size={16} /> : <Save size={16} />}
                    <span>{savingProfile ? 'Enregistrement...' : profileSuccess ? 'Enregistré !' : 'Enregistrer le profil'}</span>
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Actualise immédiatement l'en-tête de bienvenue.
                  </span>
                </div>

                {/* Assistant Onboarding Launcher */}
                <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Assistant de configuration pas-à-pas
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Relancez le guide interactif de bienvenue pour reconfigurer l'application de A à Z.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onRelaunchOnboarding) {
                        onRelaunchOnboarding();
                      } else {
                        api?.saveUserProfile?.({ onboardingCompleted: false });
                        window.location.reload();
                      }
                    }}
                    className="btn btn-ghost"
                    style={{ fontSize: 12 }}
                  >
                    <Sparkles size={14} style={{ color: 'var(--cyan)' }} />
                    <span>Relancer l'assistant de configuration</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SECTION 2: APPARENCE */}
          {activeSection === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Apparence & Thèmes Professionnels</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Quatre thèmes complets conçus avec une rigueur esthétique absolue, sans halos criards ni fioritures inutiles.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {[
                  { id: 'vanguard-dark', name: 'Obsidian Slate (Défaut)', sub: 'Ardoise sombre, violet cobalt & cyan', bg: '#090d16', border: '#6366f1', c1: '#090d16', c2: '#6366f1', c3: '#06b6d4' },
                  { id: 'cyber-cyan', name: 'Titanium Minimal', sub: 'Titane sombre épuré & cyan électrique', bg: '#070c14', border: '#06b6d4', c1: '#070c14', c2: '#06b6d4', c3: '#38bdf8' },
                  { id: 'midnight-purple', name: 'Midnight Cobalt', sub: 'Nuit cobalt profonde & améthyste royale', bg: '#0b0817', border: '#8b5cf6', c1: '#0b0817', c2: '#8b5cf6', c3: '#d946ef' },
                  { id: 'stealth-oled', name: 'Stealth OLED', sub: 'Noir absolu #000000 & émeraude', bg: '#000000', border: '#10b981', c1: '#000000', c2: '#10b981', c3: '#f8fafc' },
                ].map((th) => {
                  const isCurrent = (currentTheme || 'vanguard-dark') === th.id;
                  return (
                    <div
                      key={th.id}
                      onClick={() => onThemeChange?.(th.id)}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        border: `2px solid ${isCurrent ? th.border : 'var(--border)'}`,
                        backgroundColor: th.bg,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: isCurrent ? `0 0 16px ${th.border}35` : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{th.name}</span>
                        {isCurrent && <Check size={14} style={{ color: th.border }} />}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: th.c1, border: '1px solid rgba(255,255,255,0.2)' }} />
                        <div style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: th.c2 }} />
                        <div style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: th.c3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{th.sub}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Mode animations réduites</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Désactive les transitions d'affichage pour une réactivité instantanée.</div>
                </div>
                <CyberToggle checked={reduceAnimations} onChange={setReduceAnimations} />
              </div>
            </div>
          )}

          {/* SECTION 3: GENERAL */}
          {activeSection === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Général & Système</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Comportement en arrière-plan, présence dans le System Tray et démarrage automatique.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Démarrage automatique avec Windows</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lance Astral Vanguard silencieusement lors de l'ouverture de votre session.</div>
                  </div>
                  <CyberToggle checked={autostart} onChange={handleToggleAutostart} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Réduire dans la zone de notification (Tray)</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Garde la protection active en arrière-plan lors du clic sur la croix.</div>
                  </div>
                  <CyberToggle checked={minimizeToTray} onChange={handleToggleMinimize} />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: SECURITE */}
          {activeSection === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Sécurité & Multi-Moteurs</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Contrôle direct du sous-système Microsoft Defender et des modules heuristiques locaux.
                </p>
              </div>

              <div style={{ padding: 18, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Protection en temps réel Microsoft Defender</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Moteur natif Windows avec supervision télémétrique directe.</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 4 }}>
                  Toutes les exclusions, analyses et rafraîchissements de définitions s'exécutent via l'API PowerShell sécurisée sans modification opaque du registre.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={async () => {
                    if (!api) return;
                    showNotification('Mise à jour des signatures Defender en cours...');
                    const res = await api.updateSignatures?.();
                    if (res?.success) showNotification('Signatures Defender à jour.');
                  }}
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                >
                  <RefreshCw size={15} />
                  <span>Mettre à jour les définitions Defender</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 5: TELECHARGEMENTS */}
          {activeSection === 'downloads' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Scanner de Fichiers & Sentinelle USB</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Surveillance en temps réel des nouveaux exécutables et supports amovibles.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Surveillance des dossiers de téléchargement</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Analyse automatique des extensions critiques (.exe, .zip, .msi, .bat).</div>
                </div>
                <CyberToggle
                  checked={scannerConfig.enabled}
                  onChange={(checked) => {
                    const next = { ...scannerConfig, enabled: checked };
                    setScannerConfig(next);
                    api?.saveScannerConfig?.(next);
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Sentinelle périphériques amovibles (USB)</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Propose une vérification d'intégrité lors de l'insertion d'une clé USB.</div>
                </div>
                <CyberToggle
                  checked={scannerConfig.usbScanEnabled}
                  onChange={(checked) => {
                    const next = { ...scannerConfig, usbScanEnabled: checked };
                    setScannerConfig(next);
                    api?.saveScannerConfig?.(next);
                  }}
                />
              </div>
            </div>
          )}

          {/* SECTION 6: GAMING & HUD */}
          {activeSection === 'gaming' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Gaming & Overlay HUD</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Overlay minimaliste en jeu et détection automatique des processus 3D.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Afficher l'Overlay HUD en jeu</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Raccourci global : <kbd style={{ padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.1)', fontFamily: 'var(--mono)' }}>Ctrl + Shift + O</kbd></div>
                </div>
                <CyberToggle
                  checked={overlayActive}
                  onChange={(checked) => handleToggleOverlay(checked)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Détection automatique des jeux</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Exclut strictement les navigateurs et logiciels bureautiques.</div>
                </div>
                <CyberToggle
                  checked={autoDetectGames}
                  onChange={async (checked) => {
                    setAutoDetectGames(checked);
                    await api?.saveGamingAutoDetect?.(checked);
                    showNotification(checked ? 'Détection auto activée' : 'Détection auto désactivée');
                  }}
                />
              </div>
            </div>
          )}

          {/* SECTION 7: RESEAU & DNS */}
          {activeSection === 'network' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Réseau & Fournisseurs DNS</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Bascule instantanée vers des résolveurs chiffrés et rapides sans modifier le registre Windows.
                </p>
              </div>

              <div style={{ padding: 18, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Résolveur DNS actif</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { id: 'auto', label: 'Automatique (DHCP)', desc: 'Fournisseur d’accès (Box)' },
                    { id: 'cloudflare', label: 'Cloudflare DNS', desc: '1.1.1.1 / 1.0.0.1 (Rapide)' },
                    { id: 'google', label: 'Google DNS', desc: '8.8.8.8 / 8.8.4.4 (Robuste)' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={async () => {
                        setDnsProvider(d.id as any);
                        await api?.setDns?.(d.id);
                        showNotification(`DNS basculé sur : ${d.label}`);
                      }}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: dnsProvider === d.id ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                        border: dnsProvider === d.id ? '1px solid var(--cyan)' : '1px solid var(--border)',
                        color: dnsProvider === d.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Surveillance Watchdog Anti-Lag</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Déclenche une alerte lors d'un pic de latence anormal ({watchdogThreshold}ms).</div>
                </div>
                <CyberToggle
                  checked={watchdogEnabled}
                  onChange={async (checked) => {
                    setWatchdogEnabled(checked);
                    await api?.setPingWatchdog?.({ enabled: checked, threshold: watchdogThreshold });
                  }}
                />
              </div>
            </div>
          )}

          {/* SECTION 8: NOTIFICATIONS */}
          {activeSection === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Notifications & Alertes Sonores</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Ajustez les notifications natives et le volume du synthétiseur Web Audio sans latence.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Mode Ne Pas Déranger (DND)</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Masque les alertes non critiques lors de vos sessions de jeu.</div>
                </div>
                <CyberToggle
                  checked={dndEnabled}
                  onChange={(checked) => onDndChange?.(checked)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Volume des effets audio procéduraux</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Niveau sonore du synthétiseur d'alertes Vanguard.</div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    setMasterVolume(v / 100);
                  }}
                  style={{ width: 140, accentColor: 'var(--cyan)', cursor: 'pointer' }}
                />
              </div>

              <div style={{ paddingTop: 6 }}>
                <button
                  onClick={handleTestNativeNotification}
                  disabled={testNotifSending}
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                >
                  <Bell size={15} />
                  <span>Tester la notification native Windows</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 9: MISES A JOUR */}
          {activeSection === 'updates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Mises à Jour Officielles</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Vérification signée cryptographiquement via les releases officielles GitHub.
                </p>
              </div>

              <div style={{ padding: 20, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Version installée</div>
                    <div style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      v2.5.0 · Build de production officielle
                    </div>
                  </div>
                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    className="btn btn-primary"
                    style={{ fontSize: 13 }}
                  >
                    <RefreshCw size={15} className={checkingUpdate ? 'animate-spin' : ''} />
                    <span>{checkingUpdate ? 'Recherche...' : 'Vérifier les mises à jour'}</span>
                  </button>
                </div>

                {updateMessage && (
                  <div className="badge badge-purple" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>
                    {updateMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 10: DIAGNOSTIC */}
          {activeSection === 'diagnostic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Diagnostic Système & Privilèges</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Statut d'exécution du processus Vanguard et de l'environnement hôte.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Privilèges d'élévation</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: adminStatus?.isAdmin ? 'var(--green)' : 'var(--yellow)', marginTop: 4 }}>
                    {adminStatus?.isAdmin ? 'Administrateur (Complet)' : 'Utilisateur standard (Restreint)'}
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Système d'exploitation</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                    {adminStatus?.osInfo?.edition || 'Microsoft Windows 10/11'} (Build {adminStatus?.osInfo?.buildNumber || 'x64'})
                  </div>
                </div>
              </div>

              {!adminStatus?.isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 10, backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: 13, color: 'var(--yellow)' }}>
                    Certaines actions avancées (règles pare-feu, exclusions Defender) requièrent les droits administrateur.
                  </div>
                  <button
                    onClick={() => api?.relaunchElevated?.()}
                    className="btn btn-warning"
                    style={{ fontSize: 12 }}
                  >
                    Relancer en Administrateur
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SECTION 11: A PROPOS */}
          {activeSection === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <VanguardLogo size={52} glow={false} />
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>ASTRAL VANGUARD</h2>
                  <div style={{ fontSize: 13, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>Version 2.5.0 (Production Release)</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Suite de Protection Cyber-Sécurité, Anti-Bufferbloat & Optimisation Gaming</div>
                </div>
              </div>

              <div style={{ padding: 18, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Développé par <strong>Astral Security</strong>. Astral Vanguard intègre la supervision directe Microsoft Defender, le moteur YARA-X, la mesure de latence en temps réel et des profils système réversibles sans altération destructive de Windows.
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <a
                  href="https://github.com/urnova/Astral-Security-Guard-vpn"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cyan)', textDecoration: 'none' }}
                >
                  <ExternalLink size={14} />
                  <span>Dépôt GitHub Astral Vanguard</span>
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
