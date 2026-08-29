import * as Tone from 'tone';
import type { TherapyEngine } from '../core/TherapyEngine';
import type { TinnitusProfile } from '../core/TinnitusProfile';

type SoundscapeType = 'rain' | 'ocean' | 'forest' | 'air';

/**
 * Soundscape engine using Tone.Player with preloaded audio buffers.
 * Crossfades between soundscapes through the SafetyBus.
 */
export class SoundscapeEngine implements TherapyEngine {
  readonly id = 'soundscape';
  readonly evidenceLabel = 'symptom-management' as const;
  private players = new Map<SoundscapeType, Tone.Player>();
  private gain: Tone.Gain;
  private bus: Tone.Gain;
  private currentSound: SoundscapeType | null = null;
  private loaded = false;

  constructor(bus: Tone.Gain) {
    this.bus = bus;
    this.gain = new Tone.Gain(0);
    this.gain.connect(this.bus);
  }

  async loadAll(baseUrl = '/audio') {
    if (this.loaded) return;
    const sounds: SoundscapeType[] = ['rain', 'ocean', 'forest', 'air'];
    await Promise.all(
      sounds.map(async (name) => {
        try {
          const player = new Tone.Player(`${baseUrl}/${name}-loop.mp3`);
          player.loop = true;
          player.connect(this.gain);
          this.players.set(name, player);
        } catch {
          console.warn(`Failed to load soundscape: ${name}`);
        }
      }),
    );
    this.loaded = true;
  }

  start(_profile: TinnitusProfile) {
    if (this.currentSound) {
      const player = this.players.get(this.currentSound);
      if (player && player.state !== 'started') player.start();
    }
    this.gain.gain.rampTo(0.4, 1.5);
  }

  async play(name: SoundscapeType, fadeTime = 2) {
    if (this.currentSound) {
      const old = this.players.get(this.currentSound);
      old?.volume.rampTo(-60, fadeTime);
    }
    const player = this.players.get(name);
    if (!player) return;
    if (player.state !== 'started') player.start();
    player.volume.rampTo(0, fadeTime);
    this.currentSound = name;
  }

  setIntensity(g: number) {
    this.gain.gain.rampTo(g, 0.5);
  }

  stop(fade = 2) {
    this.gain.gain.rampTo(0, fade);
  }

  dispose() {
    this.players.forEach((p) => p.dispose());
    this.gain.dispose();
  }
}
