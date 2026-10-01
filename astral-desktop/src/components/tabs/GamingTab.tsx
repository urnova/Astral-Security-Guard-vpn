import { useState, useEffect } from 'react';
import { Gamepad2, Zap, RefreshCw, Sliders, Shield, Monitor, Layers, CheckCircle2 } from 'lucide-react';
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
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [selectedGameForProfile, setSelectedGameForProfile] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getProfiles?.().then((r: any) => setProfiles(r?.profiles || {}));
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid var(--border-violet)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--violet)',
            }}
          >
            <Gamepad2 size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Mode Gaming & Détection Intelligente
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Optimisation basse latence · Détection plein écran non-intrusive · Overlay HUD
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
          borderRadius: 16,
          marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 6, 20, 0.8))',
          border: '1px solid var(--border-violet)',
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
                {gamingActive ? 'Optimisation Gaming Maximale Active' : 'Mode Gaming inactif — activation manuelle uniquement'}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 650, lineHeight: 1.5 }}>
                {gamingActive
                  ? 'Plan haute performance actif, priorité temps-réel sur le jeu et optimisation des paquets réseau engagée.'
                  : 'Activation manuelle en un clic. Détection auto désactivée par défaut pour éviter tout faux positif (Edge, Chrome, Antigravity exclus).'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleMode}
            className={`btn ${gamingActive ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '10px 20px', fontWeight: 700 }}
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
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Zap size={14} style={{ color: 'var(--cyan)' }} />
              <span>Alimentation Maximale</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Layers size={14} style={{ color: 'var(--violet)' }} />
              <span>Priorité Processus Haute</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Monitor size={14} style={{ color: 'var(--green)' }} />
              <span>Anti-Nagle TCP Engagé</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Shield size={14} style={{ color: 'var(--orange)' }} />
              <span>Coexistence Tiers Préservée</span>
            </div>
          </div>
        )}
      </div>

      {/* Overlay & HUD Control Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Monitor size={16} style={{ color: 'var(--violet)' }} />
              <span>Overlay HUD In-Game (Transparent)</span>
            </h3>
            <button
              onClick={toggleOverlay}
              className={`btn ${overlayEnabled ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              {overlayEnabled ? 'Affiché' : 'Masqué'}
            </button>
          </div>
          <p style={{ margin: '0 0 14px 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Affiche un mini-widget discret transparent affichant le CPU, la RAM et la latence sans injecter de DLL dans vos jeux.
          </p>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Raccourci global clavier :</span>
            <kbd style={{ padding: '3px 8px', borderRadius: 6, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--violet)', fontFamily: 'var(--mono)', fontSize: 11 }}>
              Ctrl + Shift + O
            </kbd>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} style={{ color: 'var(--cyan)' }} />
              <span>Protection Anti-Faux-Positifs</span>
            </h3>
            <span className="badge badge-green" style={{ fontSize: 11 }}>Strictement Exclus</span>
          </div>
          <p style={{ margin: '0 0 14px 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Les navigateurs Web, IDE et outils bureautiques ne peuvent jamais être confondus avec des jeux vidéo :
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['msedge.exe', 'chrome.exe', 'brave.exe', 'firefox.exe', 'code.exe', 'antigravity.exe'].map((app) => (
              <span key={app} className="badge badge-gray" style={{ fontSize: 11, padding: '2px 8px', fontFamily: 'var(--mono)' }}>
                {app}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Installed Games Library Scanner */}
      <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Gamepad2 size={16} style={{ color: 'var(--violet)' }} />
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
            <span>{scanningGames ? 'Recherche...' : 'Scanner les jeux'}</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {installedGames.length === 0 && !scanningGames ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>
              Aucun jeu détecté automatiquement. Cliquez sur « Scanner les jeux » pour analyser vos bibliothèques.
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
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {game.name}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {game.executable}
                  </p>
                </div>
                <span className="badge badge-violet" style={{ fontSize: 10, padding: '2px 6px', textTransform: 'uppercase' }}>
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
