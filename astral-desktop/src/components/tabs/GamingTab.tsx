import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gamepad2, Zap, RefreshCw, Monitor,
  Play, Wifi, Sparkles
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
      if (res?.success && Array.isArray(res.games)) setInstalledGames(res.games);
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur de détection des jeux', technical: err.message });
    } finally { setScanningGames(false); }
  };

  const showNotice = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 3500); };

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
        ? `🎮 Mode Jeu activé${forceGameName ? ` pour ${forceGameName}` : ''} (suivi de session)`
        : 'Mode Jeu désactivé');
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

  const platforms = ['all', 'Steam', 'Epic Games', 'Riot Games', 'GOG'];
  const filteredGames = installedGames.filter(g => selectedPlatform === 'all' || g.launcher.toLowerCase() === selectedPlatform.toLowerCase());

  const PROFILES = [
    { id: 'competitive' as const, label: 'Compétitif', desc: 'En cours de dév. (Phase 11)' },
    { id: 'balanced' as const, label: 'Équilibré', desc: 'En cours de dév. (Phase 11)' },
    { id: 'stream' as const, label: 'Streaming', desc: 'En cours de dév. (Phase 11)' },
  ];

  return (
    <div className="tab-scroll" style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Gaming</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Suivi des sessions de jeu et détection des bibliothèques installées
        </p>
      </motion.div>

      {/* ── Notification ── */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              padding: '12px 16px', marginBottom: 20, borderRadius: 10,
              backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <Sparkles size={15} style={{ color: '#f59e0b' }} />
            <span>{notice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {errorInfo && <div style={{ marginBottom: 20 }}><CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} /></div>}

      {/* ── Big Gaming Toggle ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, duration: 0.4 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => toggleGamingMode()}
        style={{
          padding: '28px 32px', borderRadius: 18, cursor: 'pointer', marginBottom: 24,
          background: gamingActive
            ? 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(239,68,68,0.08) 50%, rgba(6,6,20,0.9) 100%)'
            : 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(6,6,20,0.9) 100%)',
          border: `1px solid ${gamingActive ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.25)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
          boxShadow: gamingActive ? '0 8px 32px rgba(245,158,11,0.15)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <motion.div
            animate={gamingActive ? { rotate: [0, -10, 10, 0] } : {}}
            transition={{ duration: 0.6, repeat: gamingActive ? Infinity : 0, repeatDelay: 3 }}
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: gamingActive
                ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Gamepad2 size={28} style={{ color: '#fff' }} />
          </motion.div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)' }}>
              {gamingActive ? 'Mode Jeu activé' : 'Activer le Mode Jeu'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {gamingActive
                ? `Suivi de session engagé${currentGame ? ` pour ${currentGame}` : ''} (profils système en Phase 11)`
                : 'Active le suivi de session et la détection d’activité de jeu'}
            </div>
          </div>
        </div>

        <div style={{
          padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 800,
          background: gamingActive
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #f59e0b, #f97316)',
          color: '#fff', whiteSpace: 'nowrap',
        }}>
          {gamingActive ? 'Désactiver' : 'Activer'}
        </div>
      </motion.div>

      {/* ── Performance Profile + Settings ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Profile cards */}
        {PROFILES.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            whileHover={{ y: -3, borderColor: profile === p.id ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}
            onClick={() => {
              setProfile(p.id);
              showNotice(`Profil [${p.label}] sélectionné. L'application des priorités système sera implémentée en Phase 11.`);
            }}
            style={{
              padding: '18px 16px', borderRadius: 14, cursor: 'pointer',
              background: profile === p.id ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${profile === p.id ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
              textAlign: 'center', transition: 'border-color 0.2s, background 0.2s',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: profile === p.id ? '#f59e0b' : 'var(--text-primary)' }}>
              {p.label}
            </div>
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, fontWeight: 600 }}>{p.desc}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Options Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Overlay HUD */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            padding: '20px 22px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 7, borderRadius: 8, backgroundColor: 'rgba(0,212,255,0.1)' }}>
                <Monitor size={18} style={{ color: '#00d4ff' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Overlay HUD</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ctrl + Shift + O</div>
              </div>
            </div>
            <CyberToggle checked={overlayEnabled} onChange={toggleOverlay} />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Affiche les métriques CPU, RAM et latence. Mesure FPS directe prévue en Phase 12 (PresentMon).
          </p>
        </motion.div>

        {/* Wi-Fi Boost */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{
            padding: '20px 22px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
            opacity: 0.8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 7, borderRadius: 8, backgroundColor: 'rgba(168,85,247,0.1)' }}>
                <Wifi size={18} style={{ color: '#a855f7' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Optimisation Wi-Fi</div>
                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>En cours de développement (Phase 11)</div>
              </div>
            </div>
            <CyberToggle checked={false} onChange={() => showNotice('La gestion de priorité des paquets réseau (WFP / QoS) sera implémentée en Phase 11')} glowColor="purple" disabled={true} />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            La régulation de latence réseau et priorisation de paquets sera introduite en Phase 11.
          </p>
        </motion.div>
      </div>

      {/* ── Games Library ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{ padding: '22px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Gamepad2 size={17} style={{ color: '#f59e0b' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Jeux détectés ({installedGames.length})
              </h2>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Détection réelle des jeux installés via Steam, Epic, Riot et GOG
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3, backgroundColor: 'rgba(0,0,0,0.3)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
              {platforms.map(p => {
                const count = p === 'all' ? installedGames.length : installedGames.filter(g => g.launcher === p).length;
                if (p !== 'all' && count === 0) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setSelectedPlatform(p)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: 'none',
                      backgroundColor: selectedPlatform === p ? 'rgba(245,158,11,0.15)' : 'transparent',
                      color: selectedPlatform === p ? '#f59e0b' : 'var(--text-muted)',
                    }}
                  >
                    {p === 'all' ? 'Tous' : p} ({count})
                  </button>
                );
              })}
            </div>
            <button onClick={scanGames} className="btn btn-ghost btn-sm btn-icon" title="Actualiser">
              <RefreshCw size={13} className={scanningGames ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filteredGames.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, gridColumn: '1 / -1' }}>
              {scanningGames ? 'Recherche des jeux...' : 'Aucun jeu trouvé.'}
            </div>
          ) : filteredGames.map((g, i) => {
            const isCurrent = gamingActive && currentGame === g.name;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.03 }}
                whileHover={{ y: -2, borderColor: isCurrent ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.15)' }}
                style={{
                  padding: '14px 16px', borderRadius: 12,
                  backgroundColor: isCurrent ? 'rgba(245,158,11,0.06)' : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${isCurrent ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  transition: 'border-color 0.2s, background 0.2s',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{g.launcher}</span>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={(e) => { e.stopPropagation(); toggleGamingMode(g.name); }}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: isCurrent ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${isCurrent ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                    color: isCurrent ? '#f59e0b' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Play size={12} />
                  {isCurrent ? 'Session active' : 'Lancer le suivi'}
                </motion.button>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
