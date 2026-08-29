/**
 * Barrel export for the presets module.
 * Import from '@/state/presets' instead of deep paths.
 */

export type { BinauralPreset, PresetAudioState, PresetExportFile, PresetImportResult } from './presets/types';
export { CURRENT_SCHEMA_VERSION, newId, isUserPreset, isFactoryPreset, validatePreset, validateImportFile } from './presets/types';
export { FACTORY_PRESETS } from './presets/factory';
export {
  usePresets,
  saveLastSession,
  loadLastSession,
  snapshotAudio,
  type UsePresetsResult,
} from './presets/index';
