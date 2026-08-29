import * as Tone from 'tone';

/**
 * Breathing modulation — amplitude + filter cutoff LFOs.
 * Extends the original amplitude-only swell with subtle filter modulation.
 */
export class BreathingModulator {
  private ampLfo: Tone.LFO;
  private filterLfo: Tone.LFO;
  private filter: Tone.Filter;

  constructor(input: Tone.ToneAudioNode, output: Tone.ToneAudioNode) {
    this.ampLfo = new Tone.LFO({
      frequency: 0.08,
      type: 'sine',
      min: 0.7,
      max: 1.0,
    });

    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 5000, Q: 0.7 });
    this.filterLfo = new Tone.LFO({
      frequency: 0.08,
      type: 'sine',
      min: 3000,
      max: 5000,
    });

    input.connect(this.filter);
    this.ampLfo.connect(this.filter.gain);
    this.filterLfo.connect(this.filter.frequency);
    this.filter.connect(output);
  }

  start(rateHz = 0.08) {
    this.ampLfo.frequency.rampTo(rateHz, 1);
    this.filterLfo.frequency.rampTo(rateHz, 1);
    this.ampLfo.start();
    this.filterLfo.start();
  }

  stop() {
    this.ampLfo.stop();
    this.filterLfo.stop();
  }

  setRate(rateHz: number) {
    this.ampLfo.frequency.rampTo(rateHz, 0.5);
    this.filterLfo.frequency.rampTo(rateHz, 0.5);
  }

  dispose() {
    this.ampLfo.dispose();
    this.filterLfo.dispose();
    this.filter.dispose();
  }
}
