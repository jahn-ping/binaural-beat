import { describe, it, expect, beforeEach, vi } from 'vitest';
// Pure-logic tests: tone is only referenced inside class bodies that never run here.
vi.mock('tone', () => ({}));
import { defaultSettings, loadSettings, saveSettings, beatOf } from '../settings';

const STORAGE_KEY = 'binaural-settings-v1';
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  });
});

describe('loadSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.set(STORAGE_KEY, '{not json');
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('falls back to defaults on non-object JSON', () => {
    store.set(STORAGE_KEY, '"just a string"');
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('nested-merges old settings, filling new fields with defaults', () => {
    const old = {
      left: { freq: 200, volume: 0.4, fm: { rate: 5, depth: 1 }, am: { rate: 5, depth: 0 } },
      master: -6,
    };
    store.set(STORAGE_KEY, JSON.stringify(old));
    const s = loadSettings();
    expect(s.left.freq).toBe(200);
    expect(s.left.volume).toBe(0.4);
    expect(s.left.wave).toBe('sine'); // new field filled from defaults
    expect(s.left.detune).toBe(0); // new field filled from defaults
    expect(s.manualEnabled).toBe(true); // new field filled from defaults
    expect(s.master).toBe(-6);
    expect(s.noise.enabled).toBe(true);
    expect(s.noise.phase).toBe(0);
    expect(s.noise.filterGain).toBe(100);
    expect(s.noise.chorus.feedback).toBe(0);
    expect(s.noise.sweepMin).toBe(350);
  });

  it('preserves partial noise.chorus without losing the new feedback default', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({ noise: { color: 'white', chorus: { rate: 300, depth: 0.2, delay: 0.02, spread: 120 } } }),
    );
    const s = loadSettings();
    expect(s.noise.color).toBe('white');
    expect(s.noise.chorus.rate).toBe(300);
    expect(s.noise.chorus.spread).toBe(120);
    expect(s.noise.chorus.feedback).toBe(0);
  });

  it('preserves entrainment scalar fields while band map falls back to defaults', () => {
    store.set(STORAGE_KEY, JSON.stringify({ entrainment: { carrier: 200, preset: 'Alpha' } }));
    const s = loadSettings();
    expect(s.entrainment.carrier).toBe(200);
    expect(s.entrainment.preset).toBe('Alpha');
    expect(s.entrainment.bands.alpha.intensity).toBe(40); // Default mix, not Alpha
    expect(s.entrainment.bands.delta.intensity).toBe(40);
  });
});

describe('saveSettings roundtrip', () => {
  it('persists and reloads the new fields', () => {
    const s = defaultSettings();
    s.left.detune = 25;
    s.left.wave = 'triangle';
    s.noise.phase = 180;
    s.manualEnabled = false;
    saveSettings(s);
    const reloaded = loadSettings();
    expect(reloaded.left.detune).toBe(25);
    expect(reloaded.left.wave).toBe('triangle');
    expect(reloaded.noise.phase).toBe(180);
    expect(reloaded.manualEnabled).toBe(false);
  });
});

describe('beatOf with detune', () => {
  it('matches |L-R| when detune is 0', () => {
    const s = defaultSettings(); // 144 vs 151.51
    expect(beatOf(s)).toBeCloseTo(7.51, 2);
  });

  it('applies cents to the effective beat', () => {
    const s = defaultSettings();
    s.left.detune = 100; // +100 cents on the left carrier
    const leftEffective = 144 * Math.pow(2, 100 / 1200);
    expect(beatOf(s)).toBeCloseTo(Math.abs(leftEffective - 151.51), 2);
    expect(beatOf(s)).not.toBeCloseTo(7.51, 2);
  });
});
