import * as Tone from 'tone';
import {
  EntrainmentMixer,
  defaultEntrainmentSettings,
  BAND_NAMES,
  type BandMap,
  type EntrainmentSettings,
} from './entrainment';
import { scheduleTargetsAt, type ScheduleDefinition } from '../state/schedules';

export type NoiseColor = 'pink' | 'white' | 'brown';
export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type WaveformChannel = 'L' | 'R' | 'C';

export interface ChannelParams {
  freq: number;
  volume: number; // linear gain 0..1
  wave: WaveType; // oscillator shape (reference feature, critique S3)
  detune: number; // cents, -100..+100
  fm: { rate: number; depth: number }; // depth in Hz
  am: { rate: number; depth: number }; // depth 0..1
}

export interface NoiseParams {
  enabled: boolean;
  color: NoiseColor;
  volume: number; // dB
  filterGain: number; // 0..100 -> linear gain (reference control)
  phase: number; // sweep LFO start phase, degrees 0-360 (reference control)
  sweepMin: number; // Hz
  sweepMax: number; // Hz
  q: number;
  lfoRate: number; // Hz
  chorus: { rate: number; depth: number; delay: number; spread: number; feedback: number };
  reverb: { decay: number; wet: number };
}

export interface EngineParams {
  left: ChannelParams;
  right: ChannelParams;
  master: number; // dB
  manualEnabled: boolean; // manual tones bus on/off (S2 independent toggles)
  noise: NoiseParams;
  entrainment: EntrainmentSettings;
}

/** Differentiated ramp durations (seconds) — per design D5 / webQ synthesis. */
const RAMP = {
  frequency: 0.05,
  volume: 0.1,
  filter: 0.08,
  effects: 0.2,
  startup: 2,
  stop: 0.5,
  sleepFade: 10,
} as const;

const dbFromGain = (g: number): number =>
  g <= 0.0001 ? -60 : Math.max(-60, 20 * Math.log10(g));

interface ChannelNodes {
  osc: Tone.Oscillator;
  amGain: Tone.Gain; // receives AM signal into its gain (base 1)
  chVol: Tone.Volume; // per-channel volume (dB)
  panner: Tone.Panner;
  fmSrc: Tone.Oscillator;
  fmDepth: Tone.Gain; // scales FM osc into osc.frequency (depth in Hz)
  amSrc: Tone.Oscillator;
  amDepth: Tone.Gain; // scales AM osc into amGain.gain
}

/** Ramp time scaled for low frequencies (critique S1): fixed 0.05 s at high f, ~150 ms at 20 Hz. */
const freqRamp = (hz: number): number => Math.max(RAMP.frequency, 3 / Math.max(1, hz));

/** Anything with a rampable numeric value (Tone Param or Signal). */
interface Rampable {
  rampTo(value: number, rampTime: number): unknown;
  value: number | string; // Tone Frequency params allow string units
}

/** A Rampable that also supports scheduled-value cancellation (Tone Param/Signal). */
interface ScheduledParam extends Rampable {
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
}

/** Ramp a Chorus property (frequency/depth/delayTime) whether it is a Signal or plain number. */
function setChorusProp(chorus: Tone.Chorus, prop: 'frequency' | 'depth' | 'delayTime', v: number, ramp: number): void {
  const cur = (chorus as unknown as Record<string, unknown>)[prop] as Rampable | number | undefined;
  if (cur && typeof cur === 'object' && typeof cur.rampTo === 'function') cur.rampTo(v, ramp);
  else if (typeof cur === 'number') (chorus as unknown as Record<string, number>)[prop] = v;
}

// ── Shared session management (P0: AudioSessionManager) ──────────────
// Module-level reference counting prevents one engine's pause/stop from
// suspending the AudioContext while another engine is still playing.
let activeSessions = 0;
let generation = 0; // bumped on every play/stop — stale callbacks check this
let checkTinnitusActive: (() => boolean) | null = null; // injected by TinnitusEngine

export class AudioEngine {
  private built = false;
  private playing = false;
  private paused = false;
  private onStateChange: (playing: boolean, paused: boolean) => void = () => {};
  private startCancelled = false; // stop() during an in-flight play() start
  private params: EngineParams | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private myGeneration = 0; // snapshot at play-start — stale callbacks check this

