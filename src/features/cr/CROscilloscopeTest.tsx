import { useState } from 'react';
import { Button, Stack, Typography, Box } from '@mui/material';
import * as Tone from 'tone';

/**
 * Minimal CR audio test — no scheduling, no shared buses.
 * Just 4 oscillators with manual gain envelopes.
 */
export default function CROscilloscopeTest() {
  const [status, setStatus] = useState('idle');
  const [oscillators, setOscillators] = useState<Tone.Oscillator[]>([]);
  const [gains, setGains] = useState<Tone.Gain[]>([]);

  const start = async () => {
    // Stop any previous
    stop();

    await Tone.start();
    console.log('[CR Test] Context state:', Tone.context.state);

    const freqs = [3526, 3838, 4162, 4474]; // 4000 Hz ± ERB spacing
    const newOscs: Tone.Oscillator[] = [];
    const newGains: Tone.Gain[] = [];

    for (let i = 0; i < 4; i++) {
      const gain = new Tone.Gain(0.3);  // fixed gain so we can hear it
      const osc = new Tone.Oscillator({ frequency: freqs[i], type: 'sine' });
      osc.connect(gain);
      gain.connect(Tone.getDestination());
      osc.start();
      newOscs.push(osc);
      newGains.push(gain);
      console.log(`[CR Test] T${i + 1} started at ${freqs[i]} Hz`);
    }

    setOscillators(newOscs);
    setGains(newGains);
    setStatus('playing');

    // Simple burst simulation: play all 4 simultaneously, then silence, repeat
    let idx = 0;
    const burstInterval = setInterval(() => {
      newGains.forEach((g, i) => {
        const now = Tone.now();
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(0, now);
        if (i === idx % 4) {
          g.gain.linearRampToValueAtTime(0.3, now + 0.01);
          g.gain.setValueAtTime(0.3, now + 0.08);
          g.gain.linearRampToValueAtTime(0, now + 0.1);
          console.log(`[CR Test] burst T${i + 1} at ${freqs[i]} Hz`);
        }
      });
      idx++;
    }, 500);

    // Store interval for cleanup
    (window as any).__crTestInterval = burstInterval;
  };

  const stop = () => {
    if ((window as any).__crTestInterval) {
      clearInterval((window as any).__crTestInterval);
      (window as any).__crTestInterval = null;
    }
    oscillators.forEach(o => { try { o.stop(); o.dispose(); } catch {} });
    gains.forEach(g => { try { g.dispose(); } catch {} });
    setOscillators([]);
    setGains([]);
    setStatus('idle');
  };

  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'error.main', borderRadius: 1, mt: 2 }}>
      <Typography variant="subtitle2" color="error">
        CR Audio Debug Test
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Click Start — you should hear 4 sine tones pulsing in sequence.
        If you hear nothing, the issue is with Tone.js audio context.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          color={status === 'playing' ? 'error' : 'primary'}
          onClick={status === 'playing' ? stop : start}
        >
          {status === 'playing' ? 'Stop Test' : 'Start Test'}
        </Button>
        <Typography variant="body2" sx={{ alignSelf: 'center' }}>
          Status: {status}
        </Typography>
      </Stack>
    </Box>
  );
}
