import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/openalex-works.json';
import { abstractWords, DETAILS_BATCH, detailsUrl, fetchWorks, MIN_ABSTRACT_WORDS, parseWork, parseWorks, shortId } from './openalex';

const works = parseWorks(fixture);
const byId = new Map(works.map((w) => [w.id, w]));

describe('OpenAlex works, read from a real answer (2026-10-28)', () => {
  it('reads every work of the answer', () => {
    expect(works.map((w) => w.id)).toEqual(['W7214912522', 'W7215133695', 'W7221005207', 'W7221749767', 'W7223006342']);
  });

  it('rebuilds the abstract in word order', () => {
    const words = abstractWords({ world: [1], hello: [0], again: [2] });
    expect(words.join(' ')).toBe('hello world again');
  });

  it('says a three-word abstract is too short, and a real one readable', () => {
    expect(byId.get('W7221005207')).toMatchObject({ abstract: 'too-short', abstractWords: 3 });
    const judge = byId.get('W7221749767')!;
    expect(judge.abstract).toBe('readable');
    expect(judge.abstractWords).toBeGreaterThanOrEqual(MIN_ABSTRACT_WORDS);
  });

  it('attributes the lab from the authors institutions', () => {
    expect(byId.get('W7221749767')!.labs).toEqual(['meta']);
    expect(byId.get('W7214912522')!.labs).toContain('openai');
    // A medical paper with one Meta Platforms author is Meta's, as OpenAlex says.
    expect(byId.get('W7223006342')!.labs).toEqual(['meta']);
  });

  it('keeps the two dates as days', () => {
    expect(byId.get('W7214912522')).toMatchObject({ published: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), created: '2026-10-01' });
  });

  it('links the DOI first, then the landing page, then OpenAlex', () => {
    expect(parseWork({ id: 'https://openalex.org/W1', title: 'T', doi: 'https://doi.org/10.1/x' })!.url).toBe('https://doi.org/10.1/x');
    expect(parseWork({ id: 'https://openalex.org/W1', title: 'T', primary_location: { landing_page_url: 'https://arxiv.org/abs/1' } })!.url).toBe('https://arxiv.org/abs/1');
    expect(parseWork({ id: 'https://openalex.org/W1', title: 'T', primary_location: null })!.url).toBe('https://openalex.org/W1');
  });

  it('drops a record without id or title, and says missing for no abstract', () => {
    expect(parseWork({ id: 'https://openalex.org/W1' })).toBeNull();
    expect(parseWork({ title: 'T' })).toBeNull();
    expect(parseWork({ id: 'W1', title: 'T', abstract_inverted_index: null })).toMatchObject({ abstract: 'missing', abstractWords: 0 });
  });

  it('refuses an answer that is not a list of works', () => {
    expect(() => parseWorks({ error: 'x' })).toThrow('OPENALEX_NO_RESULTS');
  });
});

describe('fetching details', () => {
  it('asks by short id, one list call per 50 ids', async () => {
    const ids = Array.from({ length: DETAILS_BATCH + 3 }, (_, i) => `https://openalex.org/W${i + 1}`);
    const fetchJson = vi.fn(async () => ({ results: [] }));
    await fetchWorks([...ids, ids[0]!], fetchJson);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    const first = (fetchJson.mock.calls[0] as unknown as [string])[0];
    expect(first).toContain('filter=openalex:W1|W2|');
    expect(first).not.toContain('https://openalex.org/W');
    expect(detailsUrl(['W9'])).toContain('select=id,doi,title,publication_date,created_date,abstract_inverted_index,authorships,primary_location');
  });

  it('shortens an OpenAlex url and leaves a short id alone', () => {
    expect(shortId('https://openalex.org/W7221749767')).toBe('W7221749767');
    expect(shortId('W7221749767')).toBe('W7221749767');
  });
});
