import { useState, useEffect } from 'react';
import {
  Gamepad2, Zap, RefreshCw, Monitor, Layers, CheckCircle2,
  Play, Activity, Sparkles, Wifi, Shield, Sliders, Flame, FolderOpen
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';

const api = (window as any).vanguard;

interface InstalledGame {
  name: string;
  launcher: 'Steam' | 'Epic Games' | 'GOG' | 'Riot Games' | 'Xbox' | string;
  path: string;
}

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onGamingToggle: (v: boolean) => void;
}

export default function GamingTab({ gamingActive, currentGame, onGamingToggle }: Props) {
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [autoWifiBoost, setAutoWifiBoost] = useState(true);
  const [profile, setProfile] = useState<'competitive' | 'balanced' | 'stream'>('competitive');
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [scanningGames, setScanningGames] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
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
      setErrorInfo({ message: 'Erreur lors de la détection des bibliothèques de jeux', technical: err.message });
    } finally {
      setScanningGames(false);
    }
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const toggleGamingMode = async (forceGameName?: string) => {
    if (!api) return;
    const next = forceGameName ? true : !gamingActive;
    try {
      await api.toggleGaming(next);
      if (next) {
        await api.gamingModeOn?.();
        if (autoWifiBoost) {
          await api.networkGamingOn?.();
        }
      } else {
        await api.gamingModeOff?.();
        await api.networkGamingOff?.();
      }
      onGamingToggle(next);
      showNotice(
        next
          ? `🎮 Mode E-Sport Activé ${forceGameName ? `pour [${forceGameName}]` : ''} : Priorité processeur & anti-bufferbloat engagés.`
          : 'Mode Gaming désactivé : retour aux priorités Windows par défaut.'
      );
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de basculer le mode gaming', technical: err.message });
    }
  };

  const toggleOverlay = async (enabled: boolean) => {
    if (!api) return;
    await api.overlayToggle(enabled);
    setOverlayEnabled(enabled);
    showNotice(enabled ? '🖥️ Overlay HUD affiché en jeu (Ctrl+Shift+O)' : 'Overlay HUD masqué');
  };

  // Platform filtering
  const platforms = ['all', 'Steam', 'Epic Games', 'Riot Games', 'GOG'];
  const filteredGames = installedGames.filter((g) => {
    if (selectedPlatform === 'all') return true;
    return g.launcher.toLowerCase() === selectedPlatform.toLowerCase();
  });

  const steamCount = installedGames.filter((g) => g.launcher === 'Steam').length;
  const epicCount = installedGames.filter((g) => g.launcher === 'Epic Games').length;
  const riotCount = installedGames.filter((g) => g.launcher === 'Riot Games').length;
  const gogCount = installedGames.filter((g) => g.launcher === 'GOG').length;

  return (
    <div className="tab-scroll animate-in" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Mode Gaming & Optimisation E-Sport
            </h1>
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '3px 8px',
                borderRadius: 6,
                backgroundColor: 'rgba(0, 245, 255, 0.1)',
                border: '1px solid rgba(0, 245, 255, 0.3)',
                color: 'var(--cyan)',
                fontWeight: 700,
              }}
            >
              PRIORITÉ CPU TEMPS RÉEL
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Réduction de latence, allocation des cœurs processeur et overlay de performances
          </p>
        </div>

        {/* Global Gaming Switch */}
        <button
          onClick={() => toggleGamingMode()}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            fontSize: 13,
            fontWeight: 800,
            boxShadow: gamingActive ? '0 0 25px rgba(0, 245, 255, 0.6)' : 'none',
          }}
        >
          <Zap size={16} />
          <span>{gamingActive ? 'DÉSACTIVER LE MODE E-SPORT' : 'ACTIVER LE MODE E-SPORT'}</span>
        </button>
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 10,
            backgroundColor: 'rgba(0, 245, 255, 0.08)',
            border: '1px solid rgba(0, 245, 255, 0.25)',
            fontSize: 13,
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles size={16} style={{ color: 'var(--cyan)' }} />
          <span>{notice}</span>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Main Cockpit Hero */}
      <div
        className="glass-card"
        style={{
          padding: '28px 32px',
          marginBottom: 24,
          background: gamingActive
            ? 'radial-gradient(ellipse at 50% 30%, rgba(0, 245, 255, 0.12) 0%, rgba(6, 6, 20, 0.9) 75%)'
            : 'radial-gradient(ellipse at 50% 30%, rgba(99, 102, 241, 0.06) 0%, rgba(6, 6, 20, 0.85) 75%)',
          border: gamingActive ? '1px solid rgba(0, 245, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: gamingActive ? '0 12px 36px rgba(0, 245, 255, 0.2)' : '0 8px 32px rgba(0, 0, 0, 0.4)',
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 24,
        }}
      >
        <div style={{ maxWidth: 540 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className={`badge ${gamingActive ? 'badge-cyan' : 'badge-violet'}`}>
              <span className="badge-dot" style={{ animation: gamingActive ? 'dotPulse 1.4s infinite' : 'none' }} />
              {gamingActive ? 'COCKPIT ENGAGÉ' : 'MODE STANDARD'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Cible active : <strong style={{ color: '#ffffff' }}>{currentGame || 'Tous les jeux lancés'}</strong>
            </span>
          </div>

          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
            {gamingActive ? 'Optimisation E-Sport Maximale' : 'Préparez votre session compétitive'}
          </h2>

          <p style={{ margin: '8px 0 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {gamingActive
              ? 'Priorité CPU temps réel allouée, processus superflus d’arrière-plan suspendus et file d’attente UDP réseau stabilisée.'
              : 'Cliquez sur « Activer le mode E-Sport » ou sur un jeu ci-dessous pour déclencher l’optimisation sans latence.'}
          </p>
        </div>

        {/* Profile Mode Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Profil de Performance
          </div>
          <div style={{ display: 'flex', gap: 6, backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: 4, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              onClick={() => setProfile('competitive')}
              className={`btn btn-sm ${profile === 'competitive' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12 }}
            >
              Compétitif (100% FPS)
            </button>
            <button
              onClick={() => setProfile('balanced')}
              className={`btn btn-sm ${profile === 'balanced' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12 }}
            >
              Équilibré
            </button>
            <button
              onClick={() => setProfile('stream')}
              className={`btn btn-sm ${profile === 'stream' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12 }}
            >
              Streaming / OBS
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Overlay HUD & Wi-Fi Booster Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Card 1: Overlay HUD Transparent */}
        <div className="glass-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(0, 245, 255, 0.1)', color: 'var(--cyan)' }}>
                  <Monitor size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Overlay HUD In-Game</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Raccourci : Ctrl + Shift + O</div>
                </div>
              </div>
              <CyberToggle checked={overlayEnabled} onChange={toggleOverlay} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Affiche un widget acrylique sombre transparent indiquant en temps réel vos IPS (FPS), charge CPU, RAM et le ping réseau.
            </p>
          </div>
        </div>

        {/* Card 2: Recurring Wi-Fi Booster */}
        <div className="glass-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#c084fc' }}>
                  <Wifi size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Performance Wi-Fi E-Sport</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Anti-Bufferbloat Automatique</div>
                </div>
              </div>
              <CyberToggle checked={autoWifiBoost} onChange={setAutoWifiBoost} glowColor="purple" />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Purge les tampons de paquets UDP et stabilise la gigue tout au long de vos sessions de jeu sans coupure.
            </p>
          </div>
        </div>
      </div>

      {/* Detected Real Games Library */}
      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(0, 245, 255, 0.1)', color: 'var(--cyan)' }}>
              <Gamepad2 size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                Bibliothèque de Jeux Détectés ({installedGames.length})
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Jeux réels détectés sur l'ensemble de vos disques de stockage
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Platform Filter Buttons */}
            <div style={{ display: 'flex', gap: 4, backgroundColor: 'rgba(0, 0, 0, 0.35)', padding: 3, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                onClick={() => setSelectedPlatform('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: selectedPlatform === 'all' ? 'rgba(0, 245, 255, 0.15)' : 'transparent',
                  color: selectedPlatform === 'all' ? 'var(--cyan)' : 'var(--text-muted)',
                }}
              >
                Tous ({installedGames.length})
              </button>
              {steamCount > 0 && (
                <button
                  onClick={() => setSelectedPlatform('Steam')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: selectedPlatform === 'Steam' ? 'rgba(0, 245, 255, 0.15)' : 'transparent',
                    color: selectedPlatform === 'Steam' ? 'var(--cyan)' : 'var(--text-muted)',
                  }}
                >
                  Steam ({steamCount})
                </button>
              )}
              {epicCount > 0 && (
                <button
                  onClick={() => setSelectedPlatform('Epic Games')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: selectedPlatform === 'Epic Games' ? 'rgba(0, 245, 255, 0.15)' : 'transparent',
                    color: selectedPlatform === 'Epic Games' ? 'var(--cyan)' : 'var(--text-muted)',
                  }}
                >
                  Epic ({epicCount})
                </button>
              )}
              {riotCount > 0 && (
                <button
                  onClick={() => setSelectedPlatform('Riot Games')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: selectedPlatform === 'Riot Games' ? 'rgba(0, 245, 255, 0.15)' : 'transparent',
                    color: selectedPlatform === 'Riot Games' ? 'var(--cyan)' : 'var(--text-muted)',
                  }}
                >
                  Riot ({riotCount})
                </button>
              )}
            </div>

            <button onClick={scanGames} className="btn btn-ghost btn-sm btn-icon" title="Actualiser la bibliothèque">
              <RefreshCw size={14} className={scanningGames ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Game Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {filteredGames.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, gridColumn: '1 / -1' }}>
              {scanningGames ? 'Recherche approfondie des jeux installés...' : 'Aucun jeu correspondant trouvé pour ce filtre.'}
            </div>
          ) : (
            filteredGames.map((g, i) => {
              const isCurrent = gamingActive && currentGame === g.name;

              return (
                <div
                  key={i}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    backgroundColor: isCurrent ? 'rgba(0, 245, 255, 0.08)' : 'rgba(0, 0, 0, 0.3)',
                    border: isCurrent ? '1px solid rgba(0, 245, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 2 }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{g.launcher}</span>
                        <span>·</span>
                        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.path.split('\\').slice(-2, -1)[0] || g.path}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '3px 8px',
                        borderRadius: 6,
                        backgroundColor: isCurrent ? 'rgba(16, 185, 129, 0.15)' : gamingActive ? 'rgba(0, 245, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                        border: isCurrent ? '1px solid rgba(16, 185, 129, 0.4)' : gamingActive ? '1px solid rgba(0, 245, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                        color: isCurrent ? '#10b981' : gamingActive ? 'var(--cyan)' : 'var(--text-secondary)',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isCurrent ? '⚡ HAUTE PRIORITÉ' : gamingActive ? 'PRÊT E-SPORT' : 'DÉTECTÉ'}
                    </span>
                  </div>

                  <button
                    onClick={() => toggleGamingMode(g.name)}
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '6px 0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Play size={12} />
                    <span>{isCurrent ? 'Priorité CPU Actuelle' : 'Allouer Priorité E-Sport'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
