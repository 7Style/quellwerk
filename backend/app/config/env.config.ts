/**
 * Centralized Environment Configuration
 * =====================================
 *
 * This is the ONLY module that reads `process.env`. Every other config file
 * derives its values from the validated `env` object exported here.
 *
 * Usage:
 *   import { env } from './env.config.js'
 *   const port = env.PORT // typed & validated
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Single dotenv load for the whole application (Prisma CLI loads its own copy
// in prisma.config.ts because it runs as a separate process).
loadDotenv({ quiet: true });

const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(32, { error: `${name} must be at least 32 characters. Generate: openssl rand -hex 32` });

const envSchema = z.object({
  // ---------------------------------------------------------------------------
  // APP
  // ---------------------------------------------------------------------------
  APP_NAME: z.string().default('quellwerk'),
  APP_DESCRIPTION: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3011),
  // Interface the HTTP server binds to. 0.0.0.0 inside Docker networks;
  // 127.0.0.1 with network_mode: host (deployment/prod-native), where a
  // host Nginx is the only public entry point.
  HOST: z.string().min(1).default('0.0.0.0'),
  npm_package_version: z.string().optional(),
  API_URL: z.string().default('http://localhost:3011'),
  FRONTEND_URL: z.string().default('http://localhost:3010'),
  BASE_URL: z.string().optional(),

  // ---------------------------------------------------------------------------
  // DATABASE / REDIS (required)
  // ---------------------------------------------------------------------------
  DATABASE_URL: z.string({ error: 'DATABASE_URL is required' }).min(1),
  REDIS_URL: z.string({ error: 'REDIS_URL is required' }).min(1),

  // ---------------------------------------------------------------------------
  // SECRETS (required, min 32 chars, no fallbacks)
  // ---------------------------------------------------------------------------
  ENCRYPTION_KEY: secret('ENCRYPTION_KEY'),
  JWT_SECRET: secret('JWT_SECRET'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
  // Not consumed since express-session was removed (auth is JWT); optional so
  // that existing .env files keep validating, checked for length when set.
  SESSION_SECRET: secret('SESSION_SECRET').optional(),

  // ---------------------------------------------------------------------------
  // AUTH / JWT
  // ---------------------------------------------------------------------------
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('quellwerk'),
  JWT_AUDIENCE: z.string().default('quellwerk-api'),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(86_400_000),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(16).default(12),

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------
  CORS_ORIGIN: z.string().optional(),

  // ---------------------------------------------------------------------------
  // RATE LIMITING
  // ---------------------------------------------------------------------------
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_2FA_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_TRUSTED_IPS: z.string().optional(),

  // ---------------------------------------------------------------------------
  // LOGGING
  // ---------------------------------------------------------------------------
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_FILE_MAX_SIZE: z.string().default('20m'),
  LOG_FILE_MAX_FILES: z.string().default('14d'),

  // ---------------------------------------------------------------------------
  // UPLOAD
  // ---------------------------------------------------------------------------
  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_MAX_FILE_SIZE: z.coerce.number().int().positive().default(10_485_760),
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,application/pdf'),

  // ---------------------------------------------------------------------------
  // SECURITY
  // ---------------------------------------------------------------------------
  HELMET_CSP_ENABLED: z.stringbool().default(true),
  COMPRESSION_ENABLED: z.stringbool().default(true),
  // Number of proxy hops whose X-Forwarded-For is trusted (Express
  // "trust proxy"). 1 = behind the nginx of deployment/*; 0 = the backend is
  // reached directly, then a client cannot pick its own IP for the rate
  // limits, RATE_LIMIT_TRUSTED_IPS and the audit log.
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  // ---------------------------------------------------------------------------
  // AUDIT
  // ---------------------------------------------------------------------------
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

  // ---------------------------------------------------------------------------
  // EMAIL
  // ---------------------------------------------------------------------------
  EMAIL_PROVIDER: z.enum(['smtp', 'brevo', 'console']).optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  SUPPORT_EMAIL: z.string().optional(),
  EMAIL_LOG_TO_CONSOLE: z.stringbool().default(false),
  EMAIL_PREVIEW: z.stringbool().default(false),
  EMAIL_RATE_LIMIT_PER_USER: z.coerce.number().int().positive().default(10),
  EMAIL_RATE_LIMIT_TOTAL: z.coerce.number().int().positive().default(1000),
  EMAIL_SUBJECT_PASSWORD_RESET: z.string().optional(),
  EMAIL_SUBJECT_EMAIL_VERIFICATION: z.string().optional(),
  EMAIL_SUBJECT_ACCOUNT_LOCKED: z.string().optional(),
  EMAIL_SUBJECT_2FA_CODE: z.string().optional(),
  EMAIL_SUBJECT_OTP_CODE: z.string().optional(),
  EMAIL_SUBJECT_WELCOME: z.string().optional(),
  EMAIL_SUBJECT_2FA_ENABLED: z.string().optional(),
  EMAIL_SUBJECT_2FA_DISABLED: z.string().optional(),
  EMAIL_SUBJECT_CUSTOM: z.string().optional(),

  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Brevo
  BREVO_API_KEY: z.string().optional(),
  BREVO_API_URL: z.string().default('https://api.brevo.com/v3'),
  BREVO_SENDER_NAME: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().optional(),
  BREVO_TEMPLATE_PASSWORD_RESET: z.coerce.number().int().default(1),
  BREVO_TEMPLATE_EMAIL_VERIFY: z.coerce.number().int().default(2),
  BREVO_TEMPLATE_ACCOUNT_LOCKED: z.coerce.number().int().default(3),
  BREVO_TEMPLATE_2FA: z.coerce.number().int().default(4),
  BREVO_TEMPLATE_WELCOME: z.coerce.number().int().default(5),
  BREVO_TEMPLATE_2FA_ENABLED: z.coerce.number().int().default(6),
  BREVO_TEMPLATE_2FA_DISABLED: z.coerce.number().int().default(7),

  // ---------------------------------------------------------------------------
  // SEEDS (prisma db seed)
  // ---------------------------------------------------------------------------
  SEED_ADMIN_EMAIL: z.string().default('admin@quellwerk.local'),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_DEMO_USERS: z.stringbool().default(false),
  SEED_DEMO_PASSWORD: z.string().min(12).optional(),
});

// An empty value counts as "not set": dotenv keeps `SEED_ADMIN_PASSWORD=` from
// example.env as '' and docker compose passes `${VAR:-}` as '' when the
// variable is missing in .env. Without this, optional variables with a minimum
// length would fail validation and defaults would never apply.
const definedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== '')
);

const parsed = envSchema.safeParse(definedEnv);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

/**
 * Validated environment variables. Use this instead of `process.env`.
 */
export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;
