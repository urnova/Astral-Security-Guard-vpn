/**
 * Astral Vanguard - Web Audio API Sound Synthesizer
 * 100% procedural audio generator with zero external asset dependencies.
 * Produces crisp, modern gaming sound effects for security & network events.
 */

export type SoundEffectType =
  | 'threat_blocked'
  | 'game_detected'
  | 'lag_alert'
  | 'sos_resolved'
  | 'update_ready'
  | 'scan_complete';

let audioCtx: AudioContext | null = null;
let soundVolume = 0.6; // 0.0 to 1.0
let soundMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setMasterVolume(volume: number) {
  soundVolume = Math.max(0, Math.min(1, volume));
}

export function setMuted(muted: boolean) {
  soundMuted = muted;
}

export function playSound(type: SoundEffectType) {
  if (soundMuted || soundVolume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(soundVolume * 0.4, now);
  masterGain.connect(ctx.destination);

  switch (type) {
    case 'threat_blocked': {
      // Descending warning alarm (880Hz -> 440Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
      break;
    }

    case 'game_detected': {
      // Upbeat neon gaming triad (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const noteOsc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        noteOsc.type = 'sine';
        noteOsc.frequency.setValueAtTime(freq, now + i * 0.08);
        noteGain.gain.setValueAtTime(0.6, now + i * 0.08);
        noteGain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.25);
        noteOsc.connect(noteGain);
        noteGain.connect(masterGain);
        noteOsc.start(now + i * 0.08);
        noteOsc.stop(now + i * 0.08 + 0.26);
      });
      break;
    }

    case 'lag_alert': {
      // Urgent double-pulsed alert
      [0, 0.15].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now + delay);
        osc.frequency.exponentialRampToValueAtTime(320, now + delay + 0.1);
        gain.gain.setValueAtTime(0.7, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.11);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
      });
      break;
    }

    case 'sos_resolved': {
      // Smooth harmonic resolution chord (440Hz -> 554Hz -> 659Hz)
      const freqs = [440, 554.37, 659.25, 880];
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.52);
      });
      break;
    }

    case 'update_ready': {
      // Futuristic ascending sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.42);
      break;
    }

    case 'scan_complete': {
      // Gentle confirmation two-tone chime
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.22);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12); // A5
      gain2.gain.setValueAtTime(0.5, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.4);
      break;
    }
  }
}
