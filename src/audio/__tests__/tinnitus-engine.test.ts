import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- Hand-rolled Tone mock for the tinnitus graph (Noise/Filter/Gain/LFO/Osc/Limiter) ----
const h = vi.hoisted(() => {
  const dbToGain = (db: number): number => Math.pow(10, db / 20);
  class FakeParam {
    value = 0;
    rampToCalls: Array<[number, number]> = [];
    cancelScheduledValues = vi.fn();
    setValueAtTime = vi.fn((v: number) => {
      this.value = v;
    });
    rampTo(v: number, t: number): void {
      this.rampToCalls.push([v, t]);
      this.value = v;
    }
  }
  const param = (v: number): FakeParam => {
    const p = new FakeParam();
    p.value = v;
    return p;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = (kind: string, opts: Record<string, unknown> = {}): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n: any = {
      kind,
      chain: vi.fn(() => n),
      connect: vi.fn(() => n),
      dispose: vi.fn(),
      start: vi.fn(() => n),
      stop: vi.fn(),
    };
    const num = (key: string, fallback: number): void => {
      if (typeof opts[key] === 'number') n[key] = param(opts[key] as number);
      else n[key] = param(fallback);
    };
    if (kind === 'Volume') {
      num('volume', 0);
    } else if (kind === 'Oscillator') {
      num('frequency', 0);
      n.type = typeof opts.type === 'string' ? opts.type : 'sine';
    } else if (kind === 'Gain') {
      n.gain = param(typeof opts.g === 'number' ? (opts.g as number) : 1);
    } else if (kind === 'Filter') {
      num('Q', 1);
      num('frequency', 350);
      n.type = typeof opts.type === 'string' ? opts.type : 'lowpass';
    } else if (kind === 'LFO') {
      num('frequency', 0.1);
      n.min = typeof opts.min === 'number' ? opts.min : 0;
      n.max = typeof opts.max === 'number' ? opts.max : 0;
    } else if (kind === 'Noise') {
      n.type = typeof opts.type === 'string' ? opts.type : 'pink';
    }
    return n;
  };
  return {
    dbToGain,
    Limiter: class {
      constructor() {
        Object.assign(this, node('Limiter'));
      }
    },
    Gain: class {
      constructor(g = 1) {
        Object.assign(this, node('Gain', { g }));
      }
    },
    Oscillator: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('Oscillator', opts));
      }
    },
    Noise: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('Noise', opts));
      }
    },
    Filter: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('Filter', opts));
      }
    },
    Volume: class {
      constructor(v = 0) {
        Object.assign(this, node('Volume', { volume: v }));
      }
    },
    LFO: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('LFO', opts));
      }
    },
    getDestination: (): unknown => ({ kind: 'destination' }),
    getContext: (): unknown => ({
      rawContext: { suspend: vi.fn(async () => undefined), resume: vi.fn(async () => undefined) },
      state: 'running',
    }),
    now: (): number => 0,
    start: vi.fn(async () => undefined),
  };
});
vi.mock('tone', () => ({ ...h }));

import { TinnitusEngine, TINNITUS_SAFETY, clampPitchHz } from '../tinnitus/TinnitusEngine';
import { DEFAULT_TINNITUS } from '../../state/tinnitus';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEngine = any;

const base = (): typeof DEFAULT_TINNITUS => ({ ...DEFAULT_TINNITUS, disclaimerAcknowledged: true });

const makeEngine = (): AnyEngine => {
  const engine: AnyEngine = new TinnitusEngine();
  engine.applySettings(base()); // establish params (no diff on first call)
  engine.ensureGraph();
  return engine;
};

const hasRamp = (calls: Array<[number, number]>, v: number, t: number, eps = 1e-6): boolean =>
  calls.some(([cv, ct]) => Math.abs(cv - v) < eps && Math.abs(ct - t) < 1e-9);

describe('graph + enable', () => {
  it('starts the noise level silent and applies the 2s fade-in on enable', async () => {
    const engine = makeEngine();
    expect(engine.noiseLevel.gain.value).toBeLessThan(0.001); // starts at −72 dB
    await engine.setActive(true);
    expect(hasRamp(engine.noiseLevel.gain.rampToCalls, h.dbToGain(-24), TINNITUS_SAFETY.fadeInSeconds)).toBe(true);
    expect(engine.noise.start).toHaveBeenCalled();
    // breathing off => the swell gain stays flat at 1 (no signal connection gating it)
    expect(engine.breathGain.gain.value).toBe(1);
  });

  it('caps the master attenuation at −12 dB and the limiter at −6 dB', () => {
    const engine = makeEngine();
    expect(engine.masterAttenuation.gain.value).toBeCloseTo(h.dbToGain(TINNITUS_SAFETY.maxCombinedGainDb), 10);
    expect(engine.pitchGain.gain.value).toBeCloseTo(h.dbToGain(TINNITUS_SAFETY.maxPureToneGainDb), 10);
    expect(engine.limiter.kind).toBe('Limiter');
  });

  it('setMasterDb mirrors the app master knob after the safety cap (no ducking from transport fades)', () => {
    const engine = makeEngine();
    expect(engine.masterFollow.volume.value).toBe(-12); // DEFAULT_SETTINGS.master
    engine.setMasterDb(-30);
    expect(hasRamp(engine.masterFollow.volume.rampToCalls, -30, 0.1)).toBe(true);
    engine.setMasterDb(NaN); // non-finite ignored
    expect(engine.masterFollow.volume.rampToCalls.length).toBe(1);
  });
});

