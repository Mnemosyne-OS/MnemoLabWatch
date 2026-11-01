/**
 * labs — which labs are watched, and the six targets handed to the host's
 * background watch (host doc 72). Measured on 2026-10-28, doc 187 §2.1:
 *
 *  - a lab is an OpenAlex institution. The list filter costs 1 credit, a
 *    full-text search 10, out of a free budget of 1 000 a day SHARED by every
 *    caller on the same IP address: the watch only ever lists;
 *  - 🪤 Zenodo deposits (GitHub release archives that name the lab or Claude)
 *    made 64 to 90 % of the "works" of these labs since 2025: every list
 *    leaves the Zenodo source out and keeps articles and preprints only;
 *  - 🪤 `from_created_date` is a paid filter (429 "Plan upgrade required"):
 *    freshness comes from sorting by publication date, and the host's memory
 *    of the ids it has already seen does the rest;
 *  - OpenAlex creates a work 2 days after its publication date (median, 9 at
 *    most), and the top 50 of the busiest lab reached back 30 days: one pass a
 *    day, 50 per lab, misses nothing that late.
 */

export type LabKey = 'openai' | 'anthropic' | 'deepmind' | 'meta' | 'mistral';

export interface Lab {
  key: LabKey;
  /** As the lab names itself. Never translated. */
  name: string;
  /** OpenAlex institution id. */
  institution: string;
}

export const LABS: readonly Lab[] = [
  { key: 'openai', name: 'OpenAI', institution: 'I4210161460' },
  { key: 'anthropic', name: 'Anthropic', institution: 'I4387930290' },
  { key: 'deepmind', name: 'Google DeepMind', institution: 'I4210090411' },
  { key: 'meta', name: 'Meta', institution: 'I4210114444' },
  { key: 'mistral', name: 'Mistral AI', institution: 'I4390039361' },
];

export const OPENALEX_API = 'https://api.openalex.org';

/** The Zenodo source on OpenAlex. */
export const ZENODO_SOURCE = 'S4306400562';

/** Articles and preprints, Zenodo left out. */
export const PAPER_FILTER = `primary_location.source.id:!${ZENODO_SOURCE},type:article|preprint`;

/** Works per lab and per pass. */
export const WATCH_PAGE = 50;

/** OpenAI's own posts, research among them. It has no CORS header: read through the host. */
export const OPENAI_RSS = 'https://openai.com/news/rss.xml';

/** The feed target's label: what the notification names, and what the inbox calls its source. */
export const OPENAI_FEED_LABEL = 'OpenAI news';

/** One pass a day: OpenAlex lags 2 days on the median, an hourly pass would buy nothing. */
export const WATCH_INTERVAL_MIN = 24 * 60;

export function labWatchUrl(lab: Lab): string {
  return `${OPENALEX_API}/works?filter=authorships.institutions.id:${lab.institution},${PAPER_FILTER}`
    + `&sort=publication_date:desc&per-page=${WATCH_PAGE}&select=id,title`;
}

/** The host's target shape (main/watch/cartridgeWatch.ts). */
export interface WatchTarget {
  url: string;
  spec: { mode: 'atom' | 'json'; arrayPath?: string; idField?: string; labelField?: string };
  label?: string;
}

export function watchTargets(): WatchTarget[] {
  return [
    ...LABS.map((lab) => ({
      url: labWatchUrl(lab),
      spec: { mode: 'json' as const, arrayPath: 'results', idField: 'id', labelField: 'title' },
      label: lab.name,
    })),
    { url: OPENAI_RSS, spec: { mode: 'atom' as const }, label: OPENAI_FEED_LABEL },
  ];
}

/*
 * 🪤 The host writes a target's LABEL as the `source` of its inbox items when
 * the target has one, and its url otherwise (cartridgeWatch.ts, the run
 * loop). Every target here has a label, so the label is what arrives; the url
 * is still recognised for a watch registered without labels.
 */

/** Whether an inbox item came from the OpenAI feed. */
export function isFeedSource(source: string): boolean {
  return source === OPENAI_FEED_LABEL || source === OPENAI_RSS;
}

/** The lab an inbox item's source belongs to; the OpenAI feed is OpenAI's. */
export function labOfSource(source: string): LabKey | null {
  if (isFeedSource(source)) return 'openai';
  return LABS.find((lab) => source === lab.name || source === labWatchUrl(lab))?.key ?? null;
}

export function labName(key: LabKey): string {
  return LABS.find((lab) => lab.key === key)?.name ?? key;
}
