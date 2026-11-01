import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from './bm25';

const DOCS = [
  { id: 'judge', text: 'LLM judges show position bias in pairwise evaluation of answers' },
  { id: 'memory', text: 'Long-term memory for agents: storing facts across sessions' },
  { id: 'protein', text: 'Protein design with diffusion models' },
];

describe('bm25', () => {
  it('ranks the documents that share the rarest words first', () => {
    const index = new Bm25Index(DOCS);
    expect(index.search('agents forget facts between sessions', 2)).toEqual(['memory']);
    expect(index.search('bias of LLM judges', 3)[0]).toBe('judge');
  });

  it('returns nothing when no word is shared: never a filler candidate', () => {
    expect(new Bm25Index(DOCS).search('quantum chromodynamics lattice', 5)).toEqual([]);
  });

  it('drops stop words, accents and plural s', () => {
    expect(tokenize('The Agents and the Mémoire, using sessions')).toEqual(['agent', 'memoire', 'session']);
  });
});
