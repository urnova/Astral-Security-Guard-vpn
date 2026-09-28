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
          ? 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.45)) drop-shadow(0 0 20px rgba(139, 92, 246, 0.3))'
          : 'none',
        ...style,
      }}
      aria-label="Astral Vanguard Logo"
      role="img"
    >
      <defs>
        <linearGradient id="vg-glow-unique" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="vg-border-unique" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id="vg-v-left-unique" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="vg-v-right-unique" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <filter id="vg-neon-unique" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer Ambient Glow */}
      <polygon
        points="256,32 448,96 432,336 256,480 80,336 64,96"
        fill="url(#vg-glow-unique)"
        opacity="0.3"
        filter="url(#vg-neon-unique)"
      />

      {/* Shield Body */}
      <polygon
        points="256,32 448,96 432,336 256,480 80,336 64,96"
        fill="#0b0f19"
        stroke="url(#vg-border-unique)"
        strokeWidth="10"
        strokeLinejoin="round"
      />

      {/* Inner Cyber Bevel */}
      <polygon
        points="256,68 416,122 402,320 256,444 110,320 96,122"
        fill="none"
        stroke="#06b6d4"
        strokeWidth="3"
        strokeOpacity="0.65"
        strokeLinejoin="round"
      />

      {/* Vanguard 'V' Wing Left */}
      <polygon points="150,160 205,160 256,320 256,395" fill="url(#vg-v-left-unique)" />

      {/* Vanguard 'V' Wing Right */}
      <polygon points="362,160 307,160 256,320 256,395" fill="url(#vg-v-right-unique)" />

      {/* Vanguard Razor Core Blade */}
      <polygon
        points="256,130 290,200 256,260 222,200"
        fill="#ffffff"
        filter="url(#vg-neon-unique)"
      />
      <circle cx="256" cy="200" r="5" fill="#00f0ff" />
    </svg>
  );
}
