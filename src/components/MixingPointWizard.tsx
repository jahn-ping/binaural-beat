import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Typography } from '@mui/material';
import { getTinnitusEngine } from '../audio/tinnitus/TinnitusEngine';
import type { TinnitusNoiseType } from '../state/tinnitus';

export interface MixingPointWizardProps {
  open: boolean;
  noiseType: TinnitusNoiseType;
  onNoiseTypeChange: (t: TinnitusNoiseType) => void;
  volumeDb: number;
  onVolumeChange: (db: number) => void;
  onConfirm: (mixingPointDb: number) => void;
  onClose: () => void;
}

const NOISE_TYPES: TinnitusNoiseType[] = ['white', 'pink', 'brown'];

/**
 * P1.1 — "Find your mixing point": the level where the sound just blends with
 * the tinnitus (you can still hear your tinnitus beneath it). The user adjusts
 * the volume manually — never an automated "increase until it disappears"
 * sweep (per the gauntlet's safety guardrails). Enrichment is set 6 dB below.
 */
export default function MixingPointWizard({
  open,
  noiseType,
  onNoiseTypeChange,
  volumeDb,
  onVolumeChange,
  onConfirm,
  onClose,
}: MixingPointWizardProps) {
  const [step, setStep] = useState(0);
  const [found, setFound] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);

  // Level test: mute/unmute the noise so the user can confirm it's actually
  // audible before hunting for the blend point.
  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    getTinnitusEngine().setNoiseMuted(next);
  };

  const reset = (): void => {
    setStep(0);
    setFound(null);
    setMuted(false);
    getTinnitusEngine().setNoiseMuted(false);
  };

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      onClose={onClose}
      TransitionProps={{ onExited: reset }}
    >
      <DialogTitle>🎯 Mixing Point Calibration</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Find the level where the sound just begins to blend with your tinnitus. You should still
          be able to hear your tinnitus beneath the noise. This is a self-calibration tool, not a
          medical assessment.
        </Typography>

        {step === 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Step 1 — Choose your sound
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Select the noise type that feels most comfortable:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {NOISE_TYPES.map((t) => (
                <Button
                  key={t}
                  size="small"
                  variant={noiseType === t ? 'contained' : 'outlined'}
                  onClick={() => onNoiseTypeChange(t)}
                  sx={{ textTransform: 'capitalize', minWidth: 64 }}
                >
                  {t}
                </Button>
              ))}
            </Box>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Step 2 — Find your mixing point
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Slowly raise the volume to a comfortable starting point — where the sound just blends
              with your tinnitus. You can still hear your tinnitus beneath it. When you find the
              blend point, press “I Found It”. Back / Cancel are always available.
            </Typography>
            <Slider
              value={volumeDb}
              min={-60}
              max={0}
              step={1}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} dB`}
              onChange={(_, v) => onVolumeChange(v as number)}
            />
            <Button size="small" variant={muted ? 'contained' : 'outlined'} onClick={toggleMute} sx={{ mt: 1 }}>
              {muted ? '🔊 Bring the noise back' : '🔇 Silence it (compare)'}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {muted
                ? 'Noise muted — listen for your tinnitus beneath the silence, then bring it back.'
                : 'Noise playing — confirm you can hear it before you find the blend point.'}
            </Typography>
          </Box>
        )}

        {step === 2 && found !== null && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Step 3 — Confirmation
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Your mixing point is approximately <strong>{found} dB</strong>.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Your enrichment level will be set 6 dB below your mixing point for comfortable habituation.
            </Typography>
          </Box>
        )}

        {/* Progress dots */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: i === step ? 'primary.main' : 'grey.300' }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        {step === 0 && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={() => setStep(1)}>
              Next
            </Button>
          </>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button
              variant="contained"
              onClick={() => {
                setFound(volumeDb);
                setStep(2);
              }}
            >
              I Found It
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                onConfirm(found!);
                onClose();
              }}
            >
              Start Session
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
