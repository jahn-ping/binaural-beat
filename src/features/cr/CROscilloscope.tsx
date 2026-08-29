import { useRef, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import * as Tone from 'tone';

interface CROscilloscopeProps {
  isPlaying: boolean;
  height?: number;
}

/**
 * Combined waveform oscilloscope for CR tones.
 * Uses a Tone.Analyser connected to the CR output bus.
 */
export default function CROscilloscope({ isPlaying, height = 160 }: CROscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<Tone.Analyser | null>(null);

  useEffect(() => {
    if (isPlaying && !analyserRef.current) {
      analyserRef.current = new Tone.Analyser('waveform', 1024);
      Tone.getDestination().connect(analyserRef.current);
    }
    return () => {
      if (analyserRef.current) {
        Tone.getDestination().disconnect(analyserRef.current);
        analyserRef.current = null;
      }
    };
  }, [isPlaying]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);

    const data = analyser.getValue() as Float32Array;
    if (!data || data.length === 0) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    // Center line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Waveform
    ctx.strokeStyle = '#6ec6ff';
    ctx.lineWidth = Math.max(1, dpr * 1.5);
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = ((data[i] + 1) / 2) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, draw]);

  return (
    <Box
      sx={{
        width: '100%',
        height,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#0b1020',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label="Combined CR tones waveform"
        role="img"
      />
      {!isPlaying && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Start CR to view combined waveform
          </Typography>
        </Box>
      )}
    </Box>
  );
}
