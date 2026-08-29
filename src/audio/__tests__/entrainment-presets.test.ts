import { describe, it, expect, vi } from 'vitest';
// Pure-logic tests — Tone classes are only constructed inside methods never called here.
vi.mock('tone', () => ({}));
import { ENTRAINMENT_MAX_GAIN, BAND_NAMES, defaultEntrainmentSettings, intensityToGain } from '../entrainment';
import {
  applyEntrainmentPreset,
  detectEntrainmentPreset,
  ENTRAINMENT_PRESETS,
  ENTRAINMENT_PRESET_NAMES,
} from '../presets';

describe('intensityToGain', () => {
  it('maps 100 to the max cap', () => {
    expect(intensityToGain(100)).toBe(ENTRAINMENT_MAX_GAIN);
  });

  it('clamps negatives to 0', () => {
    expect(intensityToGain(-5)).toBe(0);
  });

  it('clamps above 100 to the cap', () => {
    expect(intensityToGain(150)).toBe(ENTRAINMENT_MAX_GAIN);
  });

  it('half intensity is half gain', () => {
    expect(intensityToGain(50)).toBeCloseTo(ENTRAINMENT_MAX_GAIN / 2);
  });

  it('five bands at 100 cannot exceed the mixer ceiling', () => {
    // 5 bands * 0.12 = 0.6 < 1.0 headroom even before the 0.85 safety gain
    expect(5 * intensityToGain(100)).toBeLessThan(1);
  });
});

describe('detectEntrainmentPreset', () => {
  it('detects the Default mix', () => {
    expect(detectEntrainmentPreset(ENTRAINMENT_PRESETS.Default)).toBe('Default');
  });

  it('detects single-band presets', () => {
    expect(detectEntrainmentPreset(ENTRAINMENT_PRESETS.Alpha)).toBe('Alpha');
    expect(detectEntrainmentPreset(ENTRAINMENT_PRESETS.Gamma)).toBe('Gamma');
  });

  it('returns Custom when a band diverges', () => {
    const bands = { ...ENTRAINMENT_PRESETS.Default };
    bands.alpha = { ...bands.alpha, intensity: 55 };
    expect(detectEntrainmentPreset(bands)).toBe('Custom');
  });

  it('returns Custom when a beat frequency is edited (beats are user-editable)', () => {
    const bands = { ...ENTRAINMENT_PRESETS.Default };
    bands.theta = { ...bands.theta, beat: 6.5 };
    expect(detectEntrainmentPreset(bands)).toBe('Custom');
  });

  it('still detects a preset within beat rounding tolerance', () => {
    const bands = { ...ENTRAINMENT_PRESETS.Default };
    bands.alpha = { ...bands.alpha, beat: bands.alpha.beat + 0.01 };
    expect(detectEntrainmentPreset(bands)).toBe('Default');
  });
});

describe('applyEntrainmentPreset', () => {
  it('replaces bands and stamps the preset name', () => {
    const s = defaultEntrainmentSettings();
    const out = applyEntrainmentPreset(s, 'Theta');
    expect(out.preset).toBe('Theta');
    expect(out.bands.theta.intensity).toBe(100);
    expect(out.bands.alpha.intensity).toBe(0);
  });

  it('Custom is a no-op (returns the same object)', () => {
    const s = defaultEntrainmentSettings();
    expect(applyEntrainmentPreset(s, 'Custom')).toBe(s);
  });
});

describe('preset catalogue invariants', () => {
  it('covers all five bands in every preset', () => {
    for (const bands of Object.values(ENTRAINMENT_PRESETS)) {
      for (const id of BAND_NAMES) {
        expect(bands[id]).toBeDefined();
      }
    }
  });

  it('ENTRAINMENT_PRESET_NAMES includes every key plus Custom', () => {
    const presetNames = new Set<string>(ENTRAINMENT_PRESET_NAMES);
    expect(presetNames.has('Custom')).toBe(true);
    for (const name of Object.keys(ENTRAINMENT_PRESETS)) {
      expect(presetNames.has(name)).toBe(true);
    }
  });
});
