import * as Tone from 'tone';
import { calculateCRFrequencies } from './crConfig';
import type { CRParameters, CRPlaybackOrder } from './types';

/**
 * CR Engine — fully self-contained audio system.
 * Creates its own oscillators and routes directly to speakers.
 * No dependency on the binaural engine's audio graph.
 */
export class CREngineExpanded {
  private oscillators: Tone.Oscillator[] = [];
  private gains: Tone.Gain[] = [];
  private masterGain: Tone.Gain;
  private analyser: Tone.Analyser;
  private fftAnalyser: Tone.Analyser;
  private testOsc: Tone.Oscillator | null = null;
  private testGain: Tone.Gain | null = null;
  private isRunning = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private sequenceIndex = 0;
  private params: CRParameters;
  private sessionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_SESSION_MS = 20 * 60 * 1000;
  private onTimeUpdate?: (elapsed: number) => void;
  private startTime = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Fully independent — no bus, no binaural engine dependency.
    this.masterGain = new Tone.Gain(1);
    // Connect directly to destination FIRST — this is the speaker path
    this.masterGain.connect(Tone.getDestination());
    // Analysers are TAPPED off as side-chains — they do NOT sit in the speaker path
    this.analyser = new Tone.Analyser('waveform', 256);
    this.masterGain.connect(this.analyser);
    this.fftAnalyser = new Tone.Analyser('fft', 512);
    this.masterGain.connect(this.fftAnalyser);
    this.params = {
      tinnitusFrequencyHz: 1000,
      erbSpacing: 0.75,
      amplitudes: [0.75, 0.75, 0.75, 0.75],
      burstRateHz: 1,
      burstDurationMs: 250,
      playbackOrder: 'pseudorandom',
    };
  }

  async start(params: CRParameters) {
    if (this.isRunning) this.stop();

    this.params = { ...params };
    this.isRunning = true;
    this.sequenceIndex = 0;
    this.startTime = Date.now();

    // Ensure AudioContext is running — critical for browser autoplay policy
    try {
      const rawCtx = (Tone.getContext() as Tone.Context).rawContext as AudioContext;
      console.log('[CR] AudioContext state before resume:', rawCtx.state);
      if (rawCtx.state !== 'running') {
        await rawCtx.resume();
        console.log('[CR] AudioContext state after resume:', rawCtx.state);
      }
    } catch (e) { console.error('[CR] Resume failed:', e); }

    console.log('[CR] Tone.context.state:', Tone.context.state);
    console.log('[CR] Tone.now():', Tone.now());
    console.log('[CR] masterGain.gain.value:', this.masterGain.gain.value);
    console.log('[CR] masterGain connected to destination:', this.masterGain.context.destination !== undefined);

    // Open master gain — ramp from 0 to 1
    const now = Tone.now();
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(1, now + 0.1);

    // Always create a FRESH test tone to avoid stale oscillator state
    this.disposeTestOsc();
    this.testOsc = new Tone.Oscillator({ frequency: 440, type: 'sine' });
    this.testGain = new Tone.Gain(0.5);
    this.testOsc.connect(this.testGain);
    this.testGain.connect(this.masterGain);
    this.testOsc.start();
    console.log('[CR] Test tone started at 440Hz, gain=0.5');

    // Create 4 oscillators at CR frequencies
    const freqs = calculateCRFrequencies(params.tinnitusFrequencyHz, params.erbSpacing);
    console.log('[CR] Frequencies:', freqs);
    for (let i = 0; i < 4; i++) {
      const gain = new Tone.Gain(0); // start silent, burst controls the envelope
      const osc = new Tone.Oscillator({
        frequency: freqs.frequenciesHz[i] ?? 440,
        type: 'sine',
      });
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.oscillators.push(osc);
      this.gains.push(gain);
      console.log(`[CR] T${i+1} started at ${freqs.frequenciesHz[i]}Hz, gain=0 (burst controls)`);
    }
    console.log('[CR] All oscillators created. masterGain:', this.masterGain);

    // Start burst loop
    this.scheduleNextBurst();

    // Auto-stop
    this.sessionTimeout = setTimeout(() => this.stop(), this.MAX_SESSION_MS);

    // Time tracking
    this.tickInterval = setInterval(() => {
      this.onTimeUpdate?.(Math.floor((Date.now() - this.startTime) / 1000));
    }, 1000);
  }

  private disposeTestOsc(): void {
    try { this.testOsc?.stop(); } catch { /* ok */ }
    try { this.testOsc?.dispose(); } catch { /* ok */ }
    try { this.testGain?.dispose(); } catch { /* ok */ }
    this.testOsc = null;
    this.testGain = null;
  }

  private scheduleNextBurst() {
    if (!this.isRunning) return;
    const intervalMs = (1 / this.params.burstRateHz) * 1000;
    this.timerId = setTimeout(() => {
      this.playBurst();
      this.scheduleNextBurst();
    }, intervalMs);
  }

  private playBurst() {
    if (!this.isRunning) return;

    const order = this.getIndices(this.params.playbackOrder);
    const channelIdx = order[this.sequenceIndex % order.length];
    this.sequenceIndex++;

    const gainVal = this.params.amplitudes[channelIdx]!;
    const durationSec = this.params.burstDurationMs / 1000;

    const osc = this.oscillators[channelIdx];
    const gainNode = this.gains[channelIdx];
    if (!osc || !gainNode) return;

    const now = Tone.now();
    const gain = gainNode.gain;

    // Anchor to actual current value, then ramp the burst envelope
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    const attack = Math.min(0.005, durationSec / 2);
    gain.linearRampToValueAtTime(gainVal, now + attack);
    gain.setValueAtTime(gainVal, now + durationSec - attack);
    gain.linearRampToValueAtTime(0, now + durationSec);
  }

  private getIndices(order: CRPlaybackOrder): number[] {
    const base = [0, 1, 2, 3];
    switch (order) {
      case 'sequential': return base;
      case 'reverse': return [3, 2, 1, 0];
      case 'pseudorandom':
      default: {
        const arr = [...base];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j]!, arr[i]!];
        }
        return arr;
      }
    }
  }

  updateParameters(params: Partial<CRParameters>) {
    Object.assign(this.params, params);
  }

  setMasterVolume(value: number) {
    const now = Tone.now();
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, value)), now + 0.1);
  }

  stop() {
    this.isRunning = false;
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
    if (this.sessionTimeout) { clearTimeout(this.sessionTimeout); this.sessionTimeout = null; }
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }

    const now = Tone.now();
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + 0.1);

    // Capture old references BEFORE clearing
    const oldOscs = this.oscillators;
    const oldGains = this.gains;
    this.oscillators = [];
    this.gains = [];

    setTimeout(() => {
      oldOscs.forEach((osc) => {
        try { osc.stop(); osc.dispose(); } catch { /* already stopped */ }
      });
      oldGains.forEach((g) => {
        try { g.dispose(); } catch { /* already disposed */ }
      });
    }, 150);

    this.disposeTestOsc();
  }

  /** Get current RMS level (0..1) for the level meter. */
  getLevel(): number {
    const data = this.analyser.getValue() as Float32Array;
    if (!data || data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!;
    return Math.sqrt(sum / data.length);
  }

  /** Get FFT frequency data (dB, 512 bins) for the spectrogram. */
  getSpectrum(): Float32Array {
    return this.fftAnalyser.getValue() as Float32Array;
  }

  /** Get the sample rate for frequency axis mapping. */
  getSampleRate(): number {
    return Tone.getContext().sampleRate;
  }

  dispose() {
    this.stop();
    this.analyser.dispose();
    this.fftAnalyser.dispose();
    this.masterGain.dispose();
  }

  setOnTimeUpdate(cb: (elapsed: number) => void) {
    this.onTimeUpdate = cb;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getElapsed(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}
