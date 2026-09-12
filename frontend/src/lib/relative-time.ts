/**
 * "2 hours ago", "yesterday", "just now".
 *
 * Written out rather than taken from Intl.RelativeTimeFormat, which says "1 day
 * ago" where the prototype says "yesterday" and which needs a locale the rest of
 * the interface does not have. The interface is English (docs/SPEC.md), so this
 * is one function and not a formatting layer.
 *
 * Server and browser compute it from their own clocks, milliseconds apart. The
 * steps below are minutes and coarser, so the two agree except exactly on a
 * boundary; the `<time>` elements that render it carry `suppressHydrationWarning`
 * for that one case, because a warning there would be about the clock and not
 * about the markup.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const elapsed = now - then;
  // A clock that is a little behind must not produce "in 3 minutes" on a
  // timestamp the server wrote a moment ago.
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(then).toISOString().slice(0, 10);
}
