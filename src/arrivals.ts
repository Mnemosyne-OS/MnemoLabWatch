/**
 * arrivals — what the watch saw arrive, made readable: one entry per work or
 * post, its labs, its two dates, its link. Pure: the screen and the tests
 * both feed it the host's inbox and the details read from the sources.
 *
 * Rules (doc 187 §2.1, §3.3):
 *  - 🪤 two OpenAlex records can carry the same title under two ids (2 in 105
 *    on 2026-10-28): they fold into one arrival that keeps both ids, so
 *    "seen" clears both;
 *  - an id whose details could not be read stays listed with the watch's own
 *    title and says so (`details: false`). It is never dropped and never
 *    given a date it does not have;
 *  - 🪤 the host's feed extractor keeps the CDATA wrapper of an RSS title:
 *    it is taken off here.
 */
import { isFeedSource, labOfSource, type LabKey } from './labs';
import { shortId, type AbstractState, type Work } from './sources/openalex';
import { isResearch, type Post } from './sources/openaiRss';

/** One entry of the host's inbox (main/watch/cartridgeWatch.ts). */
export interface InboxItem {
  id: string;
  label?: string;
  /** The target that produced it: its label when it has one, else its url (labs.ts). */
  source: string;
  /** ISO time the watch saw it. */
  at: string;
}

export interface Arrival {
  /** The first inbox id folded here: stable React key. */
  key: string;
  /** Every inbox id folded into this arrival. */
  ids: string[];
  kind: 'paper' | 'post';
  labs: LabKey[];
  title: string;
  /** Publication date, as the source gives it. */
  published?: string;
  /**
   * The instant the watch picked it up, as the host wrote it (ISO, UTC).
   * 🪤 Kept as an instant: its UTC day is already tomorrow on an evening
   * west of Greenwich, so the screen formats it in local time.
   */
  recordedAt: string;
  url?: string;
  /** Papers only. */
  abstract?: AbstractState;
  abstractWords?: number;
  /** Posts only: whether its categories are research. Absent when the feed could not be read. */
  research?: boolean;
  /**
   * What the judge reads (lot 2): a paper's readable abstract, or a post's
   * title and summary. Absent when there is nothing worth reading.
   */
  text?: string;
  /** False when only the watch's title is known. */
  details: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** A title as the host's extractor left it, made readable. */
export function cleanLabel(s: string): string {
  return s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e] ?? _)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two titles that differ only by case, accents, punctuation or spacing are the same. */
export function titleKey(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const union = (a: LabKey[], b: LabKey[]): LabKey[] => [...new Set([...a, ...b])];
const isUrl = (s: string) => /^https?:\/\//i.test(s);

function fromPost(item: InboxItem, post: Post | undefined): Omit<Arrival, 'key' | 'ids' | 'recordedAt'> {
  if (!post) {
    return {
      kind: 'post', labs: ['openai'], title: cleanLabel(item.label ?? item.id),
      ...(isUrl(item.id) ? { url: item.id } : {}), details: false,
    };
  }
  return {
    kind: 'post', labs: ['openai'], title: post.title, url: post.url,
    ...(post.published ? { published: post.published } : {}),
    research: isResearch(post), details: true,
    text: post.description ? `${post.title}. ${post.description}` : post.title,
  };
}

function fromWork(item: InboxItem, work: Work | undefined): Omit<Arrival, 'key' | 'ids' | 'recordedAt'> {
  const lab = labOfSource(item.source);
  const watched: LabKey[] = lab ? [lab] : [];
  if (!work) {
    return {
      kind: 'paper', labs: watched, title: cleanLabel(item.label ?? shortId(item.id)),
      url: `https://openalex.org/${shortId(item.id)}`, details: false,
    };
  }
  return {
    kind: 'paper', labs: union(watched, work.labs), title: work.title, url: work.url,
    ...(work.published ? { published: work.published } : {}),
    abstract: work.abstract, abstractWords: work.abstractWords, details: true,
    ...(work.abstractText ? { text: work.abstractText } : {}),
  };
}

/** Newest publication first; an arrival without a date goes after the dated ones. */
function byDate(a: Arrival, b: Arrival): number {
  if (a.published !== b.published) {
    if (!a.published) return 1;
    if (!b.published) return -1;
    return a.published < b.published ? 1 : -1;
  }
  const ra = Date.parse(a.recordedAt);
  const rb = Date.parse(b.recordedAt);
  if (ra !== rb && !Number.isNaN(ra) && !Number.isNaN(rb)) return ra < rb ? 1 : -1;
  return a.title.localeCompare(b.title);
}

export function buildArrivals(items: InboxItem[], works: ReadonlyMap<string, Work>, posts: ReadonlyMap<string, Post>): Arrival[] {
  const folded = new Map<string, Arrival>();
  for (const item of items) {
    const body = isFeedSource(item.source) ? fromPost(item, posts.get(item.id)) : fromWork(item, works.get(shortId(item.id)));
    const k = `${body.kind}:${titleKey(body.title)}`;
    const prev = folded.get(k);
    if (!prev) {
      folded.set(k, { ...body, key: item.id, ids: [item.id], recordedAt: item.at });
      continue;
    }
    prev.ids.push(item.id);
    prev.labs = union(prev.labs, body.labs);
    // The first time the watch saw the work is when it arrived.
    if (Date.parse(item.at) < Date.parse(prev.recordedAt)) prev.recordedAt = item.at;
    // The record that has details speaks for the pair.
    if (!prev.details && body.details) Object.assign(prev, { ...body, labs: prev.labs, key: prev.key, ids: prev.ids, recordedAt: prev.recordedAt });
  }
  return [...folded.values()].sort(byDate);
}

/** Arrivals per lab, an arrival with two labs counting for both. */
export function countByLab(arrivals: Arrival[]): Partial<Record<LabKey, number>> {
  const out: Partial<Record<LabKey, number>> = {};
  for (const a of arrivals) for (const l of a.labs) out[l] = (out[l] ?? 0) + 1;
  return out;
}
