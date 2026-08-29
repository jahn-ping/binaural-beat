import { useEffect, useRef } from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import type { AudioEngine, WaveformChannel } from '../audio/engine';

interface WaveformProps {
  title: string;
  channel: WaveformChannel;
  engine: AudioEngine;
  active: boolean;
  color?: string;
  width?: number;
  height?: number;
}

/** Reusable oscilloscope card — rAF loop, HiDPI-aware, flat line when idle (spec: waveform-display). */
export default function Waveform({
  title,
  channel,
  engine,
  active,
  color = '#7c4dff',
  width = 608,
  height = 100,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    let raf = 0;
    const mid = (height / 2) * dpr;
    const draw = (): void => {
      // background
      ctx.fillStyle = '#101014';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // center line
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(canvas.width, mid);
      ctx.stroke();

      const data = engine.getWaveform(channel);
      if (data && data.length > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        const stepX = canvas.width / (data.length - 1);
        for (let i = 0; i < data.length; i++) {
          const v = Math.max(-1, Math.min(1, data[i]));
          const y = mid - v * (mid * 0.9);
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * stepX, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf); // spec: no rAF leak on unmount
  }, [engine, channel, color, width, height, active]);

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {title}
          {active ? ' ●' : ''}
        </Typography>
        <canvas
          ref={canvasRef}
          style={{ width, height, display: 'block', maxWidth: '100%' }}
          role="img"
          aria-label={`${title} waveform`}
        />
      </CardContent>
    </Card>
  );
}