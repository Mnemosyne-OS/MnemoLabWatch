/**
 * load — one reading of the watch: (re)register the six targets, read the
 * box, add what is already held, read the details, build the arrivals. Then
 * `moveBox` takes what the box held into the saved state (doc 187 §3.6).
 *
 *  - Registering on every opening is safe: the host keeps the ids it has
 *    already seen across a re-register (doc 72, invariant 3), so a settings
 *    change never replays a feed as new.
 *  - A refused registration or box (permission, no host) is the screen's
 *    error state. A details source that fails is NOT: the arrivals stay
 *    listed with the watch's own titles, and the failure is said.
 *  - 🪤 The `watch.*` calls are gated by `watch:background`: on the first
 *    opening the host shows its permission prompt and answers only after the
 *    human does. They take the SDK's own bound (human-paced, 5 minutes): a
 *    15 s bound fired while the person was still reading the prompt and
 *    turned their "Allow" into an error screen.
 *  - 🪤 The host's box keeps 100 items and drops the oldest past it, without
 *    a word (`INBOX_CAP`, cartridgeWatch.ts). Measured in the app on
 *    2026-11-11: 100 waiting, the oldest picked up on 03/11, everything
 *    before already gone, 31 of the 100 OpenAI posts outside research.
 */
import { buildArrivals, type Arrival, type InboxItem } from './arrivals';
import type { CachedDetails, DetailsCache } from './detailsCache';
import { isFeedSource, OPENAI_RSS, WATCH_INTERVAL_MIN, watchTargets } from './labs';
import { hostFetchText, type HostInvoke } from './sources/http';
import { fetchWorks, shortId, type FetchJson, type Work } from './sources/openalex';
import { parseRss, type Post } from './sources/openaiRss';
import type { StateWriter, Written } from './stateWriter';
import type { Saved } from './store';

/** The host's box size per cartridge (`INBOX_CAP`, main/watch/cartridgeWatch.ts): a box this full has lost its oldest. */
export const HOST_INBOX_CAP = 100;

export interface WatchStatus {
  registered: boolean;
  targets: number;
  intervalMin: number;
  lastRunAt: string | null;
  lastError: string | null;
  unread: number;
}

export interface Loaded {
  arrivals: Arrival[];
  status: WatchStatus | null;
  /** What the box held at this reading: what `moveBox` takes, and clears by id. */
  box: InboxItem[];
  /** The box was at the host's cap: arrivals older than the last 100 may have been dropped. */
  boxWasFull: boolean;
  /** Why the OpenAlex details were not read, when they were not. */
  worksError?: string;
  /** Why the OpenAI feed was not read, when it was not. */
  feedError?: string;
}

