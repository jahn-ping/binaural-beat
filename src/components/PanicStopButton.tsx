import { Button } from '@mui/material';

interface PanicStopButtonProps {
  onPanicStop: () => void;
}

/**
 * Fixed-position panic stop button — always visible, thumb-reachable on mobile.
 * Safety property: one tap silences everything in ~50ms.
 */
export default function PanicStopButton({ onPanicStop }: PanicStopButtonProps) {
  return (
    <Button
      fullWidth
      variant="contained"
      color="error"
      onClick={onPanicStop}
      sx={{
        position: { xs: 'fixed', md: 'static' },
        bottom: { xs: 16, md: 'auto' },
        left: { xs: 16, md: 'auto' },
        right: { xs: 16, md: 'auto' },
        zIndex: 1000,
        minHeight: { xs: 56, md: 36 },
        fontSize: { xs: '1.1rem', md: '0.875rem' },
        fontWeight: 700,
        display: { xs: 'block', md: 'none' },
        boxShadow: '0 4px 12px rgba(211,47,47,0.4)',
        mt: { xs: 2, md: 0 },
      }}
    >
      PANIC STOP
    </Button>
  );
}
