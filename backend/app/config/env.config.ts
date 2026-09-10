/**
 * Centralized environment configuration.
 *
 * This is the ONLY module that reads `process.env`. Every other config file
 * derives its values from the validated `env` object exported here.
 *
 * Required without a fallback (SECURITY.md 7.1): SESSION_SECRET,
 * ANTHROPIC_API_KEY, ADMIN_TOKEN, DATABASE_URL, REDIS_URL. Without them the
 * backend does not start, which is the point: a demo that runs with a missing
 * secret is a demo that runs with a wrong one.
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Single dotenv load for the whole application (the Prisma CLI loads its own
// copy in prisma.config.ts because it runs as a separate process).
loadDotenv({ quiet: true });

const secret = (name: string, min = 32) =>
  z
    .string({ error: `${name} is required` })
    .min(min, { error: `${name} must be at least ${min} characters. Generate: openssl rand -hex 32` });

const envSchema = z.object({
  // ---------------------------------------------------------------------------
  // APP
  // ---------------------------------------------------------------------------
  APP_NAME: z.string().default('Quellwerk'),
  APP_DESCRIPTION: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3011),
  HOST: z.string().min(1).default('0.0.0.0'),
  API_URL: z.string().default('http://localhost:3011'),
  FRONTEND_URL: z.string().default('http://localhost:3010'),
  BASE_URL: z.string().optional(),
  PUBLIC_URL: z.string().optional(),

  // ---------------------------------------------------------------------------
  // DATA STORES (required)
  // ---------------------------------------------------------------------------
  DATABASE_URL: z.string({ error: 'DATABASE_URL is required' }).min(1),
  REDIS_URL: z.string({ error: 'REDIS_URL is required' }).min(1),

  // ---------------------------------------------------------------------------
  // SECRETS (required, never a fallback in code)
  // ---------------------------------------------------------------------------
  SESSION_SECRET: secret('SESSION_SECRET'),
  ANTHROPIC_API_KEY: z.string({ error: 'ANTHROPIC_API_KEY is required' }).min(1),
  ADMIN_TOKEN: secret('ADMIN_TOKEN', 16),
  // Optional: only the audio overview needs it, and that milestone is optional.
  GEMINI_API_KEY: z.string().optional(),

  // ---------------------------------------------------------------------------
  // SESSION (anonymous, no accounts; ADR-0005)
  // ---------------------------------------------------------------------------
  SESSION_COOKIE_NAME: z.string().default('qw.sid'),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(2_592_000_000),

  // ---------------------------------------------------------------------------
  // MODELS (ADR-0011). Ids live here and nowhere else in the code.
  // ---------------------------------------------------------------------------
  MODEL_CHAT: z.string().default('claude-opus-5'),
  MODEL_FAST: z.string().default('claude-haiku-4-5'),
  MODEL_JUDGE: z.string().default('claude-sonnet-5'),
  EFFORT_CHAT: z.enum(['low', 'medium', 'high']).default('low'),

  // ---------------------------------------------------------------------------
  // BUDGET. Cents here, micro-cents in usage_log: the comparison multiplies the
  // cap by 1_000_000 rather than dividing the sum (docs/ARCHITECTURE.md).
  // ---------------------------------------------------------------------------
  DAILY_SPEND_CAP_CENTS: z.coerce.number().int().positive().default(500),
  EVAL_SPEND_CAP_CENTS: z.coerce.number().int().positive().default(1000),
  // Answers come from recorded fixtures instead of the API; keeps the demo alive
  // when the key is missing or the budget is spent.
  DEMO_OFFLINE: z.stringbool().default(false),

  // ---------------------------------------------------------------------------
  // CAPS (docs/SPEC.md, "Zahlen")
  // ---------------------------------------------------------------------------
  MAX_SOURCES_PER_NOTEBOOK: z.coerce.number().int().positive().default(50),
  MAX_TOKENS_PER_NOTEBOOK: z.coerce.number().int().positive().default(150_000),
  MAX_QUESTION_CHARS: z.coerce.number().int().positive().default(4_000),
  RETENTION_DAYS: z.coerce.number().int().positive().default(7),

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------
  CORS_ORIGIN: z.string().optional(),

  // ---------------------------------------------------------------------------
  // RATE LIMITS (SECURITY.md 7.3)
  // ---------------------------------------------------------------------------
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_CHAT_PER_SESSION: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_CHAT_PER_IP: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_ARTIFACTS_PER_SESSION: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SOURCES_PER_SESSION: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_TRUSTED_IPS: z.string().optional(),

  // ---------------------------------------------------------------------------
  // LOGGING
  // ---------------------------------------------------------------------------
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_FILE_MAX_SIZE: z.string().default('20m'),
  LOG_FILE_MAX_FILES: z.string().default('14d'),

  // ---------------------------------------------------------------------------
  // UPLOADS (SECURITY.md 7.4)
  // ---------------------------------------------------------------------------
  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_MAX_FILE_SIZE: z.coerce.number().int().positive().default(20_971_520),
  UPLOAD_ALLOWED_TYPES: z
    .string()
    .default(
      'application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------
  HELMET_CSP_ENABLED: z.stringbool().default(true),
  COMPRESSION_ENABLED: z.stringbool().default(true),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  // ---------------------------------------------------------------------------
  // SEED (prisma db seed)
  // ---------------------------------------------------------------------------
  SEED_ON_START: z.stringbool().default(false),
});

// An empty value counts as "not set": dotenv keeps `VAR=` from example.env as ''
// and docker compose passes `${VAR:-}` as '' when the variable is missing.
// Without this, optional variables with a minimum length would fail validation
// and defaults would never apply.
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
