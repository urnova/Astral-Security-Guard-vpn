const api = (window as any).vanguard;

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  {
    id: 'dashboard',
    label: 'Accueil',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Sécurité',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    id: 'performance',
    label: 'Perfs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 12h4m-2-2v4M15 13h.01M18 11h.01"/>
        <rect x="2" y="7" width="20" height="14" rx="4"/>
      </svg>
    ),
  },
  {
    id: 'network',
    label: 'Réseau',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M1.5 8.5c6-6 15-6 21 0"/><path d="M5 12c4-4 10-4 14 0"/>
        <path d="M8.5 15.5c2-2 5-2 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'vpn',
    label: 'VPN',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
  },
];

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  gamingActive: boolean;
  currentGame: string | null;
}

export default function Sidebar({ activeTab, onTabChange, gamingActive, currentGame }: Props) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center' }}>
        <svg width="38" height="38" viewBox="0 0 80 80" fill="none" className="sidebar-logo">
          <defs>
            <linearGradient id="slg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00d4ff"/>
              <stop offset="100%" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
          <path d="M40 8 L68 22 L68 54 L40 72 L12 54 L12 22 Z" stroke="url(#slg)" strokeWidth="2.5" fill="none" opacity="0.7"/>
          <path d="M31 40 L40 24 L49 40 L43 40 L43 58 L37 58 L37 40 Z" fill="url(#slg)"/>
        </svg>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {TABS.map((tab) => {
          const isGaming = tab.id === 'gaming' && gamingActive;
          return (
            <button
              key={tab.id}
              className={`sidebar-item ${activeTab === tab.id ? 'active' : ''} ${isGaming ? 'gaming-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
              aria-label={tab.label}
            >
              {isGaming && <span className="sidebar-dot" />}
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div style={{ height: 1, width: '80%', background: 'var(--border)' }} />
        {/* Settings */}
        <button
          className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
          title="Paramètres & Docteur"
          aria-label="Paramètres"
          onClick={() => onTabChange('settings')}
          style={{ marginTop: 0 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          <span>Paramètres</span>
        </button>
        {/* Minimize to tray */}
        <button
          className="sidebar-item"
          title="Minimiser"
          aria-label="Minimiser dans la barre des tâches"
          onClick={() => api?.minimize()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Réduire</span>
        </button>
      </div>
    </aside>
  );
}
