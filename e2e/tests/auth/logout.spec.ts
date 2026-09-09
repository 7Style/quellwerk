import { test, expect } from '../../fixtures/auth.fixture';
import { validUser, demoUsersSeeded, DEMO_USERS_SKIP_REASON } from '../../fixtures/test-users';
import { clearBrowserStorage, getLocalStorageItem } from '../../utils/helpers';

/**
 * Logout flow. Every test logs in as the seed's demo user and logs out through
 * the dashboard button (data-testid="dashboard-logout"). Only successful logins
 * are sent, which the login limiter does not count (0 failed attempts).
 */
test.describe('Logout', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(!demoUsersSeeded, DEMO_USERS_SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await clearBrowserStorage(page);
  });

  test.describe('Logout functionality', () => {
    test('clears the tokens', async ({ auth, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await getLocalStorageItem(page, 'accessToken')).toBeTruthy();

      await auth.logout();

      expect(await getLocalStorageItem(page, 'accessToken')).toBeNull();
      expect(await getLocalStorageItem(page, 'refreshToken')).toBeNull();
    });

    test('returns to the login page', async ({ auth, loginPage, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);

      await auth.logout();

      await expect(page).toHaveURL(/\/login$/);
      await expect(loginPage.email).toBeVisible();
      await expect(loginPage.password).toBeVisible();
    });

    test('is not authenticated afterwards', async ({ auth }) => {
      await auth.login(validUser);
      expect(await auth.isAuthenticated()).toBe(true);

      await auth.logout();

      expect(await auth.isAuthenticated()).toBe(false);
    });
  });

  test.describe('Post-logout behaviour', () => {
    test('redirects /dashboard to /login after logout', async ({ auth, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);

      await auth.logout();
      await page.goto('/dashboard');

      await expect(page).toHaveURL(/\/login$/);
      expect(await auth.isAuthenticated()).toBe(false);
    });

    test('allows a new login after logout', async ({ auth, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);

      await auth.logout();
      await expect(page).toHaveURL(/\/login$/);

      await auth.login(validUser);

      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await getLocalStorageItem(page, 'accessToken')).toBeTruthy();
    });
  });

  test.describe('Session handling', () => {
    test('shows the login form after the tokens are gone', async ({ auth, loginPage, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);

      // Simulate an expired session: drop the tokens without using the UI
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });
      await page.goto('/login');

      await expect(loginPage.form).toBeVisible();
      await expect(loginPage.email).toBeVisible();
    });

    test('survives several login/logout cycles', async ({ auth, page }) => {
      for (let cycle = 1; cycle <= 2; cycle++) {
        await auth.login(validUser);
        await expect(page).toHaveURL(/\/dashboard$/);
        await auth.logout();
        expect(await auth.isAuthenticated()).toBe(false);
      }

      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await auth.isAuthenticated()).toBe(true);
    });
  });
});
