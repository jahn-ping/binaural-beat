import { Box, Card, CardContent, FormControlLabel, MenuItem, Select, Slider, Switch, TextField, Typography } from '@mui/material';
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

/** Band-intensity entrainment mixer card (webQ-synthesized design). */
export default function EntrainmentPanel({ state, scheduleActive, onChange }: EntrainmentPanelProps) {
  const patchBand = (id: BandName, intensity: number): void => {
    const bands = { ...state.bands, [id]: { ...state.bands[id], intensity } };
    onChange({ bands, preset: detectEntrainmentPreset(bands) });
  };

  // Sliders stay live during a schedule so they mirror the auto-driven values
  // (critique S2 — live mirroring); only disabled when the mixer is off.
  const manualDisabled = !state.enabled;

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" component="div">
            Entrainment Mixer
          </Typography>
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
          Five brainwave bands, each a binaural beat at the carrier (L) vs carrier+beat (R). Intensity sets loudness.
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
                  {bs.intensity.toFixed(0)} · {def.beat} Hz
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
                onChange={(_, v) => patchBand(id, v as number)}
              />
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
}
