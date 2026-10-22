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
  const [installing, setInstalling]       = useState(false);
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
      } else if (st.status === 'installing') {
        setInstalling(true);
      } else if (st.status === 'error') {
        setDownloading(false);
        setInstalling(false);
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
    setInstalling(true);
    await api.installUpdate?.();
  };

  const progress     = updaterState?.progressPercent || 0;
  const currentVer   = updaterState?.currentVersion || '0.1.0';
  const targetVer    = info?.version || '0.1.3';
  const isDownloaded = updaterState?.status === 'downloaded';
  const isInstalling = installing || updaterState?.status === 'installing';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.65)',
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
              <RefreshCw size={16} style={{ color: 'var(--a1)' }} className={isInstalling ? 'animate-spin' : ''} />
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600 }}>
                {isInstalling ? 'Mise à jour en cours d\'application' : 'Mise à jour logicielle'}
              </h2>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                <span className="mono">v{currentVer}</span>
                {' → '}
                <span className="mono" style={{ color: 'var(--a1)', fontWeight: 600 }}>v{targetVer}</span>
              </div>
            </div>
          </div>

          {!isInstalling && (
            <button
              onClick={onClose}
              style={{ color: 'var(--muted)', padding: 4, borderRadius: 'var(--r-xs)' }}
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        {isInstalling ? (
          <div style={{ padding: '28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Spinning glowing badge */}
            <div
              style={{
                position: 'relative',
                width: 72,
                height: 72,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(var(--a1r), 0.2)',
                  borderTopColor: 'var(--a1)',
                  animation: 'spin 1.2s linear infinite',
                }}
              />
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(var(--a1r), 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 24px rgba(var(--a1r), 0.25)',
                }}
              >
                <RefreshCw size={24} style={{ color: 'var(--a1)', animation: 'spin 3s linear infinite reverse' }} />
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                Application de la mise à jour v{targetVer}…
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 380, margin: '0 auto' }}>
                Vanguard Core prépare le remplacement des fichiers binaires et libère les verrous système. L'application redémarrera automatiquement.
              </p>
            </div>

            {/* Step Checklist */}
            <div
              style={{
                width: '100%',
                background: '#070a10',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                textAlign: 'left',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ok)' }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>Vérification de signature SHA-512 validée</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ok)' }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>Fermeture ordonnée des services & libération mutex</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--a1)', fontWeight: 600 }}>
                <RefreshCw size={15} className="animate-spin" style={{ flexShrink: 0 }} />
                <span>Exécution de l'installateur silencieux…</span>
              </div>
            </div>

            {/* Shimmer progress bar */}
            <div
              style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '45%',
                  background: 'linear-gradient(90deg, transparent, var(--a1), transparent)',
                  animation: 'shimmer 1.4s ease-in-out infinite',
                }}
              />
            </div>

            <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
              Redémarrage automatique sous 2 à 4 secondes. Ne fermez pas votre ordinateur.
            </div>
          </div>
        ) : (
          <>
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
                      <div>• Résolution des ralentissements et suppression des fenêtres PowerShell parasites.</div>
                      <div>• Optimisation du moteur Defender avec analyse rapide et approfondie instantanées.</div>
                      <div>• Indicateur visuel d'installation et de redémarrage silencieux ultra-fiable.</div>
                      <div>• Ping natif zéro-processus à latence temps réel ultra-faible.</div>
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
                  <span>Mise à jour téléchargée et certifiée (SHA-512 valide). Prête à être installée.</span>
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
                  disabled={installing}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <RefreshCw size={13} className={installing ? 'animate-spin' : ''} />
                  <span>{installing ? 'Redémarrage et installation…' : 'Installer et redémarrer'}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
