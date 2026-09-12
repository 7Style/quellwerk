import { expect, test } from '@playwright/test';

import { stubApi } from '../../fixtures/api';
import { NotebookPage } from '../../pages/notebook.page';

/**
 * The overview above the conversation.
 *
 * From docs/PLAN.md M5-T1: exactly four questions, each one fills the composer
 * on click.
 *
 * Filling and sending are two steps on purpose. The questions come from a model
 * that read the sources, the reader may want to narrow one, and a click that
 * spends money without a second step is a click people learn to fear.
 */

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test('shows what the notebook is about, above the first turn', async ({ page }) => {
  const overview = page.getByTestId('overview');

  await expect(overview).toBeVisible();
  await expect(
    overview.getByRole('heading', { name: 'EU AI Act obligations', level: 1 })
  ).toBeVisible();
  // Exactly one heading with that name on the page. The topbar keeps a plain
  // copy for after the overview has scrolled away, and a second heading would
  // make a reader navigating by heading hear the notebook twice.
  await expect(page.getByRole('heading', { name: 'EU AI Act obligations' })).toHaveCount(1);
  await expect(page.getByTestId('overview-summary')).toContainText(
    'obligations of providers of high-risk AI systems'
  );
});

test('offers exactly four questions', async ({ page }) => {
  // Four is the number the job writes, and it cuts to four rather than failing
  // at three (overview.job.ts). The header shows what there is.
  await expect(page.getByTestId('overview-questions').getByRole('button')).toHaveCount(4);
});

test('a question fills the composer and is not sent', async ({ page }) => {
  const notebook = new NotebookPage(page);
  const question = 'When do the rules for high-risk AI systems start to apply?';

  await expect(page.getByTestId('question')).toHaveCount(2);

  await page.getByTestId('overview-questions').getByRole('button', { name: question }).click();

  await expect(notebook.composer).toHaveValue(question);
  // Still two: nothing was asked.
  await expect(page.getByTestId('question')).toHaveCount(2);
});

test('every one of them fills the box', async ({ page }) => {
  const notebook = new NotebookPage(page);
  const buttons = page.getByTestId('overview-questions').getByRole('button');

  for (let index = 0; index < 4; index += 1) {
    const text = (await buttons.nth(index).textContent())?.trim() ?? '';
    await buttons.nth(index).click();
    await expect(notebook.composer).toHaveValue(text);
  }
});

test('sends one once the reader asks for it', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await page.getByTestId('overview-questions').getByRole('button').first().click();
  await notebook.composer.press('Enter');

  await expect(page.getByTestId('question')).toHaveCount(3);
  await expect(notebook.composer).toHaveValue('');
});

test('scrolls away with the conversation instead of pinning itself', async ({ page }) => {
  // It is what the notebook is about, which matters most before the first
  // question. Pinned, it would cost the answer a third of the column.
  const region = page.getByTestId('scroll-chat');
  const before = (await page.getByTestId('overview').boundingBox())?.y ?? 0;

  await region.evaluate((element) => {
    element.append(Object.assign(document.createElement('div'), { style: 'height:3000px' }));
    element.scrollTop = 800;
  });

  const after = (await page.getByTestId('overview').boundingBox())?.y ?? 0;
  expect(after).toBeLessThan(before);
});
