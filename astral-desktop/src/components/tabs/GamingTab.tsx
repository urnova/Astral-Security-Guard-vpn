import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onGamingToggle: (v: boolean) => void;
}

export default function GamingTab({ gamingActive, currentGame, onGamingToggle }: Props) {
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getProfiles().then((r: any) => setProfiles(r.profiles || {}));
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const toggleMode = async () => {
    if (!api) return;
    const next = !gamingActive;
    await api.toggleGaming(next);
    if (next) {
      await api.gamingModeOn();
      await api.networkGamingOn();
    } else {
      await api.gamingModeOff();
      await api.networkGamingOff();
    }
    onGamingToggle(next);
    showNotice(next ? '🎮 Mode Gaming activé — Boost complet appliqué' : 'Mode Gaming désactivé');
  };

  const toggleOverlay = async () => {
    if (!api) return;
    const next = !overlayEnabled;
    await api.overlayToggle(next);
    setOverlayEnabled(next);
    showNotice(next ? '🖥️ Overlay HUD activé' : 'Overlay HUD désactivé');
  };

  const GAME_LAUNCHERS = [
    { name: 'Steam', icon: '🎮', desc: 'Plateforme principale gaming' },
    { name: 'Epic Games', icon: '⚡', desc: 'Epic Games Store' },
    { name: 'Battle.net', icon: '⚔️', desc: 'Blizzard Entertainment' },
    { name: 'Riot Client', icon: '🏆', desc: 'Valorant, LoL...' },
    { name: 'Origin / EA', icon: '🔶', desc: 'Electronic Arts' },
    { name: 'Ubisoft Connect', icon: '🔷', desc: 'Ubisoft' },
  ];

  return (
    <div className="tab-scroll animate-in">
      <div className="tab-header">
        <div>
          <h1 className="tab-title">Mode Gaming</h1>
          <p className="tab-subtitle">Détection auto · Overlay HUD · Profils par jeu</p>
        </div>
        {gamingActive && currentGame && (
          <div className="badge badge-cyan badge-dot" style={{ fontSize: 12 }}>
            {currentGame} détecté
          </div>
        )}
      </div>

      {notice && <div className="notice notice-success animate-in" style={{ marginBottom: 16 }}>{notice}</div>}

      {/* Main Toggle */}
      <div className={`card ${gamingActive ? 'card-glow-cyan' : ''} animate-in`} style={{ marginBottom: 20, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Gaming icon */}
          <div style={{
            width: 64, height: 64,
            borderRadius: 16,
            background: gamingActive ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${gamingActive ? 'var(--border-cyan)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            transition: 'var(--transition)',
            flexShrink: 0,
          }}>
            {gamingActive ? '⚡' : '🎮'}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
              {gamingActive ? `Mode Gaming Actif${currentGame ? ` · ${currentGame}` : ''}` : 'Mode Gaming'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {gamingActive
                ? 'Plan haute perf · Services suspendus · QoS réseau · GPU prioritaire · Overlay actif'
                : 'Active toutes les optimisations gaming : CPU, RAM, GPU, réseau, Nagle.'}
            </p>
          </div>
          <label className="toggle" style={{ transform: 'scale(1.3)', transformOrigin: 'right center' }}>
            <input type="checkbox" checked={gamingActive} onChange={toggleMode} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </div>

        {gamingActive && (
          <div className="grid-4" style={{ marginTop: 20 }}>
            {[
              { icon: '⚡', label: 'Plan haute perf', active: true },
              { icon: '🌐', label: 'QoS réseau', active: true },
              { icon: '🎯', label: 'GPU prioritaire', active: true },
              { icon: '🔇', label: 'Services suspendus', active: true },
            ].map((b) => (
              <div key={b.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 8px',
                borderRadius: 8,
                background: 'rgba(0,212,255,0.06)',
                border: '1px solid rgba(0,212,255,0.15)',
                fontSize: 11, fontWeight: 600, color: 'var(--cyan)',
              }}>
                <span style={{ fontSize: 18 }}>{b.icon}</span>
                {b.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overlay & Detection */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className={`card ${overlayEnabled ? 'card-glow-cyan' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 14 }}>🖥️ Overlay HUD</p>
            <label className="toggle">
              <input type="checkbox" checked={overlayEnabled} onChange={toggleOverlay} />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Affiche un petit HUD transparent en coin d'écran : CPU, RAM, VPN, statut gaming. Désactivable en 1 clic.
          </p>
          {overlayEnabled && (
            <div className="badge badge-cyan badge-dot" style={{ marginTop: 10 }}>HUD actif en coin supérieur gauche</div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 14 }}>🔍 Détection automatique</p>
            <span className="badge badge-green badge-dot">Actif</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Surveille les processus toutes les 5s. Détecte plus de 200 jeux connus et active le mode gaming automatiquement.
          </p>
          {currentGame && (
            <div className="notice notice-info" style={{ marginTop: 10, fontSize: 12 }}>
              Jeu actuellement détecté : <strong>{currentGame}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Launchers Detected */}
      <div className="card animate-in">
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🎯 Lanceurs de jeux pris en charge</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {GAME_LAUNCHERS.map((l) => (
            <div key={l.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 20 }}>{l.icon}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
