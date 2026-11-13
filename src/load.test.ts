import { describe, expect, it, vi } from 'vitest';
import type { InboxItem } from './arrivals';
import { memoryDetailsCache, type DetailsCache } from './detailsCache';
import { OPENAI_FEED_LABEL, WATCH_INTERVAL_MIN } from './labs';
import { HOST_INBOX_CAP, loadWatch, markSeen, mergeItems, moveBox } from './load';
import type { Work } from './sources/openalex';
import fixture from './sources/fixtures/openalex-works.json';
import rss from './sources/fixtures/openai-rss.xml?raw';
import { stateWriter } from './stateWriter';
import { defaultSaved, STATE_MAX_BYTES, type Saved } from './store';

// The host writes a target's LABEL as its items' source (cartridgeWatch.ts): that is the shape tested.
const META = 'Meta';
const FEED = OPENAI_FEED_LABEL;
const AT = '2026-10-28T08:00:00.000Z';
const LATER = '2026-10-29T08:00:00.000Z';
const POST = 'https://openai.com/index/building-scientific-understanding-with-academic-communities';

function host(inbox: unknown, feed: unknown = { status: 200, body: rss, encoding: 'utf8' }) {
  return vi.fn(async (action: string, _payload?: unknown, _timeoutMs?: number) => {
    if (action === 'watch.register') return { targets: 6, intervalMin: WATCH_INTERVAL_MIN };
    if (action === 'watch.inbox') return inbox;
    if (action === 'social.fetch') {
      if (feed instanceof Error) throw feed;
      return feed;
    }
    if (action === 'watch.clearInbox') return { left: 0 };
    if (action === 'state.set') return { bytes: 1 };
    throw new Error(`unexpected ${action}`);
  });
}

const deps = (invoke: ReturnType<typeof host> | ((a: string) => Promise<unknown>), fetchJson: (url: string) => Promise<unknown>, cache: DetailsCache = memoryDetailsCache()) =>
  ({ invoke, fetchJson, cache });

const work = (id: string, abstract: Work['abstract']): Work => ({
  id, title: `Work ${id}`, labs: ['meta'], abstract, abstractWords: abstract === 'readable' ? 40 : 0,
  ...(abstract === 'readable' ? { abstractText: 'A readable abstract of forty words.' } : {}),
  url: `https://doi.org/${id}`,
});

