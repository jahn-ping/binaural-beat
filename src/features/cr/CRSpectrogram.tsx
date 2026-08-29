import { useRef, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { calculateCRFrequencies } from './crConfig';
import type { CREngineExpanded } from './CREngineExpanded';

const CHANNEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

interface CRSpectrogramProps {
  engine: CREngineExpanded;
  isPlaying: boolean;
  tinnitusFrequencyHz: number;
  erbSpacing: number;
  height?: number;
}

/**
 * Scrolling waterfall spectrogram for CR neuromodulation.
 * Reads FFT data from the engine at ~30fps and renders a scrolling
 * heat-map where the Y-axis is log-frequency and color is magnitude.
 * The 4 CR tone frequencies are marked with colored horizontal lines.
 */
export default function CRSpectrogram({
  engine,
  isPlaying,
  tinnitusFrequencyHz,
  erbSpacing,
  height = 180,
}: CRSpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const bufferRef = useRef<ImageData | null>(null);

  const minFreq = 100;
  const maxFreq = 8000;

  const { frequenciesHz } = calculateCRFrequencies(tinnitusFrequencyHz, erbSpacing);

  /** Map a frequency to a normalized 0..1 Y position (log scale, 0 = top = high freq). */
  const freqToNorm = useCallback((freq: number): number => {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logF = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
    return 1 - (logF - logMin) / (logMax - logMin); // 0=top(high), 1=bottom(low)
  }, []);

  /** Convert dB value (-100..0) to a heat-map color. */
  const dbToColor = useCallback((db: number): [number, number, number] => {
    // Normalize: -80dB = 0, 0dB = 1
    const t = Math.max(0, Math.min(1, (db + 80) / 80));
    // Viridis-inspired: dark purple → blue → teal → yellow
    if (t < 0.25) {
      const s = t / 0.25;
      return [Math.round(68 + s * 2), Math.round(1 + s * 30), Math.round(84 + s * 80)];
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return [Math.round(70 - s * 20), Math.round(31 + s * 70), Math.round(164 + s * 30)];
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return [Math.round(50 + s * 140), Math.round(101 + s * 30), Math.round(194 - s * 50)];
    } else {
      const s = (t - 0.75) / 0.25;
      return [Math.round(190 + s * 65), Math.round(131 + s * 100), Math.round(144 - s * 100)];
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    // Get FFT data
    const spectrum = engine.getSpectrum();
    const sampleRate = engine.getSampleRate();
    const fftSize = spectrum.length * 2; // Tone.js fft=512 returns 256 bins

    // Shift existing image left by 1 pixel column
    const imgData = ctx.getImageData(0, 0, w, h);
    if (!bufferRef.current || bufferRef.current.width !== w || bufferRef.current.height !== h) {
      bufferRef.current = ctx.createImageData(w, h);
    }
    const buf = bufferRef.current;
    // Shift left: copy columns 1..w-1 to 0..w-2
    for (let y = 0; y < h; y++) {
      const srcOffset = (y * w + 1) * 4;
      const dstOffset = (y * w) * 4;
      const rowLen = (w - 1) * 4;
      buf.data.set(imgData.data.subarray(srcOffset, srcOffset + rowLen), dstOffset);
    }

    // Paint the new rightmost column from FFT data
    for (let y = 0; y < h; y++) {
      const normY = y / h; // 0 = top, 1 = bottom
      // Map pixel Y to frequency (log scale, top = high freq)
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const logF = logMax - normY * (logMax - logMin);
      const freq = Math.pow(10, logF);

      // Find the FFT bin closest to this frequency
      const bin = Math.round((freq * fftSize) / sampleRate);
      const clampedBin = Math.max(0, Math.min(spectrum.length - 1, bin));
      const db = spectrum[clampedBin] ?? -100;

      const [r, g, b] = dbToColor(db);
      const idx = ((y * w) + (w - 1)) * 4;
      buf.data[idx] = r;
      buf.data[idx + 1] = g;
      buf.data[idx + 2] = b;
      buf.data[idx + 3] = 255;
    }

    // Draw the scrolled image
    ctx.putImageData(buf, 0, 0);

    // Draw CR frequency markers on top
    const drawFreqMarker = (freq: number, color: string, label: string) => {
      const normY = freqToNorm(freq);
      const pixelY = normY * h;
      ctx.strokeStyle = color;
      ctx.lineWidth = dpr * 1.5;
      ctx.setLineDash([dpr * 4, dpr * 3]);
      ctx.beginPath();
      ctx.moveTo(0, pixelY);
      ctx.lineTo(w, pixelY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label on the right edge
      ctx.fillStyle = color;
      ctx.font = `${dpr * 10}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(label, w - dpr * 4, pixelY - dpr * 3);
    };

    // Mark the 4 CR frequencies
    frequenciesHz.forEach((freq, i) => {
      drawFreqMarker(freq, CHANNEL_COLORS[i], `T${i + 1}`);
    });

    // Mark center frequency (tinnitus pitch)
    drawFreqMarker(tinnitusFrequencyHz, '#ef4444', 'f₀');

    // Y-axis frequency labels
    const ticks = [100, 200, 500, 1000, 2000, 4000, 8000];
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${dpr * 9}px monospace`;
    ctx.textAlign = 'left';
    ticks.forEach((f) => {
      const y = freqToNorm(f) * h;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, dpr * 4, y + dpr * 3);
    });

    animRef.current = requestAnimationFrame(draw);
  }, [engine, tinnitusFrequencyHz, erbSpacing, frequenciesHz, minFreq, maxFreq, freqToNorm, dbToColor]);

  useEffect(() => {
    if (!isPlaying) {
      // Draw "not playing" state
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.max(1, window.devicePixelRatio || 1);
          const rect = canvas.getBoundingClientRect();
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
          ctx.fillStyle = '#0b1020';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, draw]);

  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Frequency Spectrogram
      </Typography>
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
          aria-label="CR neuromodulation frequency spectrogram"
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
              Start CR to view spectrogram
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
