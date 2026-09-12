import { expect, test, type Page } from '@playwright/test';

import { stubApi } from '../../fixtures/api';

/**
 * The source viewer and its mark.
 *
 * From docs/PLAN.md M4-T3: the marked text equals the fixture's cited string,
 * the passage is scrolled into view, a second click on another chip moves the
 * mark.
 *
 * This is the one thing the product claims, so the assertions are about
 * characters and not about appearance: what stands inside the mark has to be
 * exactly what the citation said, with no trimming and no ellipsis.
 */

/** The quotes the fixtures cite, verbatim. A change here has to be deliberate. */
const CITED = [
  'throughout the entire lifecycle of the high-risk AI system',
  'Training, validation and testing data sets shall be relevant, sufficiently representative',
  'shall be drawn up before that system is placed on the market',
  'The rules for high-risk AI systems will apply starting 2 December 2027.',
];

async function isInView(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const region = element.closest('[data-testid="scroll-sources"]');
    if (!region) return false;
    const view = region.getBoundingClientRect();
    return box.top >= view.top && box.bottom <= view.bottom;
  });
}

test.beforeEach(async ({ page }) => {
  // No backend: the responses come from e2e/fixtures/api.ts.
  await stubApi(page);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test('a chip opens the source and marks exactly what was cited', async ({ page }) => {
  await expect(page.getByTestId('source-viewer')).toHaveCount(0);

  await page.getByTestId('cite-2').click();

  await expect(page.getByTestId('source-viewer')).toBeVisible();
  await expect(page.getByTestId('viewer-title')).toHaveText(
    'Regulation (EU) 2024/1689, Chapter III (excerpt)'
  );
  // textContent, not innerText: innerText collapses whitespace, and whether the
  // mark covers one space too many is the whole question.
  expect(await page.getByTestId('passage-mark').textContent()).toBe(CITED[0]);
});

test('scrolls the passage into view', async ({ page }) => {
  // The quote sits well down the document, so a viewer that simply rendered the
  // text would leave it off screen.
  await page.getByTestId('cite-4').click();

  await expect(page.getByTestId('passage-mark')).toBeVisible();
  expect(await isInView(page, 'passage-mark')).toBe(true);
});

test('a second chip moves the mark, and there is only ever one', async ({ page }) => {
  await page.getByTestId('cite-2').click();
  expect(await page.getByTestId('passage-mark').textContent()).toBe(CITED[0]);

  await page.getByTestId('cite-3').click();

  await expect(page.getByTestId('passage-mark')).toHaveCount(1);
  expect(await page.getByTestId('passage-mark').textContent()).toBe(CITED[1]);
  expect(await isInView(page, 'passage-mark')).toBe(true);
});

test('follows a chip into a different source', async ({ page }) => {
  await page.getByTestId('cite-2').click();
  await expect(page.getByTestId('viewer-title')).toHaveText(/Regulation/);

  await page.getByTestId('cite-5').click();

  await expect(page.getByTestId('viewer-title')).toHaveText(
    'Commission Q&A on high-risk AI systems'
  );
  expect(await page.getByTestId('passage-mark').textContent()).toBe(CITED[3]);
});

test('the marked text really stands at those offsets in the document', async ({ page }) => {
  // The mark is a slice of the rendered text. Cutting the document at the same
  // place has to produce the same characters, or the offsets and the mark have
  // drifted apart.
  await page.getByTestId('cite-3').click();

  const { document: whole, marked } = await page.getByTestId('source-text').evaluate((article) => ({
    document: article.textContent ?? '',
    marked: article.querySelector('mark')?.textContent ?? '',
  }));

  const at = whole.indexOf(marked);
  expect(at).toBeGreaterThan(-1);
  expect(whole.slice(at, at + marked.length)).toBe(CITED[1]);
  expect(whole.indexOf(marked, at + 1)).toBe(-1);
});

test('opens a source from the list with nothing marked', async ({ page }) => {
  // Scoped to the column: the stand-in chip in the chat names the same source.
  await page
    .getByTestId('scroll-sources')
    .getByRole('button', { name: /Commission Q&A/ })
    .click();

  await expect(page.getByTestId('source-viewer')).toBeVisible();
  await expect(page.getByTestId('passage-mark')).toHaveCount(0);
  await expect(page.getByTestId('source-text')).toContainText('Navigating the AI Act');
});

test('goes back to the list and keeps the column scrolling for itself', async ({ page }) => {
  await page.getByTestId('cite-2').click();
  await expect(page.getByTestId('source-viewer')).toBeVisible();

  await page.getByTestId('viewer-close').click();

  await expect(page.getByTestId('source-viewer')).toHaveCount(0);
  await expect(page.locator('[data-source]')).toHaveCount(4);

  const pageScrolled = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollHeight > root.clientHeight;
  });
  expect(pageScrolled).toBe(false);
});

test('cannot open a source that is not ready', async ({ page }) => {
  await expect(
    page.getByTestId('scroll-sources').getByRole('button', { name: /Board minutes/ })
  ).toBeDisabled();
  await expect(page.getByTestId('source-viewer')).toHaveCount(0);
});
