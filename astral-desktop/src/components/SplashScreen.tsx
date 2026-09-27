import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initialisation...');

  const steps = [
    { pct: 20, label: 'Chargement des modules...' },
    { pct: 45, label: 'Connexion aux services...' },
    { pct: 65, label: 'Vérification de la sécurité...' },
    { pct: 85, label: 'Prêt au démarrage...' },
    { pct: 100, label: 'Bienvenue dans Astral Vanguard' },
  ];

  useEffect(() => {
    let i = 0;
    const run = () => {
      if (i >= steps.length) return;
      setProgress(steps[i].pct);
      setStatus(steps[i].label);
      i++;
      setTimeout(run, i === steps.length ? 400 : 480);
    };
    setTimeout(run, 300);
  }, []);

  return (
    <div className="splash-root">
      <div className="splash-bg" />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <img
          src="/logo.png"
          alt="Astral Vanguard"
          className="splash-logo"
          onError={(e) => {
            // Fallback SVG icon if image not found
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* SVG fallback logo */}
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="splash-logo" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00d4ff"/>
              <stop offset="100%" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
          <path d="M40 6 L70 22 L70 54 L40 74 L10 54 L10 22 Z" stroke="url(#lg1)" strokeWidth="2" fill="none" opacity="0.6"/>
          <path d="M40 18 L60 28 L60 52 L40 64 L20 52 L20 28 Z" stroke="url(#lg1)" strokeWidth="1.5" fill="none" opacity="0.4"/>
          <path d="M30 38 L40 22 L50 38 L43 38 L43 58 L37 58 L37 38 Z" fill="url(#lg1)" opacity="0.9"/>
        </svg>

        <div className="splash-title">ASTRAL VANGUARD</div>
        <div className="splash-sub">by Astral Security · v1.0.0</div>
        <div className="splash-progress">
          <div className="splash-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div style={{ fontSize: 11, color: 'rgba(160,160,200,0.5)', letterSpacing: '0.05em', height: 16 }}>
          {status}
        </div>
      </div>
    </div>
  );
}
