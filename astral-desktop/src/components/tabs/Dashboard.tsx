import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ShieldAlert, Cpu, HardDrive, Wifi,
  Activity, ArrowUpRight, Search, Zap, Gauge, Gamepad2, Layers, RefreshCw
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { useSystem } from '../../context/SystemContext';

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onTabChange: (tab: string) => void;
  firstName?: string;
}

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  return name ? `${time}, ${name}` : 'Cockpit Astral Vanguard';
}

export default function Dashboard({ gamingActive, currentGame, onTabChange, firstName = '' }: Props) {
  const { metrics: ctxMetrics, securityStatus: ctxSec, refreshTelemetry } = useSystem();
  const [metrics, setMetrics] = useState<any>(ctxMetrics);
  const [refreshing, setRefreshing] = useState(false);
  const [errorInfo] = useState<{ message: string; technical?: string } | null>(null);

  useEffect(() => {
    if (ctxMetrics) setMetrics(ctxMetrics);
  }, [ctxMetrics]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshTelemetry();
    setRefreshing(false);
  }, [refreshTelemetry]);

  const ramPct = metrics && metrics.ramTotal > 0
    ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100)
    : 0;

  const isProtected = ctxSec?.realTimeProtection ?? true;

  return (
    <div className="tab-scroll">
      {/* Executive Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting(firstName)}</h1>
          <p className="page-subtitle">
            Supervision matérielle en temps réel et protection active multi-moteurs
          </p>
        </div>

        <div className="page-actions">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Actualisation...' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      {errorInfo && (
        <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
      )}

      {/* Global Security & System Health Status Banner */}
      <div
        className="card card-p-lg"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
          background: isProtected
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)'
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
          borderColor: isProtected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: isProtected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${isProtected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isProtected ? (
              <ShieldCheck size={28} style={{ color: '#10b981' }} />
            ) : (
              <ShieldAlert size={28} style={{ color: '#f59e0b' }} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                {isProtected ? 'Système Protégé & Supervisé' : 'Protection Résidente Incomplète'}
              </h2>
              <span className={`badge ${isProtected ? 'badge-green' : 'badge-amber'}`}>
                {isProtected ? 'BOUCLIER ACTIF' : 'ATTENTION'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {isProtected
                ? 'Moteur Microsoft Defender opérationnel, signatures YARA-X chargées en mémoire et diagnostic IA prêt.'
                : 'La protection en temps réel nécessite votre attention dans l’onglet Sécurité.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onTabChange('security')} className="btn btn-primary">
            <Search size={15} />
            <span>Lancer un Scan Rapide</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Telemetry Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {/* CPU Load */}
        <div className="card card-p">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Charge Processeur
            </span>
            <Cpu size={16} style={{ color: 'var(--cyan)' }} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: '#ffffff', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
              {metrics ? Math.round(metrics.cpuPercent || 0) : 0}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>%</span>
          </div>

          <div style={{ marginTop: 12, height: 4, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${metrics ? Math.min(100, Math.round(metrics.cpuPercent || 0)) : 0}%`,
                background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Cœurs logiques</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)' }}>
              {metrics?.cpuCores || 8} cœurs
            </span>
          </div>
        </div>

        {/* RAM Usage */}
        <div className="card card-p">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Mémoire Vive (RAM)
            </span>
            <Activity size={16} style={{ color: '#818cf8' }} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: '#ffffff', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
              {ramPct}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#818cf8' }}>%</span>
          </div>

          <div style={{ marginTop: 12, height: 4, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${ramPct}%`,
                background: 'linear-gradient(90deg, #6366f1 0%, #818cf8 100%)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Utilisée / Totale</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)' }}>
              {metrics ? `${metrics.ramUsed?.toFixed(1) || '0'} / ${metrics.ramTotal?.toFixed(1) || '0'} Go` : '—'}
            </span>
          </div>
        </div>

        {/* Disk Space */}
        <div className="card card-p">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Espace Disque (C:)
            </span>
            <HardDrive size={16} style={{ color: '#10b981' }} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: '#ffffff', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
              {metrics?.diskFreeGB ? metrics.diskFreeGB.toFixed(0) : '0'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>Go libres</span>
          </div>

          <div style={{ marginTop: 12, height: 4, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${metrics && metrics.diskTotalGB > 0 ? Math.min(100, Math.round(((metrics.diskTotalGB - metrics.diskFreeGB) / metrics.diskTotalGB) * 100)) : 50}%`,
                background: 'linear-gradient(90deg, #059669 0%, #10b981 100%)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Capacité totale</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)' }}>
              {metrics?.diskTotalGB ? `${metrics.diskTotalGB.toFixed(0)} Go` : '—'}
            </span>
          </div>
        </div>

        {/* Network & Gaming State */}
        <div className="card card-p">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Mode & Session
            </span>
            {gamingActive ? <Gamepad2 size={16} style={{ color: 'var(--cyan)' }} /> : <Wifi size={16} style={{ color: 'var(--text-muted)' }} />}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: gamingActive ? 'var(--cyan)' : '#f8fafc', lineHeight: 1.2 }}>
              {gamingActive ? (currentGame || 'Session de Jeu Active') : 'Mode Standard'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              {gamingActive ? 'Priorités ajustées & notifications réduites' : 'Tous les services résidents actifs'}
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`badge ${gamingActive ? 'badge-cyan' : 'badge-purple'}`}>
              {gamingActive ? 'GAMING ACTIF' : 'BUREAUTIQUE'}
            </span>
            <button onClick={() => onTabChange('gaming')} className="btn btn-sm btn-ghost">
              <span>Gérer</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Strip */}
      <div className="card card-p-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Accès Rapide aux Modules</h2>
            <p className="card-subtitle">Fonctions directes d'optimisation et d'inspection</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {/* Action 1: Antivirus */}
          <div
            onClick={() => onTabChange('security')}
            style={{
              padding: 18,
              borderRadius: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={18} style={{ color: 'var(--cyan)' }} />
                <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Sécurité</strong>
              </div>
              <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Scan rapide, règles YARA-X mémoire et rapport multi-moteurs
            </div>
          </div>

          {/* Action 2: Performance */}
          <div
            onClick={() => onTabChange('performance')}
            style={{
              padding: 18,
              borderRadius: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} style={{ color: '#818cf8' }} />
                <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Performance</strong>
              </div>
              <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Purge mémoire consentie EmptyWorkingSet et moniteur de processus
            </div>
          </div>

          {/* Action 3: Speedtest */}
          <div
            onClick={() => onTabChange('network')}
            style={{
              padding: 18,
              borderRadius: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Gauge size={18} style={{ color: '#10b981' }} />
                <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Speedtest</strong>
              </div>
              <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Cadran radial centré, test descendant/montant et DNS rapide
            </div>
          </div>

          {/* Action 4: VPN */}
          <div
            onClick={() => onTabChange('vpn')}
            style={{
              padding: 18,
              borderRadius: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={18} style={{ color: '#f59e0b' }} />
                <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>VPN Communautaire</strong>
              </div>
              <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Relais internationaux vérifiés avec parseur OVPN durci
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
