import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu, HardDrive, Trash2, Zap, RefreshCw, Activity,
  CheckCircle2, Layers, X
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface DiskHealth {
  model?: string; FriendlyName?: string; status?: string;
  OperationalStatus?: string; mediaType?: string; MediaType?: string;
  health?: string; HealthStatus?: string; sizeGB?: number;
}

/* ── Animated circular gauge ─────────────────────────────────────────── */
function Gauge({ value, max = 100, color, size = 72, label }: { value: number; max?: number; color: string; size?: number; label: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>
          {Math.round(pct * 100)}%
        </span>
        <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export default function PerformanceTab({ gamingActive: _gamingActive }: { gamingActive: boolean }) {
  const { metrics: ctxMetrics, refreshTelemetry } = useSystem();
  const [metrics, setMetrics] = useState<any>(ctxMetrics);
  const [startup, setStartup] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);
  const [diskHealth, setDiskHealth] = useState<DiskHealth[]>([]);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleaningPhase, setCleaningPhase] = useState<'idle' | 'purging' | 'done'>('idle');
  const [cleanProgress, setCleanProgress] = useState(0);
  const [cleanStepLabel, setCleanStepLabel] = useState('');
  const [freedMemoryMb, setFreedMemoryMb] = useState(0);
  const [freedDiskMb, setFreedDiskMb] = useState(0);

  useEffect(() => { if (ctxMetrics) setMetrics(ctxMetrics); }, [ctxMetrics]);

  const loadDiskHealth = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.getDiskHealth?.();
      if (res?.success && Array.isArray(res.disks)) setDiskHealth(res.disks);
    } catch {}
  }, []);

  const loadStartup = useCallback(async () => {
    if (!api) return;
    setLoadingStartup(true);
    try { const res = await api.getStartup(); if (res?.items) setStartup(res.items); } catch {}
    setLoadingStartup(false);
  }, []);

  useEffect(() => { loadDiskHealth(); loadStartup(); }, [loadDiskHealth, loadStartup]);

  const startDeepMaintenance = async () => {
    setShowCleanModal(true);
    setCleaningPhase('purging');
    setCleanProgress(10);
    setFreedMemoryMb(0); setFreedDiskMb(0);
    setCleanStepLabel('Analyse de la mémoire...');

    await new Promise(r => setTimeout(r, 600));
    setCleanProgress(35);
    setCleanStepLabel('Purge de la RAM...');
    if (api?.cleanRam) {
      try { const r = await api.cleanRam(); setFreedMemoryMb(r?.freedMb || 0); } catch { setFreedMemoryMb(0); }
    }

    await new Promise(r => setTimeout(r, 700));
    setCleanProgress(70);
    setCleanStepLabel('Nettoyage des fichiers temporaires...');
    if (api?.diskCleanup) {
      try { const r = await api.diskCleanup(['temp', 'recycle']); setFreedDiskMb(r?.freedMb || 0); } catch { setFreedDiskMb(0); }
    }

    await new Promise(r => setTimeout(r, 600));
    setCleanProgress(95);
    setCleanStepLabel('Optimisation du profil alimentation...');
    if (api?.gamingModeOn) { try { await api.gamingModeOn(); } catch {} }

    await new Promise(r => setTimeout(r, 400));
    setCleanProgress(100);
    setCleanStepLabel('Maintenance terminée !');
    setCleaningPhase('done');
    refreshTelemetry();
  };

  const handleToggleStartup = async (item: any, willEnable: boolean) => {
    if (!api) return;
    const name = item.name || item.Name;
    const location = item.location || item.Location || 'HKCU';
    try {
      if (!willEnable) {
        await api.disableStartup(name, location);
        setStartup(prev => prev.map(i => ((i.name || i.Name) === name ? { ...i, enabled: false } : i)));
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de modifier cette entrée', technical: err.message });
    }
  };

  const ramPct = metrics && metrics.ramTotal > 0 ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const diskTotal = metrics ? metrics.diskUsedGB + metrics.diskFreeGB : 0;
  const diskPct = diskTotal ? Math.round((metrics.diskUsedGB / diskTotal) * 100) : 0;

  return (
    <div className="tab-scroll" style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Performance</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            RAM, disque, programmes au démarrage et maintenance
          </p>
        </div>
      </motion.div>

      {errorInfo && <div style={{ marginBottom: 20 }}><CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} /></div>}

      {/* ── Big Optimize CTA ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, duration: 0.4 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={startDeepMaintenance}
        style={{
          padding: '24px 28px', borderRadius: 16, cursor: 'pointer', marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(0,212,255,0.10) 100%)',
          border: '1px solid rgba(139,92,246,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #8b5cf6, #00d4ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={26} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
              Optimiser mon PC
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Libère la RAM, nettoie les fichiers temporaires et active le profil haute performance
            </div>
          </div>
        </div>
        <div style={{
          padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 800,
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
          color: '#fff', whiteSpace: 'nowrap',
        }}>
          Lancer
        </div>
      </motion.div>

      {/* ── Hardware Gauges ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* CPU */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
          style={{
            padding: '22px 20px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 18,
          }}
        >
          <Gauge value={metrics?.cpuPercent || 0} color="#00d4ff" label="CPU" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Processeur</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {metrics?.cpuModel || '–'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {metrics?.cpuCores ? `${metrics.cpuCores} cœurs` : '–'}
            </div>
          </div>
        </motion.div>

        {/* RAM */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 20 }}
          style={{
            padding: '22px 20px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 18,
          }}
        >
          <Gauge value={ramPct} color="#a855f7" label="RAM" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Mémoire</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {metrics?.ramTotal > 0 ? `${metrics.ramUsed} / ${metrics.ramTotal} Go` : '–'}
            </div>
          </div>
        </motion.div>

        {/* Disk */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
          style={{
            padding: '22px 20px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 18,
          }}
        >
          <Gauge value={diskPct} color={metrics?.diskFreeGB < 20 ? '#f59e0b' : '#10b981'} label="Disque" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Stockage (C:)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {diskTotal > 0 ? `${metrics.diskFreeGB} Go libres sur ${diskTotal} Go` : '–'}
            </div>
            {metrics?.diskFreeGB > 0 && metrics.diskFreeGB < 20 && (
              <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2, fontWeight: 600 }}>⚠ Espace faible</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── SMART Disk Health ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', marginBottom: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardDrive size={17} style={{ color: 'var(--cyan)' }} />
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Santé des disques {diskHealth.length > 0 && `(${diskHealth.length})`}
            </h2>
          </div>
          <button onClick={loadDiskHealth} className="btn btn-ghost btn-sm btn-icon" title="Actualiser">
            <RefreshCw size={13} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {diskHealth.length > 0 ? diskHealth.map((d, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              style={{
                padding: '12px 16px', borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {d.FriendlyName || d.model || 'Disque'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {d.MediaType || d.mediaType || '–'} {d.sizeGB ? `· ${d.sizeGB} Go` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                backgroundColor: 'rgba(16,217,160,0.1)', color: '#10d9a0',
                border: '1px solid rgba(16,217,160,0.25)',
              }}>
                {d.HealthStatus || d.health || 'Sain'}
              </span>
            </motion.div>
          )) : (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
              Chargement des données SMART...
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Startup Programs ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={17} style={{ color: '#c084fc' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Programmes au démarrage
              </h2>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Désactivez les programmes inutiles pour démarrer plus vite
              </div>
            </div>
          </div>
          <button onClick={loadStartup} className="btn btn-ghost btn-sm btn-icon" title="Actualiser">
            <RefreshCw size={13} className={loadingStartup ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {startup.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              {loadingStartup ? 'Chargement...' : 'Aucun programme détecté.'}
            </div>
          ) : startup.map((item, idx) => {
            const name = item.name || item.Name;
            const isEnabled = item.enabled !== false;
            const impact = item.impact || 'Moyen';
            const impactColor = impact === 'Élevé' ? '#ef4444' : impact === 'Faible' ? '#10b981' : '#f59e0b';

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + idx * 0.03 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 16px', borderRadius: 10,
                  backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      backgroundColor: `${impactColor}15`, color: impactColor,
                    }}>
                      {impact}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.command || item.Command || ''}
                  </div>
                </div>
                <CyberToggle checked={isEnabled} onChange={c => handleToggleStartup(item, c)} size="sm" glowColor="cyan" ariaLabel={`Basculer ${name}`} />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Clean Modal ── */}
      <AnimatePresence>
        {showCleanModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                width: '100%', maxWidth: 480, backgroundColor: '#0a0c18',
                border: '1px solid rgba(139,92,246,0.35)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                borderRadius: 18, padding: 28, textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Zap size={18} style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Optimisation</span>
                </div>
                {cleaningPhase === 'done' && (
                  <button onClick={() => setShowCleanModal(false)} className="btn btn-ghost btn-sm btn-icon"><X size={16} /></button>
                )}
              </div>

              {/* Progress ring */}
              <div style={{ margin: '0 auto', width: 110, height: 110, position: 'relative' }}>
                <Gauge
                  value={cleanProgress} max={100}
                  color={cleaningPhase === 'done' ? '#10b981' : '#8b5cf6'}
                  size={110} label={cleaningPhase === 'done' ? '✓' : ''}
                />
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '16px 0 6px' }}>
                {cleanStepLabel}
              </div>

              {/* Progress bar */}
              <div style={{ height: 3, width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', margin: '12px 0 20px' }}>
                <motion.div
                  animate={{ width: `${cleanProgress}%` }}
                  transition={{ duration: 0.4 }}
                  style={{ height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #00d4ff)', borderRadius: 99 }}
                />
              </div>

              {cleaningPhase === 'done' && (
                <>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                    padding: '14px 16px', borderRadius: 12,
                    backgroundColor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                    marginBottom: 20,
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>RAM libérée</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#8b5cf6' }}>+{freedMemoryMb} Mo</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Disque nettoyé</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>+{freedDiskMb} Mo</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => setShowCleanModal(false)}
                    style={{
                      padding: '10px 32px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                      border: 'none', color: '#fff', cursor: 'pointer',
                    }}
                  >
                    Fermer
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
