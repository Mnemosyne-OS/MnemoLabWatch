import { describe, expect, it } from 'vitest';
import { translate, WRITTEN } from './strings';

describe('strings', () => {
  const keys = Object.keys(WRITTEN.en);

  it('writes every key in fr and es', () => {
    for (const lang of ['fr', 'es'] as const) {
      expect(keys.filter((k) => !(k in WRITTEN[lang])), lang).toEqual([]);
    }
  });

  it('keeps every placeholder in every written language', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of keys) {
      const en = vars((WRITTEN.en as Record<string, string>)[k]!);
      for (const lang of ['fr', 'es'] as const) {
        expect(vars((WRITTEN[lang] as Record<string, string>)[k]!), `${lang} ${k}`).toBe(en);
      }
    }
  });

  it('never words a verdict as an accusation or a novelty (doc 187 §9)', () => {
    const banned = /plagia|copi[ée]|cop(y|ied)\b|\bfa(ux|lse|lso)\b|in[ée]dit|unprecedented|\bnouveau|\bnovel\b|\bnuevo/i;
    for (const lang of ['en', 'fr', 'es'] as const) {
      const dict = WRITTEN[lang] as Record<string, string>;
      for (const k of keys.filter((x) => x.startsWith('cross.') || x.startsWith('verdict.'))) {
        expect(dict[k], `${lang} ${k}`).not.toMatch(banned);
      }
    }
  });

  it('falls back to English and leaves an unknown placeholder visible', () => {
    expect(translate('de', 'card.seen')).toBe('Seen');
    expect(translate('en', 'list.count', {})).toContain('{n}');
  });
});
