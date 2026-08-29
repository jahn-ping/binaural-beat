import * as Tone from 'tone';

/**
 * Band-intensity entrainment mixer (webQ-gauntlet synthesized design).
 *
 * Five brainwave bands (Delta/Theta/Alpha/Beta/Gamma), each rendered as a
 * hard-panned L/R oscillator pair: L = carrier, R = carrier + beat. The beat
 * (|R − L|) is the band's binaural frequency; the 0-100 intensity maps to a
 * per-band gain capped at ENTRAINMENT_MAX_GAIN so all five at 100 cannot clip.
 * All bands sum into one bus that feeds the master chain.
 */

export type BandName = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';

export interface BandDef {
  id: BandName;
  label: string;
  rangeHz: [number, number];
  beat: number; // center beat frequency (Hz) = |R − L|
  defaultIntensity: number;
  color: string;
}

export const ENTRAINMENT_BANDS: Record<BandName, BandDef> = {
  delta: { id: 'delta', label: 'Delta', rangeHz: [0.5, 4], beat: 2, defaultIntensity: 40, color: '#ff6b6b' },
  theta: { id: 'theta', label: 'Theta', rangeHz: [4, 8], beat: 5, defaultIntensity: 100, color: '#4ecdc4' },
  alpha: { id: 'alpha', label: 'Alpha', rangeHz: [8, 13], beat: 10, defaultIntensity: 40, color: '#45b7d1' },
  beta: { id: 'beta', label: 'Beta', rangeHz: [13, 30], beat: 18, defaultIntensity: 20, color: '#96ceb4' },
  gamma: { id: 'gamma', label: 'Gamma', rangeHz: [30, 100], beat: 40, defaultIntensity: 20, color: '#ffeaa7' },
};

export const BAND_NAMES = Object.keys(ENTRAINMENT_BANDS) as BandName[];

export const DEFAULT_CARRIER = 144; // Hz (reference default base tone)
export const ENTRAINMENT_MAX_GAIN = 0.12; // per-band peak to avoid clipping with 5 bands
export const FREQ_RAMP_TIME = 0.05; // seconds
export const GAIN_RAMP_TIME = 0.1; // seconds

export interface BandState {
  intensity: number; // 0-100
  beat: number; // Hz (fixed per band, stored for future editing)
}

export type BandMap = Record<BandName, BandState>;

export interface EntrainmentSettings {
  enabled: boolean;
  carrier: number; // Hz (base tone, 100-1000)
  preset: string; // 'Default' | 'Alpha' | ... | 'Custom'
  schedule: string; // '' = none, else SCHEDULES id
  bands: BandMap;
}

export const defaultEntrainmentSettings = (): EntrainmentSettings => ({
  enabled: true,
  carrier: DEFAULT_CARRIER,
  preset: 'Default',
  schedule: '',
  bands: Object.fromEntries(
    BAND_NAMES.map((id) => [id, { intensity: ENTRAINMENT_BANDS[id].defaultIntensity, beat: ENTRAINMENT_BANDS[id].beat }]),
  ) as BandMap,
});

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Pure intensity -> gain mapping (0-100 -> 0..0.12). Exported for tests + reuse. */
export const intensityToGain = (intensity: number): number =>
  (clamp(intensity, 0, 100) / 100) * ENTRAINMENT_MAX_GAIN;

/**
 * Safe ramp for low frequencies — a fixed 0.05 s ramp at 20 Hz is a ~1 Hz/ms
 * sweep (zipper noise). Scale ramp time with period: max(0.05, 3/f) is ~150 ms
 * at 20 Hz, ~21 ms at 144 Hz (critique S1).
 */
const freqRamp = (hz: number): number => Math.max(FREQ_RAMP_TIME, 3 / Math.max(1, hz));

/** Ramp when playing (click-free), set instantly otherwise. */
function setParam(
  p: { rampTo(v: number, t: number): unknown; value: number | string },
  v: number,
  t: number,
  playing: boolean,
): void {
  if (playing) p.rampTo(v, t);
  else p.value = v;
}

class Band {
  private left: Tone.Oscillator;
  private right: Tone.Oscillator;
  private gain: Tone.Gain;
  private output: Tone.InputNode;
  private active = false;
  private connected = true;

