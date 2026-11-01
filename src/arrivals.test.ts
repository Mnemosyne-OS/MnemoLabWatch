import { describe, expect, it } from 'vitest';
import { buildArrivals, cleanLabel, countByLab, titleKey, type InboxItem } from './arrivals';
import { LABS, labWatchUrl, OPENAI_FEED_LABEL, OPENAI_RSS } from './labs';
import fixture from './sources/fixtures/openalex-works.json';
import rss from './sources/fixtures/openai-rss.xml?raw';
import { parseWorks, type Work } from './sources/openalex';
import { parseRss, type Post } from './sources/openaiRss';

// The host writes a target's LABEL as its items' source (cartridgeWatch.ts): that is the shape tested.
const META = 'Meta';
const OPENAI = 'OpenAI';
const FEED = OPENAI_FEED_LABEL;
const works = new Map<string, Work>(parseWorks(fixture).map((w) => [w.id, w]));
const posts = new Map<string, Post>(parseRss(rss).map((p) => [p.id, p]));
const [research, other] = [...posts.values()];

const item = (id: string, source: string, at = '2026-10-28T08:00:00.000Z', label?: string): InboxItem =>
  ({ id, source, at, ...(label ? { label } : {}) });

describe('arrivals', () => {
  it('folds two OpenAlex records of the same title into one arrival that keeps both ids', () => {
    const list = buildArrivals([
      item('https://openalex.org/W7214912522', OPENAI, '2026-10-27T08:00:00.000Z'),
      item('https://openalex.org/W7215133695', OPENAI, '2026-10-28T08:00:00.000Z'),
    ], works, posts);
    expect(list).toHaveLength(1);
    expect(list[0]!.ids).toEqual(['https://openalex.org/W7214912522', 'https://openalex.org/W7215133695']);
    expect(list[0]!.recordedAt).toBe('2026-10-27T08:00:00.000Z');
  });

  it('keeps an arrival whose details were not read, with the watch title and no invented date', () => {
    const [a] = buildArrivals([item('https://openalex.org/W1', META, undefined, 'A title from the watch')], new Map(), posts);
    expect(a).toMatchObject({ details: false, title: 'A title from the watch', labs: ['meta'], url: 'https://openalex.org/W1' });
    expect(a!.published).toBeUndefined();
  });

  it('carries the abstract state of the work', () => {
    const [a] = buildArrivals([item('https://openalex.org/W7221005207', META)], works, posts);
    expect(a).toMatchObject({ abstract: 'too-short', abstractWords: 3, details: true });
  });

  it('marks a post as research or not, from its categories', () => {
    const list = buildArrivals([item(research!.id, FEED), item(other!.id, FEED)], works, posts);
    expect(list.find((a) => a.title === research!.title)!.research).toBe(true);
    expect(list.find((a) => a.title === other!.title)!.research).toBe(false);
  });

  it('leaves research unknown when the feed was not read, and cleans the CDATA of the watch title', () => {
    const [a] = buildArrivals([item('https://openai.com/index/x', FEED, undefined, '<![CDATA[Some post &amp; more]]>')], works, new Map());
    expect(a).toMatchObject({ title: 'Some post & more', details: false, url: 'https://openai.com/index/x' });
    expect(a!.research).toBeUndefined();
  });

  it('sorts the newest publication first and puts undated arrivals last', () => {
    const list = buildArrivals([
      item('https://openalex.org/W1', META, undefined, 'Undated'),
      item('https://openalex.org/W7214912522', OPENAI),
      item('https://openalex.org/W7223006342', META),
    ], works, posts);
    expect(list.map((a) => a.title.slice(0, 12))).toEqual(['Documented D', 'What if auto', 'Undated']);
  });

  it('counts an arrival once per lab', () => {
    const list = buildArrivals([item('https://openalex.org/W7221749767', META), item(research!.id, FEED)], works, posts);
    expect(countByLab(list)).toEqual({ meta: 1, openai: 1 });
  });

  it('still reads a watch whose items carry the target url as their source', () => {
    const metaUrl = labWatchUrl(LABS.find((l) => l.key === 'meta')!);
    const list = buildArrivals([item('https://openalex.org/W7221749767', metaUrl), item(research!.id, OPENAI_RSS)], works, posts);
    expect(list.map((a) => [a.kind, a.labs])).toEqual(expect.arrayContaining([['paper', ['meta']], ['post', ['openai']]]));
  });

  it('compares titles without case, accents or punctuation', () => {
    expect(titleKey('Été — Résumé, v2!')).toBe(titleKey('ete resume v2'));
    expect(cleanLabel('  <![CDATA[A  b]]> ')).toBe('A b');
  });
});
