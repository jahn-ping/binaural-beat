/**
 * Preset state manager — the single authority for loading, saving, deleting,
 * renaming, importing, and exporting presets.
 *
 * Architecture (webQ-gauntlet consensus):
 * - IndexedDB for user presets (async, no quota fragility)
 * - localStorage for last-session autosave only ("restore where I left off")
 * - Static imports for factory presets (versioned with app bundle)
 *
 * This module exposes hooks for React and plain functions for non-React code.
 */

import { useState, useEffect, useCallback } from 'react';
import type { BinauralPreset, PresetAudioState, PresetExportFile } from './types';
import {
  CURRENT_SCHEMA_VERSION,
  newId,
  validateImportFile,
} from './types';
import {
  loadAllUserPresets as dbLoadAll,
  savePreset as dbSave,
  savePresetsBatch as dbSaveBatch,
  deletePreset as dbDelete,
  clearAllPresets,
} from './db';
import { FACTORY_PRESETS } from './factory';
import type { TinnitusParams } from '../tinnitus';

// ── Last-session autosave (localStorage) ───────────────────────────────────

const LAST_SESSION_KEY = 'binaural-last-session-v1';

export function saveLastSession(audio: PresetAudioState, tinnitus: TinnitusParams): void {
  try {
    window.localStorage.setItem(
      LAST_SESSION_KEY,
      JSON.stringify({ audio, tinnitus, savedAt: Date.now() }),
    );
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function loadLastSession(): { audio: PresetAudioState; tinnitus: TinnitusParams } | null {
  try {
    const raw = window.localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { audio?: PresetAudioState; tinnitus?: TinnitusParams };
    if (!parsed.audio || !parsed.tinnitus) return null;
    return { audio: parsed.audio, tinnitus: parsed.tinnitus };
  } catch {
    return null;
  }
}

// ── Snapshot helpers ───────────────────────────────────────────────────────

/**
 * Extract a serializable audio snapshot from the current app Settings.
 * Called every time the user saves a preset.
 */
export function snapshotAudio(settings: {
  left: PresetAudioState['left'];
  right: PresetAudioState['right'];
  master: number;
  manualEnabled: boolean;
  noise: PresetAudioState['noise'];
  entrainment: PresetAudioState['entrainment'];
  linkedMode: boolean;
  timerMinutes: number;
}): PresetAudioState {
  return {
    left: { ...settings.left },
    right: { ...settings.right },
    master: settings.master,
    manualEnabled: settings.manualEnabled,
    noise: JSON.parse(JSON.stringify(settings.noise)),
    entrainment: JSON.parse(JSON.stringify(settings.entrainment)),
    linkedMode: settings.linkedMode,
    timerMinutes: settings.timerMinutes,
  };
}

// ── React hook: preset list + actions ─────────────────────────────────────

export interface UsePresetsResult {
  /** All presets (factory + user), factory first, then user sorted by updatedAt desc. */
  presets: BinauralPreset[];
  /** Whether the initial load from IndexedDB is complete. */
  loading: boolean;

  // ── Actions ───────────────────────────────────────────────────────────

  /** Save current settings as a new preset. Returns the created preset. */
  saveNew: (
    name: string,
    audio: PresetAudioState,
    tinnitus: TinnitusParams,
    options?: { tags?: string[]; isFavorite?: boolean },
  ) => Promise<BinauralPreset>;

  /** Update an existing user preset's audio/tinnitus snapshot (overwrite save). */
  overwrite: (
    id: string,
    audio: PresetAudioState,
    tinnitus: TinnitusParams,
  ) => Promise<BinauralPreset>;

  /** Delete a user preset by id. Factory presets cannot be deleted. */
  remove: (id: string) => Promise<void>;

  /** Rename a preset (user or factory — for factory, we clone as user). */
  rename: (id: string, newName: string) => Promise<BinauralPreset>;

  /** Toggle favorite status. */
  toggleFavorite: (id: string) => Promise<void>;

  /** Export one or more presets as a downloadable JSON file. */
  exportPresets: (ids: string[]) => void;

  /** Import presets from a JSON file string. Returns results with valid/error counts. */
  importPresets: (json: string) => Promise<{ imported: number; errors: string[] }>;

  /** Clear all user presets (with confirmation). */
  clearAll: () => Promise<void>;
}

export function usePresets(): UsePresetsResult {
  const [userPresets, setUserPresets] = useState<BinauralPreset[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user presets from IndexedDB on mount
  useEffect(() => {
    dbLoadAll()
      .then(setUserPresets)
      .catch(() => setUserPresets([]))
      .finally(() => setLoading(false));
  }, []);

  // Combined list: factory first, then user (sorted by updatedAt desc)
  const presets: BinauralPreset[] = [
    ...FACTORY_PRESETS,
    ...userPresets.sort((a, b) => b.updatedAt - a.updatedAt),
  ];

  const saveNew = useCallback(
    async (
      name: string,
      audio: PresetAudioState,
      tinnitus: TinnitusParams,
      options?: { tags?: string[]; isFavorite?: boolean },
    ): Promise<BinauralPreset> => {
      const now = Date.now();
      const preset: BinauralPreset = {
        id: newId(),
        name,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        category: 'user',
        tags: options?.tags ?? [],
        isFavorite: options?.isFavorite ?? false,
        createdAt: now,
        updatedAt: now,
        audio: JSON.parse(JSON.stringify(audio)),
        tinnitus: JSON.parse(JSON.stringify(tinnitus)),
      };
      await dbSave(preset);
      setUserPresets((prev) => [preset, ...prev]);
      return preset;
    },
    [],
  );

  const overwrite = useCallback(
    async (id: string, audio: PresetAudioState, tinnitus: TinnitusParams): Promise<BinauralPreset> => {
      const updated: BinauralPreset = {
        id,
        name: '', // will be filled from existing
        schemaVersion: CURRENT_SCHEMA_VERSION,
        category: 'user',
        tags: [],
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        audio: JSON.parse(JSON.stringify(audio)),
        tinnitus: JSON.parse(JSON.stringify(tinnitus)),
      };
      // Find existing to preserve metadata
      setUserPresets((prev) => {
        const existing = prev.find((p) => p.id === id);
        if (existing) {
          updated.name = existing.name;
          updated.tags = existing.tags;
          updated.isFavorite = existing.isFavorite;
          updated.createdAt = existing.createdAt;
          updated.category = existing.category;
        }
        return prev.map((p) => (p.id === id ? updated : p));
      });
      await dbSave(updated);
      return updated;
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    await dbDelete(id);
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const rename = useCallback(
    async (id: string, newName: string): Promise<BinauralPreset> => {
      // If it's a factory preset, clone it as a new user preset with the new name
      const factory = FACTORY_PRESETS.find((p) => p.id === id);
      if (factory) {
        const clone: BinauralPreset = {
          ...factory,
          id: newId(),
          name: newName,
          category: 'user',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await dbSave(clone);
        setUserPresets((prev) => [clone, ...prev]);
        return clone;
      }
      // User preset — just rename in place
      let updated: BinauralPreset | null = null;
      setUserPresets((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          updated = { ...p, name: newName, updatedAt: Date.now() };
          return updated;
        }),
      );
      if (updated) await dbSave(updated);
      return updated!;
    },
    [],
  );

  const toggleFavorite = useCallback(async (id: string): Promise<void> => {
    let updated: BinauralPreset | null = null;
    // Check factory presets too (they can be favorited in-memory only for now)
    const isFactory = FACTORY_PRESETS.some((p) => p.id === id);
    if (!isFactory) {
      setUserPresets((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          updated = { ...p, isFavorite: !p.isFavorite, updatedAt: Date.now() };
          return updated;
        }),
      );
      if (updated) await dbSave(updated);
    }
  }, []);

  const exportPresets = useCallback(
    (ids: string[]): void => {
      const all = [...FACTORY_PRESETS, ...userPresets];
      const selected = all.filter((p) => ids.includes(p.id));
      const exportFile: PresetExportFile = {
        format: 'binaural-presets',
        version: CURRENT_SCHEMA_VERSION,
        presets: selected,
      };
      const blob = new Blob([JSON.stringify(exportFile, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `binaural-presets-${selected.length}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [userPresets],
  );

  const importPresets = useCallback(
    async (json: string): Promise<{ imported: number; errors: string[] }> => {
      const result = validateImportFile(json);
      if (result.valid.length === 0) {
        return { imported: 0, errors: result.errors };
      }
      // Assign new IDs to avoid collisions
      const now = Date.now();
      const toImport = result.valid.map((p) => ({
        ...p,
        id: newId(),
        category: 'user' as const,
        updatedAt: now,
      }));
      await dbSaveBatch(toImport);
      setUserPresets((prev) => [...toImport, ...prev]);
      return { imported: toImport.length, errors: result.errors };
    },
    [],
  );

  const clearAll = useCallback(async (): Promise<void> => {
    await clearAllPresets();
    setUserPresets([]);
  }, []);

  return {
    presets,
    loading,
    saveNew,
    overwrite,
    remove,
    rename,
    toggleFavorite,
    exportPresets,
    importPresets,
    clearAll,
  };
}
