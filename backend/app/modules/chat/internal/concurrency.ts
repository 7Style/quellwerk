/**
 * How many turns one session may have open at the same time.
 *
 * The rate limiter counts turns per hour and the budget guard reads what has
 * been spent so far, and neither of them sees a burst. The budget row for a turn
 * is written when the turn ends, so thirty streams opened in the same second all
 * read the same old total, all pass, and all run with a full notebook in
 * context. An hourly limit of thirty is not a limit at all against a script that
 * uses it all at once.
 *
 * Two, because a person with the tab open twice is a person, and a third
 * simultaneous turn from one session is a script. In memory and per process:
 * the API runs as one container (docs/ARCHITECTURE.md), and a Redis round trip
 * on a path that already holds a socket open buys nothing here.
 */
const inFlight = new Map<string, number>();

export const MAX_CONCURRENT_TURNS = 2;

/** Claims a slot, or returns null when the session is already at the limit. */
export function claimTurn(sessionId: string): (() => void) | null {
  const open = inFlight.get(sessionId) ?? 0;
  if (open >= MAX_CONCURRENT_TURNS) return null;

  inFlight.set(sessionId, open + 1);

  let released = false;
  return () => {
    // Idempotent: the release runs from `res.on('close')` and from the end of
    // the turn, and whichever comes second must not count the slot down twice.
    if (released) return;
    released = true;

    const now = (inFlight.get(sessionId) ?? 1) - 1;
    if (now <= 0) inFlight.delete(sessionId);
    else inFlight.set(sessionId, now);
  };
}

/** For tests. The map is process-wide state and a test must not inherit it. */
export function resetTurnsInFlight(): void {
  inFlight.clear();
}
