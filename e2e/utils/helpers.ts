import { Page, expect } from '@playwright/test';

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for element to be visible with custom timeout
 */
export async function waitForElement(page: Page, selector: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(selector, {
    state: 'visible',
    timeout,
  });
}

/**
 * Get text content of an element
 */
export async function getElementText(page: Page, selector: string): Promise<string | null> {
  const element = page.locator(selector);
  return element.textContent();
}

/**
 * Check if element exists on page
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  const count = await page.locator(selector).count();
  return count > 0;
}

/**
 * Wait for URL to match pattern
 */
export async function waitForUrlMatch(
  page: Page,
  pattern: string | RegExp,
  timeout = 10000
): Promise<void> {
  await page.waitForURL(pattern, { timeout });
}

/**
 * Clear all browser storage (localStorage, sessionStorage, cookies)
 */
export async function clearBrowserStorage(page: Page): Promise<void> {
  // Clear cookies first (works without page navigation)
  const context = page.context();
  await context.clearCookies();

  // Only clear localStorage/sessionStorage if on a valid page
  const url = page.url();
  if (url && !url.startsWith('about:')) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }
}

/**
 * Get localStorage value
 */
export async function getLocalStorageItem(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/**
 * Set localStorage value
 */
export async function setLocalStorageItem(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: value });
}

/**
 * Take screenshot with timestamp
 */
export async function takeTimestampedScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

/**
 * Retry action with exponential backoff
 */
export async function retryAction<T>(
  action: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Assert that current URL matches expected path
 */
export async function assertUrlPath(page: Page, expectedPath: string): Promise<void> {
  const url = new URL(page.url());
  expect(url.pathname).toBe(expectedPath);
}

/**
 * Fill form field and verify value
 */
export async function fillAndVerify(page: Page, selector: string, value: string): Promise<void> {
  await page.fill(selector, value);
  await expect(page.locator(selector)).toHaveValue(value);
}
