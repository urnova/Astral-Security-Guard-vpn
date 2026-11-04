import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Cpu, HardDrive, Wifi, Search, Zap,
  Lock, ArrowUpRight, Clock, CheckCircle2, AlertTriangle,
  Sparkles, RefreshCw, Activity, HelpCircle
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface SparklineProps { data: number[]; color?: string; }
function Sparkline({ data, color = 'var(--a1)' }: SparklineProps) {
  if (!data.length) return null;
  const h = 46, w = 200;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [
    Math.round((i / (data.length - 1)) * w),
    Math.round(h - (v / max) * (h - 4) - 2)
  ]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]} ${h} L0 ${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".5" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="a" d={area} fill="url(#sg)" />
      <path className="l" d={line} stroke={color} />
    </svg>
  );
}

export type BriefSourceType = 'generated' | 'deterministic' | 'cached' | 'unavailable';

export interface ObservationDimension {
  status: 'ok' | 'warning' | 'alert' | 'unknown';
  label: string;
  detail: string;
}

export interface BriefObservations {
  protection: ObservationDimension;
  storage:    ObservationDimension;
  workload:   ObservationDimension;
  network:    ObservationDimension;
}

export interface ContextualAction {
  id: string;
  label: string;
  tabTarget: string;
}

export interface DailyBrief {
  source: BriefSourceType;
  providerName?: string;
  modelName?: string;
  headline: string;
  summary: string;
  observations: BriefObservations;
  suggestedActions: ContextualAction[];
  generatedAt: number;
  cachedUntil?: number;
  errorMessage?: string;
  rateLimitRemaining?: number;
  quotaRetryAfterSec?: number;
}

interface Props {
  gamingActive: boolean;
  currentGame:  string | null;
  onTabChange:  (id: string) => void;
  firstName:    string;
}

