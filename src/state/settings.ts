import type { EngineParams } from '../audio/engine';
import { PRESETS, DEFAULT_PRESET_ID } from '../audio/presets';
import {
  BAND_NAMES,
  defaultEntrainmentSettings,
  type BandMap,
  type EntrainmentSettings,
} from '../audio/entrainment';

const STORAGE_KEY = 'binaural-settings-v1';

/** Full app settings: engine params + UI-only state. */
export interface Settings extends EngineParams {
  linkedMode: boolean;
  timerMinutes: number; // 0 = off
  headphonesDismissed: boolean;
  scheduleElapsedMs: number; // persisted schedule progress (P2 — resume after reload)
}

const defaultNoise = (): EngineParams['noise'] => ({
  enabled: true,
  color: 'pink',
  volume: -36, // dB
  filterGain: 100, // 0..100 (reference control)
  phase: 0, // sweep LFO start phase (0-360)
  sweepMin: 350,
  sweepMax: 1350,
  q: 1,
  lfoRate: 0.1,
  chorus: { rate: 200, depth: 0.5, delay: 0, spread: 90, feedback: 0 },
  reverb: { decay: 6, wet: 1 },
});

const defaultChannel = (freq: number): EngineParams['left'] => ({
  freq,
  volume: 0.5,
  wave: 'sine',
  detune: 0,
  fm: { rate: 7.51, depth: 0 },
  am: { rate: 7.51, depth: 0 },
});

const mergeEntrainment = (p?: Partial<EntrainmentSettings>): EntrainmentSettings => {
  const base = defaultEntrainmentSettings();
  const bands = Object.fromEntries(
    BAND_NAMES.map((id) => [
      id,
      {
        intensity:
          typeof p?.bands?.[id]?.intensity === 'number' ? p.bands[id].intensity : base.bands[id].intensity,
        beat: typeof p?.bands?.[id]?.beat === 'number' ? p.bands[id].beat : base.bands[id].beat,
      },
    ]),
  ) as BandMap;
  return {
    enabled: p?.enabled ?? base.enabled,
    carrier: typeof p?.carrier === 'number' ? p.carrier : base.carrier,
    preset: p?.preset ?? base.preset,
    schedule: p?.schedule ?? base.schedule,
    bands,
  };
};

export const defaultSettings = (): Settings => ({
  left: defaultChannel(144),
  right: defaultChannel(151.51),
  master: -12, // dB, safe default (spec: master-volume)
  manualEnabled: true,
  noise: defaultNoise(),
  entrainment: defaultEntrainmentSettings(),
  linkedMode: false,
  timerMinutes: 0,
  headphonesDismissed: false,
  scheduleElapsedMs: 0,
});

/** Load from localStorage; fall back to defaults on absent/invalid JSON (spec: session-presets). */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const base = defaultSettings();
    // Merge defensively with nested merges (old stored settings lack the new
    // wave/detune/enabled/filterGain/feedback fields — defaults fill them in).
    return {
      left: { ...base.left, ...parsed.left },
      right: { ...base.right, ...parsed.right },
      master: typeof parsed.master === 'number' ? parsed.master : base.master,
      manualEnabled: typeof parsed.manualEnabled === 'boolean' ? parsed.manualEnabled : base.manualEnabled,
      noise: {
        ...base.noise,
        ...parsed.noise,
        chorus: { ...base.noise.chorus, ...parsed.noise?.chorus },
        reverb: { ...base.noise.reverb, ...parsed.noise?.reverb },
      },
      entrainment: mergeEntrainment(parsed.entrainment),
      linkedMode: Boolean(parsed.linkedMode),
      timerMinutes: Number.isFinite(parsed.timerMinutes) ? Number(parsed.timerMinutes) : 0,
      headphonesDismissed: Boolean(parsed.headphonesDismissed),
      scheduleElapsedMs:
        typeof parsed.scheduleElapsedMs === 'number' && Number.isFinite(parsed.scheduleElapsedMs)
          ? parsed.scheduleElapsedMs
          : 0,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Effective frequency after detune (cents -> ratio 2^(c/1200)). */
const effectiveFreq = (freq: number, detune: number): number => freq * Math.pow(2, detune / 1200);

/** Beat frequency |L − R| for the UI, detune-aware (critique R2 P1-3; derived, never stored). */
export const beatOf = (s: Settings): number =>
  Math.abs(effectiveFreq(s.left.freq, s.left.detune) - effectiveFreq(s.right.freq, s.right.detune));

/** Apply a preset's carriers to settings (click-free ramps happen in engine diff). */
export function applyPreset(s: Settings, presetId: string): Settings {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
  return { ...s, left: { ...preset.left }, right: { ...preset.right } };
}