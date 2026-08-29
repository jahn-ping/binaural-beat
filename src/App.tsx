import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Collapse,
  Container,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Toolbar,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import InfoIcon from '@mui/icons-material/Info';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import IconButton from '@mui/material/IconButton';
import { AudioEngineProvider, useAudioEngine } from './audio/AudioEngineContext';
import ChannelPanel from './components/ChannelPanel';
import NoisePanel from './components/NoisePanel';
import NoiseABTest from './components/NoiseABTest';
import EntrainmentPanel from './components/EntrainmentPanel';
import TinnitusPanel from './components/TinnitusPanel';
import PresetManager from './components/PresetManager';
import { getTinnitusEngine } from './audio/tinnitus/TinnitusEngine';
import AboutDialog from './components/AboutDialog';
import Waveform from './components/Waveform';
import OutputMeter from './components/OutputMeter';
import MasterVolumeKnob from './components/MasterVolumeKnob';
import { PRESETS } from './audio/presets';
import { SCHEDULES } from './state/schedules';
import {
  applyPreset,
  beatOf,
  loadSettings,
  saveSettings,
  type Settings,
} from './state/settings';
import { usePresets, snapshotAudio, saveLastSession } from './state/presets';
import type { BinauralPreset } from './state/presets';
import { loadTinnitusState } from './state/tinnitus';
import type { ChannelParams, NoiseParams } from './audio/engine';

