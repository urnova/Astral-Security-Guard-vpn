import React, { useState, useEffect } from 'react';
import {
  User, Palette, Sliders, Shield, Download, Gamepad2,
  Wifi, Bell, RefreshCw, Cpu, Info, Check, AlertCircle,
  ExternalLink, Save, FolderPlus, Trash2, Volume2, BellOff,
  Zap, Keyboard, Monitor
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { playSound, setMasterVolume } from '../../lib/audioSynth';

const api = (window as any).vanguard;

export interface SettingsTabProps {
  dndEnabled?: boolean;
  onDndChange?: (val: boolean) => void;
  onProfileSaved?: () => void;
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
  badge?: string;
}

const SECTIONS: NavSectionItem[] = [
  { id: 'profile',       label: 'Mon Profil',           icon: User },
  { id: 'appearance',    label: 'Apparence & Thème',    icon: Palette },
  { id: 'general',       label: 'Général & Système',    icon: Sliders },
  { id: 'security',      label: 'Sécurité & Defender',  icon: Shield },
  { id: 'downloads',     label: 'Scanner Téléchargement', icon: Download },
  { id: 'gaming',        label: 'Gaming & Overlay HUD', icon: Gamepad2 },
  { id: 'network',       label: 'Réseau & DNS',         icon: Wifi },
  { id: 'notifications', label: 'Notifications & Sons', icon: Bell },
  { id: 'updates',       label: 'Mises à jour',         icon: RefreshCw },
  { id: 'diagnostic',    label: 'Diagnostic Système',   icon: Cpu },
  { id: 'about',         label: 'À propos',             icon: Info },
];

export default function SettingsTab({ dndEnabled = false, onDndChange, onProfileSaved }: SettingsTabProps) {
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
        'Astral Vanguard - Alerte Système',
        'Notification native Windows opérationnelle. Protection active en arrière-plan.'
      );
      showNotification('Notification envoyée au système Windows.');
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur d’envoi de notification', technical: err.message });
    } finally {
      setTestNotifSending(false);
    }
  };

  return (
    <div className="tab-scroll" style={{ maxWidth: 1180, margin: '0 auto', paddingBottom: 40 }}>
      {/* Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={24} style={{ color: '#a78bfa' }} />
            Paramètres & Centre de Contrôle
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
            Personnalisation du profil, préférences de sécurité, auto-updater et télémétrie locale
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 9999, backgroundColor: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c084fc', fontFamily: 'monospace' }}>
            v2.3.0
          </span>
        </div>
      </div>

      {notice && (
        <div style={{ padding: '10px 16px', borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: 'rgba(15, 23, 42, 0.4)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)', padding: 8 }}>
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
                  color: isActive ? '#ffffff' : '#94a3b8',
                  backgroundColor: isActive ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  border: isActive ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={16} style={{ color: isActive ? '#a78bfa' : '#64748b', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section Content Panel */}
        <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)', padding: 24, minHeight: 460 }}>
          {/* SECTION 1: PROFIL */}
          {activeSection === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Mon Profil Utilisateur</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Ces informations personnalisent l'accueil et le rapport de session de sécurité Vanguard.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'rgba(139, 92, 246, 0.2)', border: '2px solid rgba(139, 92, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#c084fc' }}>
                    {firstName.trim() ? firstName.trim()[0].toUpperCase() : 'V'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                      {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Utilisateur Vanguard'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Profil stocké localement · Chiffré sur votre machine</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>Prénom</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Votre prénom (ex. Alex)"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>Nom</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Votre nom"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 20px',
                      borderRadius: 8,
                      backgroundColor: profileSuccess ? '#059669' : '#7c3aed',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: savingProfile ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {profileSuccess ? <Check size={16} /> : <Save size={16} />}
                    <span>{savingProfile ? 'Enregistrement...' : profileSuccess ? 'Enregistré !' : 'Enregistrer le profil'}</span>
                  </button>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    Met à jour immédiatement la salutation sur l'Accueil.
                  </span>
                </div>
              </form>
            </div>
          )}

          {/* SECTION 2: APPARENCE */}
          {activeSection === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Apparence & Thème</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Direction visuelle Cyber Vanguard : contrastes sombres profonds et accents néon violet & cyan.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ padding: 16, borderRadius: 10, border: '2px solid #8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>Cyber Vanguard (Défaut)</span>
                    <Check size={16} style={{ color: '#a78bfa' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#07090e', border: '1px solid rgba(255, 255, 255, 0.2)' }} />
                    <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#8b5cf6' }} />
                    <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#06b6d4' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Thème haute fidélité optimisé pour écrans OLED et haute résolution.</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Réduire les animations</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Désactive les transitions pour privilégier la réactivité maximale.</div>
                </div>
                <input
                  type="checkbox"
                  checked={reduceAnimations}
                  onChange={(e) => setReduceAnimations(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* SECTION 3: GENERAL */}
          {activeSection === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Général & Comportement Système</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Options de démarrage et gestion de la présence dans la barre des tâches Windows.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Lancer avec Windows</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Démarre automatiquement Vanguard au démarrage de session en arrière-plan.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autostart}
                    onChange={(e) => handleToggleAutostart(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Réduire dans la zone de notification (Tray)</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>La fermeture de la fenêtre garde l'application active dans la zone système.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={minimizeToTray}
                    onChange={(e) => handleToggleMinimize(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: SECURITE */}
          {activeSection === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Sécurité & Microsoft Defender</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Supervision native de l'antivirus Windows sans moteurs tiers non audités.
                </p>
              </div>

              <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Shield size={20} style={{ color: '#10b981' }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Protection en temps réel Microsoft Defender</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Surveillance active des fichiers et de la mémoire.</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, marginTop: 4 }}>
                  Astral Vanguard s'appuie sur le sous-système natif de sécurité Windows. Toutes les exclusions, scans et mises à jour de signatures sont exécutés via l'API PowerShell sécurisée sous contrôle de l'utilisateur.
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
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#c084fc', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  <RefreshCw size={15} />
                  <span>Mettre à jour les signatures</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 5: TELECHARGEMENTS */}
          {activeSection === 'downloads' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Scanner de Téléchargements</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Analyse automatique immédiate des nouveaux exécutables et archives déposés dans vos dossiers.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Activer le scanner de fichiers</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Surveille les répertoires configurés et déclenche une analyse ciblée.</div>
                </div>
                <input
                  type="checkbox"
                  checked={scannerConfig.enabled}
                  onChange={(e) => {
                    const next = { ...scannerConfig, enabled: e.target.checked };
                    setScannerConfig(next);
                    api?.saveScannerConfig?.(next);
                  }}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Surveiller les clés USB (Sentinelle)</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Propose l'analyse des périphériques de stockage amovibles connectés.</div>
                </div>
                <input
                  type="checkbox"
                  checked={scannerConfig.usbScanEnabled}
                  onChange={(e) => {
                    const next = { ...scannerConfig, usbScanEnabled: e.target.checked };
                    setScannerConfig(next);
                    api?.saveScannerConfig?.(next);
                  }}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* SECTION 6: GAMING & HUD */}
          {activeSection === 'gaming' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Gaming & Overlay HUD</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Configuration des profils et détection (désactivée par défaut pour éviter tout faux positif).
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Afficher l'Overlay HUD en jeu</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Raccourci global : <kbd style={{ padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.1)', fontFamily: 'monospace' }}>Ctrl + Shift + O</kbd></div>
                </div>
                <input
                  type="checkbox"
                  checked={overlayActive}
                  onChange={(e) => handleToggleOverlay(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Détection automatique des jeux (Expérimental)</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Désactivé par défaut. Les navigateurs (Edge, Chrome, Perplexity) et outils de bureau sont strictement exclus.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoDetectGames}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setAutoDetectGames(val);
                    await api?.saveGamingAutoDetect?.(val);
                    showNotification(val ? 'Détection auto activée' : 'Détection auto désactivée');
                  }}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* SECTION 7: RESEAU & VPN */}
          {activeSection === 'network' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Réseau, DNS & Anti-Lag</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Résolution DNS rapide et surveillance de latence sans modification persistante destructrice.
                </p>
              </div>

              <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Sélection du serveur DNS</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { id: 'auto', label: 'Automatique (DHCP)', desc: 'DNS du fournisseur d’accès' },
                    { id: 'cloudflare', label: 'Cloudflare DNS', desc: '1.1.1.1 (Haute vitesse)' },
                    { id: 'google', label: 'Google DNS', desc: '8.8.8.8 (Haute fiabilité)' },
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
                        backgroundColor: dnsProvider === d.id ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                        border: dnsProvider === d.id ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: dnsProvider === d.id ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Surveillance Watchdog Latence</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Alerte lorsque la latence TCP dépasse le seuil configuré.</div>
                </div>
                <input
                  type="checkbox"
                  checked={watchdogEnabled}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setWatchdogEnabled(val);
                    await api?.setPingWatchdog?.({ enabled: val, threshold: watchdogThreshold });
                  }}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* SECTION 8: NOTIFICATIONS */}
          {activeSection === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Notifications & Sons</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Gestion des alertes sonores et des notifications natives Windows en arrière-plan.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Mode Ne Pas Déranger (DND)</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Désactive les notifications non critiques durant vos parties.</div>
                </div>
                <input
                  type="checkbox"
                  checked={dndEnabled}
                  onChange={(e) => onDndChange?.(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Volume Sonore des Alertes</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Volume du synthétiseur audio procédural.</div>
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
                  style={{ width: 140, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>

              <div style={{ paddingTop: 8 }}>
                <button
                  onClick={handleTestNativeNotification}
                  disabled={testNotifSending}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#c084fc', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Mises à Jour & Auto-Updater</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Vérification directe et sécurisée des nouvelles versions publiées sur GitHub Releases.
                </p>
              </div>

              <div style={{ padding: 18, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Version installée</div>
                    <div style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'monospace', marginTop: 2 }}>
                      v2.3.0 · Build de production officielle
                    </div>
                  </div>
                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, backgroundColor: '#7c3aed', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 600, cursor: checkingUpdate ? 'not-allowed' : 'pointer' }}
                  >
                    <RefreshCw size={15} className={checkingUpdate ? 'animate-spin' : ''} />
                    <span>{checkingUpdate ? 'Recherche...' : 'Vérifier les mises à jour'}</span>
                  </button>
                </div>

                {updateMessage && (
                  <div style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontSize: 12 }}>
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
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Diagnostic Système & Privilèges</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Informations sur l'exécution Windows et les privilèges d'élévation.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ padding: 16, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Privilèges d'élévation</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: adminStatus?.isAdmin ? '#34d399' : '#fbbf24', marginTop: 4 }}>
                    {adminStatus?.isAdmin ? 'Administrateur (Complet)' : 'Utilisateur standard (Restreint)'}
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Système d'exploitation</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', marginTop: 4 }}>
                    {adminStatus?.osInfo?.edition || 'Microsoft Windows 10/11'} (Build {adminStatus?.osInfo?.buildNumber || 'x64'})
                  </div>
                </div>
              </div>

              {!adminStatus?.isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: 13, color: '#fbbf24' }}>
                    Certaines fonctionnalités (exclusions Defender, optimisation réseau bas niveau) demandent une élévation administrateur.
                  </div>
                  <button
                    onClick={() => api?.relaunchElevated?.()}
                    style={{ padding: '8px 14px', borderRadius: 6, backgroundColor: '#f59e0b', border: 'none', color: '#000000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
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
                <img src="/images/vanguard-logo.svg" alt="Vanguard Logo" style={{ width: 64, height: 64 }} onError={(e) => { (e.target as any).src = '/logo.png'; }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>ASTRAL VANGUARD</h2>
                  <div style={{ fontSize: 13, color: '#a78bfa', fontFamily: 'monospace' }}>Version 2.3.0 (Production Release)</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Suite de Protection Cyber-Sécurité, Anti-Lag & Optimisation Gaming</div>
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                Développé par <strong>Urnova</strong>. Astral Vanguard intègre la supervision native Microsoft Defender, l'anti-bufferbloat temps réel et des profils gaming dédiés sans télémétrie invasive ni modification agressive du registre système.
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <a
                  href="https://github.com/urnova/Astral-Security-Guard-vpn"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#38bdf8', textDecoration: 'none' }}
                >
                  <ExternalLink size={14} />
                  <span>Dépôt GitHub Urnova</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