describe('diff — targeted ramps (active)', () => {
  let engine: AnyEngine;

  beforeEach(async () => {
    engine = makeEngine();
    await engine.setActive(true);
    engine.applySettings(base()); // establish prev (no diff)
  });

  it('swaps noise color', () => {
    engine.applySettings({ ...base(), noiseType: 'brown' });
    expect(engine.noise.type).toBe('brown');
  });

  it('switches the mode filter to bandpass on masking', () => {
    engine.applySettings({ ...base(), mode: 'masking', pitchHz: 4000 });
    expect(engine.modeFilter.type).toBe('bandpass');
    expect(hasRamp(engine.modeFilter.frequency.rampToCalls, 4000, 0.1)).toBe(true);
  });

  it('ramps the level in dB', () => {
    engine.applySettings({ ...base(), volumeDb: -20 });
    expect(hasRamp(engine.noiseLevel.gain.rampToCalls, h.dbToGain(-20), 0.5)).toBe(true);
  });

  it('setNoiseMuted ramps the noise level to silence and back (level test / A/B)', () => {
    engine.setNoiseMuted(true);
    expect(hasRamp(engine.noiseLevel.gain.rampToCalls, h.dbToGain(TINNITUS_SAFETY.maxCombinedGainDb - 60), 0.15)).toBe(true);
    engine.setNoiseMuted(false);
    const calls = engine.noiseLevel.gain.rampToCalls;
    expect(calls[calls.length - 1][0]).toBeCloseTo(h.dbToGain(-24), 6); // back to the current level
  });

  it('swaps the notch in/out via gain crossfade with automation anchoring', () => {
    engine.applySettings({ ...base(), notchEnabled: true });
    expect(hasRamp(engine.notchGain.gain.rampToCalls, 1, 0.1)).toBe(true);
    expect(hasRamp(engine.bypassGain.gain.rampToCalls, 0, 0.1)).toBe(true);
    // anchored: cancelScheduledValues + setValueAtTime(current) before re-ramping
    expect(engine.notchGain.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(engine.notchGain.gain.setValueAtTime).toHaveBeenCalled();
  });

  it('updates notch Q from center/bandwidth (clamped to 20)', () => {
    engine.applySettings({ ...base(), notchEnabled: true, pitchHz: 8000, notchBandwidthHz: 100 });
    expect(engine.notchFilter.Q.value).toBe(20); // 8000/100 = 80 → clamped
    engine.applySettings({ ...base(), notchEnabled: true, pitchHz: 1000, notchBandwidthHz: 500 });
    expect(engine.notchFilter.Q.value).toBe(2); // 1000/500
  });

  it('keeps the swell gain flat at 1 when breathing is off (regression: noise was gated by a zeroed param)', () => {
    expect(engine.breathGain.gain.value).toBe(1);
    engine.applySettings({ ...base(), breathingEnabled: true });
    engine.applySettings({ ...base(), breathingEnabled: false });
    const calls = engine.breathGain.gain.rampToCalls;
    expect(calls[calls.length - 1][0]).toBe(1); // ramps back to flat
  });

  it('starts the pitch matcher when enabled and ramps its frequency', () => {
    engine.applySettings({ ...base(), pitchMatcherEnabled: true, pitchHz: 3000 });
    expect(engine.pitchOsc.start).toHaveBeenCalled();
    expect(hasRamp(engine.pitchOsc.frequency.rampToCalls, 3000, 0.05)).toBe(true);
  });

  it('sanitizes pitch (NaN/0/undefined fall back, out-of-range clamps) so masking never silently dies', () => {
    // direct helper
    expect(clampPitchHz(NaN)).toBe(TINNITUS_SAFETY.defaultPitchHz);
    expect(clampPitchHz(0)).toBe(TINNITUS_SAFETY.defaultPitchHz);
    expect(clampPitchHz(-5)).toBe(TINNITUS_SAFETY.defaultPitchHz);
    expect(clampPitchHz(10)).toBe(TINNITUS_SAFETY.minPitchHz);
    expect(clampPitchHz(20000)).toBe(TINNITUS_SAFETY.maxPitchHz);
    expect(clampPitchHz(3000)).toBe(3000);
    // engine path: masking with a bad pitch falls back to a valid frequency
    engine.applySettings({ ...base(), mode: 'masking', pitchHz: NaN });
    expect(hasRamp(engine.modeFilter.frequency.rampToCalls, TINNITUS_SAFETY.defaultPitchHz, 0.1)).toBe(true);
    expect(hasRamp(engine.pitchOsc.frequency.rampToCalls, TINNITUS_SAFETY.defaultPitchHz, 0.05)).toBe(true);
  });
});

describe('breathing swell (P1.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('swells the gain 1 -> 0.7 -> 1 with half-cycle ramps when enabled', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    engine.applySettings({ ...base(), breathingEnabled: true, breathingRateHz: 0.1 }); // half cycle = 5s
    const g = engine.breathGain.gain;
    // immediate first tick: breathe out toward the floor
    expect(hasRamp(g.rampToCalls, 1 - TINNITUS_SAFETY.maxBreathingDepth, 5)).toBe(true);
    vi.advanceTimersByTime(5100);
    expect(hasRamp(g.rampToCalls, 1, 5)).toBe(true); // back up
    vi.advanceTimersByTime(5100);
    expect(hasRamp(g.rampToCalls, 1 - TINNITUS_SAFETY.maxBreathingDepth, 5)).toBe(true); // down again
  });

  it('does not schedule swells while the transport is paused', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    engine.applySettings({ ...base(), breathingEnabled: true, breathingRateHz: 0.1 });
    const before = engine.breathGain.gain.rampToCalls.length;
    engine.setPaused(true);
    vi.advanceTimersByTime(5100);
    expect(engine.breathGain.gain.rampToCalls.length).toBe(before);
  });
});

