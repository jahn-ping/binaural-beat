/**
 * Settings preset — a fully serializable snapshot of all app audio parameters.
 * Carrier + beat frequencies stored as source of truth (not L/R independently —
 * per webQ-gauntlet consensus on preventing desync bugs).
 *
 * Schema-versioned for forward-compatible migrations.
 */

import type { EngineParams } from '../../audio/engine';
import type { EntrainmentSettings } from '../../audio/entrainment';
import type { TinnitusParams } from '../tinnitus';

export const CURRENT_SCHEMA_VERSION = 1;

// ── Sub-snapshots ──────────────────────────────────────────────────────────

/** Everything needed to recreate the binaural + noise + entrainment engine state. */
export interface PresetAudioState {
  left: EngineParams['left'];
  right: EngineParams['right'];
  master: number;
  manualEnabled: boolean;
  noise: EngineParams['noise'];
  entrainment: EntrainmentSettings;
  linkedMode: boolean;
  timerMinutes: number;
}

/** Full preset: audio state + tinnitus state + metadata. */
export interface BinauralPreset {
  id: string;
  name: string;
  schemaVersion: number;
  category: 'factory' | 'user';
  tags: string[];
  isFavorite: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  audio: PresetAudioState;
  tinnitus: TinnitusParams;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate a UUID (crypto.randomUUID in modern browsers, fallback for older ones). */
export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Shorthand: is this a user-created preset? */
export const isUserPreset = (p: BinauralPreset): boolean => p.category === 'user';

/** Shorthand: is this a factory preset? */
export const isFactoryPreset = (p: BinauralPreset): boolean => p.category === 'factory';

// ── Import / Export types ─────────────────────────────────────────────────

/** The shape of a JSON file when importing presets. */
export interface PresetExportFile {
  format: 'binaural-presets';
  version: number;
  presets: BinauralPreset[];
}

/** Result of validating an import file. */
export interface PresetImportResult {
  valid: BinauralPreset[];
  errors: string[];
}

// ── Validation (runtime guards, no Zod needed) ────────────────────────────

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isStr = (v: unknown): v is string => typeof v === 'string';

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate a raw JSON object as a BinauralPreset.
 * Returns a cleaned preset on success, or null + error string.
 * Missing/invalid fields fall back to sane defaults rather than rejecting.
 */
export function validatePreset(
  raw: unknown,
  fallbackAudio?: PresetAudioState,
  fallbackTinnitus?: TinnitusParams,
): { ok: true; preset: BinauralPreset } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: 'Not an object' };

  const o = raw as Record<string, unknown>;

  // Required string fields
  if (!isStr(o.id)) return { ok: false, error: 'Missing or invalid "id"' };
  if (!isStr(o.name)) return { ok: false, error: 'Missing or invalid "name"' };

  const category = o.category === 'factory' ? 'factory' : 'user';
  const schemaVersion = isNum(o.schemaVersion)
    ? o.schemaVersion
    : CURRENT_SCHEMA_VERSION;
  const tags = Array.isArray(o.tags) ? o.tags.filter(isStr) : [];
  const isFavorite = isBool(o.isFavorite) ? o.isFavorite : false;
  const createdAt = isNum(o.createdAt) ? o.createdAt : Date.now();
  const updatedAt = isNum(o.updatedAt) ? o.updatedAt : createdAt;

  // Audio snapshot — merge with fallbacks for missing fields
  let audio: PresetAudioState;
  if (isObj(o.audio)) {
    const a = o.audio as Record<string, unknown>;
    const fa = fallbackAudio;
    audio = {
      left: (isObj(a.left) ? a.left : fa?.left) as PresetAudioState['left'],
      right: (isObj(a.right) ? a.right : fa?.right) as PresetAudioState['right'],
      master: isNum(a.master) ? a.master : (fa?.master ?? -12),
      manualEnabled: isBool(a.manualEnabled) ? a.manualEnabled : (fa?.manualEnabled ?? true),
      noise: (isObj(a.noise) ? a.noise : fa?.noise) as PresetAudioState['noise'],
      entrainment: (isObj(a.entrainment) ? a.entrainment : fa?.entrainment) as PresetAudioState['entrainment'],
      linkedMode: isBool(a.linkedMode) ? a.linkedMode : (fa?.linkedMode ?? false),
      timerMinutes: isNum(a.timerMinutes) ? a.timerMinutes : (fa?.timerMinutes ?? 0),
    };
  } else if (fallbackAudio) {
    audio = fallbackAudio;
  } else {
    return { ok: false, error: 'Missing "audio" section and no fallback' };
  }

  // Tinnitus snapshot — merge with fallbacks
  let tinnitus: TinnitusParams;
  if (isObj(o.tinnitus)) {
    const t = o.tinnitus as Record<string, unknown>;
    const ft = fallbackTinnitus;
    tinnitus = {
      disclaimerAcknowledged: isBool(t.disclaimerAcknowledged) ? t.disclaimerAcknowledged : (ft?.disclaimerAcknowledged ?? false),
      disclaimerVersion: isNum(t.disclaimerVersion) ? t.disclaimerVersion : (ft?.disclaimerVersion ?? 1),
      enabled: isBool(t.enabled) ? t.enabled : (ft?.enabled ?? false),
      mode: (t.mode === 'masking' ? 'masking' : 'enrichment') as 'enrichment' | 'masking',
      noiseType: (t.noiseType === 'white' || t.noiseType === 'brown' ? t.noiseType : 'pink') as 'white' | 'pink' | 'brown',
      volumeDb: isNum(t.volumeDb) ? t.volumeDb : (ft?.volumeDb ?? -24),
      mixingPointDb: isNum(t.mixingPointDb) ? t.mixingPointDb : (ft?.mixingPointDb ?? null),
      enrichmentOffsetDb: isNum(t.enrichmentOffsetDb) ? t.enrichmentOffsetDb : (ft?.enrichmentOffsetDb ?? 6),
      pitchHz: isNum(t.pitchHz) ? t.pitchHz : (ft?.pitchHz ?? 4000),
      pitchMatcherEnabled: isBool(t.pitchMatcherEnabled) ? t.pitchMatcherEnabled : (ft?.pitchMatcherEnabled ?? false),
      notchEnabled: isBool(t.notchEnabled) ? t.notchEnabled : (ft?.notchEnabled ?? false),
      notchBandwidthHz: isNum(t.notchBandwidthHz) ? t.notchBandwidthHz : (ft?.notchBandwidthHz ?? 150),
      breathingEnabled: isBool(t.breathingEnabled) ? t.breathingEnabled : (ft?.breathingEnabled ?? false),
      breathingRateHz: isNum(t.breathingRateHz) ? t.breathingRateHz : (ft?.breathingRateHz ?? 0.08),
      sessionMinutes: isNum(t.sessionMinutes) ? t.sessionMinutes : (ft?.sessionMinutes ?? 20),
    };
  } else if (fallbackTinnitus) {
    tinnitus = fallbackTinnitus;
  } else {
    // No tinnitus state stored — use defaults
    tinnitus = {
      disclaimerAcknowledged: false,
      disclaimerVersion: CURRENT_SCHEMA_VERSION,
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
    };
  }

  return {
    ok: true,
    preset: {
      id: o.id as string,
      name: o.name as string,
      schemaVersion,
      category,
      tags,
      isFavorite,
      createdAt,
      updatedAt,
      audio,
      tinnitus,
    },
  };
}

