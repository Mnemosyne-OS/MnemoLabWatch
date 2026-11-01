import { describe, expect, it } from 'vitest';
import { LOT0, summarize, type BenchRow } from './lot0';

describe('lot 0 bench', () => {
  it('ships the 103 works of doc 187 §4, as labelled by hand', () => {
    expect(LOT0).toHaveLength(103);
    const count = (l: string) => LOT0.filter((w) => w.label === l).length;
    expect([count('touches'), count('doubtful'), count('none'), count('unreadable')]).toEqual([8, 2, 92, 1]);
    expect(new Set(LOT0.map((w) => w.id)).size).toBe(103);
  });

  it('counts agreement, misses, false alerts, unverified and doubtful apart', () => {
    const row = (label: BenchRow['label'], verdict: BenchRow['verdict']): BenchRow => ({ id: 'x', title: 'x', label, verdict });
    const touch = { kind: 'touches' as const, topic: 0, quote: 'q q q q' };
    const s = summarize([
      row('touches', touch), row('touches', { kind: 'none' }),
      row('none', { kind: 'none' }), row('none', touch), row('none', { kind: 'unverified', reason: 'failed' }),
      row('unreadable', { kind: 'unverified', reason: 'abstract-short' }), row('doubtful', touch),
    ]);
    expect(s).toEqual({ total: 7, agree: 3, missed: 1, falseAlerts: 1, unverified: 1, doubtful: 1 });
  });
});
