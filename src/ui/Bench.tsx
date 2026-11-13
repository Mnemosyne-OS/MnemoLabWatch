/**
 * Bench — the lot 0 measure of the topic judge, run by the person in the app
 * (`?bench=lot0`, doc 187 §4). It reads the 103 works again with the app's own
 * model and the stand-in topics they were labelled against, then counts.
 */
import { useEffect, useRef, useState } from 'react';
import { LOT0, summarize, type BenchRow, type BenchSummary } from '../bench/lot0';
import type { Lang, Translate } from '../i18n/strings';
import { judgeAll } from '../judge/runJudge';
import { topicSpec, type JudgeInput, type TopicVerdict } from '../judge/topicJudge';
import type { HostInvoke } from '../sources/http';
import { fetchWorks, type FetchJson } from '../sources/openalex';
import { STAND_IN_TOPICS } from '../topics';
import { formatUsd } from './format';
import { IconStop } from './icons';

type State =
  | { state: 'idle' }
  | { state: 'running'; done: number; total: number }
  | { state: 'done'; rows: BenchRow[]; summary: BenchSummary; calls: number; usd: number | null }
  | { state: 'failed'; why: string };

/** `locked` while another model job runs: one at a time (doc 187 §5.5). */
export function Bench({ t, lang, invoke, fetchJson, locked = false }: { t: Translate; lang: Lang; invoke: HostInvoke; fetchJson: FetchJson; locked?: boolean }) {
  const [s, setS] = useState<State>({ state: 'idle' });
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const run = async () => {
    ctrl.current = new AbortController();
    const signal = ctrl.current.signal;
    setS({ state: 'running', done: 0, total: LOT0.length });
    try {
      const works = await fetchWorks(LOT0.map((w) => w.id), fetchJson, signal);
      const items = LOT0.map((w) => {
        const work = works.get(w.id);
        const input: JudgeInput = work
          ? { kind: 'paper', title: work.title, abstract: work.abstract, ...(work.abstractText ? { text: work.abstractText } : {}) }
          : { kind: 'paper', title: w.id, abstract: 'missing' };
        return { key: w.id, input };
      });
      const res = await judgeAll(items, topicSpec(STAND_IN_TOPICS), invoke, signal,
        (_k, _v, done, total) => setS({ state: 'running', done, total }));
      const rows: BenchRow[] = LOT0.map((w) => ({
        id: w.id,
        title: works.get(w.id)?.title ?? w.id,
        label: w.label,
        verdict: res.verdicts.get(w.id) ?? ({ kind: 'unverified', reason: 'failed', detail: 'not reached' } as TopicVerdict),
      }));
      setS({ state: 'done', rows, summary: summarize(rows), calls: res.calls, usd: res.usd });
    } catch (err) {
      console.error('[mnemo-labwatch] bench failed', err);
      setS({ state: 'failed', why: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <section className="panel" aria-label={t('bench.title', { n: LOT0.length })}>
      <h2>{t('bench.title', { n: LOT0.length })}</h2>
      {s.state === 'idle' && <button type="button" className="primary" disabled={locked} onClick={() => void run()}>{t('bench.run', { calls: LOT0.length })}</button>}
      {s.state === 'running' && (
        <div className="row">
          <span className="lab reading" role="status">{t('judge.reading', { done: s.done, total: s.total })}</span>
          <button type="button" onClick={() => ctrl.current?.abort()}><IconStop /> {t('judge.stop')}</button>
        </div>
      )}
      {s.state === 'failed' && (
        <>
          <div className="lab why">{s.why}</div>
          <button type="button" onClick={() => void run()}>{t('error.retry')}</button>
        </>
      )}
      {s.state === 'done' && (
        <>
          <div className="lab live">{t('bench.summary', { ...s.summary })}</div>
          <div className="lab">
            {s.usd === null ? t('judge.costUnknown', { calls: s.calls }) : t('judge.cost', { calls: s.calls, usd: formatUsd(lang, s.usd) })}
          </div>
          <ul className="bench-rows">
            {s.rows.filter((r) => r.label === 'doubtful' || (r.label === 'touches') !== (r.verdict.kind === 'touches')).map((r) => (
              <li key={r.id} className="lab">
                {r.label} → {r.verdict.kind}{r.verdict.kind === 'unverified' ? ` (${r.verdict.reason})` : ''} · {r.title}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
