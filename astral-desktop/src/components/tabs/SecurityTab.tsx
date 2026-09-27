import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

type ScanState = 'idle' | 'scanning' | 'done';
type AiState = 'idle' | 'loading' | 'done';

export default function SecurityTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanType, setScanType] = useState<'quick' | 'full'>('quick');
  const [threats, setThreats] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiState, setAiState] = useState<AiState>('idle');
  const [rollbackLog, setRollbackLog] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [remediationScript, setRemediationScript] = useState('');
  const [remediating, setRemediating] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.listRollback().then((r: any) => setRollbackLog(r.entries || []));
    api.getExclusions().then((r: any) => setExclusions(r.paths || []));

    const cleanup = api.on('security-event', (event: any) => {
      if (event.type === 'scan-complete') {
        setThreats(event.threats || []);
        setScanState('done');
        if ((event.threats || []).length > 0) {
          runAiAnalysis(event.threats);
        }
      }
    });
    return cleanup;
  }, []);

  const runAiAnalysis = async (t: any[]) => {
    if (!api) return;
    setAiState('loading');
    const res = await api.aiAnalyze(t);
    if (res.success) {
      setAiAnalysis(res.analysis);
      if (res.analysis.remediationScript) {
        setRemediationScript(res.analysis.remediationScript);
      }
    }
    setAiState('done');
  };

  const startScan = async () => {
    if (!api) return;
    setThreats([]);
    setAiAnalysis(null);
    setAiState('idle');
    setScanState('scanning');
    await api.createRestorePoint('Avant scan de sécurité');
    if (scanType === 'quick') {
      api.quickScan();
    } else {
      api.fullScan();
    }
  };

  const runRemediation = async () => {
    if (!api || !remediationScript) return;
    setRemediating(true);
    await api.createRestorePoint('Avant remédiation IA');
    const res = await api.runRemediation(remediationScript);
    setRemediating(false);
    setNotice(res.success ? '✅ Script exécuté avec succès.' : `❌ Erreur : ${res.error}`);
    setTimeout(() => setNotice(''), 4000);
  };

  const riskColor: Record<string, string> = {
    faible: 'green', moyen: 'orange', élevé: 'red', critique: 'red',
    low: 'green', medium: 'orange', high: 'red', critical: 'red',
  };

  return (
    <div className="tab-scroll animate-in">
      <div className="tab-header">
        <div>
          <h1 className="tab-title">Sécurité</h1>
          <p className="tab-subtitle">Audit Windows Defender · Analyse IA · Remédiation</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={scanType}
            onChange={(e) => setScanType(e.target.value as any)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              padding: '6px 12px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <option value="quick">Analyse rapide</option>
            <option value="full">Analyse complète</option>
          </select>
          <button
            className={`btn ${scanState === 'scanning' ? 'btn-ghost' : 'btn-primary'}`}
            onClick={startScan}
            disabled={scanState === 'scanning'}
          >
            {scanState === 'scanning' ? (
              <><div className="spinner" /> Analyse en cours...</>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Lancer l'analyse
              </>
            )}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.startsWith('✅') ? 'notice-success' : 'notice-danger'} animate-in`}
             style={{ marginBottom: 16 }}>
          {notice}
        </div>
      )}

      {/* Scan Results */}
      {scanState === 'done' && (
        <div className="animate-in" style={{ marginBottom: 20 }}>
          {threats.length === 0 ? (
            <div className="notice notice-success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span style={{ fontWeight: 600 }}>Aucune menace détectée · Votre système est propre.</span>
            </div>
          ) : (
            <div className="notice notice-danger" style={{ marginBottom: 12 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontWeight: 600 }}>{threats.length} menace(s) détectée(s)</span>
            </div>
          )}

          {threats.map((t: any, i: number) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.ThreatName || t.Name || 'Menace inconnue'}</span>
                <span className="badge badge-red">{t.ActionSuccess ? 'Traité' : 'Actif'}</span>
              </div>
              {t.InitialDetectionTime && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Détecté le {new Date(t.InitialDetectionTime).toLocaleString('fr-FR')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Analysis */}
      {aiState !== 'idle' && (
        <div className="card card-glow-violet animate-in" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-accent)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <path d="M12 2a10 10 0 110 20A10 10 0 0112 2z" opacity="0.3"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Analyse IA · Gemini Flash</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Diagnostic automatique de sécurité</p>
            </div>
            {aiState === 'loading' && <div className="spinner" style={{ marginLeft: 'auto' }} />}
          </div>

          {aiState === 'done' && aiAnalysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="section-label">Niveau de risque</span>
                <span className={`badge badge-${riskColor[aiAnalysis.riskLevel?.toLowerCase()] || 'orange'}`}>
                  {aiAnalysis.riskLevel?.toUpperCase() || 'INCONNU'}
                </span>
              </div>

              {aiAnalysis.explanation && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {aiAnalysis.explanation}
                </p>
              )}

              {remediationScript && (
                <div>
                  <p className="section-label" style={{ marginBottom: 8 }}>Script de remédiation généré</p>
                  <div className="code-block">{remediationScript}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={runRemediation}
                      disabled={remediating}
                    >
                      {remediating ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Exécution...</> : '⚡ Exécuter le script'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => api?.createRestorePoint('Avant remédiation manuelle')}
                    >
                      🔄 Créer un point de restauration
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Two columns: exclusions + rollback */}
      <div className="grid-2">
        {/* Exclusions */}
        <div className="card">
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Exceptions Defender</p>
          {exclusions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aucune exception configurée</p>
          ) : (
            exclusions.map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                📁 {p}
              </div>
            ))
          )}
        </div>

        {/* Rollback Log */}
        <div className="card">
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Journal de restauration</p>
          {rollbackLog.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aucun point de restauration créé</p>
          ) : (
            rollbackLog.slice(0, 5).map((e: any) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500 }}>{e.description}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(e.timestamp).toLocaleString('fr-FR')}
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => api?.restoreEntry(e.id)}
                  style={{ fontSize: 10 }}
                >
                  Restaurer
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
