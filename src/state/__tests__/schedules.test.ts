import { describe, it, expect, vi } from 'vitest';
// tone is referenced only inside entrainment class bodies — never constructed here.
vi.mock('tone', () => ({}));
import { SCHEDULES, scheduleTargetsAt } from '../schedules';
import { defaultEntrainmentSettings } from '../../audio/entrainment';

const startBands = defaultEntrainmentSettings().bands;

// deep-sleep stages:
//   0-300:    alpha 80, theta 40            (from startBands)
//   300-900:  theta 80, delta 20            (alpha holds 80)
//   900-1800: delta 100                     (theta holds 80, alpha holds 80)
describe('scheduleTargetsAt — deep-sleep', () => {
  const def = SCHEDULES['deep-sleep'];

  it('starts from the current bands at t=0 (crossfade begins at your values)', () => {
    const out = scheduleTargetsAt(def, 0, startBands);
    expect(out.alpha.intensity).toBe(startBands.alpha.intensity);
    expect(out.theta.intensity).toBe(startBands.theta.intensity);
  });

  it('interpolates linearly from startBands mid-stage-0', () => {
    const out = scheduleTargetsAt(def, 150, startBands); // halfway 0-300
    expect(out.alpha.intensity).toBe(60); // 40 -> 80 at 50%
    expect(out.theta.intensity).toBe(70); // 100 -> 40 at 50%
    expect(out.delta.intensity).toBe(40); // untouched
  });

  it('crossfades into stage 1 from stage 0 targets', () => {
    const out = scheduleTargetsAt(def, 450, startBands); // 25% into 300-900
    expect(out.theta.intensity).toBe(50); // 40 -> 80 at 25%
    expect(out.delta.intensity).toBe(35); // startBands 40 -> 20 at 25%
    expect(out.alpha.intensity).toBe(80); // holds stage-0 target
  });

  it('lands on the final stage targets at the end', () => {
    const out = scheduleTargetsAt(def, 1800, startBands);
    expect(out.delta.intensity).toBe(100);
    expect(out.theta.intensity).toBe(80);
    expect(out.alpha.intensity).toBe(80);
  });

  it('holds a band through a stage instead of snapping back when a later stage omits it', () => {
    // stage 1 targets only theta+delta; alpha reached 80 in stage 0 and must
    // stay 80 through stage 2 (regression: old code snapped alpha back to 40).
    const atStartOfStage2 = scheduleTargetsAt(def, 900, startBands);
    expect(atStartOfStage2.alpha.intensity).toBe(80);
    const atEnd = scheduleTargetsAt(def, 1800, startBands);
    expect(atEnd.alpha.intensity).toBe(80);
    expect(atEnd.theta.intensity).toBe(80);
  });

  it('clamps past the duration to the final stage', () => {
    const out = scheduleTargetsAt(def, 999_999, startBands);
    expect(out.delta.intensity).toBe(100);
  });
});

describe('scheduleTargetsAt — deep-focus', () => {
  const def = SCHEDULES['deep-focus'];
  // 0-300 beta60/alpha40, 300-900 beta80/alpha20, 900-1500 beta40/alpha60

  it('starts from the current bands at t=0', () => {
    const out = scheduleTargetsAt(def, 0, startBands);
    expect(out.beta.intensity).toBe(startBands.beta.intensity);
    expect(out.alpha.intensity).toBe(startBands.alpha.intensity);
  });

  it('interpolates into stage 2', () => {
    const out = scheduleTargetsAt(def, 1050, startBands); // 25% into 900-1500
    expect(out.beta.intensity).toBe(70); // crossfades from stage-1's 80 -> 40 at 25%
    expect(out.alpha.intensity).toBe(30); // 20 -> 60 at 25%
  });
});

describe('schedule definitions', () => {
  it('deep-sleep is 30 minutes and deep-focus is 25', () => {
    expect(SCHEDULES['deep-sleep'].durationMinutes).toBe(30);
    expect(SCHEDULES['deep-focus'].durationMinutes).toBe(25);
  });

  it('every stage is within the schedule duration', () => {
    for (const def of Object.values(SCHEDULES)) {
      for (const stage of def.stages) {
        expect(stage.startSeconds + stage.durationSeconds).toBeLessThanOrEqual(def.durationMinutes * 60);
      }
    }
  });
});
