import * as Tone from 'tone';
import type { TherapyEngine } from '../core/TherapyEngine';

export interface TherapyStep {
  engineId: string;
  targetGain: number;
  transitionSec: number;
  durationSec: number;
}

export interface TherapyProtocol {
  id: string;
  name: string;
  description: string;
  steps: TherapyStep[];
}

export const GENTLE_ENRICHMENT: TherapyProtocol = {
  id: 'gentle-enrichment',
  name: 'Gentle Enrichment (4 weeks)',
  description: 'Gradual introduction of sound therapy',
  steps: [
    { engineId: 'enrichment', targetGain: 0.2, transitionSec: 5, durationSec: 600 },
    { engineId: 'enrichment', targetGain: 0.35, transitionSec: 5, durationSec: 900 },
    { engineId: 'notched', targetGain: 0.3, transitionSec: 10, durationSec: 900 },
    { engineId: 'enrichment', targetGain: 0.4, transitionSec: 5, durationSec: 1200 },
    { engineId: 'notched', targetGain: 0.35, transitionSec: 10, durationSec: 1200 },
  ],
};

export const SLEEP_FOCUS: TherapyProtocol = {
  id: 'sleep-focus',
  name: 'Sleep Focus',
  description: 'Evening routine with breathing and enrichment',
  steps: [
    { engineId: 'enrichment', targetGain: 0.25, transitionSec: 5, durationSec: 600 },
    { engineId: 'breathing', targetGain: 0.3, transitionSec: 10, durationSec: 900 },
    { engineId: 'enrichment', targetGain: 0.2, transitionSec: 5, durationSec: 1200 },
  ],
};

export const PROTOCOLS: TherapyProtocol[] = [GENTLE_ENRICHMENT, SLEEP_FOCUS];

/**
 * Progressive protocol scheduler.
 * Runs therapy steps sequentially with smooth transitions.
 * Never auto-increases volume — user confirms each session.
 */
export class ProtocolScheduler {
  private stepIndex = 0;
  private scheduleIds: number[] = [];
  private onStepChange?: (step: TherapyStep, index: number, total: number) => void;
  private onComplete?: () => void;
  private running = false;

  constructor(
    private protocol: TherapyProtocol,
    private engines: Map<string, TherapyEngine>,
  ) {}

  start() {
    this.stepIndex = 0;
    this.running = true;
    this.runStep(this.protocol.steps[0]!);
  }

  private runStep(step: TherapyStep) {
    if (!this.running) return;
    const engine = this.engines.get(step.engineId);
    if (!engine) return;

    this.onStepChange?.(step, this.stepIndex, this.protocol.steps.length);

    engine.setIntensity(0);
    engine.start({ dominantPitchHz: 4000, pitchConfidence: 0, laterality: 'unknown', loudnessMatchDb: null, mixingPointDb: null, notchWidthOctaves: 0.5, notchDepthDb: -18, crSpacingErb: 0.75, soundSensitivity: 'normal', created: new Date(), lastUpdated: new Date() });
    engine.setIntensity(step.targetGain);

    const id = Tone.Transport.scheduleOnce(() => {
      engine.stop(2);
      this.advance();
    }, `+${step.durationSec}`);
    this.scheduleIds.push(id);
  }

  private advance() {
    this.stepIndex++;
    if (this.stepIndex < this.protocol.steps.length && this.running) {
      this.runStep(this.protocol.steps[this.stepIndex]!);
    } else {
      this.running = false;
      this.onComplete?.();
    }
  }

  pause() {
    Tone.Transport.pause();
  }

  resume() {
    Tone.Transport.start();
  }

  stop() {
    this.running = false;
    this.scheduleIds.forEach((id) => Tone.Transport.clear(id));
    this.scheduleIds = [];
    this.engines.forEach((e) => e.stop(1));
    Tone.Transport.stop();
  }

  onStep(cb: (step: TherapyStep, index: number, total: number) => void) {
    this.onStepChange = cb;
  }

  onDone(cb: () => void) {
    this.onComplete = cb;
  }
}
