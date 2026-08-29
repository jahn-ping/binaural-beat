import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  IconButton,
  Slider,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { NoiseColor, NoiseParams } from '../audio/engine';

const NOISE_COLORS: NoiseColor[] = ['white', 'pink', 'brown'];

export interface NoisePanelProps {
  params: NoiseParams;
  onChange: (patch: Partial<NoiseParams>) => void;
}

/** Noise generator card: color, volume, sweep, Q, LFO + collapsible effects (tasks 5.1/5.2). */
export default function NoisePanel({ params, onChange }: NoisePanelProps) {
  const [effectsOpen, setEffectsOpen] = useState(false);

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" component="div">
            Noise Generator
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {params.volume.toFixed(0)} dB
          </Typography>
        </Box>

        {/* On/off + color (reference: white/pink/brown — critique S3) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Switch checked={params.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          <Typography variant="caption" color="text.secondary">
            On
          </Typography>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
            {NOISE_COLORS.map((c) => (
              <Button
                key={c}
                size="small"
                disabled={!params.enabled}
                variant={params.color === c ? 'contained' : 'outlined'}
                onClick={() => onChange({ color: c })}
                sx={{ textTransform: 'capitalize', minWidth: 52 }}
              >
                {c}
              </Button>
            ))}
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary">
          Volume (dB)
        </Typography>
        <Slider
          value={params.volume}
          min={-60}
          max={0}
          step={1}
          disabled={!params.enabled}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v} dB`}
          onChange={(_, v) => onChange({ volume: v as number })}
        />

        <Typography variant="caption" color="text.secondary">
          Filter gain (reference control: 0–100%)
        </Typography>
        <Slider
          value={params.filterGain}
          min={0}
          max={100}
          step={1}
          disabled={!params.enabled}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          onChange={(_, v) => onChange({ filterGain: v as number })}
        />

        <Typography variant="caption" color="text.secondary">
          Sweep phase (0–360°, reference control)
        </Typography>
        <Slider
          value={params.phase}
          min={0}
          max={360}
          step={1}
          disabled={!params.enabled}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}°`}
          onChange={(_, v) => onChange({ phase: v as number })}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mt: 1 }}>
          <TextField
            label="Sweep min (Hz)"
            type="number"
            size="small"
            inputProps={{ min: 20, max: 8000, step: 10 }}
            value={params.sweepMin}
            onChange={(e) => onChange({ sweepMin: Number(e.target.value) })}
          />
          <TextField
            label="Sweep max (Hz)"
            type="number"
            size="small"
            inputProps={{ min: 20, max: 8000, step: 10 }}
            value={params.sweepMax}
            onChange={(e) => onChange({ sweepMax: Number(e.target.value) })}
          />
          <TextField
            label="LFO rate (Hz)"
            type="number"
            size="small"
            inputProps={{ min: 0.01, max: 20, step: 0.01 }}
            value={params.lfoRate}
            onChange={(e) => onChange({ lfoRate: Number(e.target.value) })}
          />
        </Box>

        <Typography variant="caption" color="text.secondary">
          Filter Q
        </Typography>
        <Slider
          value={params.q}
          min={0.1}
          max={10}
          step={0.1}
          valueLabelDisplay="auto"
          onChange={(_, v) => onChange({ q: v as number })}
        />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 1,
            cursor: 'pointer',
          }}
          onClick={() => setEffectsOpen((o) => !o)}
        >
          <Typography variant="subtitle2" color="text.secondary">
            Effects (Chorus / Reverb)
          </Typography>
          <IconButton size="small" aria-label="toggle effects" sx={{ transform: effectsOpen ? 'rotate(180deg)' : 'none' }}>
            <ExpandMoreIcon />
          </IconButton>
        </Box>
        <Collapse in={effectsOpen}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 1 }}>
            <TextField
              label="Chorus rate"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 2000, step: 1 }}
              value={params.chorus.rate}
              onChange={(e) => onChange({ chorus: { ...params.chorus, rate: Number(e.target.value) } })}
            />
            <TextField
              label="Chorus depth (0-1)"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 1, step: 0.01 }}
              value={params.chorus.depth}
              onChange={(e) => onChange({ chorus: { ...params.chorus, depth: Number(e.target.value) } })}
            />
            <TextField
              label="Chorus delay (s)"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 1, step: 0.005 }}
              value={params.chorus.delay}
              onChange={(e) => onChange({ chorus: { ...params.chorus, delay: Number(e.target.value) } })}
            />
            <TextField
              label="Chorus spread (deg)"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 180, step: 1 }}
              value={params.chorus.spread}
              onChange={(e) => onChange({ chorus: { ...params.chorus, spread: Number(e.target.value) } })}
            />
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="caption" color="text.secondary">
                Chorus feedback (0–0.95, clamped — critique S3)
              </Typography>
              <Slider
                size="small"
                value={params.chorus.feedback}
                min={0}
                max={0.95}
                step={0.01}
                valueLabelDisplay="auto"
                onChange={(_, v) => onChange({ chorus: { ...params.chorus, feedback: Math.min(0.95, v as number) } })}
              />
            </Box>
            <TextField
              label="Reverb decay (s)"
              type="number"
              size="small"
              inputProps={{ min: 0.1, max: 30, step: 0.5 }}
              value={params.reverb.decay}
              onChange={(e) => onChange({ reverb: { ...params.reverb, decay: Number(e.target.value) } })}
            />
            <TextField
              label="Reverb wet (0-1)"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 1, step: 0.01 }}
              value={params.reverb.wet}
              onChange={(e) => onChange({ reverb: { ...params.reverb, wet: Number(e.target.value) } })}
            />
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}