import React from 'react';
import vanguardLogoUrl from '@/assets/vanguard-logo.png';

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
  glow = false,
}: VanguardLogoProps) {
  return (
    <img
      src={vanguardLogoUrl}
      alt="Astral Vanguard Logo"
      width={size}
      height={size}
      className={`select-none pointer-events-none inline-block shrink-0 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        filter: glow
          ? 'drop-shadow(0 2px 8px rgba(142, 174, 232, 0.25))'
          : 'none',
        ...style,
      }}
      draggable={false}
    />
  );
}

export { VanguardLogo };
