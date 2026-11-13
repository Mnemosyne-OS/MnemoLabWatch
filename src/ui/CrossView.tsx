/**
 * CrossView — sense A of doc 187: the researcher's text, passage by passage,
 * against the lab publications loaded in this frame (lot 3).
 *
 *  - Loading a lab is a click (1 OpenAlex credit per 200 works, budget shared
 *    per IP address); what is loaded stays in the frame's IndexedDB cache.
 *  - Crossing is a click, the number of calls on the button; the measured
 *    cost after. A stop keeps what was read.
 *  - Two states for the cache (reading, read). A cache that cannot open is
 *    read from memory instead, and the screen says so.
 *  - One job of each kind at a time, each with its own stop: a lab load, a
 *    crossing, one full text. Leaving the view stops the first two and closes
 *    the cache; a full text in flight (the host call cannot be cancelled) is
 *    dropped when it answers, and touches no screen state any more.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bm25Index } from '../corpus/bm25';
import { indexedCorpusStore, memoryCorpusStore, type CorpusStore, type CorpusWork, type LabLoad } from '../corpus/corpusStore';
import { loadLab, type LoadProgress } from '../corpus/loadLab';
import { refusalText, type Lang, type Translate } from '../i18n/strings';
import { CANDIDATES } from '../judge/crossJudge';
import { LABS, labName, type LabKey } from '../labs';
import { crossingCounts, plannedCalls, runCrossing, type Crossing } from '../research/crossing';
import { looksEnglish, splitPassages } from '../research/passages';
import { pickFile, readPickedFile } from '../research/readFile';
import type { HostInvoke } from '../sources/http';
import type { FetchJson } from '../sources/openalex';
import { baseId, readFullText } from '../corpus/fullText';
import { CrossRow, type FullState } from './CrossRow';
import { formatLocalDay, formatUsd } from './format';
import { IconRead, IconStop } from './icons';

export interface CrossViewProps {
  t: Translate;
  lang: Lang;
  invoke: HostInvoke;
  fetchJson: FetchJson;
  /** The last crossing kept, if any. */
  saved?: Crossing;
  /** Keeps a crossing, and says whether it could. */
  onCrossed: (c: Crossing) => Kept;
  onOpen: (url: string) => void;
  /** Injected by the tests; the app opens IndexedDB. */
  openStore?: () => Promise<CorpusStore>;
  /** True while a topic reading runs: one model job at a time writes the saved state. */
  locked?: boolean;
  /** Told when a crossing starts and ends, so the other view can lock in turn. */
  onBusy?: (busy: boolean) => void;
}

/** What became of a crossing: kept, too long for the state's budget, or not saved because the state is unreadable. */
export type Kept = 'kept' | 'too-long' | 'not-saved';

