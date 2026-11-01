/**
 * runJudge — one reading: the model reads each text in turn, its answer is
 * checked, and the cost is measured on the Mnemosyne credit balance.
 *
 *  - One call at a time: the count shown on the button is the count spent.
 *  - `model.infer` without memory (`disableRAG`): the text is all the model
 *    needs, and a memory pass would bill for nothing.
 *  - 🪤 `model.infer` and `credits.balance` are permission-gated: no short
 *    bound, the first call waits on the host's prompt (same rule as the watch).
 *  - 🪤 `model.infer` does not throw on a refusal, it answers `success: false`
 *    (`modelAnswer`). Credits spent or a refused key stop the reading at once:
 *    every next call would fail the same way.
 *  - The cost is the balance before minus the balance after, in integer
 *    micro-dollars (`creditsUsdMicro`). 🪤 The `credits` field is rounded to 4
 *    decimals by the host: a cheap call under 50 µ$ would read as 0 there. An
 *    unreadable balance gives `null` ("not measured"), never 0. A measured 0 is
 *    real and the screen says why it can be 0 (a local model, the person's key).
 *  - A stop keeps the verdicts already read.
 */
import type { HostInvoke } from '../sources/http';
import { isFatal, modelAnswer, ModelRefused, VERDICT_MAX_TOKENS } from './common';

export interface Reading<V> {
  verdicts: Map<string, V>;
  calls: number;
  /** Calls that failed: they cost nothing and prove nothing about a 0 spent. */
  failed: number;
  usd: number | null;
  /** The host's code when a refusal stopped the reading before its end. */
  stoppedBy?: string;
}

/** Credits in integer micro-dollars, or null when the host cannot say. */
export async function readBalanceMicro(invoke: HostInvoke): Promise<number | null> {
  try {
    const b = (await invoke('credits.balance')) as { creditsUsdMicro?: unknown } | null;
    return typeof b?.creditsUsdMicro === 'number' && Number.isFinite(b.creditsUsdMicro) ? Math.round(b.creditsUsdMicro) : null;
  } catch (err) {
    console.warn('[mnemo-labwatch] credit balance not read', err);
    return null;
  }
}

/** What a run of calls cost in dollars: 0 without a call, null when either balance is unknown or went up. */
export function spentUsd(calls: number, beforeMicro: number | null, afterMicro: number | null): number | null {
  if (calls === 0) return 0;
  if (beforeMicro === null || afterMicro === null || beforeMicro < afterMicro) return null;
  return (beforeMicro - afterMicro) / 1_000_000;
}

/** One model call, its refusal turned into an error. */
export async function askModel(invoke: HostInvoke, prompt: string): Promise<string> {
  return modelAnswer(await invoke('model.infer', { prompt, maxTokens: VERDICT_MAX_TOKENS, disableRAG: true }));
}

export interface JudgeItem<I> {
  key: string;
  input: I;
}

export interface JudgeSpec<I, V> {
  /** A verdict known without any model (nothing to read), or null. */
  without: (input: I) => V | null;
  prompt: (input: I) => string;
  parse: (raw: string, input: I) => V;
  failed: (err: unknown) => V;
}

/** Calls the model for every item that needs one; `onStep` sees each verdict as it lands. */
export async function judgeAll<I, V>(
  items: readonly JudgeItem<I>[],
  spec: JudgeSpec<I, V>,
  invoke: HostInvoke,
  signal?: AbortSignal,
  onStep?: (key: string, verdict: V, done: number, total: number) => void,
): Promise<Reading<V>> {
  const verdicts = new Map<string, V>();
  const before = await readBalanceMicro(invoke);
  let calls = 0;
  let failed = 0;
  let done = 0;
  let stoppedBy: string | undefined;
  for (const { key, input } of items) {
    if (signal?.aborted) break;
    let verdict = spec.without(input);
    if (!verdict) {
      calls++;
      try {
        verdict = spec.parse(await askModel(invoke, spec.prompt(input)), input);
      } catch (err) {
        console.warn('[mnemo-labwatch] model call failed', err);
        failed++;
        verdict = spec.failed(err);
        if (isFatal(err)) stoppedBy = (err as ModelRefused).code;
      }
    }
    verdicts.set(key, verdict);
    onStep?.(key, verdict, ++done, items.length);
    if (stoppedBy) break;
  }
  const after = calls > 0 ? await readBalanceMicro(invoke) : before;
  return { verdicts, calls, failed, usd: spentUsd(calls, before, after), ...(stoppedBy ? { stoppedBy } : {}) };
}

/** How many model calls a reading of these items will make. */
export function callsNeeded<I, V>(items: readonly JudgeItem<I>[], spec: Pick<JudgeSpec<I, V>, 'without'>): number {
  return items.filter((i) => spec.without(i.input) === null).length;
}
