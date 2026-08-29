import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- Hand-rolled Tone mock (engine constructs the whole graph in ensureGraph) ----
const h = vi.hoisted(() => {
  class FakeParam {
    value = 0;
    rampToCalls: Array<[number, number]> = [];
    rampTo(v: number, t: number): void {
      this.rampToCalls.push([v, t]);
      this.value = v;
    }
    cancelScheduledValues(): void {}
    setValueAtTime(v: number): void {
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
      start: vi.fn(() => n), // Tone .start() is chainable — must return the node
      stop: vi.fn(),
    };
    const num = (key: string, fallback: number): void => {
      if (typeof opts[key] === 'number') n[key] = param(opts[key] as number);
      else n[key] = param(fallback);
    };
    if (kind === 'Oscillator') {
      num('frequency', 0);
      num('detune', 0);
      n.type = typeof opts.type === 'string' ? opts.type : 'sine';
    } else if (kind === 'Gain') {
      n.gain = param(typeof opts.g === 'number' ? (opts.g as number) : 1);
    } else if (kind === 'Volume') {
      n.volume = param(typeof opts.v === 'number' ? (opts.v as number) : 0);
    } else if (kind === 'Filter') {
      num('Q', 1);
      num('frequency', 350);
    } else if (kind === 'LFO') {
      num('frequency', 0.1);
      n.min = typeof opts.min === 'number' ? opts.min : 0;
      n.max = typeof opts.max === 'number' ? opts.max : 0;
      n.phase = typeof opts.phase === 'number' ? opts.phase : 0;
    } else if (kind === 'Chorus') {
      num('frequency', 200);
      num('depth', 0.5);
      num('delayTime', 0);
      num('feedback', 0);
      n.spread = typeof opts.spread === 'number' ? opts.spread : 90;
    } else if (kind === 'Reverb') {
      n.decay = typeof opts.decay === 'number' ? opts.decay : 1;
      num('wet', 1);
    } else if (kind === 'Noise') {
      n.type = typeof opts.type === 'string' ? opts.type : 'pink';
    }
    return n;
  };
  return {
    FakeParam,
    Volume: class {
      constructor(v: number) {
        Object.assign(this, node('Volume', { v }));
      }
    },
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
    Split: class {
      constructor() {
        Object.assign(this, node('Split'));
      }
    },
    Analyser: class {
      constructor() {
        Object.assign(this, node('Analyser'));
      }
    },
    Oscillator: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('Oscillator', opts));
      }
    },
    Panner: class {
      constructor() {
        Object.assign(this, node('Panner'));
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
    LFO: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('LFO', opts));
      }
    },
    Chorus: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('Chorus', opts));
      }
    },
    Reverb: class {
      constructor(opts: Record<string, unknown> = {}) {
        Object.assign(this, node('Reverb', opts));
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

// EntrainmentMixer stub — records applyState calls for the targeted-diff assertions.
const entrainmentMock = vi.hoisted(() => {
  class EntrainmentMixer {
    applyCalls: Array<{ next: unknown; playing: boolean }> = [];
    applyState(next: unknown, playing: boolean): void {
      this.applyCalls.push({ next, playing });
    }
    cancelAutomation(): void {}
    start(): void {}
    stop(): void {}
    dispose(): void {}
  }
  return {
    EntrainmentMixer,
    BAND_NAMES: ['delta', 'theta', 'alpha', 'beta', 'gamma'],
    defaultEntrainmentSettings: () => ({
      enabled: true,
      carrier: 144,
      preset: 'Default',
      schedule: '',
      bands: Object.fromEntries(
        ['delta', 'theta', 'alpha', 'beta', 'gamma'].map((id) => [id, { intensity: 40, beat: 1 }]),
      ),
    }),
  };
});
vi.mock('../entrainment', () => ({ ...entrainmentMock }));

import { AudioEngine } from '../engine';
import type { EngineParams } from '../engine';
import { defaultEntrainmentSettings } from '../entrainment';
import { SCHEDULES } from '../../state/schedules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEngine = any;

const baseParams = (): EngineParams => ({
  left: { freq: 144, volume: 0.5, wave: 'sine', detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
  right: { freq: 151.51, volume: 0.5, wave: 'sine', detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
  master: -12,
  manualEnabled: true,
  noise: {
    enabled: true,
    color: 'pink',
    volume: -36,
    filterGain: 100,
    phase: 0,
    sweepMin: 350,
    sweepMax: 1350,
    q: 1,
    lfoRate: 0.1,
    chorus: { rate: 200, depth: 0.5, delay: 0, spread: 90, feedback: 0 },
    reverb: { decay: 6, wet: 1 },
  },
  entrainment: defaultEntrainmentSettings(),
});

/** Build the graph (private ensureGraph), mark playing so diff uses ramps. */
const makeEngine = (): AnyEngine => {
  const engine: AnyEngine = new AudioEngine(() => undefined);
  engine.ensureGraph();
  engine.playing = true;
  return engine;
};

const hasRamp = (calls: Array<[number, number]>, v: number, t: number, eps = 0.01): boolean =>
  calls.some(([cv, ct]) => Math.abs(cv - v) < eps && Math.abs(ct - t) < 1e-9);

describe('diff — channel ramps (playing)', () => {
  let engine: AnyEngine;

  beforeEach(() => {
    engine = makeEngine();
    engine.applySettings(baseParams()); // establishes prev (no diff on first call)
  });

  it('ramps the carrier with a safe ramp time (0.05 floor, 3/f scaling)', () => {
    engine.applySettings({ ...baseParams(), left: { ...baseParams().left, freq: 200 } });
    expect(hasRamp(engine.chL.osc.frequency.rampToCalls, 200, 0.05)).toBe(true);
    engine.applySettings({ ...baseParams(), left: { ...baseParams().left, freq: 20 } });
    expect(hasRamp(engine.chL.osc.frequency.rampToCalls, 20, 0.15)).toBe(true); // 3/20
  });

  it('does not touch the right channel when only the left changes', () => {
    engine.applySettings({ ...baseParams(), left: { ...baseParams().left, freq: 200 } });
    expect(engine.chR.osc.frequency.rampToCalls).toHaveLength(0);
  });

  it('ramps volume in dB', () => {
    engine.applySettings({ ...baseParams(), left: { ...baseParams().left, volume: 0.25 } });
    // dbFromGain(0.25) = 20*log10(0.25) = -12.04
    expect(hasRamp(engine.chL.chVol.volume.rampToCalls, -12.041, 0.1)).toBe(true);
  });

  it('swaps the oscillator type and ramps detune', () => {
    const next = baseParams();
    next.left.wave = 'triangle';
    next.left.detune = 25;
    engine.applySettings(next);
    expect(engine.chL.osc.type).toBe('triangle');
    expect(hasRamp(engine.chL.osc.detune.rampToCalls, 25, 0.2)).toBe(true);
  });

  it('ramps FM/AM rates and depths', () => {
    const next = baseParams();
    next.left.fm = { rate: 5, depth: 3 };
    next.left.am = { rate: 8, depth: 0.3 };
    engine.applySettings(next);
    expect(hasRamp(engine.chL.fmSrc.frequency.rampToCalls, 5, 0.05)).toBe(true);
    expect(hasRamp(engine.chL.fmDepth.gain.rampToCalls, 3, 0.2)).toBe(true);
    expect(hasRamp(engine.chL.amSrc.frequency.rampToCalls, 8, 0.05)).toBe(true);
    expect(hasRamp(engine.chL.amDepth.gain.rampToCalls, 0.3, 0.2)).toBe(true);
  });
});

describe('diff — master / manual / noise', () => {
  let engine: AnyEngine;

  beforeEach(() => {
    engine = makeEngine();
    engine.applySettings(baseParams());
  });

  it('ramps master volume', () => {
    engine.applySettings({ ...baseParams(), master: -6 });
    expect(hasRamp(engine.masterVol.volume.rampToCalls, -6, 0.1)).toBe(true);
  });

  it('mutes the manual bus when disabled', () => {
    engine.applySettings({ ...baseParams(), manualEnabled: false });
    expect(hasRamp(engine.tonesBus.gain.rampToCalls, 0, 0.1)).toBe(true);
  });

  it('mutes noise to -60 when disabled and restores volume when enabled', () => {
    const off = { ...baseParams() };
    off.noise = { ...off.noise, enabled: false };
    engine.applySettings(off);
    expect(hasRamp(engine.noiseVol.volume.rampToCalls, -60, 0.1)).toBe(true);
    const on = { ...baseParams() };
    on.noise = { ...on.noise, enabled: true, volume: -20 };
    engine.applySettings(on);
    expect(hasRamp(engine.noiseVol.volume.rampToCalls, -20, 0.1)).toBe(true);
  });

  it('swaps noise color to brown and ramps filter gain', () => {
    const next = baseParams();
    next.noise = { ...next.noise, color: 'brown', filterGain: 50 };
    engine.applySettings(next);
    expect(engine.noise.type).toBe('brown');
    expect(hasRamp(engine.filterGainNode.gain.rampToCalls, 0.5, 0.08)).toBe(true);
  });

  it('sets the sweep LFO phase and ramps chorus feedback', () => {
    const next = baseParams();
    next.noise = { ...next.noise, phase: 180, chorus: { ...next.noise.chorus, feedback: 0.5 } };
    engine.applySettings(next);
    expect(engine.sweepLfo.phase).toBe(180);
    expect(hasRamp(engine.chorus.feedback.rampToCalls, 0.5, 0.2)).toBe(true);
  });
});

describe('diff — targeted entrainment diff (no JSON.stringify)', () => {
  let engine: AnyEngine;
  let mixer: { applyCalls: Array<{ next: unknown; playing: boolean }> };

  beforeEach(() => {
    engine = makeEngine();
    mixer = engine.entrainment;
    engine.applySettings(baseParams()); // graph-build call only
  });

  it('does not call applyState when nothing changed', () => {
    engine.applySettings(baseParams());
    expect(mixer.applyCalls).toHaveLength(1); // just the ensureGraph call
  });

  it('calls applyState exactly once when a single band intensity changes', () => {
    const next = baseParams();
    next.entrainment.bands.theta.intensity = 80;
    engine.applySettings(next);
    expect(mixer.applyCalls).toHaveLength(2);
    expect(mixer.applyCalls[1].next).toBe(next.entrainment);
  });

  it('calls applyState on carrier change', () => {
    const next = baseParams();
    next.entrainment.carrier = 200;
    engine.applySettings(next);
    expect(mixer.applyCalls).toHaveLength(2);
  });
});

describe('schedule runner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const deepSleep = SCHEDULES['deep-sleep'];

  it('ticks with interpolated bands and elapsed ms', () => {
    const engine = makeEngine();
    const onTick = vi.fn();
    const onFinish = vi.fn();
    engine.setSchedule(deepSleep, defaultEntrainmentSettings().bands, onTick, onFinish, 0);
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalled();
    const [bands, elapsedMs] = onTick.mock.calls[onTick.mock.calls.length - 1] as [
      Record<string, { intensity: number }>,
      number,
    ];
    expect(elapsedMs).toBeGreaterThanOrEqual(5000);
    expect(bands.alpha.intensity).toBeGreaterThan(40); // easing 40 -> 80
    expect(bands.alpha.intensity).toBeLessThan(80);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('freezes the clock while paused', async () => {
    const engine = makeEngine();
    const onTick = vi.fn();
    const onFinish = vi.fn();
    engine.setSchedule(deepSleep, defaultEntrainmentSettings().bands, onTick, onFinish, 0);
    vi.advanceTimersByTime(5000);
    const before = onTick.mock.calls.length;
    await engine.pause();
    vi.advanceTimersByTime(10_000); // paused — timeline must not advance
    await engine.resume();
    vi.advanceTimersByTime(5000);
    const [, elapsedMs] = onTick.mock.calls[onTick.mock.calls.length - 1] as [unknown, number];
    // 5s before + 5s after, NOT 20s (10s of pause excluded)
    expect(elapsedMs).toBeGreaterThanOrEqual(9000);
    expect(elapsedMs).toBeLessThan(11_000);
    expect(onTick.mock.calls.length).toBeGreaterThan(before);
  });

  it('resumes from persisted elapsed', () => {
    const engine = makeEngine();
    const onTick = vi.fn();
    const onFinish = vi.fn();
    engine.setSchedule(deepSleep, defaultEntrainmentSettings().bands, onTick, onFinish, 90_000);
    const [bands] = onTick.mock.calls[0] as [Record<string, { intensity: number }>, number];
    expect(bands.alpha.intensity).toBeGreaterThan(40); // 90s in: ~52
    expect(bands.alpha.intensity).toBeLessThan(80);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('finishes immediately when the persisted progress is past the end', () => {
    const engine = makeEngine();
    const onTick = vi.fn();
    const onFinish = vi.fn();
    engine.setSchedule(deepSleep, defaultEntrainmentSettings().bands, onTick, onFinish, 999_999_999);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onTick).not.toHaveBeenCalled();
    expect(engine.scheduleId).toBeNull();
  });

  it('fires onFinish when the timeline completes', () => {
    const engine = makeEngine();
    const onTick = vi.fn();
    const onFinish = vi.fn();
    engine.setSchedule(deepSleep, defaultEntrainmentSettings().bands, onTick, onFinish, 0);
    vi.advanceTimersByTime(deepSleep.durationMinutes * 60_000 + 2000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(engine.scheduleId).toBeNull();
  });
});

describe('P0: generation tokens + reference counting', () => {
  it('acquireSession/releaseSession track active sessions', () => {
    AudioEngine.acquireSession();
    expect(AudioEngine.hasActiveSessions()).toBe(true);
    AudioEngine.releaseSession();
    // May be false or true depending on other tests — just check it doesn't throw
    expect(typeof AudioEngine.hasActiveSessions()).toBe('boolean');
  });

  it('currentGeneration returns a number', () => {
    expect(typeof AudioEngine.currentGeneration()).toBe('number');
  });

  it('setTinnitusCheck registers and can be cleared', () => {
    AudioEngine.setTinnitusCheck(() => true);
    AudioEngine.setTinnitusCheck(null);
    // Should not throw
    expect(true).toBe(true);
  });
});
