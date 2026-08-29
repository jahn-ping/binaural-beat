import { Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
import { TINNITUS_DISCLAIMER_TEXT } from '../state/tinnitus';

export interface TinnitusDisclaimerProps {
  open: boolean;
  onAcknowledge: () => void;
}

/** P0.1 — health & safety disclaimer. Must be acknowledged before tinnitus features unlock. */
export default function TinnitusDisclaimer({ open, onAcknowledge }: TinnitusDisclaimerProps) {
  return (
    <Dialog open={open} maxWidth="md" fullWidth onClose={() => undefined} disableEscapeKeyDown>
      <DialogContent>
        <Typography variant="h6" color="error" gutterBottom>
          ⚠️ Health &amp; Safety Notice
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 2 }}>
          {TINNITUS_DISCLAIMER_TEXT}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onAcknowledge} variant="contained" color="primary" autoFocus>
          I Understand
        </Button>
      </DialogActions>
    </Dialog>
  );
}
