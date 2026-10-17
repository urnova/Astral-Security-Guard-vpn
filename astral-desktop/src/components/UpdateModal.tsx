import { useState, useEffect } from 'react';
import { Download, AlertTriangle, CheckCircle2, X, ShieldAlert, RefreshCw } from 'lucide-react';

const api = (window as any).vanguard;

interface UpdateModalProps {
  info: {
    version?:      string;
    releaseDate?:  string;
    releaseNotes?: string;
  };
  onClose:       () => void;
  gamingActive?: boolean;
}

export default function UpdateModal({ info, onClose, gamingActive = false }: UpdateModalProps) {
  const [updaterState, setUpdaterState]   = useState<any>(null);
  const [downloading, setDownloading]     = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!api) return;

    api.getUpdaterState?.().then((st: any) => {
      if (st) setUpdaterState(st);
    });

    const cleanup = api.on?.('updater:state-changed', (st: any) => {
      if (!st) return;
      setUpdaterState(st);
      if (st.status === 'downloading') {
        setDownloading(true);
        setDownloadError('');
      } else if (st.status === 'downloaded') {
        setDownloading(false);
        setDownloadError('');
      } else if (st.status === 'error') {
        setDownloading(false);
        setDownloadError(st.error || 'Erreur lors du téléchargement de la mise à jour.');
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const handleStartDownload = async () => {
    if (!api) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const res = await api.downloadUpdate?.();
      if (!res?.success && res?.error) {
        setDownloadError(res.error);
        setDownloading(false);
      }
    } catch (err: any) {
      setDownloadError(err.message || 'Échec de connexion au serveur.');
      setDownloading(false);
    }
  };

  const handleInstallNow = async () => {
    if (gamingActive) {
      alert('Une session de jeu est en cours. L\'installation s\'effectuera après la fermeture de votre partie.');
      return;
    }
    if (!api) return;
    await api.installUpdate?.();
  };

  const progress     = updaterState?.progressPercent || 0;
  const currentVer   = updaterState?.currentVersion || '2.5.0';
  const targetVer    = info?.version || '2.5.1';
  const isDownloaded = updaterState?.status === 'downloaded';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn .2s var(--ease) both',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          fontFamily: 'Inter, -apple-system, sans-serif',
          color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-sm)',
                background: 'rgba(var(--a1r), 0.10)',
                border: '1px solid rgba(var(--a1r), 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RefreshCw size={16} style={{ color: 'var(--a1)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600 }}>Mise à jour logicielle</h2>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                <span className="mono">v{currentVer}</span>
                {' → '}
                <span className="mono" style={{ color: 'var(--a1)', fontWeight: 600 }}>v{targetVer}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ color: 'var(--muted)', padding: 4, borderRadius: 'var(--r-xs)' }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Gaming guard warning */}
          {gamingActive && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'rgba(214, 173, 104, 0.08)',
                border: '1px solid rgba(214, 173, 104, 0.20)',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                color: 'var(--warn)',
              }}
            >
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <span>Partie en cours : l'installation sera reportée à la fin de votre session de jeu.</span>
            </div>
          )}

          {/* Release Notes */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Notes de publication
            </div>
            <div
              style={{
                background: '#070a10',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 'var(--r-sm)',
                padding: 14,
                fontSize: 12,
                color: 'var(--text)',
                maxHeight: 160,
                overflowY: 'auto',
                lineHeight: 1.6,
              }}
            >
              {info?.releaseNotes ? (
                <div style={{ whiteSpace: 'pre-line' }}>
                  {info.releaseNotes
                    .replace(/<[^>]*>/g, '')
                    .replace(/```[a-z]*\n?/gi, '')
                    .replace(/```/g, '')
                    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                    .replace(/^#+\s+/gm, '')
                    .trim()}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>• Refonte intégrale de la télémétrie multi-disques et suppression du mode restreint.</div>
                  <div>• Optimisation du centre gaming avec boutons Lancer et Désinstaller directs.</div>
                  <div>• Nouveau moteur de speedtest multi-flux haute fidélité (Fibre 1 Gbps).</div>
                  <div>• Tunnel VPN avec bascule instantanée sans interruption et Kill Switch renforcé.</div>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar if downloading */}
          {downloading && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>Téléchargement du paquet signé…</span>
                <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: 'var(--a1)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Downloaded confirmation */}
          {isDownloaded && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'rgba(104, 184, 148, 0.08)',
                border: '1px solid rgba(104, 184, 148, 0.20)',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                color: 'var(--ok)',
              }}
            >
              <CheckCircle2 size={15} />
              <span>Mise à jour téléchargée et certifiée (SHA-256 valide). Prête à être installée.</span>
            </div>
          )}

          {/* Error notice */}
          {downloadError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'rgba(223, 133, 133, 0.08)',
                border: '1px solid rgba(223, 133, 133, 0.20)',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                color: 'var(--bad)',
              }}
            >
              <AlertTriangle size={15} />
              <span>{downloadError}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg)',
          }}
        >
          <button className="btn s" onClick={onClose}>
            Plus tard
          </button>

          {!isDownloaded ? (
            <button
              className="btn"
              onClick={handleStartDownload}
              disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Download size={13} />
              <span>{downloading ? 'Téléchargement…' : 'Télécharger la mise à jour'}</span>
            </button>
          ) : (
            <button
              className="btn"
              onClick={handleInstallNow}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <RefreshCw size={13} />
              <span>Installer et redémarrer</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
