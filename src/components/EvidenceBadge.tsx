import { Chip, Tooltip } from '@mui/material';
import type { EvidenceLevel } from '../audio/tinnitus/core/TherapyEngine';

const EVIDENCE_CONFIG: Record<
  EvidenceLevel,
  { color: 'success' | 'warning' | 'error' | 'info'; label: string; tooltip: string }
> = {
  'symptom-management': {
    color: 'success',
    label: 'Symptom Management',
    tooltip: 'Provides temporary relief through sound enrichment. No claim of treating underlying cause.',
  },
  'mixed-evidence': {
    color: 'warning',
    label: 'Mixed Evidence',
    tooltip: 'Some clinical studies show benefit, others do not. Personalized notched sound therapy.',
  },
  experimental: {
    color: 'error',
    label: 'Experimental',
    tooltip:
      'Inspired by neuromodulation research. Not equivalent to clinical CR devices. Use with caution.',
  },
  'relaxation-support': {
    color: 'info',
    label: 'Relaxation Support',
    tooltip: 'Breathing modulation for relaxation. Supports habituation but does not treat tinnitus directly.',
  },
};

export default function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const config = EVIDENCE_CONFIG[level];
  return (
    <Tooltip title={config.tooltip} arrow placement="top">
      <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 500, cursor: 'help' }} />
    </Tooltip>
  );
}
