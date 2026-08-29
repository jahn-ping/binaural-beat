import * as Tone from 'tone';
import type { TherapyEngine } from '../core/TherapyEngine';
import type { TinnitusProfile } from '../core/TinnitusProfile';
import { VoicePool } from '../shared/VoicePool';

function erbRate(f0: number): number {
  return 24.7 * (4.37 * f0 / 1000 + 1);
}

function crFrequencies(f0: number, spacingErb: number): number[] {
  const erb = erbRate(f0);
  return [-1.5, -0.5, 0.5, 1.5].map((m) => f0 + m * spacingErb * erb);
}

function shuffle<T>(arr: T[]): T[] {
  return arr.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/**
 * CR-Inspired Neuromodulation (experimental).
 * 4 sine tones spaced via ERB around the tinnitus frequency.
 * Pseudorandom non-repeating burst order, enveloped onsets.
 * Max 20-minute session with auto-stop.
 */
export class CREngine implements TherapyEngine {
  readonly id = 'cr-inspired';
  readonly evidenceLabel = 'experimental' as const;
  private pool: VoicePool;
  private sequenceId: number | null = null;
  private sessionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_SESSION_MS = 20 * 60 * 1000;
  private freqs: number[] = [];

  constructor(bus: Tone.Gain) {
    this.pool = new VoicePool(bus, 4);
  }

  start(profile: TinnitusProfile) {
    const f0 = profile.dominantPitchHz ?? 4000;
    const spacing = profile.crSpacingErb ?? 0.75;
    this.freqs = crFrequencies(f0, spacing);

    this.sequenceId = Tone.Transport.scheduleRepeat((time) => {
      const order = shuffle([0, 1, 2, 3]);
      order.forEach((idx, i) => {
        const t = time + i * 0.3;
        this.pool.playTone(idx, this.freqs[idx]!, 0.12, '16n', t);
      });
    }, '1.5s');

    Tone.Transport.start();
    this.sessionTimeout = setTimeout(() => this.stop(), this.MAX_SESSION_MS);
  }

  stop(fade = 1.5) {
    if (this.sequenceId !== null) {
      Tone.Transport.clear(this.sequenceId);
      this.sequenceId = null;
    }
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
    this.pool.rampAllTo(0, fade);
  }

  setIntensity(g: number) {
    this.pool.setMasterGain(g * 0.12);
  }

  dispose() {
    this.stop();
    this.pool.dispose();
  }
}
