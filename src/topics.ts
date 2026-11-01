/**
 * topics — the researcher's topics, in their own words (doc 187 §3.2).
 *
 * A few lines, no keyword and no pattern: the judge reads them as a person
 * would. Until the person writes theirs, the list is the stand-in one the
 * agent wrote from the architecture docs for the lot 0 measure (doc 187 §4),
 * and the screen says who wrote it.
 */

export const MAX_TOPICS = 10;
export const MAX_TOPIC_CHARS = 200;

/** Written by the agent, not by the researcher (doc 187 §4). */
export const STAND_IN_TOPICS: readonly string[] = [
  'Long-term memory for AI agents and personal assistants',
  'Retrieval: RAG, vector search, lexical search, hybrid ranking',
  'Memory benchmarks and LLM judges, their biases and reliability',
  'Voice: speech synthesis and speech recognition',
  'Checking model answers against their sources',
];

/** Trimmed, empty lines dropped, duplicates dropped, capped. */
export function cleanTopics(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_CHARS);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

/** A short fingerprint of the list (FNV-1a): a verdict holds only for the topics it was given. */
export function topicsKey(topics: readonly string[]): string {
  let h = 0x811c9dc5;
  const s = topics.join('\n');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
