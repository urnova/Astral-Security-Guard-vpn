import { useEffect, useState } from 'react';
import VanguardLogo from './common/VanguardLogo';

const api = (window as any).vanguard;

interface Props {
  gamingActive: boolean;
  currentGame:  string | null;
}

export default function AppTitlebar({ gamingActive, currentGame }: Props) {
  const [isAdmin, setIsAdmin] = useState(true);
  const [appVersion, setAppVersion] = useState('2.5.10');

  useEffect(() => {
    api?.getAdminStatus?.().then((r: any) => {
      if (r && typeof r.isAdmin === 'boolean') setIsAdmin(r.isAdmin);
    }).catch(() => {});
    api?.getUpdaterState?.().then((s: any) => {
      if (s?.currentVersion) setAppVersion(s.currentVersion);
    }).catch(() => {});
  }, []);

  return (
    <div className="app-titlebar">
      {/* Brand & Logo */}
      <div className="tb-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <VanguardLogo size={25} glow={false} />
        <span className="tb-name" style={{ fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)', fontSize: 13 }}>
          Astral Vanguard
        </span>
        <span className="tb-ver" style={{ fontSize: 10, color: 'var(--dim)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--line)' }}>
          v{appVersion}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            padding: '2px 7px',
            borderRadius: '4px',
            textTransform: 'uppercase',
          }}
        >
          BÊTA PRÉ-RELEASE
        </span>
      </div>

      <span className="tb-spacer" />

      {/* Status Chip */}
      <div className="tb-status-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {gamingActive ? (
          <span className="chip warn" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <span className="dot" />
            {currentGame ? `Jeu : ${currentGame}` : 'Mode Gaming actif'}
          </span>
        ) : (
          <span className="chip" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <span className="dot" />
            Système protégé
          </span>
        )}
      </div>

      {/* Window controls */}
      <div className="win-controls" style={{ display: 'flex', alignItems: 'center', marginLeft: 8 }}>
        <button
          className="win-btn"
          onClick={() => api?.minimizeWindow?.()}
          title="Réduire"
          aria-label="Réduire"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="4.5" y1="9" x2="13.5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="win-btn"
          onClick={() => api?.maximizeWindow?.()}
          title="Agrandir / Restaurer"
          aria-label="Agrandir / Restaurer"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="4.5" y="4.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button
          className="win-btn close"
          onClick={() => api?.closeWindow?.()}
          title="Fermer"
          aria-label="Fermer"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="5" y1="5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="13" y1="5" x2="5" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
