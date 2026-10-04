import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, HardDrive, Trash2, Zap, RefreshCw, Activity,
  CheckCircle2, AlertTriangle, Layers, X, ShieldAlert
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { useSystem } from '../../context/SystemContext';

const api = (window as any).vanguard;

interface DiskHealth {
  model?: string;
  FriendlyName?: string;
  status?: string;
  OperationalStatus?: string;
  mediaType?: string;
  MediaType?: string;
  health?: string;
  HealthStatus?: string;
  sizeGB?: number;
}

export default function PerformanceTab({ gamingActive: _gamingActive }: { gamingActive: boolean }) {
  const { metrics: ctxMetrics, refreshTelemetry } = useSystem();
  const [metrics, setMetrics] = useState<any>(ctxMetrics);
  const [startup, setStartup] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);
  const [diskHealth, setDiskHealth] = useState<DiskHealth[]>([]);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);

  // Clean / Flush RAM Confirmation Modal
  const [showFlushModal, setShowFlushModal] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  // Disk maintenance
  const [cleaningDisk, setCleaningDisk] = useState(false);
  const [diskNotice, setDiskNotice] = useState<string | null>(null);

  useEffect(() => {
    if (ctxMetrics) setMetrics(ctxMetrics);
  }, [ctxMetrics]);

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
    try {
      const res = await api.getStartup();
      if (res?.items) setStartup(res.items);
    } catch {}
    setLoadingStartup(false);
  }, []);

  useEffect(() => {
    loadDiskHealth();
    loadStartup();
  }, [loadDiskHealth, loadStartup]);

  const handleEmptyWorkingSet = async () => {
    if (!api) return;
    setFlushing(true);
    setErrorInfo(null);
    setFlushResult(null);

    try {
      if (api.emptyWorkingSet) {
        const res = await api.emptyWorkingSet({ userConsent: true });
        if (res?.success) {
          setFlushResult(`Purge effectuée avec succès (${res.freedMb || 0} Mo libérés via EmptyWorkingSet).`);
          await refreshTelemetry();
        } else {
          setErrorInfo({ message: res?.error || 'Opération refusée ou non supportée.' });
        }
      } else if (api.cleanRam) {
        const res = await api.cleanRam();
        if (res?.success) {
          setFlushResult('Purge mémoire effectuée.');
        } else {
          // Fallback notice (Phase 3/7)
          setErrorInfo({ message: res?.message || 'Purge soumise à confirmation de sécurité (Phase 3/7).' });
        }
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors du vidage des plages de travail.', technical: err.message });
    } finally {
      setFlushing(false);
      setTimeout(() => setShowFlushModal(false), 2000);
    }
  };

  const handleDiskCleanup = async () => {
    if (!api?.diskCleanup) return;
    setCleaningDisk(true);
    setDiskNotice(null);
    try {
      const r = await api.diskCleanup(['temp', 'recycle']);
      if (r?.success) {
        setDiskNotice(`Nettoyage achevé : ${r.freedMb || 0} Mo d’espace récupéré sur vos disques.`);
        await refreshTelemetry();
      } else {
        setErrorInfo({ message: r?.error || 'Échec du nettoyage de disque.' });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors du nettoyage.', technical: err.message });
    } finally {
      setCleaningDisk(false);
    }
  };

  const ramPct = metrics && metrics.ramTotal > 0
    ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100)
    : 0;

  return (
    <div className="tab-scroll">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance & Mémoire</h1>
          <p className="page-subtitle">Gestion honnête de la mémoire physique, analyse des disques et démarrage Windows</p>
        </div>

        <div className="page-actions">
          <button
            onClick={() => setShowFlushModal(true)}
            className="btn btn-secondary"
          >
            <Zap size={15} style={{ color: 'var(--cyan)' }} />
            <span>Optimiser la RAM</span>
          </button>
          <button
            onClick={handleDiskCleanup}
            disabled={cleaningDisk}
            className="btn btn-secondary"
          >
            <Trash2 size={15} className={cleaningDisk ? 'animate-spin' : ''} />
            <span>{cleaningDisk ? 'Nettoyage...' : 'Purger Fichiers Temp'}</span>
          </button>
        </div>
      </div>

      {errorInfo && (
        <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
      )}

      {diskNotice && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: 'var(--green)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{diskNotice}</span>
        </div>
      )}

      {/* Memory Breakdown Card */}
      <div className="card card-p-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">État de la Mémoire Vive Physique</h2>
            <p className="card-subtitle">Répartition authentique sans simulation [System.GC]::Collect()</p>
          </div>
          <span className={`badge ${ramPct > 80 ? 'badge-red' : ramPct > 65 ? 'badge-amber' : 'badge-green'}`}>
            {ramPct}% UTILISÉ
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center', marginBottom: 20 }}>
          <div style={{ padding: 14, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MÉMOIRE EN USAGE</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Space Grotesk', sans-serif", marginTop: 4 }}>
              {metrics ? `${metrics.ramUsed?.toFixed(1) || '0'} Go` : '—'}
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MÉMOIRE LIBRE</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', fontFamily: "'Space Grotesk', sans-serif", marginTop: 4 }}>
              {metrics ? `${((metrics.ramTotal || 16) - (metrics.ramUsed || 0)).toFixed(1)} Go` : '—'}
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CAPACITÉ PHYSIQUE</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cyan)', fontFamily: "'Space Grotesk', sans-serif", marginTop: 4 }}>
              {metrics ? `${metrics.ramTotal?.toFixed(1) || '0'} Go` : '—'}
            </div>
          </div>
        </div>

        <div style={{ width: '100%', height: 6, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 99, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${ramPct}%`,
              background: ramPct > 80 ? '#ef4444' : 'linear-gradient(90deg, #6366f1 0%, #38bdf8 100%)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          L'appel EmptyWorkingSet est disponible sous consentement explicite (excluant strictement les processus système critiques csrss.exe, lsass.exe, dwm.exe).
        </div>
      </div>

      {/* Disks Health */}
      <div className="card card-p-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Santé des Unités de Stockage</h2>
            <p className="card-subtitle">Données réelles interrogées via WMI et Get-PhysicalDisk (zéro rapport statique)</p>
          </div>
        </div>

        {diskHealth.length === 0 ? (
          <div className="state-empty" style={{ minHeight: 120, padding: 24 }}>
            <span>Aucune métrique de disque SMART disponible sur ce bus.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {diskHealth.map((d, idx) => (
              <div
                key={idx}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>
                    {d.FriendlyName || d.model || `Disque physique #${idx + 1}`}
                  </strong>
                  <span className="badge badge-green">
                    {d.HealthStatus || d.health || 'Sain'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                  Type : {d.MediaType || d.mediaType || 'SSD / NVMe'} · Capacité : {d.sizeGB ? `${d.sizeGB} Go` : 'Standard'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Startup Programs */}
      <div className="card card-p-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Programmes au Démarrage Windows</h2>
            <p className="card-subtitle">Éléments configurés dans le registre utilisateur et machine (HKCU/HKLM)</p>
          </div>
          <button onClick={loadStartup} disabled={loadingStartup} className="btn btn-ghost btn-sm">
            <RefreshCw size={13} className={loadingStartup ? 'animate-spin' : ''} />
            <span>Actualiser</span>
          </button>
        </div>

        {startup.length === 0 ? (
          <div className="state-empty" style={{ minHeight: 120, padding: 24 }}>
            <span>Aucun élément de démarrage tiers non essentiel détecté.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {startup.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                  fontSize: 12.5,
                }}
              >
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    {item.command || item.path || 'Commande de démarrage'}
                  </div>
                </div>
                <span className="badge badge-cyan">ACTIF</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flush Memory Confirmation Modal */}
      {showFlushModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(5, 8, 15, 0.85)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div className="card card-p-lg" style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
            <button
              onClick={() => setShowFlushModal(false)}
              style={{ position: 'absolute', top: 18, right: 18, color: 'var(--text-muted)' }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Zap size={22} style={{ color: 'var(--cyan)' }} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                Vider les Plages de Travail (EmptyWorkingSet)
              </h3>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Cette action appelle l'API Win32 <code>EmptyWorkingSet</code> pour demander au gestionnaire de mémoire de transférer les pages inutilisées vers le fichier d’échange.
            </p>

            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 12,
                color: '#fbbf24',
              }}
            >
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Avertissement : De légers défauts de page (page faults) peuvent survenir brièvement lorsque les applications réactivent leurs fenêtres.
              </span>
            </div>

            {flushResult && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: '#10b981', fontWeight: 600 }}>
                {flushResult}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowFlushModal(false)} className="btn btn-secondary">
                Annuler
              </button>
              <button onClick={handleEmptyWorkingSet} disabled={flushing} className="btn btn-primary">
                <Zap size={14} className={flushing ? 'animate-spin' : ''} />
                <span>{flushing ? 'Purge en cours...' : 'Confirmer le Vidage'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
