import * as Tone from 'tone';
import type { TherapyEngine } from '../core/TherapyEngine';
import type { TinnitusProfile } from '../core/TinnitusProfile';

/**
 * Frequency sweep + residual inhibition test.
 * Logarithmic sweep around the tinnitus frequency, time-capped at 120s.
 * Post-sweep prompts user for VAS rating.
 */
export class FrequencySweepEngine implements TherapyEngine {
  readonly id = 'sweep';
  readonly evidenceLabel = 'symptom-management' as const;
  private osc: Tone.Oscillator;
  private gain: Tone.Gain;
  private isRunning = false;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_DURATION_SEC = 120;
  private readonly FIXED_AMPLITUDE = 0.15;
  private bus: Tone.Gain;
  onSweepComplete?: () => void;

  constructor(bus: Tone.Gain) {
    this.bus = bus;
    this.osc = new Tone.Oscillator({ type: 'sine' });
    this.gain = new Tone.Gain(0);
    this.osc.chain(this.gain, this.bus);
  }

  start(profile: TinnitusProfile) {
    const centerHz = profile.dominantPitchHz ?? 4000;
    this.sweep(centerHz, 1, this.MAX_DURATION_SEC);
  }

  sweep(centerHz: number, spanOctaves: number, durationSec: number) {
    if (this.isRunning) return;
    this.isRunning = true;

    const low = centerHz / Math.pow(2, spanOctaves / 2);
    const high = centerHz * Math.pow(2, spanOctaves / 2);
    const now = Tone.now();

    this.osc.start(now);
    this.gain.gain.rampTo(this.FIXED_AMPLITUDE, 1);
    this.osc.frequency.setValueAtTime(low, now);
    this.osc.frequency.exponentialRampToValueAtTime(high, now + durationSec);

    this.safetyTimer = setTimeout(() => {
      this.stopAndPromptRating();
    }, durationSec * 1000);
  }

  private stopAndPromptRating() {
    this.gain.gain.rampTo(0, 0.3);
    setTimeout(() => {
      try { this.osc.stop(); } catch { /* already stopped */ }
      this.isRunning = false;
    }, 400);
    this.onSweepComplete?.();
  }

  stop() {
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.gain.gain.rampTo(0, 0.3);
    setTimeout(() => {
      try { this.osc.stop(); } catch { /* already stopped */ }
      this.isRunning = false;
    }, 400);
  }

  setIntensity() {
    /* no-op: fixed amplitude for safety */
  }

  dispose() {
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.osc.dispose();
    this.gain.dispose();
  }
}
