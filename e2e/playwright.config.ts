import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Optional e2e/.env (copy of e2e/.env.example): BASE_URL and the seed
// variables the fixtures read. Node's built-in loader, no dotenv dependency;
// variables already present in the environment win.
const envFile = path.resolve(__dirname, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/**
 * Playwright configuration for the quellwerk E2E tests
 * @see https://playwright.dev/docs/test-configuration
 *
 * The suite runs on ONE worker, files and tests in order: the backend's login
 * limiter allows RATE_LIMIT_LOGIN_MAX (default 5) failed logins per 15 minutes
 * and IP, and parallel workers share that IP. Each auth spec file keeps a
 * budget of at most 4 failed logins and configures its tests as serial.
 * See e2e/.env.example for RATE_LIMIT_LOGIN_MAX / RATE_LIMIT_TRUSTED_IPS.
 */
export default defineConfig({
  testDir: './tests',

  /* One test at a time; parallel workers would share the login limiter */
  fullyParallel: false,
  workers: 1,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* One retry on CI. A retry re-runs a whole serial group, so CI raises
     RATE_LIMIT_LOGIN_MAX for the stack under test (.github/workflows/ci.yml). */
  retries: process.env.CI ? 1 : 0,

  /* Reporter to use */
  reporter: [['html', { open: 'never' }], ['list']],

  /* Shared settings for all projects */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.BASE_URL || 'http://localhost:3010',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Timeout settings */
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
});
