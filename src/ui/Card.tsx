/**
 * Card — one arrival: its labs, its title, its two dates, what the judge
 * said about it, and the two things the person can do (open, seen).
 */
import type { Arrival } from '../arrivals';
import type { Key, Lang, Translate } from '../i18n/strings';
import type { TopicVerdict } from '../judge/topicJudge';
import { labName } from '../labs';
import { formatDay, formatLocalDay } from './format';
import { IconOpen, IconSeen } from './icons';

export interface CardProps {
  a: Arrival;
  /** The current verdict; undefined when not read with the current topics. */
  verdict?: TopicVerdict;
  topics: readonly string[];
  lang: Lang;
  t: Translate;
  busy: boolean;
  onOpen: (url: string) => void;
  onSeen: (gone: Arrival[]) => void;
}

export function Card({ a, verdict, topics, lang, t, busy, onOpen, onSeen }: CardProps) {
  const touches = verdict?.kind === 'touches';
  return (
    <li className={`hud card${touches ? ' chosen' : ''}`}>
      <div className="lab who">
        {a.labs.map(labName).join(' · ')} · {a.kind === 'paper' ? t('card.paper') : t('card.post')}
      </div>
      <h2>{a.title}</h2>
      <div className="lab">
        {a.published ? t('card.published', { date: formatDay(lang, a.published) }) : t('card.noDate')}
        {' · '}
        {t('card.recorded', { date: formatLocalDay(lang, a.recordedAt) })}
      </div>

      {verdict?.kind === 'touches' && (
        <div className="verdict">
          <div className="lab chosen-ink">{t('verdict.touches', { topic: topics[verdict.topic] ?? String(verdict.topic + 1) })}</div>
          <q>{verdict.quote}</q>
          {a.kind === 'post' && <div className="lab">{t('verdict.postNote')}</div>}
        </div>
      )}
      {verdict === undefined && a.research !== false && topics.length > 0 && <div className="lab">{t('verdict.pending')}</div>}
      {verdict?.kind === 'unverified' && (
        <div className="lab note">{t('verdict.unverified', { why: t(`why.${verdict.reason}` as Key) })}</div>
      )}

      {a.kind === 'paper' && a.details && <div className="lab">{t('card.attributed')}</div>}
      {!a.details && <div className="lab note">{t('card.noDetails')}</div>}
      {a.abstract === 'too-short' && verdict?.kind !== 'unverified' && <div className="lab note">{t('card.abstractShort', { n: a.abstractWords ?? 0 })}</div>}
      {a.abstract === 'missing' && verdict?.kind !== 'unverified' && <div className="lab note">{t('card.abstractMissing')}</div>}
      {a.ids.length > 1 && <div className="lab">{t('card.records', { n: a.ids.length })}</div>}
      <div className="actions">
        {a.url && (
          <button type="button" onClick={() => onOpen(a.url!)}>
            <IconOpen /> {t('card.open')}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => onSeen([a])}>
          <IconSeen /> {t('card.seen')}
        </button>
      </div>
    </li>
  );
}
