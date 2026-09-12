import { expect, test } from '@playwright/test';

import { gatedBaseUrl } from '../../playwright.config';
import { stubApi } from '../../fixtures/api';
import { NotebookPage } from '../../pages/notebook.page';

/**
 * The demo path, end to end, the way it will be walked in the video.
 *
 * Home, into a notebook, read the sources, follow a citation into the document,
 * come back. One spec that fails if any of the four panels stops working
 * together, which is the failure the panel specs cannot see.
 *
 * It runs at 1440 and 1280, light and dark (e2e/playwright.config.ts).
 */

test.beforeEach(async ({ page }) => {
  // No backend: the responses come from e2e/fixtures/api.ts.
  await stubApi(page);
});

test('walks from the notebook grid to a cited passage and back', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await notebook.openFromHome(/EU AI Act obligations/);

  // The four sources, with the one that failed visible rather than hidden.
  await expect(page.locator('[data-source]')).toHaveCount(4);
  await expect(page.getByText('The file is not a readable PDF.')).toBeVisible();

  // The answer, with its provenance counted.
  await expect(page.getByText('5 citations')).toBeVisible();

  // A chip carries the reader into the document, at the passage.
  await notebook.citation(3).click();
  await expect(notebook.viewerTitle).toHaveText(/Regulation/);
  await expect(notebook.mark).toHaveText(
    'Training, validation and testing data sets shall be relevant, sufficiently representative'
  );

  // And back to the list.
  await notebook.closeViewer();
  await expect(page.locator('[data-source]')).toHaveCount(4);

  // The refusal is on the same screen as the answer, and carries nothing.
  const refusal = page.locator('[data-testid="answer"][data-refusal="true"]');
  await expect(refusal).toContainText('The sources do not cover this.');
  await expect(refusal.locator('[data-testid^="cite-"]')).toHaveCount(0);

  // Through all of it the page itself never scrolls.
  expect(await notebook.pageScrolls()).toBe(false);
});

test('gives the answer the room when both panels are folded away', async ({ page }) => {
  const notebook = new NotebookPage(page);
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');

  const before = (await notebook.chat.boundingBox())?.width ?? 0;

  await notebook.collapse('sources');
  await notebook.collapse('studio');

  const after = (await notebook.chat.boundingBox())?.width ?? 0;
  expect(after).toBeGreaterThan(before);
  expect(await notebook.pageScrolls()).toBe(false);
});

test.describe('the state catalogue', () => {
  test('shows every state the product has', async ({ page }) => {
    await page.goto('/dev/states');

    await expect(page.getByRole('heading', { name: 'States', level: 1 })).toBeVisible();

    for (const state of [
      'Queued',
      'Reading',
      'Failed',
      'Almost no readable text',
      'This source addresses an AI assistant',
      'Only the first part is indexed',
      'List loading',
      'List error',
      'Thinking',
      'Streaming',
      'Answered',
      'Stopped',
      'Refusal',
      'Citation dropped',
      'Answer cut at its length limit',
      'Model error',
      'Daily limit reached',
      'Connection lost',
      'No notebooks',
      'Notebooks loading',
      'Notebooks could not be loaded',
      'No sources yet',
    ]) {
      await expect(page.locator(`[data-specimen="${state}"]`)).toBeVisible();
    }
  });

  test('is a 404 on a server that does not set DEV_STATES', async ({ request }) => {
    // The other half of the claim, and the half that matters on the server: the
    // same build refuses the catalogue when the variable is absent. Only
    // meaningful when Playwright started the servers; with BASE_URL there is
    // one server and somebody else decided what it serves.
    test.skip(!!process.env.BASE_URL, 'runs against an external server');

    const response = await request.get(`${gatedBaseUrl}/dev/states`);

    expect(response.status()).toBe(404);
  });

  test('draws the refusal specimen without a chip', async ({ page }) => {
    await page.goto('/dev/states');

    const refusal = page.locator('[data-testid="answer"][data-refusal="true"]');
    await expect(refusal).toHaveCount(1);
    await expect(refusal.locator('[data-testid^="cite-"]')).toHaveCount(0);
  });
});
