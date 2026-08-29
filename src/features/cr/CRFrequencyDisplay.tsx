import { useRef, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { calculateCRFrequencies } from './crConfig';

const CHANNEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

interface CRFrequencyDisplayProps {
  tinnitusFrequencyHz: number;
  erbSpacing: number;
  amplitudes: [number, number, number, number];
}

/**
 * SVG-based frequency visualization showing 4 CR markers on a log frequency axis.
 * Interactive, crisp at any size, no canvas overhead.
 */
export default function CRFrequencyDisplay({
  tinnitusFrequencyHz,
  erbSpacing,
  amplitudes,
}: CRFrequencyDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { frequenciesHz } = useMemo(
    () => calculateCRFrequencies(tinnitusFrequencyHz, erbSpacing),
    [tinnitusFrequencyHz, erbSpacing],
  );

  const minFreq = 100;
  const maxFreq = 8000;
  const padding = { left: 40, right: 20, top: 20, bottom: 30 };
  const width = 700;
  const height = 120;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const axisY = plotHeight + padding.top;

  const freqToX = (freq: number): number => {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logF = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
    return padding.left + ((logF - logMin) / (logMax - logMin)) * plotWidth;
  };

  const ticks = [100, 200, 500, 1000, 2000, 4000, 8000];

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        CR Frequency Distribution
      </Typography>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="CR frequency visualization showing 4 tone markers"
      >
        {/* Background */}
        <rect x={0} y={0} width={width} height={height} fill="#0f172a" rx={4} />

        {/* Grid lines */}
        {ticks.map((f) => {
          const x = freqToX(f);
          return (
            <line
              key={f}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={axisY}
              stroke="#1e293b"
              strokeWidth={1}
            />
          );
        })}

        {/* Axis line */}
        <line
          x1={padding.left}
          y1={axisY}
          x2={width - padding.right}
          y2={axisY}
          stroke="#475569"
          strokeWidth={1}
        />

        {/* Tick labels */}
        {ticks.map((f) => {
          const x = freqToX(f);
          return (
            <text
              key={f}
              x={x}
              y={axisY + 14}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={10}
              fontFamily="monospace"
            >
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          );
        })}

        {/* Center frequency marker (tinnitus pitch) */}
        <line
          x1={freqToX(tinnitusFrequencyHz)}
          y1={padding.top}
          x2={freqToX(tinnitusFrequencyHz)}
          y2={axisY}
          stroke="#ef4444"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          opacity={0.6}
        />
        <text
          x={freqToX(tinnitusFrequencyHz)}
          y={padding.top - 4}
          textAnchor="middle"
          fill="#ef4444"
          fontSize={9}
          fontFamily="monospace"
        >
          f₀
        </text>

        {/* 4 CR tone markers */}
        {frequenciesHz.map((freq, i) => {
          const x = freqToX(freq);
          const color = CHANNEL_COLORS[i];
          const barHeight = Math.max(4, amplitudes[i] * plotHeight * 0.8);
          return (
            <g key={i}>
              {/* Vertical bar */}
              <rect
                x={x - 3}
                y={axisY - barHeight}
                width={6}
                height={barHeight}
                fill={color}
                rx={2}
                opacity={0.8}
              />
              {/* Circle marker */}
              <circle cx={x} cy={axisY - barHeight - 4} r={4} fill={color} />
              {/* Frequency label */}
              <text
                x={x}
                y={axisY - barHeight - 12}
                textAnchor="middle"
                fill={color}
                fontSize={9}
                fontFamily="monospace"
                fontWeight={600}
              >
                {Math.round(freq)}
              </text>
              {/* Channel label */}
              <text
                x={x}
                y={axisY + 24}
                textAnchor="middle"
                fill={color}
                fontSize={8}
                fontFamily="monospace"
              >
                T{i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
