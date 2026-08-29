import { useRef, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { CREngineExpanded } from './CREngineExpanded';

interface CRLevelMeterProps {
  engine: CREngineExpanded;
  isPlaying: boolean;
}

/**
 * Real-time audio level meter for CR neuromodulation.
 * Reads RMS level from the engine's analyser at 30fps and renders a
 * colored bar (green → yellow → red) so users can visually confirm
 * tones are playing even if they can't hear them.
 */
export default function CRLevelMeter({ engine, isPlaying }: CRLevelMeterProps) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) {
      setLevel(0);
      return;
    }
    const tick = (): void => {
      setLevel(engine.getLevel());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine, isPlaying]);

  // Map RMS 0..1 to a 0..100% bar, with a minimum visible threshold
  const pct = Math.min(100, Math.round(level * 300)); // amplify for visibility
  const color = pct > 70 ? 'error' : pct > 30 ? 'warning' : 'success';

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Audio Level
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          {isPlaying ? `${pct}%` : '—'}
        </Typography>
      </Box>
      <Box
        sx={{
          height: 8,
          borderRadius: 1,
          bgcolor: 'action.hover',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${pct}%`,
            bgcolor: `${color}.main`,
            borderRadius: 1,
            transition: 'width 0.05s linear',
          }}
        />
      </Box>
      {!isPlaying && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Start CR to see audio level
        </Typography>
      )}
      {isPlaying && pct === 0 && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
          ⚠️ No signal detected — check pitch frequency and volume
        </Typography>
      )}
    </Box>
  );
}
