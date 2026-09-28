import React, { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, Wifi, Activity } from 'lucide-react';

interface SplashScreenProps {
  onFinish?: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(15);
  const [status, setStatus] = useState('Démarrage du moteur Vanguard...');
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const api = (window as any).vanguard;
    let isMounted = true;

    async function initialize() {
      try {
        // Step 1: Check IPC Bridge
        if (!isMounted) return;
        setProgress(35);
        setStatus('Connexion aux sous-systèmes Windows...');

        // Step 2: Fetch profile & admin status in parallel
        if (api) {
          await Promise.allSettled([
            api.getProfile?.(),
            api.getAdminStatus?.(),
            api.getSettings?.(),
          ]);
        }

        if (!isMounted) return;
        setProgress(70);
        setStatus('Initialisation de la télémétrie & Defender...');

        // Step 3: Fetch initial metrics / security status
        if (api) {
          await Promise.allSettled([
            api.getSecurityStatus?.(),
            api.getMetrics?.(),
          ]);
        }

        if (!isMounted) return;
        setProgress(100);
        setStatus('Système prêt · Chargement de l’interface');

        // Smooth transition out
        setTimeout(() => {
          if (!isMounted) return;
          setFading(true);
          setTimeout(() => {
            if (isMounted) onFinish?.();
          }, 350);
        }, 250);
      } catch (e) {
        // Even if some check fails, don't block user
        if (!isMounted) return;
        setProgress(100);
        setStatus('Prêt avec connectivité partielle');
        setTimeout(() => {
          if (isMounted) {
            setFading(true);
            setTimeout(() => onFinish?.(), 300);
          }
        }, 300);
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [onFinish]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#07090e',
        backgroundImage: 'radial-gradient(ellipse at 50% 30%, rgba(139, 92, 246, 0.12), transparent 70%)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.35s ease-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: 420, width: '90%' }}>
        {/* Vanguard Brand Logo */}
        <div style={{ position: 'relative', width: 96, height: 96 }}>
          <img
            src="/images/vanguard-logo.svg"
            alt="Astral Vanguard Logo"
            style={{
              width: '100%',
              height: '100%',
              filter: 'drop-shadow(0 0 24px rgba(6, 182, 212, 0.45)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.3))',
            }}
            onError={(e) => {
              // fallback to logo.png
              (e.target as HTMLImageElement).src = '/logo.png';
            }}
          />
        </div>

        {/* Title & Brand */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.15em',
              background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textTransform: 'uppercase',
            }}
          >
            ASTRAL VANGUARD
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'rgba(148, 163, 184, 0.8)',
              marginTop: 4,
              letterSpacing: '0.04em',
            }}
          >
            Protection & Performance Suite · <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>v2.3.0</span>
          </div>
        </div>

        {/* Real Progress Bar */}
        <div style={{ width: '100%', marginTop: 8 }}>
          <div
            style={{
              height: 4,
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 9999,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)',
                borderRadius: 9999,
                transition: 'width 0.3s ease-in-out',
                boxShadow: '0 0 12px rgba(6, 182, 212, 0.6)',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
              fontSize: 11,
              color: 'rgba(148, 163, 184, 0.75)',
            }}
          >
            <span>{status}</span>
            <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
