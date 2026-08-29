import * as Tone from 'tone';
import { DEFAULT_TINNITUS, type TinnitusParams } from '../../state/tinnitus';
import { AudioEngine } from '../engine';

/**
 * Tinnitus support engine — a fully self-contained audio subsystem.
 * Deliberately does NOT touch the binaural AudioEngine: it owns its own safety
 * chain (limiter −6 dB → hard-capped gain −12 dB) straight to the destination,
 * so the binaural beat / noise-gen graph is completely untouched.
 *
 * Per the webQ-gauntlet tinnitus plan:
 *  - P0.2 safety bus (hard gain caps, no bypass)
 *  - P0.3 session timer with fade in/out
 *  - P1.1 enrichment noise (pink/white/brown, below mixing point)
 *  - P1.2 pitch matcher (pure tone, non-diagnostic)
 *  - P1.3 narrow-band masking (bandpass on the pitch)
 *  - P1.4 notched noise (EXPERIMENTAL — narrow notch around the pitch)
 *  - P1.5 gentle "breathing" amplitude modulation
 */

export const TINNITUS_SAFETY = {
  maxCombinedGainDb: -12, // static digital headroom for all tinnitus sources combined
  maxPureToneGainDb: -20, // even more conservative for the pure-tone matcher
  limiterThresholdDb: -6, // the ONLY real peak/clip protection — keep it
  fadeInSeconds: 2,
  fadeOutSeconds: 5,
  quickFadeSeconds: 0.5,
  panicFadeSeconds: 0.05,
  maxSessionMinutes: 60,
  minPitchHz: 50,
  maxPitchHz: 12000,
  defaultPitchHz: 500,
  maxNotchQ: 20,
  minBreathingRateHz: 0.04,
  maxBreathingRateHz: 0.2,
  maxBreathingDepth: 0.3,
  maxPitchMatcherSeconds: 120, // P1: sustained pure-tone exposure cap
} as const;

/**
 * Sanitize user pitch before it feeds any filter/oscillator. NaN/0/undefined in
 * masking mode would silently zero the entire noise path (critique3 P0-2.2).
 */
export const clampPitchHz = (v: number): number =>
  Number.isFinite(v) && v > 0
    ? Math.min(Math.max(v, TINNITUS_SAFETY.minPitchHz), TINNITUS_SAFETY.maxPitchHz)
    : TINNITUS_SAFETY.defaultPitchHz;

// Breathing swell range on the noise gain: 1.0 = flat, 0.7..1.0 = swells.
// NOTE: deliberately NOT a Tone.LFO — a connected LFO zeroes the param base
// (connectSignal) and a started LFO with min==max outputs 0, which gated the
// whole noise path to silence. A JS-driven rampTo triangle is sample-accurate
// and can't collapse.
const BREATH_MIN = 1 - TINNITUS_SAFETY.maxBreathingDepth; // 0.7
const BREATH_MAX = 1;

const notchQ = (centerHz: number, bandwidthHz: number): number => {
  if (bandwidthHz <= 0 || centerHz <= 0) return 1;
  return Math.min(TINNITUS_SAFETY.maxNotchQ, Math.max(0.1, centerHz / bandwidthHz));
};

const db = (v: number): number => Tone.dbToGain(v);

// P0: Tinnitus session reference counting — mirrors AudioEngine's pattern.
let tActiveSessions = 0;
let tGeneration = 0;

/** Anything with a rampable numeric param. */
interface Rampable {
  rampTo(value: number, rampTime: number): unknown;
  value: number;
}

export class TinnitusEngine {
  private built = false;
  private active = false;
  private paused = false;
  private params: TinnitusParams | null = null;
  private myGeneration = 0; // P0: stale-callback guard

  // Session timer (P0.3) — engine-owned so a throttled tab can't drift it.
  private sessionActive = false;
  private sessionFired = false; // idempotency guard (critique3 P0-2.3)
  private sessionEndAt = 0;
  private sessionPausedAt: number | null = null;
  private sessionPausedMs = 0;
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private onSessionTick: ((remainingMs: number) => void) | null = null;
  private onSessionEnd: (() => void) | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  // Breathing swell (P1.5) — JS-driven rampTo triangle (see BREATH_MIN note).
  private swellTimer: ReturnType<typeof setInterval> | null = null;
  private swellDown = false;

