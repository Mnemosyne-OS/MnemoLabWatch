import { describe, expect, it } from 'vitest';
import { formatDay, formatLocalDay } from './format';

const pad = (n: number) => String(n).padStart(2, '0');

describe('dates', () => {
  it('shows a source day as that calendar day, in any time zone', () => {
    expect(formatDay('fr', '2026-10-21')).toBe('21/10/2026');
  });

  it('shows the pick-up instant on the LOCAL day, never its UTC day', () => {
    // 02:27 UTC on the 29th is still the 28th at 22:27 in UTC−4. This only
    // tells the two apart on a machine away from UTC, which is where it bit.
    const iso = '2026-10-29T02:27:00.000Z';
    const d = new Date(iso);
    expect(formatLocalDay('fr', iso)).toBe(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`);
  });

  it('leaves an unreadable value as it is', () => {
    expect(formatDay('fr', 'soon')).toBe('soon');
    expect(formatLocalDay('fr', 'soon')).toBe('soon');
  });
});
