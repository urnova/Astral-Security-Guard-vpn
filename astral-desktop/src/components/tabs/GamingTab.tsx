import { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Power, Monitor, Wifi, Cpu, Eye, Zap, SlidersHorizontal,
  Clock, ExternalLink, Info, X, ShieldCheck, Play, Trash2, HelpCircle, Check, Sparkles
} from 'lucide-react';

const api = (window as any).vanguard;

/* ─────────────── Types ─────────────── */
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

/** Proposition de détection automatique en attente de confirmation */
interface DetectionProposal {
  pid:        number;
  name:       string;
  startTime?: string;
}

/** Statut PresentMon visible dans l'onglet principal */
type PresentMonTabStatus =
  | 'unavailable'
  | 'idle'
  | 'capturing'
  | 'blocked';

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
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.64 14.17c-1.35-.5-2.55-1.38-3.45-2.52l2.21-3.02c.28.73.73 1.39 1.33 1.89l-.09 3.65zm1.64.58c-.22 0-.43-.01-.64-.04l.04-3.71h1.19l.04 3.71c-.21.03-.42.04-.63.04zm1.64-.58l-.09-3.65c.61-.5 1.06-1.17 1.33-1.89l2.21 3.02c-.9 1.14-2.1 2.02-3.45 2.52zM6.15 7.68C7.4 6.35 9.1 5.5 11 5.27v2.5c-1.35.21-2.57.86-3.52 1.83L6.15 7.68zM11 16.56V14h2v2.56c-.33.03-.66.05-1 .05s-.67-.02-1-.05zm2-9.29V5c1.9.23 3.6 1.08 4.85 2.41l-1.33 1.92C15.57 8.36 14.35 7.71 13 7.27z" />
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

