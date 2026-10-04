import React, { useState, useEffect } from 'react';
import { Download, AlertTriangle, CheckCircle2, X, ShieldAlert, Sparkles } from 'lucide-react';

const api = (window as any).vanguard;

interface UpdateModalProps {
  info: {
    version?: string;
    releaseDate?: string;
    releaseNotes?: string;
  };
  onClose: () => void;
  gamingActive?: boolean;
}

export default function UpdateModal({ info, onClose, gamingActive = false }: UpdateModalProps) {
  const [updaterState, setUpdaterState] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;

    // Get initial state
    api.getUpdaterState?.().then((st: any) => {
      if (st) setUpdaterState(st);
    });

    const cleanup = api.on?.('updater:state-changed', (st: any) => {
      if (st) {
        setUpdaterState(st);
        if (st.status === 'downloading') {
          setDownloading(true);
          setDownloadError(null);
        } else if (st.status === 'downloaded') {
          setDownloading(false);
          setDownloadError(null);
        } else if (st.status === 'error') {
          setDownloading(false);
          setDownloadError(st.error || 'Erreur lors du téléchargement de la mise à jour.');
        }
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const handleStartDownload = async () => {
    if (!api) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await api.downloadUpdate?.();
      if (!res?.success && res?.error) {
        setDownloadError(res.error);
        setDownloading(false);
      }
    } catch (err: any) {
      setDownloadError(err.message || 'Échec de connexion');
      setDownloading(false);
    }
  };

  const handleInstallNow = async () => {
    if (gamingActive) {
      alert("Une session de jeu est actuellement active. L'installation sera effectuée dès la fermeture de la partie pour éviter toute interruption.");
      return;
    }
    if (!api) return;
    await api.installUpdate?.();
  };

  const progress = updaterState?.progressPercent || 0;
  const currentVer = updaterState?.currentVersion || '2.5.0';
  const targetVer = info?.version || '2.5.0';
  const isDownloaded = updaterState?.status === 'downloaded';

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 Mo';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} Mo`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 13, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: 520,
          padding: 24,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
          }}
          title="Fermer"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
            }}
          >
            <Download size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
              Mise à jour officielle disponible
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              Version actuelle : <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>v{currentVer}</span> → Nouvelle : <span style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)', fontWeight: 600 }}>v{targetVer}</span>
            </div>
          </div>
        </div>

        {/* Gaming Active Warning */}
        {gamingActive && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: 'var(--yellow)',
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>Partie en cours : l'installation ne sera pas exécutée pour ne pas interrompre votre session de jeu.</span>
          </div>
        )}

        {/* Release Notes */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            maxHeight: 140,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} style={{ color: 'var(--cyan)' }} />
            Notes de version
          </div>
          {info?.releaseNotes ? (
            <div>{info.releaseNotes}</div>
          ) : (
            <div>Refonte complète de l'interface graphique, optimisation des performances, mise à jour des signatures de sécurité et maintien des préférences lors de la mise à jour.</div>
          )}
        </div>

        {/* Download Progress */}
        {downloading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--cyan)' }}>Téléchargement du package officiel...</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 9999, backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, var(--cyan), var(--purple))',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            {updaterState?.totalBytes > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                {formatBytes(updaterState.transferredBytes)} / {formatBytes(updaterState.totalBytes)}
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {downloadError && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: 'var(--red)',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{downloadError}</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
          >
            Plus tard
          </button>

          {!isDownloaded ? (
            <button
              onClick={handleStartDownload}
              disabled={downloading}
              className="btn btn-primary"
              style={{ fontSize: 13 }}
            >
              <Download size={15} />
              <span>{downloading ? 'Téléchargement...' : 'Télécharger la mise à jour'}</span>
            </button>
          ) : (
            <button
              onClick={handleInstallNow}
              disabled={gamingActive}
              className="btn btn-primary"
              style={{
                fontSize: 13,
                backgroundColor: 'var(--green)',
                borderColor: 'var(--green)',
              }}
            >
              <CheckCircle2 size={15} />
              <span>Redémarrer et installer</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
