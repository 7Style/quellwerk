import type { CorsOptions, CorsOptionsDelegate } from 'cors';
import type { Request } from 'express';
import { env } from './env.config.js';

// Allowed origins from environment variable (comma separated)
const envOrigins = (env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Local development origins (frontend dev server, compose port, legacy ports)
const developmentOrigins =
  env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:3010', 'http://localhost:7000', 'http://localhost:7001']
    : [];

// Combine and deduplicate. There is deliberately no "allow everything in
// development" bypass: only listed origins are accepted.
const allowedOrigins = new Set([...envOrigins, ...developmentOrigins]);

export const corsConfig: CorsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin header (curl, server-to-server) are allowed
    // but never with credentials (see `credentials` below).
    if (!origin) {
      callback(null, true);
      return;
    }

    // Unlisted origins get the response without any Access-Control-* header
    // (the browser blocks it). Passing an Error here would turn every
    // cross-origin probe and every monitor that sends an Origin header into
    // a logged 500, including /health and preflights.
    callback(null, allowedOrigins.has(origin));
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-API-Version',
    'Accept-Language',
  ],

  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Current-Page', 'X-Per-Page'],

  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * Per-request options: credentials are only offered to requests that carry an
 * Origin header from the allowlist. Requests without Origin (curl, server to
 * server) are served without credentials.
 */
export const corsOptionsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin;
  callback(null, {
    ...corsConfig,
    credentials: typeof origin === 'string' && allowedOrigins.has(origin),
  });
};

export const corsAllowedOrigins = [...allowedOrigins];
