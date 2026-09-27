import { useState, useEffect } from 'react';
import Dashboard from './components/tabs/Dashboard';
import SecurityTab from './components/tabs/SecurityTab';
import PerformanceTab from './components/tabs/PerformanceTab';
import NetworkTab from './components/tabs/NetworkTab';
import GamingTab from './components/tabs/GamingTab';
import VpnTab from './components/tabs/VpnTab';
import SettingsTab from './components/tabs/SettingsTab';
import Sidebar from './components/Sidebar';
import UpdateModal from './components/UpdateModal';

const api = (window as any).vanguard;

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [gamingModeActive, setGamingModeActive] = useState(false);
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  useEffect(() => {
    if (!api) return;

    // Listen for gaming events
    const cleanupGaming = api.on('gaming-event', (event: any) => {
      if (event.type === 'mode-changed') {
        setGamingModeActive(event.active);
        setCurrentGame(event.game || null);
      }
    });

    // Listen for update notifications
    const cleanupUpdate = api.on('update-available', (info: any) => {
      setUpdateInfo(info);
    });

    return () => {
      cleanupGaming?.();
      cleanupUpdate?.();
    };
  }, []);

  return (
    <div className="app-root" data-gaming={gamingModeActive}>
      {/* Gaming mode ambient glow */}
      {gamingModeActive && (
        <div className="gaming-ambient" aria-hidden="true" />
      )}

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        gamingActive={gamingModeActive}
        currentGame={currentGame}
      />

      <main className="app-content">
        {activeTab === 'dashboard' && (
          <Dashboard
            gamingActive={gamingModeActive}
            currentGame={currentGame}
            onTabChange={setActiveTab}
          />
        )}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'performance' && <PerformanceTab gamingActive={gamingModeActive} />}
        {activeTab === 'network' && <NetworkTab gamingActive={gamingModeActive} />}
        {activeTab === 'gaming' && (
          <GamingTab
            gamingActive={gamingModeActive}
            currentGame={currentGame}
            onGamingToggle={setGamingModeActive}
          />
        )}
        {activeTab === 'vpn' && <VpnTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>

      {updateInfo && (
        <UpdateModal info={updateInfo} onClose={() => setUpdateInfo(null)} />
      )}
    </div>
  );
}
