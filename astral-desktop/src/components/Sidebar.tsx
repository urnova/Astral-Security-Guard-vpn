import { useEffect, useRef } from 'react';
import {
  Home, Shield, Zap, Gamepad2, Wifi, Lock, Settings, ChevronRight
} from 'lucide-react';

const NAV = [
  { id: 'dashboard',   label: "Vue d'ensemble", Icon: Home },
  { id: 'security',    label: 'Sécurité',        Icon: Shield },
  { id: 'performance', label: 'Maintenance',     Icon: Zap },
  { id: 'gaming',      label: 'Jeux',            Icon: Gamepad2 },
  { id: 'network',     label: 'Réseau',           Icon: Wifi },
  { id: 'vpn',         label: 'VPN',              Icon: Lock },
];

interface Props {
  activeTab:    string;
  onTabChange:  (id: string) => void;
  gamingActive: boolean;
  currentGame:  string | null;
  firstName:    string;
  lastName:     string;
  onSettings?:  () => void;
}

export default function Sidebar({
  activeTab, onTabChange, gamingActive, currentGame,
  firstName, lastName, onSettings,
}: Props) {
  const pillRef = useRef<HTMLDivElement>(null);
  const navRef  = useRef<HTMLDivElement>(null);

  // Animate pill to active item
  useEffect(() => {
    if (!navRef.current || !pillRef.current) return;
    const buttons = navRef.current.querySelectorAll('button[data-id]');
    buttons.forEach(btn => {
      if ((btn as HTMLElement).dataset.id === activeTab) {
        const top = (btn as HTMLElement).offsetTop;
        pillRef.current!.style.transform = `translateY(${top}px)`;
        pillRef.current!.style.opacity = '1';
      }
    });
  }, [activeTab]);

  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Profil';

  return (
    <aside className="sidebar">
      <div className="sidebar-label">Navigation</div>

      <div className="sidebar-nav" ref={navRef}>
        {/* Animated pill */}
        <div className="sidebar-pill" ref={pillRef} style={{ opacity: 0 }} />

        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            data-id={id}
            className={`sidebar-item${activeTab === id ? ' active' : ''}`}
            onClick={() => onTabChange(id)}
          >
            <Icon size={16} />
            {label}
            {id === 'gaming' && gamingActive && (
              <span
                className="dot"
                style={{ marginLeft: 'auto', color: 'var(--ok)' }}
              />
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* User footer */}
      <div
        className="sidebar-user"
        onClick={() => (onSettings ? onSettings() : onTabChange('settings'))}
        role="button"
        tabIndex={0}
        aria-label="Ouvrir les paramètres"
        onKeyDown={e => e.key === 'Enter' && (onSettings ? onSettings() : onTabChange('settings'))}
      >
        <div className="user-avatar">{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="user-name truncate">{fullName}</span>
          <span className="user-role">
            {gamingActive && currentGame ? `Jeu : ${currentGame}` : 'Profil Joueur'}
          </span>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--dim)', flexShrink: 0 }} />
      </div>
    </aside>
  );
}
