export interface TherapySession {
  id: string;
  timestamp: number;
  durationSec: number;
  engines: string[];
  avgGainDb: number;
  matchedFreqHz: number | null;
  limiterEvents: number;
  ratings?: { loudness: number; annoyance: number; comfort: number };
  panicStopTriggered: boolean;
}

const DB_NAME = 'tinnitus-therapy';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class SessionHistoryStore {
  async addSession(session: TherapySession): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(session);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSessions(from?: number, to?: number): Promise<TherapySession[]> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('timestamp');
    return new Promise((resolve) => {
      const range =
        from !== undefined && to !== undefined
          ? IDBKeyRange.bound(from, to)
          : from !== undefined
            ? IDBKeyRange.lowerBound(from)
            : to !== undefined
              ? IDBKeyRange.upperBound(to)
              : undefined;
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  }

  async getDailyExposure(date: string): Promise<number> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('timestamp');
    const start = new Date(date + 'T00:00:00').getTime();
    const end = start + 86400000;
    const range = IDBKeyRange.bound(start, end);
    return new Promise((resolve) => {
      let total = 0;
      const request = index.openCursor(range);
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          total += cursor.value.durationSec;
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      request.onerror = () => resolve(0);
    });
  }

  async checkDailyWarning(): Promise<{ hours: number; warning: boolean }> {
    const today = new Date().toISOString().split('T')[0]!;
    const secs = await this.getDailyExposure(today);
    const hours = secs / 3600;
    return { hours, warning: hours >= 3 };
  }

  async deleteOlderThan(days: number): Promise<void> {
    const cutoff = Date.now() - days * 86400000;
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.objectStore(STORE_NAME).index('timestamp');
    const range = IDBKeyRange.upperBound(cutoff);
    index.openCursor(range).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  }

  async exportToCSV(): Promise<string> {
    const sessions = await this.getSessions();
    const headers = 'Date,Duration(min),Engines,AvgGain(dB),Freq(Hz),LimiterEvents,PanicStop\n';
    const rows = sessions
      .map(
        (s) =>
          `${new Date(s.timestamp).toISOString()},${(s.durationSec / 60).toFixed(1)},${s.engines.join(';')},${s.avgGainDb.toFixed(1)},${s.matchedFreqHz ?? ''},${s.limiterEvents},${s.panicStopTriggered}`,
      )
      .join('\n');
    return headers + rows;
  }
}

let historySingleton: SessionHistoryStore | null = null;

export function getSessionHistory(): SessionHistoryStore {
  if (!historySingleton) historySingleton = new SessionHistoryStore();
  return historySingleton;
}