describe('loadWatch', () => {
  it('registers the six targets once a day, then reads the box and the details', async () => {
    const invoke = host({
      items: [
        { id: 'https://openalex.org/W7221749767', label: 'x', source: META, at: AT },
        { id: POST, source: FEED, at: AT },
      ],
      status: { registered: true, targets: 6, intervalMin: 1440, lastRunAt: AT, lastError: null, unread: 2 },
    });
    const fetchJson = vi.fn(async () => fixture);
    const out = await loadWatch(deps(invoke, fetchJson), []);
    const register = invoke.mock.calls.find((c) => c[0] === 'watch.register') as unknown as [string, { targets: unknown[]; intervalMin: number }];
    expect(register[1].targets).toHaveLength(6);
    expect(register[1].intervalMin).toBe(1440);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(out.arrivals.map((a) => a.details)).toEqual([true, true]);
    expect(out.status?.lastRunAt).toBe(AT);
    expect(out.box.map((i) => i.id)).toEqual(['https://openalex.org/W7221749767', POST]);
    expect(out.worksError).toBeUndefined();
    expect(out.feedError).toBeUndefined();
  });

  it('gives the permission-gated calls no short bound: the first one waits on the host prompt', async () => {
    const invoke = host({ items: [{ id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null });
    await loadWatch(deps(invoke, vi.fn()), []);
    await markSeen(invoke, ['https://openai.com/index/y']);
    const gated = invoke.mock.calls.filter((c) => /^watch\.|^social\.fetch$/.test(c[0] as string));
    expect(gated.map((c) => c[0])).toEqual(['watch.register', 'watch.inbox', 'social.fetch', 'watch.clearInbox']);
    for (const c of gated) expect((c as unknown[])[2], c[0] as string).toBeUndefined();
  });

  it('reads no source when nothing is held and the box is empty', async () => {
    const invoke = host({ items: [], status: null });
    const fetchJson = vi.fn();
    const out = await loadWatch(deps(invoke, fetchJson), []);
    expect(out.arrivals).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(invoke.mock.calls.some((c) => c[0] === 'social.fetch')).toBe(false);
  });

  it('keeps the arrivals and says why when a details source fails', async () => {
    const invoke = host(
      { items: [{ id: 'https://openalex.org/W1', label: 'Kept', source: META, at: AT }, { id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null },
      new Error('HTTP_403'),
    );
    const out = await loadWatch(deps(invoke, async () => { throw new Error('HTTP_429'); }), []);
    expect(out.arrivals).toHaveLength(2);
    expect(out.arrivals.every((a) => a.details === false)).toBe(true);
    expect(out.worksError).toBe('HTTP_429');
    expect(out.feedError).toBe('HTTP_403');
  });

  it('says a truncated or unreadable feed instead of parsing it', async () => {
    const truncated = host({ items: [{ id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null }, { body: '<rss>', truncated: true });
    expect((await loadWatch(deps(truncated, vi.fn()), [])).feedError).toBe('HOST_FETCH_TRUNCATED');
    const html = host({ items: [{ id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null }, { status: 200, body: '<html><body>x</body' });
    expect((await loadWatch(deps(html, vi.fn()), [])).feedError).toBe('RSS_XML_UNREADABLE');
  });

  it('fails as a whole when the host refuses the watch', async () => {
    const invoke = vi.fn(async () => { throw new Error('PERMISSION_DENIED: watch:background'); });
    await expect(loadWatch(deps(invoke, vi.fn()), [])).rejects.toThrow('PERMISSION_DENIED');
  });

  it('refuses a box answer without a list', async () => {
    await expect(loadWatch(deps(host({ nope: true }), vi.fn()), [])).rejects.toThrow('WATCH_INBOX_UNREADABLE');
  });

  it('says the box was full at the host\'s cap, and only there', async () => {
    const items = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `https://openalex.org/W${k + 1}`, source: META, at: AT }));
    const fetchJson = async () => ({ results: [] });
    expect((await loadWatch(deps(host({ items: items(HOST_INBOX_CAP), status: null }), fetchJson), [])).boxWasFull).toBe(true);
    expect((await loadWatch(deps(host({ items: items(HOST_INBOX_CAP - 1), status: null }), fetchJson), [])).boxWasFull).toBe(false);
  });
});

describe('the held arrivals (0.2.0, doc 187 §3.6)', () => {
  it('lists what is held when the box is empty, and asks nothing for a work already read', async () => {
    const cache = memoryDetailsCache();
    await cache.put([{ id: 'https://openalex.org/W1', work: work('W1', 'readable') }]);
    const fetchJson = vi.fn();
    const out = await loadWatch(deps(host({ items: [], status: null }), fetchJson, cache), [{ id: 'https://openalex.org/W1', label: 'x', source: META, at: AT }]);
    expect(out.arrivals.map((a) => [a.title, a.details])).toEqual([['Work W1', true]]);
    expect(out.box).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('asks again a paper whose abstract was not readable yet, and keeps what came back', async () => {
    const cache = memoryDetailsCache();
    await cache.put([{ id: 'https://openalex.org/W1', work: work('W1', 'missing') }]);
    const fetchJson = vi.fn(async (_url: string) => ({ results: [{ id: 'https://openalex.org/W1', title: 'Work W1', abstract_inverted_index: Object.fromEntries('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone'.split(' ').map((w, k) => [w, [k]])) }] }));
    const out = await loadWatch(deps(host({ items: [], status: null }), fetchJson, cache), [{ id: 'https://openalex.org/W1', source: META, at: AT }]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson.mock.calls[0]![0]).toContain('W1');
    expect(out.arrivals[0]!.abstract).toBe('readable');
    expect((await cache.get(['https://openalex.org/W1'])).get('https://openalex.org/W1')?.work?.abstract).toBe('readable');
  });

  it('lists an id held AND still in the box once (a clear that failed)', async () => {
    const item = { id: 'https://openalex.org/W1', source: META, at: AT };
    const out = await loadWatch(deps(host({ items: [item], status: null }), async () => ({ results: [] })), [item]);
    expect(out.arrivals).toHaveLength(1);
    expect(out.arrivals[0]!.ids).toEqual(['https://openalex.org/W1']);
  });

  it('keeps both labs of a work two lab lists carry, and reads its details once', async () => {
    const id = 'https://openalex.org/W7221749767';
    const box = [{ id, label: 'x', source: 'OpenAI', at: AT }, { id, label: 'x', source: 'Anthropic', at: AT }];
    const failing = vi.fn(async () => { throw new Error('HTTP_429'); });
    const out = await loadWatch(deps(host({ items: box, status: null }), failing), []);
    expect(out.arrivals).toHaveLength(1);
    expect(out.arrivals[0]!.labs.sort()).toEqual(['anthropic', 'openai']);
    expect(mergeItems(box, []).map((i) => i.source)).toEqual(['Anthropic', 'OpenAI']);
    const reading = vi.fn(async (_url: string) => fixture);
    await loadWatch(deps(host({ items: box, status: null }), reading), []);
    expect(reading).toHaveBeenCalledTimes(1);
    expect(reading.mock.calls[0]![0].split('W7221749767')).toHaveLength(2);
  });

  it('names a folded pair by the first record seen, wherever each record comes from', async () => {
    const first = { id: 'https://openalex.org/W7215133695', label: 'x', source: 'OpenAI', at: AT };
    const second = { id: 'https://openalex.org/W7214912522', label: 'x', source: 'OpenAI', at: LATER };
    const fetchJson = async () => fixture;
    const a = await loadWatch(deps(host({ items: [second], status: null }), fetchJson), [first]);
    const b = await loadWatch(deps(host({ items: [first], status: null }), fetchJson), [second]);
    expect(a.arrivals.map((x) => x.key)).toEqual([first.id]);
    expect(b.arrivals.map((x) => x.key)).toEqual([first.id]);
    expect(a.arrivals[0]!.ids).toEqual([first.id, second.id]);
    // The same instant: the smaller id, whatever the order given.
    const x = { id: 'b', source: META, at: AT };
    const y = { id: 'a', source: META, at: AT };
    expect(mergeItems([x], [y]).map((i) => i.id)).toEqual(['a', 'b']);
    expect(mergeItems([y], [x]).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('remembers a post the feed no longer carries, and reads the feed no more for it', async () => {
    const cache = memoryDetailsCache();
    const gone = { id: 'https://openai.com/index/not-in-the-feed', label: 'Gone', source: FEED, at: AT };
    const first = host({ items: [], status: null });
    const out = await loadWatch(deps(first, vi.fn(), cache), [gone, { id: POST, source: FEED, at: AT }]);
    expect(first.mock.calls.filter((c) => c[0] === 'social.fetch')).toHaveLength(1);
    expect(out.arrivals.find((a) => a.key === gone.id)?.title).toBe('Gone');
    const again = host({ items: [], status: null });
    await loadWatch(deps(again, vi.fn(), cache), [gone, { id: POST, source: FEED, at: AT }]);
    expect(again.mock.calls.some((c) => c[0] === 'social.fetch')).toBe(false);
  });

  it('never marks a post gone when the feed was not read', async () => {
    const cache = memoryDetailsCache();
    const item = { id: POST, source: FEED, at: AT };
    await loadWatch(deps(host({ items: [], status: null }, new Error('HTTP_403')), vi.fn(), cache), [item]);
    expect((await cache.get([POST])).size).toBe(0);
  });

  it('reads the details as before when the cache can be neither read nor written', async () => {
    const broken: DetailsCache = {
      get: async () => { throw new Error('INDEXEDDB_ERROR'); },
      put: async () => { throw new Error('INDEXEDDB_ERROR'); },
      remove: async () => undefined,
      close: () => undefined,
    };
    const out = await loadWatch(deps(host({ items: [{ id: 'https://openalex.org/W7221749767', label: 'x', source: META, at: AT }], status: null }), async () => fixture, broken), []);
    expect(out.arrivals.map((a) => a.details)).toEqual([true]);
  });
});

describe('moveBox', () => {
  const box: InboxItem[] = [
    { id: 'https://openalex.org/W1', label: 'One', source: META, at: AT },
    { id: 'https://openalex.org/W2', label: 'Two', source: META, at: AT },
  ];

  /** One host: its state blob and its box, the calls in the order they were made. */
  function moveHost(initial: unknown = null) {
    const h = {
      state: initial,
      setRefuse: null as string | null,
      clearRefuse: null as string | null,
      setGate: null as Promise<void> | null,
      invoke: vi.fn(async (action: string, payload?: unknown, _timeoutMs?: number) => {
        if (action === 'state.get') return { state: h.state, updatedAt: null };
        if (action === 'state.set') {
          if (h.setGate) await h.setGate;
          if (h.setRefuse) throw new Error(h.setRefuse);
          h.state = (payload as { state: unknown }).state;
          return { bytes: 1 };
        }
        if (action === 'watch.clearInbox') {
          if (h.clearRefuse) throw new Error(h.clearRefuse);
          return { left: 0 };
        }
        throw new Error(`unexpected ${action}`);
      }),
    };
    return h;
  }
  const run = (h: ReturnType<typeof moveHost>, base: Saved = defaultSaved(), items = box, full = false) => {
    let latest = base;
    const commit = vi.fn((s: Saved) => { latest = s; });
    const w = stateWriter(h.invoke);
    return { commit, latest: () => latest, out: moveBox(w.write, h.invoke, () => latest, commit, items, full, () => LATER) };
  };
  const held = (s: unknown) => ((s as Saved | null)?.held ?? []).map((i) => i.id);

  it('writes the held arrivals first, then clears exactly the ids read', async () => {
    const h = moveHost();
    expect(await run(h).out).toEqual({});
    expect(h.invoke.mock.calls.map((c) => c[0])).toEqual(['state.get', 'state.set', 'watch.clearInbox']);
    expect(held(h.state)).toEqual(box.map((i) => i.id));
    expect(h.invoke.mock.calls[2]![1]).toEqual({ ids: box.map((i) => i.id) });
  });

  it('never clears the box when the state was not written', async () => {
    const h = moveHost();
    h.setRefuse = 'HOST_STATE_WRITE_FAILED';
    expect(await run(h).out).toEqual({ error: 'HOST_STATE_WRITE_FAILED' });
    expect(h.invoke.mock.calls.some((c) => c[0] === 'watch.clearInbox')).toBe(false);
  });

  it('sends no arrivals the state cannot hold, leaves the box, and still says the box was full', async () => {
    const h = moveHost();
    const fat: Saved = { ...defaultSaved(), topics: ['x'.repeat(STATE_MAX_BYTES - 300)] };
    const many = Array.from({ length: 100 }, (_, k) => ({ id: `https://openalex.org/W${k}`, source: META, at: AT }));
    expect(await run(h, fat, many, true).out).toEqual({ error: 'STATE_FULL' });
    expect(h.invoke.mock.calls.some((c) => c[0] === 'watch.clearInbox')).toBe(false);
    expect(held(h.state)).toEqual([]);
    expect(h.state).toHaveProperty('boxFullAt', LATER);
  });

  it('hands the "box was full" notice over before it is written', async () => {
    const h = moveHost();
    let open!: () => void;
    h.setGate = new Promise<void>((r) => { open = r; });
    const { out, latest, commit } = run(h, defaultSaved(), box, true);
    await vi.waitFor(() => expect(h.invoke.mock.calls.some((c) => c[0] === 'state.set')).toBe(true));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(latest().boxFullAt).toBe(LATER);
    open();
    await out;
    expect(h.state).toHaveProperty('boxFullAt', LATER);
  });

  it('keeps them held when the clear fails, and says why', async () => {
    const h = moveHost();
    h.clearRefuse = 'WATCH_DOWN';
    expect(await run(h).out).toEqual({ error: 'WATCH_DOWN' });
    expect(held(h.state)).toHaveLength(2);
  });

  it('says when the kept crossing made room for the arrivals', async () => {
    const crossing = { rows: [{ passage: { text: 'a'.repeat(STATE_MAX_BYTES - 2_000) } }] };
    const h = moveHost();
    const withCrossing = { ...defaultSaved(), crossing } as unknown as Saved;
    const many = Array.from({ length: 100 }, (_, k) => ({ id: `https://openalex.org/W${k}`, source: META, at: AT }));
    expect(await run(h, withCrossing, many).out).toEqual({ droppedCrossing: true });
    expect(h.state).not.toHaveProperty('crossing');
    expect(held(h.state)).toHaveLength(100);
  });

  it('does nothing for an empty box', async () => {
    const h = moveHost();
    const { out, commit } = run(h, defaultSaved(), []);
    expect(await out).toEqual({});
    expect(h.invoke).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('markSeen', () => {
  it('clears the named ids only, never the whole box', async () => {
    const invoke = host({ items: [], status: null });
    await markSeen(invoke, ['a', 'b']);
    expect(invoke).toHaveBeenCalledWith('watch.clearInbox', { ids: ['a', 'b'] });
    invoke.mockClear();
    await markSeen(invoke, []);
    expect(invoke).not.toHaveBeenCalled();
  });
});
