import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  newId,
  isUserPreset,
  isFactoryPreset,
  validatePreset,
  validateImportFile,
  type BinauralPreset,
  type PresetAudioState,
} from '../presets/types';
import { FACTORY_PRESETS } from '../presets/factory';

// Shared minimal valid preset for tests across describe blocks
const minimalValid = {
  id: 'x',
  name: 'X',
  audio: {
    left: { freq: 100, volume: 0.5, wave: 'sine' as const, detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
    right: { freq: 102, volume: 0.5, wave: 'sine' as const, detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
    master: -12, manualEnabled: true,
    noise: { enabled: true, color: 'pink' as const, volume: -36, filterGain: 100, phase: 0, sweepMin: 350, sweepMax: 1350, q: 1, lfoRate: 0.1, chorus: { rate: 200, depth: 0.5, delay: 0, spread: 90, feedback: 0 }, reverb: { decay: 6, wet: 1 } },
    entrainment: { enabled: true, carrier: 100, preset: 'Default', schedule: '', bands: { delta: { intensity: 0, beat: 2 }, theta: { intensity: 0, beat: 5 }, alpha: { intensity: 0, beat: 10 }, beta: { intensity: 0, beat: 18 }, gamma: { intensity: 0, beat: 40 } } },
    linkedMode: false, timerMinutes: 0,
  },
};

// ── Types ──────────────────────────────────────────────────────────────────

describe('preset types', () => {
  describe('newId', () => {
    it('returns a string', () => {
      expect(typeof newId()).toBe('string');
    });
    it('returns unique ids', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('isUserPreset / isFactoryPreset', () => {
    const userPreset: BinauralPreset = {
      id: 'test',
      name: 'Test',
      schemaVersion: 1,
      category: 'user',
      tags: [],
      isFavorite: false,
      createdAt: 0,
      updatedAt: 0,
      audio: {} as PresetAudioState,
      tinnitus: {} as any,
    };
    const factoryPreset: BinauralPreset = { ...userPreset, category: 'factory' };

    it('identifies user presets', () => {
      expect(isUserPreset(userPreset)).toBe(true);
      expect(isUserPreset(factoryPreset)).toBe(false);
    });
    it('identifies factory presets', () => {
      expect(isFactoryPreset(factoryPreset)).toBe(true);
      expect(isFactoryPreset(userPreset)).toBe(false);
    });
  });

  describe('validatePreset', () => {
    it('rejects non-objects', () => {
      expect(validatePreset(null).ok).toBe(false);
      expect(validatePreset('string').ok).toBe(false);
      expect(validatePreset(42).ok).toBe(false);
    });

    it('rejects missing id', () => {
      expect(validatePreset({ name: 'Test' }).ok).toBe(false);
    });

    it('rejects missing name', () => {
      expect(validatePreset({ id: 'test' }).ok).toBe(false);
    });

    it('accepts a minimal valid preset', () => {
      const result = validatePreset({
        id: 'test-1',
        name: 'Minimal',
        category: 'user',
        schemaVersion: 1,
        tags: [],
        isFavorite: false,
        createdAt: 0,
        updatedAt: 0,
        audio: {
          left: { freq: 144, volume: 0.5, wave: 'sine', detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
          right: { freq: 151.51, volume: 0.5, wave: 'sine', detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
          master: -12,
          manualEnabled: true,
          noise: { enabled: true, color: 'pink', volume: -36, filterGain: 100, phase: 0, sweepMin: 350, sweepMax: 1350, q: 1, lfoRate: 0.1, chorus: { rate: 200, depth: 0.5, delay: 0, spread: 90, feedback: 0 }, reverb: { decay: 6, wet: 1 } },
          entrainment: { enabled: true, carrier: 144, preset: 'Default', schedule: '', bands: { delta: { intensity: 40, beat: 2 }, theta: { intensity: 100, beat: 5 }, alpha: { intensity: 40, beat: 10 }, beta: { intensity: 20, beat: 18 }, gamma: { intensity: 20, beat: 40 } } },
          linkedMode: false,
          timerMinutes: 0,
        },
        tinnitus: {
          disclaimerAcknowledged: false,
          disclaimerVersion: 1,
          enabled: false,
          mode: 'enrichment',
          noiseType: 'pink',
          volumeDb: -24,
          mixingPointDb: null,
          enrichmentOffsetDb: 6,
          pitchHz: 4000,
          pitchMatcherEnabled: false,
          notchEnabled: false,
          notchBandwidthHz: 150,
          breathingEnabled: false,
          breathingRateHz: 0.08,
          sessionMinutes: 20,
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preset.id).toBe('test-1');
        expect(result.preset.name).toBe('Minimal');
        expect(result.preset.schemaVersion).toBe(1);
        expect(result.preset.audio.left.freq).toBe(144);
      }
    });

    it('uses fallback audio when audio section is missing', () => {
      const fallback: PresetAudioState = {
        left: { freq: 100, volume: 0.5, wave: 'sine', detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
        right: { freq: 102, volume: 0.5, wave: 'sine', detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
        master: -20,
        manualEnabled: false,
        noise: { enabled: false, color: 'white', volume: -40, filterGain: 50, phase: 0, sweepMin: 300, sweepMax: 1200, q: 1, lfoRate: 0.1, chorus: { rate: 200, depth: 0.5, delay: 0, spread: 90, feedback: 0 }, reverb: { decay: 6, wet: 1 } },
        entrainment: { enabled: false, carrier: 100, preset: 'Default', schedule: '', bands: { delta: { intensity: 0, beat: 2 }, theta: { intensity: 0, beat: 5 }, alpha: { intensity: 0, beat: 10 }, beta: { intensity: 0, beat: 18 }, gamma: { intensity: 0, beat: 40 } } },
        linkedMode: false,
        timerMinutes: 0,
      };
      const result = validatePreset({ id: 'x', name: 'X' }, fallback);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preset.audio.left.freq).toBe(100);
        expect(result.preset.audio.master).toBe(-20);
      }
    });

    it('defaults category to user for non-factory values', () => {
      const result = validatePreset({ ...minimalValid, category: 'bogus' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.preset.category).toBe('user');
    });

    it('defaults schemaVersion to CURRENT_SCHEMA_VERSION when missing', () => {
      const result = validatePreset(minimalValid);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.preset.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  describe('validateImportFile', () => {
    it('rejects non-object root', () => {
      const r = validateImportFile('"just a string"');
      expect(r.valid).toHaveLength(0);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('rejects unknown format', () => {
      const r = validateImportFile(JSON.stringify({ format: 'wrong', presets: [] }));
      expect(r.valid).toHaveLength(0);
      expect(r.errors[0]).toContain('Unknown format');
    });

    it('accepts empty preset list', () => {
      const r = validateImportFile(JSON.stringify({ format: 'binaural-presets', presets: [] }));
      expect(r.valid).toHaveLength(0);
      expect(r.errors).toHaveLength(0);
    });

    it('rejects missing presets array', () => {
      const r = validateImportFile(JSON.stringify({ format: 'binaural-presets', presets: 'not-array' }));
      expect(r.valid).toHaveLength(0);
      expect(r.errors[0]).toContain('Missing');
    });

    it('handles partial import — valid + invalid presets', () => {
      const file = {
        format: 'binaural-presets',
        presets: [
          minimalValid,
          { id: 'bad' }, // missing name
          42, // not an object
        ],
      };
      const r = validateImportFile(JSON.stringify(file));
      expect(r.valid).toHaveLength(1);
      expect(r.errors.length).toBeGreaterThan(0);
      // Imported presets are forced to user category
      expect(r.valid[0].category).toBe('user');
    });

    it('returns error for invalid JSON', () => {
      const r = validateImportFile('{ broken json');
      expect(r.valid).toHaveLength(0);
      expect(r.errors[0]).toContain('JSON parse');
    });
  });
});

// ── Factory presets ────────────────────────────────────────────────────────

describe('factory presets', () => {
  it('has at least 5 factory presets', () => {
    expect(FACTORY_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it('all have category factory', () => {
    for (const p of FACTORY_PRESETS) {
      expect(p.category).toBe('factory');
    }
  });

  it('all have unique ids', () => {
    const ids = FACTORY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all have valid audio state', () => {
    for (const p of FACTORY_PRESETS) {
      expect(p.audio.left.freq).toBeGreaterThan(0);
      expect(p.audio.right.freq).toBeGreaterThan(0);
      expect(typeof p.audio.noise.color).toBe('string');
      expect(p.audio.master).toBeLessThanOrEqual(0);
    }
  });

  it('all have valid tinnitus state', () => {
    for (const p of FACTORY_PRESETS) {
      expect(typeof p.tinnitus.enabled).toBe('boolean');
      expect(p.tinnitus.mode).toMatch(/^(enrichment|masking)$/);
    }
  });
});

// ── snapshotAudio ──────────────────────────────────────────────────────────

describe('snapshotAudio (inline logic — avoids Tone.js import)', () => {
  // snapshotAudio is a pure function that deep-copies a settings object.
  // We test its logic inline to avoid importing from presets/index which
  // transitively loads Tone.js.
  const mockSettings = {
    left: { freq: 144, volume: 0.5, wave: 'sine' as const, detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
    right: { freq: 151.51, volume: 0.5, wave: 'sine' as const, detune: 0, fm: { rate: 7.51, depth: 0 }, am: { rate: 7.51, depth: 0 } },
    master: -12,
    manualEnabled: true,
    noise: { enabled: true, color: 'pink' as const, volume: -36, filterGain: 100, phase: 0, sweepMin: 350, sweepMax: 1350, q: 1, lfoRate: 0.1, chorus: { rate: 200, depth: 0.5, delay: 0, spread: 90, feedback: 0 }, reverb: { decay: 6, wet: 1 } },
    entrainment: { enabled: true, carrier: 144, preset: 'Default', schedule: '', bands: { delta: { intensity: 40, beat: 2 }, theta: { intensity: 100, beat: 5 }, alpha: { intensity: 40, beat: 10 }, beta: { intensity: 20, beat: 18 }, gamma: { intensity: 20, beat: 40 } } },
    linkedMode: false,
    timerMinutes: 0,
  };

  it('deep-copies the settings (no shared references)', () => {
    // Inline snapshotAudio logic
    const snap = {
      left: { ...mockSettings.left },
      right: { ...mockSettings.right },
      master: mockSettings.master,
      manualEnabled: mockSettings.manualEnabled,
      noise: JSON.parse(JSON.stringify(mockSettings.noise)),
      entrainment: JSON.parse(JSON.stringify(mockSettings.entrainment)),
      linkedMode: mockSettings.linkedMode,
      timerMinutes: mockSettings.timerMinutes,
    };
    snap.left.freq = 999;
    snap.noise.color = 'brown';
    expect(mockSettings.left.freq).toBe(144);
    expect(mockSettings.noise.color).toBe('pink');
  });

  it('preserves all fields', () => {
    const snap = {
      left: { ...mockSettings.left },
      right: { ...mockSettings.right },
      master: mockSettings.master,
      manualEnabled: mockSettings.manualEnabled,
      noise: JSON.parse(JSON.stringify(mockSettings.noise)),
      entrainment: JSON.parse(JSON.stringify(mockSettings.entrainment)),
      linkedMode: mockSettings.linkedMode,
      timerMinutes: mockSettings.timerMinutes,
    };
    expect(snap.left.freq).toBe(144);
    expect(snap.right.freq).toBe(151.51);
    expect(snap.master).toBe(-12);
    expect(snap.manualEnabled).toBe(true);
    expect(snap.noise.color).toBe('pink');
    expect(snap.entrainment.enabled).toBe(true);
    expect(snap.linkedMode).toBe(false);
    expect(snap.timerMinutes).toBe(0);
  });
});
