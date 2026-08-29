export { SafetyBus, getSafetyBus } from './core/SafetyBus';
export type { LimiterEvent } from './core/SafetyBus';
export { type TherapyEngine, type EvidenceLevel } from './core/TherapyEngine';
export { type TinnitusProfile, DEFAULT_PROFILE, loadProfile, saveProfile } from './core/TinnitusProfile';

export { NotchedEngine } from './engines/NotchedEngine';
export { CREngine } from './engines/CREngine';
export { FrequencySweepEngine } from './engines/FrequencySweepEngine';
export { SoundscapeEngine } from './engines/SoundscapeEngine';

export { VoicePool } from './shared/VoicePool';
export { BreathingModulator } from './modulation/BreathingModulator';

export {
  type TherapyStep,
  type TherapyProtocol,
  PROTOCOLS,
  GENTLE_ENRICHMENT,
  SLEEP_FOCUS,
  ProtocolScheduler,
} from './protocols/ProtocolScheduler';

export { SessionHistoryStore, getSessionHistory } from './persistence/SessionHistoryStore';
export type { TherapySession } from './persistence/SessionHistoryStore';
