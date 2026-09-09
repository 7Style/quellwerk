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

  /** Strict limit for authentication endpoints (login, register, OTP) */
  auth: {
    ...base,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_LOGIN_MAX,
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
  },

  /** Per-user API limit for authenticated modules */
  api: {
    ...base,
    windowMs: 60 * 1000,
    limit: 60,
    message: 'API rate limit exceeded, please slow down your requests.',
    keyGenerator: ipAndUserKeyGenerator,
  },

  /** File uploads */
  upload: {
    ...base,
    windowMs: 10 * 60 * 1000,
    limit: 10,
    message: 'Upload limit exceeded, please try again later.',
    keyGenerator: ipAndUserKeyGenerator,
  },

  /** Password reset requests */
  passwordReset: {
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: 3,
    message: 'Too many password reset requests, please try again later.',
  },

  /** 2FA verification attempts */
  twoFactor: {
    ...base,
    windowMs: 5 * 60 * 1000,
    limit: env.RATE_LIMIT_2FA_MAX,
    message:
      'Too many 2FA verification attempts. Your account has been temporarily locked for security reasons.',
    skipSuccessfulRequests: true,
  },

  /** Public user registration / OTP user creation */
  registration: {
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message: 'Too many registration attempts, please try again later.',
  },
} satisfies Record<string, Partial<Options>>;
