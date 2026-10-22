import { useState, useEffect } from 'react';
import VanguardLogo from './common/VanguardLogo';

interface Props {
  onFinish?: () => void;
}

const STEPS = [
  'Initialisation du moteur de sécurité…',
  'Vérification de Microsoft Defender…',
  'Chargement des signatures…',
  'Configuration du réseau…',
  'Prêt.',
];

export default function SplashScreen({ onFinish }: Props) {
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx]   = useState(0);
  const [exiting, setExiting]   = useState(false);

  useEffect(() => {
    const total = 2200;
    const interval = 30;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setProgress(pct);
      setStepIdx(Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length)));

      if (elapsed >= total) {
        clearInterval(timer);
        setTimeout(() => {
          setExiting(true);
          setTimeout(() => onFinish?.(), 400);
        }, 300);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <div className={`splash${exiting ? ' exit' : ''}`}>
      {/* Logo */}
      <div className="splash-logo" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
        <VanguardLogo size={52} glow={false} />
      </div>

      <div className="splash-name">Vanguard Core</div>
      <div className="splash-sub">Protection · E-Sport · Diagnostic PC par Astral Security</div>

      {/* Progress */}
      <div className="splash-bar">
        <div className="splash-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="splash-status">{STEPS[stepIdx]}</div>
    </div>
  );
}