describe('session timer (P0.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks the countdown and fires onEnd at expiry with a fade-out', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    const onTick = vi.fn();
    const onEnd = vi.fn();
    engine.startSession(20, onTick, onEnd);
    await vi.advanceTimersByTimeAsync(0); // flush startSession's async enable path
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalled();
    const [remaining] = onTick.mock.calls[onTick.mock.calls.length - 1] as [number];
    expect(remaining).toBeGreaterThan(20 * 60_000 - 6_000);
    expect(remaining).toBeLessThan(20 * 60_000 - 4_000);
    vi.advanceTimersByTime(20 * 60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(engine.isSessionActive).toBe(false);
    // fade-out ramp to silent over 5 s
    expect(
      engine.noiseLevel.gain.rampToCalls.some(
        ([v, t]: [number, number]) =>
          Math.abs(v - h.dbToGain(TINNITUS_SAFETY.maxCombinedGainDb - 60)) < 1e-6 && t === TINNITUS_SAFETY.fadeOutSeconds,
      ),
    ).toBe(true);
  });

  it('freezes the countdown while paused', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    const onTick = vi.fn();
    const onEnd = vi.fn();
    engine.startSession(20, onTick, onEnd);
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(5000);
    engine.setPaused(true);
    vi.advanceTimersByTime(10_000);
    engine.setPaused(false);
    vi.advanceTimersByTime(5000);
    const [remaining] = onTick.mock.calls[onTick.mock.calls.length - 1] as [number];
    // 10 s of wall time elapsed, NOT 20 s (10 s of pause excluded)
    expect(remaining).toBeGreaterThan(20 * 60_000 - 11_000);
    expect(remaining).toBeLessThan(20 * 60_000 - 9_000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('session expiry is a TERMINAL transition: fade-out then hard teardown (engine inactive)', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    const onEnd = vi.fn();
    engine.startSession(20, vi.fn(), onEnd);
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(20 * 60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(engine.isSessionActive).toBe(false);
    expect(engine.active).toBe(true); // mid fade-out (5 s)
    expect(engine.noise.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TINNITUS_SAFETY.fadeOutSeconds * 1000 + 200);
    expect(engine.active).toBe(false); // teardown complete — no running-but-silent engine
    expect(engine.noise.stop).toHaveBeenCalled();
  });

  it('panicStop ramps fast and tears down, bypassing the 5 s fade', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    const onEnd = vi.fn();
    engine.startSession(20, vi.fn(), onEnd);
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(5000);
    engine.panicStop();
    expect(onEnd).toHaveBeenCalled();
    expect(engine.isSessionActive).toBe(false);
    const calls = engine.noiseLevel.gain.rampToCalls;
    expect(calls[calls.length - 1][1]).toBe(TINNITUS_SAFETY.panicFadeSeconds); // ~50 ms, not 5 s
    expect(engine.active).toBe(true);
    vi.advanceTimersByTime(200);
    expect(engine.active).toBe(false);
  });

  it('double endSession (timer expiry + manual stop racing) fires onEnd exactly once', async () => {
    const engine = makeEngine();
    await engine.setActive(true);
    const onEnd = vi.fn();
    engine.startSession(20, vi.fn(), onEnd);
    await vi.advanceTimersByTimeAsync(0);
    engine.endSession();
    engine.endSession();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('P0: generation tokens + reference counting', () => {
  it('setActive(true) marks engine active, setActive(false) deactivates', async () => {
    const engine = makeEngine();
    expect(engine.active).toBe(false);
    await engine.setActive(true);
    expect(engine.active).toBe(true);
    await engine.setActive(false);
    expect(engine.active).toBe(false);
  });

  it('setMasterDb anchors before ramping (no race with session fade)', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const engine = makeEngine();
    await engine.setActive(true);
    engine.startSession(10, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    engine.setMasterDb(-6);
    const calls = engine.masterFollow.volume.rampToCalls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]).toBe(-6);
    vi.useRealTimers();
  });
});
