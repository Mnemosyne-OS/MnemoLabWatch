import { describe, expect, it, vi } from 'vitest';
import { OPENAI_FEED_LABEL, WATCH_INTERVAL_MIN } from './labs';
import { loadWatch, markSeen } from './load';
import fixture from './sources/fixtures/openalex-works.json';
import rss from './sources/fixtures/openai-rss.xml?raw';

// The host writes a target's LABEL as its items' source (cartridgeWatch.ts): that is the shape tested.
const META = 'Meta';
const FEED = OPENAI_FEED_LABEL;
const AT = '2026-10-28T08:00:00.000Z';

function host(inbox: unknown, feed: unknown = { status: 200, body: rss, encoding: 'utf8' }) {
  return vi.fn(async (action: string) => {
    if (action === 'watch.register') return { targets: 6, intervalMin: WATCH_INTERVAL_MIN };
    if (action === 'watch.inbox') return inbox;
    if (action === 'social.fetch') {
      if (feed instanceof Error) throw feed;
      return feed;
    }
    if (action === 'watch.clearInbox') return { left: 0 };
    throw new Error(`unexpected ${action}`);
  });
}

describe('loadWatch', () => {
  it('registers the six targets once a day, then reads the inbox and the details', async () => {
    const invoke = host({
      items: [
        { id: 'https://openalex.org/W7221749767', label: 'x', source: META, at: AT },
        { id: 'https://openai.com/index/building-scientific-understanding-with-academic-communities', source: FEED, at: AT },
      ],
      status: { registered: true, targets: 6, intervalMin: 1440, lastRunAt: AT, lastError: null, unread: 2 },
    });
    const fetchJson = vi.fn(async () => fixture);
    const out = await loadWatch({ invoke, fetchJson });
    const register = invoke.mock.calls.find((c) => c[0] === 'watch.register') as unknown as [string, { targets: unknown[]; intervalMin: number }];
    expect(register[1].targets).toHaveLength(6);
    expect(register[1].intervalMin).toBe(1440);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(out.arrivals.map((a) => a.details)).toEqual([true, true]);
    expect(out.status?.lastRunAt).toBe(AT);
    expect(out.worksError).toBeUndefined();
    expect(out.feedError).toBeUndefined();
  });

  it('gives the permission-gated calls no short bound: the first one waits on the host prompt', async () => {
    const invoke = host({ items: [{ id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null });
    await loadWatch({ invoke, fetchJson: vi.fn() });
    await markSeen(invoke, ['https://openai.com/index/y']);
    const gated = invoke.mock.calls.filter((c) => /^watch\.|^social\.fetch$/.test(c[0] as string));
    expect(gated.map((c) => c[0])).toEqual(['watch.register', 'watch.inbox', 'social.fetch', 'watch.clearInbox']);
    for (const c of gated) expect((c as unknown[])[2], c[0] as string).toBeUndefined();
  });

  it('reads no source when the inbox is empty', async () => {
    const invoke = host({ items: [], status: null });
    const fetchJson = vi.fn();
    const out = await loadWatch({ invoke, fetchJson });
    expect(out.arrivals).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(invoke.mock.calls.some((c) => c[0] === 'social.fetch')).toBe(false);
  });

  it('keeps the arrivals and says why when a details source fails', async () => {
    const invoke = host(
      { items: [{ id: 'https://openalex.org/W1', label: 'Kept', source: META, at: AT }, { id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null },
      new Error('HTTP_403'),
    );
    const out = await loadWatch({ invoke, fetchJson: async () => { throw new Error('HTTP_429'); } });
    expect(out.arrivals).toHaveLength(2);
    expect(out.arrivals.every((a) => a.details === false)).toBe(true);
    expect(out.worksError).toBe('HTTP_429');
    expect(out.feedError).toBe('HTTP_403');
  });

  it('says a truncated or unreadable feed instead of parsing it', async () => {
    const truncated = host({ items: [{ id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null }, { body: '<rss>', truncated: true });
    expect((await loadWatch({ invoke: truncated, fetchJson: vi.fn() })).feedError).toBe('HOST_FETCH_TRUNCATED');
    const html = host({ items: [{ id: 'https://openai.com/index/y', source: FEED, at: AT }], status: null }, { status: 200, body: '<html><body>x</body' });
    expect((await loadWatch({ invoke: html, fetchJson: vi.fn() })).feedError).toBe('RSS_XML_UNREADABLE');
  });

  it('fails as a whole when the host refuses the watch', async () => {
    const invoke = vi.fn(async () => { throw new Error('PERMISSION_DENIED: watch:background'); });
    await expect(loadWatch({ invoke, fetchJson: vi.fn() })).rejects.toThrow('PERMISSION_DENIED');
  });

  it('refuses an inbox answer without a list', async () => {
    await expect(loadWatch({ invoke: host({ nope: true }), fetchJson: vi.fn() })).rejects.toThrow('WATCH_INBOX_UNREADABLE');
  });
});

describe('markSeen', () => {
  it('clears the named ids only, never the whole inbox', async () => {
    const invoke = host({ items: [], status: null });
    await markSeen(invoke, ['a', 'b']);
    expect(invoke).toHaveBeenCalledWith('watch.clearInbox', { ids: ['a', 'b'] });
    invoke.mockClear();
    await markSeen(invoke, []);
    expect(invoke).not.toHaveBeenCalled();
  });
});
