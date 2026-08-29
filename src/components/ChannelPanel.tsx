import { Box, Card, CardContent, MenuItem, Select, Slider, TextField, Typography } from '@mui/material';
import type { ChannelParams, WaveType } from '../audio/engine';

export interface ChannelPanelProps {
  side: 'Left' | 'Right';
  params: ChannelParams;
  disabled: boolean; // true when linked mode derives this channel
  onChange: (patch: Partial<ChannelParams>) => void;
}

const MIN_FREQ = 20;
const MAX_FREQ = 2000;

/** Left/Right channel card: base freq, volume, FM rate/depth, AM rate/depth (task 4.1). */
export default function ChannelPanel({ side, params, disabled, onChange }: ChannelPanelProps) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" component="div">
            {side} Channel
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {params.freq.toFixed(2)} Hz
          </Typography>
        </Box>

        <Typography variant="caption" color="text.secondary">
          Frequency (Hz)
        </Typography>
        <Slider
          value={params.freq}
          min={MIN_FREQ}
          max={MAX_FREQ}
          step={0.01}
          disabled={disabled}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v.toFixed(2)} Hz`}
          marks={[
            { value: MIN_FREQ, label: '20' },
            { value: 500, label: '500' },
            { value: 1000, label: '1k' },
            { value: 1500, label: '1.5k' },
            { value: MAX_FREQ, label: '2k' },
          ]}
          onChange={(_, v) => onChange({ freq: v as number })}
        />

        <Typography variant="caption" color="text.secondary">
          Volume
        </Typography>
        <Slider
          value={params.volume}
          min={0}
          max={1}
          step={0.01}
          valueLabelDisplay="auto"
          onChange={(_, v) => onChange({ volume: v as number })}
        />

        {/* Waveform shape + detune (reference features — critique S3) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
          <Select
            size="small"
            value={params.wave}
            disabled={disabled}
            onChange={(e) => onChange({ wave: e.target.value as WaveType })}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="sine">Sine</MenuItem>
            <MenuItem value="triangle">Triangle</MenuItem>
            <MenuItem value="square">Square</MenuItem>
            <MenuItem value="sawtooth">Sawtooth</MenuItem>
          </Select>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Detune
            </Typography>
            <Slider
              size="small"
              value={params.detune}
              min={-100}
              max={100}
              step={1}
              disabled={disabled}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v}¢`}
              onChange={(_, v) => onChange({ detune: v as number })}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField
            label="FM rate (Hz)"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 100, step: 0.01 }}
            value={params.fm.rate}
            onChange={(e) => onChange({ fm: { ...params.fm, rate: Number(e.target.value) } })}
          />
          <TextField
            label="FM depth (Hz)"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 200, step: 0.1 }}
            value={params.fm.depth}
            onChange={(e) => onChange({ fm: { ...params.fm, depth: Number(e.target.value) } })}
          />
          <TextField
            label="AM rate (Hz)"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 100, step: 0.01 }}
            value={params.am.rate}
            onChange={(e) => onChange({ am: { ...params.am, rate: Number(e.target.value) } })}
          />
          <TextField
            label="AM depth (0-1)"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 1, step: 0.01 }}
            value={params.am.depth}
            onChange={(e) => onChange({ am: { ...params.am, depth: Number(e.target.value) } })}
          />
        </Box>
      </CardContent>
    </Card>
  );
}