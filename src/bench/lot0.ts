/**
 * lot0 — the measure of the topic judge, ready to run in the app (doc 187 §4).
 *
 * The 103 works of lot 0, labelled by hand by the agent against the stand-in
 * topics, are read again by the app's own model and compared. The texts are
 * fetched live (3 OpenAlex list calls); only ids and labels ship here.
 * Opened with `?bench=lot0` on the frame address, never on its own: 103 model
 * calls are billed like any other.
 */
import type { TopicVerdict } from '../judge/topicJudge';
import data from './lot0Labels.json';

export type Label = 'touches' | 'doubtful' | 'none' | 'unreadable';

export const LOT0: readonly { id: string; label: Label }[] = data.works as { id: string; label: Label }[];

export interface BenchRow {
  id: string;
  title: string;
  label: Label;
  verdict: TopicVerdict;
}

export interface BenchSummary {
  total: number;
  /** The judge said what the hand said. */
  agree: number;
  /** Labelled as touching, judged as touching none. */
  missed: number;
  /** Labelled as touching none, judged as touching one. */
  falseAlerts: number;
  /** Not verified, outside the one unreadable abstract. */
  unverified: number;
  /** Labelled doubtful: listed, never scored. */
  doubtful: number;
}

export function summarize(rows: readonly BenchRow[]): BenchSummary {
  const s: BenchSummary = { total: rows.length, agree: 0, missed: 0, falseAlerts: 0, unverified: 0, doubtful: 0 };
  for (const { label, verdict } of rows) {
    if (label === 'doubtful') { s.doubtful++; continue; }
    if (label === 'unreadable') { if (verdict.kind === 'unverified') s.agree++; else s.unverified++; continue; }
    if (verdict.kind === 'unverified') s.unverified++;
    else if (verdict.kind === (label === 'touches' ? 'touches' : 'none')) s.agree++;
    else if (label === 'touches') s.missed++;
    else s.falseAlerts++;
  }
  return s;
}
