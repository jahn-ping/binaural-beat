import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import * as Tone from 'tone';
import { CR_PRESETS, calculateCRFrequencies, CR_LIMITS } from './crConfig';
import type { CRParameters, CRPlaybackOrder } from './types';
import { CREngineExpanded } from './CREngineExpanded';
import CRFrequencyDisplay from './CRFrequencyDisplay';
import CROscilloscope from './CROscilloscope';
import CRLevelMeter from './CRLevelMeter';
import CRSpectrogram from './CRSpectrogram';
import EvidenceBadge from '../../components/EvidenceBadge';

const PLAYBACK_ORDERS: CRPlaybackOrder[] = ['pseudorandom', 'sequential', 'reverse'];
const PRESET_COLORS: Record<string, 'primary' | 'secondary' | 'warning' | 'info'> = {
  conservative: 'info',
  standard: 'primary',
  aggressive: 'warning',
  sleep: 'secondary',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface CRControlPanelProps {
  tinnitusFrequencyHz: number;
}

export default function CRControlPanel({ tinnitusFrequencyHz }: CRControlPanelProps) {
  const [params, setParams] = useState<CRParameters>({
    ...CR_PRESETS[1]!.parameters,
    tinnitusFrequencyHz,
    playbackOrder: 'pseudorandom',
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activePreset, setActivePreset] = useState<string>('standard');
  const [masterVolume, setMasterVolume] = useState(0.8);

  // Fully independent CR engine — no binaural engine dependency.
  const engineRef = useRef<CREngineExpanded | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new CREngineExpanded();
  }
  const engine = engineRef.current;

  useEffect(() => {
    engine.setOnTimeUpdate(setElapsed);
    return () => {
      engine.stop();
      engine.dispose();
      engineRef.current = null;
    };
  }, [engine]);

  // Sync tinnitus frequency
  useEffect(() => {
    setParams((p) => ({ ...p, tinnitusFrequencyHz }));
  }, [tinnitusFrequencyHz]);

  const frequencies = useMemo(
    () => calculateCRFrequencies(params.tinnitusFrequencyHz, params.erbSpacing),
    [params.tinnitusFrequencyHz, params.erbSpacing],
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = CR_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setParams((p) => ({
        ...p,
        ...preset.parameters,
        tinnitusFrequencyHz: p.tinnitusFrequencyHz,
      }));
      setActivePreset(presetId);
    },
    [],
  );

  const handleStart = useCallback(async () => {
    // Ensure the shared AudioContext is running (may be suspended on
    // mobile or after the binaural engine stopped).
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    await engine.start(params);
    setIsPlaying(true);
    setElapsed(0);
  }, [engine, params]);

  const handleStop = useCallback(() => {
    engine.stop();
    setIsPlaying(false);
  }, [engine]);

  const updateParam = <K extends keyof CRParameters>(key: K, value: CRParameters[K]) => {
    setParams((p) => ({ ...p, [key]: value }));
    setActivePreset(''); // custom
    if (isPlaying) engine.updateParameters({ [key]: value });
  };

  const maxSessionSec = CR_LIMITS.sessionMinutes.max * 60;
  const remaining = Math.max(0, maxSessionSec - elapsed);

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" component="div">
              CR Neuromodulation
            </Typography>
            <EvidenceBadge level="experimental" />
          </Box>
          {isPlaying && (
            <Chip
              label={`${formatTime(elapsed)} / ${formatTime(maxSessionSec)}`}
              color="primary"
              sx={{ fontFamily: 'monospace' }}
            />
          )}
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Experimental — 4 tones spaced around your pitch. Inspired by Coordinated Reset neuromodulation research.
          Not equivalent to clinical CR devices. Max 20 min session.
        </Typography>

        {/* Presets */}
        <Typography variant="caption" color="text.secondary">
          Presets
        </Typography>
        <ButtonGroup size="small" sx={{ mb: 2, display: 'flex' }}>
          {CR_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant={activePreset === preset.id ? 'contained' : 'outlined'}
              color={PRESET_COLORS[preset.id]}
              onClick={() => applyPreset(preset.id)}
              disabled={isPlaying}
              sx={{ flex: 1 }}
            >
              {preset.label}
            </Button>
          ))}
        </ButtonGroup>

        {/* Pitch Frequency Knob */}
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" color="text.secondary">
              Pitch Frequency
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`${Math.round(params.tinnitusFrequencyHz)} Hz`}
              sx={{ fontFamily: 'monospace' }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Center frequency for the 4 CR tones — lower values are easier to hear.
          </Typography>
          <Slider
            value={params.tinnitusFrequencyHz}
            min={100}
            max={8000}
            step={50}
            disabled={isPlaying}
            onChange={(_, v) => updateParam('tinnitusFrequencyHz', v as number)}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v} Hz`}
            marks={[
              { value: 500, label: '500' },
              { value: 1000, label: '1k' },
              { value: 2000, label: '2k' },
              { value: 4000, label: '4k' },
            ]}
          />
          {params.tinnitusFrequencyHz > 4000 && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
              ⚠️ High frequencies may be inaudible — try lowering to 1000–2000 Hz.
            </Typography>
          )}
        </Box>

        {/* Frequency Visualization */}
        <CRFrequencyDisplay
          tinnitusFrequencyHz={params.tinnitusFrequencyHz}
          erbSpacing={params.erbSpacing}
          amplitudes={params.amplitudes}
        />

        {/* Oscilloscope */}
        <Box sx={{ mt: 2 }}>
          <CROscilloscope isPlaying={isPlaying} height={120} />
        </Box>

        {/* Spectrogram */}
        <Box sx={{ mt: 1 }}>
          <CRSpectrogram
            engine={engine}
            isPlaying={isPlaying}
            tinnitusFrequencyHz={params.tinnitusFrequencyHz}
            erbSpacing={params.erbSpacing}
            height={180}
          />
        </Box>

        {/* Level Meter */}
        <CRLevelMeter engine={engine} isPlaying={isPlaying} />



        {/* Controls */}
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {/* ERB Spacing */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">ERB Spacing</Typography>
              <Typography variant="caption" color="text.secondary">{params.erbSpacing.toFixed(2)}</Typography>
            </Box>
            <Slider
              value={params.erbSpacing}
              min={CR_LIMITS.erbSpacing.min}
              max={CR_LIMITS.erbSpacing.max}
              step={CR_LIMITS.erbSpacing.step}
              disabled={isPlaying}
              onChange={(_, v) => updateParam('erbSpacing', v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v.toFixed(2)} ERB`}
            />
          </Box>

          {/* Burst Rate */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Burst Rate</Typography>
              <Typography variant="caption" color="text.secondary">{params.burstRateHz.toFixed(1)} Hz</Typography>
            </Box>
            <Slider
              value={params.burstRateHz}
              min={CR_LIMITS.burstRateHz.min}
              max={CR_LIMITS.burstRateHz.max}
              step={CR_LIMITS.burstRateHz.step}
              disabled={isPlaying}
              onChange={(_, v) => updateParam('burstRateHz', v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v.toFixed(1)} Hz`}
            />
          </Box>

          {/* Burst Duration */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Burst Duration</Typography>
              <Typography variant="caption" color="text.secondary">{params.burstDurationMs} ms</Typography>
            </Box>
            <Slider
              value={params.burstDurationMs}
              min={CR_LIMITS.burstDurationMs.min}
              max={CR_LIMITS.burstDurationMs.max}
              step={CR_LIMITS.burstDurationMs.step}
              disabled={isPlaying}
              onChange={(_, v) => updateParam('burstDurationMs', v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} ms`}
            />
          </Box>

          {/* Per-channel amplitudes */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Master Volume</Typography>
              <Typography variant="caption" color="text.secondary">{Math.round(masterVolume * 100)}%</Typography>
            </Box>
            <Slider
              value={masterVolume}
              min={0}
              max={1}
              step={0.01}
              onChange={(_, v) => {
                const val = v as number;
                setMasterVolume(val);
                engine.setMasterVolume(val);
              }}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
              sx={{ color: 'primary.main' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Per-Tone Volume
            </Typography>
            {params.amplitudes.map((amp, i) => {
              const freq = frequencies.frequenciesHz[i];
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: colors[i], minWidth: 70, fontFamily: 'monospace', fontSize: 10 }}
                  >
                    T{i + 1} {freq ? `${Math.round(freq)} Hz` : ''}
                  </Typography>
                  <Slider
                    value={amp}
                    min={0}
                    max={1}
                    step={0.01}
                    size="small"
                    disabled={isPlaying}
                    onChange={(_, v) => {
                      const newAmps = [...params.amplitudes] as [number, number, number, number];
                      newAmps[i] = v as number;
                      updateParam('amplitudes', newAmps);
                    }}
                    sx={{ color: colors[i] }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 30, textAlign: 'right' }}>
                    {Math.round(amp * 100)}%
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* Playback Order */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Playback Order
            </Typography>
            <ButtonGroup size="small" sx={{ display: 'flex' }}>
              {PLAYBACK_ORDERS.map((order) => (
                <Button
                  key={order}
                  variant={params.playbackOrder === order ? 'contained' : 'outlined'}
                  disabled={isPlaying}
                  onClick={() => updateParam('playbackOrder', order)}
                  sx={{ flex: 1, textTransform: 'capitalize' }}
                >
                  {order}
                </Button>
              ))}
            </ButtonGroup>
          </Box>
        </Stack>

        {/* Start/Stop */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          {!isPlaying ? (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrow />}
              onClick={handleStart}
              sx={{ flex: 1 }}
            >
              Start CR Session
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              startIcon={<Stop />}
              onClick={handleStop}
              sx={{ flex: 1 }}
            >
              Stop ({formatTime(remaining)} remaining)
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
