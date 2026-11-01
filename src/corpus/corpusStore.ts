/**
 * corpusStore — the lab publications loaded for the crossing, kept in the
 * frame's IndexedDB.
 *
 * A CACHE, never the only copy: it is OpenAlex's data, refetchable for 36
 * credits for the five labs (doc 187 §2.1). The frame's origin can change
 * between a dev and an installed cartridge (doc 73), and then the cache is
 * simply empty again; the screen shows the counts it really holds.
 */
import type { LabKey } from '../labs';

export interface CorpusWork {
  id: string;
  lab: LabKey;
  title: string;
  published?: string;
  url: string;
  /** The readable abstract, or the full text once read (lot 4). */
  text: string;
  /**
   * Lot 4: one passage of the full text of an open-access PDF. Its id is the
   * work's id plus `#p<part>`, so the abstract and every passage are found
   * side by side and the judge quotes the passage it was shown.
   */
  full?: boolean;
  part?: number;
  heading?: string;
  licence?: string;
  pdfUrl?: string;
}

export interface LabLoad {
  lab: LabKey;
  /** Works kept (a readable abstract each). */
  count: number;
  /** Works OpenAlex listed, abstracts or not. */
  listed: number;
  loadedAt: string;
  /** False while loading, and for a load that was stopped: what it holds is part of the lab. */
  complete: boolean;
}

export interface CorpusStore {
  put(works: readonly CorpusWork[]): Promise<void>;
  all(): Promise<CorpusWork[]>;
  setLoad(load: LabLoad): Promise<void>;
  loads(): Promise<LabLoad[]>;
  /** Releases the connection when the view goes. */
  close(): void;
}

/** For the tests, and for a frame where IndexedDB is refused. */
export function memoryCorpusStore(): CorpusStore {
  const works = new Map<string, CorpusWork>();
  const loads = new Map<LabKey, LabLoad>();
  return {
    put: async (ws) => { for (const w of ws) works.set(w.id, w); },
    all: async () => [...works.values()],
    setLoad: async (l) => { loads.set(l.lab, l); },
    loads: async () => [...loads.values()],
    close: () => undefined,
  };
}

/** Opening the cache never waits longer than this: past it, the view works from memory and says so. */
export const OPEN_TIMEOUT_MS = 15_000;

const DB = 'mnemo-labwatch';
const WORKS = 'works';
const LOADS = 'loads';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('INDEXEDDB_ERROR'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('INDEXEDDB_ERROR'));
    tx.onabort = () => reject(tx.error ?? new Error('INDEXEDDB_ABORTED'));
  });
}

/** The IndexedDB store; rejects when the frame has none. */
export async function indexedCorpusStore(): Promise<CorpusStore> {
  if (typeof indexedDB === 'undefined') throw new Error('INDEXEDDB_UNAVAILABLE');
  const open = indexedDB.open(DB, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(WORKS)) db.createObjectStore(WORKS, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(LOADS)) db.createObjectStore(LOADS, { keyPath: 'lab' });
  };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('INDEXEDDB_TIMEOUT')), OPEN_TIMEOUT_MS);
    open.onsuccess = () => { clearTimeout(timer); resolve(open.result); };
    open.onerror = () => { clearTimeout(timer); reject(open.error ?? new Error('INDEXEDDB_ERROR')); };
    // Another window holds an older version open: say it, instead of "Reading…" forever.
    open.onblocked = () => { clearTimeout(timer); reject(new Error('INDEXEDDB_BLOCKED')); };
  });
  return {
    close: () => db.close(),
    put: async (ws) => {
      const tx = db.transaction(WORKS, 'readwrite');
      const s = tx.objectStore(WORKS);
      for (const w of ws) s.put(w);
      await done(tx);
    },
    all: async () => request(db.transaction(WORKS).objectStore(WORKS).getAll()) as Promise<CorpusWork[]>,
    setLoad: async (l) => {
      const tx = db.transaction(LOADS, 'readwrite');
      tx.objectStore(LOADS).put(l);
      await done(tx);
    },
    loads: async () => request(db.transaction(LOADS).objectStore(LOADS).getAll()) as Promise<LabLoad[]>,
  };
}
