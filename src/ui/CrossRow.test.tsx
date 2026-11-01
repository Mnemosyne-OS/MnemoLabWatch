import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { translate } from '../i18n/strings';
import type { Crossing, CrossingRow } from '../research/crossing';
import { CrossRow } from './CrossRow';

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);
const crossing = (works: Crossing['works']): Pick<Crossing, 'works' | 'loaded'> => ({ works, loaded: 93 });

describe('a crossed passage on screen', () => {
  it('marks the researcher\'s sentence even when it runs over a line break, as a draft cut at 80 columns does', () => {
    const row: CrossingRow = {
      passage: { n: 3, text: 'We swap the answers before grading.\nPosition bias drops when the answers are\nswapped, in every round.' },
      verdict: { kind: 'supports', work: 'W1', claim: 'Position bias drops when the answers are\nswapped', quote: 'swapping answers reduces it' },
    };
    const { container } = render(<CrossRow row={row} crossing={crossing({ W1: { id: 'W1', lab: 'meta', title: 'Judges', url: 'u' } })} lang="en" t={t} onOpen={vi.fn()} />);
    expect(container.querySelector('mark')?.textContent).toBe('Position bias drops when the answers are\nswapped');
  });

  it('says a licence OpenAlex did not give is not given, never a guessed one', () => {
    const row: CrossingRow = { passage: { n: 1, text: 'x x x x x' }, verdict: { kind: 'supports', work: 'W1', claim: 'x x x x', quote: 'q q q q' } };
    render(<CrossRow row={row} crossing={crossing({ W1: { id: 'W1', lab: 'anthropic', title: 'T', url: 'u' } })} lang="en" t={t} onOpen={vi.fn()} />);
    expect(screen.getByText('Licence not given by OpenAlex')).toBeInTheDocument();
    expect(screen.queryByText(/Licence: /)).not.toBeInTheDocument();
  });

  it('says when no loaded publication shares a word with the passage, and the denominator otherwise', () => {
    const none: CrossingRow = { passage: { n: 1, text: 'zzzz qqqq' }, verdict: { kind: 'absent', shown: 0 } };
    const { rerender } = render(<CrossRow row={none} crossing={crossing({})} lang="en" t={t} onOpen={vi.fn()} />);
    expect(screen.getByText('Absent: no loaded publication shares its words')).toBeInTheDocument();
    rerender(<CrossRow row={{ ...none, verdict: { kind: 'absent', shown: 5 } }} crossing={crossing({})} lang="en" t={t} onOpen={vi.fn()} />);
    expect(screen.getByText('Absent: nothing among the 5 publications closest by their words, out of 93 loaded')).toBeInTheDocument();
  });
});
