import { useEffect, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';
import { getTinnitusEngine } from '../audio/tinnitus/TinnitusEngine';
import { loadTinnitusState } from '../state/tinnitus';
import type { NoiseParams } from '../audio/engine';

export interface NoiseABTestProps {
  noise: NoiseParams;
  onNoiseChange: (patch: Partial<NoiseParams>) => void;
  isPlaying: boolean;
  play: () => void;
}

type Side = 'binaural' | 'tinnitus';

/**
 * Diagnostic A/B: toggles between the binaural noise generator and the tinnitus
 * noise path every 2 s so the two can be compared by ear. The binaural noise is
 * temporarily set to the tinnitus sound (color + level) for a fair comparison,
 * and restored on stop.
 */
export default function NoiseABTest({ noise, onNoiseChange, isPlaying, play }: NoiseABTestProps) {
  const [running, setRunning] = useState(false);
  const [side, setSide] = useState<Side>('binaural');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedRef = useRef<{ enabled: boolean; volume: number; color: NoiseParams['color'] } | null>(null);
  const tinWasActiveRef = useRef(false);

  const applySide = (s: Side): void => {
    setSide(s);
    if (s === 'binaural') {
      onNoiseChange({ enabled: true });
      getTinnitusEngine().setNoiseMuted(true);
    } else {
      onNoiseChange({ enabled: false });
      getTinnitusEngine().setNoiseMuted(false);
    }
  };

  const stop = (): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
    const saved = savedRef.current;
    if (saved) {
      onNoiseChange({ enabled: saved.enabled, volume: saved.volume, color: saved.color });
      savedRef.current = null;
    }
    getTinnitusEngine().setNoiseMuted(false);
    if (!tinWasActiveRef.current) void getTinnitusEngine().setActive(false);
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (): void => {
    if (running) return;
    if (!isPlaying) play(); // binaural noise source only runs while the app plays
    const tin = loadTinnitusState();
    tinWasActiveRef.current = getTinnitusEngine().isActive;
    savedRef.current = { enabled: noise.enabled, volume: noise.volume, color: noise.color };
    // match the binaural noise to the tinnitus sound for a fair comparison
    onNoiseChange({ enabled: true, volume: tin.volumeDb, color: tin.noiseType });
    if (!tinWasActiveRef.current) void getTinnitusEngine().setActive(true);
    setRunning(true);
    setSide('binaural');
    applySide('tinnitus'); // start by unmuting tinnitus (engine fade-in needs ~2 s)
    timerRef.current = setInterval(() => {
      applySide(sideRef.current === 'binaural' ? 'tinnitus' : 'binaural');
    }, 2000);
  };

  const sideRef = useRef<Side>('binaural');
  sideRef.current = side;

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" component="div">
            Noise A/B Test
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            color="info"
            label="Diagnostic — compare the two noise paths by ear"
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Alternates every 2 s between the binaural noise generator and the tinnitus noise path
          (same color and level, so you hear the difference in the chains themselves). The binaural
          noise is restored when you stop.
        </Typography>
        {running && (
          <Chip
            sx={{ mb: 1 }}
            color={side === 'binaural' ? 'secondary' : 'primary'}
            label={side === 'binaural' ? 'Now playing: Binaural noise' : 'Now playing: Tinnitus noise'}
          />
        )}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!running ? (
            <Button variant="contained" size="small" onClick={start}>
              ▶ Start A/B
            </Button>
          ) : (
            <Button variant="outlined" color="warning" size="small" onClick={stop}>
              ⏹ Stop &amp; restore
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
