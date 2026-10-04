import { useState, useEffect } from 'react';
import {
  Gamepad2, Zap, RefreshCw, Monitor,
  Play, Wifi, Sparkles, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

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
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [scanningGames, setScanningGames] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getOverlayStatus?.().then((active: boolean) => setOverlayEnabled(Boolean(active))).catch(() => {});
    scanGames();
  }, []);

  const scanGames = async () => {
    if (!api) return;
    setScanningGames(true);
    setErrorInfo(null);
    try {
      const res = await api.scanInstalledGames?.();
      if (res?.success && Array.isArray(res.games)) setInstalledGames(res.games);
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur de détection des jeux', technical: err.message });
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
      } else {
        await api.gamingModeOff?.();
      }
      onGamingToggle(next);
      showNotice(next
        ? `🎮 Mode Jeu activé${forceGameName ? ` pour ${forceGameName}` : ''} (session réversible)`
        : 'Mode Jeu désactivé (restauration du profil Windows normal)');
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de basculer le mode gaming', technical: err.message });
    }
  };

  const toggleOverlay = async (enabled: boolean) => {
    if (!api) return;
    await api.overlayToggle(enabled);
    setOverlayEnabled(enabled);
    showNotice(enabled ? '🖥️ Overlay HUD activé (Ctrl+Shift+O)' : 'Overlay HUD désactivé');
  };

  return (
    <div className="tab-scroll">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Mode Gaming & Optimisations</h1>
          <p className="page-subtitle">Ajustements réversibles des priorités Windows, plan d’alimentation et télémétrie HUD</p>
        </div>

        <div className="page-actions">
          <button
            onClick={() => toggleGamingMode()}
            className={`btn ${gamingActive ? 'btn-danger' : 'btn-primary'}`}
          >
            <Gamepad2 size={16} />
            <span>{gamingActive ? 'Désactiver Mode Jeu' : 'Activer Mode Jeu'}</span>
          </button>
        </div>
      </div>

      {errorInfo && (
        <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
      )}

      {notice && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: 'var(--green)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* Gaming Status Card */}
      <div
        className="card card-p-lg"
        style={{
          background: gamingActive
            ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)'
            : 'var(--bg-card)',
          borderColor: gamingActive ? 'rgba(56, 189, 248, 0.35)' : 'var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: gamingActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${gamingActive ? 'rgba(56, 189, 248, 0.35)' : 'var(--border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Gamepad2 size={24} style={{ color: gamingActive ? 'var(--cyan)' : 'var(--text-muted)' }} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {gamingActive ? (currentGame || 'Session de Jeu Active') : 'Mode Standard (Inactif)'}
                </h2>
                <span className={`badge ${gamingActive ? 'badge-cyan' : 'badge-purple'}`}>
                  {gamingActive ? 'PRIORITÉ HAUTE ACTIVE' : 'PROFIL BUREAU'}
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                {gamingActive
                  ? 'Plan d’alimentation hautes performances activé, priorité CPU ajustée, retour automatique à l’arrêt.'
                  : 'Les ressources système sont réparties équitablement entre les tâches de fond et l’affichage.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => toggleOverlay(!overlayEnabled)}
              className={`btn btn-sm ${overlayEnabled ? 'btn-secondary' : 'btn-ghost'}`}
            >
              <Monitor size={14} />
              <span>{overlayEnabled ? 'Masquer HUD (Ctrl+Shift+O)' : 'Afficher HUD (Ctrl+Shift+O)'}</span>
            </button>
          </div>
        </div>

        {/* Phase 11 Honest Note: Reversible optimizations */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
          Module d’optimisation Phase 11 : Priorité CPU limitée à High/AboveNormal (le mode Realtime est strictement exclu par sécurité anti-freeze). Sauvegarde automatique du plan d’alimentation Windows d’origine.
        </div>
      </div>

      {/* Installed Games Section */}
      <div className="card card-p-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Jeux Détectés sur le Système</h2>
            <p className="card-subtitle">Bibliothèques Steam, Epic Games, Riot et installations locales</p>
          </div>
          <button onClick={scanGames} disabled={scanningGames} className="btn btn-ghost btn-sm">
            <RefreshCw size={13} className={scanningGames ? 'animate-spin' : ''} />
            <span>{scanningGames ? 'Recherche...' : 'Re-scanner'}</span>
          </button>
        </div>

        {installedGames.length === 0 ? (
          <div className="state-empty" style={{ minHeight: 120, padding: 24 }}>
            <span>Aucun jeu détecté automatiquement dans les dossiers de lanceurs standards.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {installedGames.map((game, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{game.name}</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{game.launcher}</div>
                </div>

                <button
                  onClick={() => toggleGamingMode(game.name)}
                  className="btn btn-sm btn-secondary"
                  title="Appliquer les optimisations et lancer"
                >
                  <Play size={12} />
                  <span>Optimiser</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
