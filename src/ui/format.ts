/**
 * format — dates as the person reads them, in the app's language.
 *
 * A source day (`2026-10-21`) is a calendar day, not an instant: it is shown
 * in UTC so a reader west of Greenwich never sees the day before.
 */
import type { Lang } from '../i18n/strings';

/** `2026-10-21` → `21/10/2026` (fr), `10/21/2026` (en). Unreadable stays as it is. */
export function formatDay(lang: Lang, day: string): string {
  const t = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return day;
  return new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(t);
}

/** The local calendar day of an instant (`2026-10-29T02:27:00Z` is the 28th at 22:27 in UTC−4). */
export function formatLocalDay(lang: Lang, iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(t);
}

/** Credits in dollars, four decimals: a reading costs fractions of a cent. */
export function formatUsd(lang: Lang, usd: number): string {
  return `${usd.toLocaleString(lang, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} $`;
}

/** An instant (the watch's last pass), in local time. */
export function formatMoment(lang: Lang, iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(t);
}