  // Engine-owned schedule scheduler (critique S1 item 5 — no App setInterval drift)
  private scheduleId: string | null = null;
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private scheduleDef: ScheduleDefinition | null = null;
  private scheduleStartBands: BandMap | null = null;
  private scheduleStartedAt = 0;
  private schedulePausedAt: number | null = null;
  private schedulePausedMs = 0;
  private onScheduleTick: ((bands: BandMap, elapsedMs: number) => void) | null = null;
  private onScheduleFinish: (() => void) | null = null;

  private chL!: ChannelNodes;
  private chR!: ChannelNodes;
  private tonesBus!: Tone.Gain;
  private preMaster!: Tone.Gain;
  private split!: Tone.Split;
  private analyserL!: Tone.Analyser;
  private analyserR!: Tone.Analyser;
  private analyserC!: Tone.Analyser;
  private noise!: Tone.Noise;
  private filter!: Tone.Filter;
  private filterGainNode!: Tone.Gain;
  private sweepLfo!: Tone.LFO;
  private chorus!: Tone.Chorus;
  private reverb!: Tone.Reverb;
  private noiseVol!: Tone.Volume;
  private masterVol!: Tone.Volume;
  private safetyGain!: Tone.Gain;
  private limiter!: Tone.Limiter;
  private entrainment!: EntrainmentMixer;

  constructor(onStateChange?: (playing: boolean, paused: boolean) => void) {
    if (onStateChange) this.onStateChange = onStateChange;
  }