  private noise!: Tone.Noise;
  private notchFilter!: Tone.Filter;
  private notchGain!: Tone.Gain;
  private bypassGain!: Tone.Gain;
  private modeFilter!: Tone.Filter;
  private noiseLevel!: Tone.Gain;
  private breathGain!: Tone.Gain;
  private pitchOsc!: Tone.Oscillator;
  private pitchGain!: Tone.Gain;
  private inputGain!: Tone.Gain;
  private limiter!: Tone.Limiter;
  private masterAttenuation!: Tone.Gain; // static −12 dB digital headroom (NOT a dynamic limiter)
  // Mirrors the app-wide master knob at the very end of the chain, AFTER the
  // safety cap, so the knob scales tinnitus output too - but the limiter/-12 dB
  // cap still bound what the knob can push through. Kept separate from the
  // binaural engine's masterVol node on purpose: transport fades (start ramp
  // from -60 dB, stop fade) must not duck tinnitus.
  private masterFollow!: Tone.Volume;
  private masterDb = -12; // tracks App settings.master (DEFAULT_SETTINGS.master)

  get isActive(): boolean {
    return this.active;
  }

  get isSessionActive(): boolean {
    return this.sessionActive;
  }

  applySettings(p: TinnitusParams): void {
    const prev = this.params;
    this.params = JSON.parse(JSON.stringify(p)) as TinnitusParams;
    if (!this.built || !prev) return;
    this.diff(prev, p);
  }

  /**
   * Diagnostic mute for the noise path only (used by the wizard's level test
   * and the binaural-vs-tinnitus A/B compare). Ramps back to the current level.
   */
  setNoiseMuted(muted: boolean): void {
    if (!this.built) return;
    const target = muted
      ? db(TINNITUS_SAFETY.maxCombinedGainDb - 60)
      : db(this.params?.volumeDb ?? DEFAULT_TINNITUS.volumeDb);
    this.noiseLevel.gain.cancelScheduledValues(Tone.now());
    this.noiseLevel.gain.rampTo(target, 0.15);
  }

  /**
   * Mirror the app-wide master volume knob (dB). Applied even before the graph
   * is built so the first enable already plays at the knob level.
   */
  setMasterDb(db: number): void {
    if (!Number.isFinite(db)) return;
    this.masterDb = db;
    if (!this.built) return;
    // P0: anchor before ramp — prevents master-volume race with session fade
    const now = Tone.now();
    this.masterFollow.volume.cancelScheduledValues(now);
    this.masterFollow.volume.setValueAtTime(this.masterFollow.volume.value, now);
    this.masterFollow.volume.rampTo(db, 0.1);
  }

