/**
 * idb — the three IndexedDB moves both caches of the cartridge make (the lab
 * publications, the details of the arrivals), written once.
 *
 *  - Opening never waits forever: past OPEN_TIMEOUT_MS, or when another window
 *    holds an older version open (`onblocked`), it rejects, and the caller
 *    falls back to memory and says so.
 *  - A frame without IndexedDB rejects at once with INDEXEDDB_UNAVAILABLE.
 */

/** Opening a cache never waits longer than this. */
const OPEN_TIMEOUT_MS = 15_000;

/** One IndexedDB request as a promise: its result, or its error. */
export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('INDEXEDDB_ERROR'));
  });
}

/**
 * A transaction as a promise. It resolves on `oncomplete`, not on its last
 * request: a write is only kept once the whole transaction has committed.
 */
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('INDEXEDDB_ERROR'));
    tx.onabort = () => reject(tx.error ?? new Error('INDEXEDDB_ABORTED'));
  });
}

/** Opens (and creates on first use) a database; `upgrade` makes its stores. */
export async function openDb(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('INDEXEDDB_UNAVAILABLE');
  const open = indexedDB.open(name, version);
  open.onupgradeneeded = () => upgrade(open.result);
  return new Promise<IDBDatabase>((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => { late = true; reject(new Error('INDEXEDDB_TIMEOUT')); }, OPEN_TIMEOUT_MS);
    open.onsuccess = () => {
      clearTimeout(timer);
      // Opened after the caller gave up and fell back to memory: nobody holds it, close it.
      if (late) { open.result.close(); return; }
      resolve(open.result);
    };
    open.onerror = () => { clearTimeout(timer); reject(open.error ?? new Error('INDEXEDDB_ERROR')); };
    // Another window holds an older version open: say it, instead of "Reading…" forever.
    open.onblocked = () => { clearTimeout(timer); reject(new Error('INDEXEDDB_BLOCKED')); };
  });
}
