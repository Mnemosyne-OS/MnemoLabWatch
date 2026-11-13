import { describe, expect, it } from 'vitest';
import { defaultSaved, HELD_LABEL_MAX, holdItems, keepVerdicts, readSaved, STATE_MAX_BYTES, stateBytes, stateFits } from './store';
import { cleanTopics, STAND_IN_TOPICS, topicsKey } from './topics';

describe('saved state', () => {
  it('starts from the stand-in topics, said to be the agent\'s', () => {
    expect(readSaved(null)).toEqual(defaultSaved());
    expect(defaultSaved()).toMatchObject({ topics: [...STAND_IN_TOPICS], topicsBy: 'agent' });
  });

  it('keeps the person\'s topics and verdicts, and drops what it cannot read', () => {
    const s = readSaved({ topics: ['  Agent memory ', '', 'agent memory', 7], topicsBy: 'person', verdicts: { a: { k: 'x', v: { kind: 'none' } } } });
    expect(s.topics).toEqual(['Agent memory']);
    expect(s.topicsBy).toBe('person');
    expect(s.verdicts.a).toEqual({ k: 'x', v: { kind: 'none' } });
    expect(readSaved({ topics: 'not a list', verdicts: [] })).toMatchObject({ topics: [...STAND_IN_TOPICS], verdicts: {} });
  });

  it('lets a verdict leave with its arrival', () => {
    const s = { ...defaultSaved(), verdicts: { a: { k: 'x', v: { kind: 'none' as const } }, b: { k: 'x', v: { kind: 'none' as const } } } };
    expect(Object.keys(keepVerdicts(s, new Set(['b'])).verdicts)).toEqual(['b']);
  });

});

describe('a kept crossing', () => {
  const crossing = (chars: number) => ({
    rows: [{ passage: { n: 1, text: 'x'.repeat(chars) }, verdict: { kind: 'absent' as const, shown: 0 } }],
    works: {}, loaded: 1, labs: [], translated: false, calls: 0, usd: 0, at: 'now',
  });

  it('is measured with the whole state, in UTF-8 bytes, against the host cap', () => {
    const base = defaultSaved();
    expect(stateFits({ ...base, crossing: crossing(1_000) })).toBe(true);
    expect(stateFits({ ...base, crossing: crossing(STATE_MAX_BYTES) })).toBe(false);
    // 140 000 accented characters are 280 000 bytes: over the cap, though under it in characters.
    const accented = { ...base, crossing: { ...crossing(0), rows: [{ passage: { n: 1, text: 'é'.repeat(140_000) }, verdict: { kind: 'absent' as const, shown: 0 } }] } };
    expect(JSON.stringify(accented).length).toBeLessThan(STATE_MAX_BYTES);
    expect(stateFits(accented)).toBe(false);
    expect(stateBytes(base)).toBeGreaterThan(0);
  });

  it('comes back from a saved state, and an unreadable one is dropped', () => {
    expect(readSaved({ crossing: crossing(10) }).crossing?.rows).toHaveLength(1);
    expect(readSaved({ crossing: { rows: 'no' } }).crossing).toBeUndefined();
  });
});

describe('topics', () => {
  it('caps the list and its lines', () => {
    expect(cleanTopics(Array.from({ length: 14 }, (_, i) => `topic ${i}`))).toHaveLength(10);
    expect(cleanTopics(['x'.repeat(300)])[0]).toHaveLength(200);
  });

  it('fingerprints a list so a changed list invalidates its verdicts', () => {
    expect(topicsKey(['a', 'b'])).toBe(topicsKey(['a', 'b']));
    expect(topicsKey(['a', 'b'])).not.toBe(topicsKey(['a', 'b ']));
    expect(topicsKey(['a', 'b'])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('the held arrivals (doc 187 §3.6)', () => {
  const AT = '2026-11-11T08:00:00.000Z';
  const item = (id: string, label?: string) => ({ id, source: 'Meta', at: AT, ...(label !== undefined ? { label } : {}) });

  it('reads back what was held, and drops only an entry it cannot read', () => {
    const s = readSaved({ held: [item('a', 'A'), { id: 7 }, item('b'), null, { id: 'c', source: 'Meta' }], boxFullAt: AT });
    expect(s.held?.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s.boxFullAt).toBe(AT);
    expect(readSaved({ held: 'nope', boxFullAt: 3 })).not.toHaveProperty('held');
    expect(readSaved({ held: 'nope', boxFullAt: 3 })).not.toHaveProperty('boxFullAt');
  });

  it('holds each id once, keeps what was held first in its place, and cuts a long title', () => {
    const base = holdItems(defaultSaved(), [item('a', 'A')]);
    const next = holdItems(base, [item('b', 'x'.repeat(HELD_LABEL_MAX + 50)), item('a', 'changed')]);
    expect(next.held?.map((i) => [i.id, i.label?.length])).toEqual([['a', 1], ['b', HELD_LABEL_MAX]]);
    expect(next.held?.[0]?.label).toBe('A');
  });

});

describe('a work two labs both list (2026-11-11 stand-in: one id 3 times in a box of 100)', () => {
  it('holds it once per lab', () => {
    const at = '2026-11-11T08:00:00.000Z';
    const s = holdItems(defaultSaved(), [{ id: 'w', source: 'OpenAI', at }, { id: 'w', source: 'Anthropic', at }, { id: 'w', source: 'OpenAI', at }]);
    expect(s.held?.map((i) => i.source)).toEqual(['OpenAI', 'Anthropic']);
  });
});
