/**
 * CrossRow — one passage of the researcher's text and what the judge found
 * for it, with both sides quoted word for word. Dates show order only: no
 * word on the screen draws a conclusion from them (doc 187 §5.2).
 */
import type { Key, Lang, Translate } from '../i18n/strings';
import { labName } from '../labs';
import type { Crossing, CrossingRow } from '../research/crossing';
import { formatDay } from './format';
import { IconOpen, IconRead } from './icons';

export interface CrossRowProps {
  row: CrossingRow;
  crossing: Pick<Crossing, 'works' | 'loaded'>;
  lang: Lang;
  t: Translate;
  onOpen: (url: string) => void;
  /** Lot 4: read this publication's open PDF. Absent when no reading is possible. */
  onReadFull?: (work: Crossing['works'][string]) => void;
  /** Where that reading stands for this publication. */
  fullState?: FullState;
  /** True while another full text is being read: one at a time. */
  readBusy?: boolean;
}

export type FullState = { state: 'reading' } | { state: 'read'; passages: number; truncated: boolean } | { state: 'failed'; why: string };

/** The passage, the judged claim marked inside it when it stands there as is. */
function Passage({ text, claim }: { text: string; claim?: string }) {
  const at = claim ? text.indexOf(claim) : -1;
  if (!claim || at === -1) return <p className="passage">{text}</p>;
  return (
    <p className="passage">
      {text.slice(0, at)}<mark>{claim}</mark>{text.slice(at + claim.length)}
    </p>
  );
}

export function CrossRow({ row, crossing, lang, t, onOpen, onReadFull, fullState, readBusy = false }: CrossRowProps) {
  const { passage, verdict: v } = row;
  const work = 'work' in v ? crossing.works[v.work] : undefined;
  const tone = v.kind === 'supports' ? ' chosen' : v.kind === 'partial' ? ' partial' : v.kind === 'diverges' ? ' diverges' : '';
  return (
    <li className={`card${tone}`}>
      <div className="lab who">
        {t('cross.passage', { n: String(passage.n).padStart(2, '0') })}{passage.heading ? ` · ${passage.heading}` : ''}
      </div>
      <Passage text={passage.text} {...('claim' in v ? { claim: v.claim } : {})} />

      {v.kind === 'supports' && <div className="lab chosen-ink">{t('cross.supports')}</div>}
      {v.kind === 'partial' && (
        <div className="lab warning-ink">{t('cross.partial')}{v.missing ? ` · ${t('cross.missing', { what: v.missing })}` : ''}</div>
      )}
      {v.kind === 'diverges' && (
        <div className="lab info-ink">{t('cross.diverges')} · {t('cross.divergesNote')}</div>
      )}
      {v.kind === 'absent' && (
        <div className="lab">
          {v.shown === 0 ? t('cross.absentNone') : t('cross.absent', { k: v.shown, n: crossing.loaded })}
        </div>
      )}
      {v.kind === 'unverified' && (
        <div className="lab note">{t('verdict.unverified', { why: t(`why.${v.reason}` as Key) })}</div>
      )}

      {'quote' in v && (
        <div className={v.kind === 'diverges' ? 'sides' : 'verdict'}>
          {v.kind === 'diverges' && (
            <div><div className="lab">{t('cross.yours')}</div><q>{v.claim}</q></div>
          )}
          <div>
            {v.kind === 'diverges' && <div className="lab">{t('cross.theirs')}</div>}
            <q>{v.quote}</q>
          </div>
        </div>
      )}
      {work && (
        <div className="work">
          <div className="lab who">{labName(work.lab)}{work.published ? ` · ${t('card.published', { date: formatDay(lang, work.published) })}` : ''}</div>
          <div className="work-title">{work.title}</div>
          {work.full && work.part !== undefined && <div className="lab">{t('full.part', { n: work.part })}</div>}
          <div className="lab">{work.licence ? t('licence.line', { licence: work.licence }) : t('licence.none')}</div>
          {fullState?.state === 'read' && (
            <div className="lab chosen-ink">
              {t('full.done', { n: fullState.passages })}{fullState.truncated ? ` · ${t('full.truncated')}` : ''}
            </div>
          )}
          {fullState?.state === 'failed' && <div className="lab note">{t('action.failed', { error: fullState.why })}</div>}
          <div className="actions">
            <button type="button" onClick={() => onOpen(work.url)}><IconOpen /> {t('card.open')}</button>
            {onReadFull && work.pdfUrl && !work.full && fullState?.state !== 'read' && (
              <button type="button" disabled={readBusy} onClick={() => onReadFull(work)}>
                <IconRead /> {fullState?.state === 'reading' ? t('full.reading') : t('full.read')}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
