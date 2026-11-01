import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fixture from './sources/fixtures/openalex-works.json';
import rss from './sources/fixtures/openai-rss.xml?raw';
import { OPENAI_FEED_LABEL } from './labs';
import { STAND_IN_TOPICS, topicsKey } from './topics';

// The host writes a target's LABEL as its items' source (cartridgeWatch.ts): that is the shape tested.
const META = 'Meta';
const OPENAI = 'OpenAI';
const AT = '2026-10-28T08:00:00.000Z';

// A fake bridge: every host call goes through `invoke`, recorded here.
const calls: { action: string; payload?: unknown }[] = [];
const host = {
  refuse: null as string | null,
  stateRefuse: null as string | null,
  watchRefuse: null as string | null,
  setRefuse: null as string | null,
  inferRefuse: null as string | null,
  items: [] as unknown[],
  lastRunAt: AT as string | null,
  state: null as unknown,
  balances: [] as number[],
};

// A real sentence of the CaLLM judge abstract (fixture W7221749767).
const QUOTE = 'LLM judgments can exhibit systematic';

vi.mock('./sdk/mnemo-sdk', () => ({
  MnemoCartridgeSDK: class {
    async invoke(action: string, payload?: unknown) {
      calls.push({ action, payload });
      if (host.refuse) throw new Error(host.refuse);
      if (host.watchRefuse && action.startsWith('watch.')) throw new Error(host.watchRefuse);
      if (action === 'watch.register') return { targets: 6, intervalMin: 1440 };
      if (action === 'watch.inbox') {
        return { items: host.items, status: { registered: true, targets: 6, intervalMin: 1440, lastRunAt: host.lastRunAt, lastError: null, unread: host.items.length } };
      }
      if (action === 'social.fetch') return { status: 200, body: rss, encoding: 'utf8' };
      if (action === 'state.get') {
        if (host.stateRefuse) throw new Error(host.stateRefuse);
        return { state: host.state, updatedAt: null };
      }
      if (action === 'state.set') {
        if (host.setRefuse) throw new Error(host.setRefuse);
        host.state = (payload as { state: unknown }).state;
        return { bytes: 1 };
      }
      if (action === 'credits.balance') return { creditsUsdMicro: host.balances.shift() };
      if (action === 'model.infer') {
        if (host.inferRefuse) return { success: false, error: 'Cloud quota exhausted', errorCode: host.inferRefuse };
        const prompt = (payload as { prompt: string }).prompt;
        return { text: prompt.includes(QUOTE) ? `{"verdict":"touches","topic":3,"quote":"${QUOTE}"}` : '{"verdict":"none"}' };
      }
      return { success: true };
    }
  },
}));

// The useI18n hook imports onHostConfig from the package itself.
vi.mock('@mnemosyne_os/cartridge-sdk', () => ({ onHostConfig: () => () => undefined }));

import App from './App';

