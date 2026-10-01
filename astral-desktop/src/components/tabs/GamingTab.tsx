import { useState, useEffect } from 'react';
import { Gamepad2, Zap, RefreshCw, Monitor, Layers, CheckCircle2, Play, Activity } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface InstalledGame {
  name: string;
  executable: string;
  platform: 'steam' | 'epic' | 'gog' | 'riot' | 'generic';
  path: string;
}

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onGamingToggle: (v: boolean) => void;
}

export default function GamingTab({ gamingActive, currentGame, onGamingToggle }: Props) {
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [scanningGames, setScanningGames] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getOverlayStatus?.().then((active: boolean) => setOverlayEnabled(Boolean(active)));
    scanGames();
  }, []);

  const scanGames = async () => {
    if (!api) return;
    setScanningGames(true);
    setErrorInfo(null);
    try {
      const res = await api.scanInstalledGames?.();
      if (res?.success && Array.isArray(res.games)) {
        setInstalledGames(res.games);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur détection bibliothèque de jeux', technical: err.message });
    } finally {
      setScanningGames(false);
    }
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const toggleMode = async () => {
    if (!api) return;
    const next = !gamingActive;
    try {
      await api.toggleGaming(next);
      if (next) {
        await api.gamingModeOn();
        await api.networkGamingOn();
      } else {
        await api.gamingModeOff();
        await api.networkGamingOff();
      }
      onGamingToggle(next);
      showNotice(next ? '🎮 Mode Gaming activé — Priorité CPU & Anti-Lag appliqués' : 'Mode Gaming désactivé');
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de basculer le mode gaming', technical: err.message });
    }
  };

  const toggleOverlay = async () => {
    if (!api) return;
    const next = !overlayEnabled;
    await api.overlayToggle(next);
    setOverlayEnabled(next);
    showNotice(next ? '🖥️ Overlay HUD activé (Ctrl+Shift+O)' : 'Overlay HUD masqué');
  };

  return (
    <div className="tab-scroll" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid var(--border-violet)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--violet)',
            }}
          >
            <Gamepad2 size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Mode Gaming & Optimisation E-Sport
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Priorité CPU maximale · Réduction de latence Nagle · Widget HUD transparent
            </p>
          </div>
        </div>

        {gamingActive && (
          <div className="badge badge-cyan" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>
            <span className="badge-dot" style={{ backgroundColor: 'var(--cyan)' }} />
            <span>{currentGame ? `EN JEU : ${currentGame}` : 'BOOST GAMING ACTIF'}</span>
          </div>
        )}
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid var(--border-violet)',
            color: 'var(--violet)',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Main Switch Card */}
      <div
        className="glass-card"
        style={{
          padding: 24,
          borderRadius: 18,
          marginBottom: 24,
          background: gamingActive
            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.12) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(6, 6, 20, 0.85) 100%)'
            : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(6, 6, 20, 0.85) 100%)',
          border: gamingActive ? '1px solid var(--border-cyan)' : '1px solid var(--border-violet)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: gamingActive ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${gamingActive ? 'var(--border-cyan)' : 'var(--border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: gamingActive ? 'var(--cyan)' : 'var(--text-muted)',
                boxShadow: gamingActive ? '0 0 20px rgba(0, 212, 255, 0.3)' : 'none',
              }}
            >
              <Zap size={26} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {gamingActive ? 'Boost Gaming & Plan Performance Actif' : 'Mode E-Sport en Attente'}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 650, lineHeight: 1.5 }}>
                {gamingActive
                  ? 'Plan d\'alimentation maximal Windows actif, priorité haute allouée au jeu et suppression des temporisations TCP.'
                  : 'Activez en 1 clic pour couper les interruptions d\'arrière-plan et verrouiller la stabilité de vos images par seconde.'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleMode}
            className={`btn ${gamingActive ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '10px 22px', fontWeight: 700 }}
          >
            {gamingActive ? 'Désactiver le Boost' : 'Activer le Boost Gaming'}
          </button>
        </div>

        {gamingActive && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Zap size={14} style={{ color: 'var(--cyan)' }} />
              <span>Fréquence CPU Maximale</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Layers size={14} style={{ color: 'var(--violet)' }} />
              <span>Priorité Thread Temps Réel</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Monitor size={14} style={{ color: 'var(--green)' }} />
              <span>Anti-Nagle TCP Faible Latence</span>
            </div>
          </div>
        )}
      </div>

      {/* Overlay HUD Showcase & Control */}
      <div className="glass-card" style={{ padding: 22, borderRadius: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Monitor size={16} style={{ color: 'var(--violet)' }} />
              <span>Overlay HUD Transparent In-Game</span>
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Mini-compteur ultra-léger affichant CPU, RAM et Ping directement en jeu sans injection DLL
            </p>
          </div>

          <button
            onClick={toggleOverlay}
            className={`btn ${overlayEnabled ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '7px 16px' }}
          >
            {overlayEnabled ? 'Désactiver HUD' : 'Activer HUD'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={16} style={{ color: 'var(--cyan)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Raccourci clavier universel :</span>
          </div>
          <kbd style={{ padding: '4px 10px', borderRadius: 6, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--violet)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
            Ctrl + Shift + O
          </kbd>
        </div>
      </div>

      {/* Installed Games Library Scanner */}
      <div className="glass-card" style={{ padding: 22, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Gamepad2 size={16} style={{ color: 'var(--cyan)' }} />
              <span>Bibliothèque de Jeux Détectés ({installedGames.length})</span>
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              Steam, Epic Games, GOG Galaxy & Riot Games
            </p>
          </div>

          <button
            onClick={scanGames}
            disabled={scanningGames}
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={12} className={scanningGames ? 'animate-spin' : ''} />
            <span>{scanningGames ? 'Recherche...' : 'Re-scanner'}</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {installedGames.length === 0 && !scanningGames ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>
              Aucun jeu détecté automatiquement. Lancez un scan pour indexer votre bibliothèque.
            </p>
          ) : (
            installedGames.map((game, idx) => (
              <div
                key={idx}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {game.name}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {game.executable}
                  </p>
                </div>
                <span className="badge badge-violet" style={{ fontSize: 10, padding: '2px 8px', textTransform: 'uppercase' }}>
                  {game.platform}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
