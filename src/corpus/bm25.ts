/**
 * bm25 — finding the lab publications closest to a passage, by their words
 * (doc 187 §5, lot 3).
 *
 * Why here and not the house fusion (`fusedRetrieval`, vectors + BM25): no
 * cartridge door searches a vault by meaning (only `social.query`, which lists
 * a vault without a query), and adding one is a host change. So the crossing
 * ranks by words, inside the frame, over the abstracts it loaded, and every
 * screen says "closest by their words". The rank only chooses which abstracts
 * the judge reads; no score is ever shown.
 */

const STOP = new Set((
  'a an and are as at be been but by can could did do does for from had has have how if in into is it its '
  + 'may more most not of on or our over such than that the their them then there these they this those '
  + 'through to under up was we were what when where which while who will with within without would you your '
  + 'also both each other some any all one two three new using use used based show shows shown paper work '
  + 'study approach method methods propose proposed results result find found present presents via however'
).split(' '));

/** Lower case, accents off, letters and digits only, stop words and one-letter tokens out. */
export function tokenize(text: string): string[] {
  const words = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 2 || STOP.has(w)) continue;
    // A plural and its singular are one word here; short words keep their s.
    out.push(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return out;
}

export interface Bm25Doc {
  id: string;
  text: string;
}

export class Bm25Index {
  private readonly tf: Map<string, number>[] = [];
  private readonly len: number[] = [];
  private readonly df = new Map<string, number>();
  private readonly ids: string[] = [];
  private readonly avgLen: number;

  constructor(docs: readonly Bm25Doc[], private readonly k1 = 1.2, private readonly b = 0.75) {
    for (const d of docs) {
      const counts = new Map<string, number>();
      const tokens = tokenize(d.text);
      for (const tok of tokens) counts.set(tok, (counts.get(tok) ?? 0) + 1);
      for (const tok of counts.keys()) this.df.set(tok, (this.df.get(tok) ?? 0) + 1);
      this.tf.push(counts);
      this.len.push(tokens.length);
      this.ids.push(d.id);
    }
    this.avgLen = this.len.reduce((s, n) => s + n, 0) / Math.max(this.len.length, 1) || 1;
  }

  get size(): number {
    return this.ids.length;
  }

  /** The ids of the `k` documents sharing the most weight with the query; none when no word is shared. */
  search(query: string, k: number): string[] {
    const terms = [...new Set(tokenize(query))];
    const n = this.ids.length;
    const scored: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      let score = 0;
      const tf = this.tf[i]!;
      for (const term of terms) {
        const f = tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * (this.len[i]! / this.avgLen)));
      }
      if (score > 0) scored.push([score, i]);
    }
    return scored.sort((x, y) => y[0] - x[0]).slice(0, k).map(([, i]) => this.ids[i]!);
  }
}