const posts = [...rss.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((m) => m[1]!);

beforeEach(() => {
  calls.length = 0;
  host.refuse = null;
  host.stateRefuse = null;
  host.watchRefuse = null;
  host.setRefuse = null;
  host.inferRefuse = null;
  host.state = null;
  host.balances = [2_000_000, 1_997_500];
  host.lastRunAt = AT;
  host.items = [
    { id: 'https://openalex.org/W7221749767', label: 'x', source: META, at: AT },
    { id: 'https://openalex.org/W7214912522', label: 'x', source: OPENAI, at: AT },
    { id: 'https://openalex.org/W7215133695', label: 'x', source: OPENAI, at: AT },
    { id: posts[0], source: OPENAI_FEED_LABEL, at: AT },
    { id: posts[1], source: OPENAI_FEED_LABEL, at: AT },
  ];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe('Lab Watch', () => {
  it('lists the arrivals by lab, folds the two records of one work, and folds the posts that are not research', async () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Reading the watch');
    await screen.findByText(/A CaLLM Judge is a Better Judge/);
    // 2 papers (the duplicate folded) + 1 research post; the product post is folded away.
    expect(screen.getByText('Arrivals · 3')).toBeInTheDocument();
    expect(screen.getByText('2 records')).toBeInTheDocument();
    expect(screen.queryByText(/ServiceNow/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Other OpenAI posts · 1' }));
    expect(screen.getByText(/ServiceNow/)).toBeInTheDocument();
  });

  it('counts each lab on its tile and filters on a click', async () => {
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    const meta = screen.getByRole('button', { name: /^Meta/ });
    expect(within(meta).getByText('1')).toBeInTheDocument();
    fireEvent.click(meta);
    expect(meta).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/What if automating/)).not.toBeInTheDocument();
    expect(screen.getByText(/A CaLLM Judge/)).toBeInTheDocument();
  });

  it('clears only the ids of an arrival marked as seen', async () => {
    render(<App />);
    const title = await screen.findByText(/What if automating/);
    const card = title.closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: /Seen/ }));
    await waitFor(() => expect(screen.queryByText(/What if automating/)).not.toBeInTheDocument());
    const clear = calls.find((c) => c.action === 'watch.clearInbox');
    expect(clear?.payload).toEqual({ ids: ['https://openalex.org/W7214912522', 'https://openalex.org/W7215133695'] });
  });

  it('marks as seen what is on screen, never a folded post', async () => {
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    fireEvent.click(screen.getByRole('button', { name: /Mark all as seen/ }));
    await waitFor(() => expect(calls.some((c) => c.action === 'watch.clearInbox')).toBe(true));
    const ids = (calls.find((c) => c.action === 'watch.clearInbox')!.payload as { ids: string[] }).ids;
    expect(ids).toHaveLength(4);
    expect(ids).not.toContain(posts[1]);
    expect(await screen.findByRole('button', { name: 'Other OpenAI posts · 1' })).toBeInTheDocument();
  });

  it('says the first pass announces nothing, and that nothing is new', async () => {
    host.items = [];
    host.lastRunAt = null;
    render(<App />);
    expect(await screen.findByText('Nothing new since the last pass.')).toBeInTheDocument();
    expect(screen.getByText(/First pass not made yet/)).toBeInTheDocument();
  });

  it('shows the refusal with its reason, and retries', async () => {
    host.refuse = 'PERMISSION_DENIED: watch:background';
    render(<App />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PERMISSION_DENIED: watch:background');
    host.refuse = null;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByText(/A CaLLM Judge/);
  });
});

