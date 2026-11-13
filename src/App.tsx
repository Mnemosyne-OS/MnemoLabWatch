/**
 * App — the arrivals of the day, by lab, and what they touch of the
 * researcher's topics (doc 187 §3, lots 1 and 2).
 *
 * Three states for the watch (rule 11): reading, refused (no host, no
 * permission), read. The saved topics and verdicts have their own three: a
 * state that cannot be read disables the judge and writes nothing over it.
 * Reading costs model calls: it starts on a click only, the count on the
 * button, and the measured cost is shown afterwards.
 *
 * 0.2.0 (doc 187 §3.6): the saved state is read FIRST, because it holds the
 * arrivals already taken out of the watch's box; then the watch; then the box
 * is moved into the state. A state that cannot be read is never written over,
 * so the box then stays as it is.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countByLab, type Arrival } from './arrivals';
import { indexedDetailsCache, memoryDetailsCache, type DetailsCache } from './detailsCache';
import { sdk } from './host';
import { refusalText } from './i18n/strings';
import { useI18n } from './i18n/useI18n';
import { callsNeeded, judgeAll } from './judge/runJudge';
import { topicSpec, type JudgeInput, type TopicVerdict } from './judge/topicJudge';
import { LABS, type LabKey } from './labs';
import { loadWatch, markSeen, moveBox, type Loaded } from './load';
import { fetchJson, HOST_TIMEOUT_MS, type HostInvoke } from './sources/http';
import type { Crossing } from './research/crossing';
import { stateWriter } from './stateWriter';
import { keepVerdicts, needsReading, stateFits, type CostLine, type Saved } from './store';
import type { Kept } from './ui/CrossView';
import { cleanTopics, topicsKey } from './topics';
import { Bench } from './ui/Bench';
import { Card } from './ui/Card';
import { CrossView } from './ui/CrossView';
import { formatMoment, formatUsd } from './ui/format';
import { IconRead, IconSeen, IconStop, IconTopics } from './ui/icons';
import { TopicsPanel } from './ui/TopicsPanel';

const invoke: HostInvoke = (action, payload, timeoutMs) => sdk.invoke(action, payload, timeoutMs);

type View =
  | { state: 'reading' }
  | { state: 'refused'; why: string }
  | { state: 'read'; data: Loaded };

type SavedView =
  | { state: 'reading' }
  | { state: 'unreadable'; why: string }
  | { state: 'read'; data: Saved };

/** Verdicts are saved every few landings, so a closed window loses little that was paid for. */
const SAVE_EVERY = 5;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const inputOf = (a: Arrival): JudgeInput => ({
  kind: a.kind, title: a.title,
  ...(a.text ? { text: a.text } : {}),
  ...(a.abstract ? { abstract: a.abstract } : {}),
});

function benchRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('bench') === 'lot0';
  } catch (err) {
    console.warn('[mnemo-labwatch] frame address not read', err);
    return false;
  }
}

export interface AppProps {
  /** The details cache; the tests give a memory one. Refused → memory, details read at every opening. */
  openDetails?: () => Promise<DetailsCache>;
}

/**
 * The window. It reads the saved state before the watch because the state
 * holds the arrivals already taken out of the box; without it, the box is
 * listed but never emptied (doc 187 §3.6).
 */