  constructor(carrier: number, beat: number, output: Tone.InputNode) {
    this.output = output;
    this.left = new Tone.Oscillator({ frequency: carrier, type: 'sine' });
    this.right = new Tone.Oscillator({ frequency: carrier + beat, type: 'sine' });
    const lp = new Tone.Panner(-1);
    const rp = new Tone.Panner(1);
    this.gain = new Tone.Gain(0); // starts muted; intensity sets this
    this.left.chain(lp, this.gain, output);
    this.right.chain(rp, this.gain, output);
  }

  start(): void {
    if (this.active) return;
    this.left.start();
    this.right.start();
    this.active = true;
  }

  stop(): void {
    if (!this.active) return;
    try {
      this.left.stop();
      this.right.stop();
    } catch {
      /* already stopped */
    }
    this.active = false;
  }

  apply(carrier: number, beat: number, intensity: number, playing: boolean): void {
    setParam(this.left.frequency, carrier, freqRamp(carrier), playing);
    setParam(this.right.frequency, carrier + beat, freqRamp(carrier + beat), playing);
    const gain = intensityToGain(intensity);
    // CPU: fully disconnect zero-intensity bands from the bus instead of
    // running all ten oscillators muted (critique S1). Reconnect on demand.
    if (gain <= 0 && this.connected) {
      try {
        this.gain.disconnect();
      } catch {
        /* ignore */
      }
      this.connected = false;
    } else if (gain > 0 && !this.connected) {
      this.gain.connect(this.output);
      this.connected = true;
    }
    setParam(this.gain.gain, gain, GAIN_RAMP_TIME, playing);
  }

  /** Cancel + re-anchor this band's scheduled automation at `now` (critique R2 P0). */
  cancelAutomation(now: number): void {
    const anchor = (p: { cancelScheduledValues(t: number): unknown; setValueAtTime(v: number, t: number): unknown; value: number | string }): void => {
      try {
        p.cancelScheduledValues(now);
      } catch {
        /* ignore */
      }
      try {
        if (typeof p.value === 'number') p.setValueAtTime(p.value, now);
      } catch {
        /* ignore */
      }
    };
    anchor(this.left.frequency);
    anchor(this.right.frequency);
    anchor(this.gain.gain);
  }

  dispose(): void {
    this.stop();
    try {
      this.left.dispose();
      this.right.dispose();
      this.gain.dispose();
    } catch {
      /* ignore */
    }
  }
}

export class EntrainmentMixer {
  private bus: Tone.Gain;
  private bands = new Map<BandName, Band>();
  private started = false;
  private current: EntrainmentSettings | null = null;

  constructor(output: Tone.InputNode) {
    this.bus = new Tone.Gain(1);
    this.bus.connect(output);
    BAND_NAMES.forEach((id) => {
      this.bands.set(id, new Band(DEFAULT_CARRIER, ENTRAINMENT_BANDS[id].beat, this.bus));
    });
  }

  get running(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    this.bands.forEach((b) => b.start());
    this.started = true;
  }

  stop(): void {
    if (!this.started) return;
    this.bands.forEach((b) => b.stop());
    this.started = false;
  }

  cancelAutomation(now: number): void {
    this.bands.forEach((b) => b.cancelAutomation(now));
  }

  applyState(next: EntrainmentSettings, playing: boolean): void {
    const prev = this.current;
    this.current = next;
    if (prev) {
      if (!prev.enabled && next.enabled) setParam(this.bus.gain, 1, GAIN_RAMP_TIME, playing);
      if (prev.enabled && !next.enabled) setParam(this.bus.gain, 0, GAIN_RAMP_TIME, playing);
    } else {
      this.bus.gain.value = next.enabled ? 1 : 0;
    }
    BAND_NAMES.forEach((id) => {
      const band = this.bands.get(id)!;
      band.apply(
        next.carrier,
        next.bands[id].beat,
        next.enabled ? next.bands[id].intensity : 0,
        playing,
      );
    });
  }

  dispose(): void {
    this.stop();
    this.bands.forEach((b) => b.dispose());
    this.bands.clear();
    try {
      this.bus.dispose();
    } catch {
      /* ignore */
    }
  }
}
