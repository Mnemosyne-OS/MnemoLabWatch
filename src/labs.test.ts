import { describe, expect, it } from 'vitest';
import { isFeedSource, LABS, labOfSource, OPENAI_RSS, PAPER_FILTER, WATCH_INTERVAL_MIN, watchTargets } from './labs';

describe('watch targets', () => {
  const targets = watchTargets();

  it('hands the host one OpenAlex list per lab plus the OpenAI feed, within its 12', () => {
    expect(targets).toHaveLength(LABS.length + 1);
    expect(targets.length).toBeLessThanOrEqual(12);
    expect(targets.at(-1)).toMatchObject({ url: OPENAI_RSS, spec: { mode: 'atom' } });
  });

  it('only gives https urls: the host drops any other public target', () => {
    for (const t of targets) expect(t.url).toMatch(/^https:\/\//);
  });

  it('leaves Zenodo out of every lab list and keeps articles and preprints', () => {
    for (const t of targets.filter((x) => x.url !== OPENAI_RSS)) {
      expect(t.url).toContain(PAPER_FILTER);
      expect(t.url).toContain('primary_location.source.id:!S4306400562');
      expect(t.url).toContain('type:article|preprint');
    }
  });

  it('lists, sorted by publication date, and never searches (10 credits a call)', () => {
    for (const t of targets.filter((x) => x.url !== OPENAI_RSS)) {
      expect(t.url).toContain('sort=publication_date:desc');
      expect(t.url).not.toMatch(/[?&]search=|\.search:/);
      expect(t.url).not.toContain('from_created_date');
      expect(t.spec).toEqual({ mode: 'json', arrayPath: 'results', idField: 'id', labelField: 'title' });
    }
  });

  it('passes once a day, inside the host bounds', () => {
    expect(WATCH_INTERVAL_MIN).toBe(1440);
  });

  it('maps every target back to its lab, by the label the host writes as source and by its url', () => {
    expect(targets.map((t) => labOfSource(t.label!))).toEqual([...LABS.map((l) => l.key), 'openai']);
    expect(targets.map((t) => labOfSource(t.url))).toEqual([...LABS.map((l) => l.key), 'openai']);
    expect(labOfSource('https://example.org/feed')).toBeNull();
  });

  it('tells the feed from the lab lists, by label or url, and gives every target a distinct label', () => {
    expect(targets.map((t) => isFeedSource(t.label!))).toEqual([false, false, false, false, false, true]);
    expect(isFeedSource(OPENAI_RSS)).toBe(true);
    expect(new Set(targets.map((t) => t.label)).size).toBe(targets.length);
  });
});
