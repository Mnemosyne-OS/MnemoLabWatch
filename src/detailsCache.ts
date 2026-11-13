/**
 * detailsCache — what was read about an arrival (its OpenAlex work, its feed
 * post), kept in the frame's IndexedDB so that reopening the window does not
 * ask again (doc 187 §3.6).
 *
 * A CACHE, never the only copy. The list of arrivals lives in the host's
 * mirror of the cartridge state (store.ts, `held`), which survives the frame's
 * origin changing (doc 73). Losing this cache costs one more details call per
 * 50 papers and one feed read, nothing else.
 *
 *  - A paper is known for good only once its abstract is readable. OpenAlex
 *    often adds the abstract days after it creates the work, and the watch
 *    picks works up the day they are created: anything less is asked again.
 *  - A post is known once the feed was read: found (`post`), or no longer
 *    carried by the feed (`postGone`).
 */
import { done, openDb } from './idb';
import type { Work } from './sources/openalex';
import type { Post } from './sources/openaiRss';

export interface CachedDetails {
  /** The host's item id. */
  id: string;
  work?: Work;
  post?: Post;
  /** The feed was read and no longer carries this post: not asked again. */
  postGone?: boolean;
}

export interface DetailsCache {
  /** The rows of these ids; an id never read is absent from the map. An empty list reads nothing. */
  get(ids: readonly string[]): Promise<Map<string, CachedDetails>>;
  /** Writes these rows over the ones of the same id; an empty list writes nothing. Rejects when the write fails. */
  put(rows: readonly CachedDetails[]): Promise<void>;
  /** Forgets these ids (marked seen); an id never cached is ignored. */
  remove(ids: readonly string[]): Promise<void>;
  /** Releases the connection when the window goes. */
  close(): void;
}

/** For the tests, and for a frame where IndexedDB is refused (details then read at every opening, as in 0.1.0). */
export function memoryDetailsCache(): DetailsCache {
  const rows = new Map<string, CachedDetails>();
  return {
    get: async (ids) => new Map(ids.flatMap((id) => { const r = rows.get(id); return r ? [[id, r] as const] : []; })),
    put: async (rs) => { for (const r of rs) rows.set(r.id, r); },
    remove: async (ids) => { for (const id of ids) rows.delete(id); },
    close: () => undefined,
  };
}

const DB = 'mnemo-labwatch-details';
const DETAILS = 'details';

/** The IndexedDB cache; rejects when the frame has none, or past the open timeout (idb.ts). */
export async function indexedDetailsCache(): Promise<DetailsCache> {
  const db = await openDb(DB, 1, (d) => {
    if (!d.objectStoreNames.contains(DETAILS)) d.createObjectStore(DETAILS, { keyPath: 'id' });
  });
  return {
    get: async (ids) => {
      const out = new Map<string, CachedDetails>();
      if (ids.length === 0) return out;
      const tx = db.transaction(DETAILS);
      const s = tx.objectStore(DETAILS);
      for (const id of ids) {
        const r = s.get(id);
        r.onsuccess = () => { if (r.result) out.set(id, r.result as CachedDetails); };
      }
      await done(tx);
      return out;
    },
    put: async (rs) => {
      if (rs.length === 0) return;
      const tx = db.transaction(DETAILS, 'readwrite');
      const s = tx.objectStore(DETAILS);
      for (const r of rs) s.put(r);
      await done(tx);
    },
    remove: async (ids) => {
      if (ids.length === 0) return;
      const tx = db.transaction(DETAILS, 'readwrite');
      const s = tx.objectStore(DETAILS);
      for (const id of ids) s.delete(id);
      await done(tx);
    },
    close: () => db.close(),
  };
}
