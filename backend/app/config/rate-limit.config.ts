import { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env } from './env.config.js';

const trustedIps = new Set(
  (env.RATE_LIMIT_TRUSTED_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
);

/**
 * Skip rate limiting for trusted IPs (e.g. monitoring services).
 */
export const skipTrustedIps: Options['skip'] = (req) => {
  const clientIp = req.ip ?? req.socket.remoteAddress;
  return clientIp !== undefined && trustedIps.has(clientIp);
};

/** Address alone, IPv6 masked to /56. The key nothing a caller sends can change. */
export const ipKey: Options['keyGenerator'] = (req) =>
  ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown');

/**
 * True when the request arrived with our session cookie.
 *
 * express-session mints a fresh `req.session.id` for every request that has no
 * valid cookie, so the id alone says nothing about who is asking. Measured: five
 * requests without a cookie produced five session ids and five Redis keys. A
 * limiter keyed on that id gives every one of them its own bucket, which is the
 * opposite of a limit.
 *
 * Reading the raw header rather than a parsed cookie because there is no
 * cookie-parser in the chain; the presence of the name is all that is needed,
 * and a forged value only costs the forger their own bucket.
 */
function carriedSessionCookie(req: { headers: { cookie?: string } }): boolean {
  return req.headers.cookie?.includes(`${env.SESSION_COOKIE_NAME}=`) ?? false;
}

/**
 * IP plus the anonymous session, so two people behind one address do not share
 * a bucket - but only when the session came back in a cookie. A caller who
 * discards the cookie is counted by address alone, which is the strict side and
 * the right way round for a limiter.
 *
 * For the per-session limits from SECURITY.md 7.3 (chat, artifacts, sources).
 * The general limiter uses `ipKey`: adding a session there buys nothing an
 * attacker cannot take away.
 */
export const ipAndSessionKeyGenerator: Options['keyGenerator'] = (req) => {
  const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const sessionId = carriedSessionCookie(req) ? (req.session?.id ?? 'none') : 'no-cookie';
  return `${ip}:${sessionId}`;
};

const base = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipTrustedIps,
} satisfies Partial<Options>;

export const rateLimitConfig = {
  /** General limit for all routes (fails open when the Redis store is down) */
  default: {
    ...base,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests from this IP, please try again later.',
    // Address only. A session id is minted per request for anyone without a
    // cookie, so keying on it would hand every cookieless request its own
    // bucket and the limiter would never fire.
    keyGenerator: ipKey,
    passOnStoreError: true,
  },

  /** Chat turns per session (SECURITY.md 7.3) */
  chatPerSession: {
    ...base,
    keyGenerator: ipAndSessionKeyGenerator,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_CHAT_PER_SESSION,
    message: 'Too many questions in this hour. The limit resets on the hour.',
  },

  /** Chat turns per IP, the outer bound when many sessions share one address */
  chatPerIp: {
    ...base,
    keyGenerator: ipKey,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_CHAT_PER_IP,
    message: 'Too many questions from this address in this hour.',
  },

  /** Reports, mind maps and audio overviews per session */
  artifacts: {
    ...base,
    keyGenerator: ipAndSessionKeyGenerator,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_ARTIFACTS_PER_SESSION,
    message: 'Too many artifacts in this hour. The limit resets on the hour.',
  },

  /** Sources added per session */
  sources: {
    ...base,
    keyGenerator: ipAndSessionKeyGenerator,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_SOURCES_PER_SESSION,
    message: 'Too many sources added in this hour. The limit resets on the hour.',
  },

} satisfies Record<string, Partial<Options>>;
