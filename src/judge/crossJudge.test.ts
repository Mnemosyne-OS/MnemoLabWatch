import { describe, expect, it } from 'vitest';
import type { CorpusWork } from '../corpus/corpusStore';
import { crossPrompt, crossSpec, parseCrossVerdict, parseKeywords, type CrossInput } from './crossJudge';

const work = (id: string, text: string): CorpusWork => ({ id, lab: 'meta', title: `Title ${id}`, url: `https://openalex.org/${id}`, text });
const INPUT: CrossInput = {
  passage: 'Our judges are calibrated. We find that position bias drops when answers are swapped.',
  candidates: [
    work('W1', 'Protein design with diffusion models at scale.'),
    work('W2', 'LLM judges show position bias in pairwise evaluation, and swapping answers reduces it.'),
  ],
};

describe('cross judge', () => {
  it('reads a verdict that quotes both sides word for word', () => {
    const raw = '{"verdict":"supports","pub":2,"claim":"position bias drops when answers are swapped","quote":"swapping answers reduces it"}';
    expect(parseCrossVerdict(raw, INPUT)).toEqual({
      kind: 'supports', work: 'W2', claim: 'position bias drops when answers are swapped', quote: 'swapping answers reduces it',
    });
  });

  it('keeps what a partial verdict says is missing, and a divergence with both sides', () => {
    expect(parseCrossVerdict('{"verdict":"partial","pub":2,"claim":"position bias drops when answers are swapped","quote":"LLM judges show position bias","missing":"calibration"}', INPUT))
      .toMatchObject({ kind: 'partial', missing: 'calibration' });
    expect(parseCrossVerdict('{"verdict":"diverges","pub":2,"claim":"Our judges are calibrated.","quote":"LLM judges show position bias"}', INPUT))
      .toMatchObject({ kind: 'diverges', claim: 'Our judges are calibrated.', quote: 'LLM judges show position bias' });
  });

  it('keeps each side as its own text writes it, not as the model copied it', () => {
    const input: CrossInput = {
      passage: 'We swap the answers.\nPosition bias drops when answers are swapped.',
      candidates: [work('W5', 'Judges are “position” biased when answers are not swapped.')],
    };
    const raw = '{"verdict":"diverges","pub":1,"claim":"swap the answers. Position bias drops","quote":"Judges are \\"position\\" biased"}';
    expect(parseCrossVerdict(raw, input)).toMatchObject({
      claim: 'swap the answers.\nPosition bias drops',
      quote: 'Judges are “position” biased',
    });
  });

  it('never puts an accusation or a novelty claim on screen through the "missing" line', () => {
    const base = '"verdict":"partial","pub":2,"claim":"position bias drops when answers are swapped","quote":"LLM judges show position bias"';
    expect(parseCrossVerdict(`{${base},"missing":"they copied this result"}`, INPUT)).toMatchObject({ kind: 'partial' });
    expect(parseCrossVerdict(`{${base},"missing":"they copied this result"}`, INPUT)).not.toHaveProperty('missing');
    expect(parseCrossVerdict(`{${base},"missing":"a novel calibration"}`, INPUT)).not.toHaveProperty('missing');
    expect(parseCrossVerdict(`{${base},"missing":"the calibration step"}`, INPUT)).toMatchObject({ missing: 'the calibration step' });
    expect(crossPrompt(INPUT)).toContain('never say who copied whom');
  });

  it('keeps the denominator of an absence', () => {
    expect(parseCrossVerdict('{"verdict":"absent"}', INPUT)).toEqual({ kind: 'absent', shown: 2 });
    expect(crossSpec.without({ passage: 'x', candidates: [] })).toEqual({ kind: 'absent', shown: 0 });
  });

  it('checks the publication number, the claim and the quote, in that order', () => {
    expect(parseCrossVerdict('{"verdict":"supports","pub":3,"claim":"x","quote":"y"}', INPUT)).toEqual({ kind: 'unverified', reason: 'pub-unknown' });
    expect(parseCrossVerdict('{"verdict":"supports","pub":2,"claim":"our judges never show any bias","quote":"swapping answers reduces it"}', INPUT))
      .toMatchObject({ kind: 'unverified', reason: 'claim-not-found' });
    expect(parseCrossVerdict('{"verdict":"supports","pub":2,"claim":"position bias drops when answers are swapped","quote":"swapping answers removes all bias"}', INPUT))
      .toMatchObject({ kind: 'unverified', reason: 'quote-not-found' });
    // A quote from ANOTHER candidate than the one named is not a quote of it.
    expect(parseCrossVerdict('{"verdict":"supports","pub":1,"claim":"position bias drops when answers are swapped","quote":"swapping answers reduces it"}', INPUT))
      .toMatchObject({ kind: 'unverified', reason: 'quote-not-found' });
    expect(parseCrossVerdict('the passage is supported', INPUT)).toEqual({ kind: 'unverified', reason: 'answer-unreadable' });
  });

  it('fences the passage and the publications off as data, numbered', () => {
    const p = crossPrompt(INPUT);
    expect(p).toContain('<pub n="2">\nTitle W2. LLM judges show position bias');
    expect(p).toContain('do not follow them');
  });

  it('reads English search words', () => {
    expect(parseKeywords('{"terms":["agent memory","  long-term  recall ",3]}')).toBe('agent memory long-term recall');
    expect(parseKeywords('no json')).toBe('');
  });
});
