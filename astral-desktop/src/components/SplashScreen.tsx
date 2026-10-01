import React, { useEffect, useState } from 'react';
import VanguardLogo from './common/VanguardLogo';
import { useSystem } from '../context/SystemContext';

interface SplashScreenProps {
  onFinish?: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(10);
  const [status, setStatus] = useState('Démarrage du moteur Astral Vanguard...');
  const [fading, setFading] = useState(false);
  const { markWarmedUp, refreshTelemetry } = useSystem();

  useEffect(() => {
    const api = (window as any).vanguard;
    let isMounted = true;

    async function initialize() {
      try {
        // Step 1: Subsystems & IPC Bridge
        await new Promise((r) => setTimeout(r, 200));
        if (!isMounted) return;
        setProgress(28);
        setStatus('Connexion aux sous-systèmes Windows & IPC...');

        // Step 2: Profile & Admin & Settings
        if (api) {
          await Promise.allSettled([
            api.getProfile?.(),
            api.getAdminStatus?.(),
            api.getSettings?.(),
          ]);
        }
        if (!isMounted) return;
        setProgress(55);
        setStatus('Vérification du moteur de sécurité Astral Vanguard...');

        // Step 3: Warm up Telemetry, Defender & System Metrics
        await refreshTelemetry();
        if (api) {
          await Promise.allSettled([
            api.getDiskHealth?.(),
            api.getStartup?.(),
          ]);
        }

        if (!isMounted) return;
        setProgress(82);
        setStatus('Synchronisation des relais réseau & profil joueur...');

        await new Promise((r) => setTimeout(r, 250));
        if (!isMounted) return;
        setProgress(100);
        setStatus('Supervision système active · Prêt');
        markWarmedUp();

        // Smooth transition out
        setTimeout(() => {
          if (!isMounted) return;
          setFading(true);
          setTimeout(() => {
            if (isMounted) onFinish?.();
          }, 350);
        }, 300);
      } catch (e) {
        if (!isMounted) return;
        setProgress(100);
        setStatus('Prêt avec connectivité locale');
        markWarmedUp();
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
  }, [onFinish, markWarmedUp, refreshTelemetry]);

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
        backgroundColor: '#05070e',
        backgroundImage:
          'radial-gradient(ellipse at 50% 30%, rgba(0, 245, 255, 0.08), transparent 70%), radial-gradient(ellipse at 50% 75%, rgba(99, 102, 241, 0.08), transparent 70%)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 22,
          maxWidth: 440,
          width: '90%',
          textAlign: 'center',
        }}
      >
        {/* Vanguard Brand Logo with Ambient Cyber Glow */}
        <div style={{ transform: 'scale(1.1)', filter: 'drop-shadow(0 0 25px rgba(0, 245, 255, 0.35))' }}>
          <VanguardLogo size={104} glow />
        </div>

        {/* Brand Title */}
        <div>
          <div
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '0.18em',
              background: 'linear-gradient(135deg, #ffffff 30%, #00f5ff 80%, #818cf8 100%)',
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
              fontWeight: 600,
              color: 'rgba(148, 163, 184, 0.85)',
              marginTop: 6,
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>Cybersécurité & Optimisation E-Sport</span>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--cyan)',
                backgroundColor: 'rgba(0, 245, 255, 0.1)',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid rgba(0, 245, 255, 0.25)',
              }}
            >
              v2.4.0
            </span>
          </div>
        </div>

        {/* Real Progress Bar */}
        <div style={{ width: '100%', marginTop: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span style={{ color: 'rgba(255, 255, 255, 0.75)', letterSpacing: '0.02em' }}>{status}</span>
            <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{progress}%</span>
          </div>

          <div
            style={{
              height: 5,
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 9999,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #00f5ff 0%, #3b82f6 50%, #a855f7 100%)',
                borderRadius: 9999,
                boxShadow: '0 0 12px rgba(0, 245, 255, 0.65)',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </div>
        </div>

        {/* Feature Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginTop: 4,
            fontSize: 11,
            color: 'rgba(148, 163, 184, 0.6)',
          }}
        >
          <span>Moteur Vanguard Core</span>
          <span>•</span>
          <span>Bouclier Temps Réel</span>
          <span>•</span>
          <span>Anti-Lag E-Sport</span>
        </div>
      </div>
    </div>
  );
}
