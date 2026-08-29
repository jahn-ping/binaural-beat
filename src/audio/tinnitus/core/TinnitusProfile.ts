export type Laterality = 'left' | 'right' | 'bilateral' | 'central' | 'unknown';

export interface TinnitusProfile {
  dominantPitchHz: number;
  pitchConfidence: 0 | 1 | 2 | 3;
  laterality: Laterality;
  loudnessMatchDb: number | null;
  mixingPointDb: number | null;
  notchWidthOctaves: number;
  notchDepthDb: number;
  crSpacingErb: number;
  soundSensitivity: 'low' | 'normal' | 'high' | 'hyperacusis';
  created: Date;
  lastUpdated: Date;
}

export const DEFAULT_PROFILE: TinnitusProfile = {
  dominantPitchHz: 4000,
  pitchConfidence: 0,
  laterality: 'unknown',
  loudnessMatchDb: null,
  mixingPointDb: null,
  notchWidthOctaves: 0.5,
  notchDepthDb: -18,
  crSpacingErb: 0.75,
  soundSensitivity: 'normal',
  created: new Date(),
  lastUpdated: new Date(),
};

const STORAGE_KEY = 'tinnitus-profile-v1';

export function loadProfile(): TinnitusProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...parsed, created: new Date(parsed.created), lastUpdated: new Date(parsed.lastUpdated) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: TinnitusProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, lastUpdated: new Date() }));
  } catch { /* non-fatal */ }
}