export default function Dashboard({ gamingActive, currentGame, onTabChange, firstName }: Props) {
  const { metrics, securityStatus } = useSystem();
  const [cpuHist, setCpuHist]   = useState<number[]>([]);
  const [ramHist, setRamHist]   = useState<number[]>([]);
  const [pingHist, setPingHist] = useState<number[]>([]);
  const [ping, setPing]         = useState<number>(18);
  const [events, setEvents]     = useState<{ title: string; desc: string; tag: string; when: string }[]>([]);
  const [brief, setBrief]       = useState<DailyBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnNode, setVpnNode]           = useState('');

  // VPN status listener
  useEffect(() => {
    if (!api) return;
    api.vpnGetStatus?.().then((s: any) => {
      if (s?.status?.connected || s?.connected || s?.state === 'connected') {
        setVpnConnected(true);
        setVpnNode(s.serverName || s.status?.serverName || s.activeServer?.country || '');
      } else {
        setVpnConnected(false);
        setVpnNode('');
      }
    }).catch(() => {});

    const c1 = api.on?.('vpn:connected', (d: any) => {
      setVpnConnected(true);
      if (d?.serverName) setVpnNode(d.serverName);
    });
    const c2 = api.on?.('vpn:disconnected', () => {
      setVpnConnected(false);
      setVpnNode('');
    });
    return () => { c1?.(); c2?.(); };
  }, []);

  // Sparklines
  useEffect(() => {
    if (!metrics) return;
    const ramPct = (metrics.ramPercent !== undefined && metrics.ramPercent > 0)
      ? metrics.ramPercent
      : (metrics.ramTotal > 0 ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0);
    setCpuHist(h => [...h.slice(-19), Math.round(metrics.cpuPercent || 0)]);
    setRamHist(h => [...h.slice(-19), Math.round(ramPct || 0)]);
  }, [metrics]);

  // Ping sparkline update
  useEffect(() => {
    if (ping > 0) {
      setPingHist(h => [...h.slice(-19), ping]);
    }
  }, [ping]);

  // Load Daily AI Brief (sans polling génératif permanent)
  const refreshBrief = useCallback(async (force: boolean = false) => {
    if (!api || loadingBrief) return;
    setLoadingBrief(true);
    try {
      const res = await api.getDailyBrief?.(force);
      if (res?.success && res.brief) {
        setBrief(res.brief);
        setLastRefreshedAt(Date.now());
      }
    } catch (err: any) {
      console.warn('[Dashboard] Échec chargement brief :', err?.message);
    } finally {
      setLoadingBrief(false);
    }
  }, [loadingBrief]);

  // Cooldown timer pour le bouton de rafraîchissement manuel (60s)
  useEffect(() => {
    if (lastRefreshedAt === 0) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastRefreshedAt) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setCooldownRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastRefreshedAt]);

  useEffect(() => {
    // Chargement initial unique au montage (utilise le cache si disponible)
    refreshBrief(false);

    // Live ping polling léger toutes les 5s pour la latence réseau
    const checkPing = () => {
      api?.getPing?.().then((res: any) => {
        if (res?.ping && res.ping > 0) setPing(res.ping);
      }).catch(() => {});
    };
    checkPing();
    const pingTimer = setInterval(checkPing, 5000);

    const cleanupPing = api?.on?.('doctor:ping-update', (d: any) => {
      if (d?.ping && d.ping > 0) setPing(d.ping);
    });

    // Chargement des événements récents réels (historique des téléchargements et des analyses)
    const loadRecentEvents = async () => {
      try {
        const scRes = await api?.getScannerHistory?.();
        const items = scRes?.history || [];
        if (Array.isArray(items) && items.length > 0) {
          const mapped = items.slice(0, 5).map((it: any) => ({
            title: it.fileName || 'Analyse de fichier',
            desc: it.verdict === 'clean' ? 'Fichier sain vérifié' : `Menace neutralisée (${it.threatName || 'Suspect'})`,
            tag: it.verdict === 'clean' ? 'Sain' : 'Alerte',
            when: it.timestamp ? new Date(it.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Récemment',
          }));
          setEvents(mapped);
        } else {
          setEvents([]);
        }
      } catch {
        setEvents([]);
      }
    };
    loadRecentEvents();

    return () => {
      clearInterval(pingTimer);
      cleanupPing?.();
    };
  }, []);

  // Compute live metrics
  const cpu = Math.round(metrics?.cpuPercent ?? 0);
  const ram = (metrics?.ramPercent !== undefined && metrics.ramPercent > 0)
    ? Math.round(metrics.ramPercent)
    : (metrics?.ramTotal && metrics.ramTotal > 0 ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0);

  const diskTotalGB = (metrics.diskUsedGB || 0) + (metrics.diskFreeGB || 0);
  const diskPct = diskTotalGB > 0 ? Math.round((metrics.diskUsedGB / diskTotalGB) * 100) : 0;
  const diskFoot = diskTotalGB > 0
    ? `${metrics.diskFreeGB} Go libres / ${diskTotalGB} Go`
    : 'Disque système C:';

  const pingVal = ping > 0 ? ping : 18;

  const METRICS = [
    { icon: <Cpu size={14} />,      label: 'Processeur',    val: cpu,     unit: '%',  foot: `${metrics?.cpuCores || 8} cœurs logiques`,   hist: cpuHist },
    { icon: <Zap size={14} />,      label: 'Mémoire vive',  val: ram,     unit: '%',  foot: `${metrics?.ramTotal || 16} Go installés`,     hist: ramHist },
    { icon: <HardDrive size={14} />,label: 'Disque C:',     val: diskPct, unit: '%',  foot: diskFoot,                                      hist: [], isDisk: true },
    { icon: <Wifi size={14} />,     label: 'Latence réseau',val: pingVal, unit: ' ms',foot: 'Connexion active (1.1.1.1)',                 hist: pingHist },
  ];

  const QUICK = [
    { icon: <Shield size={18} />,   label: 'Sécurité & Analyses',  desc: 'Defender, YARA et exclusions',  tab: 'security' },
    { icon: <Zap size={18} />,      label: 'Maintenance Système',  desc: 'Nettoyage et démarrage',        tab: 'performance' },
    { icon: <Cpu size={18} />,      label: 'Performance & Matériel',desc: 'Surveillance et processeur',   tab: 'gaming' },
    { icon: <Lock size={18} />,     label: 'Astral VPN',           desc: 'Tunnels et relais vérifiés',    tab: 'vpn' },
  ];

  // Analyse des observations factuelles
  const obs = brief?.observations;
  const hasAlert = obs && (
    obs.protection?.status === 'alert' ||
    obs.storage?.status === 'alert' ||
    obs.workload?.status === 'alert'
  );
  const hasWarning = obs && (
    obs.protection?.status === 'warning' ||
    obs.storage?.status === 'warning' ||
    obs.workload?.status === 'warning'
  );
  const allOk = obs && (
    obs.protection?.status === 'ok' &&
    obs.storage?.status === 'ok' &&
    obs.workload?.status === 'ok'
  );

  const getSourceBadge = () => {
    switch (brief?.source) {
      case 'generated':
        return (
          <span className="chip" style={{ fontSize: 11, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 600 }}>
            <Sparkles size={12} style={{ marginRight: 4 }} />
            Brief IA · OVHcloud
          </span>
        );
      case 'cached':
        return (
          <span className="chip" style={{ fontSize: 11, background: 'rgba(147,197,253,0.12)', color: '#93c5fd', border: '1px solid rgba(147,197,253,0.3)', fontWeight: 600 }}>
            <Clock size={12} style={{ marginRight: 4 }} />
            En cache
          </span>
        );
      case 'unavailable':
        return (
          <span className="chip" style={{ fontSize: 11, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 600 }}>
            <AlertTriangle size={12} style={{ marginRight: 4 }} />
            Service IA indisponible
          </span>
        );
      case 'deterministic':
      default:
        return (
          <span className="chip" style={{ fontSize: 11, background: 'rgba(var(--a1r),0.12)', color: 'var(--a1)', border: '1px solid rgba(var(--a1r),0.3)', fontWeight: 600 }}>
            <Activity size={12} style={{ marginRight: 4 }} />
            Résumé local
          </span>
        );
    }
  };

  const getGlobalAssessmentBadge = () => {
    if (hasAlert) {
      return (
        <span className="chip" style={{ fontSize: 11.5, background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', fontWeight: 700 }}>
          <AlertTriangle size={13} style={{ marginRight: 4 }} />
          Problème confirmé
        </span>
      );
    }
    if (hasWarning) {
      return (
        <span className="chip" style={{ fontSize: 11.5, background: 'rgba(245,158,11,0.18)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', fontWeight: 700 }}>
          <AlertTriangle size={13} style={{ marginRight: 4 }} />
          Attention recommandée
        </span>
      );
    }
    if (allOk) {
      return (
        <span className="chip" style={{ fontSize: 11.5, background: 'rgba(104,184,148,0.12)', color: 'var(--ok)', border: '1px solid rgba(104,184,148,0.3)', fontWeight: 600 }}>
          <CheckCircle2 size={13} style={{ marginRight: 4 }} />
          Aucune anomalie détectée
        </span>
      );
    }
    return (
      <span className="chip" style={{ fontSize: 11.5, background: 'rgba(255,255,255,0.06)', color: 'var(--dim)', border: '1px solid var(--line)' }}>
        <HelpCircle size={13} style={{ marginRight: 4 }} />
        Vérification incomplète
      </span>
    );
  };

  const renderDimensionIcon = (status?: string) => {
    switch (status) {
      case 'alert':
        return <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />;
      case 'warning':
        return <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />;
      case 'ok':
        return <CheckCircle2 size={14} style={{ color: 'var(--ok)', flexShrink: 0 }} />;
      default:
        return <HelpCircle size={14} style={{ color: 'var(--dim)', flexShrink: 0 }} />;
    }
  };

  const formatGeneratedDate = (ts?: number) => {
    if (!ts) return 'À l\'instant';
    const d = new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header : Salutation sans phrase générique dessous */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1>{firstName ? `Bonjour, ${firstName}` : "Vue d'ensemble"}</h1>
          </div>
          {vpnConnected && (
            <span
              className="chip"
              onClick={() => onTabChange('vpn')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(74,222,128,0.12)',
                border: '1px solid rgba(74,222,128,0.3)',
                color: 'var(--ok)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <Lock size={12} />
              VPN Astral Connecté {vpnNode ? `· ${vpnNode}` : ''}
            </span>
          )}
        </div>

        {/* Master Card : Brief Quotidien Unifié au Premier Plan */}
        <div
          className="card card-p-lg"
          style={{
            marginBottom: 24,
            background: hasAlert
              ? 'linear-gradient(135deg, rgba(38,16,19,0.96) 0%, rgba(26,12,14,0.98) 100%)'
              : hasWarning
              ? 'linear-gradient(135deg, rgba(38,28,15,0.96) 0%, rgba(26,19,10,0.98) 100%)'
              : 'linear-gradient(135deg, rgba(20,24,33,0.95) 0%, rgba(15,18,25,0.98) 100%)',
            border: hasAlert
              ? '1px solid rgba(239, 68, 68, 0.45)'
              : hasWarning
              ? '1px solid rgba(245, 158, 11, 0.4)'
              : '1px solid rgba(var(--a1r), 0.22)',
            boxShadow: hasAlert
              ? '0 8px 30px rgba(239, 68, 68, 0.22)'
              : '0 8px 28px rgba(0,0,0,0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle accent corner glow */}
          <div
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: hasAlert
                ? 'radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(var(--a1r), 0.14) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* En-tête du Brief : Source & Diagnostic factuel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: hasAlert ? 'rgba(239, 68, 68, 0.2)' : 'rgba(var(--a1r), 0.15)',
                  border: hasAlert ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(var(--a1r), 0.3)',
                  display: 'grid',
                  placeItems: 'center',
                  color: hasAlert ? '#ef4444' : 'var(--a1)',
                }}
              >
                {hasAlert ? <AlertTriangle size={16} /> : <Sparkles size={16} />}
              </div>
              <div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: hasAlert ? '#fca5a5' : 'var(--text)', letterSpacing: '-0.01em' }}>
                  Brief Système du Jour
                </span>
                <span style={{ marginLeft: 10 }}>
                  {getSourceBadge()}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {getGlobalAssessmentBadge()}
            </div>
          </div>

          {/* Contenu du Brief : Headline & Résumé clair */}
          <div style={{ marginTop: 4 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: hasAlert ? '#ef4444' : hasWarning ? '#f59e0b' : '#f8fafc', marginBottom: 8, letterSpacing: '-0.01em' }}>
              {brief?.headline || 'Évaluation du système en cours…'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16, maxWidth: 900 }}>
              {brief?.summary || 'Vanguard rassemble les indicateurs de santé et de protection…'}
            </p>

            {/* 4 Indicateurs Dimensionnels Factuels en Direct */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 'var(--r-sm)',
                background: 'rgba(0,0,0,0.35)',
                border: hasAlert
                  ? '1px solid rgba(239,68,68,0.25)'
                  : '1px solid rgba(255,255,255,0.06)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                {renderDimensionIcon(obs?.protection?.status)}
                <div>
                  <span style={{ color: 'var(--dim)', display: 'block', fontSize: 10.5 }}>Protection</span>
                  <b>{obs?.protection?.detail || 'Microsoft Defender actif'}</b>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                {renderDimensionIcon(obs?.storage?.status)}
                <div>
                  <span style={{ color: 'var(--dim)', display: 'block', fontSize: 10.5 }}>Stockage C:</span>
                  <b>{obs?.storage?.detail || `${metrics.diskFreeGB || 0} Go libres sur ${diskTotalGB} Go`}</b>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                {renderDimensionIcon(obs?.workload?.status)}
                <div>
                  <span style={{ color: 'var(--dim)', display: 'block', fontSize: 10.5 }}>Charge & Mémoire</span>
                  <b>{obs?.workload?.detail || `RAM ${ram}% · CPU ${cpu}%`}</b>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                {renderDimensionIcon(obs?.network?.status)}
                <div>
                  <span style={{ color: 'var(--dim)', display: 'block', fontSize: 10.5 }}>Réseau</span>
                  <b>{obs?.network?.detail || `Ping ${pingVal} ms vers DNS Cloudflare`}</b>
                </div>
              </div>
            </div>

            {/* Pied de Carte : Horodatage, Actualisation & Actions Contextuelles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                  Généré à {formatGeneratedDate(brief?.generatedAt)}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => refreshBrief(true)}
                  disabled={loadingBrief || cooldownRemaining > 0}
                  style={{ fontSize: 11, padding: '3px 8px', height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  title={cooldownRemaining > 0 ? `Patientez ${cooldownRemaining}s avant d'actualiser (quota IP)` : 'Rafraîchir le brief'}
                >
                  <RefreshCw size={11} className={loadingBrief ? 'animate-spin' : ''} />
                  <span>{cooldownRemaining > 0 ? `Attente (${cooldownRemaining}s)` : 'Actualiser'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {brief?.suggestedActions && brief.suggestedActions.map((act) => (
                  <button
                    key={act.id}
                    className={`btn btn-sm ${act.id.includes('remediate') ? 'btn-danger' : 'btn-primary'}`}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: act.id.includes('remediate') ? '#ef4444' : undefined,
                    }}
                    onClick={() => onTabChange(act.tabTarget)}
                  >
                    {act.label}
                  </button>
                ))}
                {(!brief?.suggestedActions || brief.suggestedActions.length === 0) && (
                  <>
                    <button className="btn btn-sm" onClick={() => onTabChange('security')}>
                      <Search size={13} style={{ marginRight: 5 }} />
                      Examiner la sécurité
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onTabChange('performance')}>
                      Centre de maintenance
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metric Cards : 4 Cartes en direct avec Sparklines */}
        <div className="section-heading" style={{ marginTop: 8, marginBottom: 12 }}>
          <h2>Métriques système en direct</h2>
          <span>Temps réel</span>
        </div>
        <div className="grid g4">
          {METRICS.map(({ icon, label, val, unit, foot, hist }) => (
            <div key={label} className="card card-p">
              <div className="lbl">{icon}{label}</div>
              <div className="big">
                {val}<span className="mut" style={{ fontSize: 14, fontWeight: 400 }}>{unit}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>{foot}</div>
              {hist.length > 1 && <Sparkline data={hist} />}
            </div>
          ))}
        </div>

        {/* Quick Access Tiles */}
        <div className="section-heading" style={{ marginTop: 24, marginBottom: 12 }}>
          <h2>Accès rapide aux modules</h2>
        </div>
        <div className="grid g4">
          {QUICK.map(({ icon, label, desc, tab }) => (
            <div
              key={tab}
              className="card card-hov tile"
              onClick={() => onTabChange(tab)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onTabChange(tab)}
              style={{ cursor: 'pointer' }}
            >
              <span className="ico">{icon}</span>
              <div>
                <b>{label}</b>
                <div className="mut sm" style={{ marginTop: 3 }}>{desc}</div>
              </div>
              <span className="arrow"><ArrowUpRight size={15} /></span>
            </div>
          ))}
        </div>

        {/* Événements Récents Réels (Zero simulation) */}
        <div className="section-heading" style={{ marginTop: 24, marginBottom: 12 }}>
          <h2>Événements récents vérifiés</h2>
          <span>{events.length > 0 ? `${events.length} enregistrement(s)` : 'Historique'}</span>
        </div>
        <div className="card" style={{ padding: '12px 18px' }}>
          {events.length > 0 ? (
            <div className="list">
              {events.map((e, i) => (
                <div className="row" key={i}>
                  <span className="ico"><Activity size={15} style={{ color: 'var(--a1)' }} /></span>
                  <div className="rt">
                    <b>{e.title}</b>
                    <small>{e.desc} · {e.when}</small>
                  </div>
                  <span className="chip">{e.tag}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              Aucun événement récent enregistré. Les analyses de fichiers et opérations de sécurité apparaîtront ici.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
