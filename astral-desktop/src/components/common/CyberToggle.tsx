import React from 'react';

export interface CyberToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void | Promise<void>;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  glowColor?: 'cyan' | 'purple' | 'green' | 'orange' | 'amber';
  color?: 'cyan' | 'purple' | 'green' | 'orange' | 'amber';
}

export default function CyberToggle({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  ariaLabel = 'Basculer',
  glowColor,
  color,
}: CyberToggleProps) {
  const effectiveGlow = color || glowColor || 'cyan';
  const isSm = size === 'sm';
  const width = isSm ? 38 : 46;
  const height = isSm ? 20 : 24;
  const knobSize = isSm ? 14 : 18;
  const translateDist = width - knobSize - 6;

  const getGlowBg = () => {
    if (!checked) return 'rgba(30, 41, 59, 0.7)';
    if (effectiveGlow === 'green') return 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)';
    if (effectiveGlow === 'purple') return 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)';
    if (effectiveGlow === 'orange' || effectiveGlow === 'amber') return 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)';
    return 'linear-gradient(135deg, #00f5ff 0%, #6366f1 100%)';
  };

  const getShadow = () => {
    if (!checked) return 'inset 0 1px 3px rgba(0, 0, 0, 0.5)';
    if (effectiveGlow === 'green') return '0 0 12px rgba(16, 185, 129, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.4)';
    if (effectiveGlow === 'purple') return '0 0 12px rgba(139, 92, 246, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.4)';
    if (effectiveGlow === 'orange' || effectiveGlow === 'amber') return '0 0 12px rgba(245, 158, 11, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.4)';
    return '0 0 14px rgba(0, 245, 255, 0.55), inset 0 1px 2px rgba(255, 255, 255, 0.4)';
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width,
        height,
        padding: isSm ? 3 : 3,
        borderRadius: 9999,
        background: getGlowBg(),
        boxShadow: getShadow(),
        border: checked ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: knobSize,
          height: knobSize,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: checked
            ? '0 2px 5px rgba(0, 0, 0, 0.35), 0 0 8px rgba(255, 255, 255, 0.8)'
            : '0 2px 4px rgba(0, 0, 0, 0.4)',
          transform: checked ? `translateX(${translateDist}px)` : 'translateX(0px)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease',
        }}
      />
    </button>
  );
}

export { CyberToggle };
