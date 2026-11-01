/**
 * passages — the researcher's text cut into the pieces that are crossed one
 * by one (doc 187 §5.1).
 *
 * Cut at headings (Markdown `#`, or a short line standing alone), then at
 * blank lines; short paragraphs join their neighbour, long ones split at a
 * sentence end. Every passage is an exact substring of the text once its line
 * endings are made plain newlines (a pasted or extracted text can carry CRLF):
 * a claim the judge quotes from it can be found and highlighted.
 */

/** Under this, a paragraph joins the next one. */
export const MIN_PASSAGE_CHARS = 300;
/** Over this, a passage is split at a sentence end. */
export const MAX_PASSAGE_CHARS = 1_500;

export interface Passage {
  /** Its place in the text: what the screen numbers. */
  n: number;
  /** The heading it sits under, when there is one. */
  heading?: string;
  /** Exact substring of the researcher's text. */
  text: string;
}

const isHeading = (block: string) => /^#{1,6}\s/.test(block) || (!block.includes('\n') && block.length <= 80 && !/[.!?:;,]$/.test(block));

/** Splits one long block at sentence ends, each piece under MAX_PASSAGE_CHARS where a sentence allows. */
function splitLong(block: string): string[] {
  if (block.length <= MAX_PASSAGE_CHARS) return [block];
  const out: string[] = [];
  let rest = block;
  while (rest.length > MAX_PASSAGE_CHARS) {
    const window = rest.slice(0, MAX_PASSAGE_CHARS);
    const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    const at = cut > MIN_PASSAGE_CHARS ? cut + 1 : MAX_PASSAGE_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * A Markdown file's YAML header (`---` … `---` at the very top) is metadata,
 * not the researcher's text: crossing it would spend a call on its name and
 * description lines (seen on Tony's draft, doc 187 §5.6).
 */
function withoutFrontMatter(text: string): string {
  const m = /^---\n[\s\S]*?\n---\n/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

export function splitPassages(text: string): Passage[] {
  const body = withoutFrontMatter(text.replace(/\r\n?/g, '\n'));
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: Passage[] = [];
  let heading: string | undefined;
  let pending = '';
  const flush = () => {
    for (const piece of splitLong(pending)) out.push({ n: out.length + 1, ...(heading ? { heading } : {}), text: piece });
    pending = '';
  };
  for (const block of blocks) {
    if (isHeading(block)) {
      if (pending) flush();
      heading = block.replace(/^#{1,6}\s+/, '');
      continue;
    }
    // Paragraphs of one section join with the exact separator they had, so the
    // passage stays a substring of the text.
    pending = pending ? joinExact(text, pending, block) : block;
    if (pending.length >= MIN_PASSAGE_CHARS) flush();
  }
  if (pending) flush();
  return out.filter((p) => text.replace(/\r\n?/g, '\n').includes(p.text));
}

/** `a` then `b` as they stand in the text, the blank lines between them included. */
function joinExact(text: string, a: string, b: string): string {
  const t = text.replace(/\r\n?/g, '\n');
  const start = t.indexOf(a);
  const next = start === -1 ? -1 : t.indexOf(b, start + a.length);
  return start !== -1 && next !== -1 ? t.slice(start, next + b.length) : `${a}\n\n${b}`;
}

/**
 * Whether a text reads as English. The lab abstracts are in English, and words
 * do not cross languages: a French passage needs English search words first.
 */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length < 20) return true;
  const en = new Set(['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'as', 'we', 'this', 'are', 'on', 'by']);
  const hits = words.filter((w) => en.has(w)).length;
  return hits / words.length >= 0.08;
}
