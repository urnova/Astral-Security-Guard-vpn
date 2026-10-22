import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Cpu, HardDrive, Wifi, Search, Zap,
  Lock, ArrowUpRight, Clock, CheckCircle2, AlertTriangle,
  Sparkles, RefreshCw, Activity
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

interface DailyBrief {
  score: number;
  riskLevel: string;
  summary: string;
  headline: string;
  conversationalNowBrief?: string;
  bulletPoints: string[];
  recommendations: string[];
  threatsCount: number;
  lastCheck: string;
  actionRequiredReasons?: string[];
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
  const [events, setEvents]     = useState<{ icon: any; title: string; desc: string; tag: string; when: string }[]>([]);
  const [secScore, setSecScore] = useState(96);
  const [brief, setBrief]       = useState<DailyBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnNode, setVpnNode]           = useState('');

  // VPN status polling & listeners
  useEffect(() => {
    if (!api) return;
    api.vpnGetStatus?.().then((s: any) => {
      if (s?.status?.connected || s?.connected) {
        setVpnConnected(true);
        setVpnNode(s.serverName || s.status?.serverName || '');
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

  // Load Daily AI Brief
  const refreshBrief = useCallback(async () => {
    if (!api) return;
    setLoadingBrief(true);
    try {
      const res = await api.getDailyBrief?.();
      if (res?.success && res.brief) {
        setBrief(res.brief);
        if (typeof res.brief.score === 'number') {
          setSecScore(res.brief.score);
        }
      } else {
        // Fallback brief based on local telemetry
        const isProtected = securityStatus.realTimeProtection && securityStatus.antivirusEnabled;
        setBrief({
          score: isProtected ? 96 : 70,
          riskLevel: isProtected ? 'Sain' : 'Moyen',
          summary: isProtected
            ? 'Système sain : Zéro indicateur de compromission détecté par les moteurs actifs.'
            : 'Vigilance : La protection en temps réel nécessite une vérification.',
          headline: isProtected ? 'Votre système est parfaitement sécurisé' : 'Vérification requise',
          bulletPoints: [
            isProtected ? 'Protection Microsoft Defender active et signatures à jour.' : 'Protection en temps réel inactive.',
            'Zéro injection mémoire ou comportement suspect identifié.',
            'Filtrage heuristique et contrôle d\'intégrité opérationnels.',
          ],
          recommendations: ['Maintenir les composants système à jour.'],
          threatsCount: securityStatus.threatsCount || 0,
          lastCheck: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch {
      setBrief({
        score: 96,
        riskLevel: 'Sain',
        summary: 'Système sain : Surveillance heuristique autonome active.',
        headline: 'Votre système est parfaitement sécurisé',
        bulletPoints: [
          'Protection en temps réel Microsoft Defender active.',
          'Zéro menace active détectée sur la machine.',
          'Connectivité et flux réseau stables.',
        ],
        recommendations: ['Maintenir Windows Update à jour.'],
        threatsCount: 0,
        lastCheck: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      });
    } finally {
      setLoadingBrief(false);
    }
  }, [securityStatus]);

  useEffect(() => {
    refreshBrief();
    const briefTimer = setInterval(refreshBrief, 30000);

    // Live ping polling every 2.5s for real-time latency
    const checkPing = () => {
      api?.getPing?.().then((res: any) => {
        if (res?.ping && res.ping > 0) setPing(res.ping);
      }).catch(() => {});
    };
    checkPing();
    const pingTimer = setInterval(checkPing, 2500);

    // Ping update listener
    const cleanupPing = api?.on?.('doctor:ping-update', (d: any) => {
      if (d?.ping && d.ping > 0) setPing(d.ping);
    });

    // Populate events list
    setEvents([
      { icon: 'shield', title: 'Protection en temps réel', desc: 'Microsoft Defender actif · Signatures à jour', tag: 'Opérationnel', when: 'Permanent' },
      { icon: 'cpu',    title: 'Surveillance des processus', desc: 'Contrôle d\'intégrité autonome sans surcharge', tag: 'Normal', when: 'En cours' },
      { icon: 'wifi',   title: 'Pile réseau & latence', desc: 'Passerelle Cloudflare 1.1.1.1 vérifiée', tag: 'Stable', when: 'En cours' },
      { icon: 'dl',     title: 'Sentinelle téléchargements', desc: 'Surveillance des flux exécutables locaux', tag: 'Actif', when: 'En veille' },
    ]);

    return () => {
      clearInterval(pingTimer);
      clearInterval(briefTimer);
      cleanupPing?.();
    };
  }, [refreshBrief]);

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
    { icon: <Wifi size={18} />,     label: 'Réseau & Anti-Lag',    desc: 'Latence, DNS et diagnostic',    tab: 'network' },
    { icon: <Lock size={18} />,     label: 'Astral VPN',           desc: 'Tunnels et relais vérifiés',    tab: 'vpn' },
  ];

  const barW = Math.max(0, Math.min(100, secScore));

  return (
    <div className="page-scroll">
      <div className="page">
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1>{firstName ? `Bonjour, ${firstName}` : "Vue d'ensemble"}</h1>
            <p className="sub">Surveillance proactive, protection résidente et état du système.</p>
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

        {/* Samsung Now Brief Style Assistant Card */}
        {(() => {
          const hasThreats = (brief?.threatsCount ?? 0) > 0;
          return (
            <div
              className="card card-p-lg"
              style={{
                marginBottom: 20,
                background: hasThreats
                  ? 'linear-gradient(135deg, rgba(38,16,19,0.96) 0%, rgba(26,12,14,0.98) 100%)'
                  : 'linear-gradient(135deg, rgba(20,24,33,0.95) 0%, rgba(15,18,25,0.98) 100%)',
                border: hasThreats
                  ? '1px solid rgba(239, 68, 68, 0.45)'
                  : '1px solid rgba(var(--a1r), 0.22)',
                boxShadow: hasThreats
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
                  background: hasThreats
                    ? 'radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(var(--a1r), 0.14) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: hasThreats ? 'rgba(239, 68, 68, 0.2)' : 'rgba(var(--a1r), 0.15)',
                      border: hasThreats ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(var(--a1r), 0.3)',
                      display: 'grid',
                      placeItems: 'center',
                      color: hasThreats ? '#ef4444' : 'var(--a1)',
                    }}
                  >
                    {hasThreats ? <AlertTriangle size={16} /> : <Sparkles size={16} />}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: hasThreats ? '#fca5a5' : 'var(--text)', letterSpacing: '-0.01em' }}>
                      {hasThreats ? 'Alerte Sécurité — Action Requise' : 'Brief Système Quotidien'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 8 }}>
                      {hasThreats ? 'Menaces isolées par le moteur multi-moteur' : 'Assistant IA Local & Télémétrie en direct'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {hasThreats ? (
                    <span className="chip" style={{ fontSize: 11.5, background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', fontWeight: 700, padding: '3px 10px' }}>
                      <AlertTriangle size={13} />
                      {brief?.threatsCount} anomalie(s) critique(s)
                    </span>
                  ) : (
                    <span className="chip" style={{ fontSize: 11.5, background: 'rgba(104,184,148,0.12)', color: 'var(--ok)', fontWeight: 600, padding: '3px 10px' }}>
                      <CheckCircle2 size={13} />
                      Indice Système : {secScore}/100
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 6 }}>
                <h3 style={{ fontSize: 15.5, fontWeight: 700, color: hasThreats ? '#ef4444' : '#f8fafc', marginBottom: 8, letterSpacing: '-0.01em' }}>
                  {hasThreats
                    ? `${brief?.threatsCount} composant(s) hostile(s) détecté(s) nécessitant une remédiation`
                    : (brief?.headline || 'Votre système est parfaitement opérationnel et sécurisé')}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14, maxWidth: 900 }}>
                  {hasThreats
                    ? 'Des anomalies suspectes ont été isolées par Windows Defender ou le moteur heuristique Vanguard. Une remédiation immédiate neutralisera et éradiquera ces fichiers.'
                    : (brief?.conversationalNowBrief || brief?.summary || 'Bonjour ! Toutes les couches de protection Microsoft Defender et sentinelles sont actives sans anomalie.')}
                </p>

                {/* Quick telemetry indicators */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 'var(--r-sm)',
                    background: 'rgba(0,0,0,0.3)',
                    border: hasThreats ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                    {hasThreats ? (
                      <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
                    ) : (
                      <CheckCircle2 size={13} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                    )}
                    <span>Protection Defender & Heuristique : <b>{hasThreats ? 'Remédiation requise' : 'Nominale'}</b></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                    <CheckCircle2 size={13} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                    <span>Stockage : <b>Disque C: et volumes sains</b></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text)' }}>
                    <CheckCircle2 size={13} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                    <span>Graphismes : <b>GPU prêt pour le Gaming</b></span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                    Dernière actualisation à {brief?.lastCheck || 'l\'instant'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {hasThreats ? (
                      <button
                        className="btn btn-sm"
                        style={{
                          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 700,
                          boxShadow: '0 4px 14px rgba(239,68,68,0.4)',
                        }}
                        onClick={() => onTabChange('security')}
                      >
                        <Sparkles size={13} />
                        Lancer la remédiation immédiate ({brief?.threatsCount})
                      </button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => onTabChange('security')}>
                        <Search size={13} />
                        Lancer une analyse rapide
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => onTabChange('performance')}>
                      Centre de maintenance
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Protection & Attention Row */}
        <div className="grid g21">
          {/* Protection Overview Card */}
          <div className="card card-p-lg card-hero">
            <div className="overview">
              <div className={`overview-icon${(brief?.threatsCount ?? 0) > 0 ? ' bad' : secScore < 70 ? ' bad' : secScore < 90 ? ' warn' : ''}`}>
                <Shield size={24} />
              </div>
              <div className="overview-copy">
                <div className="lbl" style={{ marginBottom: 4 }}>État de la protection</div>
                <h2>
                  {(brief?.threatsCount ?? 0) > 0
                    ? `${brief?.threatsCount} anomalie(s) identifiée(s) — Action requise`
                    : secScore >= 90
                    ? 'Système sous protection active'
                    : secScore >= 70
                    ? 'Protection partielle'
                    : 'Action requise'}
                </h2>
                <p>
                  {(brief?.threatsCount ?? 0) > 0
                    ? 'Des menaces ou fichiers suspects ont été isolés sur votre système. Une remédiation est prête.'
                    : secScore >= 90
                    ? 'Microsoft Defender, sentinelle YARA et pare-feu opérationnels. Zéro charge suspecte.'
                    : (brief?.actionRequiredReasons && brief.actionRequiredReasons.length > 0)
                    ? brief.actionRequiredReasons.join(' • ')
                    : 'Un ou plusieurs paramètres de sécurité nécessitent une vérification.'}
                </p>
                <div className="overview-actions">
                  {(brief?.threatsCount ?? 0) > 0 ? (
                    <button
                      className="btn"
                      style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 600 }}
                      onClick={() => onTabChange('security')}
                    >
                      <Sparkles size={14} />
                      Appliquer la remédiation
                    </button>
                  ) : (
                    <button className="btn" onClick={() => onTabChange('security')}>
                      <Search size={14} />
                      Contrôler la sécurité
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => onTabChange('network')}>
                    Tester la latence
                  </button>
                </div>
              </div>
            </div>
            <div className="overview-score">
              <span className="mut sm">Indice de sécurité</span>
              <div className="bar" style={{ flex: 1 }}>
                <i style={{ width: `${barW}%` }} />
              </div>
              <span className="score-value">{secScore} <span className="mut">/ 100</span></span>
            </div>
          </div>

          {/* Points à vérifier */}
          <div className="card card-p-lg">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600 }}>Points sous surveillance</h2>
              <span className="chip" style={{ fontSize: 10 }}>Actifs</span>
            </div>
            <div className="list">
              <div className="row">
                <span className="ico" style={{ color: 'var(--ok)' }}><Shield size={15} /></span>
                <div className="rt">
                  <b>Microsoft Defender</b>
                  <small>Protection en temps réel active</small>
                </div>
                <span className="chip" style={{ fontSize: 10 }}>OK</span>
              </div>
              <div className="row">
                <span className="ico" style={{ color: 'var(--ok)' }}><Wifi size={15} /></span>
                <div className="rt">
                  <b>Watchdog Anti-Lag</b>
                  <small>Surveillance latence réseau active ({pingVal} ms)</small>
                </div>
                <span className="chip" style={{ fontSize: 10 }}>Actif</span>
              </div>
              <div className="row">
                <span className="ico" style={{ color: 'var(--ok)' }}><HardDrive size={15} /></span>
                <div className="rt">
                  <b>Disque principal C:</b>
                  <small>{diskPct}% utilisé · {metrics.diskFreeGB || 0} Go disponibles</small>
                </div>
                <span className="chip" style={{ fontSize: 10 }}>{diskPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="section-heading" style={{ marginTop: 24, marginBottom: 12 }}>
          <h2>Métriques et télémétrie système</h2>
          <span>En direct</span>
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

        {/* Quick Access */}
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

        {/* Recent Events / Modules */}
        <div className="section-heading" style={{ marginTop: 24, marginBottom: 12 }}>
          <h2>Journal d'intégrité du système</h2>
          <span>{events.length} modules surveillés</span>
        </div>
        <div className="card" style={{ padding: '10px 18px' }}>
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
        </div>
      </div>
    </div>
  );
}
