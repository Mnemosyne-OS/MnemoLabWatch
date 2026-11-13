import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxItem } from './arrivals';
import { stateWriter } from './stateWriter';
import { defaultSaved, STATE_MAX_BYTES, type Saved } from './store';

const AT = '2026-11-11T08:00:00.000Z';
const item = (id: string, source = 'Meta'): InboxItem => ({ id, source, at: AT });

/** One host state blob, as cartridgeState.ts keeps it; every frame's writer talks to it. */
function hostState(initial: unknown = null) {
  const h = {
    state: initial,
    setRefuse: null as string | null,
    setGate: null as Promise<void> | null,
    sets: 0,
    invoke: vi.fn(async (action: string, payload?: unknown, _timeoutMs?: number) => {
      if (action === 'state.get') return { state: h.state === null ? null : JSON.parse(JSON.stringify(h.state)), updatedAt: null };
      if (action === 'state.set') {
        if (h.setGate) await h.setGate;
        if (h.setRefuse) throw new Error(h.setRefuse);
        h.state = JSON.parse(JSON.stringify((payload as { state: unknown }).state));
        h.sets++;
        return { bytes: 1 };
      }
      throw new Error(`unexpected ${action}`);
    }),
  };
  return h;
}

const heldIds = (s: unknown) => ((s as Saved | null)?.held ?? []).map((i) => i.id);

afterEach(() => vi.unstubAllGlobals());