export default function App({ openDetails = indexedDetailsCache }: AppProps = {}) {
  const { lang, t } = useI18n();
  const [view, setView] = useState<View>({ state: 'reading' });
  const [saved, setSaved] = useState<SavedView>({ state: 'reading' });
  const [filter, setFilter] = useState<LabKey | 'all'>('all');
  const [showOthers, setShowOthers] = useState(false);
  const [showNone, setShowNone] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [judging, setJudging] = useState<{ done: number; total: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [screenView, setScreenView] = useState<'arrivals' | 'cross'>('arrivals');
  // One model job at a time across both views: a reading and a crossing both
  // write the saved state, and the one that finished last would erase the other.
  const [crossBusy, setCrossBusy] = useState(false);
  // Why the box was not emptied at this opening (doc 187 §3.6), when it was not.
  const [moveError, setMoveError] = useState<string | null>(null);
  // The kept crossing was left out of the state to make room for the arrivals.
  const [crossingDropped, setCrossingDropped] = useState(false);
  const judgeCtrl = useRef<AbortController | null>(null);
  const cacheRef = useRef<DetailsCache | null>(null);
  // The latest saved state, for a crossing or a move that lands after a render: never write back an older copy.
  const savedRef = useRef<Saved | null>(null);
  // Every write of the state, from every view, goes through this one writer (stateWriter.ts).
  const writer = useMemo(() => stateWriter(invoke), []);
  const bench = useMemo(benchRequested, []);

  /** The writer left the crossing out: this frame's copy forgets it too, and the screen says so. */
  const dropCrossing = useCallback(() => {
    setCrossingDropped(true);
    const current = savedRef.current;
    if (!current?.crossing) return;
    const next: Saved = { ...current };
    delete next.crossing;
    savedRef.current = next;
    setSaved({ state: 'read', data: next });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const aborted = () => ctrl.signal.aborted;
    let cache: DetailsCache | null = null;
    const commit = (s: Saved) => {
      savedRef.current = s;
      setSaved({ state: 'read', data: s });
    };
    setView({ state: 'reading' });
    setSaved({ state: 'reading' });
    setMoveError(null);

    void (async () => {
      // The saved state first: it holds the arrivals already taken out of the box.
      let base: Saved | null = null;
      try {
        base = await writer.read();
        if (aborted()) return;
        commit(base);
      } catch (err) {
        if (aborted()) return;
        console.error('[mnemo-labwatch] saved state not read', err);
        setSaved({ state: 'unreadable', why: message(err) });
      }

      try {
        cache = await openDetails();
      } catch (err) {
        console.warn('[mnemo-labwatch] details cache not opened, details are read at every opening', err);
        cache = memoryDetailsCache();
      }
      if (aborted()) { cache.close(); return; }
      cacheRef.current = cache;

      let data: Loaded;
      try {
        data = await loadWatch({ invoke, fetchJson, cache }, base?.held ?? [], ctrl.signal);
      } catch (err) {
        if (aborted()) return;
        console.error('[mnemo-labwatch] watch not read', err);
        setView({ state: 'refused', why: message(err) });
        return;
      }
      if (aborted()) return;
      setView({ state: 'read', data });

      // 🪤 A state that could not be read is never written over: the box stays the copy.
      if (!base) return;
      const opened = base;
      const moved = await moveBox(writer.write, invoke, () => savedRef.current ?? opened, commit, data.box, data.boxWasFull);
      if (aborted()) return;
      if (moved.droppedCrossing) dropCrossing();
      if (moved.error) setMoveError(moved.error);
    })();

    return () => {
      ctrl.abort();
      if (cache) cache.close();
      if (cacheRef.current === cache) cacheRef.current = null;
    };
  }, [round, openDetails, writer, dropCrossing]);

  // A reading in flight stops with the window.
  useEffect(() => () => judgeCtrl.current?.abort(), []);

  const arrivals = view.state === 'read' ? view.data.arrivals : [];
  const counts = useMemo(() => countByLab(arrivals), [arrivals]);
  const inLab = useMemo(
    () => (filter === 'all' ? arrivals : arrivals.filter((a) => a.labs.includes(filter))),
    [arrivals, filter]);

  const data = saved.state === 'read' ? saved.data : null;
  savedRef.current = data;
  const key = data ? topicsKey(data.topics) : null;
  const verdictOf = useCallback((a: Arrival): TopicVerdict | undefined => {
    const e = data?.verdicts[a.key];
    return e && e.k === key ? e.v : undefined;
  }, [data, key]);

  // A post whose feed was read and whose categories are not research folds away.
  const research = inLab.filter((a) => a.research !== false);
  const others = inLab.filter((a) => a.research === false);
  const touching = research.filter((a) => verdictOf(a)?.kind === 'touches');
  const none = research.filter((a) => verdictOf(a)?.kind === 'none');
  const rest = research.filter((a) => { const k = verdictOf(a)?.kind; return k !== 'touches' && k !== 'none'; });
  const pending = research.filter((a) => needsReading(a, verdictOf(a)));
  const spec = useMemo(() => (data ? topicSpec(data.topics) : null), [data]);
  const calls = spec ? callsNeeded(pending.map((a) => ({ key: a.key, input: inputOf(a) })), spec) : 0;
  // "Mark all as seen" clears what is on screen; a folded arrival is not.
  const onScreen = [...touching, ...rest, ...(showNone ? none : []), ...(showOthers ? others : [])];

  const persist = useCallback((next: Saved) => {
    // Verdicts leave with their arrivals, but only against an inbox that was
    // READ: a watch still reading or refused lists nothing, and pruning against
    // it would drop every verdict already paid for.
    const toSave = view.state === 'read' ? keepVerdicts(next, new Set(view.data.arrivals.map((a) => a.key))) : next;
    savedRef.current = next;
    writer.write(toSave).then(
      (w) => { if (w.droppedCrossing) dropCrossing(); },
      (err: unknown) => {
        console.error('[mnemo-labwatch] state not saved', err);
        setActionError(message(err));
      });
  }, [view, writer, dropCrossing]);

  const read = useCallback(async () => {
    if (!data || !spec || !key || judging || crossBusy) return;
    const ctrl = new AbortController();
    judgeCtrl.current = ctrl;
    const items = pending.map((a) => ({ key: a.key, input: inputOf(a) }));
    setJudging({ done: 0, total: items.length });
    setActionError(null);
    // Every landing merges into the LATEST state, never a copy taken at the
    // click: a crossing kept meanwhile (its call was in flight when the view was
    // left) must not be erased by the end of this reading.
    const latest = () => savedRef.current ?? data;
    const res = await judgeAll(items, spec, invoke, ctrl.signal, (k, v, done, total) => {
      const base = latest();
      const next: Saved = { ...base, verdicts: { ...base.verdicts, [k]: { k: key, v } } };
      savedRef.current = next;
      setSaved({ state: 'read', data: next });
      setJudging({ done, total });
      if (done % SAVE_EVERY === 0) persist(next);
    });
    const cost: CostLine = {
      calls: res.calls, failed: res.failed, usd: res.usd,
      ...(res.stoppedBy ? { stoppedBy: res.stoppedBy } : {}), at: new Date().toISOString(),
    };
    const next: Saved = { ...latest(), cost };
    setSaved({ state: 'read', data: next });
    persist(next);
    setJudging(null);
  }, [data, spec, key, judging, crossBusy, pending, persist]);

  // [cursor] 2026-10-31 — do NOT auto-call read() here. Reading starts on a
  // click only (header of this file + App.test). An effect that fired when
  // pending > 0 ate the Read button (saveRace) and paid model calls unasked.

  const saveTopics = useCallback((lines: string[]) => {
    if (!data) return;
    const topics = cleanTopics(lines);
    if (topics.length === 0) return;
    const next: Saved = { ...data, topics, topicsBy: 'person' };
    setSaved({ state: 'read', data: next });
    persist(next);
    setTopicsOpen(false);
  }, [data, persist]);

  /** Keeps the last crossing when the whole state still fits its budget; says what happened. */
  const keepCrossing = useCallback((c: Crossing): Kept => {
    const current = savedRef.current;
    // The crossing view is locked while the state is unreadable; this is the last guard.
    if (!current) return 'not-saved';
    const withIt: Saved = { ...current, crossing: c };
    const fits = stateFits(withIt);
    const next: Saved = fits ? withIt : { ...current };
    if (!fits) delete next.crossing;
    setSaved({ state: 'read', data: next });
    persist(next);
    return fits ? 'kept' : 'too-long';
  }, [persist]);

  const seen = useCallback(async (gone: Arrival[]) => {
    const ids = gone.flatMap((a) => a.ids);
    setBusy(true);
    setActionError(null);
    try {
      // The state first, then the box. A refused save leaves the card on screen
      // with the reason; a box that refuses after it only brings the arrival back.
      // A state that could not be read is never written: the box is then the copy.
      const base = savedRef.current;
      if (base) {
        const left = view.state === 'read' ? view.data.arrivals.filter((a) => !a.ids.some((id) => ids.includes(id))) : null;
        // The verdicts leave with their arrivals in this very write.
        const next = left ? keepVerdicts(base, new Set(left.map((a) => a.key))) : base;
        const w = await writer.write(next, { release: ids });
        savedRef.current = next;
        setSaved({ state: 'read', data: next });
        if (w.droppedCrossing) dropCrossing();
      }
      await markSeen(invoke, ids);
      cacheRef.current?.remove(ids).catch((err: unknown) => {
        console.warn('[mnemo-labwatch] seen details left in the cache', err);
      });
      setView((v) => (v.state !== 'read' ? v : {
        state: 'read',
        data: { ...v.data, arrivals: v.data.arrivals.filter((a) => !a.ids.some((id) => ids.includes(id))) },
      }));
    } catch (err) {
      console.error('[mnemo-labwatch] not marked as seen', err);
      setActionError(message(err));
    } finally {
      setBusy(false);
    }
  }, [view, writer, dropCrossing]);

  /** The "box was full" notice stays until the person says it was read. */
  const dismissFull = useCallback(() => {
    const base = savedRef.current;
    if (!base?.boxFullAt) return;
    const next: Saved = { ...base };
    delete next.boxFullAt;
    savedRef.current = next;
    setSaved({ state: 'read', data: next });
    persist(next);
  }, [persist]);

  const open = useCallback(async (url: string) => {
    setActionError(null);
    try {
      await sdk.invoke('shell.openExternal', { url }, HOST_TIMEOUT_MS);
    } catch (err) {
      console.error('[mnemo-labwatch] link not opened', err);
      setActionError(message(err));
    }
  }, []);

  const status = view.state === 'read' ? view.data.status : null;
  const card = (a: Arrival) => (
    <Card key={a.key} a={a} verdict={verdictOf(a)} topics={data?.topics ?? []} lang={lang} t={t} busy={busy || !!judging} onOpen={open} onSeen={seen} />
  );

  return (
    <div className="lw-root">
      <header className="bar">
        <h1>{t('app.title')}</h1>
        <div className="status lab">
          <span className="live">{t('status.daily')}</span>
          {status?.lastRunAt
            ? <span>{t('status.lastRun', { date: formatMoment(lang, status.lastRunAt) })}</span>
            : view.state === 'read' && <span>{t('status.firstPass')}</span>}
          {status?.lastError && <span className="fail">{t('status.lastError', { error: status.lastError })}</span>}
        </div>
        <button type="button" aria-expanded={topicsOpen} disabled={!data || !!judging || crossBusy} onClick={() => setTopicsOpen((o) => !o)}>
          <IconTopics /> {t('topics.open')}
        </button>
      </header>

      {topicsOpen && data && (
        <TopicsPanel topics={data.topics} byAgent={data.topicsBy === 'agent'} t={t} onSave={saveTopics} onCancel={() => setTopicsOpen(false)} />
      )}

      {/* Both views write the saved state: what stops them is said above both. */}
      {saved.state === 'unreadable' && <p className="lab notice">{t('judge.stateUnreadable', { error: saved.why })}</p>}
      {actionError && <p className="lab notice" role="alert">{t('action.failed', { error: actionError })}</p>}
      {crossingDropped && <p className="lab notice">{t('box.crossingDropped')}</p>}

      <nav className="segmented views" aria-label={t('view.label')}>
        {(['arrivals', 'cross'] as const).map((v) => (
          <button key={v} type="button" className={screenView === v ? 'chosen' : ''} aria-pressed={screenView === v} onClick={() => setScreenView(v)}>
            {t(v === 'arrivals' ? 'view.arrivals' : 'view.cross')}
          </button>
        ))}
      </nav>

      {screenView === 'cross' && (
        saved.state === 'reading'
          ? <p className="lab reading" role="status">{t('app.reading')}</p>
          : <CrossView t={t} lang={lang} invoke={invoke} fetchJson={fetchJson} {...(data?.crossing ? { saved: data.crossing } : {})}
              onCrossed={keepCrossing} onOpen={open} locked={!!judging || saved.state === 'unreadable'} onBusy={setCrossBusy} />
      )}

      {screenView === 'arrivals' && bench && <Bench t={t} lang={lang} invoke={invoke} fetchJson={fetchJson} locked={!!judging || crossBusy} />}

      {screenView === 'arrivals' && view.state === 'reading' && <p className="lab reading" role="status">{t('app.reading')}</p>}

      {screenView === 'arrivals' && view.state === 'refused' && (
        <section className="panel" role="alert">
          <h2>{t('error.title')}</h2>
          <div className="lab why">{view.why}</div>
          <button type="button" onClick={() => setRound((r) => r + 1)}>{t('error.retry')}</button>
        </section>
      )}

      {screenView === 'arrivals' && view.state === 'read' && (
        <>
          {data?.boxFullAt && (
            <p className="lab notice">
              {t('box.wasFull', { date: formatMoment(lang, data.boxFullAt) })}{' '}
              <button type="button" onClick={dismissFull}>{t('box.dismiss')}</button>
            </p>
          )}
          {moveError && (
            <p className="lab notice">{moveError === 'STATE_FULL' ? t('box.stateFull') : t('box.notMoved', { error: moveError })}</p>
          )}
          {view.data.worksError && <p className="lab notice">{t('details.worksFailed', { error: view.data.worksError })}</p>}
          {view.data.feedError && <p className="lab notice">{t('details.feedFailed', { error: view.data.feedError })}</p>}

          <nav className="filters" aria-label={t('filter.label')}>
            <button type="button" className={`chip-tile${filter === 'all' ? ' chosen' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              {t('filter.all')} <span className="n">{arrivals.length}</span>
            </button>
            {LABS.map((lab) => (
              <button key={lab.key} type="button" className={`chip-tile${filter === lab.key ? ' chosen' : ''}`} aria-pressed={filter === lab.key} onClick={() => setFilter(lab.key)}>
                {lab.name} <span className="n">{counts[lab.key] ?? 0}</span>
              </button>
            ))}
          </nav>

          {inLab.length === 0 ? (
            <p className="lab empty">{t('list.empty')}</p>
          ) : (
            <>
              <div className="toolbar">
                <span className="lab">{t('list.count', { n: research.length })}</span>
                <div className="row">
                  {judging ? (
                    <>
                      <span className="lab reading" role="status">{t('judge.reading', { done: judging.done, total: judging.total })}</span>
                      <button type="button" onClick={() => judgeCtrl.current?.abort()}><IconStop /> {t('judge.stop')}</button>
                    </>
                  ) : pending.length > 0 && data && (
                    <button type="button" className="primary" disabled={crossBusy} onClick={() => void read()}>
                      <IconRead /> {t('judge.read', { n: pending.length, calls })}
                    </button>
                  )}
                  <button type="button" disabled={busy || !!judging || onScreen.length === 0} onClick={() => void seen(onScreen)}>
                    <IconSeen /> {t('list.allSeen')}
                  </button>
                </div>
              </div>
              {data?.cost && !judging && (
                <p className="lab cost">
                  {data.cost.usd === null
                    ? t('judge.costUnknown', { calls: data.cost.calls })
                    : t('judge.cost', { calls: data.cost.calls, usd: formatUsd(lang, data.cost.usd) })}
                  {/* A 0 says why only when a call really answered: refused calls cost nothing and prove nothing. */}
                  {data.cost.usd === 0 && data.cost.calls > (data.cost.failed ?? 0) && <> · {t('judge.zeroNote')}</>}
                  {data.cost.stoppedBy && <> · {t('judge.stopped', { why: refusalText(t, data.cost.stoppedBy) })}</>}
                </p>
              )}

              {(touching.length > 0 || rest.length > 0) && <ul className="g-grid">{[...touching, ...rest].map(card)}</ul>}

              {none.length > 0 && (
                <div className="others">
                  <button type="button" aria-expanded={showNone} onClick={() => setShowNone((s) => !s)}>
                    {showNone ? t('list.hideOther') : t('verdict.noneFolded', { n: none.length })}
                  </button>
                  {showNone && <ul className="g-grid">{none.map(card)}</ul>}
                </div>
              )}
              {others.length > 0 && (
                <div className="others">
                  <button type="button" aria-expanded={showOthers} onClick={() => setShowOthers((s) => !s)}>
                    {showOthers ? t('list.hideOther') : t('list.otherPosts', { n: others.length })}
                  </button>
                  {showOthers && <ul className="g-grid">{others.map(card)}</ul>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
