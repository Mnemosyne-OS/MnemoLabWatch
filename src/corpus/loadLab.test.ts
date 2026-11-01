import { describe, expect, it, vi } from 'vitest';
import fixture from '../sources/fixtures/openalex-works.json';
import { memoryCorpusStore } from './corpusStore';
import { corpusPageUrl, loadLab } from './loadLab';

describe('loadLab', () => {
  it('pages with the cursor, keeps only readable abstracts, and leaves Zenodo out', async () => {
    const pages = [
      { meta: { count: 7, next_cursor: 'abc' }, results: fixture.results },
      { meta: { count: 7, next_cursor: null }, results: [] },
    ];
    const fetchJson = vi.fn(async () => pages.shift());
    const store = memoryCorpusStore();
    const load = await loadLab('meta', fetchJson, store);
    // 5 works listed: the 3-word abstract is not kept, the 4 others are.
    expect(load).toMatchObject({ lab: 'meta', listed: 5, count: 4, complete: true });
    expect((await store.all()).every((w) => w.lab === 'meta' && w.text.split(' ').length >= 20)).toBe(true);
    const urls = fetchJson.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls[0]).toContain('cursor=*');
    expect(urls[1]).toContain('cursor=abc');
    expect(urls[0]).toContain('primary_location.source.id:!S4306400562');
    expect(urls[0]).not.toMatch(/[?&]search=/);
  });

  it('says a stopped load is partial, with what it holds', async () => {
    const ctrl = new AbortController();
    const store = memoryCorpusStore();
    const fetchJson = vi.fn(async () => { ctrl.abort(); return { meta: { count: 400, next_cursor: 'next' }, results: fixture.results }; });
    await expect(loadLab('meta', fetchJson, store, ctrl.signal)).rejects.toThrow();
    expect(await store.loads()).toEqual([expect.objectContaining({ lab: 'meta', count: 4, complete: false })]);
  });

  it('asks 200 works a page', () => {
    expect(corpusPageUrl('I4210114444', '*')).toContain('per-page=200');
  });
});
