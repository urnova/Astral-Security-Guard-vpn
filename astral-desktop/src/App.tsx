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
import UpdateModal from './components/UpdateModal';
import DownloadScanModal from './components/DownloadScanModal';
import { NotificationSystem } from './components/NotificationSystem';
import { ShieldAlert } from 'lucide-react';

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
  const [splashDone, setSplashDone]       = useState(false);

  // Refresh profile from main (called by SettingsTab after save)
  const refreshProfile = useCallback(() => {
    api?.getProfile?.().then((p: any) => {
      if (p?.firstName !== undefined) setFirstName(p.firstName);
      if (p?.lastName  !== undefined) setLastName(p.lastName);
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

    return () => { cleanupAdmin?.(); cleanupStart?.(); cleanupStop?.(); cleanupUpdate?.(); cleanupProfile?.(); };
  }, [refreshProfile]);

  return (
    <div className="app-root" data-gaming={gamingModeActive}>
      {/* Integrated Splash Transition */}
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}

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

        {/* Main content */}
        <main className="app-content">
          {activeTab === 'dashboard' && (
            <Dashboard
              gamingActive={gamingModeActive}
              currentGame={currentGame}
              onTabChange={setActiveTab}
              firstName={firstName}
            />
          )}
          {activeTab === 'security'    && <SecurityTab />}
          {activeTab === 'performance' && <PerformanceTab gamingActive={gamingModeActive} />}
          {activeTab === 'network'     && <NetworkTab gamingActive={gamingModeActive} />}
          {activeTab === 'gaming'      && (
            <GamingTab
              gamingActive={gamingModeActive}
              currentGame={currentGame}
              onGamingToggle={setGaming}
            />
          )}
          {activeTab === 'vpn'         && <VpnTab />}
          {activeTab === 'settings'    && (
            <SettingsTab
              dndEnabled={dndEnabled}
              onDndChange={setDndEnabled}
              onProfileSaved={refreshProfile}
            />
          )}
        </main>
      </div>

      <NotificationSystem dndEnabled={dndEnabled} />
      <DownloadScanModal />
      {updateInfo && <UpdateModal info={updateInfo} onClose={() => setUpdateInfo(null)} />}
    </div>
  );
}