export interface LoadDeps {
  invoke: HostInvoke;
  fetchJson: FetchJson;
  cache: DetailsCache;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs one details source. Its failure is logged and returned as a reason,
 * a parse error included: a source that fails never takes the list down.
 */
async function attempt<T>(what: string, needed: boolean, run: () => Promise<T>, empty: T): Promise<{ value: T; read: boolean; error?: string }> {
  if (!needed) return { value: empty, read: false };
  try {
    return { value: await run(), read: true };
  } catch (err) {
    console.warn(`[mnemo-labwatch] ${what} not read`, err);
    return { value: empty, read: false, error: message(err) };
  }
}

function readBoxAnswer(answer: unknown): { items: InboxItem[]; size: number; status: WatchStatus | null } {
  const a = (answer && typeof answer === 'object' ? answer : {}) as { items?: unknown; status?: unknown };
  if (!Array.isArray(a.items)) throw new Error('WATCH_INBOX_UNREADABLE');
  const items = a.items.filter((i): i is InboxItem =>
    !!i && typeof i === 'object'
    && typeof (i as InboxItem).id === 'string'
    && typeof (i as InboxItem).source === 'string'
    && typeof (i as InboxItem).at === 'string');
  const status = a.status && typeof a.status === 'object' ? a.status as WatchStatus : null;
  return { items, size: a.items.length, status };
}

/** One entry per id AND source: a work two labs both list stays under both labs (`itemKey`). */
export const itemKey = (i: InboxItem) => JSON.stringify([i.id, i.source]);

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Held and boxed, each (id, source) once, first seen first.
 *  - 🪤 A co-authored work comes once per lab list (seen 3 times in a box of
 *    100 on 2026-11-11): deduplicating by id alone kept only the first lab
 *    when the details could not be read. `buildArrivals` folds the copies.
 *  - 🪤 The order decides which id names a folded pair (`Arrival.key`, the key
 *    of its paid verdict): it must not depend on where the items came from.
 *    The first one seen keeps the name when a second record of the work arrives.
 */
export function mergeItems(held: readonly InboxItem[], box: readonly InboxItem[]): InboxItem[] {
  const byKey = new Map<string, InboxItem>();
  for (const i of [...held, ...box]) if (!byKey.has(itemKey(i))) byKey.set(itemKey(i), i);
  return [...byKey.values()].sort((a, b) => order(a.at, b.at) || order(a.id, b.id) || order(a.source, b.source));
}

/** A paper is known for good once its abstract is readable; anything less is asked again (detailsCache.ts). */
const workKnown = (row: CachedDetails | undefined) => row?.work?.abstract === 'readable';
const postKnown = (row: CachedDetails | undefined) => !!row?.post || !!row?.postGone;

async function readCache(cache: DetailsCache, ids: string[]): Promise<Map<string, CachedDetails>> {
  try {
    return await cache.get(ids);
  } catch (err) {
    console.warn('[mnemo-labwatch] details cache not read, every detail is asked again', err);
    return new Map();
  }
}

/**
 * One reading: registers the targets, reads the box, adds what `held` already
 * keeps, reads the details that are not known yet (detailsCache.ts) and
 * builds the arrivals. It throws only when the host refuses the watch or its
 * box; a details source that fails is returned as a reason, never a throw.
 * It writes nothing to the box or the state: `moveBox` does that afterwards.
 */
export async function loadWatch(deps: LoadDeps, held: readonly InboxItem[], signal?: AbortSignal): Promise<Loaded> {
  await deps.invoke('watch.register', { targets: watchTargets(), intervalMin: WATCH_INTERVAL_MIN });
  const { items: box, size, status } = readBoxAnswer(await deps.invoke('watch.inbox'));
  const items = mergeItems(held, box);

  const cached = await readCache(deps.cache, [...new Set(items.map((i) => i.id))]);
  // A work listed by two labs is ONE work: its details are read and kept once.
  const papers = [...new Map(items.filter((i) => !isFeedSource(i.source)).map((i) => [i.id, i])).values()];
  const postsListed = items.filter((i) => isFeedSource(i.source));
  const paperIds = papers.filter((i) => !workKnown(cached.get(i.id))).map((i) => i.id);
  const askFeed = postsListed.some((i) => !postKnown(cached.get(i.id)));

  const [fetched, feed] = await Promise.all([
    attempt('OpenAlex details', paperIds.length > 0,
      () => fetchWorks(paperIds, deps.fetchJson, signal), new Map<string, Work>()),
    attempt('OpenAI feed', askFeed,
      async () => new Map(parseRss(await hostFetchText(deps.invoke, OPENAI_RSS, signal)).map((p) => [p.id, p])),
      new Map<string, Post>()),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const works = new Map<string, Work>();
  const posts = new Map<string, Post>();
  const fresh: CachedDetails[] = [];
  for (const i of papers) {
    const work = fetched.value.get(shortId(i.id)) ?? cached.get(i.id)?.work;
    if (!work) continue;
    works.set(shortId(i.id), work);
    if (fetched.value.has(shortId(i.id))) fresh.push({ id: i.id, work });
  }
  for (const i of postsListed) {
    const row = cached.get(i.id);
    const post = feed.value.get(i.id) ?? row?.post;
    if (post) posts.set(i.id, post);
    if (postKnown(row) || !feed.read) continue;
    fresh.push(post ? { id: i.id, post } : { id: i.id, postGone: true });
  }
  try {
    await deps.cache.put(fresh);
  } catch (err) {
    console.warn('[mnemo-labwatch] details not cached, they are asked again next opening', err);
  }

  return {
    arrivals: buildArrivals(items, works, posts),
    status,
    box,
    boxWasFull: size >= HOST_INBOX_CAP,
    ...(fetched.error ? { worksError: fetched.error } : {}),
    ...(feed.error ? { feedError: feed.error } : {}),
  };
}

/** Why the box was not emptied (the state is full, vanished, or the host's own error), and what made room. */
export interface MoveOutcome {
  error?: string;
  /** The kept crossing was left out of the state to make room for the arrivals. */
  droppedCrossing?: boolean;
}

/**
 * Takes what the box held into the saved state, then clears exactly those ids
 * from the box (doc 187 §3.6).
 *
 *  - Written first, cleared after, never the other way: a state that was not
 *    written leaves the box as it is, and the box is still the copy.
 *  - Only the ids read: an arrival that landed meanwhile stays in the box.
 *  - `held` and the budget are the writer's (stateWriter.ts): it merges with
 *    the host's copy, which another frame may have changed.
 *  - `commit` gets the "box was full" notice BEFORE the write: a save made
 *    meanwhile from this frame's copy must carry it, never erase it. When the
 *    arrivals do not fit, the notice is still written alone: it weighs a few
 *    bytes, and the screen must not stay silent about a full box.
 */
export async function moveBox(
  write: StateWriter['write'],
  invoke: HostInvoke,
  latest: () => Saved,
  commit: (s: Saved) => void,
  box: readonly InboxItem[],
  wasFull: boolean,
  now: () => string = () => new Date().toISOString(),
): Promise<MoveOutcome> {
  if (box.length === 0) return {};
  const next: Saved = { ...latest(), ...(wasFull ? { boxFullAt: now() } : {}) };
  commit(next);
  let written: Written;
  try {
    written = await write(next, { add: box });
  } catch (err) {
    console.error('[mnemo-labwatch] arrivals not held, the box keeps them', err);
    if (wasFull && message(err) === 'STATE_FULL') {
      try {
        await write(next);
      } catch (noteErr) {
        console.warn('[mnemo-labwatch] full-box notice not saved', noteErr);
      }
    }
    return { error: message(err) };
  }
  try {
    await invoke('watch.clearInbox', { ids: box.map((i) => i.id) });
  } catch (err) {
    // Held AND still in the box: the next opening merges them by id, nothing doubles.
    console.error('[mnemo-labwatch] box not cleared', err);
    return { error: message(err), ...(written.droppedCrossing ? { droppedCrossing: true } : {}) };
  }
  return written.droppedCrossing ? { droppedCrossing: true } : {};
}

/**
 * Clears these ids, and only these, from the host's box. Never `{}` (the
 * whole box): an arrival that landed after the screen was read would go
 * with it, unseen.
 */
export async function markSeen(invoke: HostInvoke, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await invoke('watch.clearInbox', { ids });
}
