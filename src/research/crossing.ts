/**
 * crossing — a researcher's text, passage by passage, against the loaded lab
 * publications (doc 187 §5).
 *
 * For each passage: the publications closest by their words (BM25 over what is
 * loaded), then one judge call. A text that does not read as English first
 * asks the model for English search words (one more call per passage): words
 * do not cross languages, and the abstracts are in English.
 *
 * The call count is said before the click, the cost is measured on the credit
 * balance after (null when unreadable, never 0 made up), and a stop keeps what
 * was read.
 */
import type { Bm25Index } from '../corpus/bm25';
import type { CorpusWork } from '../corpus/corpusStore';
import { baseId } from '../corpus/fullText';
import type { LabKey } from '../labs';
import type { HostInvoke } from '../sources/http';
import { isFatal, type ModelRefused } from '../judge/common';
import { CANDIDATES, crossSpec, keywordsPrompt, parseKeywords, type CrossVerdict } from '../judge/crossJudge';
import { askModel, readBalanceMicro, spentUsd } from '../judge/runJudge';
import type { Passage } from './passages';

export interface CrossingRow {
  passage: Passage;
  verdict: CrossVerdict;
}

export interface Crossing {
  /** The file's name, or nothing for pasted text. */
  name?: string;
  rows: CrossingRow[];
  /** The publications the verdicts quote, by id (kept so a saved crossing still shows them). */
  works: Record<string, Pick<CorpusWork, 'id' | 'lab' | 'title' | 'published' | 'url' | 'licence' | 'pdfUrl' | 'full' | 'part'>>;
  /** Publications loaded when the crossing ran, and from which labs. */
  loaded: number;
  labs: LabKey[];
  /**
   * The oldest load among those labs: the publications compared are the ones
   * known up to that day (doc 187 §5.2, the denominator of an absence).
   */
  loadedUntil?: string;
  /** Whether English search words were asked first. */
  translated: boolean;
  calls: number;
  usd: number | null;
  /** The host's code when a refusal stopped the crossing before its end. */
  stoppedBy?: string;
  at: string;
}

/** The most calls a crossing of these passages makes. */
export function plannedCalls(passages: readonly Passage[], index: Bm25Index, english: boolean): number {
  if (!english) return passages.length * 2;
  return passages.filter((p) => index.search(p.text, 1).length > 0).length;
}

/** Each passage against the loaded publications; a refusal that would repeat stops it (credits spent, key refused). */
export async function runCrossing(
  passages: readonly Passage[],
  corpus: readonly CorpusWork[],
  index: Bm25Index,
  opts: { english: boolean; name?: string; labs: LabKey[]; loadedUntil?: string },
  invoke: HostInvoke,
  signal?: AbortSignal,
  onStep?: (row: CrossingRow, done: number, total: number) => void,
): Promise<Crossing> {
  const byId = new Map(corpus.map((w) => [w.id, w]));
  const rows: CrossingRow[] = [];
  const works: Crossing['works'] = {};
  const before = await readBalanceMicro(invoke);
  let calls = 0;
  let stoppedBy: string | undefined;
  for (const passage of passages) {
    if (signal?.aborted || stoppedBy) break;
    let query = passage.text;
    if (!opts.english) {
      calls++;
      try {
        query = parseKeywords(await askModel(invoke, keywordsPrompt(passage.text))) || passage.text;
      } catch (err) {
        console.warn('[mnemo-labwatch] search words not read', err);
        if (isFatal(err)) { stoppedBy = (err as ModelRefused).code; break; }
      }
    }
    const candidates = index.search(query, CANDIDATES).map((id) => byId.get(id)).filter((w): w is CorpusWork => !!w);
    const input = { passage: passage.text, candidates };
    let verdict = crossSpec.without(input);
    if (!verdict) {
      calls++;
      try {
        verdict = crossSpec.parse(await askModel(invoke, crossSpec.prompt(input)), input);
      } catch (err) {
        console.warn('[mnemo-labwatch] crossing call failed', err);
        verdict = crossSpec.failed(err);
        if (isFatal(err)) stoppedBy = (err as ModelRefused).code;
      }
    }
    if ('work' in verdict) {
      const w = byId.get(verdict.work);
      if (w) {
        works[w.id] = {
          id: w.id, lab: w.lab, title: w.title, url: w.url,
          ...(w.published ? { published: w.published } : {}),
          ...(w.licence ? { licence: w.licence } : {}),
          ...(w.pdfUrl ? { pdfUrl: w.pdfUrl } : {}),
          ...(w.full ? { full: true, part: w.part } : {}),
        };
      }
    }
    const row = { passage, verdict };
    rows.push(row);
    onStep?.(row, rows.length, passages.length);
  }
  const after = calls > 0 ? await readBalanceMicro(invoke) : before;
  return {
    ...(opts.name ? { name: opts.name } : {}),
    // Publications, not corpus entries: a full text is many passages of one work.
    rows, works, loaded: new Set(corpus.map((w) => baseId(w.id))).size, labs: opts.labs, translated: !opts.english, calls,
    ...(opts.loadedUntil ? { loadedUntil: opts.loadedUntil } : {}),
    usd: spentUsd(calls, before, after),
    ...(stoppedBy ? { stoppedBy } : {}),
    at: new Date().toISOString(),
  };
}

/** The counts the screen opens with: never a percentage. */
export function crossingCounts(c: Pick<Crossing, 'rows'>): Record<CrossVerdict['kind'], number> {
  const out: Record<CrossVerdict['kind'], number> = { supports: 0, partial: 0, diverges: 0, absent: 0, unverified: 0 };
  for (const r of c.rows) out[r.verdict.kind]++;
  return out;
}
