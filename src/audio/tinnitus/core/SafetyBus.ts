import * as Tone from 'tone';

export interface LimiterEvent {
  timestamp: number;
  source: 'binaural' | 'tinnitus';
  requestedGain: number;
  clampedGain: number;
}

/**
 * Combined safety bus with asymmetric headroom allocation.
 * Only the bus being raised gets ducked — never both.
 * Hard ceiling enforced in the audio graph, not just UI sliders.
 */
export class SafetyBus {
  readonly binauralBus = new Tone.Gain(0);
  readonly tinnitusBus = new Tone.Gain(0);
  private readonly masterBus = new Tone.Gain(1);
  private readonly limiter = new Tone.Limiter(-3);
  private readonly meter = new Tone.Meter({ smoothing: 0.2 });
  private readonly CEILING_LINEAR = 0.85;
  private limiterEvents: LimiterEvent[] = [];
  private onLimiterEvent?: (e: LimiterEvent) => void;
  private disposed = false;

  constructor() {
    this.binauralBus.connect(this.masterBus);
    this.tinnitusBus.connect(this.masterBus);
    this.masterBus.chain(this.limiter, Tone.getDestination());
    this.masterBus.connect(this.meter);
  }

  setBinauralLevel(target: number) {
    this.applyWithHeadroom(this.binauralBus, target, 'binaural');
  }

  setTinnitusLevel(target: number) {
    this.applyWithHeadroom(this.tinnitusBus, target, 'tinnitus');
  }

  private applyWithHeadroom(bus: Tone.Gain, target: number, source: 'binaural' | 'tinnitus') {
    const other = bus === this.binauralBus ? this.tinnitusBus : this.binauralBus;
    const combined = other.gain.value + target;
    const clamped = combined > this.CEILING_LINEAR
      ? Math.max(0, this.CEILING_LINEAR - other.gain.value)
      : target;
    bus.gain.rampTo(clamped, 0.4);
    if (clamped < target) {
      const event: LimiterEvent = { timestamp: Date.now(), source, requestedGain: target, clampedGain: clamped };
      this.limiterEvents.push(event);
      this.onLimiterEvent?.(event);
    }
  }

  panicStop() {
    const now = Tone.now();
    this.binauralBus.gain.cancelScheduledValues(now);
    this.tinnitusBus.gain.cancelScheduledValues(now);
    this.binauralBus.gain.setValueAtTime(0, now);
    this.tinnitusBus.gain.setValueAtTime(0, now);
  }

  getCurrentLevel(): number {
    const val = this.meter.getValue();
    return typeof val === 'number' ? val : 0;
  }

  getLimiterEvents(): LimiterEvent[] {
    return [...this.limiterEvents];
  }

  clearLimiterEvents() {
    this.limiterEvents = [];
  }

  onLimiter(cb: (e: LimiterEvent) => void) {
    this.onLimiterEvent = cb;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.binauralBus.dispose();
    this.tinnitusBus.dispose();
    this.masterBus.dispose();
    this.limiter.dispose();
    this.meter.dispose();
  }
}

let safetySingleton: SafetyBus | null = null;

export function getSafetyBus(): SafetyBus {
  if (!safetySingleton) safetySingleton = new SafetyBus();
  return safetySingleton;
}
