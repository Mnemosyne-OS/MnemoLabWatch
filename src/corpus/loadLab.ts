/**
 * loadLab — every publication of one lab, read from OpenAlex into the corpus
 * cache (doc 187 §2.1, §5).
 *
 * Cursor paging, 200 works a page, 1 credit a page: OpenAI is 2 pages, Meta
 * 22. The free budget is SHARED by every caller on the same IP address, so a
 * load starts on a click, never on its own. Only works with a readable
 * abstract are kept: a title alone gives the judge nothing to quote.
 */
import { LABS, OPENALEX_API, PAPER_FILTER, type LabKey } from '../labs';
import { parseWork, WORK_FIELDS, type FetchJson } from '../sources/openalex';
import type { CorpusStore, CorpusWork, LabLoad } from './corpusStore';

export const CORPUS_PAGE = 200;

/**
 * A ceiling on pages for one load: 60 × 200 = 12 000 works, Meta being 22
 * pages (doc 187 §1). Past it the load stops and says so, never loops on a
 * cursor that does not end.
 */
export const MAX_PAGES = 60;

export function corpusPageUrl(institution: string, cursor: string): string {
  return `${OPENALEX_API}/works?filter=authorships.institutions.id:${institution},${PAPER_FILTER}`
    + `&per-page=${CORPUS_PAGE}&cursor=${encodeURIComponent(cursor)}&select=${WORK_FIELDS}`;
}

export interface LoadProgress {
  page: number;
  /** Pages the lab needs, once the first page has said its count. */
  pages: number | null;
  kept: number;
}

export async function loadLab(
  lab: LabKey,
  fetchJson: FetchJson,
  store: CorpusStore,
  signal?: AbortSignal,
  onPage?: (p: LoadProgress) => void,
): Promise<LabLoad> {
  const def = LABS.find((l) => l.key === lab);
  if (!def) throw new Error('UNKNOWN_LAB');
  let cursor = '*';
  let page = 0;
  let listed = 0;
  let kept = 0;
  let pages: number | null = null;
  while (cursor) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (page >= MAX_PAGES) throw new Error(`TOO_MANY_PAGES: ${MAX_PAGES}`);
    const json = (await fetchJson(corpusPageUrl(def.institution, cursor), signal)) as { meta?: { count?: unknown; next_cursor?: unknown }; results?: unknown };
    if (!Array.isArray(json?.results)) throw new Error('OPENALEX_NO_RESULTS');
    page++;
    if (pages === null && typeof json.meta?.count === 'number') pages = Math.max(1, Math.ceil(json.meta.count / CORPUS_PAGE));
    const works: CorpusWork[] = [];
    for (const raw of json.results) {
      listed++;
      const w = parseWork(raw);
      if (!w?.abstractText) continue;
      works.push({
        id: w.id, lab, title: w.title, url: w.url, text: w.abstractText,
        ...(w.published ? { published: w.published } : {}),
        ...(w.licence ? { licence: w.licence } : {}),
        ...(w.pdfUrl ? { pdfUrl: w.pdfUrl } : {}),
      });
    }
    await store.put(works);
    kept += works.length;
    // Written after every page: a stopped load still says what it holds, and that it is partial.
    await store.setLoad({ lab, count: kept, listed, loadedAt: new Date().toISOString(), complete: false });
    onPage?.({ page, pages, kept });
    const next = json.meta?.next_cursor;
    cursor = json.results.length > 0 && typeof next === 'string' && next ? next : '';
  }
  const load: LabLoad = { lab, count: kept, listed, loadedAt: new Date().toISOString(), complete: true };
  await store.setLoad(load);
  return load;
}
