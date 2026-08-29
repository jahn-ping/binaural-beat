import type { CRFrequencySet, CRParameters, CRPreset, CRPlaybackOrder } from './types';

export const CR_LIMITS = {
  tinnitusFrequencyHz: { min: 100, max: 8000, step: 1 },
  erbSpacing: { min: 0.25, max: 2.0, step: 0.05 },
  amplitude: { min: 0, max: 1, step: 0.01 },
  burstRateHz: { min: 0.5, max: 4, step: 0.1 },
  burstDurationMs: { min: 10, max: 100, step: 1 },
  sessionMinutes: { min: 1, max: 20 },
} as const;

export const DEFAULT_CR_PARAMETERS: CRParameters = {
  tinnitusFrequencyHz: 1000,
  erbSpacing: 0.75,
  amplitudes: [0.75, 0.75, 0.75, 0.75],
  burstRateHz: 1,
  burstDurationMs: 250,
  playbackOrder: 'pseudorandom',
};

/** ERB-rate approximation (Glasberg & Moore). */
export function hzToErbRate(frequencyHz: number): number {
  return 21.4 * Math.log10(0.00437 * frequencyHz + 1);
}

/** Inverse ERB-rate. */
export function erbRateToHz(erbRate: number): number {
  return (Math.pow(10, erbRate / 21.4) - 1) / 0.00437;
}

/** Generate 4 CR frequencies symmetrically spaced around the tinnitus pitch. */
export function calculateCRFrequencies(
  tinnitusFrequencyHz: number,
  erbSpacing: number,
): CRFrequencySet {
  const centerErb = hzToErbRate(tinnitusFrequencyHz);
  const offsets = [-1.5, -0.5, 0.5, 1.5];
  const frequencies = offsets.map((offset) =>
    Math.min(8000, Math.max(100, erbRateToHz(centerErb + offset * erbSpacing))),
  );
  return {
    centerHz: tinnitusFrequencyHz,
    frequenciesHz: frequencies as [number, number, number, number],
  };
}

export const CR_PRESETS: readonly CRPreset[] = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'Lower gain, slower bursts. Gentle starting point.',
    parameters: {
      erbSpacing: 0.75,
      amplitudes: [0.4, 0.4, 0.4, 0.4],
      burstRateHz: 0.75,
      burstDurationMs: 200,
      playbackOrder: 'pseudorandom',
    },
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Default CR configuration based on literature.',
    parameters: {
      erbSpacing: 0.75,
      amplitudes: [0.75, 0.75, 0.75, 0.75],
      burstRateHz: 1,
      burstDurationMs: 250,
      playbackOrder: 'pseudorandom',
    },
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Higher gain, faster bursts. For experienced users.',
    parameters: {
      erbSpacing: 1.0,
      amplitudes: [0.75, 0.75, 0.75, 0.75],
      burstRateHz: 2.5,
      burstDurationMs: 200,
      playbackOrder: 'pseudorandom',
    },
  },
  {
    id: 'sleep',
    label: 'Sleep',
    description: 'Very quiet, slow sequential tones for bedtime.',
    parameters: {
      erbSpacing: 0.5,
      amplitudes: [0.2, 0.2, 0.2, 0.2],
      burstRateHz: 0.5,
      burstDurationMs: 300,
      playbackOrder: 'sequential',
    },
  },
];

export function getPreset(id: CRPreset['id']): CRPreset {
  return CR_PRESETS.find((p) => p.id === id)!;
}

export function isPlaybackOrder(value: string): value is CRPlaybackOrder {
  return value === 'pseudorandom' || value === 'sequential' || value === 'reverse';
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
