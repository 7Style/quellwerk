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

/**
 * Key generator: IP (IPv6 masked to /56 by ipKeyGenerator) plus user id when
 * the request is authenticated, so logged-in users do not share a bucket with
 * anonymous traffic from the same address.
 */
export const ipAndUserKeyGenerator: Options['keyGenerator'] = (req) => {
  const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const userId = req.user?.id ?? 'anonymous';
  return `${ip}:${userId}`;
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
    keyGenerator: ipAndUserKeyGenerator,
    passOnStoreError: true,
  },

  /** Chat turns per session (SECURITY.md 7.3) */
  chatPerSession: {
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_CHAT_PER_SESSION,
    message: 'Too many questions in this hour. The limit resets on the hour.',
  },

  /** Chat turns per IP, the outer bound when many sessions share one address */
  chatPerIp: {
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_CHAT_PER_IP,
    message: 'Too many questions from this address in this hour.',
  },

  /** Reports, mind maps and audio overviews per session */
  artifacts: {
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_ARTIFACTS_PER_SESSION,
    message: 'Too many artifacts in this hour. The limit resets on the hour.',
  },

  /** Sources added per session */
  sources: {
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: env.RATE_LIMIT_SOURCES_PER_SESSION,
    message: 'Too many sources added in this hour. The limit resets on the hour.',
  },

} satisfies Record<string, Partial<Options>>;