  /** Freeze the session countdown while the binaural transport is paused. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) this.sessionPausedAt = Date.now();
    else if (this.sessionPausedAt !== null) {
      this.sessionPausedMs += Date.now() - this.sessionPausedAt;
      this.sessionPausedAt = null;
    }
  }

  private ramp(p: Rampable, v: number, t: number): void {
    if (this.active) p.rampTo(v, t);
    else p.value = v;
  }

  /** Targeted diff — ramp only what changed (mirrors the binaural engine's pattern). */
  private diff(prev: TinnitusParams, next: TinnitusParams): void {
    if (prev.noiseType !== next.noiseType) this.noise.type = next.noiseType;
    if (prev.mode !== next.mode) {
      this.modeFilter.type = next.mode === 'masking' ? 'bandpass' : 'lowpass';
      this.modeFilter.frequency.rampTo(next.mode === 'masking' ? next.pitchHz : 5000, 0.1);
      this.modeFilter.Q.value = next.mode === 'masking' ? 1.5 : 0.7;
    }
    if (prev.volumeDb !== next.volumeDb) this.ramp(this.noiseLevel.gain, db(next.volumeDb), 0.5);
    if (prev.pitchHz !== next.pitchHz) {
      const hz = clampPitchHz(next.pitchHz);
      this.pitchOsc.frequency.rampTo(hz, 0.05);
      this.notchFilter.frequency.rampTo(hz, 0.05);
      this.notchFilter.Q.value = notchQ(hz, next.notchBandwidthHz);
      if (next.mode === 'masking') this.modeFilter.frequency.rampTo(hz, 0.1);
    }
    if (prev.notchBandwidthHz !== next.notchBandwidthHz) {
      this.notchFilter.Q.value = notchQ(clampPitchHz(next.pitchHz), next.notchBandwidthHz);
    }
    if (prev.notchEnabled !== next.notchEnabled) {
      // anchor automation before re-ramping — prevents overlapping ramps from
      // dipping the crossfade to a silent/stuck value (critique3 P0-2.1)
      const now = Tone.now();
      for (const [node, target] of [
        [this.notchGain, next.notchEnabled ? 1 : 0],
        [this.bypassGain, next.notchEnabled ? 0 : 1],
      ] as Array<[Tone.Gain, number]>) {
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.rampTo(target, 0.1);
      }
    }
    if (prev.breathingEnabled !== next.breathingEnabled || prev.breathingRateHz !== next.breathingRateHz) {
      if (next.breathingEnabled && this.active) {
        this.startSwell(next.breathingRateHz);
      } else if (!next.breathingEnabled) {
        this.stopSwell();
        this.breathGain.gain.rampTo(BREATH_MAX, 0.3);
      }
    }
    if (prev.pitchMatcherEnabled !== next.pitchMatcherEnabled) {
      if (next.pitchMatcherEnabled && this.active) this.pitchOsc.start();
      else if (!next.pitchMatcherEnabled) this.pitchOsc.stop();
    }
  }

  private ensureGraph(): void {
    if (this.built) return;
    const p = this.params ?? DEFAULT_TINNITUS;
    this.built = true;

    // Safety chain: input -> limiter(-6) -> masterAttenuation(-12) -> masterFollow -> destination.
    // No bypass - every tinnitus source must pass through it. The limiter is the
    // real peak/clip protection; the −12 dB gain is STATIC digital headroom.
    this.inputGain = new Tone.Gain(1);
    this.limiter = new Tone.Limiter(TINNITUS_SAFETY.limiterThresholdDb);
    this.masterAttenuation = new Tone.Gain(db(TINNITUS_SAFETY.maxCombinedGainDb));
    this.masterFollow = new Tone.Volume(this.masterDb);
    this.inputGain.chain(this.limiter, this.masterAttenuation, this.masterFollow, Tone.getDestination());

    // Noise: notch (P1.4, gain-switched) | bypass → mode filter (P1.1/P1.3) → level → breathing (P1.5)
    this.noise = new Tone.Noise({ type: p.noiseType });
    this.notchFilter = new Tone.Filter({
      type: 'notch',
      frequency: p.pitchHz,
      Q: notchQ(p.pitchHz, p.notchBandwidthHz),
    });
    this.notchGain = new Tone.Gain(p.notchEnabled ? 1 : 0);
    this.bypassGain = new Tone.Gain(p.notchEnabled ? 0 : 1);
    this.modeFilter = new Tone.Filter({
      type: p.mode === 'masking' ? 'bandpass' : 'lowpass',
      frequency: p.mode === 'masking' ? p.pitchHz : 5000,
      Q: p.mode === 'masking' ? 1.5 : 0.7,
      rolloff: p.mode === 'masking' ? -12 : -12,
    });
    this.noiseLevel = new Tone.Gain(db(TINNITUS_SAFETY.maxCombinedGainDb - 60)); // start silent
    this.breathGain = new Tone.Gain(1); // breathing swell gain — stays 1 unless the swell timer runs
    this.noise.connect(this.notchFilter);
    this.notchFilter.connect(this.notchGain);
    this.notchGain.connect(this.modeFilter);
    this.noise.connect(this.bypassGain);
    this.bypassGain.connect(this.modeFilter);
    this.modeFilter.chain(this.noiseLevel, this.breathGain, this.inputGain);

    // Pitch matcher (P1.2): pure sine, capped harder than the noise bus.
    this.pitchOsc = new Tone.Oscillator({ frequency: clampPitchHz(p.pitchHz), type: 'sine' });
    this.pitchGain = new Tone.Gain(db(TINNITUS_SAFETY.maxPureToneGainDb));
    this.pitchOsc.chain(this.pitchGain, this.inputGain);
  }

