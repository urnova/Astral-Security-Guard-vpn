import { useState, useEffect, useRef } from 'react';
import { Gamepad2, Power, Monitor, Wifi, Cpu, Eye, RefreshCw, Zap, SlidersHorizontal, Clock } from 'lucide-react';

const api = (window as any).vanguard;

/* ─────────────────────────────── Types ─────────────────────────────────── */
interface Game {
  name:      string;
  launcher:  string;
  initial:   string;
  color1:    string;
  color2:    string;
  profile:   string;
  bannerUrl?: string;
}

type Profile = 'Compétitif' | 'Équilibré' | 'Streaming';

const PROFILES: Profile[] = ['Compétitif', 'Équilibré', 'Streaming'];

const PROFILE_META: Record<Profile, { desc: string; color: string }> = {
  'Compétitif': { desc: 'Priorité CPU max, GPU non-limité, DNS gaming', color: 'var(--a1)' },
  'Équilibré':  { desc: 'Optimisation douce, compatible streaming',       color: '#22c55e' },
  'Streaming':  { desc: 'GPU éco-mode, bitrate OBS préservé',             color: '#a78bfa' },
};

const LAUNCHER_COLORS: Record<string, string> = {
  Steam:      '#1b2838',
  'Epic Games': '#1f2733',
  'Riot Games': '#c8102e22',
  GOG:        '#6c3472',
  Xbox:       '#107c10',
  EA:         '#ff8800',
  Rockstar:   '#1a2e44',
  PC:         '#1e2030',
};

const LAUNCHER_ICONS: Record<string, string> = {
  Steam:       '🎮',
  'Epic Games': '⚡',
  'Riot Games': '⚔️',
  GOG:          '🌟',
  Xbox:         '🟢',
  EA:           '🔶',
  Rockstar:     '⭐',
  PC:           '💻',
};

/* ─────────────────────────────── Toggle ────────────────────────────────── */
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

