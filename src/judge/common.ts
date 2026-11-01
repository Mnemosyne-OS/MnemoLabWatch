/**
 * common — what every judge of Lab Watch shares (doc 187 §3.3, §5.2, after
 * doc 129 §4): the model's answer is read, then checked mechanically, and the
 * mechanical check wins.
 *
 *  - A quote is an exact substring of its source, spaces normalised, at least
 *    MIN_QUOTE_WORDS words: a one-word "quote" is a substring of everything.
 *  - An answer that is not one JSON object is unreadable: it never becomes a
 *    verdict by default.
 *  - The texts judged are DATA. An abstract can carry sentences that look like
 *    instructions; the schema and the substring check are the defence, and
 *    nothing a model returns ever drives an action here.
 */

/** Fewer words than this and a quote proves nothing. */
export const MIN_QUOTE_WORDS = 4;

/** Characters of a source text sent to the model, at most. */
export const MAX_SOURCE_CHARS = 4_000;

/** Tokens a verdict needs: one short JSON object. */
export const VERDICT_MAX_TOKENS = 300;

export const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Quote marks a model tends to swap: compared as one. */
const foldQuotes = (s: string) => s.replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"');

const words = (s: string) => normalizeSpaces(s).split(' ').filter(Boolean).length;

/** The source spaces-and-quotes folded, with the index each folded character came from. */
function foldWithMap(source: string): { folded: string; at: number[] } {
  let folded = '';
  const at: number[] = [];
  let inSpace = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (/\s/.test(c)) {
      if (folded.length > 0 && !inSpace) { folded += ' '; at.push(i); }
      inSpace = true;
      continue;
    }
    inSpace = false;
    folded += foldQuotes(c);
    at.push(i);
  }
  if (folded.endsWith(' ')) { folded = folded.slice(0, -1); at.pop(); }
  return { folded, at };
}

/**
 * The passage of `source` that `quote` copies, AS THE SOURCE WRITES IT (its own
 * spaces and quote marks), or null when it is not there word for word. The
 * screen shows this extract, never the model's copy: a model that turned ’
 * into ' must not have its version displayed as the source's words.
 */
export function findExact(source: string, quote: string): string | null {
  const q = foldQuotes(normalizeSpaces(quote));
  if (words(q) < MIN_QUOTE_WORDS) return null;
  const { folded, at } = foldWithMap(source);
  const start = folded.indexOf(q);
  if (start === -1) return null;
  return source.slice(at[start]!, at[start + q.length - 1]! + 1);
}

/** Whether `quote` appears word for word in `source`. */
export function isExactQuote(source: string, quote: string): boolean {
  return findExact(source, quote) !== null;
}

/** Host codes after which no further model call can succeed: the reading stops there. */
export const FATAL_MODEL_CODES: readonly string[] = ['CLOUD_QUOTA_EXHAUSTED', 'CLOUD_AUTH_FAILED'];

/** The host refused a model call (`{ success: false }`), with its code when it gives one. */
export class ModelRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ModelRefused';
    this.code = code;
  }
}

/**
 * The text of a model answer.
 * 🪤 `model.infer` does not throw on a refusal: it answers `{ success: false,
 * error, errorCode }` (credits spent, key refused, timeout). That is an error,
 * never an empty answer read as "unreadable".
 */
export function modelAnswer(res: unknown): string {
  if (res && typeof res === 'object' && (res as { success?: unknown }).success === false) {
    const r = res as { error?: unknown; errorCode?: unknown };
    const code = typeof r.errorCode === 'string' ? r.errorCode : 'MODEL_REFUSED';
    throw new ModelRefused(code, typeof r.error === 'string' && r.error ? r.error : code);
  }
  return inferText(res);
}

/** Whether a failed call means every next call would fail too. */
export const isFatal = (err: unknown) => err instanceof ModelRefused && FATAL_MODEL_CODES.includes(err.code);

/** The first balanced `{…}` of a model answer, parsed; null when there is none. */
export function firstJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        const v = JSON.parse(raw.slice(start, i + 1)) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
      } catch (err) {
        console.warn('[mnemo-labwatch] model answer is not JSON', err);
        return null;
      }
    }
  }
  return null;
}

/**
 * A model answer arrives in whatever envelope the active provider uses
 * (same normalisation as Pheme's `inferText`). Empty when there is no text.
 */
export function inferText(res: unknown): string {
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    for (const key of ['text', 'content', 'answer', 'response', 'output']) {
      if (typeof r[key] === 'string') return r[key] as string;
    }
    if (r.data) return inferText(r.data);
    if (r.result) return inferText(r.result);
  }
  return '';
}

/** A source cut for the prompt, at a word boundary. */
export function clip(text: string, max = MAX_SOURCE_CHARS): string {
  const t = normalizeSpaces(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 0)) || cut;
}
