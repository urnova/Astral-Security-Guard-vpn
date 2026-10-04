import { Shield, LayoutDashboard, Cpu, Gamepad2, Wifi, Lock, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Accueil',      icon: LayoutDashboard },
  { id: 'security',    label: 'Sécurité',     icon: Shield },
  { id: 'performance', label: 'Performance',  icon: Cpu },
  { id: 'gaming',      label: 'Gaming',       icon: Gamepad2 },
  { id: 'network',     label: 'Réseau',       icon: Wifi },
  { id: 'vpn',         label: 'VPN',          icon: Lock },
];

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  gamingActive: boolean;
  currentGame: string | null;
  firstName?: string;
  lastName?: string;
}

function getInitials(first: string, last: string) {
  const f = first.trim();
  const l = last.trim();
  if (!f && !l) return 'AV';
  if (!l) return f.charAt(0).toUpperCase();
  return (f.charAt(0) + l.charAt(0)).toUpperCase();
}

export default function Sidebar({ activeTab, onTabChange, gamingActive, firstName = '', lastName = '' }: Props) {
  return (
    <aside className="sidebar">
      {/* Navigation — directly at top, no duplicate logo */}
      <nav className="sidebar-nav" style={{ paddingTop: 12 }}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isGaming = id === 'gaming' && gamingActive;
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              className={`sidebar-item ${isActive ? 'active' : ''} ${isGaming ? 'gaming-pulse' : ''}`}
              onClick={() => onTabChange(id)}
              title={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{label}</span>
              {isGaming && <span className="sidebar-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      {/* Profile & Settings */}
      <div className="sidebar-footer" style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
        <div
          onClick={() => onTabChange('settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 10px',
            borderRadius: 12,
            backgroundColor: activeTab === 'settings' ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${activeTab === 'settings' ? 'rgba(99, 102, 241, 0.35)' : 'var(--border)'}`,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          title="Gérer le profil et les paramètres"
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              color: '#c084fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {getInitials(firstName, lastName)}
          </div>

          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Mon Profil'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Paramètres</div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onTabChange('settings');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'settings' ? 'var(--cyan)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Paramètres de l'application"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