type Cache =
  | { state: 'reading' }
  | { state: 'read'; store: CorpusStore; works: CorpusWork[]; loads: LabLoad[]; unavailable?: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function CrossView({ t, lang, invoke, fetchJson, saved, onCrossed, onOpen, openStore = indexedCorpusStore, locked = false, onBusy }: CrossViewProps) {
  const [cache, setCache] = useState<Cache>({ state: 'reading' });
  const [loading, setLoading] = useState<{ lab: LabKey; progress: LoadProgress | null } | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState<string | undefined>();
  const [truncated, setTruncated] = useState(false);
  const [crossing, setCrossing] = useState<Crossing | undefined>(saved);
  const [kept, setKept] = useState<Kept>('kept');
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState<Record<string, FullState>>({});
  const loadCtrl = useRef<AbortController | null>(null);
  const crossCtrl = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let opened: CorpusStore | null = null;
    (async () => {
      let store: CorpusStore;
      let unavailable: string | undefined;
      try {
        store = await openStore();
      } catch (err) {
        console.warn('[mnemo-labwatch] publication cache unavailable', err);
        store = memoryCorpusStore();
        unavailable = message(err);
      }
      opened = store;
      if (!alive.current) { store.close(); return; }
      try {
        const [works, loads] = await Promise.all([store.all(), store.loads()]);
        if (alive.current) setCache({ state: 'read', store, works, loads, ...(unavailable ? { unavailable } : {}) });
      } catch (err) {
        console.error('[mnemo-labwatch] publication cache not read', err);
        if (alive.current) setCache({ state: 'read', store: memoryCorpusStore(), works: [], loads: [], unavailable: message(err) });
      }
    })();
    return () => {
      alive.current = false;
      loadCtrl.current?.abort();
      crossCtrl.current?.abort();
      opened?.close();
    };
  }, [openStore]);

  useEffect(() => { onBusy?.(running !== null); }, [running, onBusy]);
  // Leaving the view stops a crossing (the effect above aborts it): the lock goes with it.
  useEffect(() => () => onBusy?.(false), [onBusy]);

  const works = cache.state === 'read' ? cache.works : [];
  const index = useMemo(() => new Bm25Index(works.map((w) => ({ id: w.id, text: `${w.title} ${w.text}` }))), [works]);
  const passages = useMemo(() => splitPassages(text), [text]);
  const english = useMemo(() => looksEnglish(text), [text]);
  const calls = useMemo(() => (passages.length ? plannedCalls(passages, index, english) : 0), [passages, index, english]);
  const loadedLabs = cache.state === 'read' ? cache.loads.filter((l) => l.count > 0).map((l) => l.lab) : [];

  const load = useCallback(async (lab: LabKey) => {
    if (cache.state !== 'read' || loading || running) return;
    const c = new AbortController();
    loadCtrl.current = c;
    setLoading({ lab, progress: null });
    setError(null);
    try {
      await loadLab(lab, fetchJson, cache.store, c.signal, (progress) => { if (alive.current) setLoading({ lab, progress }); });
    } catch (err) {
      // A stop is the person's own act: what was loaded before it stays, nothing to report.
      if ((err as { name?: string } | null)?.name !== 'AbortError') {
        console.error('[mnemo-labwatch] lab not loaded', err);
        if (alive.current) setError(message(err));
      }
    }
    if (!alive.current) return;
    try {
      const [all, loads] = await Promise.all([cache.store.all(), cache.store.loads()]);
      if (alive.current) setCache({ ...cache, works: all, loads });
    } catch (err) {
      console.error('[mnemo-labwatch] publication cache not read again', err);
      if (alive.current) setError(message(err));
    } finally {
      if (alive.current) setLoading(null);
    }
  }, [cache, loading, running, fetchJson]);

  const fullBusy = Object.values(full).some((s) => s.state === 'reading');

  /** Lot 4: one open PDF read in full at a time, its passages added to the corpus. */
  const readFull = useCallback(async (work: Crossing['works'][string]) => {
    if (cache.state !== 'read' || fullBusy) return;
    const id = baseId(work.id);
    setFull((f) => ({ ...f, [id]: { state: 'reading' } }));
    try {
      const read = await readFullText(work, invoke, cache.store);
      if (!alive.current) return;
      const all = await cache.store.all();
      if (!alive.current) return;
      setCache((c) => (c.state === 'read' ? { ...c, works: all } : c));
      setFull((f) => ({ ...f, [id]: { state: 'read', ...read } }));
    } catch (err) {
      console.error('[mnemo-labwatch] full text not read', err);
      if (alive.current) setFull((f) => ({ ...f, [id]: { state: 'failed', why: message(err) } }));
    }
  }, [cache, invoke, fullBusy]);

  const pick = useCallback(async () => {
    setError(null);
    try {
      const read = await readPickedFile(invoke, await pickFile(invoke, t('text.filter')));
      if (!read || !alive.current) return;
      setText(read.text);
      setName(read.name);
      setTruncated(read.truncated);
    } catch (err) {
      console.error('[mnemo-labwatch] file not read', err);
      if (alive.current) setError(message(err));
    }
  }, [invoke, t]);

  const cross = useCallback(async () => {
    if (running || locked || loading || !passages.length || !works.length || cache.state !== 'read') return;
    const c = new AbortController();
    crossCtrl.current = c;
    setRunning({ done: 0, total: passages.length });
    setError(null);
    // The oldest load among the labs compared: the denominator of an absence says up to when.
    const used = cache.loads.filter((l) => l.count > 0).map((l) => l.loadedAt).sort();
    const result = await runCrossing(passages, works, index,
      { english, labs: loadedLabs, ...(name ? { name } : {}), ...(used[0] ? { loadedUntil: used[0] } : {}) },
      invoke, c.signal, (_row, done, total) => { if (alive.current) setRunning({ done, total }); });
    // Kept even when the view has gone: it was paid for.
    const outcome = onCrossed(result);
    if (!alive.current) return;
    setCrossing(result);
    setKept(outcome);
    setRunning(null);
  }, [running, locked, loading, passages, works, cache, index, english, loadedLabs, name, invoke, onCrossed]);

  if (cache.state === 'reading') return <p className="lab reading" role="status">{t('app.reading')}</p>;

  const counts = crossing ? crossingCounts(crossing) : null;

  return (
    <div className="cross">
      {cache.unavailable && <p className="lab notice">{t('corpus.unavailable', { error: cache.unavailable })}</p>}
      {error && <p className="lab notice" role="alert">{t('action.failed', { error })}</p>}

      <section className="panel">
        <h2><span className={`step${works.length > 0 ? ' done' : ''}`}>1</span>{' '}{t('corpus.title')}</h2>
        <ul className="lab-loads">
          {LABS.map((lab) => {
            const l = cache.loads.find((x) => x.lab === lab.key);
            const busy = loading?.lab === lab.key;
            const p = busy ? loading?.progress : null;
            const fullTexts = new Set(works.filter((w) => w.lab === lab.key && w.full).map((w) => baseId(w.id))).size;
            return (
              <li key={lab.key} className={`chip-tile${l?.count ? ' chosen' : ''}`}>
                <span>{lab.name}</span>
                <span className="lab">
                  {busy
                    ? p ? (p.pages ? t('corpus.page', { page: p.page, pages: p.pages }) : t('corpus.firstPage', { page: p.page })) : '…'
                    : !l ? t('corpus.none')
                      : l.complete ? t('corpus.loaded', { n: l.count, date: formatLocalDay(lang, l.loadedAt) })
                        : t('corpus.partial', { n: l.count })}
                  {fullTexts > 0 && ` · ${t('corpus.full', { n: fullTexts })}`}
                </span>
                <button type="button" className="icon-text" disabled={!!loading || !!running} onClick={() => void load(lab.key)}>
                  {l ? t('corpus.reload') : t('corpus.load')}
                </button>
              </li>
            );
          })}
        </ul>
        {loading && (
          <div className="row">
            <button type="button" onClick={() => loadCtrl.current?.abort()}><IconStop /> {t('judge.stop')}</button>
          </div>
        )}
      </section>

      <section className="panel">
        <h2><span className={`step${passages.length > 0 ? ' done' : ''}`}>2</span>{' '}{t('text.title')}{name ? ` · ${name}` : ''}</h2>
        <textarea
          className="text-input"
          rows={8}
          value={text}
          placeholder={t('text.placeholder')}
          aria-label={t('text.title')}
          onChange={(e) => { setText(e.target.value); setName(undefined); setTruncated(false); }}
        />
        <div className="row">
          <button type="button" onClick={() => void pick()}>{t('text.pick')}</button>
          {passages.length > 0 && <span className="lab">{t('text.passages', { n: passages.length })}</span>}
        </div>
        {truncated && <div className="lab note">{t('text.truncated')}</div>}
        {passages.length > 0 && !english && <div className="lab note">{t('text.notEnglish')}</div>}
        {passages.length > 0 && <div className="lab">{t('text.goesToModel')}</div>}
        <div className="row">
          {running ? (
            <>
              <span className="lab reading" role="status">{t('cross.running', { done: running.done, total: running.total })}</span>
              <button type="button" onClick={() => crossCtrl.current?.abort()}><IconStop /> {t('judge.stop')}</button>
            </>
          ) : works.length === 0 ? (
            <span className="lab">{t('cross.needCorpus')}</span>
          ) : passages.length > 0 && (
            <button type="button" className="primary" disabled={locked || !!loading} onClick={() => void cross()}>
              <IconRead /> {t('cross.run', { n: passages.length, calls })}
            </button>
          )}
        </div>
      </section>

      {crossing && counts && !running && (
        <section className="results">
          <p className="lab live">{t('cross.counts', counts)}</p>
          <p className="lab">
            {t('cross.base', { k: CANDIDATES, n: crossing.loaded, labs: crossing.labs.map(labName).join(', ') })}
            {crossing.loadedUntil && <> · {t('cross.loadedUntil', { date: formatLocalDay(lang, crossing.loadedUntil) })}</>}
          </p>
          <p className="lab cost">
            {crossing.usd === null
              ? t('judge.costUnknown', { calls: crossing.calls })
              : t('judge.cost', { calls: crossing.calls, usd: formatUsd(lang, crossing.usd) })}
            {crossing.stoppedBy && <> · {t('judge.stopped', { why: refusalText(t, crossing.stoppedBy) })}</>}
          </p>
          {kept === 'too-long' && <p className="lab note">{t('cross.notKept')}</p>}
          {kept === 'not-saved' && <p className="lab note">{t('cross.notSaved')}</p>}
          <ul className="g-grid">
            {crossing.rows.map((row) => {
              const fullState = 'work' in row.verdict ? full[baseId(row.verdict.work)] : undefined;
              return (
                <CrossRow key={row.passage.n} row={row} crossing={crossing} lang={lang} t={t} onOpen={onOpen}
                  onReadFull={(w) => void readFull(w)} readBusy={fullBusy} {...(fullState ? { fullState } : {})} />
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