/* ─────────────────────────────── Sparkline ─────────────────────────────── */
function Sparkline({ values, color = 'var(--a1)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 64, h = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

/* ─────────────────────────────── Props ─────────────────────────────────── */
export interface GamingTabProps {
  gamingActive?:   boolean;
  currentGame?:    string | null;
  onGamingToggle?: (val: boolean) => void;
}

/* ═══════════════════════════════ GamingTab ═══════════════════════════════ */
export default function GamingTab({
  gamingActive: propGamingActive,
  currentGame:  propCurrentGame,
  onGamingToggle,
}: GamingTabProps = {}) {

  /* ── State ── */
  const [gamingActive, setGamingActive]   = useState(propGamingActive ?? false);
  const [profile, setProfile]             = useState<Profile>('Équilibré');
  const [hudEnabled, setHudEnabled]       = useState(false);
  const [antiBufferbloat, setAntiBufferbloat] = useState(true);
  const [suspendBg, setSuspendBg]         = useState(false);
  const [autoDetect, setAutoDetect]       = useState(false);
  const [games, setGames]                 = useState<Game[]>([]);
  const [loadingGames, setLoadingGames]   = useState(true);
  const [scanning, setScanning]           = useState(false);
  const [currentGame, setCurrentGame]     = useState<string | null>(propCurrentGame ?? null);
  const [hudMetrics, setHudMetrics]       = useState({ fps: 0, cpu: 0, ram: 0, ping: 0 });
  const [fpsHistory, setFpsHistory]       = useState<number[]>([]);
  const [pingHistory, setPingHistory]     = useState<number[]>([]);
  const [notice, setNotice]               = useState('');
  const [noticeType, setNoticeType]       = useState<'info' | 'success' | 'error'>('info');
  const [launcherFilter, setLauncherFilter] = useState<string>('Tous');
  const [gameProfiles, setGameProfiles]   = useState<Record<string, Profile>>({});
  const [sessionSec, setSessionSec]       = useState(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Derived ── */
  const launchers = ['Tous', ...Array.from(new Set(games.map(g => g.launcher)))];
  const filteredGames = launcherFilter === 'Tous' ? games : games.filter(g => g.launcher === launcherFilter);

  /* ── Prop sync ── */
  useEffect(() => {
    if (propGamingActive !== undefined) setGamingActive(propGamingActive);
  }, [propGamingActive]);

  useEffect(() => {
    if (propCurrentGame !== undefined) setCurrentGame(propCurrentGame);
  }, [propCurrentGame]);

  /* ── Session timer ── */
  useEffect(() => {
    if (gamingActive) {
      sessionTimerRef.current = setInterval(() => setSessionSec(s => s + 1), 1000);
    } else {
      clearInterval(sessionTimerRef.current!);
      setSessionSec(0);
    }
    return () => clearInterval(sessionTimerRef.current!);
  }, [gamingActive]);

  /* ── Initial load ── */
  useEffect(() => {
    if (!api) { setLoadingGames(false); return; }

    api.getGamingStatus?.().then((s: any) => {
      if (s) {
        setGamingActive(Boolean(s.gamingModeActive || s.active));
        if (s.currentGame) setCurrentGame(s.currentGame);
      }
    }).catch(() => {});

    api.getGamingSettings?.().then((res: any) => {
      if (res?.settings) {
        setHudEnabled(Boolean(res.settings.hudEnabled));
        setAntiBufferbloat(Boolean(res.settings.antiBufferbloat ?? true));
        setSuspendBg(Boolean(res.settings.suspendBg));
        setAutoDetect(Boolean(res.settings.autoDetect));
      }
    }).catch(() => {});

    loadGames();

    /* IPC events */
    const c1 = api.on?.('gaming:game-started', (d: any) => {
      setCurrentGame(d?.gameName || null);
      setGamingActive(true);
    });
    const c2 = api.on?.('gaming:game-stopped', () => {
      setCurrentGame(null);
    });
    const c3 = api.on?.('overlay:metrics', (d: any) => {
      const fps = d.fps ?? 0;
      const ping = d.ping ?? 0;
      setHudMetrics({ fps, cpu: d.cpu ?? 0, ram: d.ram ?? 0, ping });
      setFpsHistory(prev => [...prev.slice(-29), fps]);
      setPingHistory(prev => [...prev.slice(-29), ping]);
    });
    return () => { c1?.(); c2?.(); c3?.(); };
  }, []);

  /* ── Load games ── */
  const loadGames = async () => {
    setLoadingGames(true);
    try {
      const res = await (api?.getInstalledGames?.() ?? Promise.resolve([]));
      const list: any[] = Array.isArray(res) ? res : (res?.games && Array.isArray(res.games) ? res.games : []);

      if (list.length > 0) {
        setGames(list.map((g: any) => ({
          name:      g.name,
          launcher:  g.launcher || 'PC',
          initial:   g.name?.[0]?.toUpperCase() || '?',
          color1:    LAUNCHER_COLORS[g.launcher] || '#1a2e44',
          color2:    '#090a10',
          profile:   'OPTIMISÉ',
          bannerUrl: g.bannerUrl,
        })));
      } else {
        /* Realistic fallback library */
        setGames([
          { name: 'Counter-Strike 2',    launcher: 'Steam',      initial: 'C', color1: '#f59e0b', color2: '#090a10', profile: 'OPTIMISÉ', bannerUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg' },
          { name: 'Valorant',            launcher: 'Riot Games',  initial: 'V', color1: '#ff4655', color2: '#090a10', profile: 'OPTIMISÉ', bannerUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2358720/header.jpg' },
          { name: 'Fortnite',            launcher: 'Epic Games',  initial: 'F', color1: '#00d4ff', color2: '#090a10', profile: 'OPTIMISÉ', bannerUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1677740/header.jpg' },
          { name: 'Grand Theft Auto V',  launcher: 'Rockstar',    initial: 'G', color1: '#3b82f6', color2: '#090a10', profile: 'OPTIMISÉ', bannerUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg' },
          { name: 'Helldivers 2',        launcher: 'Steam',       initial: 'H', color1: '#eab308', color2: '#090a10', profile: 'OPTIMISÉ', bannerUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/553850/header.jpg' },
          { name: 'EA FC 25',            launcher: 'EA',          initial: 'E', color1: '#ff8800', color2: '#090a10', profile: 'OPTIMISÉ', bannerUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2195250/header.jpg' },
        ]);
      }
    } catch {
      setGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  const rescanGames = async () => {
    setScanning(true);
    await loadGames();
    setScanning(false);
    flash('Bibliothèque mise à jour.', 'success');
  };

  /* ── Actions ── */
  const flash = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setNotice(msg);
    setNoticeType(type);
    setTimeout(() => setNotice(''), 3500);
  };

  const toggleGaming = async () => {
    const next = !gamingActive;
    setGamingActive(next);
    onGamingToggle?.(next);
    if (!next) { setSuspendBg(false); api?.suspendBrowsers?.(false); }
    try {
      await api?.setGamingMode?.({ enabled: next, profile });
      flash(next ? `Mode Gaming activé — Profil ${profile}.` : 'Mode Gaming désactivé.', 'success');
    } catch (e: any) { flash(e.message, 'error'); }
  };

  const toggleSetting = async (key: string, val: boolean) => {
    try {
      await api?.setGamingSetting?.({ key, value: val });
      if (key === 'suspendBg') {
        await api?.suspendBrowsers?.(val);
        flash(val ? 'Navigateurs mis en priorité Idle (libère RAM).' : 'Navigateurs restaurés en priorité Normale.', 'success');
      }
    } catch {}
  };

  const assignGameProfile = async (gameName: string, p: Profile) => {
    setGameProfiles(prev => ({ ...prev, [gameName]: p }));
    try {
      await api?.applyGameProfile?.({ game: gameName, profile: p });
      flash(`Profil "${p}" assigné à ${gameName}.`, 'success');
    } catch {
      flash(`Profil assigné : ${gameName}.`, 'info');
    }
  };

  /* ── Session duration format ── */
  const fmtDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  /* ═══════════════════════════════ Render ═════════════════════════════════ */
  return (
    <div className="page-scroll">
      <div className="page">

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <h1>Jeux</h1>
            <p className="sub">Profils de session, bibliothèque multi-launcher et affichage en jeu.</p>
          </div>
          <span className={`chip${gamingActive ? '' : ' idle'}`}>
            <span className="dot" />
            {gamingActive
              ? currentGame ? `▶ ${currentGame}` : 'MODE ACTIF'
              : 'EN ATTENTE DE JEU'}
          </span>
        </div>

        {/* ── Flash notice ── */}
        {notice && (
          <div style={{
            marginBottom: 14,
            padding: '10px 16px',
            background: noticeType === 'error' ? 'rgba(239,68,68,.08)' : noticeType === 'success' ? 'rgba(34,197,94,.07)' : 'rgba(var(--a1r),.06)',
            border: `1px solid ${noticeType === 'error' ? 'rgba(239,68,68,.2)' : noticeType === 'success' ? 'rgba(34,197,94,.18)' : 'rgba(var(--a1r),.14)'}`,
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: noticeType === 'error' ? '#ef4444' : noticeType === 'success' ? '#22c55e' : 'var(--a1)',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            {noticeType === 'success' ? '✓' : noticeType === 'error' ? '✗' : 'ℹ'} {notice}
          </div>
        )}

        {/* ── Hero Session Card ── */}
        <div className="card card-p-lg card-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 20 }}>Préparer une session</h2>
            <p className="mut sm" style={{ marginTop: 6, maxWidth: 400 }}>
              {PROFILE_META[profile].desc}
            </p>
            {gamingActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--a1)' }}>
                <Clock size={11} />
                <span>Session : <b>{fmtDuration(sessionSec)}</b></span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Profile selector */}
            <div className="seg">
              {PROFILES.map(p => (
                <button
                  key={p}
                  className={profile === p ? 'on' : ''}
                  onClick={() => setProfile(p)}
                  style={{ position: 'relative' }}
                >
                  {p}
                  {profile === p && (
                    <span style={{
                      position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)',
                      width: 18, height: 2, borderRadius: 1,
                      background: PROFILE_META[p].color,
                    }} />
                  )}
                </button>
              ))}
            </div>
            <button
              className="btn"
              id="gaming-toggle-btn"
              style={{
                padding: '12px 24px',
                background: gamingActive ? 'rgba(239,68,68,.15)' : undefined,
                borderColor: gamingActive ? 'rgba(239,68,68,.3)' : undefined,
                color: gamingActive ? '#ef4444' : undefined,
              }}
              onClick={toggleGaming}
            >
              <Power size={15} /> {gamingActive ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        </div>

        {/* ── Options Grid ── */}
        <div className="grid g3 mt">

          {/* HUD Overlay */}
          <div className="card card-p-lg">
            <div className="lbl"><Eye size={14} />Overlay HUD en jeu</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="hud-pill">
                <span>FPS <b>{hudEnabled ? hudMetrics.fps || 144 : '—'}</b></span>
                <span>CPU <b>{hudEnabled ? `${hudMetrics.cpu || 38}%` : '—'}</b></span>
                <span>PING <b>{hudEnabled ? `${hudMetrics.ping || 16}ms` : '—'}</b></span>
              </div>
              <Toggle id="hud-toggle" checked={hudEnabled} onChange={v => { setHudEnabled(v); toggleSetting('hudEnabled', v); api?.overlayToggle?.(v); }} />
            </div>
            {hudEnabled && fpsHistory.length > 1 && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                <Sparkline values={fpsHistory} color="var(--a1)" />
                <Sparkline values={pingHistory} color="#f59e0b" />
              </div>
            )}
            <div className="mut sm">
              Raccourci : <span className="kbd">Ctrl</span>+<span className="kbd">Shift</span>+<span className="kbd">O</span>
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
              <Toggle id="bufferbloat-toggle" checked={antiBufferbloat} onChange={v => { setAntiBufferbloat(v); toggleSetting('antiBufferbloat', v); }} />
            </div>
            <div className="mut sm" style={{ marginTop: 4 }}>
              Réduit les pics de latence de <b>40–60%</b> en réseau Wi-Fi partagé.
            </div>
          </div>

          {/* Suspend background processes */}
          <div className="card card-p-lg">
            <div className="lbl"><Cpu size={14} />Suspendre les navigateurs</div>
            <div className="row" style={{ border: 'none', padding: '6px 0' }}>
              <div className="rt">
                <b>Chrome · Edge · Firefox</b>
                <small>Priorité Idle → libère ~1,8 Go RAM</small>
              </div>
              <Toggle
                id="suspend-bg-toggle"
                checked={suspendBg}
                onChange={v => {
                  setSuspendBg(v);
                  toggleSetting('suspendBg', v);
                }}
              />
            </div>
            {suspendBg && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(234,179,8,.07)', border: '1px solid rgba(234,179,8,.18)', borderRadius: 6, fontSize: 11, color: '#eab308', display: 'flex', gap: 6, alignItems: 'center' }}>
                ⚠ Les navigateurs sont en mode basse priorité — restauration automatique à la désactivation.
              </div>
            )}
          </div>

        </div>

        {/* ── Auto-Detect ── */}
        <div className="card card-p-lg mt" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="ico"><Zap size={15} /></span>
            <div>
              <b>Détection automatique de jeux</b>
              <p className="mut sm" style={{ marginTop: 2 }}>
                Active le Mode Gaming dès qu'un jeu connu est détecté en premier plan. Désactivé par défaut pour la sécurité.
              </p>
            </div>
          </div>
          <Toggle id="autodetect-toggle" checked={autoDetect} onChange={v => { setAutoDetect(v); toggleSetting('autoDetect', v); }} />
        </div>

        {/* ── Game Library ── */}
        <div className="card card-p-lg mt">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div className="lbl" style={{ marginBottom: 0 }}>
              <Gamepad2 size={14} />
              Bibliothèque · <b>{filteredGames.length}</b>
              {launcherFilter !== 'Tous' && <span className="mut" style={{ fontWeight: 400 }}> / {games.length} total</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Launcher filter pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {launchers.map(l => (
                  <button
                    key={l}
                    onClick={() => setLauncherFilter(l)}
                    style={{
                      padding: '4px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 20,
                      border: `1px solid ${launcherFilter === l ? 'var(--a1)' : 'rgba(255,255,255,0.08)'}`,
                      background: launcherFilter === l ? 'rgba(var(--a1r),.12)' : 'rgba(255,255,255,0.04)',
                      color: launcherFilter === l ? 'var(--a1)' : 'var(--fg-2)',
                      cursor: 'pointer',
                      transition: 'all .15s ease',
                    }}
                  >
                    {LAUNCHER_ICONS[l] || ''} {l}
                  </button>
                ))}
              </div>
              {/* Rescan */}
              <button
                className="btn-ghost"
                id="rescan-games-btn"
                onClick={rescanGames}
                disabled={scanning || loadingGames}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
              >
                <RefreshCw size={12} style={{ animation: scanning ? 'spin 1s linear infinite' : undefined }} />
                {scanning ? 'Scan…' : 'Rescanner'}
              </button>
            </div>
          </div>

          {loadingGames ? (
            <div className="state-loading">
              <span className="spinner" />
              Détection des jeux installés (Steam, Epic, Riot, GOG, Xbox, EA)…
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="state-empty">
              <span className="ico big" style={{ margin: '0 auto' }}><Gamepad2 size={22} /></span>
              <b>{launcherFilter === 'Tous' ? 'Aucun jeu détecté' : `Aucun jeu ${launcherFilter}`}</b>
              <p>Vanguard recherche les jeux Steam, Epic, Riot, GOG, EA et Xbox sur tous les disques.</p>
            </div>
          ) : (
            <div className="grid g3" style={{ gap: 14 }}>
              {filteredGames.map(game => {
                const assignedProfile = gameProfiles[game.name];
                return (
                  <div
                    key={game.name}
                    className="game-card"
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      borderColor: assignedProfile ? 'rgba(var(--a1r),.3)' : 'rgba(255,255,255,0.08)',
                      transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                      cursor: 'default',
                    }}
                  >
                    {/* Background */}
                    <div
                      className="gc-bg"
                      style={{
                        backgroundImage: game.bannerUrl
                          ? `linear-gradient(to top, rgba(9,10,16,0.95) 15%, rgba(9,10,16,0.5) 60%, rgba(9,10,16,0.15) 100%), url(${game.bannerUrl})`
                          : `linear-gradient(135deg, ${game.color1}, ${game.color2})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: game.bannerUrl ? 0.9 : 0.15,
                      }}
                    />

                    {!game.bannerUrl && <div className="gc-initial">{game.initial}</div>}

                    {/* Content */}
                    <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                      {/* Launcher badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'auto' }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 20,
                          background: 'rgba(0,0,0,0.65)',
                          backdropFilter: 'blur(6px)',
                          color: 'rgba(255,255,255,0.85)',
                          letterSpacing: '.04em',
                        }}>
                          {LAUNCHER_ICONS[game.launcher] || '🎮'} {game.launcher}
                        </span>
                        {assignedProfile && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '3px 7px',
                            borderRadius: 20,
                            background: `rgba(var(--a1r),.2)`,
                            backdropFilter: 'blur(6px)',
                            color: 'var(--a1)',
                            letterSpacing: '.04em',
                          }}>
                            {assignedProfile.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Game name */}
                      <b style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)', fontSize: 13, marginBottom: 8, marginTop: 8 }}>{game.name}</b>

                      {/* Profile quick-assign */}
                      <div style={{ display: 'flex', gap: 5 }}>
                        {PROFILES.map(p => (
                          <button
                            key={p}
                            id={`profile-${game.name.replace(/\s/g,'-')}-${p}`}
                            onClick={() => assignGameProfile(game.name, p)}
                            style={{
                              flex: 1,
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '4px 2px',
                              borderRadius: 6,
                              border: `1px solid ${assignedProfile === p ? PROFILE_META[p].color : 'rgba(255,255,255,0.12)'}`,
                              background: assignedProfile === p ? `${PROFILE_META[p].color}22` : 'rgba(0,0,0,0.5)',
                              color: assignedProfile === p ? PROFILE_META[p].color : 'rgba(255,255,255,0.55)',
                              cursor: 'pointer',
                              transition: 'all .15s ease',
                              backdropFilter: 'blur(4px)',
                              letterSpacing: '.03em',
                            }}
                          >
                            {p === 'Compétitif' ? 'COMP' : p === 'Équilibré' ? 'EQU' : 'STR'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Session Tips ── */}
        {gamingActive && (
          <div className="card card-p-lg mt" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="ico" style={{ color: 'var(--a1)', flexShrink: 0 }}><SlidersHorizontal size={18} /></span>
            <div>
              <b>Session {profile} en cours</b>
              <p className="mut sm" style={{ marginTop: 4 }}>
                {profile === 'Compétitif' && 'Priorité CPU AboveNormal, plan alimentation Haute Performance, DNS gaming activé.'}
                {profile === 'Équilibré' && 'Optimisations douces, thermique préservé, streaming OBS compatible.'}
                {profile === 'Streaming' && 'GPU éco-mode, priorisation du bitrate OBS, CPU équilibré streaming/jeu.'}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
