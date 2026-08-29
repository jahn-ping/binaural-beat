import { Box, Card, CardContent, Chip, FormControlLabel, MenuItem, Select, Slider, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { BAND_NAMES, ENTRAINMENT_BANDS, type BandName, type EntrainmentSettings } from '../audio/entrainment';
import {
  applyEntrainmentPreset,
  detectEntrainmentPreset,
  ENTRAINMENT_PRESET_NAMES,
  type EntrainmentPreset,
} from '../audio/presets';
import { SCHEDULE_OPTIONS } from '../state/schedules';

export interface EntrainmentPanelProps {
  state: EntrainmentSettings;
  scheduleActive: boolean; // disables manual control while a schedule drives the bands
  onChange: (patch: Partial<EntrainmentSettings>) => void;
}

/** Beat slider steps per band — finer resolution at low frequencies. */
const BEAT_STEP: Record<BandName, number> = {
  delta: 0.25,
  theta: 0.25,
  alpha: 0.5,
  beta: 0.5,
  gamma: 1,
};

/** Band-intensity entrainment mixer card (webQ-synthesized design). */
export default function EntrainmentPanel({ state, scheduleActive, onChange }: EntrainmentPanelProps) {
  const patchBand = (id: BandName, patch: Partial<{ intensity: number; beat: number }>): void => {
    const bands = { ...state.bands, [id]: { ...state.bands[id], ...patch } };
    onChange({ bands, preset: detectEntrainmentPreset(bands) });
  };

  // Sliders stay live during a schedule so they mirror the auto-driven values
  // (critique S2 — live mirroring); only disabled when the mixer is off.
  const manualDisabled = !state.enabled;

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" component="div">
              Entrainment Mixer
            </Typography>
            <Tooltip title="Controlled studies of binaural beats show mixed results. Useful for relaxation and experimentation — not a medical treatment.">
              <Chip size="small" color="warning" variant="outlined" label="Emerging evidence" />
            </Tooltip>
          </Box>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={state.enabled}
                onChange={(e) => onChange({ enabled: e.target.checked })}
              />
            }
            label="On"
            sx={{ m: 0 }}
          />
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Five brainwave bands, each a binaural beat at the carrier (L) vs carrier+beat (R).
          Intensity sets loudness; the small slider under each band tunes its beat frequency.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 1 }}>
          <TextField
            label="Carrier (Hz)"
            type="number"
            size="small"
            disabled={!state.enabled}
            inputProps={{ min: 100, max: 1000, step: 1 }}
            value={state.carrier}
            onChange={(e) => onChange({ carrier: Number(e.target.value) })}
          />
          <Select
            size="small"
            value={state.preset}
            disabled={manualDisabled}
            onChange={(e) => onChange(applyEntrainmentPreset(state, e.target.value as EntrainmentPreset))}
            sx={{ minWidth: 120 }}
          >
            {ENTRAINMENT_PRESET_NAMES.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Select
          size="small"
          fullWidth
          value={state.schedule}
          disabled={!state.enabled}
          onChange={(e) => onChange({ schedule: e.target.value })}
          displayEmpty
          sx={{ mb: 1 }}
        >
          {SCHEDULE_OPTIONS.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
        {scheduleActive && (
          <Typography variant="caption" color="primary" display="block" sx={{ mb: 1 }}>
            Schedule running — band sliders are auto-driven.
          </Typography>
        )}

        {BAND_NAMES.map((id) => {
          const def = ENTRAINMENT_BANDS[id];
          const bs = state.bands[id];
          return (
            <Box key={id} sx={{ mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: def.color }} />
                  <Typography variant="caption">{def.label}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {bs.intensity.toFixed(0)} · {bs.beat.toFixed(1)} Hz
                </Typography>
              </Box>
              <Slider
                size="small"
                value={bs.intensity}
                min={0}
                max={100}
                step={1}
                disabled={manualDisabled}
                valueLabelDisplay="auto"
                aria-label={`${def.label} intensity`}
                onChange={(_, v) => patchBand(id, { intensity: v as number })}
              />
              <Slider
                size="small"
                value={bs.beat}
                min={def.rangeHz[0]}
                max={def.rangeHz[1]}
                step={BEAT_STEP[id]}
                disabled={manualDisabled}
                valueLabelDisplay="auto"
                valueLabelFormat={(v: number) => `${v} Hz`}
                aria-label={`${def.label} beat frequency`}
                onChange={(_, v) => patchBand(id, { beat: v as number })}
                sx={{
                  mt: -0.5,
                  '& .MuiSlider-thumb': { width: 8, height: 8 },
                  '& .MuiSlider-track': { height: 3 },
                }}
              />
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
}
