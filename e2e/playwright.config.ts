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
 * One worker for now: the specs that arrive in M4 drive a single stack and the
 * chat route is rate limited per session.
 */
export default defineConfig({
  testDir: './tests',

  /* One test at a time; the chat route is rate limited per session */
  fullyParallel: false,
  workers: 1,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* One retry on CI. */
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
