import { describe, expect, it } from 'vitest';
import { looksEnglish, MAX_PASSAGE_CHARS, splitPassages } from './passages';

const para = (s: string, n: number) => Array.from({ length: n }, (_, i) => `${s} sentence ${i}.`).join(' ');

describe('passages', () => {
  it('cuts at headings and keeps each passage a substring of the text, its heading named', () => {
    const text = `# Introduction\n\n${para('Memory for agents', 20)}\n\n## Method\n\n${para('We measure recall', 20)}`;
    const ps = splitPassages(text);
    expect(ps.map((p) => p.heading)).toEqual(['Introduction', 'Method']);
    for (const p of ps) expect(text.includes(p.text)).toBe(true);
  });

  it('joins short paragraphs with the blank line they had, and splits a long one at a sentence end', () => {
    const text = `Short one.\n\nShort two.\n\n${para('Long', 3)}`;
    expect(splitPassages(text)).toHaveLength(1);
    const long = splitPassages(para('A very long paragraph about retrieval', 80));
    expect(long.length).toBeGreaterThan(1);
    for (const p of long) {
      expect(p.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
      expect(p.text.endsWith('.')).toBe(true);
    }
  });

  it('leaves a Markdown YAML header out: it is metadata, not the text', () => {
    const text = `---\nname: draft\ndescription: a paper\n---\n\n# Introduction\n\n${para('Memory for agents', 20)}`;
    const ps = splitPassages(text);
    expect(ps.map((p) => p.heading)).toEqual(['Introduction']);
    expect(ps.some((p) => p.text.includes('name: draft'))).toBe(false);
  });

  it('numbers the passages in order', () => {
    const ps = splitPassages(`${para('One', 30)}\n\n${para('Two', 30)}`);
    expect(ps.map((p) => p.n)).toEqual([1, 2]);
  });

  it('tells an English text from a French one', () => {
    expect(looksEnglish(para('This is the memory of the agent and we keep it in the store', 3))).toBe(true);
    expect(looksEnglish(para('Nous mesurons la mémoire des agents et nous gardons les faits dans le coffre', 3))).toBe(false);
  });
});
