import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Collapse,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import { useAudioEngine } from '../audio/AudioEngineContext';
import { getTinnitusEngine } from '../audio/tinnitus/TinnitusEngine';
import { CRControlPanel } from '../features/cr';
import EvidenceBadge from './EvidenceBadge';
import PanicStopButton from './PanicStopButton';
import {
  CURRENT_DISCLAIMER_VERSION,
  enrichmentLevelDb,
  levelLabel,
  loadTinnitusState,
  saveTinnitusState,
  type TinnitusMode,
  type TinnitusNoiseType,
  type TinnitusParams,
} from '../state/tinnitus';
import TinnitusDisclaimer from './TinnitusDisclaimer';
import MixingPointWizard from './MixingPointWizard';

const NOISE_TYPES: TinnitusNoiseType[] = ['white', 'pink', 'brown'];
const SESSION_OPTIONS = [10, 20, 30, 45, 60];

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Tinnitus support card — fully self-contained (own state + engine). The
 * binaural AudioEngine and its noise-gen graph are untouched; this subsystem
 * owns its own safety bus and session timer.
 */
export default function TinnitusPanel() {
  const { isPaused } = useAudioEngine();
  const engine = getTinnitusEngine();
  const [params, setParams] = useState<TinnitusParams>(() => loadTinnitusState());
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const wizardWasEnabled = useRef(false);
  const calibrateBtnRef = useRef<HTMLButtonElement | null>(null);
  const enabledInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveTinnitusState(params);
  }, [params]);

  useEffect(() => {
    engine.applySettings(params);
  }, [engine, params]);

  // Freeze the session countdown while the binaural transport is paused.
  useEffect(() => {
    engine.setPaused(isPaused);
  }, [engine, isPaused]);

  // P0.1 + critique3 P0 — show the notice until the CURRENT version is accepted
  // (a version bump re-shows it, e.g. the −24 dB default change).
  const shouldShowDisclaimer =
    !params.disclaimerAcknowledged || params.disclaimerVersion < CURRENT_DISCLAIMER_VERSION;
  useEffect(() => {
    if (shouldShowDisclaimer) setDisclaimerOpen(true);
  }, [shouldShowDisclaimer]);

  const unlocked = params.disclaimerAcknowledged && params.disclaimerVersion >= CURRENT_DISCLAIMER_VERSION;

  const patch = (p: Partial<TinnitusParams>): void => setParams((s) => ({ ...s, ...p }));

  const toggleEnabled = (v: boolean): void => {
    setParams((s) => ({ ...s, enabled: v }));
    void engine.setActive(v);
  };

  const openWizard = (): void => {
    wizardWasEnabled.current = params.enabled;
    if (!params.enabled) toggleEnabled(true);
    setWizardOpen(true);
  };
  const closeWizard = (): void => {
    setWizardOpen(false);
    if (!wizardWasEnabled.current) toggleEnabled(false);
  };

  const startSession = (): void => {
    if (params.sessionMinutes <= 0) return;
    engine.startSession(
      params.sessionMinutes,
      (ms) => setRemaining(ms),
      () => {
        setRemaining(null);
        // terminal transition (critique3 P0-2.3): session end stops the engine
        setParams((s) => ({ ...s, enabled: false }));
      },
    );
  };
  const endSession = (): void => {
    engine.endSession();
    setRemaining(null);
    setParams((s) => ({ ...s, enabled: false }));
  };

  // P1 — pitch matcher duration cap: sustained pure-tone exposure limit.
  const [pitchSecondsLeft, setPitchSecondsLeft] = useState<number | null>(null);

  // New feature toggles
  const [crEnabled, setCrEnabled] = useState(false);
  const [sweepEnabled, setSweepEnabled] = useState(false);
  const [dailyExposure, setDailyExposure] = useState<{ hours: number; warning: boolean } | null>(null);

  // Check daily exposure on mount
  useEffect(() => {
    import('../audio/tinnitus/persistence/SessionHistoryStore').then(({ getSessionHistory }) => {
      getSessionHistory().checkDailyWarning().then(setDailyExposure);
    });
  }, []);
  useEffect(() => {
    if (!params.pitchMatcherEnabled || !unlocked) {
      setPitchSecondsLeft(null);
      return;
    }
    setPitchSecondsLeft(120);
    const id = setInterval(() => {
      setPitchSecondsLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          clearInterval(id);
          setParams((prev) => (prev.pitchMatcherEnabled ? { ...prev, pitchMatcherEnabled: false } : prev));
          return null;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [params.pitchMatcherEnabled, unlocked]);

  return (
    <>
      <TinnitusDisclaimer
        open={disclaimerOpen}
        onAcknowledge={() => {
          setDisclaimerOpen(false);
          patch({ disclaimerAcknowledged: true, disclaimerVersion: CURRENT_DISCLAIMER_VERSION });
          // focus the (now-enabled) switch after the re-render, before the exit transition
          requestAnimationFrame(() => enabledInputRef.current?.focus());
        }}
      />

      <MixingPointWizard
        open={wizardOpen}
        noiseType={params.noiseType}
        onNoiseTypeChange={(t) => patch({ noiseType: t })}
        volumeDb={params.volumeDb}
        onVolumeChange={(db) => patch({ volumeDb: db })}
        onConfirm={(mixingPointDb) =>
          patch({
            mixingPointDb,
            volumeDb: enrichmentLevelDb(mixingPointDb, params.enrichmentOffsetDb),
          })
        }
        onClose={() => {
          closeWizard();
          calibrateBtnRef.current?.focus(); // before the exit transition (a11y)
        }}
      />

      <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
        <CardContent sx={{ pb: '12px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6" component="div">
              Tinnitus Support
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              label="Sound management — not a medical device"
            />
          </Box>

          {!unlocked && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Review the health &amp; safety notice to unlock.
            </Typography>
          )}

          {/* Daily exposure warning (top of card) */}
          {dailyExposure?.warning && (
            <Box sx={{ mb: 1, p: 1, bgcolor: 'warning.dark', borderRadius: 1 }}>
              <Typography variant="caption" color="warning.contrastText">
                You've listened for {dailyExposure.hours.toFixed(1)} hours today. Consider taking a break.
              </Typography>
            </Box>
          )}

          {/* Master on/off + panic stop (always visible) + unlock re-open */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Switch
              checked={params.enabled}
              disabled={!unlocked}
              inputRef={enabledInputRef}
              onChange={(e) => toggleEnabled(e.target.checked)}
            />
            <Typography variant="caption" color="text.secondary">
              {params.enabled ? 'On' : 'Off'}
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              {/* P0 — panic stop: one obvious tap to silence, bypasses the 5 s fade */}
              <Button
                size="small"
                variant="contained"
                color="error"
                onClick={() => {
                  engine.panicStop();
                  setRemaining(null);
                  setParams((s) => ({ ...s, enabled: false }));
                }}
              >
                ⏹ Panic stop
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDisclaimerOpen(true)}>
                Health &amp; Safety
              </Button>
            </Box>
          </Box>

          {/* Mode: enrichment (below mixing point) vs masking (covers tinnitus) */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Mode
            </Typography>
            <EvidenceBadge level="symptom-management" />
          </Box>
          <ButtonGroup size="small" sx={{ mb: 1, display: 'flex' }} disabled={!unlocked || !params.enabled}>
            {(['enrichment', 'masking'] as TinnitusMode[]).map((m) => (
              <Button
                key={m}
                // critique3 P0-2.2: masking needs a known pitch — gate it behind calibration
                disabled={!unlocked || !params.enabled || (m === 'masking' && params.mixingPointDb === null)}
                variant={params.mode === m ? 'contained' : 'outlined'}
                onClick={() => patch({ mode: m })}
                sx={{ textTransform: 'capitalize', flex: 1 }}
              >
                {m === 'enrichment' ? 'Enrichment (below blend point)' : 'Masking (covers it)'}
              </Button>
            ))}
          </ButtonGroup>
          {params.mixingPointDb === null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Calibrate a mixing point to unlock masking.
            </Typography>
          )}

          {/* Sound type */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
              Sound
            </Typography>
            {NOISE_TYPES.map((c) => (
              <Button
                key={c}
                size="small"
                disabled={!unlocked || !params.enabled}
                variant={params.noiseType === c ? 'contained' : 'outlined'}
                onClick={() => patch({ noiseType: c })}
                sx={{ textTransform: 'capitalize', minWidth: 52 }}
              >
                {c}
              </Button>
            ))}
          </Box>

          {/* Level + mixing point */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              Level (dB)
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color={levelLabel(params.volumeDb) === 'Loud' ? 'error' : levelLabel(params.volumeDb) === 'Moderate' ? 'warning' : 'default'}
              label={levelLabel(params.volumeDb)}
            />
          </Box>
          <Slider
            value={params.volumeDb}
            min={-60}
            max={0}
            step={1}
            disabled={!unlocked || !params.enabled}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v} dB`}
            onChange={(_, v) => patch({ volumeDb: v as number })}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Button size="small" variant="outlined" disabled={!unlocked} ref={calibrateBtnRef} onClick={openWizard}>
              🎯 Calibrate mixing point…
            </Button>
            {params.mixingPointDb !== null && (
              <Chip
                size="small"
                variant="outlined"
                label={`Mix point ${params.mixingPointDb} dB → enrichment ${enrichmentLevelDb(
                  params.mixingPointDb,
                  params.enrichmentOffsetDb,
                )} dB`}
              />
            )}
          </Box>

          {/* Pitch matcher (P1.2) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Pitch matcher{' '}
              <Typography component="span" variant="caption" color="text.secondary">
                (optional — sound customization, not a diagnostic test)
              </Typography>
            </Typography>
            <Switch
              size="small"
              checked={params.pitchMatcherEnabled}
              disabled={!unlocked}
              onChange={(e) => patch({ pitchMatcherEnabled: e.target.checked })}
            />
          </Box>
          <Collapse in={params.pitchMatcherEnabled}>
            <Typography variant="caption" color="text.secondary">
              Approximate tinnitus pitch
            </Typography>
            <Slider
              value={params.pitchHz}
              min={100}
              max={8000}
              step={50}
              disabled={!unlocked}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} Hz`}
              onChange={(_, v) => patch({ pitchHz: v as number })}
            />
            {pitchSecondsLeft !== null && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                ⏳ Auto-stops in {pitchSecondsLeft}s (sustained-tone limit)
              </Typography>
            )}
          </Collapse>

          {/* Notched sound (P1.4 — mixed evidence) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Notched sound
              </Typography>
              <EvidenceBadge level="mixed-evidence" />
            </Box>
            <Switch
              size="small"
              checked={params.notchEnabled}
              disabled={!unlocked}
              onChange={(e) => patch({ notchEnabled: e.target.checked })}
            />
          </Box>
          <Collapse in={params.notchEnabled}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Removes a narrow band around your pitch ({params.pitchHz} Hz). Research results are mixed.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Notch width
            </Typography>
            <Slider
              value={params.notchBandwidthHz}
              min={50}
              max={500}
              step={25}
              disabled={!unlocked}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} Hz`}
              onChange={(_, v) => patch({ notchBandwidthHz: v as number })}
            />
          </Collapse>

          {/* Breathing modulation (P1.5) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Breathing modulation
              </Typography>
              <EvidenceBadge level="relaxation-support" />
            </Box>
            <Switch
              size="small"
              checked={params.breathingEnabled}
              disabled={!unlocked}
              onChange={(e) => patch({ breathingEnabled: e.target.checked })}
            />
          </Box>

          {/* CR-Inspired Neuromodulation (P1 — experimental) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                CR neuromodulation
              </Typography>
              <EvidenceBadge level="experimental" />
            </Box>
            <Switch
              size="small"
              checked={crEnabled}
              disabled={!unlocked}
              onChange={(e) => setCrEnabled(e.target.checked)}
            />
          </Box>
          <Collapse in={crEnabled} timeout={300}>
            <CRControlPanel tinnitusFrequencyHz={params.pitchHz} />
          </Collapse>

          {/* Frequency Sweep + Residual Inhibition (P1) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Frequency sweep
              </Typography>
              <EvidenceBadge level="symptom-management" />
            </Box>
            <Switch
              size="small"
              checked={sweepEnabled}
              disabled={!unlocked}
              onChange={(e) => setSweepEnabled(e.target.checked)}
            />
          </Box>
          <Collapse in={sweepEnabled}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Sweeps around your pitch for 120s. Rate how suppressed your tinnitus feels afterward.
            </Typography>
          </Collapse>

          <Collapse in={params.breathingEnabled}>
            <Typography variant="caption" color="text.secondary">
              Swell rate — relaxation (slow breathing ≈ 0.08 Hz)
            </Typography>
            <Slider
              value={params.breathingRateHz}
              min={0.04}
              max={0.2}
              step={0.01}
              disabled={!unlocked}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v.toFixed(2)} Hz`}
              onChange={(_, v) => patch({ breathingRateHz: v as number })}
            />
          </Collapse>

          {/* Session timer (P0.3) */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Session timer (fade in / auto fade out)
            </Typography>
            <ButtonGroup size="small" sx={{ mb: 1, display: 'flex' }} disabled={!unlocked}>
              {SESSION_OPTIONS.map((m) => (
                <Button
                  key={m}
                  variant={params.sessionMinutes === m ? 'contained' : 'outlined'}
                  onClick={() => patch({ sessionMinutes: m })}
                  sx={{ flex: 1 }}
                >
                  {m}m
                </Button>
              ))}
            </ButtonGroup>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {remaining !== null ? (
                <>
                  <Button variant="outlined" color="warning" size="small" onClick={endSession}>
                    End session
                  </Button>
                  <Chip label={`⏳ ${formatCountdown(remaining)}`} color="primary" sx={{ fontFamily: 'monospace' }} />
                </>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  disabled={!unlocked || params.sessionMinutes <= 0}
                  onClick={startSession}
                >
                  Start {params.sessionMinutes}m session
                </Button>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Consistency of use (daily sessions) matters more than the specific sound type.
            </Typography>
          </Box>

          {params.mixingPointDb === null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Tip: run the mixing-point calibration first for a comfortable enrichment level.
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Mobile fixed-position panic stop (safety property) */}
      <PanicStopButton
        onPanicStop={() => {
          engine.panicStop();
          setRemaining(null);
          setParams((s) => ({ ...s, enabled: false }));
        }}
      />
    </>
  );
}
