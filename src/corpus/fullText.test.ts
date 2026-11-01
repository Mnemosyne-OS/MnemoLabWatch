import { describe, expect, it, vi } from 'vitest';
import { Bm25Index } from './bm25';
import { memoryCorpusStore } from './corpusStore';
import { baseId, readFullText } from './fullText';
import { runCrossing } from '../research/crossing';

const WORK = { id: 'W9', lab: 'deepmind' as const, title: 'Harnesses', url: 'https://doi.org/z', licence: 'cc-by', pdfUrl: 'https://arxiv.org/pdf/1.pdf' };
const para = (s: string, n: number) => Array.from({ length: n }, (_, i) => `${s} sentence ${i}.`).join(' ');
const FULL = `# Introduction\n\n${para('Agent harnesses evolve', 25)}\n\n# Results\n\n${para('Harness search improves recall', 25)}`;

function host(over: Record<string, unknown> = {}) {
  return vi.fn(async (action: string, _payload?: unknown) => {
    if (action in over) {
      const v = over[action];
      if (v instanceof Error) throw v;
      return v;
    }
    if (action === 'reader.downloadUrl') return { success: true, data: { path: 'C:\\Users\\x\\cache\\W9.pdf', name: 'W9.pdf', bytes: 10 } };
    if (action === 'reader.extractDocument') return { success: true, data: { text: FULL, truncated: false } };
    throw new Error(`unexpected ${action}`);
  });
}

describe('readFullText (lot 4)', () => {
  it('downloads the open PDF, extracts it, and adds its passages next to the abstract, licence carried', async () => {
    const store = memoryCorpusStore();
    const invoke = host();
    const read = await readFullText(WORK, invoke, store);
    expect(read).toEqual({ passages: 2, truncated: false });
    const all = await store.all();
    expect(all.map((w) => w.id)).toEqual(['W9#p1', 'W9#p2']);
    expect(all[1]).toMatchObject({ full: true, part: 2, heading: 'Results', licence: 'cc-by', lab: 'deepmind' });
    expect(invoke).toHaveBeenCalledWith('reader.downloadUrl', { url: WORK.pdfUrl, filename: 'W9.pdf' });
    expect(invoke).toHaveBeenCalledWith('reader.extractDocument', { filePath: 'C:\\Users\\x\\cache\\W9.pdf' });
    // Permission-gated calls: no short bound.
    for (const c of invoke.mock.calls) expect((c as unknown[])[2]).toBeUndefined();
  });

  it('refuses without an open PDF, and says why a step failed', async () => {
    const store = memoryCorpusStore();
    await expect(readFullText({ ...WORK, pdfUrl: undefined }, host(), store)).rejects.toThrow('NO_OPEN_PDF');
    await expect(readFullText(WORK, host({ 'reader.downloadUrl': { success: false, error: 'HTTP 403' } }), store)).rejects.toThrow('HTTP 403');
    await expect(readFullText(WORK, host({ 'reader.extractDocument': { success: true, data: { text: '' } } }), store)).rejects.toThrow('FULL_TEXT_EMPTY');
    expect(await store.all()).toEqual([]);
  });

  it('counts publications, not passages, in a crossing\'s denominator', async () => {
    const store = memoryCorpusStore();
    await store.put([{ id: 'W9', lab: 'deepmind', title: 'Harnesses', url: 'u', text: 'Agent harnesses evolve with feedback from execution traces.' }]);
    await readFullText(WORK, host(), store);
    const corpus = await store.all();
    const index = new Bm25Index(corpus.map((w) => ({ id: w.id, text: `${w.title} ${w.text}` })));
    const c = await runCrossing([{ n: 1, text: 'Unrelated words entirely: lattice gauge theory.' }], corpus, index, { english: true, labs: ['deepmind'] }, vi.fn(async () => ({ creditsUsdMicro: 1_000_000 })));
    expect(corpus).toHaveLength(3);
    expect(c.loaded).toBe(1);
    expect(baseId('W9#p2')).toBe('W9');
  });
});
