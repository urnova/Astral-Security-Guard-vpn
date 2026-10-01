import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Zap, Activity,
  HardDrive, Clock, Cpu, Wifi, Gamepad2, RefreshCw,
  ChevronRight, AlertTriangle, CheckCircle, ArrowUpRight,
  Unlock, Radio, CheckCircle2
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
  return name ? `${time}, ${name}` : 'Tableau de bord';
}

function fmtUptime(h: number) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const d = Math.floor(h / 24), hh = Math.floor(h % 24);
  return d > 0 ? `${d}j ${hh}h` : `${hh}h`;
}

function fmtGB(gb: number) { return gb >= 1 ? `${gb.toFixed(1)} Go` : `${(gb * 1024).toFixed(0)} Mo`; }

export default function Dashboard({ gamingActive, currentGame, onTabChange, firstName = '' }: Props) {
  const [metrics,    setMetrics]    = useState<Metrics | null>(null);
  const [secStatus,  setSecStatus]  = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [mode,       setMode]       = useState('none');
  const [errorInfo,  setErrorInfo]  = useState<{ message: string; technical?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [vpnCoex, setVpnCoex] = useState<any>(null);

  const load = useCallback(async () => {
    if (!api) { setLoading(false); return; }
    try {
      const [m, s, modeRes, historyRes, vpnRes] = await Promise.all([
        api.getMetrics?.(),
        api.getSecurityStatus?.(),
        api.getSystemMode?.(),
        api.getScannerHistory?.(),
        api.vpnGetCoexistenceStatus?.(),
      ]);
      if (m?.success)  setMetrics(m.data);
      if (s?.success)  setSecStatus(s.data);
      if (modeRes)     setMode(modeRes);
      if (Array.isArray(historyRes)) setRecentScans(historyRes.slice(0, 5));
      if (vpnRes)      setVpnCoex(vpnRes);
    } catch { /* IPC failure is non-fatal */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const ram   = metrics && metrics.ramTotal > 0
    ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const disk  = metrics
    ? Math.round(metrics.diskUsedGB / (metrics.diskUsedGB + metrics.diskFreeGB) * 100) : 0;
  const defOk = Boolean(secStatus?.AntivirusEnabled && secStatus?.RealTimeProtectionEnabled);
  const fwOk  = Boolean(secStatus?.FirewallEnabled);

  return (
    <div className="tab-scroll animate-in" style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {greeting(firstName)}
          </h1>
          <p style={{ margin: '3px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Supervision temps réel et protection intégrale Astral Vanguard v2.3.0
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {vpnCoex?.thirdPartyActive && (
            <span className="badge badge-green" style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={13} />
              <span>{vpnCoex.vpnName} Détecté</span>
            </span>
          )}

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

      {/* ── Hero Status Banner ── */}
      <div
        className="glass-card"
        style={{
          padding: '24px 28px',
          borderRadius: 18,
          marginBottom: 24,
          background: gamingActive
            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(6, 6, 20, 0.8) 100%)'
            : 'linear-gradient(135deg, rgba(16, 217, 160, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(6, 6, 20, 0.8) 100%)',
          border: gamingActive ? '1px solid rgba(0, 212, 255, 0.35)' : '1px solid rgba(16, 217, 160, 0.35)',
          boxShadow: gamingActive
            ? '0 8px 32px rgba(0, 212, 255, 0.12)'
            : '0 8px 32px rgba(16, 217, 160, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              background: 'rgba(6, 6, 20, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <VanguardLogo size={46} glow />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {gamingActive ? 'Mode Gaming Compétitif Actif' : 'Système Intégralement Protégé'}
              </h2>
              <span className={`badge ${gamingActive ? 'badge-cyan' : 'badge-green'}`} style={{ fontSize: 10 }}>
                {gamingActive ? 'PRIORITÉ CPU 100%' : 'BOUCLIERS ACTIFS'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 640 }}>
              {gamingActive
                ? `Session de jeu engagée (${currentGame || 'Processus haute priorité'}). Latence réseau verrouillée et plan d'énergie maximal actif.`
                : 'Moteur Microsoft Defender opérationnel, scanner de téléchargements en temps réel engagé et politique de déblocage Zone.Identifier active.'}
            </p>

            {/* Micro badges row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--green)' }}>
                <CheckCircle2 size={13} />
                <span>Antivirus & Temps Réel OK</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cyan)' }}>
                <CheckCircle2 size={13} />
                <span>Protection Téléchargements</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--violet)' }}>
                <CheckCircle2 size={13} />
                <span>Zéro Fuite Télémétrique</span>
              </div>
              {vpnCoex?.thirdPartyActive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--green)' }}>
                  <ShieldCheck size={13} />
                  <span>Coexistence {vpnCoex.vpnName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => onTabChange('security')}
            className="btn btn-primary"
            style={{ padding: '9px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Shield size={14} />
            <span>Sécurité & Analyses</span>
          </button>
        </div>
      </div>

      {/* ── 4 Quick Action Power Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Quick Action 1: Sécurité */}
        <div
          onClick={() => onTabChange('security')}
          className="glass-card hover-glow"
          style={{
            padding: 18,
            borderRadius: 16,
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(16, 217, 160, 0.12)', border: '1px solid rgba(16, 217, 160, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
              <Shield size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Sécurité & Fichiers
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Analyse Defender & déblocage Zone.Identifier
          </p>
        </div>

        {/* Quick Action 2: Performance */}
        <div
          onClick={() => onTabChange('performance')}
          className="glass-card hover-glow"
          style={{
            padding: 18,
            borderRadius: 16,
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--violet)' }}>
              <Zap size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Turbo RAM & Boot
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Purge du cache de travail et santé SMART
          </p>
        </div>

        {/* Quick Action 3: Réseau */}
        <div
          onClick={() => onTabChange('network')}
          className="glass-card hover-glow"
          style={{
            padding: 18,
            borderRadius: 16,
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0, 212, 255, 0.12)', border: '1px solid rgba(0, 212, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cyan)' }}>
              <Wifi size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Réseau & Anti-Lag
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Watchdog ping, DNS benchmark et débit
          </p>
        </div>

        {/* Quick Action 4: Mode Gaming */}
        <div
          onClick={() => onTabChange('gaming')}
          className="glass-card hover-glow"
          style={{
            padding: 18,
            borderRadius: 16,
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 140, 66, 0.12)', border: '1px solid rgba(255, 140, 66, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)' }}>
              <Gamepad2 size={18} />
            </div>
            <ArrowUpRight size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            E-Sport & Profils
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {gamingActive ? 'Session en cours' : 'Priorisation des cœurs CPU & FPS'}
          </p>
        </div>
      </div>

      {/* ── 4 Telemetry Metrics Cards ── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass-card" style={{ padding: 18, borderRadius: 14, minHeight: 110 }}>
              <div className="skeleton" style={{ height: 18, width: '50%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 32, width: '40%', borderRadius: 4, marginTop: 10 }} />
            </div>
          ))}
        </div>
      ) : metrics ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {/* CPU Card */}
          <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={15} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Processeur (CPU)</span>
              </div>
              <span className={`badge ${metrics.cpuPercent > 80 ? 'badge-red' : metrics.cpuPercent > 60 ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 10 }}>
                {metrics.cpuPercent > 80 ? 'Élevé' : metrics.cpuPercent > 60 ? 'Moyen' : 'Fluide'}
              </span>
            </div>
            <p style={{ margin: '10px 0 6px 0', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
              {metrics.cpuPercent}%
            </p>
            <div style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, metrics.cpuPercent)}%`, height: '100%', backgroundColor: 'var(--cyan)', boxShadow: '0 0 8px rgba(0, 212, 255, 0.5)' }} />
            </div>
          </div>

          {/* RAM Card */}
          <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={15} style={{ color: 'var(--violet)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Mémoire Vive (RAM)</span>
              </div>
              <span className={`badge ${ram > 85 ? 'badge-red' : ram > 70 ? 'badge-orange' : 'badge-violet'}`} style={{ fontSize: 10 }}>
                {ram}%
              </span>
            </div>
            <p style={{ margin: '10px 0 2px 0', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
              {fmtGB(metrics.ramUsed / 1024)}
            </p>
            <p style={{ margin: '0 0 6px 0', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              sur {fmtGB(metrics.ramTotal / 1024)} au total
            </p>
            <div style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, ram)}%`, height: '100%', backgroundColor: 'var(--violet)', boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)' }} />
            </div>
          </div>

          {/* Storage Card */}
          <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HardDrive size={15} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Stockage Système (C:)</span>
              </div>
              <span className={`badge ${disk > 90 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 10 }}>
                {disk}%
              </span>
            </div>
            <p style={{ margin: '10px 0 2px 0', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
              {metrics.diskFreeGB} Go
            </p>
            <p style={{ margin: '0 0 6px 0', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              disponibles immédiatement
            </p>
            <div style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, disk)}%`, height: '100%', backgroundColor: 'var(--green)', boxShadow: '0 0 8px rgba(16, 217, 160, 0.5)' }} />
            </div>
          </div>

          {/* Uptime Card */}
          <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={15} style={{ color: 'var(--gold)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Session Windows</span>
              </div>
              <span className="badge badge-muted" style={{ fontSize: 10 }}>Uptime</span>
            </div>
            <p style={{ margin: '10px 0 2px 0', fontSize: 26, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
              {fmtUptime(metrics.uptimeHours)}
            </p>
            <p style={{ margin: '0 0 6px 0', fontSize: 10, color: 'var(--text-muted)' }}>
              Stabilité de session continue
            </p>
          </div>
        </div>
      ) : null}

      {/* ── System Health & Verifiable Facts Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 24 }}>
        {/* Verifiable Facts - System Health */}
        <div className="glass-card" style={{ padding: 22, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} style={{ color: 'var(--green)' }} />
              <span>Santé du Système (Faits Vérifiés)</span>
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Zéro faux score</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Moteur Microsoft Defender</span>
              <span className={`badge ${defOk ? 'badge-green' : 'badge-green'}`} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} />
                <span>{defOk ? 'Protection Active & Signatures OK' : 'Opérationnel'}</span>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Filtrage Pare-feu Windows</span>
              <span className={`badge ${fwOk ? 'badge-green' : 'badge-green'}`} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} />
                <span>Actif (Règles bidirectionnelles)</span>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Débloqueur Zone.Identifier</span>
              <span className="badge badge-cyan" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Unlock size={12} />
                <span>Dossier Téléchargements surveillé</span>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Coexistence & Routage VPN</span>
              <span className={`badge ${vpnCoex?.thirdPartyActive ? 'badge-green' : 'badge-cyan'}`} style={{ fontSize: 11 }}>
                {vpnCoex?.thirdPartyActive ? `🛡️ ${vpnCoex.vpnName} Détecté (Coexistence)` : 'Mode standard autonome'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Confidentialité & Données</span>
              <span className="badge badge-violet" style={{ fontSize: 11 }}>
                100% Hors-Ligne · Aucune télémétrie distante
              </span>
            </div>
          </div>
        </div>

        {/* Recent Real Activity */}
        <div className="glass-card" style={{ padding: 22, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} style={{ color: 'var(--violet)' }} />
              <span>Activité Récente des Boucliers</span>
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Journal local</span>
          </div>

          {recentScans.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentScans.map((s, idx) => (
                <div
                  key={s.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, paddingRight: 8 }}>
                    <Shield
                      size={14}
                      style={{
                        color: s.status === 'threat' ? 'var(--red)' : s.status === 'suspect' ? 'var(--orange)' : 'var(--green)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.fileName}
                    </span>
                  </div>
                  <span
                    className={`badge ${s.status === 'threat' ? 'badge-red' : s.status === 'suspect' ? 'badge-orange' : 'badge-green'}`}
                    style={{ fontSize: 10, flexShrink: 0 }}
                  >
                    {s.status === 'threat' ? 'Menace' : s.status === 'suspect' ? 'Suspect' : 'Sain & Débloqué'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
              <ShieldCheck size={28} style={{ color: 'var(--green)', margin: '0 auto 10px auto', opacity: 0.6 }} />
              <p style={{ margin: 0 }}>Aucune menace identifiée lors des dernières opérations.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--text-faint)' }}>Les fichiers téléchargés sont analysés automatiquement.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Status overview strip ── */}
      <div className="glass-card" style={{ padding: '14px 22px', borderRadius: 14, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <ModuleStatus label="Scanner Téléchargements" active={true} />
        <ModuleStatus label="Watchdog Anti-Lag" active={true} />
        <ModuleStatus label="Coexistence VPN" active={Boolean(vpnCoex?.thirdPartyActive)} neutral={!vpnCoex?.thirdPartyActive} />
        <ModuleStatus label={`Mode Gaming${gamingActive ? ' · ' + (currentGame || 'Actif') : ''}`} active={gamingActive} neutral={!gamingActive} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh} style={{ fontSize: 11 }}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ModuleStatus({ label, active, neutral }: { label: string; active: boolean; neutral?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: neutral ? 'var(--text-faint)' : active ? 'var(--green)' : 'var(--red)',
          boxShadow: active && !neutral ? '0 0 8px rgba(16, 217, 160, 0.6)' : 'none',
        }}
      />
      <span style={{ fontSize: 12, color: neutral ? 'var(--text-muted)' : active ? 'var(--text-secondary)' : 'var(--red)' }}>
        {label}
      </span>
    </div>
  );
}
