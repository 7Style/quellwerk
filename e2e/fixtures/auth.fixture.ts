import { test as base, expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { type TestUser, validUser } from './test-users';

/**
 * Auth fixture interface
 */
export interface AuthFixture {
  /** Login with the given credentials (default: the seed's demo user) */
  login: (user?: TestUser) => Promise<void>;
  /** Logout through the UI (dashboard button); falls back to clearing the tokens */
  logout: () => Promise<void>;
  /** True when an access token is stored in localStorage */
  isAuthenticated: () => Promise<boolean>;
  /** Current page */
  page: Page;
}

const TOKEN_KEYS = ['accessToken', 'refreshToken'] as const;

/**
 * Extended test with the auth fixture and the login page object
 */
export const test = base.extend<{ auth: AuthFixture; loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  auth: async ({ page, loginPage }, use) => {
    const auth: AuthFixture = {
      page,

      async login(user: TestUser = validUser) {
        await loginPage.login(user.email, user.password);
      },

      async logout() {
        if (await loginPage.dashboardLogout.isVisible()) {
          await loginPage.dashboardLogout.click();
        } else {
          // Not on the dashboard: drop the tokens the way the app does
          await page.evaluate((keys) => {
            for (const key of keys) localStorage.removeItem(key);
          }, TOKEN_KEYS);
          await page.goto('/login');
        }
        await page.waitForURL('**/login');
        await expect(loginPage.form).toBeVisible();
      },

      async isAuthenticated(): Promise<boolean> {
        const token = await page.evaluate(() => localStorage.getItem('accessToken'));
        return !!token;
      },
    };

    await use(auth);
  },
});

export { expect };
export default test;
