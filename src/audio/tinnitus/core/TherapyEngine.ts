import type { TinnitusProfile } from './TinnitusProfile';

export type EvidenceLevel =
  | 'symptom-management'
  | 'mixed-evidence'
  | 'experimental'
  | 'relaxation-support';

export interface TherapyEngine {
  readonly id: string;
  readonly evidenceLabel: EvidenceLevel;
  start(profile: TinnitusProfile): void;
  stop(fadeSec?: number): void;
  setIntensity(gain0to1: number): void;
  dispose(): void;
}
