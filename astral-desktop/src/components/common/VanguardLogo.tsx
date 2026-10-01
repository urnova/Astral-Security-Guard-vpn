import React from 'react';

interface VanguardLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  glow?: boolean;
}

export default function VanguardLogo({
  size = 32,
  className = '',
  style = {},
  glow = true,
}: VanguardLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        flexShrink: 0,
        filter: glow
          ? 'drop-shadow(0 0 12px rgba(0, 245, 255, 0.45)) drop-shadow(0 0 24px rgba(139, 92, 246, 0.35))'
          : 'none',
        ...style,
      }}
      aria-label="Astral Vanguard Logo"
      role="img"
    >
      <defs>
        {/* Core Gradients */}
        <linearGradient id="avg-shield-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f5ff" />
          <stop offset="45%" stopColor="#3b82f6" />
          <stop offset="80%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        <linearGradient id="avg-shield-bg" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#0d1124" />
          <stop offset="60%" stopColor="#060814" />
          <stop offset="100%" stopColor="#04050d" />
        </linearGradient>

        <linearGradient id="avg-wing-left" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f5ff" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <linearGradient id="avg-wing-right" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>

        <linearGradient id="avg-star-core" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>

        <filter id="avg-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Exterior Stealth Aura */}
      <polygon
        points="256,24 464,96 440,352 256,488 72,352 48,96"
        fill="url(#avg-shield-border)"
        opacity="0.25"
        filter="url(#avg-glow)"
      />

      {/* Primary Stealth Armor Shield */}
      <polygon
        points="256,28 460,98 436,348 256,482 76,348 52,98"
        fill="url(#avg-shield-bg)"
        stroke="url(#avg-shield-border)"
        strokeWidth="9"
        strokeLinejoin="round"
      />

      {/* Inner Cyber Armor Facet (Upper) */}
      <polygon
        points="256,64 424,124 256,180 88,124"
        fill="rgba(0, 245, 255, 0.05)"
        stroke="rgba(0, 245, 255, 0.4)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Inner Cyber Armor Facet (Lower Spine) */}
      <polygon
        points="256,180 404,324 256,444 108,324"
        fill="rgba(139, 92, 246, 0.04)"
        stroke="rgba(139, 92, 246, 0.35)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Vanguard Wing Left (Aero-Blade) */}
      <polygon
        points="140,164 212,164 256,356 216,356"
        fill="url(#avg-wing-left)"
        opacity="0.95"
      />

      {/* Vanguard Wing Right (Aero-Blade) */}
      <polygon
        points="372,164 300,164 256,356 296,356"
        fill="url(#avg-wing-right)"
        opacity="0.95"
      />

      {/* Wing Accent Lines */}
      <line x1="176" y1="164" x2="236" y2="356" stroke="#ffffff" strokeWidth="2.5" opacity="0.6" />
      <line x1="336" y1="164" x2="276" y2="356" stroke="#ffffff" strokeWidth="2.5" opacity="0.6" />

      {/* Central Astral Star (4-Point Diamond Core Blade) */}
      <polygon
        points="256,112 284,196 368,224 284,252 256,336 228,252 144,224 228,196"
        fill="url(#avg-star-core)"
        filter="url(#avg-glow)"
      />

      {/* Diamond Star Center Highlight */}
      <polygon
        points="256,160 274,224 256,288 238,224"
        fill="#ffffff"
      />

      {/* High-Tech Orbital Ring Dots */}
      <circle cx="256" cy="224" r="5" fill="#00f5ff" />
      <circle cx="256" cy="74" r="3" fill="#00f5ff" />
      <circle cx="434" cy="130" r="3" fill="#38bdf8" />
      <circle cx="78" cy="130" r="3" fill="#00f5ff" />
      <circle cx="256" cy="454" r="3" fill="#c084fc" />
    </svg>
  );
}

export { VanguardLogo };
