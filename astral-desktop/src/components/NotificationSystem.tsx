import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Zap, Radio, CheckCircle, Info, X, BellOff } from 'lucide-react';
import { playSound, SoundEffectType } from '../lib/audioSynth';

export interface ToastNotification {
  id: string;
  type: 'threat' | 'lag' | 'game' | 'sos' | 'update' | 'info';
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
    // If DND is active and notification is not critical, suppress
    if (dndEnabled && !toast.critical) {
      return;
    }

    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    const newToast: ToastNotification = { ...toast, id };

    setToasts((prev) => [...prev.slice(-3), newToast]); // max 4 stacked toasts

    // Trigger matching procedural audio
    let soundType: SoundEffectType = 'scan_complete';
    if (toast.type === 'threat') soundType = 'threat_blocked';
    else if (toast.type === 'game') soundType = 'game_detected';
    else if (toast.type === 'lag') soundType = 'lag_alert';
    else if (toast.type === 'sos') soundType = 'sos_resolved';
    else if (toast.type === 'update') soundType = 'update_ready';

    playSound(soundType);

    // Auto-dismiss after duration (default 6s, 10s for threat)
    const timeout = toast.duration || (toast.type === 'threat' ? 10000 : 6000);
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

    // Listen to generic notification trigger from main process
    const unsubTrigger = vanguard.on('notification:trigger', (data: any) => {
      addToast({
        type: data.type || 'info',
        title: data.title || 'Notification Vanguard',
        message: data.message || '',
        actionLabel: data.actionLabel,
        critical: data.critical || data.type === 'threat',
      });
    });

    // Lag alert listener
    const unsubLag = vanguard.on('doctor:lag-alert', (data: any) => {
      addToast({
        type: 'lag',
        title: 'Alerte Latence Réseau',
        message: data.message || 'Pic de latence inhabituel détecté.',
        critical: true,
      });
    });

    // Game detection listener
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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none max-w-sm w-full">
      <AnimatePresence>
        {toasts.map((toast) => {
          let borderColor = 'border-purple-500/40';
          let glowColor = 'shadow-[0_0_20px_rgba(168,85,247,0.25)]';
          let icon = <Info className="w-5 h-5 text-purple-400" />;

          if (toast.type === 'threat') {
            borderColor = 'border-red-500/60';
            glowColor = 'shadow-[0_0_25px_rgba(239,68,68,0.35)]';
            icon = <ShieldAlert className="w-5 h-5 text-red-400" />;
          } else if (toast.type === 'lag') {
            borderColor = 'border-amber-500/60';
            glowColor = 'shadow-[0_0_20px_rgba(245,158,11,0.3)]';
            icon = <Radio className="w-5 h-5 text-amber-400" />;
          } else if (toast.type === 'game') {
            borderColor = 'border-cyan-500/60';
            glowColor = 'shadow-[0_0_20px_rgba(6,182,212,0.3)]';
            icon = <Zap className="w-5 h-5 text-cyan-400" />;
          } else if (toast.type === 'sos') {
            borderColor = 'border-emerald-500/60';
            glowColor = 'shadow-[0_0_20px_rgba(16,185,129,0.3)]';
            icon = <CheckCircle className="w-5 h-5 text-emerald-400" />;
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto bg-[#0d0d21]/95 backdrop-blur-xl border ${borderColor} ${glowColor} rounded-xl p-4 text-white shadow-2xl relative overflow-hidden`}
            >
              {/* Subtle top indicator bar */}
              <div
                className={`absolute top-0 left-0 right-0 h-0.5 ${
                  toast.type === 'threat'
                    ? 'bg-red-500'
                    : toast.type === 'lag'
                    ? 'bg-amber-500'
                    : toast.type === 'game'
                    ? 'bg-cyan-500'
                    : 'bg-purple-500'
                }`}
              />

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 shrink-0 mt-0.5">
                  {icon}
                </div>
                <div className="flex-1 min-w-0 pr-4">
                  <h4 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-1.5">
                    {toast.title}
                  </h4>
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed break-words">
                    {toast.message}
                  </p>
                  {toast.actionLabel && (
                    <button
                      onClick={() => {
                        toast.onAction?.();
                        removeToast(toast.id);
                      }}
                      className="mt-2.5 text-xs font-semibold px-3 py-1 rounded-md bg-purple-600/80 hover:bg-purple-600 text-white transition-colors"
                    >
                      {toast.actionLabel}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
