import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for /login.
 *
 * Every locator is a data-testid from frontend/src/app/login/page.tsx (plus the
 * dashboard's logout button from frontend/src/app/dashboard/page.tsx). No CSS
 * class names: Tailwind utility classes are not a stable contract.
 */
export class LoginPage {
  readonly title: Locator;
  readonly form: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly rememberMe: Locator;
  readonly passwordToggle: Locator;
  readonly submit: Locator;
  /** Error box for the API response (401, 423, ...) */
  readonly error: Locator;
  /** Client-side validation messages of react-hook-form (one per field) */
  readonly fieldErrors: Locator;
  /** Rendered only on /dashboard after a successful login */
  readonly dashboardLogout: Locator;

  constructor(readonly page: Page) {
    this.title = page.getByTestId('login-title');
    this.form = page.getByTestId('login-form');
    this.email = page.getByTestId('login-email');
    this.password = page.getByTestId('login-password');
    this.rememberMe = page.getByTestId('login-remember-me');
    this.passwordToggle = page.getByTestId('password-toggle');
    this.submit = page.getByTestId('login-submit');
    this.error = page.getByTestId('login-error');
    this.fieldErrors = page.getByTestId('login-field-error');
    this.dashboardLogout = page.getByTestId('dashboard-logout');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.form).toBeVisible();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
  }

  /**
   * Submit and wait for the outcome: either the dashboard (logout button
   * rendered) or the error box of the login page.
   */
  async submitAndWait(): Promise<void> {
    await this.submit.click();
    await expect(this.dashboardLogout.or(this.error)).toBeVisible({ timeout: 10_000 });
  }

  /** Full login flow from a fresh /login visit */
  async login(email: string, password: string): Promise<void> {
    await this.goto();
    await this.fillCredentials(email, password);
    await this.submitAndWait();
  }
}
