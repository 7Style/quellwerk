/**
 * The only authorisation the chat route has.
 *
 * `loadSources` reaches into Prisma and is not unit tested; the decision it
 * makes is pure and is, so that a regression in it fails a run rather than a
 * demo. docs/SPEC.md: a notebook belongs to exactly one session, and the demo
 * notebook is the single exception - readable by everyone, writable by nobody
 * until copy-on-first-write in M7.
 */
import { describe, expect, it } from '@jest/globals';

import { chatAccess } from '../chat.js';

const OWN = 'session-a';
const OTHER = 'session-b';

describe('chatAccess', () => {
  it('lets a session into its own notebook', () => {
    expect(chatAccess({ sessionId: OWN, isDemo: false }, OWN)).toEqual({
      allowed: true,
      shared: false,
    });
  });

  it('does not let a session into someone else notebook', () => {
    // 404 rather than 403 at the route: a notebook of another session does not
    // exist as far as this session is concerned.
    expect(chatAccess({ sessionId: OTHER, isDemo: false }, OWN)).toEqual({ allowed: false });
  });

  it('treats a notebook that does not exist the same way', () => {
    expect(chatAccess(null, OWN)).toEqual({ allowed: false });
  });

  it('refuses a notebook with no session at all', () => {
    // Nullable in the schema. A row without a session belongs to nobody, and
    // "nobody" must not match a caller who also has no session id.
    expect(chatAccess({ sessionId: null, isDemo: false }, OWN)).toEqual({ allowed: false });
  });

  it('lets everyone into the demo notebook and marks it shared', () => {
    expect(chatAccess({ sessionId: OTHER, isDemo: true }, OWN)).toEqual({
      allowed: true,
      shared: true,
    });
  });

  it('marks the demo notebook shared even for the session that owns it', () => {
    // Shared is about the notebook, not about the caller. The seed session
    // owning it must not be able to write a history everyone else then reads.
    expect(chatAccess({ sessionId: OWN, isDemo: true }, OWN)).toEqual({
      allowed: true,
      shared: true,
    });
  });
});
