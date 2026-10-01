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
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        flexShrink: 0,
        filter: glow
          ? 'drop-shadow(0 0 10px rgba(0, 245, 255, 0.4)) drop-shadow(0 0 20px rgba(99, 102, 241, 0.3))'
          : 'none',
        ...style,
      }}
      aria-label="Astral Vanguard Logo"
      role="img"
    >
      <defs>
        {/* Sleek Outer Shield Gradient */}
        <linearGradient id="vg-shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f5ff" />
          <stop offset="40%" stopColor="#3b82f6" />
          <stop offset="75%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        {/* Inner Dark Chrome Gradient */}
        <linearGradient id="vg-core-dark" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#030712" />
        </linearGradient>

        {/* Dynamic V-Blade Neon Gradient */}
        <linearGradient id="vg-v-blade" x1="0%" y1="0%" x2="100%" y2="80%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#00f5ff" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>

        {/* Astral Star Core Flare */}
        <linearGradient id="vg-star-flare" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#00f5ff" />
        </linearGradient>
      </defs>

      {/* ── Outer Stealth Shield Contour ── */}
      <path
        d="M 128,14
           L 218,52
           C 218,128 184,196 128,242
           C 72,196 38,128 38,52
           Z"
        fill="url(#vg-core-dark)"
        stroke="url(#vg-shield-grad)"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* ── Precision Chamfer Cutouts (Left & Right Armor Plates) ── */}
      <path
        d="M 54,64
           L 112,40
           L 84,142
           C 68,114 58,88 54,64
           Z"
        fill="rgba(0, 245, 255, 0.08)"
        stroke="rgba(0, 245, 255, 0.25)"
        strokeWidth="1.5"
      />
      <path
        d="M 202,64
           L 144,40
           L 172,142
           C 188,114 198,88 202,64
           Z"
        fill="rgba(99, 102, 241, 0.08)"
        stroke="rgba(99, 102, 241, 0.25)"
        strokeWidth="1.5"
      />

      {/* ── Iconic Vanguard "V" Blade Apex ── */}
      <path
        d="M 128,198
           L 72,82
           L 104,82
           L 128,146
           L 152,82
           L 184,82
           Z"
        fill="url(#vg-v-blade)"
      />

      {/* ── 4-Point Astral Star Nexus Blade (Center Top) ── */}
      <polygon
        points="128,42 135,62 155,69 135,76 128,96 121,76 101,69 121,62"
        fill="url(#vg-star-flare)"
      />

      {/* Center Micro-Flare Crystal */}
      <circle cx="128" cy="69" r="2.5" fill="#ffffff" />

      {/* Tactical Circuit Micro-Pips */}
      <circle cx="128" cy="222" r="3" fill="#00f5ff" />
      <circle cx="206" cy="56" r="2" fill="#38bdf8" />
      <circle cx="50" cy="56" r="2" fill="#00f5ff" />
    </svg>
  );
}

export { VanguardLogo };
