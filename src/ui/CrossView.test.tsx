import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fixture from '../sources/fixtures/openalex-works.json';
import { memoryCorpusStore } from '../corpus/corpusStore';
import { translate } from '../i18n/strings';
import { CrossView, type Kept } from './CrossView';

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);

// A real sentence of the CaLLM judge abstract (fixture W7221749767).
const QUOTE = 'LLM judgments can exhibit systematic';
const TEXT = [
  '# Judges',
  '',
  'We rely on language models to grade answers, and we found that LLM judges can be biased by the order of the answers they compare, so we swap them before every grading round.',
].join('\n');

function setup(onCrossed = vi.fn((): Kept => 'kept')) {
  const store = memoryCorpusStore();
  const fetchJson = vi.fn(async () => ({ meta: { count: 5, next_cursor: null }, results: fixture.results }));
  const invoke = vi.fn(async (action: string, payload?: unknown) => {
    if (action === 'credits.balance') return { creditsUsdMicro: 1_000_000 };
    if (action === 'model.infer') {
      const prompt = (payload as { prompt: string }).prompt;
      const n = prompt.split('<pub n="').findIndex((part) => part.includes(QUOTE));
      return { text: n > 0 ? `{"verdict":"supports","pub":${n},"claim":"LLM judges can be biased by the order of the answers","quote":"${QUOTE}"}` : '{"verdict":"absent"}' };
    }
    throw new Error(`unexpected ${action}`);
  });
  render(<CrossView t={t} lang="en" invoke={invoke} fetchJson={fetchJson} onCrossed={onCrossed} onOpen={vi.fn()} openStore={async () => store} />);
  return { invoke, fetchJson, onCrossed };
}

