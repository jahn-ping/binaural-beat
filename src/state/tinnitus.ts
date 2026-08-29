/**
 * Tinnitus support state — fully self-contained (own storage key, own defaults),
 * so the binaural/noise-gen settings in `settings.ts` are untouched.
 * Per the webQ-gauntlet tinnitus plan (P0.1 disclaimer, P1.1 mixing point).
 */

export type TinnitusNoiseType = 'white' | 'pink' | 'brown';
export type TinnitusMode = 'enrichment' | 'masking';

/**
 * Bump whenever safety-relevant defaults change (critique3 P0): users who
 * accepted an older version must see the notice again. v2 = −24 dB default.
 */
export const CURRENT_DISCLAIMER_VERSION = 2;

export interface TinnitusParams {
  /** Must acknowledge the health & safety disclaimer before controls unlock (P0.1). */
  disclaimerAcknowledged: boolean;
  /** Version of the disclaimer that was accepted (critique3 P0). */
  disclaimerVersion: number;
  /** Master on/off for the tinnitus engine (independent of the binaural transport). */
  enabled: boolean;
  /** enrichment = sound below the mixing point; masking = sound covering the tinnitus (P1.3). */
  mode: TinnitusMode;
  noiseType: TinnitusNoiseType;
  /** User level in dB (safe by default). Safety-capped further in the engine chain. */
  volumeDb: number;
  /** Calibrated mixing point (dB) from the wizard — null until calibrated (P1.1). */
  mixingPointDb: number | null;
  /** Enrichment is set this many dB BELOW the mixing point (P1.1). */
  enrichmentOffsetDb: number;
  /** Approximate tinnitus pitch in Hz — sound customization, not a diagnostic (P1.2). */
  pitchHz: number;
  /** Play the pure-tone pitch matcher (P1.2). */
  pitchMatcherEnabled: boolean;
  /** Notched sound — removes a band around the pitch (P1.4, EXPERIMENTAL). */
  notchEnabled: boolean;
  notchBandwidthHz: number;
  /** Slow amplitude swells on the noise layer (P1.5, relaxation). */
  breathingEnabled: boolean;
  breathingRateHz: number;
  /** Session timer in minutes; 0 = no timer (P0.3). */
  sessionMinutes: number;
}

export const TINNITUS_DISCLAIMER_TEXT = `
⚠️ HEALTH & SAFETY NOTICE

This application provides sound generation tools only. It is NOT a medical device.

• This app does NOT diagnose, treat, or cure tinnitus
• Consult an audiologist or ENT before starting any sound therapy
• Stop use immediately if you experience: dizziness, nausea, headache,
  perceived hearing decrease, or worsening tinnitus
• Keep playback at a comfortable, non-intrusive level — do not use at loud volumes
• If you have sudden hearing loss, pulsatile tinnitus, asymmetrical hearing loss,
  or significant vertigo, seek immediate medical attention
• Evidence for consumer sound therapies varies widely. Consistency of use
  (daily sessions) matters more than the specific sound type
• If under 18, use only with parent/guardian supervision

For persistent or bothersome tinnitus, consult a qualified healthcare professional.
`;

export const DEFAULT_TINNITUS: TinnitusParams = {
  disclaimerAcknowledged: false,
  disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
  enabled: false,
  mode: 'enrichment',
  noiseType: 'pink',
  volumeDb: -24, // audible under the −12 dB safety cap (≈ −36 dBFS), still comfortable
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

/** Enrichment level = mixing point − offset (softer than the blend point), clamped to the slider range. */
export const enrichmentLevelDb = (mixingPointDb: number | null, offsetDb: number): number =>
  mixingPointDb === null
    ? DEFAULT_TINNITUS.volumeDb
    : Math.max(-60, Math.min(0, mixingPointDb - offsetDb));

const STORAGE_KEY = 'binaural-tinnitus-v1';

const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

/** Load from localStorage; defensive merge so old stored states never lose new fields. */
export function loadTinnitusState(): TinnitusParams {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TINNITUS };
    const parsed = JSON.parse(raw) as Partial<TinnitusParams>;
    return {
      disclaimerAcknowledged: Boolean(parsed.disclaimerAcknowledged),
      // stored states without the field are treated as v1 -> the notice re-shows
      disclaimerVersion:
        typeof parsed.disclaimerVersion === 'number' && Number.isFinite(parsed.disclaimerVersion)
          ? parsed.disclaimerVersion
          : 1,
      enabled: Boolean(parsed.enabled),
      mode: parsed.mode === 'masking' ? 'masking' : 'enrichment',
      noiseType:
        parsed.noiseType === 'white' || parsed.noiseType === 'brown' ? parsed.noiseType : 'pink',
      volumeDb: clampNum(parsed.volumeDb, -60, 0, DEFAULT_TINNITUS.volumeDb),
      mixingPointDb:
        typeof parsed.mixingPointDb === 'number' && Number.isFinite(parsed.mixingPointDb)
          ? Math.max(-60, Math.min(0, parsed.mixingPointDb))
          : null,
      enrichmentOffsetDb: clampNum(parsed.enrichmentOffsetDb, 1, 30, DEFAULT_TINNITUS.enrichmentOffsetDb),
      pitchHz: clampNum(parsed.pitchHz, 100, 8000, DEFAULT_TINNITUS.pitchHz),
      pitchMatcherEnabled: Boolean(parsed.pitchMatcherEnabled),
      notchEnabled: Boolean(parsed.notchEnabled),
      notchBandwidthHz: clampNum(parsed.notchBandwidthHz, 25, 1000, DEFAULT_TINNITUS.notchBandwidthHz),
      breathingEnabled: Boolean(parsed.breathingEnabled),
      breathingRateHz: clampNum(parsed.breathingRateHz, 0.04, 0.2, DEFAULT_TINNITUS.breathingRateHz),
      sessionMinutes: clampNum(parsed.sessionMinutes, 0, 60, DEFAULT_TINNITUS.sessionMinutes),
    };
  } catch {
    return { ...DEFAULT_TINNITUS };
  }
}

export function saveTinnitusState(s: TinnitusParams): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Plain-language level label for non-technical users (critique3 P1). */
export const levelLabel = (volumeDb: number): 'Quiet' | 'Moderate' | 'Loud' =>
  volumeDb < -36 ? 'Quiet' : volumeDb <= -18 ? 'Moderate' : 'Loud';
