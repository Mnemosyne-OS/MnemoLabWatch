import { describe, expect, it, vi } from 'vitest';
import { Bm25Index } from '../corpus/bm25';
import type { CorpusWork } from '../corpus/corpusStore';
import { crossingCounts, plannedCalls, runCrossing } from './crossing';
import type { Passage } from './passages';

const CORPUS: CorpusWork[] = [
  { id: 'W2', lab: 'meta', title: 'Calibrated judges', url: 'https://doi.org/x', published: '2026-10-15', text: 'LLM judges show position bias in pairwise evaluation, and swapping answers reduces it.' },
  { id: 'W3', lab: 'openai', title: 'Protein design', url: 'https://doi.org/y', text: 'Protein design with diffusion models at scale.' },
];
const index = new Bm25Index(CORPUS.map((w) => ({ id: w.id, text: `${w.title} ${w.text}` })));
const P = (n: number, text: string): Passage => ({ n, text });
const PASSAGES = [
  P(1, 'Our judges are calibrated. We find that position bias drops when answers are swapped.'),
  P(2, 'Quantum chromodynamics on a lattice.'),
];

function host(answers: unknown[], balances: number[] = [1_000_000, 999_000]) {
  return vi.fn(async (action: string, _payload?: unknown) => {
    if (action === 'credits.balance') return { creditsUsdMicro: balances.shift() };
    if (action === 'model.infer') return answers.shift();
    throw new Error(`unexpected ${action}`);
  });
}

describe('runCrossing', () => {
  it('asks the judge only for a passage that shares words with a publication, and keeps the quoted work', async () => {
    const invoke = host([{ text: '{"verdict":"supports","pub":1,"claim":"position bias drops when answers are swapped","quote":"swapping answers reduces it"}' }]);
    const c = await runCrossing(PASSAGES, CORPUS, index, { english: true, labs: ['meta', 'openai'] }, invoke);
    expect(c.calls).toBe(1);
    expect(c.rows.map((r) => r.verdict.kind)).toEqual(['supports', 'absent']);
    expect(c.rows[1]!.verdict).toEqual({ kind: 'absent', shown: 0 });
    expect(c.works.W2).toMatchObject({ title: 'Calibrated judges', lab: 'meta', published: '2026-10-15' });
    expect(c.loaded).toBe(2);
    expect(c.usd).toBeCloseTo(0.001, 6);
    expect(crossingCounts(c)).toEqual({ supports: 1, partial: 0, diverges: 0, absent: 1, unverified: 0 });
  });

  it('asks English search words first for a text in another language, and counts both calls', async () => {
    const invoke = host([
      '{"terms":["position bias","LLM judges","swapping answers"]}',
      '{"verdict":"absent"}',
    ]);
    const c = await runCrossing([P(1, 'Nos juges sont calibrés : le biais de position baisse quand on inverse les réponses.')], CORPUS, index, { english: false, labs: ['meta'] }, invoke);
    expect(c.calls).toBe(2);
    expect(c.translated).toBe(true);
    // The French passage alone shares no word with the English abstracts: the search words found W2.
    expect(c.rows[0]!.verdict).toEqual({ kind: 'absent', shown: 1 });
    const prompts = invoke.mock.calls.filter((x) => x[0] === 'model.infer').map((x) => (x[1] as { prompt: string; disableRAG: boolean }));
    expect(prompts.every((p) => p.disableRAG)).toBe(true);
  });

  it('says "not measured" when the balance cannot be read, never 0', async () => {
    const invoke = vi.fn(async (action: string) => {
      if (action === 'credits.balance') throw new Error('PERMISSION_DENIED: wallet:read');
      return '{"verdict":"absent"}';
    });
    const c = await runCrossing(PASSAGES, CORPUS, index, { english: true, labs: ['meta'] }, invoke);
    expect(c.calls).toBe(1);
    expect(c.usd).toBeNull();
  });

  it('stops at a refusal no next call could pass, and keeps the load date of the denominator', async () => {
    const invoke = vi.fn(async (action: string) => {
      if (action === 'credits.balance') return { creditsUsdMicro: 1_000_000 };
      return { success: false, error: 'used up', errorCode: 'CLOUD_QUOTA_EXHAUSTED' };
    });
    const twice = [PASSAGES[0]!, { ...PASSAGES[0]!, n: 2 }];
    const c = await runCrossing(twice, CORPUS, index, { english: true, labs: ['meta'], loadedUntil: '2026-10-29T10:00:00.000Z' }, invoke);
    expect(c.stoppedBy).toBe('CLOUD_QUOTA_EXHAUSTED');
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]!.verdict).toMatchObject({ kind: 'unverified', reason: 'failed', detail: 'used up' });
    expect(invoke.mock.calls.filter((x) => x[0] === 'model.infer')).toHaveLength(1);
    expect(c.loadedUntil).toBe('2026-10-29T10:00:00.000Z');
  });

  it('says the planned calls before the click', () => {
    expect(plannedCalls(PASSAGES, index, true)).toBe(1);
    expect(plannedCalls(PASSAGES, index, false)).toBe(4);
  });

  it('keeps what was read when stopped, and a failed call is "not verified"', async () => {
    const ctrl = new AbortController();
    const invoke = vi.fn(async (action: string) => {
      if (action === 'credits.balance') return { creditsUsdMicro: 1_000_000 };
      ctrl.abort();
      throw new Error('Host did not reply');
    });
    const c = await runCrossing([PASSAGES[0]!, PASSAGES[0]!], CORPUS, index, { english: true, labs: ['meta'] }, invoke, ctrl.signal);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]!.verdict).toMatchObject({ kind: 'unverified', reason: 'failed' });
  });
});
