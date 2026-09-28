import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, AlertTriangle, CheckCircle2, X, ShieldAlert } from 'lucide-react';

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
  const currentVer = updaterState?.currentVersion || '2.3.0';
  const targetVer = info?.version || '2.3.0';
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
        backgroundColor: 'rgba(7, 9, 14, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: '#0c1017',
          border: '1px solid rgba(139, 92, 246, 0.4)',
          boxShadow: '0 0 40px rgba(139, 92, 246, 0.25)',
          borderRadius: 16,
          padding: 24,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
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
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
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
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2))',
              border: '1px solid rgba(139, 92, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <Download size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Mise à jour Vanguard disponible
            </h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              Version actuelle : <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>v{currentVer}</span> → Nouvelle : <span style={{ fontFamily: 'monospace', color: '#c084fc', fontWeight: 600 }}>v{targetVer}</span>
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
              color: '#fbbf24',
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>Partie en cours : l'installation ne sera pas exécutée pour ne pas interrompre votre session.</span>
          </div>
        )}

        {/* Release Notes */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            color: '#cbd5e1',
            lineHeight: 1.5,
            maxHeight: 140,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>Notes de version :</div>
          {info?.releaseNotes ? (
            <div>{info.releaseNotes}</div>
          ) : (
            <div>Améliorations de performance, design system Vanguard v2.3.0, corrections de sécurité et optimisation réseau.</div>
          )}
        </div>

        {/* Download Progress */}
        {downloading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#38bdf8' }}>Téléchargement du package officiel...</span>
              <span style={{ fontFamily: 'monospace', color: '#ffffff', fontWeight: 600 }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 9999, backgroundColor: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            {updaterState?.totalBytes > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }}>
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
              color: '#f87171',
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
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Plus tard
          </button>

          {isDownloaded ? (
            <button
              onClick={handleInstallNow}
              disabled={gamingActive}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                backgroundColor: gamingActive ? '#475569' : '#059669',
                border: 'none',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: gamingActive ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{gamingActive ? 'Installation différée (Jeu actif)' : 'Installer et redémarrer'}</span>
            </button>
          ) : downloading ? (
            <button
              disabled
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                backgroundColor: 'rgba(139, 92, 246, 0.3)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                color: '#c084fc',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <RefreshCw size={15} className="animate-spin" />
              <span>Téléchargement en cours...</span>
            </button>
          ) : (
            <button
              onClick={handleStartDownload}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                backgroundColor: '#7c3aed',
                border: 'none',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Download size={16} />
              <span>{downloadError ? 'Réessayer le téléchargement' : 'Télécharger la mise à jour'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
