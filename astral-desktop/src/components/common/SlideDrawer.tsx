import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: any;
  badge?: string;
  children: React.ReactNode;
  width?: number | string;
}

export default function SlideDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  badge,
  children,
  width = 500,
}: SlideDrawerProps) {
  // Listen for Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Light non-blurred click-away shield on the rest of the workspace */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 36, // Below titlebar
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.45)', // Clean dim, ZERO blur
          zIndex: 900,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Slide-in Panel from the Right */}
      <div
        style={{
          position: 'fixed',
          top: 36,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '92vw',
          background: 'var(--surface, #1b1e23)',
          borderLeft: '1px solid var(--line, #2c3037)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 35px rgba(0, 0, 0, 0.65)',
          animation: 'slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--line, #2c3037)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg, #131518)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {Icon && (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(var(--a1r, 142,174,232), 0.12)',
                  border: '1px solid rgba(var(--a1r, 142,174,232), 0.25)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--a1, #8eaee8)',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text, #eceef0)' }}>
                  {title}
                </h3>
                {badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(var(--a1r, 142,174,232), 0.15)',
                      border: '1px solid rgba(var(--a1r, 142,174,232), 0.3)',
                      color: 'var(--a1, #8eaee8)',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && (
                <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--muted, #a0a6af)' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="win-btn"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--line, #2c3037)',
              color: 'var(--muted, #a0a6af)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Fermer (Échap)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text, #eceef0)',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

export { SlideDrawer };

