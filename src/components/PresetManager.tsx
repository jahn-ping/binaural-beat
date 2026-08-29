/**
 * PresetManager — full-featured preset management modal.
 * WebQ-gauntlet UI pattern: Save/Load/Delete/Rename + Import/Export as JSON.
 *
 * Factory presets are shown but can't be deleted (only cloned via Rename).
 * User presets are fully editable.
 *
 * Props receive the external settings state + a callback to apply a loaded preset.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import StarIcon from '@mui/icons-material/Star';
import SaveIcon from '@mui/icons-material/Save';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import type { BinauralPreset, PresetAudioState } from '../state/presets/types';
import type { TinnitusParams } from '../state/tinnitus';
import type { UsePresetsResult } from '../state/presets';

// ── Props ──────────────────────────────────────────────────────────────────

interface PresetManagerProps {
  open: boolean;
  onClose: () => void;
  /** Current audio snapshot — used when saving a new preset. */
  currentAudio: PresetAudioState;
  /** Current tinnitus snapshot — used when saving a new preset. */
  currentTinnitus: TinnitusParams;
  /** Callback when user loads a preset — receives the full preset. */
  onApply: (preset: BinauralPreset) => void;
  /** Preset hook state + actions. */
  presets: UsePresetsResult;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (ms: number): string => {
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const beatFreq = (audio: PresetAudioState): number =>
  Math.abs(audio.right.freq - audio.left.freq);

// ── Component ──────────────────────────────────────────────────────────────

export default function PresetManager({
  open,
  onClose,
  currentAudio,
  currentTinnitus,
  onApply,
  presets,
}: PresetManagerProps): JSX.Element {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'favorites' | 'factory' | 'user'>('all');
  const [showSaved, setShowSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Filter presets ─────────────────────────────────────────────────────

  const filteredPresets = presets.presets.filter((p) => {
    if (filter === 'favorites') return p.isFavorite || p.category === 'factory';
    if (filter === 'factory') return p.category === 'factory';
    if (filter === 'user') return p.category === 'user';
    return true;
  });

  // ── Actions ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!newName.trim()) return;
    await presets.saveNew(newName.trim(), currentAudio, currentTinnitus);
    setNewName('');
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  }, [newName, currentAudio, currentTinnitus, presets]);

  const handleApply = useCallback(
    (preset: BinauralPreset) => {
      onApply(preset);
      onClose();
    },
    [onApply, onClose],
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!renameValue.trim()) return;
      await presets.rename(id, renameValue.trim());
      setRenamingId(null);
      setRenameValue('');
    },
    [renameValue, presets],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await presets.remove(id);
      setConfirmDeleteId(null);
    },
    [presets],
  );

  const handleFileImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = await presets.importPresets(text);
      // Reset file input so re-importing the same file works
      e.target.value = '';
      if (result.errors.length > 0) {
        alert(`Imported ${result.imported} preset(s).\n\nErrors:\n${result.errors.join('\n')}`);
      }
    },
    [presets],
  );

  const handleExportAll = useCallback(() => {
    const ids = presets.presets.map((p) => p.id);
    presets.exportPresets(ids);
  }, [presets]);

  const handleClearAll = useCallback(async () => {
    if (!confirm('Delete ALL user presets? Factory presets will remain.')) return;
    await presets.clearAll();
  }, [presets]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FolderSpecialIcon color="primary" />
          Preset Manager
        </DialogTitle>

        <DialogContent sx={{ pt: '8px !important' }}>
          {/* ── Quick save bar ──────────────────────────────────────────── */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <TextField
              size="small"
              placeholder="New preset name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={showSaved ? undefined : <SaveIcon />}
              onClick={handleSave}
              disabled={!newName.trim()}
              color={showSaved ? 'success' : 'primary'}
            >
              {showSaved ? '✓ Saved' : 'Save'}
            </Button>
          </Stack>

          {/* ── Filter chips ────────────────────────────────────────────── */}
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
            {(['all', 'favorites', 'factory', 'user'] as const).map((f) => (
              <Chip
                key={f}
                label={f === 'all' ? 'All' : f === 'favorites' ? '★ Favorites' : f === 'factory' ? 'Built-in' : 'My Presets'}
                size="small"
                variant={filter === f ? 'filled' : 'outlined'}
                color={filter === f ? 'primary' : 'default'}
                onClick={() => setFilter(f)}
              />
            ))}
          </Stack>

          <Divider sx={{ my: 1 }} />

          {/* ── Preset list ─────────────────────────────────────────────── */}
          {presets.loading ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Loading presets…
            </Typography>
          ) : filteredPresets.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              {filter === 'user'
                ? 'No saved presets yet — save your current settings above!'
                : 'No presets match this filter.'}
            </Typography>
          ) : (
            <List dense disablePadding>
              {filteredPresets.map((preset) => (
                <ListItemButton
                  key={preset.id}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  onClick={() => handleApply(preset)}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {preset.category === 'factory' ? (
                      <FolderSpecialIcon fontSize="small" color="action" />
                    ) : (
                      <SaveIcon fontSize="small" color="primary" />
                    )}
                  </ListItemIcon>

                  {renamingId === preset.id ? (
                    /* ── Rename mode ──────────────────────────────────── */
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ flex: 1 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TextField
                        size="small"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(preset.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        sx={{ flex: 1 }}
                      />
                      <Button size="small" onClick={() => handleRename(preset.id)}>
                        OK
                      </Button>
                    </Stack>
                  ) : (
                    /* ── Normal mode ──────────────────────────────────── */
                    <>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" fontWeight={preset.isFavorite ? 700 : 400}>
                              {preset.name}
                            </Typography>
                            {preset.isFavorite && (
                              <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                            )}
                            {preset.category === 'factory' && (
                              <Chip label="Built-in" size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                            )}
                          </Stack>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {beatFreq(preset.audio).toFixed(1)} Hz beat · {preset.audio.noise.color} noise
                            {preset.audio.timerMinutes > 0 ? ` · ${preset.audio.timerMinutes}m timer` : ''}
                            {preset.audio.entrainment.schedule ? ` · schedule` : ''}
                            {preset.updatedAt !== preset.createdAt
                              ? ` · edited ${formatTime(preset.updatedAt)}`
                              : ` · ${formatTime(preset.createdAt)}`}
                          </Typography>
                        }
                      />

                      {/* Action buttons */}
                      <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
                        {preset.category === 'user' && (
                          <>
                            <Tooltip title="Rename">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(preset.id);
                                  setRenameValue(preset.name);
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={confirmDeleteId === preset.id ? 'Confirm delete' : 'Delete'}>
                              <IconButton
                                size="small"
                                color={confirmDeleteId === preset.id ? 'error' : 'default'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirmDeleteId === preset.id) {
                                    handleDelete(preset.id);
                                  } else {
                                    setConfirmDeleteId(preset.id);
                                    setTimeout(() => setConfirmDeleteId(null), 3000);
                                  }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {preset.category === 'factory' && (
                          <Tooltip title="Rename (clones as user preset)">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(preset.id);
                                setRenameValue(preset.name);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </>
                  )}
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>

        <Divider />

        {/* ── Footer actions ──────────────────────────────────────────── */}
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Tooltip title="Import presets from JSON file">
            <IconButton size="small" onClick={() => fileInputRef.current?.click()}>
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export all presets as JSON">
            <IconButton size="small" onClick={handleExportAll}>
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear all user presets">
            <IconButton size="small" onClick={handleClearAll} color="error">
              <ClearAllIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button onClick={onClose} sx={{ ml: 'auto' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
