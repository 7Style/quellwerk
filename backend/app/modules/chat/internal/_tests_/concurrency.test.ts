/**
 * The gate that the hourly limiter cannot be: thirty turns per hour are thirty
 * turns in the same second as far as it is concerned.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';

import { claimTurn, MAX_CONCURRENT_TURNS, resetTurnsInFlight } from '../concurrency.js';

beforeEach(() => {
  resetTurnsInFlight();
});

describe('claimTurn', () => {
  it('lets a session open as many turns as the limit allows', () => {
    for (let turn = 0; turn < MAX_CONCURRENT_TURNS; turn += 1) {
      expect(claimTurn('session-a')).not.toBeNull();
    }
  });

  it('refuses the one after that', () => {
    for (let turn = 0; turn < MAX_CONCURRENT_TURNS; turn += 1) claimTurn('session-a');

    expect(claimTurn('session-a')).toBeNull();
  });

  it('counts per session, not globally', () => {
    for (let turn = 0; turn < MAX_CONCURRENT_TURNS; turn += 1) claimTurn('session-a');

    expect(claimTurn('session-b')).not.toBeNull();
  });

  it('frees the slot when the turn ends', () => {
    const releases = Array.from({ length: MAX_CONCURRENT_TURNS }, () => claimTurn('session-a'));
    expect(claimTurn('session-a')).toBeNull();

    releases[0]?.();

    expect(claimTurn('session-a')).not.toBeNull();
  });

  it('does not free two slots when the same release runs twice', () => {
    // It runs from `res.on('close')` and from the end of the turn, and on a
    // normal turn both happen. A release that counted down twice would hand out
    // a slot nobody gave back.
    const first = claimTurn('session-a');
    claimTurn('session-a');
    expect(claimTurn('session-a')).toBeNull();

    first?.();
    first?.();

    expect(claimTurn('session-a')).not.toBeNull();
    expect(claimTurn('session-a')).toBeNull();
  });
});
