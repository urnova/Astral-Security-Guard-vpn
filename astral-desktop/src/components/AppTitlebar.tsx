import React from 'react';
import VanguardLogo from './common/VanguardLogo';

interface AppTitlebarProps {
  gamingActive: boolean;
  currentGame: string | null;
}

export default function AppTitlebar({ gamingActive, currentGame }: AppTitlebarProps) {
  return (
    <header
      className="app-titlebar titlebar-drag"
      style={{
        height: 36,
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 14,
        paddingRight: 140, // Reserved area for Windows native caption controls
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        userSelect: 'none',
        zIndex: 100,
      }}
    >
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <VanguardLogo size={18} glow={false} />
        <span
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
          }}
        >
          ASTRAL VANGUARD
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 99,
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--mono)',
          }}
        >
          v2.3.0
        </span>
      </div>

      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {gamingActive ? (
          <span
            className="badge badge-cyan"
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            <span className="badge-dot" style={{ animation: 'dotPulse 1.4s infinite' }} />
            GAMING : {currentGame || 'Actif'}
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
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
            Protection active
          </span>
        )}
      </div>
    </header>
  );
}
