/**
 * The box move on screen, against a host that answers in order (doc 187 §3.6).
 * Ported from the probes of the cold review of 0.2.0, which described the
 * defects; each test here holds the fixed behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { InboxItem } from './arrivals';
import fixture from './sources/fixtures/openalex-works.json';
import rss from './sources/fixtures/openai-rss.xml?raw';
import { defaultSaved, STATE_MAX_BYTES, type Saved } from './store';
import { STAND_IN_TOPICS, topicsKey } from './topics';

const META = 'Meta';
const OPENAI = 'OpenAI';
const AT = '2026-10-28T08:00:00.000Z';
const HOST_MAX = 256 * 1024;

const calls: { action: string; payload?: unknown }[] = [];
const host = {
  items: [] as InboxItem[],
  state: null as unknown,
  setRefuse: null as string | null,
  inboxGate: null as Promise<void> | null,
  setGate: null as Promise<void> | null,
  chain: Promise.resolve() as Promise<unknown>,
};

vi.mock('./sdk/mnemo-sdk', () => ({
  MnemoCartridgeSDK: class {
    // One host, one queue: calls are answered in the order they were sent, as over the bridge.
    invoke(action: string, payload?: unknown) {
      calls.push({ action, payload });
      // The gate on the box is the human reading the permission prompt: it holds that call, not the queue.
      if (action === 'watch.inbox' && host.inboxGate) return host.inboxGate.then(() => this.answer(action));
      const run = host.chain.then(() => this.answer(action, payload));
      host.chain = run.catch(() => undefined);
      return run;
    }
    async answer(action: string, payload?: unknown) {
      if (action === 'watch.register') return { targets: 6, intervalMin: 1440 };
      if (action === 'watch.inbox') {
        return { items: [...host.items], status: { registered: true, targets: 6, intervalMin: 1440, lastRunAt: AT, lastError: null, unread: host.items.length } };
      }
      if (action === 'watch.clearInbox') {
        // As the host does (cartridgeWatch.ts): these ids leave the box.
        const ids = (payload as { ids: string[] }).ids;
        host.items = host.items.filter((i) => !ids.includes(i.id));
        return { remaining: host.items.length };
      }
      if (action === 'social.fetch') return { status: 200, body: rss, encoding: 'utf8' };
      if (action === 'state.get') return { state: host.state === null ? null : JSON.parse(JSON.stringify(host.state)), updatedAt: null };
      if (action === 'state.set') {
        if (host.setGate) { const g = host.setGate; host.setGate = null; await g; }
        if (host.setRefuse) throw new Error(host.setRefuse);
        const state = (payload as { state: unknown }).state;
        // As the host does (cartridgeState.ts): the envelope is measured, 256 KiB.
        const bytes = new TextEncoder().encode(JSON.stringify({ id: '@mnemosyne-plugins/mnemo-labwatch', state, updatedAt: AT })).length;
        if (bytes > HOST_MAX) throw new Error('TOO_LARGE');
        host.state = JSON.parse(JSON.stringify(state));
        return { bytes };
      }
      return { success: true };
    }
  },
}));
vi.mock('@mnemosyne_os/cartridge-sdk', () => ({ onHostConfig: () => () => undefined }));

import App from './App';

const posts = [...rss.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((m) => m[1]!);
const clears = () => calls.filter((c) => c.action === 'watch.clearInbox').map((c) => c.payload as { ids: string[] });
const held = () => ((host.state as { held?: { id: string }[] } | null)?.held ?? []).map((i) => i.id);
const five = (): InboxItem[] => [
  { id: 'https://openalex.org/W7221749767', label: 'x', source: META, at: AT },
  { id: 'https://openalex.org/W7214912522', label: 'x', source: OPENAI, at: AT },
  { id: 'https://openalex.org/W7215133695', label: 'x', source: OPENAI, at: AT },
  { id: posts[0]!, source: 'OpenAI news', at: AT },
  { id: posts[1]!, source: 'OpenAI news', at: AT },
];

beforeEach(() => {
  calls.length = 0;
  host.items = five();
  host.state = null;
  host.setRefuse = null;
  host.inboxGate = null;
  host.setGate = null;
  host.chain = Promise.resolve();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('two frames of the cartridge on one host state (the widget and the window)', () => {
  it('a frame opened earlier saves its topics after the other moved the box: the moved arrivals stay held', async () => {
    host.items = [];
    const b = render(<App />);
    await waitFor(() => expect(within(b.container).getByRole('button', { name: /Topics/ })).not.toBeDisabled());

    host.items = five();
    const a = render(<App />);
    await within(a.container).findByText(/A CaLLM Judge/);
    await waitFor(() => expect(clears()).toHaveLength(1));
    expect(held()).toHaveLength(5);
    expect(host.items).toHaveLength(0);

    fireEvent.click(within(b.container).getByRole('button', { name: /Topics/ }));
    fireEvent.click(within(b.container).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect((host.state as Saved).topicsBy).toBe('person'));
    expect(held()).toHaveLength(5);
  });
});

describe('a kept crossing and the budget of the held arrivals', () => {
  it('gives the arrivals its room, says so, and still says the box was full', async () => {
    const crossing = {
      rows: [{ passage: { text: 'a'.repeat(240_000) }, verdict: { kind: 'none' } }],
      works: {}, loaded: 1, labs: ['meta'], translated: false, calls: 1, usd: 0, at: AT,
    };
    host.state = { ...defaultSaved(), crossing };
    host.items = Array.from({ length: 100 }, (_, k) => ({ id: `https://openalex.org/W${k + 1}`, label: `Paper ${k + 1}`, source: META, at: AT }));
    render(<App />);
    expect(await screen.findByText(/The last crossing was not kept/)).toBeInTheDocument();
    expect(clears()).toHaveLength(1);
    expect(held()).toHaveLength(100);
    expect(host.state).not.toHaveProperty('crossing');
    expect(host.state).toHaveProperty('boxFullAt');
    expect(screen.getByText(/The watch's box was full on/)).toBeInTheDocument();
    expect(screen.queryByText(/saved state is full/)).not.toBeInTheDocument();
    expect(new TextEncoder().encode(JSON.stringify(host.state)).length).toBeLessThanOrEqual(STATE_MAX_BYTES);
  });
});

describe('a state too full even without a crossing', () => {
  it('leaves the box, says the state is full in its own words, and still says the box was full', async () => {
    const verdicts: Record<string, unknown> = {};
    // Filled 50 at a time up to 1 to 4 KB under the cap: the notice fits, 100 more arrivals (about 6 KB) do not.
    let k = 0;
    while (new TextEncoder().encode(JSON.stringify({ ...defaultSaved(), verdicts })).length < STATE_MAX_BYTES - 4_000) {
      for (let n = 0; n < 50; n++) verdicts[`https://openalex.org/V${k++}`] = { k: 'x', v: { kind: 'none' } };
    }
    host.state = { ...defaultSaved(), verdicts };
    host.items = Array.from({ length: 100 }, (_, n) => ({ id: `https://openalex.org/W${n + 1}`, label: `Paper ${n + 1}`, source: META, at: AT }));
    render(<App />);
    expect(await screen.findByText(/saved state is full\. Mark arrivals as seen to make room/)).toBeInTheDocument();
    expect(clears()).toEqual([]);
    expect(held()).toEqual([]);
    expect(host.state).toHaveProperty('boxFullAt');
    expect(screen.getByText(/The watch's box was full on/)).toBeInTheDocument();
  });
});

describe('"seen" when the save is refused', () => {
  it('leaves the card on screen with the reason, keeps it held, and leaves the box alone', async () => {
    render(<App />);
    const title = await screen.findByText(/What if automating/);
    await waitFor(() => expect(clears()).toHaveLength(1));
    host.setRefuse = 'TOO_LARGE';
    fireEvent.click(within(title.closest('li')!).getByRole('button', { name: /Seen/ }));
    expect(await screen.findByText(/Not done: TOO_LARGE/)).toBeInTheDocument();
    expect(screen.getByText(/What if automating/)).toBeInTheDocument();
    expect(held()).toContain('https://openalex.org/W7214912522');
    expect(clears()).toHaveLength(1);
  });
});

describe('a verdict leaves with its arrival', () => {
  it('in the very write that lets the arrival go', async () => {
    const k = topicsKey(STAND_IN_TOPICS);
    host.state = { ...defaultSaved(), verdicts: { 'https://openalex.org/W7214912522': { k, v: { kind: 'none' } } } };
    render(<App />);
    await waitFor(() => expect(clears()).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: /None of your topics/ }));
    const title = await screen.findByText(/What if automating/);
    fireEvent.click(within(title.closest('li')!).getByRole('button', { name: /Seen/ }));
    await waitFor(() => expect(held()).not.toContain('https://openalex.org/W7214912522'));
    expect(Object.keys((host.state as Saved).verdicts)).not.toContain('https://openalex.org/W7214912522');
  });
});

describe('a save made while the watch is still being read (permission prompt, slow network)', () => {
  it('the topics saved during the wait survive the move', async () => {
    let open!: () => void;
    host.inboxGate = new Promise<void>((r) => { open = r; });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Topics/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Topics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect((host.state as Saved | null)?.topicsBy).toBe('person'));
    open();
    await waitFor(() => expect(clears()).toHaveLength(1));
    expect(held()).toHaveLength(5);
    expect((host.state as Saved).topicsBy).toBe('person');
  });
});

describe('an arrival marked seen while the move is still being written', () => {
  it('ends neither held nor in the box (a folded pair, two ids), the three others held', async () => {
    let open!: () => void;
    host.setGate = new Promise<void>((r) => { open = r; });
    render(<App />);
    const title = await screen.findByText(/What if automating/);
    await waitFor(() => expect(calls.some((c) => c.action === 'state.set')).toBe(true));
    expect(clears()).toEqual([]);
    fireEvent.click(within(title.closest('li')!).getByRole('button', { name: /Seen/ }));
    open();
    await waitFor(() => expect(clears()).toHaveLength(2));
    await waitFor(() => expect(held()).toHaveLength(3));
    await new Promise((r) => setTimeout(r, 50));
    expect(held()).toHaveLength(3);
    expect(held()).not.toContain('https://openalex.org/W7214912522');
    expect(host.items).toHaveLength(0);
  });
});
