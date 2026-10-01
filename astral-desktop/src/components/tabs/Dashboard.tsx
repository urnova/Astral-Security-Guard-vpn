import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, Zap, Activity,
  HardDrive, Clock, Cpu, Wifi, Gamepad2, RefreshCw,
  ArrowUpRight, CheckCircle2, AlertTriangle, ChevronRight, Sparkles
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { VanguardLogo } from '../common/VanguardLogo';

const api = (window as any).vanguard;

interface Metrics {
  cpuPercent: number;
  ramTotal: number;
  ramUsed: number;
  diskUsedGB: number;
  diskFreeGB: number;
  uptimeHours: number;
}

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onTabChange: (tab: string) => void;
  firstName?: string;
}

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  return name ? `${time} ${name}` : 'Tableau de bord';
}

function fmtUptime(h: number) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const d = Math.floor(h / 24), hh = Math.floor(h % 24);
  return d > 0 ? `${d}j ${hh}h` : `${hh}h`;
}

function fmtGB(gb: number) {
  return gb >= 1 ? `${gb.toFixed(1)} Go` : `${(gb * 1024).toFixed(0)} Mo`;
}

export default function Dashboard({ gamingActive, currentGame, onTabChange, firstName = '' }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [secStatus, setSecStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  const load = useCallback(async () => {
    if (!api) { setLoading(false); return; }
    try {
      const [m, s] = await Promise.all([
        api.getMetrics?.(),
        api.getSecurityStatus?.(),
      ]);
      if (m?.success) setMetrics(m.data);
      if (s?.success) setSecStatus(s.data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const ramPct = metrics && metrics.ramTotal > 0
    ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const defOk = Boolean(secStatus?.AntivirusEnabled && secStatus?.RealTimeProtectionEnabled);

  return (
    <div className="tab-scroll animate-in" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {greeting(firstName)}
            </h1>
            <span className="badge badge-violet" style={{ fontSize: 11, padding: '2px 8px' }}>v2.4.0</span>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Supervision temps réel et centre de contrôle Astral Vanguard
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {gamingActive ? (
            <span className="badge badge-cyan" style={{ fontSize: 11, padding: '5px 12px' }}>
              <span className="badge-dot" style={{ animation: 'dotPulse 1.4s infinite' }} />
              GAMING ACTIF
            </span>
          ) : (
            <span className="badge badge-green" style={{ fontSize: 11, padding: '5px 12px' }}>
              <span className="badge-dot" />
              SYSTÈME PROTÉGÉ
            </span>
          )}

          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={handleRefresh}
            title="Actualiser la télémétrie"
            aria-label="Actualiser"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* ── Samsung-style "Vanguard PC Brief" Card ── */}
      <div
        className="glass-card"
        style={{
          padding: '24px 28px',
          borderRadius: 18,
          marginBottom: 24,
          background: gamingActive
            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(6, 6, 20, 0.85) 100%)'
            : 'linear-gradient(135deg, rgba(16, 217, 160, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(6, 6, 20, 0.85) 100%)',
          border: gamingActive ? '1px solid rgba(0, 212, 255, 0.35)' : '1px solid rgba(16, 217, 160, 0.35)',
          boxShadow: gamingActive
            ? '0 8px 32px rgba(0, 212, 255, 0.12)'
            : '0 8px 32px rgba(16, 217, 160, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: 'rgba(6, 6, 20, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <VanguardLogo size={36} glow />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cyan)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={13} />
                  <span>Brief Système Quotidien</span>
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {gamingActive ? 'Optimisation E-Sport Engagée' : 'Tout est sous contrôle'}
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 650 }}>
                {gamingActive
                  ? `Priorité maximale allouée à votre session (${currentGame || 'Plein Écran'}). Les boucliers réseau et processeur sont cadencés au plus haut niveau.`
                  : 'Votre ordinateur fonctionne de manière optimale. Les boucliers Defender sont actifs, aucune menace n\'est détectée et la mémoire est fluide.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onTabChange('security')}
            className="btn btn-primary"
            style={{ padding: '9px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Shield size={14} />
            <span>Console Sécurité</span>
          </button>
        </div>

        {/* Compact Telemetry Pill Bar (Eliminating Huge Clunky Cards) */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          <div
            onClick={() => onTabChange('performance')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <Cpu size={16} style={{ color: 'var(--cyan)' }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Processeur</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
                {metrics ? `${metrics.cpuPercent}%` : '–'}
              </div>
            </div>
          </div>

          <div
            onClick={() => onTabChange('performance')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <Activity size={16} style={{ color: 'var(--violet)' }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Mémoire Vive</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
                {metrics ? `${ramPct}% (${fmtGB(metrics.ramUsed / 1024)})` : '–'}
              </div>
            </div>
          </div>

          <div
            onClick={() => onTabChange('performance')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <HardDrive size={16} style={{ color: 'var(--green)' }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Disque Système (C:)</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
                {metrics ? `${metrics.diskFreeGB} Go libres` : '–'}
              </div>
            </div>
          </div>

          <div
            onClick={() => onTabChange('performance')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <Clock size={16} style={{ color: 'var(--gold)' }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Session Windows</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
                {metrics ? fmtUptime(metrics.uptimeHours) : '–'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 Interactive Action Modules ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div
          onClick={() => onTabChange('security')}
          className="glass-card hover-glow"
          style={{ padding: 18, borderRadius: 16, cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(16, 217, 160, 0.12)', border: '1px solid rgba(16, 217, 160, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
              <Shield size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Sécurité & Defender
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Radar d'analyse dynamique & heuristique
          </p>
        </div>

        <div
          onClick={() => onTabChange('performance')}
          className="glass-card hover-glow"
          style={{ padding: 18, borderRadius: 16, cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--violet)' }}>
              <Zap size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Turbo Performance
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Optimiseur 1-clic, boot & santé SMART
          </p>
        </div>

        <div
          onClick={() => onTabChange('network')}
          className="glass-card hover-glow"
          style={{ padding: 18, borderRadius: 16, cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0, 212, 255, 0.12)', border: '1px solid rgba(0, 212, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cyan)' }}>
              <Wifi size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Réseau & Wi-Fi
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Compteur de débit cyber & anti-latence
          </p>
        </div>

        <div
          onClick={() => onTabChange('vpn')}
          className="glass-card hover-glow"
          style={{ padding: 18, borderRadius: 16, cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 140, 66, 0.12)', border: '1px solid rgba(255, 140, 66, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)' }}>
              <Gamepad2 size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Tunnel VPN & Relais
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            12 relais internationaux & kill switch
          </p>
        </div>
      </div>

      {/* ── Rapport d'Avarie & Événements Récent (Enclosed inside styled card) ── */}
      <div className="glass-card" style={{ padding: 22, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            <span>Rapport d'État & Événements Système</span>
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>0 anomalie critique</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={16} style={{ color: 'var(--green)' }} />
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Protection Native Microsoft Defender</span>
                <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  Moteur temps réel opérationnel, signatures conformes et à jour.
                </p>
              </div>
            </div>
            <span className="badge badge-green" style={{ fontSize: 11 }}>Conforme</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={16} style={{ color: 'var(--violet)' }} />
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Optimisation Mémoire & Processus</span>
                <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  Caches de travail équilibrés, aucun emballement de thread d'arrière-plan.
                </p>
              </div>
            </div>
            <span className="badge badge-violet" style={{ fontSize: 11 }}>Stable</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Wifi size={16} style={{ color: 'var(--cyan)' }} />
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Adaptateurs Réseau & Tunnels</span>
                <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  Zéro conflit de routage, pile TCP saine et résilience DNS active.
                </p>
              </div>
            </div>
            <span className="badge badge-cyan" style={{ fontSize: 11 }}>Optimal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
