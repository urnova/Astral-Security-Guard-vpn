import { useState } from 'react';

const api = (window as any).vanguard;

interface Props {
  info: {
    version?: string;
    releaseDate?: string;
    releaseNotes?: string;
  };
  onClose: () => void;
}

export default function UpdateModal({ info, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleStartUpdate = () => {
    setDownloading(true);
    // Simulate or call updater
    let current = 0;
    const interval = setInterval(() => {
      current += 15;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setTimeout(() => {
          api?.quit?.();
        }, 1200);
      }
      setProgress(current);
    }, 400);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass-card"
        style={{
          width: 480,
          padding: 28,
          border: '1px solid rgba(139, 92, 246, 0.4)',
          boxShadow: '0 0 40px rgba(139, 92, 246, 0.25)',
          borderRadius: 16,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2))',
              border: '1px solid var(--violet)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>
              Nouvelle Version Disponible !
            </h3>
            <span style={{ fontSize: 12, color: 'var(--violet)' }}>
              Astral Vanguard {info.version || 'v2.1.0'}
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
          Une mise à jour critique améliorant les performances réseau, la détection anti-lag 1000ms et le bouclier Defender est prête à être installée.
        </p>

        {downloading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: 'var(--cyan)' }}>Téléchargement du package...</span>
              <span style={{ fontWeight: 700 }}>{progress}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, var(--cyan), var(--violet))',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          {!downloading ? (
            <>
              <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 13 }}>
                Plus tard
              </button>
              <button className="btn btn-primary" onClick={handleStartUpdate} style={{ fontSize: 13 }}>
                Mettre à jour maintenant
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" disabled style={{ fontSize: 13, width: '100%' }}>
              Installation automatique au redémarrage...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
