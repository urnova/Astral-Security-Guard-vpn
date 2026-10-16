import { useState, useEffect, useRef } from 'react';
import { Gamepad2, Power, Monitor, Wifi, Cpu, Eye, RefreshCw, Zap, SlidersHorizontal, Clock, ExternalLink, Info, X, ShieldCheck, Activity } from 'lucide-react';

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

type Profile = 'Compétitif' | 'Équilibré' | 'Qualité';

const PROFILES: Profile[] = ['Compétitif', 'Équilibré', 'Qualité'];

const PROFILE_META: Record<Profile, { desc: string; color: string; hint: string }> = {
  'Compétitif': { desc: 'Priorité CPU max, GPU non-limité, latence minimale', color: 'var(--a1)', hint: 'Latence min' },
  'Équilibré':  { desc: 'Optimisation équilibrée et fluide pour tout jeu',   color: '#22c55e',   hint: 'Équilibré' },
  'Qualité':    { desc: 'Priorité rendu graphique haute fidélité',           color: '#a78bfa',   hint: 'Graphismes max' },
};

const LAUNCHER_COLORS: Record<string, string> = {
  Steam:        '#1b2838',
  'Epic Games': '#1f2733',
  'Riot Games': '#c8102e',
  GOG:          '#6c3472',
  Xbox:         '#107c10',
  EA:           '#ff4747',
  Rockstar:     '#fcaf17',
  Ubisoft:      '#0070ff',
  PC:           '#1e2030',
};