  /** Enable/disable the whole tinnitus engine with click-free fades. */
  async setActive(active: boolean): Promise<void> {
    if (active === this.active) return;
    if (active) {
      this.ensureGraph();
      await Tone.start(); // user gesture (toggle click)
      // P0: reference-counted context resume — tinnitus can play even if
      // binaural is paused, but won't fight over the context state.
      if (Tone.getContext().state === 'suspended') {
        await ((Tone.getContext() as Tone.Context).rawContext as AudioContext).resume();
      }
      // P0: generation token — stale session-tick callbacks check this
      this.myGeneration = ++tGeneration;
      tActiveSessions++;
      this.active = true;
      const p = this.params ?? DEFAULT_TINNITUS;
      const target = db(p.volumeDb);
      this.noiseLevel.gain.cancelScheduledValues(Tone.now());
      this.noiseLevel.gain.value = db(TINNITUS_SAFETY.maxCombinedGainDb - 60);
      this.noise.start();
      this.breathGain.gain.value = BREATH_MAX;
      if (p.breathingEnabled) this.startSwell(p.breathingRateHz);
      if (p.pitchMatcherEnabled) this.pitchOsc.start();
      this.noiseLevel.gain.rampTo(target, TINNITUS_SAFETY.fadeInSeconds);
    } else {
      this.active = false;
      this.endSession(true);
      this.noiseLevel.gain.cancelScheduledValues(Tone.now());
      this.noiseLevel.gain.rampTo(db(TINNITUS_SAFETY.maxCombinedGainDb - 60), TINNITUS_SAFETY.quickFadeSeconds);
      this.pitchGain.gain.cancelScheduledValues(Tone.now());
      this.pitchGain.gain.rampTo(db(-60), TINNITUS_SAFETY.quickFadeSeconds);
      this.stopSwell();
      tActiveSessions = Math.max(0, tActiveSessions - 1);
      if (this.stopTimer) clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => this.hardTeardown(), TINNITUS_SAFETY.quickFadeSeconds * 1000 + 100);
    }
  }

  /**
   * Session timer (P0.3): fade in over 2 s, run the countdown, then fade out
   * over 5 s. Frozen while the binaural transport is paused (setPaused).
   */
  startSession(minutes: number, onTick: (remainingMs: number) => void, onEnd: () => void): void {
    this.ensureGraph();
    const run = async (): Promise<void> => {
      if (!this.active) await this.setActive(true);
      if (!this.active) return;
      this.cancelSessionTimer();
      this.sessionActive = true;
      this.sessionFired = false;
      this.onSessionTick = onTick;
      this.onSessionEnd = onEnd;
      this.sessionEndAt = Date.now() + minutes * 60_000;
      this.sessionPausedMs = 0;
      this.sessionPausedAt = this.paused ? Date.now() : null;
      this.sessionTimer = setInterval(() => this.sessionTick(), 1000);
      this.sessionTick();
    };
    void run();
  }

  /**
   * End the current session: fade out, then a TERMINAL teardown (critique3 P0-2.3).
   * The engine stops and reports via onSessionEnd — the panel flips the switch off.
   */
  endSession(silent = false): void {
    this.cancelSessionTimer();
    if (this.sessionFired) return; // idempotency guard: timer + poll + stop can race
    this.sessionActive = false;
    this.sessionFired = true;
    if (!silent && this.built && this.active) {
      const now = Tone.now();
      this.noiseLevel.gain.cancelScheduledValues(now);
      this.noiseLevel.gain.setValueAtTime(this.noiseLevel.gain.value, now);
      this.noiseLevel.gain.rampTo(db(TINNITUS_SAFETY.maxCombinedGainDb - 60), TINNITUS_SAFETY.fadeOutSeconds);
      if (this.stopTimer) clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => this.hardTeardown(), TINNITUS_SAFETY.fadeOutSeconds * 1000 + 100);
    } else if (!silent && this.built) {
      this.hardTeardown();
    }
    const onEnd = this.onSessionEnd;
    this.onSessionTick = null;
    this.onSessionEnd = null;
    onEnd?.();
  }

  /**
   * Panic stop (critique3 P0): one obvious tap to silence — ~50 ms ramp, no
   * 5 s fade, always reachable regardless of engine state.
   */
  panicStop(): void {
    this.cancelSessionTimer();
    this.stopSwell();
    this.sessionActive = false;
    this.sessionFired = true;
    const onEnd = this.onSessionEnd;
    this.onSessionTick = null;
    this.onSessionEnd = null;
    onEnd?.();
    if (!this.built) return;
    const now = Tone.now();
    for (const gain of [this.noiseLevel.gain, this.pitchGain.gain]) {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.rampTo(db(-72), TINNITUS_SAFETY.panicFadeSeconds);
    }
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => this.hardTeardown(), 100);
  }

  /** Ramp always precedes teardown (no click); sources stop, engine inactive. */
  private hardTeardown(): void {
    try {
      this.noise.stop();
    } catch {
      /* ignore */
    }
    try {
      this.pitchOsc.stop();
    } catch {
      /* ignore */
    }
    this.active = false;
  }

  /**
   * Breathing swell (P1.5): triangle between 0.7 and 1.0 via audio-clock ramps.
   * Skips scheduling while paused (the context is suspended anyway, so the
   * clock is frozen).
   */
  private startSwell(rateHz: number): void {
    this.stopSwell();
    const clamped = Math.max(TINNITUS_SAFETY.minBreathingRateHz, Math.min(TINNITUS_SAFETY.maxBreathingRateHz, rateHz));
    const halfCycleMs = 500 / clamped; // full cycle = 1000/rate
    const tick = (): void => {
      if (!this.active || this.paused) return;
      const target = this.swellDown ? BREATH_MIN : BREATH_MAX;
      this.swellDown = !this.swellDown;
      this.breathGain.gain.rampTo(target, halfCycleMs / 1000);
    };
    this.swellDown = true; // breathe out first
    tick();
    this.swellTimer = setInterval(tick, halfCycleMs);
  }

  private stopSwell(): void {
    if (this.swellTimer) {
      clearInterval(this.swellTimer);
      this.swellTimer = null;
    }
  }

  private cancelSessionTimer(): void {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  /** P0: Whether tinnitus has any active sessions (used by binaural pause). */
  static hasActiveSessions(): boolean {
    return tActiveSessions > 0;
  }

  private sessionTick(): void {
    // P0: stale-callback guard — skip if this session's generation is outdated
    if (this.myGeneration !== tGeneration) {
      this.cancelSessionTimer();
      return;
    }
    if (!this.sessionActive) {
      this.cancelSessionTimer();
      return;
    }
    // remaining = total − elapsed, where elapsed = (now − start) − pausedMs.
    // Frozen at the pause instant while paused (pausedMs is only accumulated on resume).
    const now = Date.now();
    const clockAt = this.paused && this.sessionPausedAt !== null ? this.sessionPausedAt : now;
    const remainingMs = this.sessionEndAt - clockAt + this.sessionPausedMs;
    if (remainingMs <= 0) {
      this.endSession();
      return;
    }
    this.onSessionTick?.(remainingMs);
  }

  dispose(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.cancelSessionTimer();
    this.stopSwell();
    if (!this.built) return;
    try {
      this.noise.stop();
      this.pitchOsc.stop();
    } catch {
      /* ignore */
    }
    const nodes: Array<{ dispose(): void }> = [
      this.noise, this.notchFilter, this.notchGain, this.bypassGain, this.modeFilter,
      this.noiseLevel, this.breathGain, this.pitchOsc, this.pitchGain,
      this.inputGain, this.limiter, this.masterAttenuation, this.masterFollow,
    ];
    nodes.forEach((n) => {
      try {
        n.dispose();
      } catch {
        /* ignore */
      }
    });
    this.active = false;
    this.built = false;
  }
}

/** Module-level singleton — StrictMode-safe (graph built lazily on first enable). */
let tSingleton: TinnitusEngine | null = null;

export function getTinnitusEngine(): TinnitusEngine {
  if (!tSingleton) {
    tSingleton = new TinnitusEngine();
    // P0: register the tinnitus active check so the binaural engine's
    // pause() knows whether to suspend the AudioContext.
    AudioEngine.setTinnitusCheck(() => TinnitusEngine.hasActiveSessions());
  }
  return tSingleton;
}