describe('stateWriter (doc 187 §3.6)', () => {
  it('reads through the host mirror, and a refused read is an error, not an empty state', async () => {
    const h = hostState({ topics: ['A'], topicsBy: 'person' });
    expect((await stateWriter(h.invoke).read()).topics).toEqual(['A']);
    await expect(stateWriter(async () => { throw new Error('HOST_DOWN'); }).read()).rejects.toThrow('HOST_DOWN');
  });

  it('writes the HOST\'s held: a frame with an older copy never erases what another frame moved', async () => {
    const h = hostState();
    const a = stateWriter(h.invoke);
    const b = stateWriter(h.invoke);
    const bCopy = await b.read();
    await a.write(await a.read(), { add: [item('w1'), item('w2')] });
    expect(heldIds(h.state)).toEqual(['w1', 'w2']);
    await b.write({ ...bCopy, topics: ['Mine'], topicsBy: 'person' });
    expect(heldIds(h.state)).toEqual(['w1', 'w2']);
    expect((h.state as Saved).topics).toEqual(['Mine']);
  });

  it('never brings back what another frame marked seen, even from a copy that still lists it', async () => {
    const h = hostState({ ...defaultSaved(), held: [item('w1'), item('w2')] });
    const a = stateWriter(h.invoke);
    const b = stateWriter(h.invoke);
    const bCopy = await b.read();
    await a.write(await a.read(), { release: ['w1'] });
    await b.write(bCopy);
    expect(heldIds(h.state)).toEqual(['w2']);
  });

  it('lets an arrival go only once that write succeeded', async () => {
    const h = hostState({ ...defaultSaved(), held: [item('w1')] });
    const w = stateWriter(h.invoke);
    const copy = await w.read();
    h.setRefuse = 'TOO_LARGE';
    await expect(w.write(copy, { release: ['w1'] })).rejects.toThrow('TOO_LARGE');
    h.setRefuse = null;
    await w.write(copy);
    expect(heldIds(h.state)).toEqual(['w1']);
  });

  it('keeps an arrival let go out of every later write of this frame', async () => {
    const h = hostState({ ...defaultSaved(), held: [item('w1')] });
    const w = stateWriter(h.invoke);
    const copy = await w.read();
    await w.write(copy, { release: ['w1'] });
    // Another frame's late write puts it back in the host's copy: this frame does not carry it on.
    h.state = { ...defaultSaved(), held: [item('w1')] };
    await w.write(copy);
    expect(heldIds(h.state)).toEqual([]);
  });

  it('refuses to write over a state that was there and now reads as never stored', async () => {
    const h = hostState({ ...defaultSaved(), held: [item('w1')] });
    const w = stateWriter(h.invoke);
    const copy = await w.read();
    h.state = null;
    await expect(w.write(copy, { add: [item('w2')] })).rejects.toThrow('STATE_VANISHED');
    expect(h.sets).toBe(0);
  });

  it('writes a first state when none was ever stored', async () => {
    const h = hostState();
    const w = stateWriter(h.invoke);
    await w.write(await w.read(), { add: [item('w1')] });
    expect(heldIds(h.state)).toEqual(['w1']);
    // From then on, a state that vanishes is refused.
    h.state = null;
    await expect(w.write(defaultSaved())).rejects.toThrow('STATE_VANISHED');
  });

  it('gives the arrivals the room of a kept crossing, and says so', async () => {
    const crossing = { rows: [{ passage: { text: 'a'.repeat(STATE_MAX_BYTES - 2_000) } }] };
    const h = hostState({ ...defaultSaved(), crossing });
    const w = stateWriter(h.invoke);
    const copy = await w.read();
    const box = Array.from({ length: 100 }, (_, k) => item(`https://openalex.org/W${k}`));
    const out = await w.write(copy, { add: box });
    expect(out.droppedCrossing).toBe(true);
    expect(h.state).not.toHaveProperty('crossing');
    expect(heldIds(h.state)).toHaveLength(100);
  });

  it('sends nothing when even without a crossing the state would not fit', async () => {
    const h = hostState();
    const w = stateWriter(h.invoke);
    const fat: Saved = { ...(await w.read()), topics: ['x'.repeat(STATE_MAX_BYTES)] };
    await expect(w.write(fat, { add: [item('w1')] })).rejects.toThrow('STATE_FULL');
    expect(h.sets).toBe(0);
  });

  it('runs one save at a time: two moves in flight both end held', async () => {
    const h = hostState();
    let open!: () => void;
    h.setGate = new Promise<void>((r) => { open = r; });
    const a = stateWriter(h.invoke);
    const b = stateWriter(h.invoke);
    const first = a.write(defaultSaved(), { add: [item('w1')] });
    const second = b.write(defaultSaved(), { add: [item('w2')] });
    await vi.waitFor(() => expect(h.invoke.mock.calls.filter((c) => c[0] === 'state.set')).toHaveLength(1));
    h.setGate = null;
    open();
    await Promise.all([first, second]);
    expect(heldIds(h.state).sort()).toEqual(['w1', 'w2']);
  });

  it('still saves when the frame has the Web Lock but is refused it, and never saves twice', async () => {
    const request = vi.fn(async () => { throw new DOMException('Access to the Locks API is denied in this context.', 'SecurityError'); });
    vi.stubGlobal('navigator', { locks: { request } });
    const h = hostState();
    await stateWriter(h.invoke).write(defaultSaved(), { add: [item('w1')] });
    expect(request).toHaveBeenCalledTimes(1);
    expect(heldIds(h.state)).toEqual(['w1']);
    expect(h.sets).toBe(1);
  });

  it('passes on the error of a save that started under the Web Lock, without running it again', async () => {
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run());
    vi.stubGlobal('navigator', { locks: { request } });
    const h = hostState();
    h.setRefuse = 'TOO_LARGE';
    await expect(stateWriter(h.invoke).write(defaultSaved())).rejects.toThrow('TOO_LARGE');
    expect(h.invoke.mock.calls.filter((c) => c[0] === 'state.set')).toHaveLength(1);
  });

  it('takes the Web Lock shared by every frame of the origin when the frame has one', async () => {
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run());
    vi.stubGlobal('navigator', { locks: { request } });
    const h = hostState();
    await stateWriter(h.invoke).write(defaultSaved());
    expect(request).toHaveBeenCalledWith('mnemo-labwatch-state', expect.any(Function));
  });
});