describe('crossing a text (lot 3)', () => {
  it('asks to load a lab first, loads on a click, and says how many it holds', async () => {
    const { fetchJson } = setup();
    fireEvent.change(await screen.findByLabelText('Your text'), { target: { value: TEXT } });
    expect(screen.getByText('Load a lab first')).toBeInTheDocument();
    expect(fetchJson).not.toHaveBeenCalled();
    const meta = screen.getByText('Meta').closest('li')!;
    fireEvent.click(within(meta).getByRole('button', { name: 'Load' }));
    expect(await within(meta).findByText(/^4 loaded/)).toBeInTheDocument();
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('crosses on a click, the calls on the button, and shows both sides of a verdict', async () => {
    const { invoke, onCrossed } = setup();
    const box = await screen.findByLabelText('Your text');
    fireEvent.click(within(screen.getByText('Meta').closest('li')!).getByRole('button', { name: 'Load' }));
    await screen.findByText(/^4 loaded/);
    fireEvent.change(box, { target: { value: TEXT } });
    expect(invoke.mock.calls.some((c) => c[0] === 'model.infer')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Cross 1 passages · 1 model calls at most/ }));
    expect(await screen.findByText(/Supported 1 · partly 0 · diverge 0 · absent 0 · not verified 0/)).toBeInTheDocument();
    expect(screen.getByText(QUOTE).tagName).toBe('Q');
    expect(screen.getByText('LLM judges can be biased by the order of the answers').tagName).toBe('MARK');
    expect(screen.getByText(/the 5 publications closest by their words, out of 4 loaded \(Meta\)/)).toBeInTheDocument();
    await waitFor(() => expect(onCrossed).toHaveBeenCalledTimes(1));
  });

  it('waits while a topic reading runs, and says when its own crossing runs', async () => {
    const store = memoryCorpusStore();
    const onBusy = vi.fn();
    const props = {
      t, lang: 'en' as const, fetchJson: vi.fn(async () => ({ meta: { count: 5, next_cursor: null }, results: fixture.results })),
      invoke: vi.fn(async (action: string) => (action === 'credits.balance' ? { creditsUsdMicro: 1_000_000 } : { text: '{"verdict":"absent"}' })),
      onCrossed: vi.fn((): Kept => 'kept'), onOpen: vi.fn(), openStore: async () => store, onBusy,
    };
    const { rerender } = render(<CrossView {...props} locked />);
    fireEvent.click(within((await screen.findByText('Meta')).closest('li')!).getByRole('button', { name: 'Load' }));
    await screen.findByText(/^4 loaded/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: TEXT } });
    expect(screen.getByRole('button', { name: /Cross 1 passages/ })).toBeDisabled();
    rerender(<CrossView {...props} locked={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Cross 1 passages/ }));
    await screen.findByText(/Supported 0 · partly 0 · diverge 0 · absent 1/);
    expect(onBusy).toHaveBeenCalledWith(true);
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });

  it('does not cross while a lab is loading: each job keeps its own stop', async () => {
    const store = memoryCorpusStore();
    await store.put([{ id: 'W1', lab: 'meta', title: 'Judges', url: 'u', text: 'LLM judges can be biased by the order of the answers they compare.' }]);
    await store.setLoad({ lab: 'meta', count: 1, listed: 1, loadedAt: '2026-10-29T10:00:00.000Z', complete: true });
    const fetchJson = vi.fn(() => new Promise<unknown>(() => undefined));
    render(<CrossView t={t} lang="en" invoke={vi.fn()} fetchJson={fetchJson} onCrossed={vi.fn((): Kept => 'kept')} onOpen={vi.fn()} openStore={async () => store} />);
    fireEvent.change(await screen.findByLabelText('Your text'), { target: { value: TEXT } });
    expect(screen.getByRole('button', { name: /Cross 1 passages/ })).toBeEnabled();
    fireEvent.click(within(screen.getByText('Meta').closest('li')!).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cross 1 passages/ })).toBeDisabled());
  });

  it('says when a crossing could not be kept', async () => {
    setup(vi.fn((): Kept => 'too-long'));
    fireEvent.click(within((await screen.findByText('Meta')).closest('li')!).getByRole('button', { name: 'Load' }));
    await screen.findByText(/^4 loaded/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: TEXT } });
    fireEvent.click(screen.getByRole('button', { name: /Cross 1 passages/ }));
    expect(await screen.findByText(/too long to be kept/)).toBeInTheDocument();
  });

  it('reads a matched publication in full on a click, and says what it added (lot 4)', async () => {
    const store = memoryCorpusStore();
    const fetchJson = vi.fn(async () => ({
      meta: { count: 1, next_cursor: null },
      results: [{ ...fixture.results.find((r) => r.id.endsWith('W7221749767')), best_oa_location: { pdf_url: 'https://arxiv.org/pdf/x.pdf' }, primary_location: { landing_page_url: 'https://arxiv.org/abs/x', license: 'cc-by' } }],
    }));
    const full = `# Bias\n\n${'We study how LLM judgments can exhibit systematic position bias in pairwise grading. '.repeat(8)}`;
    const invoke = vi.fn(async (action: string, payload?: unknown) => {
      if (action === 'credits.balance') return { creditsUsdMicro: 1_000_000 };
      if (action === 'reader.downloadUrl') return { success: true, data: { path: 'C:\\x.pdf' } };
      if (action === 'reader.extractDocument') return { success: true, data: { text: full, truncated: false } };
      if (action === 'model.infer') {
        return { text: `{"verdict":"supports","pub":1,"claim":"LLM judges can be biased by the order of the answers","quote":"${QUOTE}"}` };
      }
      throw new Error(`unexpected ${action} ${JSON.stringify(payload)}`);
    });
    render(<CrossView t={t} lang="en" invoke={invoke} fetchJson={fetchJson} onCrossed={vi.fn((): Kept => 'kept')} onOpen={vi.fn()} openStore={async () => store} />);
    fireEvent.click(within((await screen.findByText('Meta')).closest('li')!).getByRole('button', { name: 'Load' }));
    await screen.findByText(/^1 loaded/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: TEXT } });
    fireEvent.click(screen.getByRole('button', { name: /Cross 1 passages/ }));
    expect(await screen.findByText('Licence: cc-by')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Read the full text/ }));
    expect(await screen.findByText(/Full text read: 1 passages/)).toBeInTheDocument();
    expect(screen.getByText(/1 full texts/)).toBeInTheDocument();
    expect((await store.all()).some((w) => w.id.endsWith('#p1') && w.full)).toBe(true);
  });

  it('falls back to memory and says so when the cache cannot open', async () => {
    render(<CrossView t={t} lang="en" invoke={vi.fn()} fetchJson={vi.fn()} onCrossed={vi.fn((): Kept => 'kept')} onOpen={vi.fn()} openStore={async () => { throw new Error('INDEXEDDB_UNAVAILABLE'); }} />);
    expect(await screen.findByText(/The publication cache is not available: INDEXEDDB_UNAVAILABLE/)).toBeInTheDocument();
  });
});
