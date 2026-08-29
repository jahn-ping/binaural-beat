export type CRPlaybackOrder = 'pseudorandom' | 'sequential' | 'reverse';

export interface CRParameters {
  tinnitusFrequencyHz: number;
  erbSpacing: number;
  amplitudes: [number, number, number, number];
  burstRateHz: number;
  burstDurationMs: number;
  playbackOrder: CRPlaybackOrder;
}

export interface CRPreset {
  id: 'conservative' | 'standard' | 'aggressive' | 'sleep';
  label: string;
  description: string;
  parameters: Pick<
    CRParameters,
    'erbSpacing' | 'amplitudes' | 'burstRateHz' | 'burstDurationMs' | 'playbackOrder'
  >;
}

export interface CRFrequencySet {
  centerHz: number;
  frequenciesHz: [number, number, number, number];
}

export interface CRSessionState {
  isPlaying: boolean;
  elapsedSeconds: number;
  durationSeconds: number;
}
