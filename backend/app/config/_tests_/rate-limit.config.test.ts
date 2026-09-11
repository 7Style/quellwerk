/**
 * The key a limiter counts on.
 *
 * This file exists because of a finding that only a running stack made visible:
 * five requests without a cookie produced five session ids and therefore five
 * separate buckets. A limiter keyed that way never fires.
 */
import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';

import { ipAndSessionKeyGenerator, ipKey, rateLimitConfig } from '../rate-limit.config.js';
import { env } from '../env.config.js';

function requestFrom(options: { ip?: string; cookie?: string; sessionId?: string }): Request {
  return {
    ip: options.ip ?? '203.0.113.7',
    socket: { remoteAddress: options.ip ?? '203.0.113.7' },
    headers: options.cookie ? { cookie: options.cookie } : {},
    session: options.sessionId ? { id: options.sessionId } : undefined,
  } as unknown as Request;
}

const withCookie = (sessionId: string) =>
  requestFrom({ cookie: `${env.SESSION_COOKIE_NAME}=s%3A${sessionId}.sig`, sessionId });

describe('the general limiter', () => {
  it('counts by address alone', async () => {
    // express-session mints a fresh id for every request without a cookie, so a
    // key that carried it would hand each of them its own bucket.
    const generator = rateLimitConfig.default.keyGenerator;
    expect(generator).toBe(ipKey);

    const first = await generator?.(requestFrom({ sessionId: 'fresh-1' }), undefined as never);
    const second = await generator?.(requestFrom({ sessionId: 'fresh-2' }), undefined as never);

    expect(first).toBe(second);
  });
});

describe('the per-session key', () => {
  it('separates two sessions that both sent their cookie', async () => {
    const a = await ipAndSessionKeyGenerator?.(withCookie('aaa'), undefined as never);
    const b = await ipAndSessionKeyGenerator?.(withCookie('bbb'), undefined as never);

    expect(a).not.toBe(b);
  });

  it('puts every cookieless caller from one address in the same bucket', async () => {
    // The attack the finding described: discard the cookie and get a new bucket
    // for every request. Without a cookie the session part is a constant, so
    // the address is the whole key and the limit holds.
    const first = await ipAndSessionKeyGenerator?.(
      requestFrom({ sessionId: 'minted-1' }),
      undefined as never
    );
    const second = await ipAndSessionKeyGenerator?.(
      requestFrom({ sessionId: 'minted-2' }),
      undefined as never
    );

    expect(first).toBe(second);
    expect(first).toContain('no-cookie');
  });

  it('does not let a forged cookie escape its own address', async () => {
    const forged = await ipAndSessionKeyGenerator?.(
      requestFrom({ cookie: `${env.SESSION_COOKIE_NAME}=nonsense`, sessionId: 'minted' }),
      undefined as never
    );
    expect(String(forged)).toContain('203.0.113.7');
  });

  it('keeps two addresses apart even with the same session id', async () => {
    const here = await ipAndSessionKeyGenerator?.(
      { ...withCookie('same'), ip: '198.51.100.1' } as unknown as Request,
      undefined as never
    );
    const there = await ipAndSessionKeyGenerator?.(withCookie('same'), undefined as never);

    expect(here).not.toBe(there);
  });
});

describe('the limits from SECURITY.md 7.3', () => {
  it('are all mounted on a key, not on the default', () => {
    // A per-session limit with the default key would count by address and the
    // numbers in the spec would mean something else.
    for (const name of ['chatPerSession', 'artifacts', 'sources'] as const) {
      expect(rateLimitConfig[name].keyGenerator).toBe(ipAndSessionKeyGenerator);
    }
    expect(rateLimitConfig.chatPerIp.keyGenerator).toBe(ipKey);
  });

  it('carry the numbers the spec names', () => {
    expect(rateLimitConfig.chatPerSession.limit).toBe(env.RATE_LIMIT_CHAT_PER_SESSION);
    expect(rateLimitConfig.chatPerIp.limit).toBe(env.RATE_LIMIT_CHAT_PER_IP);
    expect(rateLimitConfig.sources.limit).toBe(env.RATE_LIMIT_SOURCES_PER_SESSION);
    expect(rateLimitConfig.artifacts.limit).toBe(env.RATE_LIMIT_ARTIFACTS_PER_SESSION);
  });
});