describe('the topic judge on screen (lot 2)', () => {
  it('reads only on a click, with the count of calls on the button, then shows the verdict and its quote', async () => {
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    expect(calls.some((c) => c.action === 'model.infer')).toBe(false);
    // 3 texts listed: 2 papers with an abstract, 1 research post.
    fireEvent.click(screen.getByRole('button', { name: /Read 3 texts · 3 model calls/ }));
    expect(await screen.findByText(`Touches · ${'Memory benchmarks and LLM judges, their biases and reliability'}`)).toBeInTheDocument();
    expect(screen.getByText(QUOTE).tagName).toBe('Q');
    expect(calls.filter((c) => c.action === 'model.infer')).toHaveLength(3);
    // The two that touch none are folded under their count.
    expect(screen.getByRole('button', { name: 'None of your topics · 2' })).toBeInTheDocument();
    expect(screen.getByText(/Last reading: 3 calls · 0.0025 \$ of credits/)).toBeInTheDocument();
  });

  it('saves what it paid for: reopening shows the verdicts without a new call', async () => {
    const first = render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    fireEvent.click(screen.getByRole('button', { name: /Read 3 texts/ }));
    await screen.findByText(/Last reading: 3 calls/);
    await waitFor(() => expect((host.state as { verdicts: object } | null)?.verdicts).toBeDefined());
    first.unmount();
    calls.length = 0;
    render(<App />);
    expect(await screen.findByText(QUOTE)).toBeInTheDocument();
    expect(calls.some((c) => c.action === 'model.infer')).toBe(false);
    expect(screen.queryByRole('button', { name: /Read \d+ texts/ })).not.toBeInTheDocument();
  });

  it('sets new topics aside the old verdicts: the texts wait to be read again', async () => {
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    fireEvent.click(screen.getByRole('button', { name: /Read 3 texts/ }));
    await screen.findByText(QUOTE);
    fireEvent.click(screen.getByRole('button', { name: /Topics/ }));
    expect(screen.getByText('Written by the agent: rewrite them in your words')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your topics 1'), { target: { value: 'Agent memory, in my words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: /Read 3 texts · 3 model calls/ })).toBeInTheDocument();
    expect(screen.queryByText(QUOTE)).not.toBeInTheDocument();
    await waitFor(() => expect(host.state).toMatchObject({ topicsBy: 'person' }));
  });

  it('keeps the paid verdicts when it saves while the watch is not read', async () => {
    host.watchRefuse = 'PERMISSION_DENIED: watch:background';
    host.state = { topics: ['Agent memory'], topicsBy: 'person', verdicts: { a: { k: 'x', v: { kind: 'none' } }, b: { k: 'x', v: { kind: 'none' } } } };
    render(<App />);
    await screen.findByRole('alert');
    fireEvent.click(await screen.findByRole('button', { name: /Topics/ }));
    fireEvent.change(screen.getByLabelText('Your topics 1'), { target: { value: 'Agent memory, again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((c) => c.action === 'state.set')).toBe(true));
    const saved = (calls.find((c) => c.action === 'state.set')!.payload as { state: { verdicts: object } }).state;
    expect(Object.keys(saved.verdicts)).toEqual(['a', 'b']);
  });

  it('writes nothing and reads nothing when the saved state cannot be read', async () => {
    host.stateRefuse = 'HOST_STATE_UNREADABLE';
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    expect(screen.getByText(/Topics and verdicts not read: HOST_STATE_UNREADABLE/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Read \d+ texts/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.action === 'state.set')).toBe(false);
  });
});

describe('what the cold review found (doc 187 §5.6)', () => {
  const KEY = topicsKey(STAND_IN_TOPICS);

  it('offers again a text whose reading only failed, and keeps what the model really said', async () => {
    host.state = {
      topics: [...STAND_IN_TOPICS], topicsBy: 'agent',
      verdicts: {
        'https://openalex.org/W7221749767': { k: KEY, v: { kind: 'unverified', reason: 'failed', detail: 'Host did not reply' } },
        'https://openalex.org/W7214912522': { k: KEY, v: { kind: 'none' } },
        [posts[0]!]: { k: KEY, v: { kind: 'none' } },
      },
    };
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Read 1 texts · 1 model calls/ }));
    expect(await screen.findByText(QUOTE)).toBeInTheDocument();
    expect(calls.filter((c) => c.action === 'model.infer')).toHaveLength(1);
  });

  it('says a refusal stopped the reading, and never calls a refused reading free', async () => {
    host.inferRefuse = 'CLOUD_QUOTA_EXHAUSTED';
    host.balances = [2_000_000, 2_000_000];
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Read 3 texts/ }));
    expect(await screen.findByText(/stopped: no Mnemosyne credits left/)).toBeInTheDocument();
    expect(calls.filter((c) => c.action === 'model.infer')).toHaveLength(1);
    expect(screen.queryByText(/No Mnemosyne credit spent/)).not.toBeInTheDocument();
    expect(screen.getByText(/Not verified: model call failed/)).toBeInTheDocument();
  });

  it('says why a measured 0 can be 0 when the calls really answered', async () => {
    host.balances = [2_000_000, 2_000_000];
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Read 3 texts/ }));
    expect(await screen.findByText(/No Mnemosyne credit spent: a local model or your own key/)).toBeInTheDocument();
  });

  it('locks the crossing and says why when the saved state is unreadable', async () => {
    host.stateRefuse = 'HOST_STATE_UNREADABLE';
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    fireEvent.click(screen.getByRole('button', { name: 'Cross a text' }));
    fireEvent.click(within((await screen.findByText('Meta')).closest('li')!).getByRole('button', { name: 'Load' }));
    await screen.findByText(/^4 loaded/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'We find that LLM judgments can exhibit systematic position bias in pairwise grading of answers.' } });
    expect(screen.getByText(/Topics and verdicts not read: HOST_STATE_UNREADABLE/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cross 1 passages/ })).toBeDisabled();
  });

  it('shows a refused save in the crossing view too', async () => {
    host.setRefuse = 'TOO_LARGE';
    render(<App />);
    await screen.findByText(/A CaLLM Judge/);
    fireEvent.click(screen.getByRole('button', { name: 'Cross a text' }));
    fireEvent.click(within((await screen.findByText('Meta')).closest('li')!).getByRole('button', { name: 'Load' }));
    await screen.findByText(/^4 loaded/);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'We find that LLM judgments can exhibit systematic position bias in pairwise grading of answers.' } });
    fireEvent.click(screen.getByRole('button', { name: /Cross 1 passages/ }));
    expect(await screen.findByText(/Not done: TOO_LARGE/)).toBeInTheDocument();
  });
});
