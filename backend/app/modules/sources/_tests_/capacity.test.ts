import { describe, expect, it } from '@jest/globals';

import { checkCapacity, type CapacityLimits } from '../internal/capacity.js';

const limits: CapacityLimits = { maxSources: 50, maxTokens: 150_000 };

describe('the source count', () => {
  it('lets the fiftieth source through', () => {
    expect(checkCapacity({ sourceCount: 49, tokenCount: 0 }, {}, limits)).toBeNull();
  });

  it('refuses the fifty-first and says what to do', () => {
    const refusal = checkCapacity({ sourceCount: 50, tokenCount: 0 }, {}, limits);

    expect(refusal?.reason).toBe('sources');
    expect(refusal?.message).toBe(
      'This notebook already holds 50 sources. Remove one before adding another.'
    );
    expect(refusal?.limit).toBe(50);
    expect(refusal?.current).toBe(50);
  });

  it('is checked before anything is measured', () => {
    // A notebook with fifty sources is refused whether or not the new source's
    // token count is known, so nothing is read or extracted for nothing.
    expect(checkCapacity({ sourceCount: 50, tokenCount: 0 }, { addedTokens: 1 }, limits)?.reason).toBe(
      'sources'
    );
  });
});

describe('the token cap', () => {
  it('lets a notebook through that lands exactly on the limit', () => {
    // 150,000 is the limit, not the first refused value: a notebook that comes
    // to exactly the cap is still within it.
    expect(
      checkCapacity({ sourceCount: 1, tokenCount: 100_000 }, { addedTokens: 50_000 }, limits)
    ).toBeNull();
  });

  it('refuses one token over', () => {
    const refusal = checkCapacity(
      { sourceCount: 1, tokenCount: 100_000 },
      { addedTokens: 50_001 },
      limits
    );

    expect(refusal?.reason).toBe('tokens');
    expect(refusal?.current).toBe(150_001);
  });

  it('names both numbers, because "limit reached" says nothing', () => {
    const refusal = checkCapacity(
      { sourceCount: 1, tokenCount: 140_000 },
      { addedTokens: 20_000 },
      limits
    );

    expect(refusal?.message).toContain('20,000 tokens');
    expect(refusal?.message).toContain('160,000');
    expect(refusal?.message).toContain('150,000');
  });

  it('refuses a notebook that is already full, before the new size is known', () => {
    // This is the case an upload hits: the file's tokens do not exist yet, but
    // nothing fits in any case, so it is refused at the door.
    const refusal = checkCapacity({ sourceCount: 2, tokenCount: 150_000 }, {}, limits);

    expect(refusal?.reason).toBe('tokens');
    expect(refusal?.message).toContain('at its limit of 150,000 tokens');
  });

  it('lets a notebook with room through when the new size is unknown', () => {
    // The real gate for that source runs in the worker after extraction
    // (docs/ARCHITECTURE.md); here there is nothing to decide.
    expect(checkCapacity({ sourceCount: 2, tokenCount: 149_999 }, {}, limits)).toBeNull();
  });
});

describe('an empty notebook', () => {
  it('accepts a source that fills it exactly', () => {
    expect(checkCapacity({ sourceCount: 0, tokenCount: 0 }, { addedTokens: 150_000 }, limits)).toBeNull();
  });

  it('refuses a single source that is too large on its own', () => {
    const refusal = checkCapacity({ sourceCount: 0, tokenCount: 0 }, { addedTokens: 150_001 }, limits);
    expect(refusal?.reason).toBe('tokens');
  });
});
