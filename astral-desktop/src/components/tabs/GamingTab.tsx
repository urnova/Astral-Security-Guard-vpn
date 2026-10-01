import { useState, useEffect } from 'react';
import {
  Gamepad2, Zap, RefreshCw, Monitor, Layers, CheckCircle2,
  Play, Activity, Sparkles, Wifi, Shield, Sliders
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';

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
  const [autoWifiBoost, setAutoWifiBoost] = useState(true);
  const [profile, setProfile] = useState<'competitive' | 'balanced' | 'stream'>('competitive');
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
    setTimeout(() => setNotice(''), 3500);
  };

  const toggleGamingMode = async () => {
    if (!api) return;
    const next = !gamingActive;
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
          ? '🎮 Mode E-Sport Activé : Priorité CPU temps réel & anti-bufferbloat engagés'
          : 'Mode Gaming désactivé'
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
              LATENCY ZERO
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Priorité processeur temps réel, suppression des interruptions et overlay HUD transparent
          </p>
        </div>

        {/* Global Gaming Switch */}
        <button
          onClick={toggleGamingMode}
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
              {gamingActive ? 'COCKPIT ENGAGÉ' : 'EN ATTENTE DE JEU'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Jeu détecté : <strong style={{ color: '#ffffff' }}>{currentGame || 'Détection automatique prête'}</strong>
            </span>
          </div>

          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
            {gamingActive ? 'Optimisation E-Sport Maximale' : 'Préparez votre session compétitive'}
          </h2>

          <p style={{ margin: '8px 0 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Alloue la priorité processeur temps réel au jeu, supprime les interruptions de fond de Windows et stabilise le débit des paquets réseau UDP.
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
              Affiche un widget acrylique sombre transparent indiquant en temps réel vos IPS (FPS), charge CPU, RAM et le ping vers les serveurs de jeu.
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
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Performance Wi-Fi Récurrente</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Anti-Bufferbloat Automatique</div>
                </div>
              </div>
              <CyberToggle checked={autoWifiBoost} onChange={setAutoWifiBoost} glowColor="purple" />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Maintient les files d’attente UDP purgées et la gigue sous contrôle tout au long de vos sessions de jeu sans déconnexion.
            </p>
          </div>
        </div>
      </div>

      {/* Detected Games Library */}
      <div className="glass-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Gamepad2 size={18} style={{ color: 'var(--cyan)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                Bibliothèque de Jeux Détectés ({installedGames.length})
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Steam, Epic Games, Riot Games, GOG & lanceurs indépendants
              </div>
            </div>
          </div>
          <button onClick={scanGames} className="btn btn-ghost btn-sm btn-icon" title="Actualiser la bibliothèque">
            <RefreshCw size={14} className={scanningGames ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {installedGames.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, gridColumn: '1 / -1' }}>
              {scanningGames ? 'Recherche des jeux installés...' : 'Aucun jeu détecté automatiquement. Le mode manuel s’applique à toute application active.'}
            </div>
          ) : (
            installedGames.map((g, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{g.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {g.platform}
                  </div>
                </div>
                <span className="badge badge-cyan" style={{ fontSize: 10 }}>Optimisé</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
