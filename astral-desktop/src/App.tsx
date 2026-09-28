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
import DownloadScanModal from './components/DownloadScanModal';
import { NotificationSystem } from './components/NotificationSystem';
import { ShieldAlert } from 'lucide-react';

const api = (window as any).vanguard;

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [gamingModeActive, setGamingModeActive] = useState(false);
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  const [dndEnabled, setDndEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!api) return;

    // Check elevation status
    api.getAdminStatus?.().then((res: any) => {
      if (res && typeof res.isAdmin === 'boolean') {
        setIsAdmin(res.isAdmin);
      }
    });

    const cleanupAdmin = api.on('admin:status', (data: any) => {
      if (data && typeof data.isAdmin === 'boolean') {
        setIsAdmin(data.isAdmin);
      }
    });

    // Listen for gaming events
    const cleanupGaming = api.on('gaming:game-started', (event: any) => {
      setGamingModeActive(true);
      setCurrentGame(event.gameName || 'Jeu détecté');
    });

    const cleanupGamingStop = api.on('gaming:game-stopped', () => {
      setGamingModeActive(false);
      setCurrentGame(null);
    });

    // Listen for update notifications
    const cleanupUpdate = api.on('updater:state-changed', (state: any) => {
      if (state?.status === 'available' && state.updateInfo) {
        setUpdateInfo(state.updateInfo);
      }
    });

    return () => {
      cleanupAdmin?.();
      cleanupGaming?.();
      cleanupGamingStop?.();
      cleanupUpdate?.();
    };
  }, []);

  const handleRelaunchElevated = () => {
    api?.relaunchElevated?.();
  };

  return (
    <div className="app-root flex h-screen w-screen overflow-hidden bg-[#07071a] text-zinc-100 font-sans select-none" data-gaming={gamingModeActive}>
      {/* Gaming mode ambient neon glow */}
      {gamingModeActive && (
        <div className="gaming-ambient pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.15),_transparent_70%)]" aria-hidden="true" />
      )}

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        gamingActive={gamingModeActive}
        currentGame={currentGame}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        {/* Elevation status banner if not running as administrator */}
        {!isAdmin && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2.5 flex items-center justify-between text-xs text-amber-200 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Mode Restreint :</strong> Privilèges administrateur non détectés. Le contrôle de Windows Defender et certaines optimisations réseau requièrent des droits élevés.
              </span>
            </div>
            <button
              onClick={handleRelaunchElevated}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-md transition-colors shrink-0 shadow-sm"
            >
              Relancer en Administrateur
            </button>
          </div>
        )}

        <main className="app-content flex-1 overflow-y-auto p-6">
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
          {activeTab === 'settings' && (
            <SettingsTab
              dndEnabled={dndEnabled}
              onDndChange={setDndEnabled}
            />
          )}
        </main>
      </div>

      <NotificationSystem dndEnabled={dndEnabled} />

      <DownloadScanModal />

      {updateInfo && (
        <UpdateModal info={updateInfo} onClose={() => setUpdateInfo(null)} />
      )}
    </div>
  );
}
