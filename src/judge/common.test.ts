import { describe, expect, it } from 'vitest';
import { clip, findExact, firstJsonObject, inferText, isExactQuote, isFatal, MIN_QUOTE_WORDS, modelAnswer, ModelRefused } from './common';

const SOURCE = 'We study memory for agents.  It is “hard” to keep\nfacts across sessions without a store.';

describe('exact quotes', () => {
  it('accepts a quote copied word for word, spaces and quote marks aside', () => {
    expect(isExactQuote(SOURCE, 'It is "hard" to keep facts across sessions')).toBe(true);
  });

  it('gives back the source\'s own words, not the model\'s copy of them', () => {
    // The model swapped the curly quotes and the line break: the screen shows the source.
    expect(findExact(SOURCE, 'It is "hard" to keep facts across sessions')).toBe('It is “hard” to keep\nfacts across sessions');
    expect(findExact(SOURCE, 'It is difficult to keep facts')).toBeNull();
  });

  it('refuses a reworded quote, and one too short to prove anything', () => {
    expect(isExactQuote(SOURCE, 'It is difficult to keep facts across sessions')).toBe(false);
    expect(isExactQuote(SOURCE, 'memory for agents')).toBe(false);
    expect(MIN_QUOTE_WORDS).toBe(4);
  });
});

describe('model answers', () => {
  it('reads the first JSON object, even inside prose or a code fence', () => {
    expect(firstJsonObject('Sure! ```json\n{"verdict":"none"}\n``` done')).toEqual({ verdict: 'none' });
    expect(firstJsonObject('{"quote":"a } inside","n":1} {"x":2}')).toEqual({ quote: 'a } inside', n: 1 });
  });

  it('gives null for no object or a broken one, and finds an object inside an array', () => {
    expect(firstJsonObject('none of the topics')).toBeNull();
    expect(firstJsonObject('{"verdict": none}')).toBeNull();
    expect(firstJsonObject('[{"a":1}]')).toEqual({ a: 1 });
  });

  it('unwraps the envelopes providers use', () => {
    expect(inferText('plain')).toBe('plain');
    expect(inferText({ text: 'a' })).toBe('a');
    expect(inferText({ data: { response: 'b' } })).toBe('b');
    expect(inferText({ nothing: 1 })).toBe('');
  });

  it('turns a host refusal into an error that says whether a next call could succeed', () => {
    expect(() => modelAnswer({ success: false, error: 'used up', errorCode: 'CLOUD_QUOTA_EXHAUSTED' })).toThrow('used up');
    let caught: unknown;
    try { modelAnswer({ success: false, errorCode: 'CLOUD_TIMEOUT' }); } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(ModelRefused);
    expect(isFatal(caught)).toBe(false);
    expect(isFatal(new ModelRefused('CLOUD_AUTH_FAILED', 'key'))).toBe(true);
    expect(modelAnswer({ success: true, data: { text: 'ok' } })).toBe('ok');
  });

  it('cuts a long source at a word boundary', () => {
    expect(clip('one two three four', 9)).toBe('one two');
  });
});