/**
 * Validate an imported JSON file containing one or more presets.
 * Returns { valid, errors } — partial imports succeed (bad presets are skipped with errors).
 */
export function validateImportFile(
  json: string,
  fallbackAudio?: PresetAudioState,
  fallbackTinnitus?: TinnitusParams,
): PresetImportResult {
  try {
    const data = JSON.parse(json) as unknown;
    if (!isObj(data)) return { valid: [], errors: ['File is not a JSON object'] };

    const o = data as Record<string, unknown>;
    if (o.format !== 'binaural-presets') {
      return { valid: [], errors: [`Unknown format "${o.format}" — expected "binaural-presets"`] };
    }

    if (!Array.isArray(o.presets)) {
      return { valid: [], errors: ['Missing or invalid "presets" array'] };
    }

    const valid: BinauralPreset[] = [];
    const errors: string[] = [];

    for (let i = 0; i < o.presets.length; i++) {
      const result = validatePreset(o.presets[i], fallbackAudio, fallbackTinnitus);
      if (result.ok) {
        // Force imported presets to be user category
        valid.push({ ...result.preset, category: 'user', updatedAt: Date.now() });
      } else {
        errors.push(`Preset ${i + 1}: ${result.error}`);
      }
    }

    return { valid, errors };
  } catch (e) {
    return { valid: [], errors: [`JSON parse error: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