/* ─────────────── Toggle ─────────────── */
function Toggle({ checked, onChange, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean }) {
  return (
    <label className="toggle" htmlFor={id} style={disabled ? { opacity: 0.4, pointerEvents: 'none', cursor: 'not-allowed' } : {}}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

/* ─────────────── Props ─────────────── */
export interface GamingTabProps {
  gamingActive?:   boolean;
  currentGame?:    string | null;
  onGamingToggle?: (val: boolean) => void;
}

/* ═══════════════════════════════════════
   GamingTab
═══════════════════════════════════════ */
export default function GamingTab({
  gamingActive: propGamingActive,
  currentGame:  propCurrentGame,
  onGamingToggle,
}: GamingTabProps = {}) {

  /* ── State ── */
  const [gamingActive, setGamingActive]   = useState(propGamingActive ?? false);
  const [hudEnabled, setHudEnabled]       = useState(false);
  const [suspendBg, setSuspendBg]         = useState(false);
  const [autoDetect, setAutoDetect]       = useState(false);
  const [games, setGames]                 = useState<Game[]>([]);
  const [loadingGames, setLoadingGames]   = useState(true);
  const [currentGame, setCurrentGame]     = useState<string | null>(propCurrentGame ?? null);
  const [notice, setNotice]               = useState('');
  const [noticeType, setNoticeType]       = useState<'info' | 'success' | 'error'>('info');
  const [launcherFilter, setLauncherFilter] = useState<string>('Tous');
  const [sessionSec, setSessionSec]       = useState(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Détection auto ── */
  const [detectionProposal, setDetectionProposal] = useState<DetectionProposal | null>(null);

  /* ── PresentMon status dans l'onglet ── */
  const [pmStatus, setPmStatus] = useState<PresentMonTabStatus>('unavailable');
  const [pmGame, setPmGame]     = useState<string | null>(null);
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
        setSuspendBg(Boolean(res.settings.suspendBg));
        setAutoDetect(Boolean(res.settings.autoDetect));
      }
    }).catch(() => {});

    loadGames();

    /* PresentMon status initial */
    api.getPresentMonStatus?.().then((res: any) => {
      syncPmStatus(res);
    }).catch(() => {});

    /* IPC events */
    const c1 = api.on?.('gaming:game-started', (d: any) => {
      setCurrentGame(d?.gameName || null);
      setGamingActive(true);
    });
    const c2 = api.on?.('gaming:game-stopped', () => {
      setCurrentGame(null);
    });

    api.hudGetState?.().then((res: any) => {
      if (typeof res?.active === 'boolean') setHudEnabled(res.active);
      else if (typeof res === 'boolean') setHudEnabled(res);
    }).catch(() => {});

    const c3 = api.on?.('hud:state-changed', (d: any) => {
      if (typeof d?.active === 'boolean') setHudEnabled(d.active);
      else if (typeof d?.enabled === 'boolean') setHudEnabled(d.enabled);
      else if (typeof d?.visible === 'boolean') setHudEnabled(d.visible);
    });

    /* Écoute les propositions de détection automatique */
    const c4 = api.on?.('gaming-event', (d: any) => {
      if (d?.type === 'detection-proposal' && d?.pid && d?.name) {
        // Remplacer toute proposition précédente par la nouvelle cible.
        // Une ancienne proposition ne doit jamais persister pour un nouveau processus.
        setDetectionProposal(prev => {
          // Si même PID : ne pas ré-afficher la bannière (évite le spam)
          if (prev?.pid === d.pid) return prev;
          // Nouvelle cible : remplacer
          return { pid: d.pid, name: d.name };
        });
      }
      /* Mise à jour du statut PresentMon via gaming-event si disponible */
      if (d?.type === 'presentmon-status') {
        syncPmStatus(d);
      }
      /* Nettoyage si le processus proposé a disparu */
      if (d?.type === 'mode-changed' && d?.state === 'finished') {
        setDetectionProposal(null);
      }
    });

    const autoRescanInterval = setInterval(() => {
      loadGames(false);
    }, 10 * 60 * 1000);

    return () => { c1?.(); c2?.(); c3?.(); c4?.(); clearInterval(autoRescanInterval); };
  }, []);

  /** Synchronise l'état PresentMon local depuis une réponse IPC ou un event */
  const syncPmStatus = (res: any) => {
    if (!res) return;
    const status: string = res.status ?? res.currentStatus ?? '';
    if (status === 'Indisponible' || !res.isAvailable) {
      setPmStatus('unavailable');
      setPmGame(null);
    } else if (status === 'Capture en cours') {
      setPmStatus('capturing');
      setPmGame(res.gameProcessName ?? null);
    } else if (status.includes('bloqué') || status.includes('refusé')) {
      setPmStatus('blocked');
      setPmGame(null);
    } else {
      setPmStatus('idle');
      setPmGame(null);
    }
  };

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
          profile:   '',   /* B10 : pas de badge OPTIMISÉ par défaut */
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
      const res: any = await api?.setGamingMode?.({ enabled: next });
      if (next) {
        // set-mode marque le flag interne et envoie une notification.
        // Les optimisations réelles (priorité processus, plan d'alimentation) sont appliquées
        // uniquement lorsqu'un PID de jeu est fourni via confirm-detection ou launch-game.
        // Sans PID identifié, aucune modification système n'est encore effective.
        flash(
          'Mode activé. Les réglages (priorité + plan d\'alimentation) s\'appliqueront au lancement d\'une application identifiée.',
          'info'
        );
      } else {
        flash(
          res?.success
            ? 'Désactivé — restauration demandée au backend (priorité et plan d\'alimentation).'
            : 'Désactivation enregistrée. Vérifiez les journaux si la restauration échoue.',
          'info'
        );
      }
    } catch (e: any) { flash(e.message, 'error'); }
  };

  const toggleSetting = async (key: string, val: boolean) => {
    try {
      await api?.setGamingSetting?.({ key, value: val });
      if (key === 'suspendBg') {
        const res: any = await api?.suspendBrowsers?.(val);
        if (val) {
          flash('Priorité CPU des navigateurs réduite (priorité Idle).', 'success');
        } else {
          const partialNote = (res?.failed ?? 0) > 0
            ? ` (${res.failed} processus non restauré(s)).`
            : '';
          flash(`Navigateurs restaurés à leur priorité initiale.${partialNote}`, 'success');
        }
      }
    } catch {}
  };

  /* ── Détection auto : confirmer / rejeter ── */
  const confirmDetection = async () => {
    if (!detectionProposal) return;
    try {
      await api?.confirmDetection?.(detectionProposal);
      setGamingActive(true);
      flash(`Optimisations activées pour ${detectionProposal.name}.`, 'success');
    } catch (e: any) {
      flash(`Échec activation : ${e.message}`, 'error');
    } finally {
      setDetectionProposal(null);
    }
  };

  const rejectDetection = async () => {
    try {
      await api?.rejectDetection?.();
    } catch {}
    setDetectionProposal(null);
  };

  /* ── Game actions ── */
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

  /* ── PresentMon status label ── */
  const pmLabel = (): string => {
    switch (pmStatus) {
      case 'unavailable': return 'PresentMon : Indisponible';
      case 'capturing':   return `PresentMon : Capture en cours${pmGame ? ` — ${pmGame}` : ''}`;
      case 'blocked':     return 'PresentMon : Bloqué (anti-cheat)';
      default:            return 'PresentMon : Installé — en attente d\'une cible';
    }
  };
  const pmColor = (): string => {
    switch (pmStatus) {
      case 'capturing': return '#22c55e';
      case 'blocked':   return '#ef4444';
      case 'idle':      return 'var(--a1)';
      default:          return 'var(--muted)';
    }
  };

  /* ══════════════════════════════════════
     Render
  ══════════════════════════════════════ */
  return (
    <div className="page-scroll">
      <div className="page">

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <h1>Optimisation des ressources</h1>
            <p className="sub">Optimisation des ressources système. Profil réversible sur demande.</p>
          </div>
          <span className={`chip${gamingActive ? '' : ' idle'}`}>
            <span className="dot" />
            {gamingActive
              ? currentGame ? `▶ ${currentGame}` : 'ACTIF'
              : 'EN ATTENTE'}
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
            {noticeType === 'success' ? '✓' : noticeType === 'error' ? '✕' : 'ℹ'} {notice}
          </div>
        )}

        {/* ── Bannière proposition de détection ── */}
        {detectionProposal && (
          <div style={{
            marginBottom: 16,
            padding: '12px 18px',
            background: 'rgba(var(--a1r),.1)',
            border: '1px solid rgba(var(--a1r),.35)',
            borderRadius: 'var(--r-sm)',
            display: 'flex', gap: 14, alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: 13,
          }}>
            <span style={{ flex: 1, fontWeight: 500 }}>
              Application détectée : <b>{detectionProposal.name}</b>. Activer les optimisations ?
            </span>
            <button
              className="btn"
              style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700 }}
              onClick={confirmDetection}
            >
              Activer les optimisations
            </button>
            <button
              className="btn-ghost"
              style={{ padding: '7px 14px', fontSize: 12 }}
              onClick={rejectDetection}
            >
              Ignorer
            </button>
          </div>
        )}

        {/* ── Bloc principal : OPTIMISATION SYSTÈME ── */}
        <div className="card card-p-lg" style={{
          background: 'linear-gradient(135deg, rgba(20,27,45,0.7) 0%, rgba(11,15,23,0.95) 100%)',
          border: '1px solid rgba(var(--a1r), 0.25)',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

            {/* Zone gauche ~55% : état + contrôle */}
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span style={{
                  display: 'inline-flex', padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(var(--a1r), 0.12)', border: '1px solid var(--a1)',
                  color: 'var(--a1)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                  marginBottom: 10,
                }}>
                  OPTIMISATION SYSTÈME
                </span>
                <h2 style={{ fontSize: 20, margin: '0 0 8px', fontWeight: 700 }}>
                  {gamingActive ? 'Optimisations actives' : 'Optimisations inactives'}
                </h2>

                {/* Ce qui sera appliqué */}
                <ul style={{ margin: '0 0 10px 0', padding: '0 0 0 18px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
                  <li>Priorité processus : <b>AboveNormal</b> (restaurée à la désactivation)</li>
                  <li>Plan d'alimentation : <b>Haute Performance</b> (GUID restauré automatiquement)</li>
                </ul>

                {gamingActive && currentGame && (
                  <div style={{
                    fontSize: 12, color: 'var(--a1)', fontWeight: 600,
                    padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(var(--a1r),.08)', border: '1px solid rgba(var(--a1r),.2)',
                    marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                    <Clock size={13} /> Application : {currentGame}
                  </div>
                )}

                {gamingActive && (
                  <div style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Clock size={12} /> Session : <b>{fmtDuration(sessionSec)}</b>
                  </div>
                )}

                <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0', fontStyle: 'italic' }}>
                  Requiert un processus identifié. Aucun gain garanti.
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
                  Restauration automatique du plan et de la priorité à la désactivation.
                </p>
              </div>

              <button
                className="btn"
                id="gaming-toggle-btn"
                style={{
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  background: gamingActive ? 'rgba(239,68,68,.18)' : 'var(--a1)',
                  borderColor: gamingActive ? 'rgba(239,68,68,.4)' : 'transparent',
                  color: gamingActive ? '#ef4444' : '#0b0f17',
                  boxShadow: gamingActive ? 'none' : '0 4px 16px rgba(var(--a1r), 0.35)',
                  alignSelf: 'flex-start',
                }}
                onClick={toggleGaming}
              >
                <Power size={16} /> {gamingActive ? 'Désactiver + restaurer' : 'Activer les optimisations'}
              </button>
            </div>

            {/* Zone droite ~45% : grille 2×2 outils */}
            <div style={{ flex: '1 1 280px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

              {/* HUD Overlay */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12 }}>
                    <Eye size={13} style={{ color: 'var(--a1)' }} />
                    <span>HUD Overlay</span>
                  </div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                    background: hudEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                    color: hudEnabled ? '#22c55e' : 'var(--muted)',
                  }}>{hudEnabled ? 'ACTIF' : 'INACTIF'}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                  FPS, CPU/RAM en superposition. PresentMon requis.
                </p>
                {/* Statut PresentMon sous le toggle HUD */}
                <div style={{ fontSize: 10.5, color: pmColor(), fontWeight: 500 }}>
                  {pmLabel()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Ctrl+Shift+O</span>
                  <Toggle id="hud-toggle" checked={hudEnabled} onChange={async () => {
                    const res: any = await api?.hudToggle?.();
                    if (typeof res?.active === 'boolean') setHudEnabled(res.active);
                  }} />
                </div>
              </div>

              {/* Priorité navigateurs */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12 }}>
                    <Cpu size={13} style={{ color: 'var(--a1)' }} />
                    <span>Priorité navigateurs</span>
                  </div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                    background: suspendBg ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.05)',
                    color: suspendBg ? '#eab308' : 'var(--muted)',
                  }}>{suspendBg ? 'IDLE' : 'NORMAL'}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                  Réduit CPU (priorité Idle). Navigateurs restent ouverts. Restauration à la désactivation.
                </p>
                <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
                  Pas de mémoire libérée garantie.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Chrome, Edge, Firefox</span>
                  <Toggle id="suspend-bg-toggle" checked={suspendBg} onChange={v => { setSuspendBg(v); toggleSetting('suspendBg', v); }} />
                </div>
              </div>

              {/* Anti-bufferbloat — NON IMPLÉMENTÉ */}
              <div style={{
                background: 'rgba(255,255,255,0.015)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
                opacity: 0.6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12 }}>
                    <Wifi size={13} style={{ color: 'var(--muted)' }} />
                    <span style={{ color: 'var(--muted)' }}>Anti-bufferbloat</span>
                  </div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)', color: 'var(--muted)',
                  }}>NON IMPLÉMENTÉ</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                  Aucune modification réseau appliquée dans cette version.
                </p>
                <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0, fontStyle: 'italic' }}>
                  La réduction de latence sous charge sera étudiée dans la section Réseau.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Indisponible</span>
                  {/* Toggle désactivé intentionnellement */}
                  <Toggle id="bufferbloat-toggle" checked={false} onChange={() => {}} disabled={true} />
                </div>
              </div>

              {/* Détection automatique */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12 }}>
                    <Zap size={13} style={{ color: 'var(--a1)' }} />
                    <span>Détection auto</span>
                  </div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                    background: autoDetect ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                    color: autoDetect ? '#22c55e' : 'var(--muted)',
                  }}>{autoDetect ? 'ACTIF' : 'INACTIF'}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                  Surveille la fenêtre active (toutes les 8 s). Propose l'activation — aucune activation sans votre confirmation.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Scan toutes les 8 s</span>
                  <Toggle id="autodetect-toggle" checked={autoDetect} onChange={v => { setAutoDetect(v); toggleSetting('autoDetect', v); }} />
                </div>
              </div>

            </div>
          </div>

          {/* Limites de la pré-release */}
          <div style={{
            marginTop: 18,
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            fontSize: 11.5,
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}>
            <b style={{ color: 'var(--text)' }}>Limites pré-release v0.1.6 :</b> La maintenance programmée
            nécessite que Vanguard Core soit actif en arrière-plan. Les optimisations s'appliquent à un
            processus identifié — aucun gain n'est garanti. Cette fonctionnalité fonctionne uniquement
            lorsque l'application est en cours d'exécution.
          </div>
        </div>

        {/* ── Bibliothèque de jeux ── */}
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
              {filteredGames.map(game => (
                <div
                  key={`${game.launcher}::${game.name}`}
                  className="game-card"
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
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
                    height: 135,
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

                    {/* Gradient */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(13,17,26,0.95) 0%, rgba(13,17,26,0.15) 50%, rgba(0,0,0,0.3) 100%)',
                    }} />

                    {/* Launcher Badge only */}
                    <div style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.8)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#ffffff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}>
                        <LauncherSvg launcher={game.launcher} size={11} />
                        {game.launcher}
                      </span>
                    </div>
                  </div>

                  {/* Content below artwork */}
                  <div style={{
                    padding: '14px 16px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    justifyContent: 'space-between',
                    gap: 10,
                  }}>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Action buttons : Lancer & Désinstaller */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn"
                          onClick={() => handleLaunchGame(game)}
                          style={{
                            flex: 2,
                            padding: '8px 14px',
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
                            border: 'none',
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
                            padding: '8px 10px',
                            fontSize: 11,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            borderRadius: 6,
                            color: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                          <span>Désinstaller</span>
                        </button>
                      </div>

                      {/* Mention honnête du périmètre P3 */}
                      <div style={{
                        padding: '6px 8px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: 10.5,
                        color: 'var(--muted)',
                        textAlign: 'center',
                        lineHeight: 1.35,
                      }}>
                        Lancement standard sans modification système. Si la détection automatique est activée, l'optimisation vous sera proposée.
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
