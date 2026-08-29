import { Box, Dialog, DialogContent, DialogTitle, IconButton, Link, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called once the close transition finishes — restore focus to the trigger (a11y). */
  onExited?: () => void;
}

/** About dialog — reference site's text, EEG sections omitted (no-EEG app). */
export default function AboutDialog({ open, onClose, onExited }: AboutDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      maxWidth="sm"
      fullWidth
      TransitionProps={onExited ? { onExited } : undefined}
    >
      <DialogTitle>
        About
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1">
          Pressing start audio will start playing basic binaural beats.
        </Typography>
        <Typography variant="body2" mt={1} mb={2} pl={2}>
          Under audio settings, you can change the parameters of the audio synthesis for each channel.
        </Typography>
        <Typography variant="body1">
          For the binaural effect, use stereo headphones — each ear needs its own channel.
        </Typography>
        <Typography variant="body2" mt={2} pl={2}>
          Keep the volume at a comfortable level — extended listening above roughly 85 dB can
          damage hearing over time. If your ears ring after a session, turn it down and take breaks.
        </Typography>
        <Typography variant="body2" mt={1} pl={2}>
          A note on the science: controlled studies of binaural beats show mixed results. Treat
          sessions as relaxation and experimentation, not as medical treatment.
        </Typography>
        <Typography variant="body2" mt={1} pl={2}>
          The default modulation frequencies are set to 7.51 Hz, a value calculated to be the primary
          Schumann resonance oscillation in the 80&apos;s.
        </Typography>
        <Box mt={1} mb={2} pl={2}>
          <Typography variant="body2">
            You can find the current value{' '}
            <Link href="http://sosrff.tsu.ru/?page_id=9" target="_blank" rel="noreferrer">
              here
            </Link>
            .
          </Typography>
        </Box>
        <Typography variant="subtitle2" color="text.secondary">
          Built with React, Tone.js and MUI — a no-EEG replica of the reference binaural app.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
