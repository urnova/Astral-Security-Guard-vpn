import React from 'react';
import VanguardLogo from './common/VanguardLogo';
import { useSystem } from '../context/SystemContext';

interface AppTitlebarProps {
  gamingActive: boolean;
  currentGame: string | null;
}

export default function AppTitlebar({ gamingActive, currentGame }: AppTitlebarProps) {
  const { securityStatus } = useSystem();
  const isProtected = securityStatus?.realTimeProtection ?? true;

  return (
    <header
      className="app-titlebar titlebar-drag"
      style={{
        height: 40,
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 140, // Reserved for Windows native caption buttons
        backgroundColor: '#07071a',
        borderBottom: '1px solid var(--border)',
        userSelect: 'none',
        zIndex: 100,
        width: '100%',
      }}
    >
      {/* Unified Single Brand Emblem & Title */}
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <VanguardLogo size={20} glow={false} />
        <span
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: 'var(--text-primary)',
          }}
        >
          ASTRAL VANGUARD
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 6,
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#a5b4fc',
            fontFamily: 'var(--mono)',
          }}
        >
          v2.5.0
        </span>
      </div>

      {/* Middle Status Indicator */}
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {gamingActive ? (
          <span className="badge badge-cyan" style={{ fontSize: 10, padding: '3px 10px' }}>
            <span className="badge-dot" style={{ animation: 'dotPulse 1.4s infinite' }} />
            GAMING : {currentGame || 'Session Active'}
          </span>
        ) : !isProtected ? (
          <span
            style={{
              fontSize: 11,
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              padding: '3px 10px',
              borderRadius: 20,
              border: '1px solid rgba(245, 158, 11, 0.4)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                boxShadow: '0 0 8px rgba(245, 158, 11, 0.7)',
              }}
            />
            Protection Suspendue
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              padding: '3px 10px',
              borderRadius: 20,
              border: '1px solid var(--border)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--green)',
                boxShadow: '0 0 8px rgba(16,217,160,0.6)',
              }}
            />
            Système Protégé
          </span>
        )}
      </div>
    </header>
  );
}