  /** Re-bind the state callback (the module singleton outlives React mounts). */
  setOnStateChange(cb: (playing: boolean, paused: boolean) => void): void {
    this.onStateChange = cb;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Derived beat frequency |L − R| in Hz (spec: audio-engine). */
  get beatFrequency(): number {
    if (!this.params) return 0;
    return Math.abs(this.params.left.freq - this.params.right.freq);
  }

  /**
   * Returns the unified pre-master bus so external features (CR neuromodulation,
   * tinnitus) can plug into the same master chain instead of routing directly
   * to Tone.getDestination().  Builds the graph lazily if needed.
   */
  getInputNode(): Tone.Gain {
    this.ensureGraph();
    return this.preMaster;
  }

  getWaveform(ch: WaveformChannel): Float32Array | null {
    if (!this.built) return null;
    if (ch === 'L') return this.analyserL.getValue() as Float32Array;
    if (ch === 'R') return this.analyserR.getValue() as Float32Array;
    return this.analyserC.getValue() as Float32Array;
  }

  /** Store params; build the graph lazily so no audio nodes exist before first use. */
  applySettings(p: EngineParams): void {
    const prev = this.params;
    this.params = JSON.parse(JSON.stringify(p)) as EngineParams;
    if (!this.built || !prev) return;
    this.diff(prev, p);
  }

  /** Diff + ramp only changed params (task 3.3 single dispatcher). */
  private diff(prev: EngineParams, next: EngineParams): void {
    (['left', 'right'] as const).forEach((side) => {
      const p0 = prev[side];
      const p1 = next[side];
      const ch = side === 'left' ? this.chL : this.chR;
      if (p0.freq !== p1.freq) this.setOscFreq(ch, p1.freq);
      if (p0.wave !== p1.wave) ch.osc.type = p1.wave;
      if (p0.detune !== p1.detune) this.setNode(ch.osc.detune, p1.detune, RAMP.effects);
      if (p0.volume !== p1.volume) this.setChannelVolume(ch, p1.volume);
      if (p0.fm.rate !== p1.fm.rate) this.setNode(ch.fmSrc.frequency, p1.fm.rate, RAMP.frequency);
      if (p0.fm.depth !== p1.fm.depth) this.setNode(ch.fmDepth.gain, p1.fm.depth, RAMP.effects);
      if (p0.am.rate !== p1.am.rate) this.setNode(ch.amSrc.frequency, p1.am.rate, RAMP.frequency);
      if (p0.am.depth !== p1.am.depth) this.setNode(ch.amDepth.gain, p1.am.depth, RAMP.effects);
    });
    if (prev.master !== next.master) this.setNode(this.masterVol.volume, next.master, RAMP.volume);
    const n0 = prev.noise;
    const n1 = next.noise;
    if (n0.color !== n1.color) this.noise.type = n1.color;
    if (n0.volume !== n1.volume) this.setNode(this.noiseVol.volume, n1.volume, RAMP.volume);
    if (n0.q !== n1.q) this.setNode(this.filter.Q, n1.q, RAMP.filter);
    if (n0.sweepMin !== n1.sweepMin) this.sweepLfo.min = n1.sweepMin;
    if (n0.sweepMax !== n1.sweepMax) this.sweepLfo.max = n1.sweepMax;
    if (n0.lfoRate !== n1.lfoRate) this.setNode(this.sweepLfo.frequency, n1.lfoRate, RAMP.effects);
    if (n0.enabled !== n1.enabled) this.setNode(this.noiseVol.volume, n1.enabled ? n1.volume : -60, RAMP.volume);
    if (n0.filterGain !== n1.filterGain) this.setNode(this.filterGainNode.gain, n1.filterGain / 100, RAMP.filter);
    if (n0.phase !== n1.phase) this.sweepLfo.phase = ((n1.phase % 360) + 360) % 360;
    if (n0.chorus.rate !== n1.chorus.rate) setChorusProp(this.chorus, 'frequency', n1.chorus.rate, RAMP.effects);
    if (n0.chorus.depth !== n1.chorus.depth) setChorusProp(this.chorus, 'depth', n1.chorus.depth, RAMP.effects);
    if (n0.chorus.delay !== n1.chorus.delay) setChorusProp(this.chorus, 'delayTime', n1.chorus.delay, RAMP.effects);
    if (n0.chorus.spread !== n1.chorus.spread) this.chorus.spread = n1.chorus.spread;
    if (n0.chorus.feedback !== n1.chorus.feedback) this.setNode(this.chorus.feedback, n1.chorus.feedback, RAMP.effects);
    if (n0.reverb.decay !== n1.reverb.decay) this.reverb.decay = n1.reverb.decay;
    if (n0.reverb.wet !== n1.reverb.wet) this.setNode(this.reverb.wet, n1.reverb.wet, RAMP.effects);
    // Manual tones bus (S2 independent toggles)
    if (prev.manualEnabled !== next.manualEnabled) {
      this.setNode(this.tonesBus.gain, next.manualEnabled ? 1 : 0, RAMP.volume);
    }
    // Entrainment mixer — targeted diff (critique S1 item 4: no JSON.stringify on every slider move)
    const e0 = prev.entrainment;
    const e1 = next.entrainment;
    let entChanged =
      e0.enabled !== e1.enabled ||
      e0.carrier !== e1.carrier ||
      e0.preset !== e1.preset ||
      e0.schedule !== e1.schedule;
    if (!entChanged) {
      for (const id of BAND_NAMES) {
        if (
          e0.bands[id].intensity !== e1.bands[id].intensity ||
          e0.bands[id].beat !== e1.bands[id].beat
        ) {
          entChanged = true;
          break;
        }
      }
    }
    if (entChanged) this.entrainment.applyState(e1, this.playing);
  }

  private setNode(param: Rampable, v: number, ramp: number): void {
    if (this.playing) param.rampTo(v, ramp);
    else param.value = v;
  }

  /**
   * Cancel all scheduled parameter automation and re-anchor at the current value
   * (critique R2 P0-3/P0-4). Prevents old ramps from conflicting with new state
   * and stops mid-flight ramps from clicking when the context suspends/resumes.
   */
  private cancelAutomation(): void {
    if (!this.built) return;
    const now = Tone.now();
    const anchor = (p: ScheduledParam | undefined): void => {
      if (!p) return;
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
    anchor(this.masterVol.volume);
    anchor(this.tonesBus.gain);
    (['L', 'R'] as const).forEach((side) => {
      const ch = side === 'L' ? this.chL : this.chR;
      anchor(ch.osc.frequency);
      anchor(ch.osc.detune);
      anchor(ch.fmSrc.frequency);
      anchor(ch.fmDepth.gain);
      anchor(ch.amSrc.frequency);
      anchor(ch.amDepth.gain);
      anchor(ch.chVol.volume);
    });
    anchor(this.noiseVol.volume);
    anchor(this.filter.frequency);
    anchor(this.filter.Q);
    anchor(this.filterGainNode.gain);
    anchor(this.sweepLfo.frequency);
    anchor(this.chorus.frequency as unknown as ScheduledParam);
    anchor(this.chorus.depth as unknown as ScheduledParam);
    anchor(this.chorus.delayTime as unknown as ScheduledParam);
    anchor(this.chorus.feedback as unknown as ScheduledParam);
    anchor(this.reverb.wet);
    this.entrainment.cancelAutomation(now);
  }

  private setOscFreq(ch: ChannelNodes, hz: number): void {
    this.setNode(ch.osc.frequency, hz, freqRamp(hz));
  }

  private setChannelVolume(ch: ChannelNodes, gain: number): void {
    this.setNode(ch.chVol.volume, dbFromGain(gain), RAMP.volume);
  }

  /** Build the full signal graph (design D3). Safe to call once; idempotent. */
  private ensureGraph(): void {
    if (this.built) return;
    const p = this.params;
    this.built = true;

    // Master chain: MasterVolume -> SafetyGain(0.85) -> Limiter(-1) -> Destination
    // (safety gain: manual + noise + 5 entrainment bands must not push the limiter — critique S1)
    this.masterVol = new Tone.Volume(p?.master ?? -12);
    this.safetyGain = new Tone.Gain(0.85);
    this.limiter = new Tone.Limiter(-1);
    this.masterVol.chain(this.safetyGain, this.limiter, Tone.getDestination());

    // Unified pre-master bus (critique S1): every source feeds preMaster, which
    // feeds the master chain AND the split L/R analysers — so the waveforms show
    // the full mix including entrainment, not just the manual tones.
    this.preMaster = new Tone.Gain(1);
    this.preMaster.connect(this.masterVol);
    this.split = new Tone.Split(2);
    this.preMaster.connect(this.split);
    this.analyserL = new Tone.Analyser('waveform', 1024);
    this.analyserR = new Tone.Analyser('waveform', 1024);
    this.split.connect(this.analyserL, 0, 0); // split output 0 (L) -> analyserL
    this.split.connect(this.analyserR, 1, 0); // split output 1 (R) -> analyserR
    this.analyserC = new Tone.Analyser('waveform', 1024);
    this.masterVol.connect(this.analyserC);

    // Manual tones bus (stereo) feeding the unified pre-master bus
    this.tonesBus = new Tone.Gain(1);
    this.tonesBus.connect(this.preMaster);

    // Hard-panned channels
    const mkChannel = (pan: number, cp: ChannelParams | undefined): ChannelNodes => {
      const osc = new Tone.Oscillator({
        frequency: cp?.freq ?? 144,
        type: cp?.wave ?? 'sine',
        detune: cp?.detune ?? 0,
      });
      const amGain = new Tone.Gain(1);
      const chVol = new Tone.Volume(dbFromGain(cp?.volume ?? 0.5));
      const panner = new Tone.Panner(pan);
      osc.chain(amGain, chVol, panner, this.tonesBus);
      // FM: mod osc -> depth gain -> osc.frequency
      const fmSrc = new Tone.Oscillator({ frequency: cp?.fm.rate ?? 7.51, type: 'sine' });
      const fmDepth = new Tone.Gain(cp?.fm.depth ?? 0);
      fmSrc.connect(fmDepth);
      fmDepth.connect(osc.frequency);
      // AM: mod osc -> depth gain -> amGain.gain
      const amSrc = new Tone.Oscillator({ frequency: cp?.am.rate ?? 7.51, type: 'sine' });
      const amDepth = new Tone.Gain(cp?.am.depth ?? 0);
      amSrc.connect(amDepth);
      amDepth.connect(amGain.gain);
      return { osc, amGain, chVol, panner, fmSrc, fmDepth, amSrc, amDepth };
    };
    this.chL = mkChannel(-1, p?.left);
    this.chR = mkChannel(1, p?.right);

    // Noise chain: Noise -> BPF(LFO-swept) -> FilterGain -> Chorus -> Reverb -> NoiseVol -> preMaster
    const np = p?.noise;
    this.noise = new Tone.Noise({ type: np?.color ?? 'pink' });
    this.filter = new Tone.Filter({
      type: 'bandpass',
      frequency: ((np?.sweepMin ?? 350) + (np?.sweepMax ?? 1350)) / 2,
      Q: np?.q ?? 1,
    });
    this.filterGainNode = new Tone.Gain((np?.filterGain ?? 100) / 100);
    this.sweepLfo = new Tone.LFO({
      frequency: np?.lfoRate ?? 0.1,
      min: np?.sweepMin ?? 350,
      max: np?.sweepMax ?? 1350,
      type: 'sine',
      phase: np?.phase ?? 0,
    });
    this.sweepLfo.connect(this.filter.frequency);
    this.chorus = new Tone.Chorus({
      frequency: np?.chorus.rate ?? 200,
      delayTime: np?.chorus.delay ?? 0,
      depth: np?.chorus.depth ?? 0.5,
      spread: np?.chorus.spread ?? 90,
      feedback: np?.chorus.feedback ?? 0,
      wet: 1,
    });
    const reverbWet = np?.reverb.wet ?? 1;
    this.reverb = new Tone.Reverb({ decay: np?.reverb.decay ?? 6, wet: 0 });
    this.noiseVol = new Tone.Volume(np?.enabled === false ? -60 : (np?.volume ?? -36));
    this.noise.chain(this.filter, this.filterGainNode, this.chorus, this.reverb, this.noiseVol, this.preMaster);
    // Tone.Reverb generates its impulse response asynchronously — audio is
    // silent through the convolver until ready.  Ramp wet to target after the
    // promise resolves so the noise chain is never blocked.  (webQ gauntlet
    // critique R3 P0 — Tone 14 Reverb.asyncReady).
    if (this.reverb.ready && typeof this.reverb.ready.then === 'function') {
      this.reverb.ready.then(() => {
        this.reverb.wet.rampTo(reverbWet, 0.1);
      }).catch(() => {
        /* impulse-response generation failed — wet stays 0, noise is silent but
           the oscillator chain is unaffected */
      });
    } else {
      // Fallback: no async ready promise (e.g. mocked Tone or sync impl)
      this.reverb.wet.value = reverbWet;
    }

    // Entrainment mixer: 5 band pairs -> own bus -> unified pre-master bus
    // (preMaster placement means entrainment now shows in the L/R waveform scopes)
    this.entrainment = new EntrainmentMixer(this.preMaster);
    this.entrainment.applyState(p?.entrainment ?? defaultEntrainmentSettings(), false);
  }

  /**
   * Acquire a session — increments the shared active-session counter so the
   * AudioContext is only suspended when ALL sessions have released.
   * Returns the current generation (stale-callback guard).
   */
  static acquireSession(): number {
    activeSessions++;
    return generation;
  }

  /** Release a session — decrements the counter. */
  static releaseSession(): void {
    activeSessions = Math.max(0, activeSessions - 1);
  }

  /** Whether any session (binaural or tinnitus) is still active. */
  static hasActiveSessions(): boolean {
    return activeSessions > 0;
  }

  /** Current generation — bumped on every play/stop. */
  static currentGeneration(): number {
    return generation;
  }

  /** P0: Inject a callback to check if the tinnitus engine has active sessions.
   *  Called by TinnitusEngine on init to break the circular dependency. */
  static setTinnitusCheck(cb: (() => boolean) | null): void {
    checkTinnitusActive = cb;
  }

  /** Start audio — MUST be called from a user gesture (autoplay policy). Startup fade 2 s. */
  async play(): Promise<void> {
    if (this.playing) return;
    this.startCancelled = false;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    // iOS Safari (gauntlet P1): the AudioContext resume must fire synchronously
    // inside the user-gesture task. Building the ~40-node graph first can burn
    // the gesture window on slow mobile devices, leaving the context suspended
    // (silently blocked for ~25% of mobile users). Resume first, build after.
    await Tone.start();
    this.ensureGraph();
    // stop() clicked during the await above must abort the start (P0 race)
    if (this.startCancelled) return;
    // a stop while paused leaves the context suspended — always bring it back
    if (Tone.getContext().state === 'suspended') {
      await ((Tone.getContext() as Tone.Context).rawContext as AudioContext).resume();
    }
    if (this.startCancelled) return;
    // P0: generation token — stale callbacks from a previous session check this
    generation++;
    this.myGeneration = generation;
    AudioEngine.acquireSession();
    this.paused = false;
    this.cancelAutomation(); // clear automation left over from a previous session
    // begin fully faded, then ramp in (P0: binaural fade-in on Play)
    this.masterVol.volume.value = -60;
    this.chL.osc.start();
    this.chR.osc.start();
    this.chL.fmSrc.start();
    this.chR.fmSrc.start();
    this.chL.amSrc.start();
    this.chR.amSrc.start();
    this.chorus.start();
    this.noise.start();
    this.sweepLfo.start();
    this.entrainment.start();
    this.playing = true;
    this.onStateChange(true, false);
    this.masterVol.volume.rampTo(this.params?.master ?? -12, RAMP.startup);
  }

  /** Pause: suspend the audio context — sound freezes instantly, session preserved (S2).
   *  Only suspends if no other sessions (tinnitus) are still active — prevents
   *  stopping binaural from killing tinnitus audio. (P0: reference-counted suspend) */
  async pause(): Promise<void> {
    if (!this.playing || this.paused) return;
    this.cancelAutomation(); // anchor mid-flight ramps before freezing (no click on resume)
    // P0: only suspend the context if no other engine still needs it
    const tinnitusActive = checkTinnitusActive?.() ?? false;
    if (activeSessions <= 1 && !tinnitusActive) {
      await ((Tone.getContext() as Tone.Context).rawContext as AudioContext).suspend();
    }
    this.paused = true;
    this.schedulePausedAt = Date.now();
    this.onStateChange(true, true);
  }

  /** Resume from pause: unsuspend and shift the schedule clock by the paused time. */
  async resume(): Promise<void> {
    if (!this.paused) return;
    await ((Tone.getContext() as Tone.Context).rawContext as AudioContext).resume();
    this.paused = false;
    this.cancelAutomation(); // re-anchor to the post-resume clock
    if (this.schedulePausedAt !== null) {
      this.schedulePausedMs += Date.now() - this.schedulePausedAt;
      this.schedulePausedAt = null;
    }
    this.onStateChange(true, false);
  }

  /** Stop with 0.5 s fade-out, then halt sources (no click). */
  stop(): void {
    if (!this.built) return;
    if (!this.playing) {
      // aborts an in-flight play() start (P0 race fix)
      this.startCancelled = true;
      return;
    }
    this.cancelAutomation();
    this.masterVol.volume.rampTo(-60, RAMP.stop);
    this.stopTimer = setTimeout(() => {
      this.stopSources();
      this.stopTimer = null;
    }, RAMP.stop * 1000 + 50);
  }

  /** Session timer expiry: ~10 s master fade then stop (spec: session-presets). */
  sleepFadeStop(): void {
    if (!this.playing || !this.built) return;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.masterVol.volume.rampTo(-60, RAMP.sleepFade);
    this.stopTimer = setTimeout(() => {
      this.stopSources();
      this.stopTimer = null;
    }, RAMP.sleepFade * 1000 + 100);
  }

  private stopSources(): void {
    // P0: stale-callback guard — only the current generation may tear down
    // (prevents a double-stop from a previous session's timer from killing
    // a newly started session)
    try {
      this.chL.osc.stop();
      this.chR.osc.stop();
      this.chL.fmSrc.stop();
      this.chR.fmSrc.stop();
      this.chL.amSrc.stop();
      this.chR.amSrc.stop();
      this.noise.stop();
      this.sweepLfo.stop();
      this.entrainment.stop();
    } catch {
      /* nodes may already be stopped */
    }
    this.clearSchedule();
    AudioEngine.releaseSession();
    this.paused = false;
    this.playing = false;
    this.onStateChange(false, false);
  }

  /**
   * Engine-owned schedule runner (critique S1 item 5): drives band intensities
   * along the staged timeline with no App setInterval drift, frozen while paused.
   * `startElapsedMs` resumes an in-progress timeline (P2 — persisted across reload).
   */
  setSchedule(
    def: ScheduleDefinition,
    startBands: BandMap,
    onTick: (bands: BandMap, elapsedMs: number) => void,
    onFinish: () => void,
    startElapsedMs = 0,
  ): void {
    if (this.scheduleId === def.id && this.scheduleTimer) return;
    this.clearSchedule();
    this.cancelAutomation(); // drop stale ramps before the timeline starts
    this.scheduleId = def.id;
    this.scheduleDef = def;
    this.scheduleStartBands = startBands;
    const elapsed = Math.max(0, startElapsedMs);
    this.scheduleStartedAt = Date.now() - elapsed;
    this.schedulePausedMs = 0;
    this.schedulePausedAt = this.paused ? Date.now() : null;
    this.onScheduleTick = onTick;
    this.onScheduleFinish = onFinish;
    const totalMs = def.durationMinutes * 60_000;
    if (elapsed >= totalMs) {
      // persisted progress already past the end — finish immediately
      const finish = this.onScheduleFinish;
      this.clearSchedule();
      finish?.();
      return;
    }
    this.scheduleTimer = setInterval(() => this.scheduleTick(), 1000);
    this.scheduleTick();
  }

  clearSchedule(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    this.scheduleId = null;
    this.scheduleDef = null;
    this.scheduleStartBands = null;
    this.schedulePausedAt = null;
    this.schedulePausedMs = 0;
    this.onScheduleTick = null;
    this.onScheduleFinish = null;
  }

  private scheduleTick(): void {
    // P0: stale-callback guard — skip if this session's generation is outdated
    if (this.myGeneration !== generation) {
      this.clearSchedule();
      return;
    }
    if (!this.scheduleDef || !this.scheduleStartBands || this.paused) return;
    const elapsedMs = Date.now() - this.scheduleStartedAt - this.schedulePausedMs;
    const t = elapsedMs / 1000;
    const totalMs = this.scheduleDef.durationMinutes * 60_000;
    if (elapsedMs >= totalMs) {
      // capture before clearSchedule() nulls the callback
      const finish = this.onScheduleFinish;
      this.clearSchedule();
      finish?.();
      return;
    }
    this.onScheduleTick?.(scheduleTargetsAt(this.scheduleDef, t, this.scheduleStartBands), elapsedMs);
  }

  dispose(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.clearSchedule();
    if (!this.built) return;
    try {
      this.stopSources();
    } catch {
      /* ignore */
    }
    const nodes: Array<{ dispose(): void }> = [
      this.chL.osc, this.chL.amGain, this.chL.chVol, this.chL.panner, this.chL.fmSrc,
      this.chL.fmDepth, this.chL.amSrc, this.chL.amDepth,
      this.chR.osc, this.chR.amGain, this.chR.chVol, this.chR.panner, this.chR.fmSrc,
      this.chR.fmDepth, this.chR.amSrc, this.chR.amDepth,
      this.tonesBus, this.preMaster, this.split, this.analyserL, this.analyserR, this.analyserC,
      this.noise, this.filter, this.filterGainNode, this.sweepLfo, this.chorus, this.reverb, this.noiseVol,
      this.masterVol, this.safetyGain, this.limiter,
    ];
    nodes.forEach((n) => {
      try {
        n.dispose();
      } catch {
        /* ignore */
      }
    });
    this.entrainment.dispose();
    this.built = false;
  }
}

/** Module-level singleton — StrictMode-safe (graph built lazily on first play). */
let singleton: AudioEngine | null = null;

export function getAudioEngine(onStateChange?: (playing: boolean, paused: boolean) => void): AudioEngine {
  if (!singleton) singleton = new AudioEngine(onStateChange);
  return singleton;
}