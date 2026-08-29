import { useEffect, useRef } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import type { AudioEngine } from '../audio/engine';

export interface OutputMeterProps {
  engine: AudioEngine;
  active: boolean; // only reads analysers while playing
}

/** RMS of a time-domain analyser buffer. */
const rmsOf = (arr: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum / arr.length);
};

/** RMS -> 0..1 on a ~-60dB floor, so quiet sounds still show movement. */
const levelFromRms = (rms: number): number => {
  if (rms <= 1e-5) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 60) / 60));
};

/**
 * Stereo output meter (P2): two level bars computed from the existing L/R
 * analysers on the pre-master bus — no new audio nodes needed.
 */
export default function OutputMeter({ engine, active }: OutputMeterProps) {
  const lBarRef = useRef<HTMLDivElement | null>(null);
  const rBarRef = useRef<HTMLDivElement | null>(null);
  const smooth = useRef({ l: 0, r: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      if (active) {
        const l = engine.getWaveform('L');
        const r = engine.getWaveform('R');
        if (l && r) {
          const rawL = levelFromRms(rmsOf(l));
          const rawR = levelFromRms(rmsOf(r));
          // fast attack, slow release
          smooth.current.l = Math.max(rawL, smooth.current.l * 0.92);
          smooth.current.r = Math.max(rawR, smooth.current.r * 0.92);
        } else {
          smooth.current.l = 0;
          smooth.current.r = 0;
        }
      } else {
        smooth.current.l = 0;
        smooth.current.r = 0;
      }
      if (lBarRef.current) lBarRef.current.style.height = `${Math.round(smooth.current.l * 100)}%`;
      if (rBarRef.current) rBarRef.current.style.height = `${Math.round(smooth.current.r * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, active]);

  const bar = (ref: React.RefObject<HTMLDivElement | null>): JSX.Element => (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box
        sx={{
          flex: 1,
          width: 22,
          bgcolor: 'action.hover',
          borderRadius: 1,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          ref={ref}
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '0%',
            background: 'linear-gradient(0deg, #4caf50, #ffb74d 60%, #f44336)',
            transition: 'height 60ms linear',
          }}
        />
      </Box>
    </Box>
  );

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 200 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="h6" component="div" sx={{ mb: 1 }}>
          Output Level
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, height: 84, alignItems: 'stretch' }}>
          {bar(lBarRef)}
          {bar(rBarRef)}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            L
          </Typography>
          <Typography variant="caption" color="text.secondary">
            R
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
