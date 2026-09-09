import { test, expect } from '../../fixtures/auth.fixture';
import {
  validUser,
  invalidUser,
  nonExistentUser,
  demoUsersSeeded,
  DEMO_USERS_SKIP_REASON,
} from '../../fixtures/test-users';
import { clearBrowserStorage, getLocalStorageItem } from '../../utils/helpers';

/**
 * Login flow against the running stack.
 *
 * Rate limiter budget: the backend allows RATE_LIMIT_LOGIN_MAX (default 5)
 * failed logins per 15 minutes and IP; successful logins are not counted.
 * This file sends exactly 3 failed logins ("Login with invalid credentials"),
 * the validation tests never reach the API, and the whole file runs serially
 * (playwright.config.ts: workers 1). Keep it at 4 failed attempts or fewer.
 *
 * Dropped from the old suite: "should show loading state while submitting" --
 * the page has no spinner, the submit button only changes its label and is
 * disabled for the duration of the request.
 */
test.describe('Login', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Visit the app first so localStorage is accessible, then start clean
    await page.goto('/login');
    await clearBrowserStorage(page);
  });

  test.describe('Login page UI', () => {
    test('displays the login form', async ({ loginPage }) => {
      await loginPage.goto();

      await expect(loginPage.title).toBeVisible();
      await expect(loginPage.email).toBeVisible();
      await expect(loginPage.password).toBeVisible();
      await expect(loginPage.rememberMe).not.toBeChecked();
      await expect(loginPage.submit).toBeVisible();
      await expect(loginPage.submit).toBeEnabled();
      await expect(loginPage.error).toHaveCount(0);
    });

    test('toggles the password visibility', async ({ loginPage }) => {
      await loginPage.goto();

      await expect(loginPage.password).toHaveAttribute('type', 'password');

      await loginPage.passwordToggle.click();
      await expect(loginPage.password).toHaveAttribute('type', 'text');
      await expect(loginPage.passwordToggle).toHaveAttribute('aria-pressed', 'true');

      await loginPage.passwordToggle.click();
      await expect(loginPage.password).toHaveAttribute('type', 'password');
    });
  });

  test.describe('Login form validation', () => {
    // Client-side validation (react-hook-form, noValidate form): no request is sent,
    // so these tests do not count against the login limiter.
    let loginRequests: string[];

    test.beforeEach(({ page }) => {
      loginRequests = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/api/auth/login')) {
          loginRequests.push(request.url());
        }
      });
    });

    test('shows a field error for an empty email', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.password.fill('somepassword');
      await loginPage.submit.click();

      await expect(loginPage.fieldErrors.first()).toBeVisible();
      await expect(loginPage.fieldErrors.first()).toHaveText('E-Mail ist erforderlich');
      await expect(loginPage.email).toHaveAttribute('aria-invalid', 'true');
      expect(loginRequests).toHaveLength(0);
    });

    test('shows a field error for an invalid email format', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.fillCredentials('invalid-email-format', 'somepassword');
      await loginPage.submit.click();

      await expect(loginPage.fieldErrors.first()).toBeVisible();
      await expect(loginPage.fieldErrors.first()).toHaveText('Ungültige E-Mail-Adresse');
      expect(loginRequests).toHaveLength(0);
    });

    test('shows a field error for a password that is too short', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.fillCredentials('valid@example.com', '12345'); // fewer than 6 characters
      await loginPage.submit.click();

      await expect(loginPage.fieldErrors.first()).toBeVisible();
      await expect(loginPage.fieldErrors.first()).toHaveText('Mindestens 6 Zeichen');
      await expect(loginPage.password).toHaveAttribute('aria-invalid', 'true');
      expect(loginRequests).toHaveLength(0);
    });
  });

  test.describe('Login with invalid credentials', () => {
    // 3 failed logins in total (see the header comment)

    test('shows an error for a wrong password', async ({ loginPage, page }) => {
      await loginPage.login(validUser.email, 'wrongpassword123');

      await expect(loginPage.error).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
    });

    test('shows an error for a non-existent user', async ({ loginPage, page }) => {
      await loginPage.login(nonExistentUser.email, nonExistentUser.password);

      await expect(loginPage.error).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
    });

    test('does not store tokens after a failed login', async ({ loginPage, page }) => {
      await loginPage.login(invalidUser.email, invalidUser.password);

      await expect(loginPage.error).toBeVisible();
      expect(await getLocalStorageItem(page, 'accessToken')).toBeNull();
      expect(await getLocalStorageItem(page, 'refreshToken')).toBeNull();
    });
  });

  test.describe('Login with valid credentials', () => {
    // validUser is the seed's demo account (SEED_DEMO_USERS=true)
    test.skip(!demoUsersSeeded, DEMO_USERS_SKIP_REASON);

    test('logs in and redirects to the dashboard', async ({ auth, loginPage, page }) => {
      await auth.login(validUser);

      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(loginPage.dashboardLogout).toBeVisible();
      expect(await getLocalStorageItem(page, 'accessToken')).toBeTruthy();
      expect(await getLocalStorageItem(page, 'refreshToken')).toBeTruthy();
    });

    test('logs in with "remember me" checked', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.fillCredentials(validUser.email, validUser.password);
      await loginPage.rememberMe.check();
      await expect(loginPage.rememberMe).toBeChecked();
      await loginPage.submitAndWait();

      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await getLocalStorageItem(page, 'accessToken')).toBeTruthy();
    });

    test('redirects an authenticated user from /login to the dashboard', async ({ auth, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto('/login');

      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await auth.isAuthenticated()).toBe(true);
    });

    test('keeps the session after a reload', async ({ auth, loginPage, page }) => {
      await auth.login(validUser);
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.reload();

      await expect(loginPage.dashboardLogout).toBeVisible();
      expect(await getLocalStorageItem(page, 'accessToken')).toBeTruthy();
    });
  });
});
