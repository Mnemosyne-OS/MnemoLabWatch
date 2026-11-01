import { describe, expect, it } from 'vitest';
import xml from './fixtures/openai-rss.xml?raw';
import { isResearch, parseRss, rssDay } from './openaiRss';

describe('the OpenAI feed, read from a real answer (2026-10-28)', () => {
  const posts = parseRss(xml);

  it('reads every item, CDATA titles included', () => {
    expect(posts).toHaveLength(3);
    for (const p of posts) {
      expect(p.title).not.toContain('CDATA');
      expect(p.id).toMatch(/^https:\/\/openai\.com\//);
      expect(p.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('tells research from the rest by category', () => {
    expect(posts.map(isResearch)).toEqual([true, false, true]);
  });

  it('dates a post on its UTC day', () => {
    expect(rssDay('Mon, 26 Oct 2026 23:30:00 GMT')).toBe('2026-10-26');
    expect(rssDay('not a date')).toBeUndefined();
  });

  it('refuses what is not XML', () => {
    expect(() => parseRss('<html><body>blocked</body')).toThrow('RSS_XML_UNREADABLE');
  });
});
