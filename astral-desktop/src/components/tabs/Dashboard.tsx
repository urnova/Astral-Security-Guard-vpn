import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Zap, Activity,
  HardDrive, Clock, Cpu, Wifi, Gamepad2, RefreshCw,
  ChevronRight, AlertTriangle, CheckCircle, ArrowUpRight,
  LayoutDashboard
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

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
  const [mode,       setMode]       = useState('none'); // Default: Aucun mode actif
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
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const ram   = metrics && metrics.ramTotal > 0
    ? Math.round((metrics.ramUsed / metrics.ramTotal) * 100) : 0;
  const disk  = metrics
    ? Math.round(metrics.diskUsedGB / (metrics.diskUsedGB + metrics.diskFreeGB) * 100) : 0;
  const defOk = Boolean(secStatus?.AntivirusEnabled && secStatus?.RealTimeProtectionEnabled);
  const fwOk  = Boolean(secStatus?.FirewallEnabled);

  const modeColors: Record<string, string> = {
    none: 'badge-muted', gaming: 'badge-cyan', office: 'badge-violet', shield: 'badge-green', eco: 'badge-muted',
  };
  const modeLabel: Record<string, string> = {
    none: 'Aucun mode actif', gaming: 'Gaming', office: 'Bureau', shield: 'Protection', eco: 'Économie',
  };

  return (
    <div className="tab-scroll animate-in">
      {/* ── Page header ── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#c084fc' }}>
            <LayoutDashboard size={22} />
          </div>
          <div>
            <h1 className="page-title">
              {gamingActive
                ? <span style={{ color: 'var(--cyan)' }}>Mode Gaming actif</span>
                : greeting(firstName)}
            </h1>
            <p className="page-subtitle">
              {gamingActive
                ? `Session en cours — ${currentGame || 'jeu détecté'}`
                : 'État du système en temps réel · Astral Vanguard'}
            </p>
          </div>
        </div>
        <div className="page-actions">
          {!gamingActive && (
            <span className={`badge ${modeColors[mode] ?? 'badge-muted'}`}>
              <span className="badge-dot" /> {modeLabel[mode] ?? 'Aucun mode actif'}
            </span>
          )}
          {gamingActive && (
            <span className="badge badge-cyan">
              <span className="badge-dot" style={{ animationName: 'dotPulse', animation: 'dotPulse 1.4s infinite' }} />
              GAMING ACTIF
            </span>
          )}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={handleRefresh} title="Actualiser" aria-label="Actualiser">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>


      {errorInfo && (
        <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
      )}

      {/* ── 4 metric cards ── */}
      {loading ? (
        <div className="grid-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="metric-card" style={{ minHeight: 110 }}>
              <div className="skeleton" style={{ height: 20, width: '60%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 32, width: '45%', borderRadius: 4, marginTop: 4 }} />
            </div>
          ))}
        </div>
      ) : metrics ? (
        <div className="grid-4">
          {/* CPU */}
          <div className="metric-card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="metric-icon" style={{ background: 'rgba(0,212,255,0.12)', color: 'var(--cyan)' }}>
                <Cpu size={18} />
              </div>
              <span className={`badge ${metrics.cpuPercent > 80 ? 'badge-red' : metrics.cpuPercent > 60 ? 'badge-orange' : 'badge-green'}`}>
                {metrics.cpuPercent > 80 ? 'Élevé' : metrics.cpuPercent > 60 ? 'Modéré' : 'Normal'}
              </span>
            </div>
            <div className="metric-label" style={{ marginTop: 10 }}>CPU</div>
            <div className="metric-value">{metrics.cpuPercent.toFixed(0)}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>%</span></div>
            <div className="progress-bar"><div className="progress-fill progress-cyan" style={{ width: `${metrics.cpuPercent}%` }} /></div>
          </div>

          {/* RAM */}
          <div className="metric-card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="metric-icon" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--violet)' }}>
                <Activity size={18} />
              </div>
              <span className={`badge ${ram > 85 ? 'badge-red' : ram > 70 ? 'badge-orange' : 'badge-violet'}`}>
                {ram > 85 ? 'Élevé' : ram > 70 ? 'Modéré' : 'Normal'}
              </span>
            </div>
            <div className="metric-label" style={{ marginTop: 10 }}>Mémoire vive</div>
            <div className="metric-value">{ram}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>%</span></div>
            <div className="metric-sub">{fmtGB(metrics.ramUsed)} / {fmtGB(metrics.ramTotal)}</div>
            <div className="progress-bar"><div className="progress-fill progress-violet" style={{ width: `${ram}%` }} /></div>
          </div>

          {/* Disk */}
          <div className="metric-card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="metric-icon" style={{ background: 'rgba(16,217,160,0.10)', color: 'var(--green)' }}>
                <HardDrive size={18} />
              </div>
              <span className={`badge ${disk > 90 ? 'badge-red' : 'badge-green'}`}>{disk > 90 ? 'Plein' : 'OK'}</span>
            </div>
            <div className="metric-label" style={{ marginTop: 10 }}>Stockage</div>
            <div className="metric-value">{disk}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>%</span></div>
            <div className="metric-sub">{fmtGB(metrics.diskFreeGB)} libres</div>
            <div className="progress-bar"><div className="progress-fill progress-green" style={{ width: `${disk}%` }} /></div>
          </div>

          {/* Uptime */}
          <div className="metric-card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="metric-icon" style={{ background: 'rgba(255,209,102,0.10)', color: 'var(--gold)' }}>
                <Clock size={18} />
              </div>
            </div>
            <div className="metric-label" style={{ marginTop: 10 }}>Depuis le démarrage</div>
            <div className="metric-value" style={{ fontSize: 22 }}>{fmtUptime(metrics.uptimeHours)}</div>
            <div className="metric-sub">Session active</div>
          </div>
        </div>
      ) : (
        <div className="notice notice-warn">
          <AlertTriangle size={15} />
          <span>Métriques système indisponibles. Vanguard ne peut pas lire les données système.</span>
        </div>
      )}

      {/* ── Security status ── */}
      <div className="grid-2" style={{ gap: 16 }}>
        {/* Security card */}
        <div className={`card card-p ${defOk && fwOk ? 'card-green' : 'card-red'}`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {defOk && fwOk
                ? <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
                : <ShieldAlert size={20} style={{ color: 'var(--red)' }} />}
              <span className="section-title">Windows Defender</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onTabChange('security')}
              style={{ fontSize: 12 }}
            >
              Détails <ChevronRight size={13} />
            </button>
          </div>

          {secStatus !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StatusRow
                label="Antivirus"
                ok={secStatus.AntivirusEnabled}
                value={secStatus.AntivirusEnabled ? 'Actif' : 'Inactif'}
              />
              <StatusRow
                label="Protection temps réel"
                ok={secStatus.RealTimeProtectionEnabled}
                value={secStatus.RealTimeProtectionEnabled ? 'Activée' : 'Désactivée'}
              />
              <StatusRow
                label="Pare-feu"
                ok={secStatus.FirewallEnabled}
                value={secStatus.FirewallEnabled ? 'Actif' : 'Inactif'}
              />
              {secStatus.AntivirusSignatureLastUpdated && (
                <div className="data-row" style={{ paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <span className="data-row-label">Signatures</span>
                  <span className="data-row-value" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                    {new Date(secStatus.AntivirusSignatureLastUpdated).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="notice notice-warn" style={{ fontSize: 12 }}>
              <AlertTriangle size={13} />
              État Defender non disponible — droits admin requis.
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="card card-surface card-p">
          <div style={{ marginBottom: 14 }}>
            <span className="section-title">Actions rapides</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionBtn
              label="Analyse rapide Defender"
              sub="Lance une analyse des zones critiques"
              icon={<Shield size={15} />}
              color="var(--green)"
              bg="rgba(16,217,160,0.10)"
              onClick={() => onTabChange('security')}
            />
            <ActionBtn
              label="Optimiser les performances"
              sub="Libérer la RAM et gérer les démarrages"
              icon={<Zap size={15} />}
              color="var(--violet)"
              bg="rgba(139,92,246,0.10)"
              onClick={() => onTabChange('performance')}
            />
            <ActionBtn
              label="Test de débit réseau"
              sub="Mesurer la vitesse de connexion"
              icon={<Wifi size={15} />}
              color="var(--cyan)"
              bg="rgba(0,212,255,0.08)"
              onClick={() => onTabChange('network')}
            />
            <ActionBtn
              label="Mode Gaming"
              sub={gamingActive ? 'Session gaming active' : 'Activation manuelle uniquement'}
              icon={<Gamepad2 size={15} />}
              color={gamingActive ? 'var(--cyan)' : 'var(--text-muted)'}
              bg={gamingActive ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)'}
              onClick={() => onTabChange('gaming')}
            />
          </div>
        </div>
      </div>

      {/* ── System Health & Recent Activity ── */}
      <div className="grid-2" style={{ gap: 16 }}>
        {/* Verifiable Facts - System Health */}
        <div className="card card-surface card-p">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="section-title">Santé du système (Faits vérifiés)</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sans score arbitraire</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Moteur de protection</span>
              <span className={`badge ${defOk ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 11 }}>
                {defOk ? 'Microsoft Defender actif' : 'Désactivé / Inconnu'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Pare-feu Windows</span>
              <span className={`badge ${fwOk ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 11 }}>
                {fwOk ? 'Filtrage actif' : 'Inactif'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Mode Gaming</span>
              <span className={`badge ${gamingActive ? 'badge-cyan' : 'badge-muted'}`} style={{ fontSize: 11 }}>
                {gamingActive ? 'Actif' : 'Inactif (Manuel)'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>VPN & Réseau</span>
              <span className={`badge ${vpnCoex?.thirdPartyActive ? 'badge-green' : 'badge-cyan'}`} style={{ fontSize: 11 }}>
                {vpnCoex?.thirdPartyActive ? `🛡️ ${vpnCoex.vpnName} Détecté (Coexistence)` : 'Mode standard autonome'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Confidentialité</span>
              <span className="badge badge-cyan" style={{ fontSize: 11 }}>
                100% Hors-ligne · Zéro télémétrie
              </span>
            </div>
          </div>
        </div>

        {/* Recent Real Activity */}
        <div className="card card-surface card-p">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="section-title">Activité récente</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Journal des analyses</span>
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
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <Shield size={13} style={{ color: s.status === 'threat' ? 'var(--red)' : s.status === 'suspect' ? 'var(--orange)' : 'var(--green)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.fileName}
                    </span>
                  </div>
                  <span className={`badge ${s.status === 'threat' ? 'badge-red' : s.status === 'suspect' ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                    {s.status === 'threat' ? 'Menace' : s.status === 'suspect' ? 'Suspect' : 'Sain (Defender)'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucune activité suspecte détectée récemment.
            </div>
          )}
        </div>
      </div>

      {/* ── Status overview strip ── */}
      <div className="card card-p" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
        <ModuleStatus label="Scanner téléchargements" active={true} />
        <ModuleStatus label="Watchdog réseau" active={true} />
        <ModuleStatus label="VPN" active={false} neutral />
        <ModuleStatus label={`Mode gaming${gamingActive ? ' · ' + (currentGame || 'Jeu') : ''}`} active={gamingActive} neutral={!gamingActive} />
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>
    </div>
  );
}


function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="data-row" style={{ padding: '6px 0' }}>
      <span className="data-row-label">{label}</span>
      <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 11 }}>
        {ok ? <CheckCircle size={10} /> : <AlertTriangle size={10} />} {value}
      </span>
    </div>
  );
}

function ActionBtn({ label, sub, icon, color, bg, onClick }: {
  label: string; sub: string; icon: React.ReactNode;
  color: string; bg: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
        background: 'transparent', textAlign: 'left', transition: 'background var(--transition)',
        width: '100%',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = bg)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ color, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>
      </div>
      <ArrowUpRight size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
    </button>
  );
}

function ModuleStatus({ label, active, neutral }: { label: string; active: boolean; neutral?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: neutral ? 'var(--text-faint)' : active ? 'var(--green)' : 'var(--red)',
        boxShadow: active && !neutral ? 'var(--glow-green)' : 'none',
      }} />
      <span style={{ fontSize: 12, color: neutral ? 'var(--text-muted)' : active ? 'var(--text-secondary)' : 'var(--red)' }}>
        {label}
      </span>
    </div>
  );
}
