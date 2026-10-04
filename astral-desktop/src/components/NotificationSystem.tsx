import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Zap, Radio, CheckCircle2, Info, X } from 'lucide-react';
import { playSound, SoundEffectType } from '../lib/audioSynth';

export interface ToastNotification {
  id: string;
  type: 'threat' | 'lag' | 'game' | 'sos' | 'update' | 'info' | 'report' | 'success';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
  critical?: boolean;
}

export const NotificationSystem: React.FC<{ dndEnabled?: boolean }> = ({ dndEnabled = false }) => {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = (toast: Omit<ToastNotification, 'id'>) => {
    if (dndEnabled && !toast.critical) {
      return;
    }

    const id = typeof window !== 'undefined' && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `toast-${Date.now()}`;
    const newToast: ToastNotification = { ...toast, id };

    setToasts((prev) => [...prev.slice(-2), newToast]); // max 3 concurrent toasts

    let soundType: SoundEffectType = 'scan_complete';
    if (toast.type === 'threat') soundType = 'threat_blocked';
    else if (toast.type === 'game') soundType = 'game_detected';
    else if (toast.type === 'lag') soundType = 'lag_alert';
    else if (toast.type === 'sos') soundType = 'sos_resolved';
    else if (toast.type === 'update') soundType = 'update_ready';
    else if (toast.type === 'report' || toast.type === 'success') soundType = 'scan_complete';

    playSound(soundType);

    const timeout = toast.duration || (toast.type === 'threat' ? 9000 : 5000);
    setTimeout(() => {
      removeToast(id);
    }, timeout);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const vanguard = (window as any).vanguard;
    if (!vanguard?.on) return;

    const unsubTrigger = vanguard.on('notification:trigger', (data: any) => {
      addToast({
        type: data.type || 'info',
        title: data.title || 'Notification Vanguard',
        message: data.message || '',
        actionLabel: data.actionLabel,
        critical: data.critical || data.type === 'threat',
      });
    });

    const unsubLag = vanguard.on('doctor:lag-alert', (data: any) => {
      addToast({
        type: 'lag',
        title: 'Alerte Latence Réseau',
        message: data.message || 'Pic de latence inhabituel détecté.',
        critical: true,
      });
    });

    const unsubGame = vanguard.on('gaming:game-started', (data: any) => {
      addToast({
        type: 'game',
        title: 'Mode Gaming Actif',
        message: `Jeu détecté : ${data.gameName || 'Processus plein écran'}. Optimisations actives.`,
        critical: false,
      });
    });

    return () => {
      if (typeof unsubTrigger === 'function') unsubTrigger();
      if (typeof unsubLag === 'function') unsubLag();
      if (typeof unsubGame === 'function') unsubGame();
    };
  }, [dndEnabled]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 380,
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          let accentColor = 'var(--cyan)';
          let icon = <Info size={16} style={{ color: 'var(--cyan)' }} />;

          if (toast.type === 'threat') {
            accentColor = 'var(--red)';
            icon = <ShieldAlert size={16} style={{ color: 'var(--red)' }} />;
          } else if (toast.type === 'lag') {
            accentColor = 'var(--yellow)';
            icon = <Radio size={16} style={{ color: 'var(--yellow)' }} />;
          } else if (toast.type === 'game') {
            accentColor = 'var(--cyan)';
            icon = <Zap size={16} style={{ color: 'var(--cyan)' }} />;
          } else if (toast.type === 'sos' || toast.type === 'report' || toast.type === 'success') {
            accentColor = 'var(--green)';
            icon = <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />;
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                pointerEvents: 'auto',
                backgroundColor: 'rgba(9, 13, 22, 0.94)',
                backdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${accentColor}`,
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
                borderRadius: 12,
                padding: '12px 14px',
                color: 'var(--text-primary)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    {toast.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {toast.message}
                  </div>
                  {toast.actionLabel && (
                    <button
                      onClick={() => {
                        toast.onAction?.();
                        removeToast(toast.id);
                      }}
                      className="btn btn-primary"
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        padding: '4px 10px',
                      }}
                    >
                      {toast.actionLabel}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                  }}
                  title="Fermer"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
