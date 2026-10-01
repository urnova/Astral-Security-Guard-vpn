import React, { useEffect, useState } from 'react';
import VanguardLogo from './common/VanguardLogo';
import { useSystem } from '../context/SystemContext';
import { ShieldCheck, Cpu, Zap, Wifi } from 'lucide-react';

interface SplashScreenProps {
  onFinish?: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(12);
  const [status, setStatus] = useState('Initialisation du moteur Vanguard...');
  const [fading, setFading] = useState(false);
  const { markWarmedUp, refreshTelemetry } = useSystem();

  useEffect(() => {
    const api = (window as any).vanguard;
    let isMounted = true;

    // Asynchronous pre-warming in the background - NEVER blocks UI progression
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

    // High-speed, guaranteed smooth progression (Total duration: ~1.2s)
    const startTime = Date.now();
    const duration = 1200; // 1.2s total

    const interval = setInterval(() => {
      if (!isMounted) return;
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));

      setProgress(pct);

      if (pct < 30) {
        setStatus('Initialisation des protocoles haute vitesse...');
      } else if (pct < 65) {
        setStatus('Activation du bouclier temps réel...');
      } else if (pct < 92) {
        setStatus('Calibration des profils e-sport & anti-lag...');
      } else {
        setStatus('Système sécurisé · Prêt');
      }

      if (pct >= 100) {
        clearInterval(interval);
        markWarmedUp();

        // Smooth fade-out into the main application
        setTimeout(() => {
          if (!isMounted) return;
          setFading(true);
          setTimeout(() => {
            if (isMounted) onFinish?.();
          }, 300);
        }, 200);
      }
    }, 30);

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
        backgroundColor: '#04050b',
        backgroundImage: `
          radial-gradient(circle at 50% 40%, rgba(0, 245, 255, 0.09) 0%, transparent 60%),
          radial-gradient(circle at 50% 60%, rgba(99, 102, 241, 0.08) 0%, transparent 70%),
          linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 32px 32px, 32px 32px',
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* Central Cyber Deck Container */}
      <div
        style={{
          position: 'relative',
          width: '90%',
          maxWidth: 460,
          padding: '36px 32px',
          borderRadius: 20,
          background: 'linear-gradient(160deg, rgba(15, 23, 42, 0.85) 0%, rgba(7, 10, 24, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 245, 255, 0.22)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(0, 245, 255, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 20,
        }}
      >
        {/* Decorative High-Tech Corner Ticks */}
        <div style={{ position: 'absolute', top: 10, left: 10, width: 10, height: 10, borderTop: '2px solid var(--cyan)', borderLeft: '2px solid var(--cyan)', opacity: 0.8 }} />
        <div style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderTop: '2px solid var(--cyan)', borderRight: '2px solid var(--cyan)', opacity: 0.8 }} />
        <div style={{ position: 'absolute', bottom: 10, left: 10, width: 10, height: 10, borderBottom: '2px solid var(--cyan)', borderLeft: '2px solid var(--cyan)', opacity: 0.8 }} />
        <div style={{ position: 'absolute', bottom: 10, right: 10, width: 10, height: 10, borderBottom: '2px solid var(--cyan)', borderRight: '2px solid var(--cyan)', opacity: 0.8 }} />

        {/* Vanguard Emblem with Glowing Orbital Aura */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 245, 255, 0.25) 0%, rgba(99, 102, 241, 0.15) 50%, transparent 70%)',
              filter: 'blur(12px)',
            }}
          />
          <div
            style={{
              position: 'relative',
              padding: 12,
              borderRadius: '50%',
              border: '1px solid rgba(0, 245, 255, 0.3)',
              backgroundColor: 'rgba(5, 7, 18, 0.7)',
              boxShadow: '0 0 20px rgba(0, 245, 255, 0.35)',
            }}
          >
            <VanguardLogo size={72} glow />
          </div>
        </div>

        {/* Brand Title & Identity */}
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.22em',
              background: 'linear-gradient(180deg, #ffffff 10%, #cbd5e1 55%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textTransform: 'uppercase',
            }}
          >
            ASTRAL VANGUARD
          </h1>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#94a3b8',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginTop: 6,
            }}
          >
            Suite de Cybersécurité & Optimisation E-Sport
          </div>
        </div>

        {/* Tactical Cyber Progress Bar */}
        <div style={{ width: '100%', marginTop: 4 }}>
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
            <span style={{ color: '#cbd5e1', letterSpacing: '0.04em', fontWeight: 500 }}>
              {status}
            </span>
            <span style={{ color: 'var(--cyan)', fontWeight: 700, textShadow: '0 0 8px rgba(0, 245, 255, 0.6)' }}>
              {progress}%
            </span>
          </div>

          <div
            style={{
              height: 6,
              width: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              borderRadius: 9999,
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              position: 'relative',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #00f5ff 0%, #6366f1 60%, #a855f7 100%)',
                borderRadius: 9999,
                boxShadow: '0 0 14px rgba(0, 245, 255, 0.8)',
                transition: 'width 0.08s ease-out',
              }}
            />
          </div>
        </div>

        {/* Tactical Modules Status Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            width: '100%',
            marginTop: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: 10, color: '#94a3b8' }}>
            <ShieldCheck size={12} style={{ color: '#10b981' }} />
            <span>Defender Core</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: 10, color: '#94a3b8' }}>
            <Zap size={12} style={{ color: '#00f5ff' }} />
            <span>Anti-Lag</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: 10, color: '#94a3b8' }}>
            <Wifi size={12} style={{ color: '#818cf8' }} />
            <span>VPN Relais</span>
          </div>
        </div>

        {/* Elegant Discreet Footer */}
        <div
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'rgba(100, 116, 139, 0.8)',
            letterSpacing: '0.06em',
          }}
        >
          Astral Vanguard v2.4.0 · Moteur Autonome
        </div>
      </div>
    </div>
  );
}
