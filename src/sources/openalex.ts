/**
 * openalex — the details of the works the watch saw arrive (doc 187 §2.1).
 *
 * The watch only keeps an id and a title. Everything else (dates, labs,
 * abstract, link) is read here, in one list call for up to 50 ids: 1 credit.
 * OpenAlex answers with CORS `*`, so the frame calls it directly.
 *
 * Measured on 2026-10-28:
 *  - the abstract comes as an inverted index (word → positions), rebuilt here;
 *  - 🪤 one abstract in 97 is three words long ("SARC Jev test"), the next
 *    shortest is 74: under MIN_ABSTRACT_WORDS an abstract is said to be too
 *    short to read, never treated as a real one;
 *  - 🪤 one author from a lab is enough for OpenAlex to attribute the work to
 *    it (medicine with a Meta Platforms author, physics from the Anthropic
 *    STEM Fellows Program). The attribution is OpenAlex's and the screen says so.
 */
import { LABS, OPENALEX_API, type LabKey } from '../labs';

/** Ids per details call: OpenAlex's OR filter and page size both allow it. */
export const DETAILS_BATCH = 50;

/** Fewer words than this and the abstract is not one (doc 187 §2.1). */
export const MIN_ABSTRACT_WORDS = 20;

export type AbstractState = 'readable' | 'too-short' | 'missing';

export interface Work {
  /** `W7223706382`. */
  id: string;
  title: string;
  /** `2026-10-21`, as OpenAlex dates it. */
  published?: string;
  /** The day OpenAlex created the work. */
  created?: string;
  labs: LabKey[];
  abstract: AbstractState;
  abstractWords: number;
  /** The abstract itself, only when it is readable: what the judge reads. */
  abstractText?: string;
  /** DOI, else the landing page, else the OpenAlex page. */
  url: string;
  /** The licence OpenAlex gives for the primary location; absent when it gives none. */
  licence?: string;
  /** An open-access PDF, when OpenAlex knows one (lot 4). */
  pdfUrl?: string;
}

/** `https://openalex.org/W123` → `W123`. Already short stays as it is. */
export function shortId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//i, '');
}

/** What a details or corpus call asks for: all a work card, the judge and the crossing read. */
export const WORK_FIELDS = 'id,doi,title,publication_date,created_date,abstract_inverted_index,authorships,primary_location,best_oa_location';

export function detailsUrl(ids: string[]): string {
  return `${OPENALEX_API}/works?filter=openalex:${ids.map(shortId).join('|')}`
    + `&per-page=${DETAILS_BATCH}`
    + `&select=${WORK_FIELDS}`;
}

/** The abstract's words in order, from OpenAlex's inverted index. */
export function abstractWords(inverted: unknown): string[] {
  if (!inverted || typeof inverted !== 'object') return [];
  const slots: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(inverted as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (typeof p === 'number' && Number.isInteger(p)) slots.push([p, word]);
  }
  return slots.sort((a, b) => a[0] - b[0]).map(([, w]) => w);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const day = (v: unknown): string | undefined => str(v)?.slice(0, 10);

function labsOf(authorships: unknown): LabKey[] {
  const ids = new Set<string>();
  if (Array.isArray(authorships)) {
    for (const a of authorships) {
      const insts = (a as { institutions?: unknown })?.institutions;
      if (!Array.isArray(insts)) continue;
      for (const i of insts) {
        const id = str((i as { id?: unknown })?.id);
        if (id) ids.add(shortId(id));
      }
    }
  }
  return LABS.filter((lab) => ids.has(lab.institution)).map((lab) => lab.key);
}

/** One work, or null when OpenAlex gave no id or no title. */
export function parseWork(raw: unknown): Work | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const title = str(r.title);
  if (!id || !title) return null;
  const words = abstractWords(r.abstract_inverted_index);
  const location = (r.primary_location ?? null) as { landing_page_url?: unknown; license?: unknown } | null;
  const landing = str(location?.landing_page_url);
  const licence = str(location?.license);
  const pdfUrl = str((r.best_oa_location as { pdf_url?: unknown } | null | undefined)?.pdf_url);
  const published = day(r.publication_date);
  const created = day(r.created_date);
  const abstract: AbstractState = words.length === 0 ? 'missing' : words.length < MIN_ABSTRACT_WORDS ? 'too-short' : 'readable';
  return {
    id: shortId(id),
    title,
    ...(published ? { published } : {}),
    ...(created ? { created } : {}),
    labs: labsOf(r.authorships),
    abstract,
    abstractWords: words.length,
    ...(abstract === 'readable' ? { abstractText: words.join(' ') } : {}),
    url: str(r.doi) ?? landing ?? `https://openalex.org/${shortId(id)}`,
    ...(licence ? { licence } : {}),
    ...(pdfUrl ? { pdfUrl } : {}),
  };
}

export function parseWorks(json: unknown): Work[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) throw new Error('OPENALEX_NO_RESULTS');
  return results.map(parseWork).filter((w): w is Work => w !== null);
}

export type FetchJson = (url: string, signal?: AbortSignal) => Promise<unknown>;

/** The works behind these ids, by short id. An id OpenAlex does not return is simply absent. */
export async function fetchWorks(ids: string[], fetchJson: FetchJson, signal?: AbortSignal): Promise<Map<string, Work>> {
  const unique = [...new Set(ids.map(shortId))];
  const out = new Map<string, Work>();
  for (let i = 0; i < unique.length; i += DETAILS_BATCH) {
    const batch = unique.slice(i, i + DETAILS_BATCH);
    for (const w of parseWorks(await fetchJson(detailsUrl(batch), signal))) out.set(w.id, w);
  }
  return out;
}