const TIMER_OPTIONS = [0, 15, 30, 45, 60];

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function AppInner(): JSX.Element {
  const { engine, isPlaying, isPaused, play, pause, resume, stop } = useAudioEngine();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const aboutBtnRef = useRef<HTMLButtonElement | null>(null);
  const expiryRef = useRef<number | null>(null);
  const remainingRef = useRef<number | null>(null);
  // id of the schedule the persisted scheduleElapsedMs belongs to (P2 resume)
  const elapsedForIdRef = useRef<string | null>(null);
  const presetManager = usePresets();

  // Apply a loaded preset to settings (user clicks Load in PresetManager).
  const handleApplyPreset = useCallback(
    (preset: BinauralPreset) => {
      setSettings((s) => ({
        ...s,
        left: { ...preset.audio.left },
        right: { ...preset.audio.right },
        master: preset.audio.master,
        manualEnabled: preset.audio.manualEnabled,
        noise: { ...s.noise, ...preset.audio.noise },
        entrainment: { ...s.entrainment, ...preset.audio.entrainment },
        linkedMode: preset.audio.linkedMode,
        timerMinutes: preset.audio.timerMinutes,
      }));
    },
    [],
  );

  // Last-session autosave — debounced 2 s after last settings change
  useEffect(() => {
    const id = setTimeout(() => {
      saveLastSession(snapshotAudio(settings), loadTinnitusState());
    }, 2000);
    return () => clearTimeout(id);
  }, [settings]);

  // Single dispatcher: settings -> engine (task 3.3). Runs on every settings change.
  useEffect(() => {
    engine.applySettings(settings);
    saveSettings(settings);
  }, [engine, settings]);

  // Master knob drives BOTH output buses: the binaural engine (via
  // settings.master in applySettings) and the tinnitus engine (own safety bus,
  // mirrored via setMasterDb AFTER its limiter/-12 dB cap).
  useEffect(() => {
    getTinnitusEngine().setMasterDb(settings.master);
  }, [settings.master]);

  // Session timer (task 7.3): countdown + sleep-fade stop on expiry.
  // Freezes while paused (S2) — remaining is preserved so resume continues where it left off.
  useEffect(() => {
    if (settings.timerMinutes === 0 || !isPlaying) {
      setRemaining(null);
      remainingRef.current = null;
      expiryRef.current = null;
      return;
    }
    if (isPaused) {
      if (expiryRef.current !== null) {
        const left = Math.max(0, expiryRef.current - Date.now());
        remainingRef.current = left;
        setRemaining(left);
        expiryRef.current = null;
      }
      return;
    }
    const base = remainingRef.current ?? settings.timerMinutes * 60_000;
    remainingRef.current = null;
    expiryRef.current = Date.now() + base;
    const tick = (): void => {
      if (expiryRef.current === null) return;
      const left = expiryRef.current - Date.now();
      remainingRef.current = left;
      setRemaining(left);
      if (left <= 0) {
        engine.sleepFadeStop();
        setRemaining(null);
        remainingRef.current = null;
        expiryRef.current = null;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [settings.timerMinutes, isPlaying, isPaused, engine]);

  const patchLeft = (patch: Partial<ChannelParams>): void =>
    setSettings((s) => ({ ...s, left: { ...s.left, ...patch } }));
  const patchRight = (patch: Partial<ChannelParams>): void =>
    setSettings((s) => ({ ...s, right: { ...s.right, ...patch } }));
  const patchNoise = (patch: Partial<NoiseParams>): void =>
    setSettings((s) => ({ ...s, noise: { ...s.noise, ...patch } }));

  // Linked mode: base + beat derive the other carrier (spec: audio-engine linked editing).
  const setLinkedBase = (base: number): void =>
    setSettings((s) => {
      const beat = beatOf(s);
      return { ...s, left: { ...s.left, freq: base }, right: { ...s.right, freq: base + beat } };
    });
  const setLinkedBeat = (beat: number): void =>
    setSettings((s) => ({ ...s, right: { ...s.right, freq: s.left.freq + beat } }));

  // Entrainment schedule: engine-owned runner (critique S1 item 5 — no App
  // setInterval drift). The engine freezes the clock while paused and fires
  // onTick with interpolated bands + elapsed; onFinish clears the selection.
  // P2: scheduleElapsedMs is persisted each tick so a reload resumes the
  // timeline where it left off (first run after mount). Switching to a
  // different schedule resets it.
  useEffect(() => {
    const sched = settings.entrainment.schedule;
    if (!sched || !isPlaying) return;
    const def = SCHEDULES[sched];
    if (!def) return;
    let elapsed = 0;
    if (elapsedForIdRef.current === null) {
      elapsed = settings.scheduleElapsedMs; // resume persisted progress after reload
      elapsedForIdRef.current = sched;
    } else if (elapsedForIdRef.current !== sched) {
      elapsedForIdRef.current = sched; // genuine switch -> start fresh
      if (settings.scheduleElapsedMs !== 0) setSettings((s) => ({ ...s, scheduleElapsedMs: 0 }));
    } else {
      elapsed = settings.scheduleElapsedMs;
    }
    engine.setSchedule(
      def,
      settings.entrainment.bands,
      (bands, elapsedMs) =>
        setSettings((s) => ({
          ...s,
          entrainment: { ...s.entrainment, bands, preset: 'Custom' },
          scheduleElapsedMs: elapsedMs,
        })),
      () => {
        elapsedForIdRef.current = null;
        setSettings((s) => ({ ...s, entrainment: { ...s.entrainment, schedule: '' }, scheduleElapsedMs: 0 }));
      },
      elapsed,
    );
    return () => engine.clearSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, settings.entrainment.schedule, isPlaying]);

  const beat = beatOf(settings);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Headphones advisory (task 7.4) */}
      <Collapse in={!settings.headphonesDismissed}>
        <Alert
          severity="info"
          icon={<HeadphonesIcon />}
          sx={{ borderRadius: 0 }}
          onClose={() => setSettings((s) => ({ ...s, headphonesDismissed: true }))}
        >
          For the binaural effect, use stereo headphones — each ear needs its own channel.
        </Alert>
      </Collapse>

      {/* Header: title + master volume knob (task 1.3 / 7.1) */}
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
            Binaural Beat Generator
          </Typography>
          <Chip
            label={`Beat: ${beat.toFixed(2)} Hz`}
            color="secondary"
            sx={{ mr: 2, fontFamily: 'monospace' }}
          />
          <MasterVolumeKnob value={settings.master} onChange={(db) => setSettings((s) => ({ ...s, master: db }))} />
          <IconButton
            ref={aboutBtnRef}
            aria-label="About"
            color="inherit"
            onClick={() => setAboutOpen(true)}
            sx={{ ml: 1 }}
          >
            <InfoIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={3}>
          {/* Transport bar (task 4.3) */}
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            {isPlaying ? (
              <>
                <Button
                  variant="outlined"
                  color="warning"
                  size="large"
                  startIcon={isPaused ? <PlayArrowIcon /> : <PauseIcon />}
                  onClick={isPaused ? resume : pause}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button variant="contained" color="error" size="large" startIcon={<StopIcon />} onClick={stop}>
                  Stop
                </Button>
              </>
            ) : (
              <Button variant="contained" color="success" size="large" startIcon={<PlayArrowIcon />} onClick={play}>
                Play
              </Button>
            )}

            <Select
              size="small"
              value={PRESETS.some((p) => p.left.freq === settings.left.freq && p.right.freq === settings.right.freq)
                ? PRESETS.find((p) => p.left.freq === settings.left.freq && p.right.freq === settings.right.freq)!.id
                : ''}
              onChange={(e) => setSettings((s) => applyPreset(s, e.target.value))}
              displayEmpty
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="" disabled>
                Preset…
              </MenuItem>
              {PRESETS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} — {p.description}
                </MenuItem>
              ))}
            </Select>

            <Button
              variant="outlined"
              size="small"
              startIcon={<FolderSpecialIcon />}
              onClick={() => setPresetManagerOpen(true)}
            >
              Presets…
            </Button>

            <ButtonGroup size="small">
              {TIMER_OPTIONS.map((m) => (
                <Button
                  key={m}
                  variant={settings.timerMinutes === m ? 'contained' : 'outlined'}
                  onClick={() => setSettings((s) => ({ ...s, timerMinutes: m }))}
                >
                  {m === 0 ? 'Off' : `${m}m`}
                </Button>
                ))}
            </ButtonGroup>
            {remaining !== null && (
              <Chip label={`⏳ ${formatCountdown(remaining)}`} color="primary" sx={{ fontFamily: 'monospace' }} />
            )}
          </Stack>

          {/* Independent toggles (S2): manual tones bus on/off next to linked mode */}
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.manualEnabled}
                  onChange={(e) => setSettings((s) => ({ ...s, manualEnabled: e.target.checked }))}
                />
              }
              label="Manual tones"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.linkedMode}
                  onChange={(e) => setSettings((s) => ({ ...s, linkedMode: e.target.checked }))}
                />
              }
              label="Linked frequency mode"
            />
            {settings.linkedMode && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Base {settings.left.freq.toFixed(2)} Hz · Beat +{beat.toFixed(2)} Hz → R {settings.right.freq.toFixed(2)} Hz
                </Typography>
                <Button size="small" onClick={() => setLinkedBase(settings.left.freq + 1)}>
                  Base +1
                </Button>
                <Button size="small" onClick={() => setLinkedBase(settings.left.freq - 1)}>
                  Base −1
                </Button>
                <Button size="small" onClick={() => setLinkedBeat(beat + 0.5)}>
                  Beat +0.5
                </Button>
                <Button size="small" onClick={() => setLinkedBeat(beat - 0.5)}>
                  Beat −0.5
                </Button>
              </>
            )}
          </Stack>

          {/* About dialog (reference feature); focus returns to the About button on close (a11y) */}
          <AboutDialog
            open={aboutOpen}
            onClose={() => {
              aboutBtnRef.current?.focus(); // before the exit transition (avoids the aria-hidden warning)
              setAboutOpen(false);
            }}
            onExited={() => aboutBtnRef.current?.focus()}
          />

          {/* Preset Manager modal */}
          <PresetManager
            open={presetManagerOpen}
            onClose={() => setPresetManagerOpen(false)}
            currentAudio={snapshotAudio(settings)}
            currentTinnitus={loadTinnitusState()}
            onApply={handleApplyPreset}
            presets={presetManager}
          />

          {/* Channel panels (task 4.1) */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <ChannelPanel side="Left" params={settings.left} disabled={false} onChange={patchLeft} />
            <ChannelPanel
              side="Right"
              params={settings.right}
              disabled={settings.linkedMode}
              onChange={patchRight}
            />
          </Stack>

          {/* Noise panel (tasks 5.1/5.2) */}
          <NoisePanel params={settings.noise} onChange={patchNoise} />

          {/* Diagnostic A/B: binaural noise vs tinnitus noise (by-ear comparison) */}
          <NoiseABTest
            noise={settings.noise}
            onNoiseChange={patchNoise}
            isPlaying={isPlaying}
            play={play}
          />

          {/* Entrainment mixer (webQ-synthesized) */}
          <EntrainmentPanel
            state={settings.entrainment}
            scheduleActive={settings.entrainment.schedule !== ''}
            onChange={(patch) =>
              setSettings((s) => ({ ...s, entrainment: { ...s.entrainment, ...patch } }))
            }
          />

          {/* Tinnitus support (webQ-synthesized) — self-contained subsystem, own safety bus */}
          <TinnitusPanel />

          {/* Output meter (P2) + waveforms (task 6.2) */}
          <OutputMeter engine={engine} active={isPlaying} />
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Waveform title="Left" channel="L" engine={engine} active={isPlaying} color="#4dd0e1" />
            <Waveform title="Combined" channel="C" engine={engine} active={isPlaying} color="#7c4dff" />
            <Waveform title="Right" channel="R" engine={engine} active={isPlaying} color="#ffb74d" />
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default function App(): JSX.Element {
  return (
    <AudioEngineProvider>
      <AppInner />
    </AudioEngineProvider>
  );
}