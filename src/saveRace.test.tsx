/**
 * Regression of the cold review (session cc8fd7a3, doc 187 §5.5-§5.6): one
 * model job at a time; leaving the crossing view stops it and lifts the lock;
 * a kept crossing is written over the most recent state.
 *
 * The bridge call in flight cannot be cancelled. Leaving the view lifts the
 * lock at once, the crossing's last call lands later and is KEPT (a stop keeps
 * what was read). Between the two, a topic reading can start: it initialises
 * its own copy of the saved state at click time. Both were paid: both stay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fixture from './sources/fixtures/openalex-works.json';

const AT = '2026-10-28T08:00:00.000Z';
const QUOTE = 'LLM judgments can exhibit systematic';
const TEXT = 'We rely on language models to grade answers, and we found that LLM judges can be biased by the order of the answers they compare, so we swap them before every grading round.';
const calls: { action: string; payload?: unknown }[] = [];
const host = { state: null as unknown, deferred: [] as Array<(v: unknown) => void> };

vi.mock('./sdk/mnemo-sdk', () => ({
  MnemoCartridgeSDK: class {
    async invoke(action: string, payload?: unknown) {
      calls.push({ action, payload });
      if (action === 'watch.register') return { targets: 6, intervalMin: 1440 };
      if (action === 'watch.inbox') {
        return { items: [{ id: 'https://openalex.org/W7221749767', label: 'A CaLLM Judge', source: 'Meta', at: AT }], status: { registered: true, targets: 6, intervalMin: 1440, lastRunAt: AT, lastError: null, unread: 1 } };
      }
      if (action === 'state.get') return { state: host.state, updatedAt: null };
      if (action === 'state.set') { host.state = (payload as { state: unknown }).state; return { bytes: 1 }; }
      if (action === 'credits.balance') return { creditsUsdMicro: 1_000_000 };
      if (action === 'model.infer') {
        const prompt = (payload as { prompt: string }).prompt;
        // Every model call waits for the test to release it, in the order it chooses.
        return new Promise((resolve) => host.deferred.push((v) => resolve(v ?? (prompt.includes('<passage>')
          ? { text: `{"verdict":"supports","pub":${prompt.split('<pub n="').findIndex((p) => p.includes(QUOTE))},"claim":"LLM judges can be biased by the order of the answers","quote":"${QUOTE}"}` }
          : { text: '{"verdict":"none"}' }))));
      }
      return { success: true };
    }
  },
}));
vi.mock('@mnemosyne_os/cartridge-sdk', () => ({ onHostConfig: () => () => undefined }));

import App from './App';

beforeEach(() => {
  calls.length = 0;
  host.state = null;
  host.deferred = [];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('a crossing abandoned by leaving the view, then a topic reading', () => {
  it('keeps the crossing that landed during the reading, and the verdicts of the reading', async () => {
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    fireEvent.click(screen.getByRole('button', { name: 'Cross a text' }));
    const meta = (await screen.findByText('Meta')).closest('li')!;
    fireEvent.click(within(meta).getByRole('button', { name: 'Load' }));
    await within(meta).findByText(/^4 loaded/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: TEXT } });
    fireEvent.click(screen.getByRole('button', { name: /Cross 1 passages/ }));
    await waitFor(() => expect(host.deferred).toHaveLength(1));

    // Leave the view while the judge call is in flight: the lock is lifted at once.
    fireEvent.click(screen.getByRole('button', { name: 'Arrivals' }));
    const read = await screen.findByRole('button', { name: /Read 1 texts · 1 model calls/ });
    expect(read).not.toBeDisabled();
    fireEvent.click(read);
    await waitFor(() => expect(host.deferred).toHaveLength(2));

    // The crossing's call lands first: kept, on the most recent state.
    host.deferred[0]!(undefined);
    await waitFor(() => expect((host.state as { crossing?: unknown } | null)?.crossing).toBeDefined());

    // Then the reading ends.
    host.deferred[1]!(undefined);
    await screen.findByText(/Last reading: 1 calls/);
    await waitFor(() => expect(Object.keys((host.state as { verdicts: object }).verdicts)).toHaveLength(1));
    const final = host.state as { crossing?: unknown; verdicts: object };
    // The doc's rule: both were paid, both are kept.
    expect(final.crossing).toBeDefined();
  });
});
