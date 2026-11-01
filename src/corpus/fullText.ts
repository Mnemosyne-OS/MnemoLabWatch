/**
 * fullText — the whole text of an open-access publication, read through the
 * host and cut into passages for the crossing (doc 187 §7, lot 4).
 *
 *  - `reader.downloadUrl` fetches the PDF host-side (no CORS wall), then
 *    `reader.extractDocument` reads it, the way MnemoReader does: whole text,
 *    OCR when there is no text layer. Both are gated by `vault:read`: no short
 *    bound, the first call can wait on the host's prompt.
 *  - Only on a click, one publication at a time: a PDF can be tens of pages.
 *  - The passages join the corpus next to the abstract; the licence line goes
 *    with them, as OpenAlex gives it or as "not given", never guessed.
 *  - The OpenAI post pages are NOT read here: they answer 403 to a fetch, and
 *    a hidden window that renders any page a cartridge names is a security
 *    decision for the host (doc 187 §8).
 */
import { splitPassages } from '../research/passages';
import type { HostInvoke } from '../sources/http';
import type { CorpusStore, CorpusWork } from './corpusStore';

/** The work a corpus entry belongs to: `W123#p4` → `W123`. */
export const baseId = (id: string) => id.split('#')[0]!;

export interface FullTextRead {
  passages: number;
  truncated: boolean;
}

type Base = Pick<CorpusWork, 'id' | 'lab' | 'title' | 'url'> & Partial<Pick<CorpusWork, 'published' | 'licence' | 'pdfUrl'>>;

export async function readFullText(work: Base, invoke: HostInvoke, store: CorpusStore): Promise<FullTextRead> {
  if (!work.pdfUrl) throw new Error('NO_OPEN_PDF');
  const id = baseId(work.id);
  const dl = (await invoke('reader.downloadUrl', { url: work.pdfUrl, filename: `${id}.pdf` })) as { success?: boolean; data?: { path?: unknown }; error?: string } | null;
  const path = dl?.data?.path;
  if (dl?.success === false || typeof path !== 'string' || !path) throw new Error(dl?.error ?? 'DOWNLOAD_FAILED');
  const ex = (await invoke('reader.extractDocument', { filePath: path })) as { success?: boolean; data?: { text?: unknown; truncated?: unknown }; error?: string } | null;
  const text = ex?.data?.text;
  if (ex?.success === false || typeof text !== 'string') throw new Error(ex?.error ?? 'EXTRACT_FAILED');
  const passages = splitPassages(text);
  if (passages.length === 0) throw new Error('FULL_TEXT_EMPTY');
  const entries: CorpusWork[] = passages.map((p) => ({
    id: `${id}#p${p.n}`, lab: work.lab, title: work.title, url: work.url, text: p.text, full: true, part: p.n,
    ...(p.heading ? { heading: p.heading } : {}),
    ...(work.published ? { published: work.published } : {}),
    ...(work.licence ? { licence: work.licence } : {}),
    pdfUrl: work.pdfUrl,
  }));
  await store.put(entries);
  return { passages: entries.length, truncated: ex?.data?.truncated === true };
}
