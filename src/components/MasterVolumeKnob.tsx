import { useCallback, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';

export interface MasterVolumeKnobProps {
  value: number; // dB, -60..0
  onChange: (db: number) => void;
  min?: number;
  max?: number;
  size?: number;
  label?: string;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Rotary master volume knob — pointer drag + arrow keys, dB readout (spec: master-volume). */
export default function MasterVolumeKnob({
  value,
  onChange,
  min = -60,
  max = 0,
  size = 72,
  label = 'Master',
}: MasterVolumeKnobProps) {
  const dragRef = useRef<{ y: number; db: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // -60 dB maps to 270deg (min, lower-left); 0 dB to -90deg (top)
  const norm = (value - min) / (max - min); // 0..1
  const angle = 135 - norm * 270; // degrees, 0 = pointing up
  const ticks = 21;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { y: e.clientY, db: value };
      setDragging(true);
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.y - e.clientY; // up = positive
      const db = clamp(dragRef.current.db + dy * 0.2, min, max);
      onChange(db);
    },
    [min, max, onChange],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 6 : 1; // dB per press
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(clamp(value + step, min, max));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange(clamp(value - step, min, max));
      }
    },
    [value, min, max, onChange],
  );

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, userSelect: 'none' }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box
        tabIndex={0}
        role="slider"
        aria-label={`${label} volume`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          position: 'relative',
          cursor: 'ns-resize',
          outline: 'none',
          '&:focus-visible': { boxShadow: '0 0 0 3px rgba(124,77,255,0.6)' },
          background:
            'radial-gradient(circle at 35% 30%, #3a3a44 0%, #17171d 60%, #0c0c11 100%)',
          boxShadow: dragging
            ? '0 0 0 2px #7c4dff, 0 4px 10px rgba(0,0,0,0.5)'
            : '0 3px 8px rgba(0,0,0,0.5)',
          touchAction: 'none',
        }}
      >
        {/* tick marks */}
        {Array.from({ length: ticks }, (_, i) => {
          const t = i / (ticks - 1); // 0..1
          const a = ((135 - t * 270) * Math.PI) / 180;
          const r1 = size / 2 - 6;
          const r2 = size / 2 - 2;
          const cx = size / 2 + Math.sin(a) * ((r1 + r2) / 2);
          const cy = size / 2 - Math.cos(a) * ((r1 + r2) / 2);
          return (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                left: cx - 1,
                top: cy - 1,
                width: 2,
                height: 2,
                borderRadius: '50%',
                bgcolor: t <= norm ? '#7c4dff' : 'rgba(255,255,255,0.2)',
              }}
            />
          );
        })}
        {/* pointer line */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 3,
            height: size / 2 - 10,
            bgcolor: '#7c4dff',
            borderRadius: 2,
            transformOrigin: '50% 100%',
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
        {value <= min + 0.5 ? '−∞' : `${value.toFixed(0)} dB`}
      </Typography>
    </Box>
  );
}