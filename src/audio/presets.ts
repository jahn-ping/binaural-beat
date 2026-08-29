import type { ChannelParams, EngineParams } from './engine';
import { BAND_NAMES, ENTRAINMENT_BANDS, type BandMap, type BandName, type EntrainmentSettings } from './entrainment';

export interface Preset {
  id: string;
  name: string;
  description: string;
  left: ChannelParams;
  right: ChannelParams;
}

const ch = (freq: number): ChannelParams => ({
  freq,
  volume: 0.5,
  wave: 'sine',
  detune: 0,
  fm: { rate: 7.51, depth: 0 },
  am: { rate: 7.51, depth: 0 },
});

/** Built-in frequency presets (spec: session-presets). Schumann is the default. */
export const PRESETS: Preset[] = [
  { id: 'schumann', name: 'Schumann', description: '7.51 Hz beat — Earth resonance', left: ch(144), right: ch(151.51) },
  { id: 'delta', name: 'Delta', description: '~2 Hz beat — deep sleep', left: ch(100), right: ch(102) },
  { id: 'theta', name: 'Theta', description: '~5 Hz beat — deep meditation', left: ch(150), right: ch(155) },
  { id: 'alpha', name: 'Alpha', description: '~10 Hz beat — relaxed focus', left: ch(200), right: ch(210) },
  { id: 'beta', name: 'Beta', description: '~18 Hz beat — alert concentration', left: ch(200), right: ch(218) },
];

export const DEFAULT_PRESET_ID = 'schumann';

export type PresetChannels = Pick<EngineParams, 'left' | 'right'>;

// ---- Entrainment presets (webQ-synthesized: Default mix + single-band 100) ----

export type EntrainmentPreset = 'Default' | 'Alpha' | 'Beta' | 'Delta' | 'Gamma' | 'Theta' | 'Custom';

export const ENTRAINMENT_PRESET_NAMES: EntrainmentPreset[] = [
  'Default',
  'Delta',
  'Theta',
  'Alpha',
  'Beta',
  'Gamma',
  'Custom',
];

const bandPreset = (intensities: Partial<Record<BandName, number>>): BandMap =>
  Object.fromEntries(
    BAND_NAMES.map((id) => [id, { intensity: intensities[id] ?? 0, beat: ENTRAINMENT_BANDS[id].beat }]),
  ) as BandMap;

export const ENTRAINMENT_PRESETS: Record<Exclude<EntrainmentPreset, 'Custom'>, BandMap> = {
  Default: bandPreset({ delta: 40, theta: 100, alpha: 40, beta: 20, gamma: 20 }),
  Delta: bandPreset({ delta: 100 }),
  Theta: bandPreset({ theta: 100 }),
  Alpha: bandPreset({ alpha: 100 }),
  Beta: bandPreset({ beta: 100 }),
  Gamma: bandPreset({ gamma: 100 }),
};

export function applyEntrainmentPreset(s: EntrainmentSettings, preset: EntrainmentPreset): EntrainmentSettings {
  if (preset === 'Custom') return s;
  return { ...s, bands: ENTRAINMENT_PRESETS[preset], preset };
}

export function detectEntrainmentPreset(bands: BandMap): EntrainmentPreset {
  for (const [name, presetBands] of Object.entries(ENTRAINMENT_PRESETS) as [
    Exclude<EntrainmentPreset, 'Custom'>,
    BandMap,
  ][]) {
    // Beat-aware (research round: beats are user-editable now): a preset only
    // matches when intensities AND beat frequencies are at their defaults.
    const matches = BAND_NAMES.every(
      (id) =>
        Math.abs(bands[id].intensity - presetBands[id].intensity) < 1 &&
        Math.abs(bands[id].beat - presetBands[id].beat) < 0.05,
    );
    if (matches) return name;
  }
  return 'Custom';
}