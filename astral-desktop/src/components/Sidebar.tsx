import { useState, useEffect } from 'react';
import { Shield, Zap, Cpu, Gamepad2, Wifi, Lock, Settings, Minus } from 'lucide-react';

const api = (window as any).vanguard;

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Accueil',      icon: Zap },
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

export default function Sidebar({ activeTab, onTabChange, gamingActive, currentGame, firstName = '', lastName = '' }: Props) {
  return (
    <aside className="sidebar">
      {/* Brand header */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img
            src="/images/vanguard-logo.svg"
            alt="Vanguard Logo"
            style={{ width: 28, height: 28, filter: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.5))' }}
            onError={(e) => { (e.target as any).src = '/logo.png'; }}
          />
          <div>
            <div className="sidebar-brand-name">Vanguard</div>
            <div className="sidebar-brand-sub">Astral Security</div>
          </div>
        </div>
        <div className="sidebar-version">v2.3.0</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
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

      {/* Footer */}
      <div className="sidebar-footer">
        {/* User card */}
        <button
          className="sidebar-user"
          onClick={() => onTabChange('settings')}
          title="Mon profil & paramètres"
        >
          <div className="sidebar-avatar" aria-hidden="true">
            {getInitials(firstName, lastName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Mon compte'}
            </div>
            <div className="sidebar-user-role">Paramètres</div>
          </div>
        </button>

        <button
          className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
          aria-label="Paramètres"
        >
          <Settings size={16} strokeWidth={1.8} />
          <span>Paramètres</span>
        </button>

        <button
          className="sidebar-item"
          onClick={() => api?.minimize()}
          aria-label="Réduire dans la barre des tâches"
        >
          <Minus size={16} strokeWidth={1.8} />
          <span>Réduire</span>
        </button>
      </div>
    </aside>
  );
}
