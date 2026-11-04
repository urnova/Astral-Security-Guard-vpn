import { useState, useEffect, useMemo } from 'react';
import {
  Wifi, Play, CheckCircle2, AlertTriangle,
  Globe, Router, Activity, X, Zap, ArrowDown, ArrowUp, RefreshCw,
  ShieldCheck, RotateCcw, Info, Lock, Server
} from 'lucide-react';

const api = (window as any).vanguard;

const DNS_PRESETS = [
  { id: 'cloudflare', name: 'Cloudflare', provider: 'Cloudflare', label: '1.1.1.1 / 1.0.0.1 · Anycast', ip: '1.1.1.1' },
  { id: 'google',     name: 'Google DNS', provider: 'Google',     label: '8.8.8.8 / 8.8.4.4 · Anycast', ip: '8.8.8.8' },
  { id: 'quad9',      name: 'Quad9',      provider: 'Quad9',      label: '9.9.9.9 / 149.112.112.112 · Sécurité', ip: '9.9.9.9' },
  { id: 'opendns',    name: 'Cisco OpenDNS', provider: 'OpenDNS', label: '208.67.222.222 · Filtrage', ip: '208.67.222.222' },
  { id: 'auto',       name: 'Automatique (DHCP)', provider: 'FAI', label: 'Attribution dynamique par votre box Internet', ip: 'auto' },
];

interface NetworkInfo {
  interfaceName: string;
  ip:            string;
  externalIp?:   string;
  gateway:       string;
  dns:           string;
  isp:           string;
  macAddress:    string;
  type:          string;
  ipv6Active?:   boolean;
  ipv6State?:    'enabled' | 'disabled' | 'unknown';
  probes?: {
    gateway?: { status: string; latencyMs: number | null; detail: string };
    gatewayMs?: number | null;
    cloudflare?: { target: string; protocol: string; latencyMs: number | null; success: boolean };
    cloudflareMs?: number | null;
    google?: { target: string; protocol: string; latencyMs: number | null; success: boolean };
    googleMs?: number | null;
  };
}

interface SpeedReportDimension {
  status: string;
  grade: string | null;
  description: string;
  [key: string]: any;
}

interface SpeedResult {
  downloadMbps: number | null;
  uploadMbps: number | null;
  down?: number | null;
  up?: number | null;
  pingMs: number | null;
  jitterMs: number | null;
  ping?: number | null;
  jitter?: number | null;
  loadedDownPingMs?: number | null;
  loadedUpPingMs?: number | null;
  bufferbloatDownMs?: number | null;
  bufferbloatUpMs?: number | null;
  bufferbloatDownProbeCount?: number;
  bufferbloatUpProbeCount?: number;
  probeFailureRatePct?: number | null;
  bytesTransferredMB?: number;
  timestamp?: string;
  report?: {
    isComplete: boolean;
    overallGrade: string;
    statusLabel: string;
    summary: string;
    transfer: SpeedReportDimension;
    reactivity: SpeedReportDimension;
    stability: SpeedReportDimension;
    conventionNotice?: string;
  };
}

interface SpeedHistoryPoint {
  time: string;
  down: number;
  up: number;
  grade?: string;
}

