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
 * Two ways to run, and the environment decides which.
 *
 * BASE_URL set: test that server. This is what CI does - it builds the images,
 * starts the compose stack and points the specs at the frontend container, so
 * the run measures what would be deployed.
 *
 * BASE_URL unset: Playwright starts the frontend's own production build on a
 * port of its own. The UI specs under tests/ui run on fixtures and need no
 * backend (docs/PLAN.md, M4), so `next build && playwright test` is a complete
 * command from a clean checkout. The port is not 3010 on purpose: reusing the
 * stack's port would silently test whatever container happens to be running,
 * including one built from an older tree.
 */
const externalBaseUrl = process.env.BASE_URL;
const uiPort = Number(process.env.UI_PORT ?? 3015);
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${uiPort}`;

/**
 * The same build, once with the state catalogue open and once without.
 *
 * `/dev/states` is gated on DEV_STATES at request time, and both halves of that
 * claim are worth a test: the catalogue is reachable, and the server that does
 * not set the variable answers 404. One server cannot show both, so there are
 * two. The second is only started when Playwright starts servers at all.
 */
export const gatedPort = uiPort + 1;
export const gatedBaseUrl = `http://127.0.0.1:${gatedPort}`;

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

  use: {
    baseURL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'on-first-retry',
  },

  /*
   * Chromium at two widths and in both themes.
   *
   * Firefox and WebKit were in the template's config and the workflow never
   * installed them, so they were a promise the pipeline did not keep. The
   * matrix that does matter is this one: 1440 is the design width, 1280 is
   * where the token media query narrows both side panels, and the theme is the
   * thing a token mistake breaks in exactly one of the two.
   *
   * `colorScheme` sets prefers-color-scheme, which is what the theme follows
   * when the reader has made no choice (styles/global.css).
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        colorScheme: 'dark',
      },
    },
    {
      name: 'chromium-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'chromium-1280-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        colorScheme: 'dark',
      },
    },
  ],

  webServer: externalBaseUrl
    ? undefined
    : [
        {
          // The standalone server, which is exactly what the image runs
          // (frontend/Dockerfile). `next start` also serves the build but warns
          // that it is the wrong entry point for `output: standalone`, and a
          // warning in every test run is a warning nobody reads.
          command: `pnpm --filter @quellwerk/frontend run start:standalone`,
          env: { PORT: String(uiPort), HOSTNAME: '127.0.0.1', DEV_STATES: '1' },
          url: baseURL,
          cwd: path.resolve(__dirname, '..'),
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: `pnpm --filter @quellwerk/frontend run start:standalone`,
          env: { PORT: String(gatedPort), HOSTNAME: '127.0.0.1' },
          url: `${gatedBaseUrl}/`,
          cwd: path.resolve(__dirname, '..'),
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],

  /* Timeout settings */
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
});
