import { useState, useEffect, useCallback } from 'react';
import { Cpu, HardDrive, Trash2, Zap, RefreshCw, XCircle, Activity, CheckCircle, Clock } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

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

interface ProcessItem {
  pid: number;
  name: string;
  cpu: number;
  memoryMb: number;
}

export default function PerformanceTab({ gamingActive }: { gamingActive: boolean }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [gamingOn, setGamingOn] = useState(gamingActive);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState('');
  const [startup, setStartup] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);
  const [diskHealth, setDiskHealth] = useState<DiskHealth[]>([]);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  const loadMetrics = useCallback(async () => {
    if (!api) return;
    try {
      const m = await api.getMetrics();
      if (m?.success) setMetrics(m.data);
    } catch {}
  }, []);

  const loadDiskHealth = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.getDiskHealth?.();
      if (res?.success && Array.isArray(res.disks)) {
        setDiskHealth(res.disks);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadMetrics();
    loadDiskHealth();
    const id = setInterval(loadMetrics, 4000);
    return () => clearInterval(id);
  }, [loadMetrics, loadDiskHealth]);

  useEffect(() => {
    setGamingOn(gamingActive);
  }, [gamingActive]);

  const toggleGamingMode = async () => {
    if (!api) return;
    setErrorInfo(null);
    try {
      if (!gamingOn) {
        await api.gamingModeOn();
        await api.networkGamingOn();
        setGamingOn(true);
        setNotice('🎮 Plan Haute Performance Windows activé.');
      } else {
        await api.gamingModeOff();
        await api.networkGamingOff();
        setGamingOn(false);
        setNotice('Plan d\'alimentation standard restauré.');
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lors du basculement du mode performance', technical: err.message });
    }
    setTimeout(() => setNotice(''), 3000);
  };

  const runCleanup = async () => {
    if (!api) return;
    setCleaning(true);
    setErrorInfo(null);
    try {
      const [ramRes, diskRes] = await Promise.all([api.cleanRam(), api.diskCleanup()]);
      const freed = diskRes?.freedMB || 0;
      setCleanResult(`Mémoire RAM purgée · ${freed} Mo libérés sur les caches temporaires.`);
      loadMetrics();
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur pendant le nettoyage système', technical: err.message });
    } finally {
      setCleaning(false);
      setTimeout(() => setCleanResult(''), 4500);
    }
  };

  const loadStartup = async () => {
    if (!api) return;
    setLoadingStartup(true);
    setErrorInfo(null);
    try {
      const res = await api.getStartup();
      setStartup(res?.items || []);
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur lecture programmes au démarrage', technical: err.message });
    } finally {
      setLoadingStartup(false);
    }
  };

  const handleDisableStartup = async (item: any) => {
    if (!api) return;
    const name = item.name || item.Name;
    const location = item.location || item.Location || 'HKCU';
    try {
      await api.disableStartup(name, location);
      setStartup((prev) => prev.filter((i) => (i.name || i.Name) !== name));
      setNotice(`✅ Entrée "${name}" désactivée au démarrage.`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible de désactiver cette entrée', technical: err.message });
    }
  };

  const ramPct = metrics ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const diskTotal = metrics ? metrics.diskUsedGB + metrics.diskFreeGB : 0;
  const diskPct = diskTotal ? Math.round((metrics.diskUsedGB / diskTotal) * 100) : 0;

  return (
    <div className="tab-scroll" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(0, 212, 255, 0.15)',
              border: '1px solid var(--border-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Performance & Maintenance Système
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Gestionnaire de démarrage · Purge RAM & Disque · Santé SMART matérielle
            </p>
          </div>
        </div>

        {gamingOn && (
          <div
            className="badge badge-cyan"
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span className="badge-dot" style={{ backgroundColor: 'var(--cyan)' }} />
            <span>HAUTE PERFORMANCE ACTIVE</span>
          </div>
        )}
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid var(--border-violet)',
            color: 'var(--violet)',
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 20,
          }}
        >
          {notice}
        </div>
      )}

      {cleanResult && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: 'rgba(16, 217, 160, 0.1)',
            border: '1px solid var(--border-green)',
            color: 'var(--green)',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <CheckCircle size={16} />
          <span>{cleanResult}</span>
        </div>
      )}

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Metrics Row (4 Gauges) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Charge Processeur (CPU)</span>
          <p style={{ margin: '8px 0 0 0', fontSize: 28, fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>
            {metrics?.cpuPercent ?? 0}%
          </p>
          <div style={{ width: '100%', height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 12, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, metrics?.cpuPercent ?? 0)}%`,
                height: '100%',
                backgroundColor: 'var(--cyan)',
                boxShadow: '0 0 8px rgba(0, 212, 255, 0.5)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Mémoire Vive (RAM)</span>
          <p style={{ margin: '8px 0 0 0', fontSize: 28, fontWeight: 800, color: 'var(--violet)', fontFamily: 'var(--mono)' }}>
            {ramPct}%
          </p>
          <div style={{ width: '100%', height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 12, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, ramPct)}%`,
                height: '100%',
                backgroundColor: 'var(--violet)',
                boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Espace Disque Système (C:)</span>
          <p style={{ margin: '8px 0 0 0', fontSize: 28, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--mono)' }}>
            {diskPct}%
          </p>
          <p style={{ margin: '6px 0 0 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {metrics?.diskFreeGB ?? 0} Go disponibles
          </p>
        </div>

        <div className="glass-card" style={{ padding: 18, borderRadius: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Temps de Fonctionnement</span>
          <p style={{ margin: '8px 0 0 0', fontSize: 28, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
            {metrics?.uptimeHours ?? 0}h
          </p>
          <p style={{ margin: '6px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Session système continue
          </p>
        </div>
      </div>

      {/* Action Row: Cleaner & High Perf Plan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={16} style={{ color: 'var(--violet)' }} />
              <span>Nettoyeur de Résidus & Cache RAM</span>
            </h3>
            <button
              onClick={runCleanup}
              disabled={cleaning}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {cleaning ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
              <span>{cleaning ? 'Nettoyage en cours...' : 'Nettoyer maintenant'}</span>
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Purge sécurisée du cache de travail des applications, libération des fichiers temporaires dans <code style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>%TEMP%</code> et vidage de la corbeille.
          </p>
        </div>

        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} style={{ color: 'var(--cyan)' }} />
              <span>Plan d'Alimentation Haute Performance</span>
            </h3>
            <button
              onClick={toggleGamingMode}
              className={`btn ${gamingOn ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12, padding: '6px 14px' }}
            >
              {gamingOn ? 'Plan Actif' : 'Standard'}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Bascule Windows sur le profil d'énergie maximal, débloquant les fréquences CPU pour éliminer tout throttling lors de sessions intensives.
          </p>
        </div>
      </div>

      {/* Startup Apps & Disk Health Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {/* Startup Programs */}
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} style={{ color: 'var(--violet)' }} />
                <span>Applications au Démarrage ({startup.length})</span>
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Clés de démarrage Windows (Run & RunOnce)
              </p>
            </div>
            <button
              onClick={loadStartup}
              disabled={loadingStartup}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} className={loadingStartup ? 'animate-spin' : ''} />
              <span>{startup.length === 0 ? 'Charger' : 'Actualiser'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {startup.length === 0 && !loadingStartup ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                Cliquez sur « Charger » pour analyser les programmes exécutés au boot.
              </p>
            ) : (
              startup.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: 8 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name || item.Name}
                    </p>
                    <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.command || item.Command}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDisableStartup(item)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                    title="Désactiver ce programme au démarrage"
                  >
                    <XCircle size={15} style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Disk Health SMART */}
        <div className="glass-card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={16} style={{ color: 'var(--green)' }} />
              <span>Santé Matérielle des Disques (SMART)</span>
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{diskHealth.length} unité(s)</span>
              <button
                onClick={loadDiskHealth}
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                title="Actualiser la santé des disques"
              >
                <RefreshCw size={11} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diskHealth.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
                Inspection matérielle en cours...
              </p>
            ) : (
              diskHealth.map((d, idx) => {
                const isHealthy = d.status === 'OK' || d.health === 'Sain (SMART OK)' || d.HealthStatus === 'Healthy' || d.health === 'Bon';
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {d.model || d.FriendlyName || `Disque physique #${idx + 1}`}
                      </p>
                      <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                        Technologie : {d.mediaType || d.MediaType || 'SSD NVMe / SATA'}{d.sizeGB ? ` · ${d.sizeGB} Go` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: isHealthy ? 'var(--green)' : 'var(--orange)',
                          boxShadow: isHealthy ? '0 0 8px rgba(16, 217, 160, 0.6)' : 'none',
                        }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 700, color: isHealthy ? 'var(--green)' : 'var(--orange)' }}>
                        {d.health || (isHealthy ? 'Sain (SMART OK)' : d.status)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
