/**
 * TopicsPanel — the researcher's topics, one line each, in their words.
 * Saving a list changes its fingerprint: the arrivals then wait to be read
 * again, on the person's click (the count of calls is on the button).
 */
import { useState } from 'react';
import type { Translate } from '../i18n/strings';
import { MAX_TOPICS, MAX_TOPIC_CHARS } from '../topics';
import { IconAdd, IconRemove } from './icons';

export interface TopicsPanelProps {
  topics: readonly string[];
  byAgent: boolean;
  t: Translate;
  onSave: (lines: string[]) => void;
  onCancel: () => void;
}

export function TopicsPanel({ topics, byAgent, t, onSave, onCancel }: TopicsPanelProps) {
  const [lines, setLines] = useState<string[]>(() => [...topics]);
  const set = (i: number, v: string) => setLines((l) => l.map((x, j) => (j === i ? v : x)));
  return (
    <section className="hud panel topics" aria-label={t('topics.title')}>
      <div className="lab">02 · {t('topics.title')}</div>
      {byAgent && <div className="lab note">{t('topics.byAgent')}</div>}
      <ol className="topic-lines">
        {lines.map((line, i) => (
          <li key={i}>
            <span className="lab n">{String(i + 1).padStart(2, '0')}</span>
            <input
              value={line}
              maxLength={MAX_TOPIC_CHARS}
              placeholder={t('topics.placeholder')}
              aria-label={`${t('topics.title')} ${i + 1}`}
              onChange={(e) => set(i, e.target.value)}
            />
            <button type="button" className="icon-btn" title={t('topics.remove')} aria-label={t('topics.remove')} onClick={() => setLines((l) => l.filter((_, j) => j !== i))}>
              <IconRemove />
            </button>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" disabled={lines.length >= MAX_TOPICS} onClick={() => setLines((l) => [...l, ''])}>
          <IconAdd /> {t('topics.add')}
        </button>
        <button type="button" className="primary" onClick={() => onSave(lines)}>{t('topics.save')}</button>
        <button type="button" onClick={onCancel}>{t('topics.cancel')}</button>
      </div>
    </section>
  );
}
