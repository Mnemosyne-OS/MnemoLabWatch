/**
 * load — one reading of the watch: (re)register the six targets, read the
 * inbox, read the details of what arrived, build the arrivals.
 *
 *  - Registering on every opening is safe: the host keeps the ids it has
 *    already seen across a re-register (doc 72, invariant 3), so a settings
 *    change never replays a feed as new.
 *  - A refused registration or inbox (permission, no host) is the screen's
 *    error state. A details source that fails is NOT: the arrivals stay
 *    listed with the watch's own titles, and the failure is said.
 *  - 🪤 The `watch.*` calls are gated by `watch:background`: on the first
 *    opening the host shows its permission prompt and answers only after the
 *    human does. They take the SDK's own bound (human-paced, 5 minutes): a
 *    15 s bound fired while the person was still reading the prompt and
 *    turned their "Allow" into an error screen.
 */
import { buildArrivals, type Arrival, type InboxItem } from './arrivals';
import { isFeedSource, OPENAI_RSS, WATCH_INTERVAL_MIN, watchTargets } from './labs';
import { hostFetchText, type HostInvoke } from './sources/http';
import { fetchWorks, type FetchJson, type Work } from './sources/openalex';
import { parseRss, type Post } from './sources/openaiRss';

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
  /** Why the OpenAlex details were not read, when they were not. */
  worksError?: string;
  /** Why the OpenAI feed was not read, when it was not. */
  feedError?: string;
}

export interface LoadDeps {
  invoke: HostInvoke;
  fetchJson: FetchJson;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs one details source. Its failure is logged and returned as a reason,
 * a parse error included: a source that fails never takes the list down.
 */
async function attempt<T>(what: string, needed: boolean, run: () => Promise<T>, empty: T): Promise<{ value: T; error?: string }> {
  if (!needed) return { value: empty };
  try {
    return { value: await run() };
  } catch (err) {
    console.warn(`[mnemo-labwatch] ${what} not read`, err);
    return { value: empty, error: message(err) };
  }
}

function readInboxAnswer(answer: unknown): { items: InboxItem[]; status: WatchStatus | null } {
  const a = (answer && typeof answer === 'object' ? answer : {}) as { items?: unknown; status?: unknown };
  if (!Array.isArray(a.items)) throw new Error('WATCH_INBOX_UNREADABLE');
  const items = a.items.filter((i): i is InboxItem =>
    !!i && typeof i === 'object'
    && typeof (i as InboxItem).id === 'string'
    && typeof (i as InboxItem).source === 'string'
    && typeof (i as InboxItem).at === 'string');
  const status = a.status && typeof a.status === 'object' ? a.status as WatchStatus : null;
  return { items, status };
}

export async function loadWatch(deps: LoadDeps, signal?: AbortSignal): Promise<Loaded> {
  await deps.invoke('watch.register', { targets: watchTargets(), intervalMin: WATCH_INTERVAL_MIN });
  const { items, status } = readInboxAnswer(await deps.invoke('watch.inbox'));

  const paperIds = items.filter((i) => !isFeedSource(i.source)).map((i) => i.id);
  const hasPosts = items.some((i) => isFeedSource(i.source));

  const [works, posts] = await Promise.all([
    attempt('OpenAlex details', paperIds.length > 0,
      () => fetchWorks(paperIds, deps.fetchJson, signal), new Map<string, Work>()),
    attempt('OpenAI feed', hasPosts,
      async () => new Map(parseRss(await hostFetchText(deps.invoke, OPENAI_RSS, signal)).map((p) => [p.id, p])),
      new Map<string, Post>()),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return {
    arrivals: buildArrivals(items, works.value, posts.value),
    status,
    ...(works.error ? { worksError: works.error } : {}),
    ...(posts.error ? { feedError: posts.error } : {}),
  };
}

/**
 * Clears these ids, and only these, from the host's inbox. Never `{}` (the
 * whole inbox): an arrival that landed after the screen was read would go
 * with it, unseen.
 */
export async function markSeen(invoke: HostInvoke, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await invoke('watch.clearInbox', { ids });
}
