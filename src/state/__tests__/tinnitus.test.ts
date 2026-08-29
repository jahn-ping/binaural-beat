import { describe, it, expect, beforeEach, vi } from 'vitest';
// Pure-logic tests: tone is only referenced inside class bodies that never run here.
vi.mock('tone', () => ({}));
import {
  CURRENT_DISCLAIMER_VERSION,
  DEFAULT_TINNITUS,
  TINNITUS_DISCLAIMER_TEXT,
  enrichmentLevelDb,
  levelLabel,
  loadTinnitusState,
  saveTinnitusState,
} from '../tinnitus';

const STORAGE_KEY = 'binaural-tinnitus-v1';
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

describe('loadTinnitusState', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadTinnitusState()).toEqual(DEFAULT_TINNITUS);
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.set(STORAGE_KEY, '{not json');
    expect(loadTinnitusState()).toEqual(DEFAULT_TINNITUS);
  });

  it('nested-merges old partial state, filling new fields with defaults', () => {
    store.set(STORAGE_KEY, JSON.stringify({ disclaimerAcknowledged: true, volumeDb: -30, pitchHz: 3000 }));
    const s = loadTinnitusState();
    expect(s.disclaimerAcknowledged).toBe(true);
    expect(s.volumeDb).toBe(-30);
    expect(s.pitchHz).toBe(3000);
    expect(s.noiseType).toBe('pink'); // default
    expect(s.notchEnabled).toBe(false); // default
    expect(s.sessionMinutes).toBe(20); // default
  });

  it('clamps out-of-range values', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({ volumeDb: 40, pitchHz: 90000, notchBandwidthHz: -5, breathingRateHz: 5 }),
    );
    const s = loadTinnitusState();
    expect(s.volumeDb).toBe(0);
    expect(s.pitchHz).toBe(8000);
    expect(s.notchBandwidthHz).toBe(25);
    expect(s.breathingRateHz).toBe(0.2);
  });

  it('accepts only valid modes and noise types', () => {
    store.set(STORAGE_KEY, JSON.stringify({ mode: 'bogus', noiseType: 'red' }));
    const s = loadTinnitusState();
    expect(s.mode).toBe('enrichment');
    expect(s.noiseType).toBe('pink');
  });
});

describe('saveTinnitusState roundtrip', () => {
  it('persists and reloads', () => {
    const s = { ...DEFAULT_TINNITUS, disclaimerAcknowledged: true, enabled: true, mixingPointDb: -30 };
    saveTinnitusState(s);
    const reloaded = loadTinnitusState();
    expect(reloaded.disclaimerAcknowledged).toBe(true);
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.mixingPointDb).toBe(-30);
  });
});

describe('enrichmentLevelDb', () => {
  it('is mixing point minus offset when calibrated', () => {
    expect(enrichmentLevelDb(-30, 6)).toBe(-36);
    expect(enrichmentLevelDb(-24, 6)).toBe(-30);
  });

  it('clamps to the slider range', () => {
    expect(enrichmentLevelDb(-10, 6)).toBe(-16);
    expect(enrichmentLevelDb(-55, 6)).toBe(-60); // floor
    expect(enrichmentLevelDb(10, 6)).toBe(0); // ceiling
  });

  it('falls back to the default level when uncalibrated', () => {
    expect(enrichmentLevelDb(null, 6)).toBe(DEFAULT_TINNITUS.volumeDb);
  });
});

describe('disclaimer', () => {
  it('exists and covers the mandatory safety points', () => {
    expect(TINNITUS_DISCLAIMER_TEXT.length).toBeGreaterThan(200);
    expect(TINNITUS_DISCLAIMER_TEXT).toContain('NOT a medical device');
    expect(TINNITUS_DISCLAIMER_TEXT).toContain('audiologist');
    expect(TINNITUS_DISCLAIMER_TEXT).toContain('Stop use immediately');
  });

  it('defaults carry the current version, so fresh users accept the latest notice', () => {
    expect(DEFAULT_TINNITUS.disclaimerVersion).toBe(CURRENT_DISCLAIMER_VERSION);
  });

  it('old stored states without a version are treated as v1, so a version bump re-shows the notice', () => {
    store.set(STORAGE_KEY, JSON.stringify({ disclaimerAcknowledged: true }));
    const s = loadTinnitusState();
    expect(s.disclaimerAcknowledged).toBe(true);
    expect(s.disclaimerVersion).toBe(1);
    expect(s.disclaimerVersion).toBeLessThan(CURRENT_DISCLAIMER_VERSION);
  });
});

describe('levelLabel', () => {
  it('classifies levels in plain language', () => {
    expect(levelLabel(-40)).toBe('Quiet');
    expect(levelLabel(-30)).toBe('Moderate');
    expect(levelLabel(-10)).toBe('Loud');
    expect(levelLabel(-36)).toBe('Moderate');
  });
});
