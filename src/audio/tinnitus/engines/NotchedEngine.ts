import * as Tone from 'tone';
import type { TherapyEngine } from '../core/TherapyEngine';
import type { TinnitusProfile } from '../core/TinnitusProfile';

function octaveWidthToBandwidthHz(centerHz: number, widthOctaves: number): number {
  return centerHz * (Math.pow(2, widthOctaves / 2) - Math.pow(2, -widthOctaves / 2));
}

function centerAndBandwidthToQ(centerHz: number, bandwidthHz: number): number {
  if (bandwidthHz <= 0 || centerHz <= 0) return 1;
  return Math.min(20, Math.max(0.1, centerHz / bandwidthHz));
}

/**
 * Precision-matched notched sound engine.
 * Centers a notch on the user's tinnitus pitch, width in octaves (Okamoto et al.).
 * Dual-cascade notch filters for steeper cut than single biquad.
 * Evidence: mixed clinical evidence.
 */
export class NotchedEngine implements TherapyEngine {
  readonly id = 'notched';
  readonly evidenceLabel = 'mixed-evidence' as const;
  private notchA: Tone.Filter;
  private notchB: Tone.Filter;
  private noise: Tone.Noise;
  private gain: Tone.Gain;
  private bus: Tone.Gain;

  constructor(bus: Tone.Gain) {
    this.bus = bus;
    this.noise = new Tone.Noise('pink');
    this.notchA = new Tone.Filter({ type: 'notch', frequency: 4000, Q: 1.68 });
    this.notchB = new Tone.Filter({ type: 'notch', frequency: 4000, Q: 2.5 });
    this.gain = new Tone.Gain(0);
    this.noise.chain(this.notchA, this.notchB, this.gain, this.bus);
  }

  start(profile: TinnitusProfile) {
    const f0 = profile.dominantPitchHz ?? 4000;
    const widthOctaves = profile.notchWidthOctaves ?? 0.5;
    const depthDb = profile.notchDepthDb ?? -18;
    this.setNotch(f0, widthOctaves, depthDb);
    this.noise.start();
    this.gain.gain.rampTo(0.4, 1.5);
  }

  setNotch(centerHz: number, widthOctaves: number, depthDb: number) {
    const bandwidthHz = octaveWidthToBandwidthHz(centerHz, widthOctaves);
    const q = centerAndBandwidthToQ(centerHz, bandwidthHz);

    this.notchA.frequency.rampTo(centerHz, 0.5);
    this.notchB.frequency.rampTo(centerHz, 0.5);
    this.notchA.Q.rampTo(q, 0.5);
    this.notchB.Q.rampTo(q * 1.5, 0.5);

    const clampedDepth = Math.max(depthDb, -24);
    this.gain.gain.value = Tone.dbToGain(clampedDepth) + 0.6;
  }

  setIntensity(g: number) {
    this.gain.gain.rampTo(g, 0.5);
  }

  stop(fade = 1.5) {
    this.gain.gain.rampTo(0, fade);
    setTimeout(() => {
      try { this.noise.stop(); } catch { /* already stopped */ }
    }, fade * 1000);
  }

  dispose() {
    this.noise.dispose();
    this.notchA.dispose();
    this.notchB.dispose();
    this.gain.dispose();
  }
}
