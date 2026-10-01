import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    const newToast: ToastNotification = { ...toast, id };

    setToasts((prev) => [...prev.slice(-2), newToast]); // max 3 toasts

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
        message: `Jeu détecté : ${data.gameName || 'Processus plein écran'}. Latence et priorité CPU optimisées.`,
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
        maxWidth: 360,
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          let accentColor = '#8b5cf6';
          let icon = <Info size={16} style={{ color: accentColor }} />;

          if (toast.type === 'threat') {
            accentColor = '#ff4b4b';
            icon = <ShieldAlert size={16} style={{ color: accentColor }} />;
          } else if (toast.type === 'lag') {
            accentColor = '#ff9f1c';
            icon = <Radio size={16} style={{ color: accentColor }} />;
          } else if (toast.type === 'game') {
            accentColor = '#00d4ff';
            icon = <Zap size={16} style={{ color: accentColor }} />;
          } else if (toast.type === 'sos' || toast.type === 'report' || toast.type === 'success') {
            accentColor = '#10d9a0';
            icon = <CheckCircle2 size={16} style={{ color: accentColor }} />;
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              style={{
                pointerEvents: 'auto',
                backgroundColor: 'rgba(10, 10, 26, 0.95)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${accentColor}40`,
                boxShadow: `0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px ${accentColor}25`,
                borderRadius: 14,
                padding: '12px 14px',
                color: '#ffffff',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Top Accent Strip */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  backgroundColor: accentColor,
                  boxShadow: `0 0 8px ${accentColor}`,
                }}
              />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>
                    {toast.title}
                  </h4>
                  <p style={{ margin: '3px 0 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {toast.message}
                  </p>
                  {toast.actionLabel && (
                    <button
                      onClick={() => {
                        toast.onAction?.();
                        removeToast(toast.id);
                      }}
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 6,
                        backgroundColor: accentColor,
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
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
                    color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
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
