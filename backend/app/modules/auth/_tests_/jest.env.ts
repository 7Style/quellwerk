/**
 * Test defaults for the variables env.config.ts requires (Jest `setupFiles`,
 * runs before any module is imported). Values already present, e.g. the
 * throwaway secrets CI generates per run or a local backend/.env, win; the
 * defaults only make the unit tests runnable on a fresh clone. No test opens
 * a real database or Redis connection.
 */
function setDefault(name: string, value: string): void {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

setDefault('NODE_ENV', 'test');
setDefault('DATABASE_URL', 'postgresql://test:test@127.0.0.1:5432/bp_monolith_test');
setDefault('REDIS_URL', 'redis://:test@127.0.0.1:6379');
setDefault('JWT_SECRET', 'jest-only-jwt-secret-0123456789abcdef0123456789');
setDefault('JWT_REFRESH_SECRET', 'jest-only-refresh-secret-0123456789abcdef01234');
setDefault('ENCRYPTION_KEY', 'jest-only-encryption-key-0123456789abcdef0123');
