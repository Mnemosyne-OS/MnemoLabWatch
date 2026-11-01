/**
 * store — what Lab Watch keeps between two openings, in the host's mirror of
 * the cartridge state (doc 73: `state.get` / `state.set`, ungated, 256 KB,
 * survives the frame's origin changing).
 *
 *  - the topics, and who wrote them;
 *  - the verdicts already paid for, each with the fingerprint of the topics it
 *    was given: reopening the window never bills the same reading twice, and
 *    a verdict for an older list is not shown as current;
 *  - the last reading's measured cost.
 *
 * A state that cannot be read is NOT an empty one: the screen says so and
 * writes nothing over it.
 */
import type { TopicVerdict } from './judge/topicJudge';
import type { Crossing } from './research/crossing';
import { HOST_TIMEOUT_MS, type HostInvoke } from './sources/http';
import { cleanTopics, STAND_IN_TOPICS } from './topics';

export interface CostLine {
  /** Model calls made by the reading. */
  calls: number;
  /** Of those calls, the ones that failed (refused by the host, or thrown). */
  failed?: number;
  /** Mnemosyne credits spent, measured on the balance; null when it could not be read. */
  usd: number | null;
  /** The host's code when a refusal stopped the reading (credits spent, key refused). */
  stoppedBy?: string;
  at: string;
}

/**
 * Whether an arrival waits for a reading.
 * 🪤 A verdict that only says the reading could not HAPPEN is not a reading: a
 * failed call (the model or the host was down) is read again on the next click,
 * and so is "no abstract" for an arrival that has one now (OpenAlex answered
 * this time). Everything a model actually said stays: it was paid for.
 */
export function needsReading(a: { text?: string }, v: TopicVerdict | undefined): boolean {
  if (!v) return true;
  if (v.kind !== 'unverified') return false;
  return v.reason === 'failed' || (v.reason === 'abstract-missing' && !!a.text);
}

export interface Saved {
  v: 1;
  topics: string[];
  topicsBy: 'agent' | 'person';
  /** By arrival key: the verdict and the topics fingerprint it was given. */
  verdicts: Record<string, { k: string; v: TopicVerdict }>;
  cost?: CostLine;
  /** The last crossing of a text (lot 3), when the whole state still fits (stateFits). */
  crossing?: Crossing;
}

/**
 * The host caps a cartridge's whole state at 256 KiB of UTF-8 (doc 73,
 * `TOO_LARGE`). Measured on the whole state, in bytes: an accented text weighs
 * more than its character count, and the verdicts share the budget. A margin
 * stays for the host's own envelope.
 */
export const STATE_MAX_BYTES = 250_000;

export const stateBytes = (s: Saved) => new TextEncoder().encode(JSON.stringify(s)).length;

export const stateFits = (s: Saved) => stateBytes(s) <= STATE_MAX_BYTES;

export const defaultSaved = (): Saved => ({ v: 1, topics: [...STAND_IN_TOPICS], topicsBy: 'agent', verdicts: {} });

/** A saved state as written by an earlier build or by nobody: anything unknown falls back, field by field. */
export function readSaved(raw: unknown): Saved {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Saved>;
  const topics = Array.isArray(s.topics) ? cleanTopics(s.topics.filter((t): t is string => typeof t === 'string')) : [];
  const verdicts = s.verdicts && typeof s.verdicts === 'object' && !Array.isArray(s.verdicts) ? s.verdicts : {};
  return {
    v: 1,
    topics: topics.length ? topics : [...STAND_IN_TOPICS],
    topicsBy: topics.length && s.topicsBy === 'person' ? 'person' : 'agent',
    verdicts,
    ...(s.cost && typeof s.cost === 'object' ? { cost: s.cost } : {}),
    ...(s.crossing && typeof s.crossing === 'object' && Array.isArray(s.crossing.rows) ? { crossing: s.crossing } : {}),
  };
}

export async function loadSaved(invoke: HostInvoke): Promise<Saved> {
  const answer = (await invoke('state.get', undefined, HOST_TIMEOUT_MS)) as { state?: unknown } | null;
  return readSaved(answer?.state ?? null);
}

/** Only the verdicts of arrivals still in the box: what was marked seen leaves with its verdict. */
export function keepVerdicts(saved: Saved, keys: ReadonlySet<string>): Saved {
  const verdicts: Saved['verdicts'] = {};
  for (const [k, v] of Object.entries(saved.verdicts)) if (keys.has(k)) verdicts[k] = v;
  return { ...saved, verdicts };
}

export async function saveSaved(invoke: HostInvoke, saved: Saved): Promise<void> {
  await invoke('state.set', { state: saved }, HOST_TIMEOUT_MS);
}
