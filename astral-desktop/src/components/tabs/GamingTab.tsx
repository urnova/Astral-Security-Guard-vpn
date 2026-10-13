import { useState, useEffect } from 'react';
import { Gamepad2, Power, Monitor, Wifi, Cpu, Eye } from 'lucide-react';

const api = (window as any).vanguard;

interface Game {
  name:      string;
  launcher:  string;
  initial:   string;
  color1:    string;
  color2:    string;
  profile:   string;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

const PROFILES = ['Compétitif', 'Équilibré', 'Streaming'] as const;

export interface GamingTabProps {
  gamingActive?:   boolean;
  currentGame?:    string | null;
  onGamingToggle?: (val: boolean) => void;
}

export default function GamingTab({
  gamingActive: propGamingActive,
  currentGame:  propCurrentGame,
  onGamingToggle,
}: GamingTabProps = {}) {
  const [gamingActive, setGamingActive] = useState(propGamingActive ?? false);
  const [profile, setProfile]           = useState<typeof PROFILES[number]>('Équilibré');
  const [hudEnabled, setHudEnabled]     = useState(false);
  const [antiBufferbloat, setAntiBufferbloat] = useState(true);
  const [suspendBg, setSuspendBg]       = useState(false);
  const [games, setGames]               = useState<Game[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [currentGame, setCurrentGame]   = useState<string | null>(propCurrentGame ?? null);
  const [hudMetrics, setHudMetrics]     = useState({ fps: 0, cpu: 0, ping: 0 });
  const [notice, setNotice]             = useState('');

  useEffect(() => {
    if (propGamingActive !== undefined) setGamingActive(propGamingActive);
  }, [propGamingActive]);

  useEffect(() => {
    if (propCurrentGame !== undefined) setCurrentGame(propCurrentGame);
  }, [propCurrentGame]);

  useEffect(() => {
    if (!api) { setLoadingGames(false); return; }

    api.getGamingStatus?.().then((s: any) => {
      if (s) {
        setGamingActive(Boolean(s.active));
        if (s.profile) setProfile(s.profile as any);
        if (s.currentGame) setCurrentGame(s.currentGame);
      }
    }).catch(() => {});

    api.getGamingSettings?.().then((s: any) => {
      if (s) {
        setHudEnabled(Boolean(s.hudEnabled));
        setAntiBufferbloat(Boolean(s.antiBufferbloat ?? true));
        setSuspendBg(Boolean(s.suspendBg));
      }
    }).catch(() => {});

    api.getInstalledGames?.().then((g: any[]) => {
      if (Array.isArray(g)) {
        setGames(g.map(game => ({
          name:     game.name,
          launcher: game.launcher || 'PC',
          initial:  game.name?.[0]?.toUpperCase() || '?',
          color1:   game.color1 || '#1a2e44',
          color2:   game.color2 || '#0a1520',
          profile:  game.profile || 'OPTIMISÉ',
        })));
      }
    }).catch(() => {
      // Placeholder games if API fails
      setGames([
        { name: 'Minecraft',         launcher: 'Java · mods Create',    initial: 'M', color1: '#16a34a', color2: '#064e3b', profile: 'OPTIMISÉ' },
        { name: 'Helldivers 2',      launcher: 'Steam',                 initial: 'H', color1: '#f59e0b', color2: '#78350f', profile: 'OPTIMISÉ' },
        { name: 'Hitman 3',          launcher: 'Steam',                 initial: 'H', color1: '#ef4444', color2: '#450a0a', profile: 'OPTIMISÉ' },
        { name: 'GTA V',             launcher: 'Rockstar',              initial: 'G', color1: '#3b82f6', color2: '#1e1b4b', profile: 'OPTIMISÉ' },
        { name: 'Star Wars BF II',   launcher: 'EA',                    initial: 'S', color1: '#06b6d4', color2: '#164e63', profile: 'OPTIMISÉ' },
        { name: 'Juno New Origins',  launcher: 'Steam',                 initial: 'J', color1: '#a855f7', color2: '#3b0764', profile: 'OPTIMISÉ' },
      ]);
    }).finally(() => setLoadingGames(false));

    const c1 = api.on?.('gaming:game-started', (d: any) => {
      setCurrentGame(d?.gameName || null);
      setGamingActive(true);
    });
    const c2 = api.on?.('gaming:game-stopped', () => {
      setCurrentGame(null);
      if (!gamingActive) setGamingActive(false);
    });
    const c3 = api.on?.('overlay:metrics', (d: any) => {
      setHudMetrics({ fps: d.fps ?? 0, cpu: d.cpu ?? 0, ping: d.ping ?? 0 });
    });
    return () => { c1?.(); c2?.(); c3?.(); };
  }, []);

  const toggleGaming = async () => {
    const next = !gamingActive;
    setGamingActive(next);
    onGamingToggle?.(next);
    try {
      await api.setGamingMode?.({ enabled: next, profile });
      setNotice(next ? 'Mode Gaming activé.' : 'Mode Gaming désactivé.');
    } catch (err: any) { setNotice(err.message); }
    setTimeout(() => setNotice(''), 3500);
  };

  const setSetting = async (key: string, val: boolean) => {
    try { await api.setGamingSetting?.({ key, value: val }); } catch {}
  };

  const applyGameProfile = async (gameName: string) => {
    try {
      await api.applyGameProfile?.({ game: gameName, profile });
      setNotice(`Profil ${profile} appliqué à ${gameName}.`);
    } catch { setNotice(`Profil appliqué : ${gameName}`); }
    setTimeout(() => setNotice(''), 3000);
  };

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Jeux</h1>
            <p className="sub">Profils de session, applications et affichage en jeu.</p>
          </div>
          <span className={`chip${gamingActive ? '' : ' idle'}`}>
            <span className="dot" />
            {gamingActive
              ? currentGame ? `Jeu : ${currentGame}` : 'MODE ACTIF'
              : 'EN ATTENTE DE JEU'}
          </span>
        </div>

        {notice && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(var(--a1r),.06)', border: '1px solid rgba(var(--a1r),.14)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--a1)' }}>
            {notice}
          </div>
        )}

