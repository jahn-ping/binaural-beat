import * as Tone from 'tone';

interface Voice {
  synth: Tone.Synth;
  gain: Tone.Gain;
  lastUsed: number;
}

/**
 * Shared multi-voice engine for CR neuromodulation, dual-tone matching,
 * and multi-frequency masking. Pre-allocates N synth voices with individual
 * gain nodes routed to a shared bus.
 */
export class VoicePool {
  private voices: Voice[];
  private masterGain: Tone.Gain;

  constructor(bus: Tone.Gain, count: number) {
    this.masterGain = new Tone.Gain(1);
    this.masterGain.connect(bus);
    this.voices = Array.from({ length: count }, () => {
      const gain = new Tone.Gain(0);
      const synth = new Tone.Synth({ oscillator: { type: 'sine' } });
      synth.connect(gain);
      gain.connect(this.masterGain);
      return { synth, gain, lastUsed: 0 };
    });
  }

  playTone(index: number, freq: number, gainValue: number, duration: string, time?: number) {
    const voice = this.voices[index];
    if (!voice) return;
    const now = time ?? Tone.now();
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(gainValue, now + 0.02);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.1);
    voice.synth.triggerAttackRelease(freq, duration, now);
    voice.lastUsed = Date.now();
  }

  setMasterGain(g: number) {
    this.masterGain.gain.rampTo(g, 0.5);
  }

  rampAllTo(target: number, fade: number) {
    this.voices.forEach((v) => v.gain.gain.rampTo(target, fade));
  }

  dispose() {
    this.voices.forEach((v) => {
      v.synth.dispose();
      v.gain.dispose();
    });
    this.masterGain.dispose();
  }
}
