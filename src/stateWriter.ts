/**
 * stateWriter — every write of Lab Watch's saved state goes through here
 * (doc 187 §3.6).
 *
 * 🪤 Found by the cold review of 0.2.0: two frames of the cartridge (the
 * widget on the board and the window) share ONE state blob, and each wrote
 * its own copy. A frame opened earlier then erased the `held` arrivals the
 * other had just moved out of the box, after the box was cleared: they were
 * in neither place.
 *
 *  - `held` is never written from a frame's copy. Each write re-reads the
 *    host's state and writes ITS `held`, plus what this write adds (a move),
 *    minus what this frame let go (seen). A stale copy can neither erase an
 *    arrival nor bring a seen one back.
 *  - Read, merge and write happen under one lock: `navigator.locks` when the
 *    frame has it (same origin for the widget and the window), else one queue
 *    per page. Without the Web Lock, two frames can still interleave between
 *    the read and the write of one save.
 *  - A state that was there and now reads as never stored is refused
 *    (`STATE_VANISHED`): the host answers `null` both for "never stored" and
 *    for a file it cannot read (cartridgeState.ts), and writing then would
 *    replace everything with this frame's copy.
 *  - The budget is decided on the merged state, which this frame cannot see
 *    otherwise. The arrivals come first: a kept crossing is dropped to make
 *    room for them (it can be run again; a dropped arrival never comes back),
 *    and the caller says so.
 *  - The other fields (topics, verdicts, crossing, notice) are this frame's,
 *    as in 0.1.0.
 */
import type { InboxItem } from './arrivals';
import { HOST_TIMEOUT_MS, type HostInvoke } from './sources/http';
import { holdItems, readSaved, stateFits, type Saved } from './store';

type Lock = <T>(run: () => Promise<T>) => Promise<T>;

let chain: Promise<unknown> = Promise.resolve();
/** One queue for every writer of this page: the tests' two frames share it. */
const pageLock: Lock = (run) => {
  const r = chain.then(run);
  chain = r.catch(() => undefined);
  return r;
};

const LOCK_NAME = 'mnemo-labwatch-state';

/**
 * The Web Lock shared by every frame of this origin, else the page's queue.
 * 🪤 A frame can HAVE `navigator.locks` and be denied it (a context without
 * storage access rejects `request`). Not seen in the app yet, and it would stop
 * every save: a lock refused before the save started falls back to the queue,
 * as the IndexedDB cache falls back to memory.
 */
export const stateLock: Lock = (run) => {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) return pageLock(run);
  let started = false;
  const held = locks.request(LOCK_NAME, () => { started = true; return run(); }) as ReturnType<typeof run>;
  return held.catch((err: unknown) => {
    if (started) throw err;
    console.warn('[mnemo-labwatch] Web Lock refused, saves are queued in this page only', err);
    return pageLock(run);
  });
};

export interface Written {
  /** What the host now holds. */
  state: Saved;
  /** The kept crossing was left out to make room for the arrivals. */
  droppedCrossing: boolean;
}

export interface StateWriter {
  /** Reads the state; a non-empty answer arms the `STATE_VANISHED` guard. Throws when the host refuses. */
  read(): Promise<Saved>;
  /**
   * Writes `next` with `held` rebuilt from the host's copy (see above).
   * `add`: the box items a move takes. `release`: the ids marked seen, kept
   * out of every later write of this frame once this one has succeeded.
   * Throws `STATE_FULL`, `STATE_VANISHED`, or the host's error: nothing is
   * written then.
   */
  write(next: Saved, change?: { add?: readonly InboxItem[]; release?: readonly string[] }): Promise<Written>;
}

export function stateWriter(invoke: HostInvoke, lock: Lock = stateLock): StateWriter {
  const released = new Set<string>();
  let sawState = false;

  const get = async (): Promise<unknown> => {
    const answer = (await invoke('state.get', undefined, HOST_TIMEOUT_MS)) as { state?: unknown } | null;
    return answer?.state ?? null;
  };

  return {
    read: async () => {
      const raw = await get();
      if (raw !== null) sawState = true;
      return readSaved(raw);
    },
    write: (next, change = {}) => lock(async () => {
      const raw = await get();
      if (raw === null && sawState) throw new Error('STATE_VANISHED');
      const host = readSaved(raw);
      const gone = new Set([...released, ...(change.release ?? [])]);
      // The HOST's held (another frame may have moved its box), plus this move, minus what was seen here.
      const held = (holdItems(host, change.add ?? []).held ?? []).filter((i) => !gone.has(i.id));
      let state: Saved = { ...next, held };
      let droppedCrossing = false;
      if (!stateFits(state) && state.crossing) {
        state = { ...state };
        delete state.crossing;
        droppedCrossing = true;
      }
      if (!stateFits(state)) throw new Error('STATE_FULL');
      await invoke('state.set', { state }, HOST_TIMEOUT_MS);
      sawState = true;
      for (const id of change.release ?? []) released.add(id);
      return { state, droppedCrossing };
    }),
  };
}
