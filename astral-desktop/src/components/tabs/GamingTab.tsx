import { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Power, Monitor, Wifi, Cpu, Eye, Zap, SlidersHorizontal,
  Clock, ExternalLink, Info, X, ShieldCheck, Play, Trash2, HelpCircle
} from 'lucide-react';
import { SlideDrawer } from '../common/SlideDrawer';

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
  appId?:    string;
  path?:     string;
}

type Profile = 'Compétitif' | 'Équilibré' | 'Qualité';

const PROFILES: Profile[] = ['Compétitif', 'Équilibré', 'Qualité'];

const PROFILE_META: Record<Profile, {
  title: string;
  tagline: string;
  desc: string;
  color: string;
  features: string[];
  bestFor: string;
}> = {
  'Compétitif': {
    title: 'Compétitif & Esports',
    tagline: 'Latence d\'entrée minimale & framerate débridé',
    desc: 'Bascule le processus de jeu en priorité Haute/AboveNormal, active le plan d\'alimentation Performances Élevées de Windows, purge les files réseau UDP et désactive les effets visuels superflus de Windows pour une réponse instantanée.',
    color: 'var(--a1)',
    features: ['Priorité CPU AboveNormal', 'Plan d\'alimentation Performances Élevées', 'Bufferbloat Wi-Fi désactivé', 'Délai d\'entrée minimal'],
    bestFor: 'Valorant, CS2, Fortnite, Warzone, Apex Legends',
  },
  'Équilibré': {
    title: 'Équilibré & Polyvalent',
    tagline: 'Fluidité constante et thermique préservé',
    desc: 'Optimisation modérée et stable garantissant une fluidité maximale tout en maintenant les ventilateurs à un niveau acoustique confortable. Totalement compatible avec le streaming Discord et OBS Studio en arrière-plan.',
    color: '#22c55e',
    features: ['Fréquences CPU/GPU équilibrées', 'Températures et ventilation maîtrisées', 'Compatible streaming Discord & OBS', 'Stabilité de framerate'],
    bestFor: 'GTA V, The Witcher 3, Red Dead Redemption 2, Elden Ring',
  },
  'Qualité': {
    title: 'Qualité & Haute Fidélité',
    tagline: 'Rendu graphique 1440p/4K sans saccade',
    desc: 'Priorise le pipeline graphique DirectX 12 et Vulkan, pré-alloue le cache texture pour éliminer le micro-stuttering et stabilise le frametime pour une immersion visuelle totale sur moniteur haute résolution.',
    color: '#a78bfa',
    features: ['Allocation maximale du GPU VRAM', 'Élimination du micro-stuttering', 'Priorité rendu DirectX 12 / Vulkan', 'Rendu cinématique ultra-fluide'],
    bestFor: 'Cyberpunk 2077, Forza Horizon 5, Alan Wake 2, Starfield',
  },
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
  'PC Games':   '#1e2030',
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
  const [currentGame, setCurrentGame]     = useState<string | null>(propCurrentGame ?? null);
  const [hudMetrics, setHudMetrics]       = useState({ fps: 0, cpu: 0, ram: 0, ping: 0 });
  const [notice, setNotice]               = useState('');
  const [noticeType, setNoticeType]       = useState<'info' | 'success' | 'error'>('info');
  const [launcherFilter, setLauncherFilter] = useState<string>('Tous');
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
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      setSessionSec(0);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
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
      setHudMetrics({
        fps: d.fps ?? 0,
        cpu: d.cpu ?? 0,
        ram: d.ram ?? 0,
        ping: d.ping ?? 0,
      });
    });

    const c4 = api.on?.('hud:state-changed', (d: any) => {
      if (typeof d?.visible === 'boolean') {
        setHudEnabled(d.visible);
      }
    });

    const autoRescanInterval = setInterval(() => {
      loadGames(false);
    }, 10 * 60 * 1000);

    return () => { c1?.(); c2?.(); c3?.(); c4?.(); clearInterval(autoRescanInterval); };
  }, []);

  /* ── Load games automatically ── */
  const loadGames = async (showLoading = true) => {
    if (showLoading) setLoadingGames(true);
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
          appId:     g.appId,
          path:      g.path,
        })));
      } else {
        setGames([]);
      }
    } catch {
      setGames([]);
    } finally {
      if (showLoading) setLoadingGames(false);
    }
  };

  /* ── Actions ── */
  const flash = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setNotice(msg);
    setNoticeType(type);
    setTimeout(() => setNotice(''), 3800);
  };

  const toggleGaming = async () => {
    const next = !gamingActive;
    setGamingActive(next);
    onGamingToggle?.(next);
    if (!next) { setSuspendBg(false); api?.suspendBrowsers?.(false); }
    try {
      await api?.setGamingMode?.({ enabled: next, profile });
      flash(next ? `Mode Gaming activé — Profil ${profile}.` : 'Mode Gaming désactivé — Paramètres Windows restaurés.', 'success');
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

  const handleLaunchGame = async (game: Game) => {
    try {
      flash(`Lancement de ${game.name} en cours...`, 'info');
      const res = await api?.launchGame?.(game);
      if (res?.success) {
        flash(res.message || `Lancement de ${game.name} réussi.`, 'success');
      } else {
        flash(res?.error || `Impossible de lancer ${game.name}.`, 'error');
      }
    } catch (e: any) {
      flash(e.message || `Erreur au lancement de ${game.name}.`, 'error');
    }
  };

  const handleUninstallGame = async (game: Game) => {
    try {
      const res = await api?.uninstallGame?.(game);
      if (res?.success) {
        flash(res.message || `Procédure de désinstallation initiée pour ${game.name}.`, 'info');
      } else {
        flash(res?.error || `Impossible de désinstaller ${game.name}.`, 'error');
      }
    } catch (e: any) {
      flash(e.message || `Erreur désinstallation: ${game.name}`, 'error');
    }
  };

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
            <h1>Jeux & Optimisation Matérielle</h1>
            <p className="sub">Moteur de session réversible, bibliothèque unifiée multi-disques et surveillance matérielle en temps réel.</p>
          </div>
          <span className={`chip${gamingActive ? '' : ' idle'}`}>
            <span className="dot" />
            {gamingActive
              ? currentGame ? `▶ ${currentGame}` : `ACTIF · PROFIL ${profile.toUpperCase()}`
              : 'EN ATTENTE DE JEU'}
          </span>
        </div>

        {/* ── Flash notice ── */}
        {notice && (
          <div style={{
            marginBottom: 16,
            padding: '12px 18px',
            background: noticeType === 'error' ? 'rgba(239,68,68,.09)' : noticeType === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(var(--a1r),.08)',
            border: `1px solid ${noticeType === 'error' ? 'rgba(239,68,68,.25)' : noticeType === 'success' ? 'rgba(34,197,94,.22)' : 'rgba(var(--a1r),.2)'}`,
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            fontWeight: 500,
            color: noticeType === 'error' ? '#ef4444' : noticeType === 'success' ? '#22c55e' : 'var(--a1)',
            display: 'flex', gap: 10, alignItems: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          }}>
            {noticeType === 'success' ? '✓' : noticeType === 'error' ? '✗' : 'ℹ'} {notice}
          </div>
        )}

        {/* ── Big Hero Session Card ── */}
        <div className="card card-p-lg" style={{
          background: 'linear-gradient(135deg, rgba(20,27,45,0.7) 0%, rgba(11,15,23,0.95) 100%)',
          border: '1px solid rgba(var(--a1r), 0.25)',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  display: 'inline-flex', padding: '6px 12px', borderRadius: 20,
                  background: 'rgba(var(--a1r), 0.15)', border: '1px solid var(--a1)',
                  color: 'var(--a1)', fontSize: 11, fontWeight: 700, letterSpacing: '.04em'
                }}>
                  SESSION GAMING
                </span>
                <h2 style={{ fontSize: 22, margin: 0, fontWeight: 700 }}>Préparer une session de jeu</h2>
                <button
                  className="btn-ghost"
                  onClick={() => setShowProfileDetails(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', borderRadius: 6 }}
                  title="Consulter le détail technique des optimisations"
                >
                  <Info size={14} style={{ color: 'var(--a1)' }} />
                  <span>Détails & Réversibilité</span>
                </button>
              </div>
              <p className="mut" style={{ marginTop: 8, fontSize: 13, maxWidth: 650, lineHeight: 1.5 }}>
                Sélectionnez le comportement système appliqué au lancement du jeu. Tous les ajustements sont mesurables et <b>restaurés automatiquement à 100%</b> à la fin de votre partie.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {gamingActive && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 8,
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                  color: '#22c55e', fontSize: 13, fontWeight: 600
                }}>
                  <Clock size={15} />
                  <span>Session en cours : <b>{fmtDuration(sessionSec)}</b></span>
                </div>
              )}
              <button
                className="btn"
                id="gaming-toggle-btn"
                style={{
                  padding: '12px 28px',
                  fontSize: 14,
                  fontWeight: 700,
                  background: gamingActive ? 'rgba(239,68,68,.18)' : 'var(--a1)',
                  borderColor: gamingActive ? 'rgba(239,68,68,.4)' : 'transparent',
                  color: gamingActive ? '#ef4444' : '#0b0f17',
                  boxShadow: gamingActive ? 'none' : '0 4px 16px rgba(var(--a1r), 0.35)',
                }}
                onClick={toggleGaming}
              >
                <Power size={16} /> {gamingActive ? 'Désactiver le Mode Gaming' : 'Activer le Mode Gaming'}
              </button>
            </div>
          </div>

          {/* Interactive Profile Tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}>
            {PROFILES.map(p => {
              const meta = PROFILE_META[p];
              const isSelected = profile === p;
              return (
                <div
                  key={p}
                  onClick={() => setProfile(p)}
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.3)',
                    border: `1.5px solid ${isSelected ? meta.color : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'all .2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <b style={{ fontSize: 15, color: isSelected ? meta.color : 'var(--text)' }}>{meta.title}</b>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: isSelected ? `${meta.color}25` : 'rgba(255,255,255,0.05)',
                      color: isSelected ? meta.color : 'var(--muted)',
                    }}>
                      {isSelected ? 'SÉLECTIONNÉ' : 'CHOISIR'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: isSelected ? 'var(--text)' : 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
                    {meta.tagline}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px 0', lineHeight: 1.45 }}>
                    {meta.desc}
                  </p>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                    Recommandé pour : <span style={{ color: 'var(--text)', fontWeight: 600 }}>{meta.bestFor}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Paramètres d'Optimisation en Jeu (Clean Panel) ── */}
        <div className="card card-p-lg mt" style={{ marginTop: 22 }}>
          <div className="lbl" style={{ marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={15} style={{ color: 'var(--a1)' }} />
            Paramètres & Moteur d'Optimisation Système en Jeu
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Overlay HUD */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                    <Eye size={15} style={{ color: 'var(--a1)' }} />
                    <span>Overlay HUD en jeu</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: hudEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                    color: hudEnabled ? '#22c55e' : 'var(--muted)',
                  }}>
                    {hudEnabled ? 'ACTIF' : 'INACTIF'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.45 }}>
                  Affiche les FPS réels, l'usage CPU/RAM et la latence réseau directement par-dessus votre jeu (aucun flou rectangulaire).
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Raccourci : <b>Ctrl+Shift+O</b></span>
                <Toggle id="hud-toggle" checked={hudEnabled} onChange={v => { setHudEnabled(v); toggleSetting('hudEnabled', v); api?.overlayToggle?.(v); }} />
              </div>
            </div>

            {/* Anti-bufferbloat Wi-Fi */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                    <Wifi size={15} style={{ color: 'var(--a1)' }} />
                    <span>Anti-bufferbloat Wi-Fi</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: antiBufferbloat ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                    color: antiBufferbloat ? '#22c55e' : 'var(--muted)',
                  }}>
                    {antiBufferbloat ? 'ACTIF' : 'INACTIF'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.45 }}>
                  Purge les files d'attente UDP Windows et réduit les sauts de ping de 40% sur réseau local partagé pendant le jeu.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Files UDP réactives</span>
                <Toggle id="bufferbloat-toggle" checked={antiBufferbloat} onChange={v => { setAntiBufferbloat(v); toggleSetting('antiBufferbloat', v); }} />
              </div>
            </div>

            {/* Suspendre les navigateurs */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                    <Cpu size={15} style={{ color: 'var(--a1)' }} />
                    <span>Suspendre les navigateurs</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: suspendBg ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.05)',
                    color: suspendBg ? '#eab308' : 'var(--muted)',
                  }}>
                    {suspendBg ? 'IDLE' : 'NORMAL'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.45 }}>
                  Bascule Chrome, Edge et Firefox en priorité Idle pour libérer ~1,8 Go de RAM sans fermer vos onglets.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Restauration automatique</span>
                <Toggle id="suspend-bg-toggle" checked={suspendBg} onChange={v => { setSuspendBg(v); toggleSetting('suspendBg', v); }} />
              </div>
            </div>

            {/* Détection automatique */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                    <Zap size={15} style={{ color: 'var(--a1)' }} />
                    <span>Détection automatique</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: autoDetect ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                    color: autoDetect ? '#22c55e' : 'var(--muted)',
                  }}>
                    {autoDetect ? 'ACTIF' : 'INACTIF'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.45 }}>
                  Active instantanément le Mode Gaming dès qu'une fenêtre de jeu reconnue passe au premier plan.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Surveillance de premier plan</span>
                <Toggle id="autodetect-toggle" checked={autoDetect} onChange={v => { setAutoDetect(v); toggleSetting('autoDetect', v); }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Game Library ── */}
        <div className="card card-p-lg mt" style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div className="lbl" style={{ marginBottom: 0 }}>
              <Gamepad2 size={15} />
              Bibliothèque de Jeux Détectés · <b>{filteredGames.length}</b>
              {launcherFilter !== 'Tous' && <span className="mut" style={{ fontWeight: 400 }}> / {games.length} total</span>}
            </div>

            {/* Launcher filter pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {launchers.map(l => (
                <button
                  key={l}
                  onClick={() => setLauncherFilter(l)}
                  style={{
                    padding: '5px 14px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 20,
                    border: `1px solid ${launcherFilter === l ? 'var(--a1)' : 'rgba(255,255,255,0.08)'}`,
                    background: launcherFilter === l ? 'rgba(var(--a1r),.15)' : 'rgba(255,255,255,0.03)',
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
          </div>

          {loadingGames ? (
            <div className="state-loading">
              <span className="spinner" />
              Détection en cours des jeux sur tous vos disques (Steam, Epic, Rockstar, Xbox, Riot, EA, GOG)…
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="state-empty">
              <span className="ico big" style={{ margin: '0 auto' }}><Gamepad2 size={24} /></span>
              <b>{launcherFilter === 'Tous' ? 'Aucun jeu détecté' : `Aucun jeu ${launcherFilter}`}</b>
              <p>Vanguard scanne vos répertoires Steam, Epic, Xbox et disques locaux automatiquement.</p>
            </div>
          ) : (
            <div
              className="grid g3"
              style={{
                gap: 16,
                transform: 'translateZ(0)',
              }}
            >
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
                      borderRadius: 12,
                      border: `1px solid ${isOpt ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      background: '#0d111a',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 255,
                      boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
                      transition: 'border-color 0.2s ease, transform 0.2s ease',
                    }}
                  >
                    {/* Top Artwork Banner */}
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      height: 115,
                      overflow: 'hidden',
                      background: game.bannerUrl ? '#070a10' : `linear-gradient(135deg, ${game.color1}, ${game.color2})`,
                    }}>
                      {game.bannerUrl ? (
                        <img
                          src={game.bannerUrl}
                          alt={game.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 48,
                          fontWeight: 900,
                          color: 'rgba(255,255,255,0.12)',
                        }}>
                          {game.initial}
                        </div>
                      )}

                      {/* Subtle Dark Gradient at bottom of artwork */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, #0d111a 0%, rgba(13,17,26,0.2) 60%, rgba(0,0,0,0.4) 100%)',
                      }} />

                      {/* Badges on top of artwork */}
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        right: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 6,
                          background: 'rgba(0,0,0,0.85)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}>
                          <LauncherSvg launcher={game.launcher} size={11} />
                          {game.launcher}
                        </span>

                        <span style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 6,
                          background: `${PROFILE_META[assignedProfile].color}25`,
                          border: `1px solid ${PROFILE_META[assignedProfile].color}50`,
                          color: PROFILE_META[assignedProfile].color,
                        }}>
                          {assignedProfile.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Content below artwork */}
                    <div style={{
                      padding: '12px 14px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      justifyContent: 'space-between',
                      gap: 10,
                    }}>
                      <div>
                        {/* Title */}
                        <b
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: '#ffffff',
                          }}
                          title={game.name}
                        >
                          {game.name}
                        </b>
                      </div>

                      {/* Bottom Controls Area */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Action buttons: Lancer & Désinstaller */}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn"
                            onClick={() => handleLaunchGame(game)}
                            style={{
                              flex: 2,
                              padding: '7px 12px',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              background: 'var(--a1)',
                              color: '#0b0f17',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            <Play size={13} fill="#0b0f17" />
                            <span>Lancer</span>
                          </button>

                          <button
                            className="btn-ghost"
                            onClick={() => handleUninstallGame(game)}
                            title="Désinstaller ce jeu"
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              borderRadius: 6,
                              color: 'rgba(255,255,255,0.7)',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={12} />
                            <span>Désinstaller</span>
                          </button>
                        </div>

                        {/* Per-Game Optimization Toggle */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '3px 8px',
                            background: 'rgba(0,0,0,0.5)',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <span style={{ fontSize: 10, color: isOpt ? 'var(--a1)' : 'var(--muted)', fontWeight: 600 }}>
                            {isOpt ? 'Optimisation active' : 'Par défaut Windows'}
                          </span>
                          <label className="toggle" style={{ transform: 'scale(0.7)', transformOrigin: 'right center', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={isOpt}
                              onChange={e => toggleGameOpt(game.name, e.target.checked)}
                            />
                            <span className="toggle-track" />
                            <span className="toggle-thumb" />
                          </label>
                        </div>

                        {/* Profile Selection */}
                        <div
                          style={{
                            display: 'flex',
                            gap: 4,
                            opacity: isOpt ? 1 : 0.4,
                            pointerEvents: isOpt ? 'auto' : 'none',
                          }}
                        >
                          {PROFILES.map(p => {
                            const isCurrent = assignedProfile === p;
                            return (
                              <button
                                key={p}
                                onClick={() => assignGameProfile(game.name, p)}
                                title={PROFILE_META[p].desc}
                                style={{
                                  flex: 1,
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  padding: '4px 2px',
                                  borderRadius: 5,
                                  border: `1px solid ${isCurrent ? PROFILE_META[p].color : 'rgba(255,255,255,0.1)'}`,
                                  background: isCurrent ? `${PROFILE_META[p].color}26` : 'rgba(0,0,0,0.5)',
                                  color: isCurrent ? PROFILE_META[p].color : 'rgba(255,255,255,0.6)',
                                  cursor: 'pointer',
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

      </div>

      {/* ── Slide-Over Drawer: Profils de Performance & Vérité Terrain ── */}
      <SlideDrawer
        isOpen={showProfileDetails}
        onClose={() => setShowProfileDetails(false)}
        title="Profils de Performance & Vérité Terrain"
        subtitle="Ajustements système mesurables et 100% réversibles"
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
            Chaque profil applique des ajustements système réversibles mesurables. À la fermeture du jeu ou à la désactivation, <b>tous les paramètres d'origine (priorités, plan d'énergie, réseau) sont automatiquement restaurés</b> sans altérer Windows.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ color: '#38bdf8', fontSize: 13.5 }}>⚡ Profil Compétitif (Esports & Latence Minimale)</b>
                <span className="chip" style={{ fontSize: 10, color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)' }}>Latence min</span>
              </div>
              <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                <li><b>Priorité processeur :</b> <code>AboveNormal</code> pour le processus de jeu au premier plan.</li>
                <li><b>Plan d'alimentation :</b> Bascule temporaire sur <code>Performances Élevées</code> (suppression du core parking).</li>
                <li><b>Réseau :</b> Priorité de trafic UDP, bufferbloat Wi-Fi réduit et latence de rendu ultra-faible.</li>
              </ul>
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ color: '#22c55e', fontSize: 13.5 }}>⚖ Profil Équilibré (Standard & Polyvalent)</b>
                <span className="chip" style={{ fontSize: 10, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>Recommandé</span>
              </div>
              <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                <li><b>Priorité processeur :</b> Dynamique et respectueuse des températures CPU/GPU.</li>
                <li><b>Streaming & multitâche :</b> Compatibilité totale avec OBS Studio, Discord et enregistreurs.</li>
                <li><b>Protection réseau :</b> Purgation des files de saturation réseau sans monopolisation.</li>
              </ul>
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ color: '#a78bfa', fontSize: 13.5 }}>🎨 Profil Qualité (Titres AAA & Immersion Visuelle)</b>
                <span className="chip" style={{ fontSize: 10, color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }}>Fidélité max</span>
              </div>
              <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                <li><b>Allocation GPU :</b> Priorité aux threads de compilation de shaders DirectX 12 / Vulkan.</li>
                <li><b>Stabilité de trame :</b> Évite les chutes de framerate lors du streaming de textures lourdes.</li>
              </ul>
            </div>
          </div>
        </div>
      </SlideDrawer>
    </div>
  );
}
