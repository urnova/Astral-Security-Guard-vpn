import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/tabs/Dashboard';
import SecurityTab from './components/tabs/SecurityTab';
import PerformanceTab from './components/tabs/PerformanceTab';
import NetworkTab from './components/tabs/NetworkTab';
import GamingTab from './components/tabs/GamingTab';
import VpnTab from './components/tabs/VpnTab';
import SettingsTab from './components/tabs/SettingsTab';
import Sidebar from './components/Sidebar';
import SplashScreen from './components/SplashScreen';
import AppTitlebar from './components/AppTitlebar';
import OnboardingWizard, { OnboardingData } from './components/OnboardingWizard';
import UpdateModal from './components/UpdateModal';
import DownloadScanModal from './components/DownloadScanModal';
import { NotificationSystem } from './components/NotificationSystem';
import { ShieldAlert } from 'lucide-react';
import { SystemProvider } from './context/SystemContext';

const api = (window as any).vanguard;

export default function App() {
  const [activeTab, setActiveTab]         = useState('dashboard');
  const [gamingModeActive, setGaming]     = useState(false);
  const [currentGame, setCurrentGame]     = useState<string | null>(null);
  const [updateInfo, setUpdateInfo]       = useState<any>(null);
  const [isAdmin, setIsAdmin]             = useState(true);
  const [dndEnabled, setDndEnabled]       = useState(false);
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [theme, setTheme]                 = useState<'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled'>('vanguard-dark');
  const [splashDone, setSplashDone]       = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Refresh profile & preferences from main
  const refreshProfile = useCallback(() => {
    api?.getProfile?.().then((p: any) => {
      if (p) {
        if (p.firstName !== undefined) setFirstName(p.firstName);
        if (p.lastName  !== undefined) setLastName(p.lastName);
        if (p.theme) setTheme(p.theme);
        if (typeof p.onboardingCompleted === 'boolean') {
          setShowOnboarding(!p.onboardingCompleted);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!api) return;

    // Initial profile load
    refreshProfile();

    // Admin status
    api.getAdminStatus?.().then((res: any) => {
      if (res && typeof res.isAdmin === 'boolean') setIsAdmin(res.isAdmin);
    });

    const cleanupAdmin  = api.on('admin:status', (d: any) => {
      if (d && typeof d.isAdmin === 'boolean') setIsAdmin(d.isAdmin);
    });
    const cleanupStart  = api.on('gaming:game-started', (e: any) => {
      setGaming(true); setCurrentGame(e.gameName || 'Jeu détecté');
    });
    const cleanupStop   = api.on('gaming:game-stopped', () => {
      setGaming(false); setCurrentGame(null);
    });
    const cleanupUpdate = api.on('updater:state-changed', (s: any) => {
      if (s?.status === 'available' && s.updateInfo) setUpdateInfo(s.updateInfo);
    });
    const cleanupProfile = api.on('profile:updated', () => refreshProfile());

    // Tray listeners
    const cleanupNav = api.on('navigation:go-to', (targetTab: string) => {
      if (targetTab) setActiveTab(targetTab);
    });
    const cleanupScanTrigger = api.on('action:trigger-scan', () => {
      setActiveTab('security');
    });
    const cleanupGamingToggle = api.on('gaming:toggle-manual', () => {
      setGaming((prev) => {
        const next = !prev;
        api?.toggleGaming?.(next);
        return next;
      });
    });

    return () => {
      cleanupAdmin?.();
      cleanupStart?.();
      cleanupStop?.();
      cleanupUpdate?.();
      cleanupProfile?.();
      cleanupNav?.();
      cleanupScanTrigger?.();
      cleanupGamingToggle?.();
    };
  }, [refreshProfile]);

  const handleFinishOnboarding = async (data: OnboardingData) => {
    setFirstName(data.firstName);
    setLastName(data.lastName);
    setTheme(data.theme);
    setShowOnboarding(false);

    // Save full preferences
    if (api) {
      await api.saveUserProfile?.({
        ...data,
        onboardingCompleted: true,
      });
      await api.setAutostart?.(data.openAtLogin);
      await api.setMinimizeToTray?.(data.minimizeToTray);
    }
  };

  const handleThemeChange = (newTheme: string) => {
    const valid = ['vanguard-dark', 'cyber-cyan', 'midnight-purple', 'stealth-oled'] as const;
    if (valid.includes(newTheme as any)) {
      setTheme(newTheme as any);
      api?.saveUserProfile?.({ theme: newTheme });
    }
  };

  return (
    <SystemProvider>
      <div className="app-root" data-gaming={gamingModeActive} data-theme={theme}>
        {/* Integrated Splash Transition */}
        {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}

        {/* Onboarding Initial Setup Wizard */}
        {splashDone && showOnboarding && (
          <OnboardingWizard
            initialFirstName={firstName}
            initialLastName={lastName}
            onFinish={handleFinishOnboarding}
          />
        )}

        {/* Gaming ambient glow */}
        {gamingModeActive && (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse at top, rgba(0,212,255,0.07), transparent 65%)',
            }}
          />
        )}

        {/* Dedicated Window Drag & Full-Width Titlebar Strip (with reserved window controls area) */}
        <AppTitlebar gamingActive={gamingModeActive} currentGame={currentGame} />

        <div className="app-body">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            gamingActive={gamingModeActive}
            currentGame={currentGame}
            firstName={firstName}
            lastName={lastName}
          />

          <div className="app-main">
            {/* Admin banner */}
            {!isAdmin && (
              <div className="admin-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <span>
                    <strong>Mode restreint —</strong> Certaines fonctions (Defender, optimisations réseau) nécessitent les droits administrateur.
                  </span>
                </div>
                <div className="admin-banner-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => api?.relaunchElevated?.()}>
                    Relancer en administrateur
                  </button>
                </div>
              </div>
            )}

            {/* Main content: Persistent Tab Panes with zero state-reset when switching */}
            <main className="app-content">
              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                <Dashboard
                  gamingActive={gamingModeActive}
                  currentGame={currentGame}
                  onTabChange={setActiveTab}
                  firstName={firstName}
                />
              </div>

              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'security' ? 'block' : 'none' }}>
                <SecurityTab />
              </div>

              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'performance' ? 'block' : 'none' }}>
                <PerformanceTab gamingActive={gamingModeActive} />
              </div>

              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'network' ? 'block' : 'none' }}>
                <NetworkTab gamingActive={gamingModeActive} />
              </div>

              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'gaming' ? 'block' : 'none' }}>
                <GamingTab
                  gamingActive={gamingModeActive}
                  currentGame={currentGame}
                  onGamingToggle={setGaming}
                />
              </div>

              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'vpn' ? 'block' : 'none' }}>
                <VpnTab />
              </div>

              <div className="tab-pane" style={{ height: '100%', display: activeTab === 'settings' ? 'block' : 'none' }}>
                <SettingsTab
                  dndEnabled={dndEnabled}
                  onDndChange={setDndEnabled}
                  onProfileSaved={refreshProfile}
                  onRelaunchOnboarding={() => setShowOnboarding(true)}
                  currentTheme={theme}
                  onThemeChange={handleThemeChange}
                />
              </div>
            </main>
          </div>
        </div>

        <NotificationSystem dndEnabled={dndEnabled} />
        <DownloadScanModal />
        {updateInfo && <UpdateModal info={updateInfo} onClose={() => setUpdateInfo(null)} />}
      </div>
    </SystemProvider>
  );
}

