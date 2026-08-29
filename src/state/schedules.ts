import type { BandMap, BandName } from '../audio/entrainment';
import { BAND_NAMES } from '../audio/entrainment';

export interface ScheduleStage {
  startSeconds: number;
  durationSeconds: number;
  targetIntensities: Partial<Record<BandName, number>>;
}

export interface ScheduleDefinition {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  stages: ScheduleStage[];
}

/** WebQ-synthesized staged intensity timelines. */
export const SCHEDULES: Record<string, ScheduleDefinition> = {
  'deep-sleep': {
    id: 'deep-sleep',
    name: 'Deep Sleep',
    description: 'Alpha → Theta → Delta over 30 minutes',
    durationMinutes: 30,
    stages: [
      { startSeconds: 0, durationSeconds: 300, targetIntensities: { alpha: 80, theta: 40 } },
      { startSeconds: 300, durationSeconds: 600, targetIntensities: { theta: 80, delta: 20 } },
      { startSeconds: 900, durationSeconds: 900, targetIntensities: { delta: 100 } },
    ],
  },
  'deep-focus': {
    id: 'deep-focus',
    name: 'Deep Focus',
    description: 'Beta-Alpha mix for concentration',
    durationMinutes: 25,
    stages: [
      { startSeconds: 0, durationSeconds: 300, targetIntensities: { beta: 60, alpha: 40 } },
      { startSeconds: 300, durationSeconds: 600, targetIntensities: { beta: 80, alpha: 20 } },
      { startSeconds: 900, durationSeconds: 600, targetIntensities: { beta: 40, alpha: 60 } },
    ],
  },
};

export const SCHEDULE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: 'No Schedule' },
  ...Object.values(SCHEDULES).map((s) => ({ id: s.id, label: s.name })),
];

/**
 * Band intensities at time t (seconds) for a schedule, linearly interpolating
 * between the previous stage's targets and the current stage's target, seeded
 * from `startBands` for the first stage.
 */
export function scheduleTargetsAt(def: ScheduleDefinition, t: number, startBands: BandMap): BandMap {
  const stageIdx = def.stages.findIndex((s) => s.startSeconds + s.durationSeconds > t);
  const idx = stageIdx === -1 ? def.stages.length - 1 : stageIdx;

  // Walk stages 0..idx carrying the *effective* band values forward, so a band
  // that holds a target through a stage (alpha 80 in deep-sleep stage 1) does
  // not snap back to its original start value when a later stage omits it.
  let current: BandMap = startBands;
  for (let i = 0; i <= idx; i++) {
    const stage = def.stages[i];
    const progress = i === idx ? clamp01((t - stage.startSeconds) / stage.durationSeconds) : 1;
    const out = {} as BandMap;
    BAND_NAMES.forEach((id) => {
      const from = current[id].intensity;
      const to = stage.targetIntensities[id] ?? from;
      out[id] = { intensity: Math.round(from + (to - from) * progress), beat: startBands[id].beat };
    });
    current = out;
  }
  return current;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
