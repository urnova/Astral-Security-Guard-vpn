import { useEffect, useState } from 'react';
import VanguardLogo from './common/VanguardLogo';
import { useSystem } from '../context/SystemContext';

interface SplashScreenProps {
  onFinish?: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(15);
  const [status, setStatus] = useState('Démarrage de l’application...');
  const [fading, setFading] = useState(false);
  const { markWarmedUp, refreshTelemetry } = useSystem();

  useEffect(() => {
    const api = (window as any).vanguard;
    let isMounted = true;

    // Asynchronous non-blocking warmup in background
    (async () => {
      try {
        if (api) {
          await Promise.allSettled([
            api.getProfile?.(),
            api.getAdminStatus?.(),
            api.getSettings?.(),
          ]);
        }
        await refreshTelemetry();
      } catch (err) {
        console.warn('[SplashScreen] Non-blocking warmup notice:', err);
      }
    })();

    // Smooth, guaranteed 0.9s executive launch progression
    const startTime = Date.now();
    const duration = 900;

    const interval = setInterval(() => {
      if (!isMounted) return;
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));

      setProgress(pct);

      if (pct < 30) {
        setStatus('Chargement de l’interface...');
      } else if (pct < 65) {
        setStatus('Initialisation du profil utilisateur...');
      } else if (pct < 90) {
        setStatus('Chargement des modules...');
      } else {
        setStatus('Prêt');
      }

      if (pct >= 100) {
        clearInterval(interval);
        markWarmedUp();

        // Buttery fade-out transition into main app
        setTimeout(() => {
          if (!isMounted) return;
          setFading(true);
          setTimeout(() => {
            if (isMounted) onFinish?.();
          }, 240);
        }, 120);
      }
    }, 25);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [onFinish, markWarmedUp, refreshTelemetry]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#070a12',
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(1.015)' : 'scale(1)',
        transition: 'opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1), transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 20,
          maxWidth: 420,
          width: '90%',
        }}
      >
        {/* Emblem with subtle breathing glow */}
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
              inset: -8,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, transparent 70%)',
              filter: 'blur(8px)',
            }}
          />
          <VanguardLogo size={64} />
        </div>

        {/* Brand Title */}
        <div>
          <h1
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#f8fafc',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            ASTRAL VANGUARD
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 600,
                color: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '1px 7px',
                borderRadius: 99,
              }}
            >
              v2.5.0
            </span>
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: '#94a3b8',
              margin: '4px 0 0 0',
              fontWeight: 400,
            }}
          >
            Suite Professionnelle de Cybersécurité & Performance
          </p>
        </div>

        {/* Minimal Linear Progress Meter */}
        <div style={{ width: '100%', maxWidth: 280, marginTop: 12 }}>
          <div
            style={{
              width: '100%',
              height: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                borderRadius: 99,
                transition: 'width 0.08s ease-out',
              }}
            />
          </div>

          {/* Status text */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#64748b',
            }}
          >
            <span>{status}</span>
            <span style={{ color: '#94a3b8' }}>{progress}%</span>
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'rgba(100, 116, 139, 0.6)',
            letterSpacing: '0.04em',
            marginTop: 8,
          }}
        >
          Astral Vanguard v2.5.0 · Moteur Autonome
        </div>
      </div>
    </div>
  );
}
