import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Shield, ShieldCheck, Zap, Activity,
  HardDrive, Clock, Cpu, Wifi, Lock, RefreshCw,
  ArrowUpRight, CheckCircle2, AlertTriangle, Gamepad2
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

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
  if (!h) return '–';
  if (h < 1) return `${Math.round(h * 60)} min`;
  const d = Math.floor(h / 24), hh = Math.floor(h % 24);
  return d > 0 ? `${d}j ${hh}h` : `${hh}h`;
}

/* ── Quick-access module cards ─────────────────────────────────────────── */
const MODULES = [
  {
    id: 'security',
    label: 'Sécurité',
    desc: 'Antivirus, analyses et protection temps réel',
    icon: Shield,
    color: '#10d9a0',
    bg: 'rgba(16, 217, 160, 0.10)',
    border: 'rgba(16, 217, 160, 0.25)',
  },
  {
    id: 'performance',
    label: 'Performance',
    desc: 'RAM, disque, démarrage et maintenance',
    icon: Zap,
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.10)',
    border: 'rgba(139, 92, 246, 0.25)',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    desc: 'Optimisation pour vos sessions de jeu',
    icon: Gamepad2,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.10)',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  {
    id: 'network',
    label: 'Réseau',
    desc: 'Speedtest, DNS et optimisation Wi-Fi',
    icon: Wifi,
    color: '#00d4ff',
    bg: 'rgba(0, 212, 255, 0.10)',
    border: 'rgba(0, 212, 255, 0.25)',
  },
  {
    id: 'vpn',
    label: 'VPN',
    desc: 'Tunnel chiffré et relais internationaux',
    icon: Lock,
    color: '#ff8c42',
    bg: 'rgba(255, 140, 66, 0.10)',
    border: 'rgba(255, 140, 66, 0.25)',
  },
];

export default function Dashboard({ gamingActive, currentGame, onTabChange, firstName = '' }: Props) {
  const { metrics: ctxMetrics, securityStatus: ctxSec, toggleRealTimeProtection, refreshTelemetry } = useSystem();
  const [metrics, setMetrics] = useState<any>(ctxMetrics);
  const [refreshing, setRefreshing] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  useEffect(() => { if (ctxMetrics) setMetrics(ctxMetrics); }, [ctxMetrics]);

  const load = useCallback(async () => {
    await refreshTelemetry();
    setRefreshing(false);
  }, [refreshTelemetry]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const ramPct = metrics && metrics.ramTotal > 0
    ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const isProtected = ctxSec?.realTimeProtection ?? true;

  /* ── Telemetry pills ─── */
  const pills = [
    { label: 'CPU', value: metrics?.cpuCores > 0 ? `${metrics.cpuPercent}%` : '–', icon: Cpu, color: 'var(--cyan)' },
    { label: 'RAM', value: metrics?.ramTotal > 0 ? `${ramPct}%` : '–', icon: Activity, color: 'var(--violet)' },
    { label: 'Disque', value: metrics?.diskFreeGB > 0 ? `${metrics.diskFreeGB} Go libre` : '–', icon: HardDrive, color: metrics?.diskFreeGB < 20 ? '#f59e0b' : 'var(--green)' },
    { label: 'Uptime', value: fmtUptime(metrics?.uptimeHours), icon: Clock, color: '#c084fc' },
  ];

  return (
    <div className="tab-scroll" style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {greeting(firstName)}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Votre centre de contrôle Astral Vanguard
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={handleRefresh}
          title="Actualiser"
          style={{ width: 36, height: 36 }}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </motion.div>

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* ── Status Banner ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        style={{
          padding: '22px 26px',
          borderRadius: 16,
          marginBottom: 24,
          background: gamingActive
            ? 'linear-gradient(135deg, rgba(245,158,11,0.14) 0%, rgba(6,6,20,0.9) 100%)'
            : !isProtected
            ? 'linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(6,6,20,0.9) 100%)'
            : 'linear-gradient(135deg, rgba(16,217,160,0.14) 0%, rgba(6,6,20,0.9) 100%)',
          border: `1px solid ${gamingActive ? 'rgba(245,158,11,0.3)' : !isProtected ? 'rgba(239,68,68,0.3)' : 'rgba(16,217,160,0.3)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: gamingActive ? 'rgba(245,158,11,0.15)' : !isProtected ? 'rgba(239,68,68,0.15)' : 'rgba(16,217,160,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {gamingActive
                ? <Gamepad2 size={22} style={{ color: '#f59e0b' }} />
                : !isProtected
                ? <AlertTriangle size={22} style={{ color: '#ef4444' }} />
                : <ShieldCheck size={22} style={{ color: '#10d9a0' }} />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                {gamingActive
                  ? `Mode Jeu actif${currentGame ? ` — ${currentGame}` : ''}`
                  : !isProtected
                  ? 'Protection suspendue'
                  : 'Tout est sous contrôle'}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 550 }}>
                {gamingActive
                  ? 'Session de jeu active — Profils de priorité système en cours de développement (Phase 11).'
                  : !isProtected
                  ? 'Le bouclier temps réel est désactivé. Vos fichiers ne sont pas surveillés.'
                  : 'Votre système est protégé et surveillé en continu.'}
              </p>
            </div>
          </div>

          {!isProtected && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toggleRealTimeProtection(true)}
              style={{
                padding: '10px 22px', fontSize: 13, fontWeight: 700,
                background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <ShieldCheck size={16} />
              Réactiver
            </motion.button>
          )}
        </div>

        {/* Telemetry pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18 }}>
          {pills.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              onClick={() => onTabChange('performance')}
              style={{
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'border-color 0.2s',
              }}
            >
              <p.icon size={15} style={{ color: p.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
                  {p.value}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── Quick Access Modules ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {MODULES.map((mod, i) => (
          <motion.div
            key={mod.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 260, damping: 20 }}
            whileHover={{ y: -4, borderColor: mod.color, boxShadow: `0 8px 24px ${mod.bg}` }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onTabChange(mod.id)}
            style={{
              padding: '20px 16px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 14,
              transition: 'border-color 0.25s, box-shadow 0.25s',
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              backgroundColor: mod.bg, border: `1px solid ${mod.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <mod.icon size={20} style={{ color: mod.color }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {mod.label}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {mod.desc}
              </p>
            </div>
            <ArrowUpRight size={14} style={{ color: 'var(--text-faint)', marginTop: 'auto' }} />
          </motion.div>
        ))}
      </div>

      {/* ── System Health Checks ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} style={{ color: isProtected ? 'var(--green)' : '#f59e0b' }} />
          État du système
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Shield check */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={15} style={{ color: isProtected ? 'var(--green)' : '#f59e0b' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Protection temps réel</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: isProtected ? 'var(--green)' : '#f59e0b' }}>
              {isProtected ? 'Actif' : 'Suspendu'}
            </span>
          </div>

          {/* Disk */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <HardDrive size={15} style={{ color: metrics?.diskFreeGB < 20 ? '#f59e0b' : 'var(--green)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Espace disque</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: metrics?.diskFreeGB < 20 ? '#f59e0b' : 'var(--green)' }}>
              {metrics && metrics.diskFreeGB > 0 ? `${metrics.diskFreeGB} Go libres` : '–'}
            </span>
          </div>

          {/* Signatures */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={15} style={{ color: 'var(--cyan)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Signatures antivirus</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)' }}>
              {ctxSec.signaturesVersion || '–'}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
