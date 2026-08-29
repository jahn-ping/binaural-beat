/**
 * IndexedDB storage for user presets — async, no quota fragility,
 * doesn't block the main thread (webQ-gauntlet consensus).
 *
 * Factory presets live in static imports and are never written here.
 * localStorage is only used for last-session autosave (separate concern).
 */

import type { BinauralPreset } from './types';

const DB_NAME = 'binaural-presets';
const DB_VERSION = 1;
const STORE_NAME = 'presets';

// ── DB lifecycle ───────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('isFavorite', 'isFavorite', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  return openDB().then(
    (db) => {
      const tx = db.transaction(STORE_NAME, mode);
      return tx.objectStore(STORE_NAME);
    },
  );
}

/** Promisify an IDBRequest. */
function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Load all user presets, sorted by most-recently-updated first. */
export async function loadAllUserPresets(): Promise<BinauralPreset[]> {
  const store = await txStore();
  const all = await reqPromise(store.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Save a single preset (insert or update). */
export async function savePreset(preset: BinauralPreset): Promise<void> {
  const store = await txStore('readwrite');
  await reqPromise(store.put(preset));
}

/** Save multiple presets in one transaction (for bulk import). */
export async function savePresetsBatch(presets: BinauralPreset[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const p of presets) {
    store.put(p);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a preset by id. */
export async function deletePreset(id: string): Promise<void> {
  const store = await txStore('readwrite');
  await reqPromise(store.delete(id));
}

/** Get a single preset by id. */
export async function getPreset(id: string): Promise<BinauralPreset | undefined> {
  const store = await txStore();
  return reqPromise(store.get(id));
}

/** Clear all user presets (dangerous — used only for import overwrite). */
export async function clearAllPresets(): Promise<void> {
  const store = await txStore('readwrite');
  await reqPromise(store.clear());
}

/** Count of stored user presets. */
export async function countUserPresets(): Promise<number> {
  const store = await txStore();
  return reqPromise(store.count());
}
