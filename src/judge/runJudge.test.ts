import { describe, expect, it, vi } from 'vitest';
import { callsNeeded, judgeAll, readBalanceMicro, spentUsd } from './runJudge';
import { topicSpec, type JudgeInput } from './topicJudge';

const TOPICS = ['LLM judges and their biases'];
const text = 'We show that calibrated judges reduce position bias in pairwise evaluation.';
const items: { key: string; input: JudgeInput }[] = [
  { key: 'a', input: { kind: 'paper', title: 'A', abstract: 'readable', text } },
  { key: 'b', input: { kind: 'paper', title: 'B', abstract: 'too-short', text: 'SARC Jev test' } },
  { key: 'c', input: { kind: 'paper', title: 'C', abstract: 'readable', text: 'Protein folding at scale with diffusion.' } },
];

/** The host's real answer: `creditsUsdMicro` exact, `credits` rounded to 4 decimals. */
const balance = (micro: number) => ({ credits: Math.round(micro / 100) / 10_000, creditsUsdMicro: micro });

function host(balances: Array<number | Error>, answers: unknown[]) {
  return vi.fn(async (action: string, _payload?: unknown, _timeout?: number) => {
    if (action === 'credits.balance') {
      const b = balances.shift();
      if (b instanceof Error) throw b;
      return balance(b as number);
    }
    if (action === 'model.infer') return answers.shift();
    throw new Error(`unexpected ${action}`);
  });
}

describe('judgeAll', () => {
  it('calls the model only for what has something to read, and measures the cost on the balance', async () => {
    const invoke = host([1_500_000, 1_498_700], [
      { text: '{"verdict":"touches","topic":1,"quote":"calibrated judges reduce position bias"}' },
      '{"verdict":"none"}',
    ]);
    const res = await judgeAll(items, topicSpec(TOPICS), invoke);
    expect(res.calls).toBe(2);
    expect(res.usd).toBeCloseTo(0.0013, 6);
    expect(res.verdicts.get('a')).toMatchObject({ kind: 'touches' });
    expect(res.verdicts.get('b')).toEqual({ kind: 'unverified', reason: 'abstract-short' });
    expect(res.verdicts.get('c')).toEqual({ kind: 'none' });
    const infer = invoke.mock.calls.find((c) => c[0] === 'model.infer') as unknown as [string, { disableRAG: boolean; maxTokens: number }, unknown?];
    expect(infer[1].disableRAG).toBe(true);
    // Permission-gated: the first call waits on the host prompt, so no short bound.
    expect(infer[2]).toBeUndefined();
  });

  it('measures a cheap reading in micro-dollars: 30 µ$ is not 0 (the rounded field would say 0)', async () => {
    const invoke = host([1_500_000, 1_499_970], ['{"verdict":"none"}', '{"verdict":"none"}']);
    const res = await judgeAll(items, topicSpec(TOPICS), invoke);
    expect(res.usd).toBeCloseTo(0.00003, 8);
    expect(balance(1_500_000).credits).toBe(balance(1_499_970).credits);
  });

  it('says "not measured" when the balance cannot be read, never 0', async () => {
    const invoke = host([new Error('PERMISSION_DENIED: wallet:read'), 1], ['{"verdict":"none"}', '{"verdict":"none"}']);
    expect((await judgeAll(items, topicSpec(TOPICS), invoke)).usd).toBeNull();
    // A balance that went UP (a top-up during the reading) is not a cost either.
    const up = host([1_000_000, 2_000_000], ['{"verdict":"none"}', '{"verdict":"none"}']);
    expect((await judgeAll(items, topicSpec(TOPICS), up)).usd).toBeNull();
    expect(spentUsd(0, null, null)).toBe(0);
  });

  it('reads a host refusal as a failure, and stops the reading when no next call can succeed', async () => {
    const invoke = host([1_000_000, 1_000_000], [
      { success: false, error: 'Mnemosyne credits are used up', errorCode: 'CLOUD_QUOTA_EXHAUSTED' },
      '{"verdict":"none"}',
    ]);
    const res = await judgeAll(items, topicSpec(TOPICS), invoke);
    expect(res.verdicts.get('a')).toEqual({ kind: 'unverified', reason: 'failed', detail: 'Mnemosyne credits are used up' });
    expect(res.stoppedBy).toBe('CLOUD_QUOTA_EXHAUSTED');
    expect(res.verdicts.has('c')).toBe(false);
    expect(invoke.mock.calls.filter((c) => c[0] === 'model.infer')).toHaveLength(1);
  });

  it('goes on after a refusal that does not repeat (a timeout)', async () => {
    const invoke = host([1_000_000, 1_000_000], [
      { success: false, error: 'took too long', errorCode: 'CLOUD_TIMEOUT' },
      '{"verdict":"none"}',
    ]);
    const res = await judgeAll(items, topicSpec(TOPICS), invoke);
    expect(res.verdicts.get('a')).toMatchObject({ kind: 'unverified', reason: 'failed' });
    expect(res.verdicts.get('c')).toEqual({ kind: 'none' });
    expect(res.stoppedBy).toBeUndefined();
  });

  it('turns a thrown call into "not verified", and keeps what was read when stopped', async () => {
    const ctrl = new AbortController();
    const invoke = vi.fn(async (action: string) => {
      if (action === 'credits.balance') return balance(1_000_000);
      ctrl.abort();
      throw new Error('Host did not reply');
    });
    const res = await judgeAll(items, topicSpec(TOPICS), invoke, ctrl.signal);
    expect(res.verdicts.get('a')).toMatchObject({ kind: 'unverified', reason: 'failed' });
    expect(res.verdicts.has('c')).toBe(false);
  });

  it('counts the calls a reading will make before it starts', () => {
    expect(callsNeeded(items, topicSpec(TOPICS))).toBe(2);
  });

  it('reads the micro-dollar balance, or null', async () => {
    expect(await readBalanceMicro(async () => balance(2_500_000))).toBe(2_500_000);
    expect(await readBalanceMicro(async () => ({ credits: 2.5 }))).toBeNull();
  });
});
