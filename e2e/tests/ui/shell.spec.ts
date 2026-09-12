import { expect, test, type Page } from '@playwright/test';

import { stubApi } from '../../fixtures/api';

/**
 * The shell: the home grid and the three column layout.
 *
 * Four claims, from docs/PLAN.md M4-T1: both routes render, each column scrolls
 * on its own, the page itself never scrolls, both panels collapse to the rail.
 *
 * Runs on fixtures. Nothing here needs the backend, which is the point of the
 * parallelisable tasks in M4: a red run means the layout broke, never that a
 * container was down.
 */

const RAIL = 48;

/** The document itself, as opposed to any region inside it. */
async function pageScrolls(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollHeight > root.clientHeight;
  });
}

/**
 * Fills a region with something taller than itself and scrolls it.
 *
 * Content is what T2 to T4 add; the layout contract exists now. Growing the
 * region on the spot tests the contract without waiting for the content and
 * without a fixture whose only purpose is to be long.
 */
async function scrollInside(page: Page, testId: string): Promise<{ top: number; max: number }> {
  return page.getByTestId(testId).evaluate((element) => {
    const filler = document.createElement('div');
    filler.style.height = '4000px';
    element.append(filler);
    element.scrollTop = 1_000;
    const result = { top: element.scrollTop, max: element.scrollHeight - element.clientHeight };
    filler.remove();
    element.scrollTop = 0;
    return result;
  });
}

test.beforeEach(async ({ page }) => {
  // No backend: the responses come from e2e/fixtures/api.ts.
  await stubApi(page);
});

test.describe('home', () => {
  test('renders the notebook grid', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Your notebooks', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /EU AI Act obligations/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create new notebook' })).toHaveCount(2);
  });

  test('scrolls the grid and not the page', async ({ page }) => {
    await page.goto('/');

    expect(await pageScrolls(page)).toBe(false);

    const scrolled = await scrollInside(page, 'scroll-home');
    expect(scrolled.top).toBeGreaterThan(0);
    expect(await pageScrolls(page)).toBe(false);
  });

  test('draws the primary button in a colour you can read', async ({ page }) => {
    // A regression guard for a class of bug rather than for one button:
    // tailwind-merge groups utilities by name, every scale here is named rather
    // than numbered, and it once merged `text-ink-inverse` away because
    // `text-ui-lg` looked like the same kind of class. The button rendered as a
    // black rectangle with black text. Contrast is the symptom worth asserting.
    await page.goto('/');

    const colours = await page
      .getByRole('button', { name: 'Create new notebook' })
      .first()
      .evaluate((button) => {
        const style = getComputedStyle(button);
        return { color: style.color, background: style.backgroundColor };
      });

    expect(colours.color).not.toBe(colours.background);
  });

  test('opens a notebook from its card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /EU AI Act obligations/ }).click();

    await expect(page).toHaveURL(/\/n\/3f1b0a3c-1f2e-4c3a-9a1b-000000000001$/);
    await expect(page.getByRole('heading', { name: 'EU AI Act obligations' })).toBeVisible();
  });
});

test.describe('a notebook', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
  });

  test('renders three columns under the topbar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sources', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Studio', level: 2 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quellwerk' })).toBeVisible();
  });

  test('gives every column its own scrollbar and leaves the page alone', async ({ page }) => {
    expect(await pageScrolls(page)).toBe(false);

    for (const region of ['scroll-sources', 'scroll-chat', 'scroll-studio']) {
      const scrolled = await scrollInside(page, region);
      expect(scrolled.top, `${region} did not scroll`).toBeGreaterThan(0);
      expect(await pageScrolls(page), `the page scrolled when ${region} did`).toBe(false);
    }
  });

  test('collapses the sources panel to the rail and back', async ({ page }) => {
    const panel = page.locator('[data-panel="sources"]');
    const openWidth = (await panel.boundingBox())?.width ?? 0;
    expect(openWidth).toBeGreaterThan(RAIL);

    await page.getByTestId('toggle-sources').click();

    await expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect((await panel.boundingBox())?.width).toBe(RAIL);
    // The list is gone, the word stays: a rail nobody can read is a rail
    // nobody clicks.
    await expect(page.getByTestId('scroll-sources')).toHaveCount(0);
    await expect(panel.getByText('Sources')).toBeVisible();

    await page.getByTestId('toggle-sources').click();

    await expect(panel).toHaveAttribute('data-collapsed', 'false');
    expect((await panel.boundingBox())?.width).toBe(openWidth);
  });

  test('collapses the studio panel to the rail and back', async ({ page }) => {
    const panel = page.locator('[data-panel="studio"]');
    const openWidth = (await panel.boundingBox())?.width ?? 0;
    expect(openWidth).toBeGreaterThan(RAIL);

    await page.getByTestId('toggle-studio').click();

    await expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect((await panel.boundingBox())?.width).toBe(RAIL);

    await page.getByTestId('toggle-studio').click();

    await expect(panel).toHaveAttribute('data-collapsed', 'false');
  });

  test('gives the answer the room both panels release', async ({ page }) => {
    const chat = page.locator('[data-testid="scroll-chat"]');
    const before = (await chat.boundingBox())?.width ?? 0;

    await page.getByTestId('toggle-sources').click();
    await page.getByTestId('toggle-studio').click();

    const after = (await chat.boundingBox())?.width ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(await pageScrolls(page)).toBe(false);
  });

  test('says so when a notebook is not this session', async ({ page }) => {
    // Not an HTTP 404. Whether a notebook exists is a question only the session
    // cookie can answer, and the cookie is the browser's, so the server that
    // renders the route cannot know. The screen says the same thing for a
    // notebook that never existed and one that belongs elsewhere, because
    // telling them apart is the information the rule withholds.
    await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-00000000ffff');

    await expect(page.getByTestId('notebook-missing')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your notebooks' })).toBeVisible();
  });
});
