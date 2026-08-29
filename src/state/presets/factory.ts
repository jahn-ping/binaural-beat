/**
 * Factory presets — shipped as static imports, versioned with the app bundle.
 * Never written to IndexedDB (webQ-gauntlet consensus).
 *
 * These extend the existing built-in presets from `src/audio/presets.ts`
 * with full snapshot coverage (noise + entrainment + tinnitus + session).
 */

import type { BinauralPreset, PresetAudioState } from './types';
import { DEFAULT_TINNITUS } from '../tinnitus';

// ── Audio snapshots ────────────────────────────────────────────────────────

const defaultNoise = (): PresetAudioState['noise'] => ({
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
});

const defaultEntrainment = (): PresetAudioState['entrainment'] => ({
  enabled: true,
  carrier: 144,
  preset: 'Default',
  schedule: '',
  bands: {
    delta: { intensity: 40, beat: 2 },
    theta: { intensity: 100, beat: 5 },
    alpha: { intensity: 40, beat: 10 },
    beta: { intensity: 20, beat: 18 },
    gamma: { intensity: 20, beat: 40 },
  },
});

const ch = (freq: number): PresetAudioState['left'] => ({
  freq,
  volume: 0.5,
  wave: 'sine',
  detune: 0,
  fm: { rate: 7.51, depth: 0 },
  am: { rate: 7.51, depth: 0 },
});

const mkAudio = (
  carrierFreq: number,
  beatFreq: number,
  overrides?: Partial<PresetAudioState>,
): PresetAudioState => ({
  left: ch(carrierFreq),
  right: ch(carrierFreq + beatFreq),
  master: -12,
  manualEnabled: true,
  noise: defaultNoise(),
  entrainment: defaultEntrainment(),
  linkedMode: false,
  timerMinutes: 0,
  ...overrides,
});

// ── Factory presets ────────────────────────────────────────────────────────

const now = Date.now();

export const FACTORY_PRESETS: BinauralPreset[] = [
  {
    id: 'factory-schumann',
    name: 'Schumann Resonance',
    schemaVersion: 1,
    category: 'factory',
    tags: ['default', 'earth'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(144, 7.51),
    tinnitus: { ...DEFAULT_TINNITUS },
  },
  {
    id: 'factory-delta-sleep',
    name: 'Deep Sleep (Delta)',
    schemaVersion: 1,
    category: 'factory',
    tags: ['sleep', 'delta'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(100, 2, {
      timerMinutes: 60,
      entrainment: {
        ...defaultEntrainment(),
        preset: 'Delta',
        bands: {
          delta: { intensity: 100, beat: 2 },
          theta: { intensity: 0, beat: 5 },
          alpha: { intensity: 0, beat: 10 },
          beta: { intensity: 0, beat: 18 },
          gamma: { intensity: 0, beat: 40 },
        },
      },
    }),
    tinnitus: { ...DEFAULT_TINNITUS },
  },
  {
    id: 'factory-theta-meditation',
    name: 'Deep Meditation (Theta)',
    schemaVersion: 1,
    category: 'factory',
    tags: ['meditation', 'theta'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(150, 5, {
      timerMinutes: 30,
      entrainment: {
        ...defaultEntrainment(),
        preset: 'Theta',
        bands: {
          delta: { intensity: 0, beat: 2 },
          theta: { intensity: 100, beat: 5 },
          alpha: { intensity: 0, beat: 10 },
          beta: { intensity: 0, beat: 18 },
          gamma: { intensity: 0, beat: 40 },
        },
      },
    }),
    tinnitus: { ...DEFAULT_TINNITUS },
  },
  {
    id: 'factory-alpha-focus',
    name: 'Relaxed Focus (Alpha)',
    schemaVersion: 1,
    category: 'factory',
    tags: ['focus', 'alpha', 'relaxation'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(200, 10, {
      timerMinutes: 45,
      entrainment: {
        ...defaultEntrainment(),
        preset: 'Alpha',
        bands: {
          delta: { intensity: 0, beat: 2 },
          theta: { intensity: 0, beat: 5 },
          alpha: { intensity: 100, beat: 10 },
          beta: { intensity: 0, beat: 18 },
          gamma: { intensity: 0, beat: 40 },
        },
      },
    }),
    tinnitus: { ...DEFAULT_TINNITUS },
  },
  {
    id: 'factory-beta-alert',
    name: 'Alert Concentration (Beta)',
    schemaVersion: 1,
    category: 'factory',
    tags: ['alert', 'beta', 'concentration'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(200, 18, {
      noise: { ...defaultNoise(), enabled: false },
      entrainment: {
        ...defaultEntrainment(),
        preset: 'Beta',
        bands: {
          delta: { intensity: 0, beat: 2 },
          theta: { intensity: 0, beat: 5 },
          alpha: { intensity: 0, beat: 10 },
          beta: { intensity: 100, beat: 18 },
          gamma: { intensity: 0, beat: 40 },
        },
      },
    }),
    tinnitus: { ...DEFAULT_TINNITUS },
  },
  {
    id: 'factory-tinnitus-pink',
    name: 'Tinnitus Relief (Pink)',
    schemaVersion: 1,
    category: 'factory',
    tags: ['tinnitus', 'relief', 'pink-noise'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(144, 7.51),
    tinnitus: {
      ...DEFAULT_TINNITUS,
      disclaimerAcknowledged: true,
      enabled: true,
      mode: 'enrichment',
      noiseType: 'pink',
      volumeDb: -24,
    },
  },
  {
    id: 'factory-tinnitus-brown',
    name: 'Tinnitus Relief (Brown)',
    schemaVersion: 1,
    category: 'factory',
    tags: ['tinnitus', 'relief', 'brown-noise'],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    audio: mkAudio(144, 7.51),
    tinnitus: {
      ...DEFAULT_TINNITUS,
      disclaimerAcknowledged: true,
      enabled: true,
      mode: 'enrichment',
      noiseType: 'brown',
      volumeDb: -24,
    },
  },
];