export default function NetworkTab({ gamingActive: _gamingActive }: { gamingActive: boolean }) {
  const [netInfo, setNetInfo]         = useState<NetworkInfo | null>(null);
  const [selectedDns, setSelectedDns] = useState('auto');
  const [testing, setTesting]         = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [livePhase, setLivePhase]     = useState<string>('');
  const [livePhaseType, setLivePhaseType] = useState<'ping' | 'download' | 'upload' | 'download-complete' | ''>('');
  const [liveDownMbps, setLiveDownMbps] = useState<number | null>(null);
  const [liveUpMbps, setLiveUpMbps]   = useState<number | null>(null);

  const [history, setHistory]         = useState<SpeedHistoryPoint[]>(() => {
    try {
      const raw = localStorage.getItem('astral_speedtest_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [dnsBenchmarks, setDnsBenchmarks] = useState<Record<string, { latencyMs: number | null; resolutionMs?: number | null; tcpConnectMs?: number | null; status: string }>>({});
  const [benchmarkingDns, setBenchmarkingDns] = useState(false);

  const [notice, setNotice]           = useState('');
  const [error, setError]             = useState('');

  // TCP stack and in-page action states
  const [stackStatus, setStackStatus] = useState<{ autotuning?: string; rss?: string; heuristics?: string; dnsCacheEntries?: number; isElevated?: boolean } | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionLog, setActionLog]     = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<{ message: string } | null>(null);

  const loadStackStatus = async () => {
    try {
      const res = await api?.getTcpStackStatus?.();
      if (res?.success && res.stack) {
        setStackStatus(res.stack);
      }
    } catch {}
  };

  const loadDiagnostics = () => {
    api?.getNetworkDiagnostics?.().then((d: any) => {
      if (!d) return;
      setNetInfo({
        interfaceName: d.interface || d.adapterName || 'Interface active',
        ip:            d.localIp || '—',
        externalIp:    d.externalIp,
        gateway:       d.gateway || '—',
        dns:           d.dns || d.friendlyDns || '—',
        isp:           d.isp || d.provider || 'Non résolu',
        macAddress:    d.macAddress || '—',
        type:          d.connectionType || d.type || 'Ethernet',
        ipv6Active:    d.ipv6Active,
        ipv6State:     d.ipv6State,
        probes:        d.probes,
      });

      if (d.dns?.includes('8.8.8.8')) setSelectedDns('google');
      else if (d.dns?.includes('1.1.1.1')) setSelectedDns('cloudflare');
      else if (d.dns?.includes('9.9.9.9')) setSelectedDns('quad9');
      else if (d.dns?.includes('208.67')) setSelectedDns('opendns');
      else setSelectedDns('auto');
    }).catch(() => {});
  };

  useEffect(() => {
    if (!api) return;

    loadDiagnostics();
    loadStackStatus();

    api?.getProfile?.().then((prof: any) => {
      if (prof?.lastSpeedResult) {
        setSpeedResult(prof.lastSpeedResult);
      }
      if (prof?.network?.selectedDns) {
        setSelectedDns(prof.network.selectedDns);
      }
    }).catch(() => {});

    const unsub = api.on?.('network-event', (d: any) => {
      if (d?.type === 'speedtest-progress') {
        if (d.phase === 'download') {
          if (typeof d.currentMbps === 'number') {
            setLiveDownMbps(d.currentMbps);
          }
        } else if (d.phase === 'download-complete') {
          const finalVal = d.finalDownMbps ?? d.downloadMbps ?? d.currentMbps;
          if (typeof finalVal === 'number') {
            setLiveDownMbps(finalVal);
          }
        } else if (d.phase === 'upload') {
          if (typeof d.finalDownMbps === 'number') {
            setLiveDownMbps(d.finalDownMbps);
          }
          if (typeof d.currentMbps === 'number') {
            setLiveUpMbps(d.currentMbps);
          }
        }

        if (d.phase) {
          setLivePhaseType(d.phase as any);
          const phaseLabels: Record<string, string> = {
            ping: 'Sondes de latence et gigue au repos (TCP direct 1.1.1.1:443)…',
            download: 'Téléchargement multi-flux & sonde bufferbloat en cours…',
            'download-complete': 'Réception finalisée · Début envoi multi-flux…',
            upload: 'Envoi multi-flux & sonde bufferbloat en cours…',
          };
          setLivePhase(phaseLabels[d.phase] || d.phase);
        }
      } else if (d?.type === 'speedtest-complete' && d.result) {
        setTesting(false);
        const r: SpeedResult = d.result;
        setSpeedResult(r);
        setLiveDownMbps(r.downloadMbps);
        setLiveUpMbps(r.uploadMbps);
        setLivePhase('');
        setLivePhaseType('');

        if (r.downloadMbps !== null && r.uploadMbps !== null) {
          const newPoint: SpeedHistoryPoint = {
            time: r.timestamp || new Date().toLocaleTimeString('fr-FR'),
            down: r.downloadMbps,
            up: r.uploadMbps,
            grade: r.report?.overallGrade || '—',
          };
          setHistory(prev => {
            const filtered = prev.filter(p => p.time !== newPoint.time);
            const updated = [...filtered.slice(-9), newPoint];
            try { localStorage.setItem('astral_speedtest_history', JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      } else if (d?.type === 'speedtest-cancelled') {
        setTesting(false);
        setLivePhase('');
        setLivePhaseType('');
        setNotice('Test de débit annulé par l\'utilisateur. Sockets libérés.');
        setTimeout(() => setNotice(''), 4000);
      } else if (d?.type === 'speedtest-error') {
        setTesting(false);
        setLivePhase('');
        setLivePhaseType('');
        setError(d.error || 'Erreur lors du test de débit.');
      }
    });

    return () => {
      unsub?.();
    };
  }, []);

  const runSpeedTest = async () => {
    if (testing) return;
    setTesting(true);
    setError('');
    setNotice('');
    setLiveDownMbps(null);
    setLiveUpMbps(null);
    setLivePhase('Initialisation des sondes TCP multi-flux…');

    try {
      const res = await api?.runSpeedTest?.();
      if (res?.success && res.result) {
        setSpeedResult(res.result);
      } else if (res?.cancelled) {
        setNotice('Test de débit interrompu.');
      } else if (res?.error) {
        setError(res.error);
      }
    } catch (e: any) {
      setError(e.message || 'Impossible d\'exécuter le test de débit.');
    } finally {
      setTesting(false);
      setLivePhase('');
      setLivePhaseType('');
    }
  };

  const cancelSpeedTest = async () => {
    try {
      await api?.cancelSpeedtest?.();
      setLivePhase('Annulation en cours…');
    } catch {}
  };

  const applyDns = async (id: string, name: string) => {
    setSelectedDns(id);
    try {
      const res = await api?.setDns?.(id);
      if (res?.success) {
        setNotice(res.message || `Résolveur ${name} appliqué.`);
        setTimeout(() => setNotice(''), 4000);
        loadDiagnostics();
        api?.saveUserProfile?.({ network: { selectedDns: id } }).catch(() => {});
      } else {
        setError(res?.error || 'Échec lors de l\'application du DNS.');
      }
    } catch (e: any) {
      setError(e.message || 'Erreur application DNS');
    }
  };

  const handleBenchmarkDns = async () => {
    if (benchmarkingDns) return;
    setBenchmarkingDns(true);
    try {
      const res = await api?.dnsBenchmark?.();
      if (res?.success && Array.isArray(res.results)) {
        const map: Record<string, { latencyMs: number | null; resolutionMs?: number | null; tcpConnectMs?: number | null; status: string }> = {};
        for (const item of res.results) {
          map[item.id] = {
            latencyMs: item.resolutionMs ?? item.latencyMs,
            resolutionMs: item.resolutionMs,
            tcpConnectMs: item.tcpConnectMs,
            status: item.status,
          };
        }
        setDnsBenchmarks(map);
      }
    } catch {}
    finally {
      setBenchmarkingDns(false);
    }
  };

  const handleFlushDns = async () => {
    setActionInProgress('flushDns');
    setActionLog(null);
    try {
      const res = await api?.flushDnsCache?.();
      if (res?.success) {
        setActionLog('✓ Cache DNS Windows purgé avec succès.');
        loadStackStatus();
      } else {
        setActionLog(`⚠️ ${res?.error || 'Erreur lors de la purge DNS.'}`);
      }
    } catch (e: any) {
      setActionLog(`⚠️ Erreur : ${e.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOptimizeTcp = async () => {
    setActionInProgress('optimizeTcp');
    setActionLog(null);
    try {
      const res = await api?.optimizeNetwork?.();
      if (res?.success) {
        setActionLog(`✓ ${res.message || 'Pile TCP/IP Windows calibrée et sauvegarde conservée.'}`);
        loadStackStatus();
      } else {
        setActionLog(`⚠️ ${res?.error || 'Échec du calibrage de la pile TCP/IP.'}`);
      }
    } catch (e: any) {
      setActionLog(`⚠️ Erreur : ${e.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRestoreDefaults = async (force = false) => {
    setActionInProgress('restore');
    setActionLog(null);
    setConflictNotice(null);
    try {
      const resTcp = await api?.restoreTcpStack?.(force ? { force: true } : undefined);
      const resDns = await api?.restorePreviousDns?.(force ? { force: true } : undefined);

      if (resTcp?.conflict || resDns?.conflict) {
        setConflictNotice({
          message: resTcp?.conflict && resDns?.conflict
            ? 'Les paramètres TCP/IP et serveurs DNS ont été modifiés en dehors de Vanguard depuis leur application. Restauration suspendue pour préserver vos réglages.'
            : (resTcp?.message || resDns?.message || 'Conflit détecté : modification survenue en dehors de Vanguard.'),
        });
        setActionLog('⚠️ Conflit détecté : aucun écrasement automatique.');
        return;
      }

      if (resTcp?.success || resDns?.success) {
        setActionLog(`✓ Restauration terminée : ${resTcp?.message || ''} ${resDns?.message || ''}`);
        loadStackStatus();
        loadDiagnostics();
      } else {
        setActionLog(`⚠️ ${resTcp?.error || resDns?.error || 'Erreur lors de la restauration.'}`);
      }
    } catch (e: any) {
      setActionLog(`⚠️ Erreur : ${e.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const currentGaugeValue = useMemo(() => {
    if (livePhaseType === 'download') return liveDownMbps ?? 0;
    if (livePhaseType === 'upload') return liveUpMbps ?? 0;
    if (speedResult?.downloadMbps !== null && speedResult?.downloadMbps !== undefined) {
      return speedResult.downloadMbps;
    }
    return 0;
  }, [livePhaseType, liveDownMbps, liveUpMbps, speedResult]);

  const maxGaugeScale = useMemo(() => {
    if (currentGaugeValue > 2500) return 10000;
    if (currentGaugeValue > 1000) return 2500;
    if (currentGaugeValue > 500) return 1000;
    if (currentGaugeValue > 100) return 500;
    return 100;
  }, [currentGaugeValue]);

  const gaugeRadius = 120;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const gaugePercent = Math.min(100, (currentGaugeValue / maxGaugeScale) * 100);
  const gaugeOffset = gaugeCircumference - (gaugeCircumference * (gaugePercent / 100));

  const overallGrade = speedResult?.report?.overallGrade || '—';
  const gradeColor = useMemo(() => {
    if (overallGrade === 'A++' || overallGrade === 'A+') return 'var(--a1)';
    if (overallGrade === 'A') return '#22c55e';
    if (overallGrade === 'B') return '#facc15';
    if (overallGrade === 'C') return '#fb923c';
    if (overallGrade === 'D') return '#ef4444';
    return 'var(--muted)';
  }, [overallGrade]);

  return (
    <div className="page-scroll">
      <div className="page">

        {/* ── Page Header ── */}
        <div className="page-header" style={{ marginBottom: 18 }}>
          <div>
            <h1>Connexion et diagnostic</h1>
            <p className="sub">Audit de latence, test de débit adaptatif et calibration de la pile réseau Windows.</p>
          </div>
        </div>

        {/* ── Notice & Error Banners ── */}
        {notice && (
          <div style={{
            marginBottom: 16,
            padding: '12px 18px',
            background: 'rgba(34,197,94,.08)',
            border: '1px solid rgba(34,197,94,.25)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            color: '#22c55e',
            display: 'flex', gap: 10, alignItems: 'center'
          }}>
            <CheckCircle2 size={15} /> {notice}
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: 16,
            padding: '12px 18px',
            background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            color: '#ef4444',
            display: 'flex', gap: 10, alignItems: 'center'
          }}>
            <AlertTriangle size={15} /> {error}
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Grand Bloc Principal (Hero 2 Colonnes) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 16,
          alignItems: 'stretch',
          marginBottom: 16,
        }}>

          {/* Colonne Gauche : Test de Débit Adaptatif & Jauge Dynamique */}
          <div className="card card-p-lg card-hero" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 24,
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Test de Débit Adaptatif</div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                    Télémesure multi-flux directe · Arrêt immédiat à l'annulation
                  </p>
                </div>
                <span className="chip" style={{ fontSize: 10.5, fontWeight: 700 }}>
                  Multi-Flux
                </span>
              </div>

              {/* Note d'information préalable */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                padding: '8px 12px',
                fontSize: 11,
                color: 'var(--muted)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                margin: '10px 0',
              }}>
                <Info size={14} style={{ color: 'var(--a1)', flexShrink: 0 }} />
                <span>Volume transféré variable selon le débit de la ligne. Sockets fermés à l'annulation.{speedResult?.bytesTransferredMB ? ` — ${speedResult.bytesTransferredMB.toFixed(0)} Mo mesurés.` : ''}</span>
              </div>

              {/* Live Streaming Pills */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '8px 0' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: livePhaseType === 'download' ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.03)',
                  color: livePhaseType === 'download' ? 'var(--a1)' : (liveDownMbps !== null || speedResult?.downloadMbps !== null ? 'var(--text)' : 'var(--muted)'),
                  border: `1px solid ${livePhaseType === 'download' ? 'var(--a1)' : 'var(--border)'}`,
                  transition: 'all 0.2s ease',
                }}>
                  <ArrowDown size={12} />
                  <span>Réception : <b>{liveDownMbps !== null ? `${liveDownMbps} Mbps` : (speedResult?.downloadMbps !== null && speedResult?.downloadMbps !== undefined ? `${speedResult.downloadMbps} Mbps` : '—')}</b></span>
                </span>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: livePhaseType === 'upload' ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.03)',
                  color: livePhaseType === 'upload' ? '#a78bfa' : (liveUpMbps !== null || speedResult?.uploadMbps !== null ? 'var(--text)' : 'var(--muted)'),
                  border: `1px solid ${livePhaseType === 'upload' ? '#a78bfa' : 'var(--border)'}`,
                  transition: 'all 0.2s ease',
                }}>
                  <ArrowUp size={12} />
                  <span>Envoi : <b>{liveUpMbps !== null ? `${liveUpMbps} Mbps` : (speedResult?.uploadMbps !== null && speedResult?.uploadMbps !== undefined ? `${speedResult.uploadMbps} Mbps` : '—')}</b></span>
                </span>
              </div>

              {/* Jauge Dynamique sans plafond arbitraire */}
              <div className="gauge" style={{ maxWidth: 260, margin: '12px auto 8px' }}>
                <svg viewBox="0 0 300 170">
                  <path className="bgp" d="M30 150 A120 120 0 0 1 270 150" strokeWidth="16" />
                  <path
                    className="fgp"
                    d="M30 150 A120 120 0 0 1 270 150"
                    strokeWidth="16"
                    style={{
                      strokeDashoffset: gaugeOffset,
                      stroke: livePhaseType === 'upload' ? '#a78bfa' : 'var(--a1)',
                      transition: 'stroke-dashoffset 0.25s ease, stroke 0.3s ease'
                    }}
                  />
                </svg>
                <div className="val" style={{ bottom: 12 }}>
                  <div className="big" style={{
                    fontSize: 42,
                    fontWeight: 800,
                    fontFamily: 'Space Grotesk, sans-serif',
                    color: livePhaseType === 'upload' ? '#a78bfa' : 'var(--a1)'
                  }}>
                    {livePhaseType === 'download'
                      ? (liveDownMbps !== null ? liveDownMbps : '…')
                      : livePhaseType === 'upload'
                      ? (liveUpMbps !== null ? liveUpMbps : '…')
                      : speedResult?.downloadMbps !== null && speedResult?.downloadMbps !== undefined
                      ? speedResult.downloadMbps
                      : (testing ? '…' : '—')}
                  </div>
                  <div className="mut sm" style={{
                    letterSpacing: '0.06em',
                    fontWeight: 700,
                    fontSize: 10,
                    color: livePhaseType === 'upload' ? '#a78bfa' : (livePhaseType === 'download' ? 'var(--a1)' : 'var(--muted)')
                  }}>
                    {livePhaseType === 'download'
                      ? '↓ RÉCEPTION EN DIRECT'
                      : livePhaseType === 'upload'
                      ? '↑ TÉLÉVERSEMENT EN DIRECT'
                      : testing
                      ? livePhase || 'TEST EN COURS'
                      : 'MBPS (DÉBIT DESCENDANT)'}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>
                    Échelle dynamique : max {maxGaugeScale >= 1000 ? `${maxGaugeScale / 1000} Gbit/s` : `${maxGaugeScale} Mbit/s`}
                  </div>
                </div>
              </div>

              {testing && (
                <div style={{ maxWidth: 260, margin: '4px auto 10px' }}>
                  <div className="bar" style={{ height: 4 }}>
                    <i style={{
                      width: `${Math.max(6, gaugePercent)}%`,
                      background: livePhaseType === 'upload' ? '#a78bfa' : 'var(--a1)',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', textAlign: 'center', marginTop: 4 }}>
                    {livePhase}
                  </span>
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '12px 0 14px' }}>
                <button
                  className="btn"
                  style={{ padding: '10px 24px', fontSize: 12.5, fontWeight: 700 }}
                  onClick={runSpeedTest}
                  disabled={testing}
                >
                  {testing ? (
                    <>
                      <span className="spinner spinner-sm" />
                      <span>Mesure en cours…</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} fill="currentColor" />
                      <span>Lancer le test de débit</span>
                    </>
                  )}
                </button>
                {testing && (
                  <button
                    className="btn btn-ghost"
                    onClick={cancelSpeedTest}
                    style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                  >
                    Annuler
                  </button>
                )}
              </div>

              {/* Bandeau Télémesure Réelle */}
              <div className="grid g4" style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>LATENCE (REPOS)</small>
                  <b style={{ fontSize: 12.5, color: '#22c55e' }}>
                    {speedResult?.pingMs !== null && speedResult?.pingMs !== undefined ? `${speedResult.pingMs} ms` : '—'}
                  </b>
                </div>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>GIGUE</small>
                  <b style={{ fontSize: 12.5, color: 'var(--text)' }}>
                    {speedResult?.jitterMs !== null && speedResult?.jitterMs !== undefined ? `${speedResult.jitterMs} ms` : '—'}
                  </b>
                </div>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>BUFFERBLOAT (CHARGE)</small>
                  <b style={{ fontSize: 12.5, color: speedResult?.bufferbloatDownMs !== null && (speedResult?.bufferbloatDownMs ?? 0) <= 20 ? '#22c55e' : '#facc15' }}>
                    {speedResult?.bufferbloatDownMs !== null && speedResult?.bufferbloatDownMs !== undefined ? `+${speedResult.bufferbloatDownMs} ms` : 'Non mesuré'}
                  </b>
                  <small style={{ fontSize: 8.5, color: 'var(--muted)', display: 'block', marginTop: 1 }}>
                    {speedResult?.bufferbloatDownMs !== null && speedResult?.bufferbloatDownMs !== undefined
                      ? `(${speedResult.bufferbloatDownProbeCount ?? 2}/2 sondes)`
                      : 'Non échantillonné'}
                  </small>
                </div>
                <div>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 600, display: 'block' }}>VOLUME</small>
                  <b style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    {speedResult?.bytesTransferredMB ? `${speedResult.bytesTransferredMB} Mo` : '—'}
                  </b>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne Droite : Synthèse Déterministe sur 3 Dimensions & Actions Directes */}
          <div className="card card-p-lg" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 24,
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Synthèse & Actions Directes</div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                    Notation 3 dimensions déterministe & calibration intégrée
                  </p>
                </div>
                <span className="chip" style={{ fontSize: 10.5, color: gradeColor, borderColor: `${gradeColor}40`, fontWeight: 700 }}>
                  {overallGrade !== '—' ? `Classe ${overallGrade}` : 'Non certifié'}
                </span>
              </div>

              {/* Bilan Global Déterministe */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${gradeColor}30`,
                borderRadius: 'var(--r-sm)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 12,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: `${gradeColor}15`,
                  border: `2px solid ${gradeColor}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 20,
                  fontWeight: 900,
                  color: gradeColor,
                  flexShrink: 0,
                }}>
                  {overallGrade}
                </div>
                <div>
                  <b style={{ fontSize: 12.5, color: 'var(--text)', display: 'block' }}>
                    {speedResult?.report?.statusLabel || 'En attente de diagnostic complet'}
                  </b>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                    {speedResult?.report?.summary || 'Lancez le test de débit pour obtenir le bilan sur les 3 dimensions de votre ligne.'}
                  </p>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)', display: 'block', marginTop: 3 }}>
                    <span
                      title="Règle anti-masquage : la note globale est plafonnée à min(dimensions) + 1 pour refléter le facteur limitant."
                      style={{ cursor: 'help', borderBottom: '1px dashed rgba(255,255,255,0.2)', paddingBottom: 1 }}
                    >
                      ⓘ Méthode de notation
                    </span>
                  </small>
                </div>
              </div>

              {/* Les 3 Dimensions Distinctes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* 1. Capacité de Transfert */}
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>1. Capacité de transfert</span>
                    <small style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block' }}>
                      {speedResult?.report?.transfer?.description || 'Débit descendant et montant réels'}
                    </small>
                  </div>
                  <span className="chip" style={{ fontSize: 10, fontWeight: 700 }}>
                    {speedResult?.report?.transfer?.grade || '—'}
                  </span>
                </div>

                {/* 2. Réactivité au repos */}
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>2. Réactivité (Repos)</span>
                    <small style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block' }}>
                      {speedResult?.report?.reactivity?.description || 'Latence aller-retour & gigue'}
                    </small>
                  </div>
                  <span className="chip" style={{ fontSize: 10, fontWeight: 700 }}>
                    {speedResult?.report?.reactivity?.grade || '—'}
                  </span>
                </div>

                {/* 3. Stabilité sous charge (Bufferbloat) */}
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>3. Stabilité sous charge</span>
                    <small style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block' }}>
                      {speedResult?.report?.stability?.description ||
                        (speedResult?.bufferbloatDownProbeCount !== undefined
                          ? `Élévation ponctuelle sous charge (${speedResult.bufferbloatDownProbeCount}/2 sondes réussies)`
                          : 'Élévation de latence & échecs de sondes')}
                    </small>
                  </div>
                  <span className="chip" style={{ fontSize: 10, fontWeight: 700 }}>
                    {speedResult?.report?.stability?.grade || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Directes Intégrées (Pas de modal drawer détaché) */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.04em' }}>
                Actions de maintenance réseau
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={handleFlushDns}
                  disabled={actionInProgress !== null}
                  style={{ fontSize: 11, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <RefreshCw size={12} className={actionInProgress === 'flushDns' ? 'spin' : ''} />
                  <span>Purger cache DNS</span>
                </button>

                <button
                  className="btn btn-sm"
                  onClick={handleOptimizeTcp}
                  disabled={actionInProgress !== null}
                  style={{ fontSize: 11, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Zap size={12} />
                  <span>Calibrer pile TCP/IP</span>
                </button>

                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleRestoreDefaults(false)}
                  disabled={actionInProgress !== null}
                  style={{ fontSize: 11, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <RotateCcw size={12} />
                  <span>Restaurer origine</span>
                </button>
              </div>

              {actionLog && (
                <div style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                  color: actionLog.startsWith('✓') ? '#22c55e' : '#facc15'
                }}>
                  {actionLog}
                </div>
              )}

              {conflictNotice && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  fontSize: 11,
                }}>
                  <div style={{ fontWeight: 700, color: '#facc15', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={13} />
                    <span>Conflit de configuration détecté</span>
                  </div>
                  <p style={{ margin: '0 0 8px', color: 'var(--text)', lineHeight: 1.4 }}>
                    {conflictNotice.message}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10.5, padding: '4px 8px' }}
                      onClick={() => setConflictNotice(null)}
                    >
                      Conserver l'état actuel
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 10.5, padding: '4px 8px', background: '#eab308', color: '#000', borderColor: '#eab308' }}
                      onClick={() => handleRestoreDefaults(true)}
                    >
                      Forcer la restauration d'origine
                    </button>
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                <span>Carte : <b style={{ color: 'var(--text)' }}>{netInfo?.interfaceName || 'Détection…'}</b></span>
                <span>Passerelle : <b style={{ color: 'var(--text)' }}>{netInfo?.gateway || '—'}</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section Intermédiaire : DNS Système & Options Avancées ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 16,
          alignItems: 'stretch',
          marginBottom: 16,
        }}>

          {/* Carte A : Résolveurs DNS Système */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Résolveurs DNS Système</div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                    Serveurs de résolution configurés sur l'adaptateur actif
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleBenchmarkDns}
                  disabled={benchmarkingDns}
                  style={{ fontSize: 10.5, padding: '4px 8px' }}
                >
                  {benchmarkingDns ? 'Mesure…' : 'Mesurer résolution'}
                </button>
              </div>

              <div className="list">
                {DNS_PRESETS.map(d => {
                  const isActive = selectedDns === d.id;
                  const bench = dnsBenchmarks[d.id];

                  return (
                    <div
                      key={d.id}
                      className={`row clickable${isActive ? ' selected' : ''}`}
                      onClick={() => applyDns(d.id, d.name)}
                      style={{ padding: '8px 12px', borderRadius: 8 }}
                    >
                      <div className="rt">
                        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          {d.name}
                          {isActive && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                              ACTIF
                            </span>
                          )}
                        </b>
                        <small style={{ fontSize: 10.5, color: 'var(--muted)' }}>{d.label}</small>
                      </div>

                      {bench && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            color: bench.status === 'unreachable' ? 'var(--danger)' : bench.resolutionMs && bench.resolutionMs < 25 ? '#22c55e' : '#facc15',
                            fontWeight: 600,
                            fontSize: 11,
                            display: 'block'
                          }}>
                            {bench.resolutionMs !== null && bench.resolutionMs !== undefined
                              ? `${bench.resolutionMs} ms (Requête A)`
                              : bench.tcpConnectMs !== null && bench.tcpConnectMs !== undefined
                              ? `${bench.tcpConnectMs} ms (TCP)`
                              : 'Échec résolution'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 11,
                color: 'var(--muted)',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}>
                <Lock size={14} style={{ color: 'var(--a1)', flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>DNS sur HTTPS (DoH) :</b> Vanguard ne configure pas DoH dans cette version. Le chiffrement DNS au niveau de l'OS requiert Windows 11 et une configuration spécifique des modèles d'adressage IP dans les paramètres réseau Windows.
                </span>
              </div>
            </div>
          </div>

          {/* Carte B : Paramètres Réseau Avancés & Sondes Cibles */}
          <div className="card card-p-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div className="lbl" style={{ margin: 0, fontSize: 13 }}>Paramètres & Télémesure Cibles</div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>État matériel et sondes directes par destination</p>
                </div>
                <span className="chip" style={{ fontSize: 10.5 }}>
                  {netInfo?.type || 'Ethernet'}
                </span>
              </div>

              {/* Blocs d'information sans faux interrupteurs */}
              <div className="list">
{/* Anti-Bufferbloat removed — no implementation, honest QoS note in Network section */}

                <div className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="rt">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 12 }}>Protocole IPv6</b>
                      <span className="chip" style={{
                        fontSize: 9.5,
                        color: (netInfo?.ipv6State === 'enabled' || (netInfo?.ipv6Active && netInfo?.ipv6State !== 'disabled'))
                          ? '#22c55e'
                          : netInfo?.ipv6State === 'disabled'
                          ? '#facc15'
                          : 'var(--muted)',
                        borderColor: (netInfo?.ipv6State === 'enabled' || (netInfo?.ipv6Active && netInfo?.ipv6State !== 'disabled'))
                          ? 'rgba(34,197,94,0.3)'
                          : 'var(--border)'
                      }}>
                        {netInfo?.ipv6State === 'enabled' || (netInfo?.ipv6Active && netInfo?.ipv6State !== 'disabled')
                          ? 'Liaison IPv6 activée sur cet adaptateur'
                          : netInfo?.ipv6State === 'disabled'
                          ? 'Liaison IPv6 désactivée sur cet adaptateur'
                          : 'État de liaison inconnu'}
                      </span>
                    </div>
                    <small style={{ fontSize: 11, display: 'block', color: 'var(--muted)', marginTop: 2 }}>
                      Vanguard ne modifie pas ce réglage (préservé tel quel pour la compatibilité réseau).
                    </small>
                  </div>
                </div>
              </div>

              {/* Sondes vers cibles distinctes avec détails explicites */}
              <div style={{ marginTop: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Sondes de latence par destination (Sondes TCP directes SYN/ACK)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <small style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>Passerelle locale</small>
                    <b style={{ fontSize: 12, color: netInfo?.probes?.gateway?.status === 'ok' ? '#22c55e' : 'var(--muted)' }}>
                      {netInfo?.probes?.gateway?.status === 'ok' && netInfo?.probes?.gateway?.latencyMs !== null
                        ? `${netInfo.probes.gateway.latencyMs} ms`
                        : 'Port filtré / Non dispo'}
                    </b>
                    <small style={{ fontSize: 8.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                      {netInfo?.probes?.gateway?.status === 'ok' ? 'Port 80/53' : 'Service TCP indisponible'}
                    </small>
                  </div>

                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <small style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>Cloudflare Edge</small>
                    <b style={{ fontSize: 12, color: netInfo?.probes?.cloudflareMs ? '#38bdf8' : 'var(--muted)' }}>
                      {netInfo?.probes?.cloudflareMs !== null && netInfo?.probes?.cloudflareMs !== undefined ? `${netInfo.probes.cloudflareMs} ms` : '—'}
                    </b>
                    <small style={{ fontSize: 8.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>Port 443 TCP</small>
                  </div>

                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <small style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>Google Edge</small>
                    <b style={{ fontSize: 12, color: netInfo?.probes?.googleMs ? '#a78bfa' : 'var(--muted)' }}>
                      {netInfo?.probes?.googleMs !== null && netInfo?.probes?.googleMs !== undefined ? `${netInfo.probes.googleMs} ms` : '—'}
                    </b>
                    <small style={{ fontSize: 8.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>Port 53 TCP</small>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                IP locale : <b style={{ color: 'var(--text)' }}>{netInfo?.ip || '—'}</b>
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={loadDiagnostics}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Actualiser sondes
              </button>
            </div>
          </div>
        </div>

        {/* ── Section Basse : Historique Dédupliqué des Débits ── */}
        <div className="card card-p-lg" style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="lbl" style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={15} style={{ color: 'var(--a1)' }} />
              Historique des Débits & Stabilité (Mbps)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {history.length > 0 ? `${history.length} mesure${history.length > 1 ? 's' : ''}` : 'Aucune mesure archivée'}
              </span>
              {history.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setHistory([]);
                    try { localStorage.removeItem('astral_speedtest_history'); } catch {}
                  }}
                  style={{ fontSize: 10.5, padding: '2px 8px' }}
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {history.length === 0 ? (
            <div style={{ height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <Activity size={24} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Aucune mesure enregistrée</span>
              <small style={{ fontSize: 11 }}>Lancez un test de débit pour alimenter l'historique de stabilité.</small>
            </div>
          ) : (
            <div style={{ width: '100%', height: 160, position: 'relative' }}>
              <svg viewBox="0 0 500 160" width="100%" height="160" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="chartGradDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--a1)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--a1)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="0" y1="130" x2="500" y2="130" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                <text x="4" y="26" fill="var(--muted)" fontSize="9">1000 Mbps</text>
                <text x="4" y="76" fill="var(--muted)" fontSize="9">500 Mbps</text>
                <text x="4" y="126" fill="var(--muted)" fontSize="9">100 Mbps</text>

                {(() => {
                  const maxDown = Math.max(1000, ...history.map(p => p.down));
                  const pts = history.map((p, idx) => {
                    const x = history.length === 1 ? 250 : (idx / (history.length - 1)) * 440 + 30;
                    const y = 140 - (Math.min(maxDown, p.down) / maxDown) * 110;
                    return { x, y, ...p };
                  });

                  const lineD = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
                  const areaD = `${lineD} L ${pts[pts.length - 1].x} 140 L ${pts[0].x} 140 Z`;

                  return (
                    <>
                      {history.length > 1 && <path d={areaD} fill="url(#chartGradDown)" />}
                      {history.length > 1 && <path d={lineD} fill="none" stroke="var(--a1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                      {pts.map((pt, i) => (
                        <g key={i}>
                          <circle cx={pt.x} cy={pt.y} r="4.5" fill="var(--a1)" stroke="var(--bg)" strokeWidth="2" />
                          <text x={pt.x} y={pt.y - 8} fill="var(--text)" fontSize="9.5" fontWeight="700" textAnchor="middle">
                            {pt.down}
                          </text>
                          <text x={pt.x} y={152} fill="var(--muted)" fontSize="8.5" textAnchor="middle">
                            {pt.time}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