function LauncherSvg({ launcher, size = 12 }: { launcher: string; size?: number }) {
  const l = (launcher || '').toLowerCase();
  if (l.includes('steam')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.723L.686 14.832C2.016 20.088 6.55 24 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zm-3.613 16.924c-1.077 0-1.954-.877-1.954-1.957 0-1.078.877-1.955 1.954-1.955.335 0 .65.086.925.234l-1.464 2.122c-.22.257-.184.652.073.873.13.11.29.167.45.167.14 0 .28-.043.397-.128l2.094-1.493c.125.263.197.558.197.87 0 1.08-.876 1.958-1.953 1.958h-.726zm7.573-5.748c-1.25 0-2.262-1.012-2.262-2.262 0-1.25 1.012-2.262 2.262-2.262 1.25 0 2.262 1.012 2.262 2.262 0 1.25-1.012 2.262-2.262 2.262z" />
      </svg>
    );
  }
  if (l.includes('epic')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M3.5 2h17l-2 16.5-6.5 3.5-6.5-3.5L3.5 2zm3.8 3.8v7.4h6.8v-1.9H9.4V9.6h4.5V7.7H9.4V5.8h4.5V3.9H7.3v1.9z" />
      </svg>
    );
  }
  if (l.includes('xbox')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.895 4.394c1.196.862 2.628 1.488 3.79 1.488 1.162 0 2.594-.626 3.79-1.488.756 1.026 1.257 2.235 1.439 3.535-1.127.876-2.613 1.542-4.148 1.764 1.483 1.635 2.766 3.42 3.655 5.395-1.745 2.015-4.28 3.284-7.086 3.284-2.806 0-5.341-1.269-7.086-3.284.889-1.975 2.172-3.76 3.655-5.395-1.535-.222-3.021-.888-4.148-1.764.182-1.3.683-2.509 1.439-3.535 1.196.862 2.628 1.488 3.79 1.488 1.162 0 2.594-.626 3.79-1.488-.548.423-1.288.73-1.895.73s-1.347-.307-1.895-.73z" />
      </svg>
    );
  }
  if (l.includes('rockstar')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2.5 4v11h2.8v-3.7h1.6l2.9 3.7h3.4l-3.3-4.1c1.8-.6 2.8-2 2.8-3.5 0-2.2-1.6-3.4-4.2-3.4H6.5zm2.8 2.2h2.2c1.2 0 2 .5 2 1.5s-.8 1.5-2 1.5H9.3V8.2zm6.2 5.3l.6 1.8 1.9.1-1.5 1.1.5 1.8-1.5-1.1-1.5 1.1.5-1.8-1.5-1.1 1.9-.1.6-1.8z" />
      </svg>
    );
  }
  if (l.includes('riot')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M13.447 3.518l-9.92 4.417.844 7.42 2.527-.378-.423-3.692 1.348-.198.398 3.51 3.253-.487-.417-3.67 1.353-.203.418 3.693 3.33-.498-.444-3.918 1.402-.21.442 3.921 2.24-.336 1.488-10.781zm-4.32 16.964H2v-1.616l2.36-.353 4.767 1.969zm12.873-1.928l-8.527 1.277-2.614-1.082 1.393-10.092 9.748-1.46 0 11.357z" />
      </svg>
    );
  }
  if (l.includes('ea') || l.includes('origin')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.8 14.5l-1.2-2.3H5.9l-.8 2.3H3.2l3.4-9.3h2.1l3.5 9.3h-2zm9.1 0h-5.9v-9.3h5.7v1.8h-3.8v1.9h3.4v1.8h-3.4v2h4v1.8zm-9.7-4.1l-1.1-2.4-1.1 2.4h2.2z" />
      </svg>
    );
  }
  if (l.includes('ubisoft')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.78-.47-3.45-1.3-4.89l-2.14 1.53c.59 1 1 2.15 1 3.36 0 4.14-3.36 7.5-7.56 7.5-4.14 0-7.5-3.36-7.5-7.5 0-3.36 2.22-6.19 5.27-7.1l.73 2.5c-1.8.63-3.1 2.36-3.1 4.4 0 2.54 2.06 4.6 4.6 4.6s4.6-2.06 4.6-4.6c0-1.27-.52-2.42-1.35-3.25l1.85-1.85C17.27 7.84 17.9 9.35 17.9 11c0 3.26-2.64 5.9-5.9 5.9-3.26 0-5.9-2.64-5.9-5.9 0-2.35 1.37-4.38 3.36-5.35L8.9 3.2C6.07 4.54 4.1 7.53 4.1 11c0 4.36 3.54 7.9 7.9 7.9s7.9-3.54 7.9-7.9c0-2.2-.9-4.2-2.35-5.65L19.4 3.5C21 5.6 22 8.2 22 11c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
      </svg>
    );
  }
  if (l.includes('gog')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-2.8 13.8a4 4 0 1 1 0-7.6v1.9a2.1 2.1 0 1 0 0 3.8zm5.6 0a4 4 0 1 1 0-7.6v1.9a2.1 2.1 0 1 0 0 3.8z" />
      </svg>
    );
  }
  return <Gamepad2 size={size} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
}

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
  const [hardware, setHardware]           = useState<{
    gpuName: string;
    gpuDriver: string;
    gpuDriverRaw: string;
    gpuDriverDate: string;
    driverUrl: string;
    cpuName: string;
    ramGB: number;
    motherboard: string;
  } | null>(null);
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const [gameProfiles, setGameProfiles]   = useState<Record<string, Profile>>({});
  const [gameOptEnabled, setGameOptEnabled] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('astral_game_opt_enabled');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [sessionSec, setSessionSec]       = useState(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleGameOpt = (gameName: string, enabled: boolean) => {
    setGameOptEnabled(prev => {
      const next = { ...prev, [gameName]: enabled };
      try { localStorage.setItem('astral_game_opt_enabled', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  /* ── Derived ── */
  const rawLaunchers = Array.from(new Set(games.map(g => g.launcher))).filter(Boolean);
  const launchers = ['Tous', ...rawLaunchers];
  const effectiveFilter = launchers.includes(launcherFilter) ? launcherFilter : 'Tous';
  const filteredGames = effectiveFilter === 'Tous' ? games : games.filter(g => g.launcher === effectiveFilter);

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

    api?.getHardwareInfo?.().then((res: any) => {
      if (res?.success && res.hardware) {
        setHardware(res.hardware);
      }
    }).catch(() => {});

    const autoRescanInterval = setInterval(() => {
      loadGames();
    }, 10 * 60 * 1000);

    return () => { c1?.(); c2?.(); c3?.(); clearInterval(autoRescanInterval); };
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
        setGames([]);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 20, margin: 0 }}>Préparer une session</h2>
              <button
                className="btn-ghost"
                onClick={() => setShowProfileDetails(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 8px', borderRadius: 6 }}
                title="Consulter le détail technique des optimisations"
              >
                <Info size={13} style={{ color: 'var(--a1)' }} />
                <span>Détails & Réversibilité</span>
              </button>
            </div>
            <p className="mut sm" style={{ marginTop: 6, maxWidth: 460 }}>
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

        {/* ── Hardware Report & Driver Status ── */}
        <div className="card card-p-lg mt" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="lbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Monitor size={15} style={{ color: 'var(--a1)' }} />
              Matériel Détecté & Pilotes Graphiques
            </div>
            {hardware?.driverUrl && (
              <button
                className="btn-ghost"
                onClick={() => api?.openExternal?.(hardware.driverUrl)}
                style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>Pilotes officiels</span>
                <ExternalLink size={12} />
              </button>
            )}
          </div>

          <div className="grid g4" style={{ gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>CARTE GRAPHIQUE (GPU)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.gpuName}>
                {hardware?.gpuName || 'Détection…'}
              </div>
              <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2 }}>
                Pilote : {hardware?.gpuDriver ? `v${hardware.gpuDriver}` : 'Actif'}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>PROCESSEUR (CPU)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.cpuName}>
                {hardware?.cpuName || 'Processeur Principal'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                Priorité AboveNormal
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>MÉMOIRE VIVE (RAM)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                {hardware?.ramGB ? `${hardware.ramGB} Go Détectés` : 'Mémoire Système'}
              </div>
              <div style={{ fontSize: 11, color: '#68b894', marginTop: 2 }}>
                Allocation optimisée
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>CARTE MÈRE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hardware?.motherboard}>
                {hardware?.motherboard || 'Carte mère hôte'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                Architecture PC
              </div>
            </div>
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
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all .15s ease',
                    }}
                  >
                    {l !== 'Tous' && <LauncherSvg launcher={l} size={12} />}
                    <span>{l}</span>
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
                const assignedProfile = gameProfiles[game.name] || 'Équilibré';
                const isOpt = gameOptEnabled[game.name] !== false;

                return (
                  <div
                    key={game.name}
                    className="game-card"
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      contain: 'paint',
                      contentVisibility: 'auto',
                      borderColor: isOpt ? 'rgba(var(--a1r),.35)' : 'rgba(255,255,255,0.08)',
                      transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                      cursor: 'default',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 180,
                    }}
                  >
                    {/* Background */}
                    <div
                      className="gc-bg"
                      style={{
                        backgroundImage: game.bannerUrl
                          ? `linear-gradient(to top, rgba(9,10,16,0.96) 20%, rgba(9,10,16,0.55) 60%, rgba(9,10,16,0.2) 100%), url(${game.bannerUrl})`
                          : `linear-gradient(135deg, ${game.color1}, ${game.color2})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: game.bannerUrl ? 0.9 : 0.15,
                      }}
                    />

                    {!game.bannerUrl && <div className="gc-initial">{game.initial}</div>}

                    {/* Content */}
                    <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                      {/* Launcher badge & Profile Pill */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 20,
                            background: 'rgba(0,0,0,0.7)',
                            backdropFilter: 'blur(6px)',
                            color: 'rgba(255,255,255,0.9)',
                            letterSpacing: '.03em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}>
                            <LauncherSvg launcher={game.launcher} size={12} />
                            {game.launcher}
                          </span>

                          {isOpt && (
                            <span style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 20,
                              background: `${PROFILE_META[assignedProfile].color}25`,
                              border: `1px solid ${PROFILE_META[assignedProfile].color}50`,
                              backdropFilter: 'blur(6px)',
                              color: PROFILE_META[assignedProfile].color,
                              letterSpacing: '.03em',
                            }}>
                              {assignedProfile.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Game name */}
                        <b
                          style={{
                            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                            fontSize: 13,
                            marginBottom: 8,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: 'var(--text)',
                          }}
                          title={game.name}
                        >
                          {game.name}
                        </b>
                      </div>

                      {/* Controls Bottom Area */}
                      <div>
                        {/* Per-Game Optimization Switch */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                            padding: '4px 8px',
                            background: 'rgba(0,0,0,0.5)',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <span style={{ fontSize: 10, color: isOpt ? 'var(--a1)' : 'var(--muted)', fontWeight: 600 }}>
                            {isOpt ? 'Optimisation active' : 'Par défaut Windows'}
                          </span>
                          <label className="toggle" style={{ transform: 'scale(0.75)', transformOrigin: 'right center', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={isOpt}
                              onChange={e => toggleGameOpt(game.name, e.target.checked)}
                            />
                            <span className="toggle-track" />
                            <span className="toggle-thumb" />
                          </label>
                        </div>

                        {/* Profile Selection: Compétitif / Équilibré / Qualité */}
                        <div
                          style={{
                            display: 'flex',
                            gap: 4,
                            opacity: isOpt ? 1 : 0.4,
                            pointerEvents: isOpt ? 'auto' : 'none',
                            transition: 'opacity 0.2s ease',
                          }}
                        >
                          {PROFILES.map(p => {
                            const isCurrent = assignedProfile === p;
                            return (
                              <button
                                key={p}
                                id={`profile-${game.name.replace(/\s/g,'-')}-${p}`}
                                onClick={() => assignGameProfile(game.name, p)}
                                title={PROFILE_META[p].desc}
                                style={{
                                  flex: 1,
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  padding: '5px 2px',
                                  borderRadius: 5,
                                  border: `1px solid ${isCurrent ? PROFILE_META[p].color : 'rgba(255,255,255,0.1)'}`,
                                  background: isCurrent ? `${PROFILE_META[p].color}26` : 'rgba(0,0,0,0.45)',
                                  color: isCurrent ? PROFILE_META[p].color : 'rgba(255,255,255,0.6)',
                                  cursor: 'pointer',
                                  transition: 'all .15s ease',
                                  backdropFilter: 'blur(4px)',
                                  whiteSpace: 'nowrap',
                                  textAlign: 'center',
                                }}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
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
                {profile === 'Qualité' && 'Priorité rendu haute fidélité, synchronisation fluide et stabilité de trame.'}
              </p>
            </div>
          </div>
        )}

        {/* ── Detailed Profile Configuration Modal ── */}
        {showProfileDetails && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 9999,
              display: 'grid',
              placeItems: 'center',
              padding: 24,
            }}
            onClick={() => setShowProfileDetails(false)}
          >
            <div
              className="card card-p-lg"
              style={{
                width: '100%',
                maxWidth: 680,
                background: '#0d1117',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                padding: 26,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={20} style={{ color: 'var(--a1)' }} />
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Profils de Session & Vérité Terrain</h3>
                </div>
                <button
                  className="btn-ghost"
                  onClick={() => setShowProfileDetails(false)}
                  style={{ padding: '6px 8px', borderRadius: 8 }}
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 20 }}>
                Chaque profil applique des ajustements système réversibles mesurables. À la fermeture du jeu ou à la désactivation, <b>tous les paramètres d’origine (priorités, plan d’énergie, réseau) sont automatiquement restaurés</b> sans altérer Windows.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: '#38bdf8', fontSize: 14 }}>⚡ Profil Compétitif (Esports & Latence Minimale)</b>
                    <span className="chip" style={{ fontSize: 10, color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)' }}>Latence min</span>
                  </div>
                  <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                    <li><b>Priorité processeur :</b> <code>AboveNormal</code> pour le processus de jeu au premier plan.</li>
                    <li><b>Plan d'alimentation :</b> Bascule temporaire sur <code>Performances Élevées</code> (suppression du core parking).</li>
                    <li><b>Réseau :</b> Priorité de trafic UDP, bufferbloat Wi-Fi réduit et latence de rendu ultra-faible.</li>
                  </ul>
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: '#22c55e', fontSize: 14 }}>⚖ Profil Équilibré (Standard & Polyvalent)</b>
                    <span className="chip" style={{ fontSize: 10, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>Recommandé</span>
                  </div>
                  <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                    <li><b>Priorité processeur :</b> Dynamique et respectueuse des températures CPU/GPU.</li>
                    <li><b>Streaming & multitâche :</b> Compatibilité totale avec OBS Studio, Discord et enregistreurs.</li>
                    <li><b>Protection réseau :</b> Purgation des files de saturation réseau sans monopolisation.</li>
                  </ul>
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: '#a78bfa', fontSize: 14 }}>🎨 Profil Qualité (Titres AAA & Immersion Visuelle)</b>
                    <span className="chip" style={{ fontSize: 10, color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }}>Fidélité max</span>
                  </div>
                  <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                    <li><b>Allocation GPU :</b> Priorité aux threads de compilation de shaders DirectX 12 / Vulkan.</li>
                    <li><b>Stabilité de trame :</b> Évite les chutes de framerate lors du streaming de textures lourdes.</li>
                  </ul>
                </div>
              </div>

              <div style={{ marginTop: 20, textAlign: 'right' }}>
                <button
                  className="btn"
                  onClick={() => setShowProfileDetails(false)}
                  style={{ padding: '8px 20px' }}
                >
                  Compris
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