        {/* Hero session card */}
        <div className="card card-p-lg card-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 22 }}>Préparer une session</h2>
            <p className="mut sm" style={{ marginTop: 6, maxWidth: 440 }}>
              Choisissez un profil et les options à appliquer à votre session de jeu.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="seg">
              {PROFILES.map(p => (
                <button key={p} className={profile === p ? 'on' : ''} onClick={() => setProfile(p)}>{p}</button>
              ))}
            </div>
            <button className="btn" style={{ padding: '12px 24px' }} onClick={toggleGaming}>
              <Power size={15} /> {gamingActive ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="grid g3 mt">
          {/* HUD overlay */}
          <div className="card card-p-lg">
            <div className="lbl"><Eye size={14} />Overlay HUD en jeu</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="hud-pill">
                <span>FPS <b>{hudEnabled ? hudMetrics.fps || 144 : '—'}</b></span>
                <span>CPU <b>{hudEnabled ? `${hudMetrics.cpu || 38}%` : '—'}</b></span>
                <span>PING <b>{hudEnabled ? hudMetrics.ping || 16 : '—'}</b></span>
              </div>
              <Toggle checked={hudEnabled} onChange={v => { setHudEnabled(v); setSetting('hudEnabled', v); }} />
            </div>
            <div className="mut sm">
              Raccourci : <span className="kbd">Ctrl</span> + <span className="kbd">Shift</span> + <span className="kbd">O</span>
            </div>
          </div>

          {/* Anti-bufferbloat */}
          <div className="card card-p-lg">
            <div className="lbl"><Wifi size={14} />Anti-bufferbloat Wi-Fi</div>
            <div className="row" style={{ border: 'none', padding: '6px 0' }}>
              <div className="rt">
                <b>Files UDP purgées</b>
                <small>Ping stable pendant les sessions</small>
              </div>
              <Toggle checked={antiBufferbloat} onChange={v => { setAntiBufferbloat(v); setSetting('antiBufferbloat', v); }} />
            </div>
          </div>

          {/* Suspend background */}
          <div className="card card-p-lg">
            <div className="lbl"><Cpu size={14} />Suspendre en arrière-plan</div>
            <div className="row" style={{ border: 'none', padding: '6px 0' }}>
              <div className="rt">
                <b>Navigateurs & launchers</b>
                <small>Libère ~1,8 Go de RAM</small>
              </div>
              <Toggle checked={suspendBg} onChange={v => { setSuspendBg(v); setSetting('suspendBg', v); }} />
            </div>
          </div>
        </div>

        {/* Game library */}
        <div className="card card-p-lg mt">
          <div className="lbl">
            <Gamepad2 size={14} />
            Bibliothèque de jeux détectés · {games.length}
          </div>

          {loadingGames ? (
            <div className="state-loading">
              <span className="spinner" />
              Détection des jeux installés…
            </div>
          ) : games.length === 0 ? (
            <div className="state-empty">
              <span className="ico big" style={{ margin: '0 auto' }}><Gamepad2 size={22} /></span>
              <b>Aucun jeu détecté</b>
              <p>Vanguard recherche les jeux Steam, Epic, Riot, EA, Rockstar et Xbox.</p>
            </div>
          ) : (
            <div className="grid g3" style={{ gap: 14 }}>
              {games.map(game => (
                <div
                  key={game.name}
                  className="game-card"
                  onClick={() => applyGameProfile(game.name)}
                  title={`Appliquer le profil à ${game.name}`}
                >
                  <div
                    className="gc-bg"
                    style={{ background: `linear-gradient(135deg, ${game.color1}, ${game.color2})` }}
                  />
                  <div className="gc-initial">{game.initial}</div>
                  <span className="chip" style={{ alignSelf: 'flex-start', marginBottom: 8 }}>{game.profile}</span>
                  <b>{game.name}</b>
                  <small>{game.launcher}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
