/**
 * Notification tones. Self-contained on purpose: the main process serialises this function
 * into the desktop notification page, and the Settings page calls it directly for previews,
 * so both always produce the same sound. Do not reference anything outside the function body.
 */
export type NotificationToneKind = 'alert' | 'warning' | 'success' | 'info';

export function playNotificationTone(kind: NotificationToneKind, volume: number): void {
  const w: any = typeof window !== 'undefined' ? window : null;
  const Ctx = w && (w.AudioContext || w.webkitAudioContext);
  if (!Ctx || !(volume > 0)) return;
  try {
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.min(1, volume) * 0.4, t0);
    master.connect(ctx.destination);
    const tone = (type: string, f0: number, f1: number, start: number, dur: number, level: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0 + start);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + start + dur * 0.8);
      gain.gain.setValueAtTime(level, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    };
    if (kind === 'alert') tone('sawtooth', 880, 440, 0, 0.28, 0.8);
    else if (kind === 'warning') { tone('triangle', 520, 320, 0, 0.11, 0.7); tone('triangle', 520, 320, 0.15, 0.11, 0.7); }
    else if (kind === 'success') { tone('sine', 587.33, 587.33, 0, 0.2, 0.4); tone('sine', 880, 880, 0.12, 0.26, 0.5); }
    else tone('sine', 587.33, 880, 0, 0.2, 0.4);
    setTimeout(() => { try { ctx.close(); } catch (e) { /* already closed */ } }, 1000);
  } catch (e) { /* audio unavailable: the notification is still shown */ }
}
