import { expect, test } from '@playwright/test';

import { NotebookPage } from '../../pages/notebook.page';

/**
 * The answer, its chips, and the refusal.
 *
 * From docs/PLAN.md M4-T4: five chips on the answer fixture, hovering shows the
 * passage with source title and offsets, the refusal fixture has zero chips and
 * no accent colour.
 *
 * The last one is the claim worth testing hardest. The accent means provenance
 * and nothing else, so a refusal - an answer that points at nothing - must not
 * carry a trace of it.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/n/eu-ai-act-obligations');
});

test('numbers every citation in the answer, once, in reading order', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await expect(page.getByTestId('answer').first()).toBeVisible();
  await expect(page.locator('[data-testid^="cite-"]:not([data-testid*="card"])')).toHaveCount(5);

  for (let index = 1; index <= 5; index += 1) {
    await expect(notebook.citation(index)).toHaveText(String(index));
  }
  await expect(page.getByText('5 citations')).toBeVisible();
  await expect(page.getByText('2 sources')).toBeVisible();
});

test('hovering a chip shows the passage, the source and the offsets', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await notebook.citation(2).hover();

  const card = notebook.citationCard(2);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Regulation (EU) 2024/1689');
  // The range is the claim the server checked. Printing it is the difference
  // between "trust me" and "look for yourself".
  await expect(card).toContainText(/characters [\d,]+-[\d,]+/);
  await expect(card.locator('mark')).toHaveText(
    'throughout the entire lifecycle of the high-risk AI system'
  );
});

test('a chip opens its source at the passage', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await notebook.citation(1).click();

  await expect(notebook.viewerTitle).toHaveText('Commission Q&A on high-risk AI systems');
  await expect(notebook.mark).toHaveText(
    'providers must establish, implement, document and maintain a risk management system'
  );
});

test('a refusal carries no chip and no accent', async ({ page }) => {
  const refusal = page.locator('[data-testid="answer"][data-refusal="true"]');

  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText('The sources do not cover this.');
  await expect(refusal.locator('[data-testid^="cite-"]')).toHaveCount(0);
  await expect(page.getByText('No citations')).toBeVisible();

  // Not one pixel of the provenance accent anywhere inside it.
  const accents = await refusal.evaluate((block) => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const wash = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-wash')
      .trim();
    const paint = (value: string) => {
      const probe = document.createElement('span');
      probe.style.color = value;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const forbidden = new Set([paint(accent), paint(wash)]);

    return [...block.querySelectorAll('*'), block].filter((element) => {
      const style = getComputedStyle(element);
      return forbidden.has(style.color) || forbidden.has(style.backgroundColor);
    }).length;
  });

  expect(accents).toBe(0);
});

test('the composer sends nothing while the box is empty', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

  await notebook.composer.fill('Was gilt ab 2027?');

  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
});

test('a suggestion fills the box instead of asking straight away', async ({ page }) => {
  const notebook = new NotebookPage(page);
  const suggestion = 'Who counts as a provider under the Act?';

  await page.getByRole('button', { name: suggestion }).click();

  await expect(notebook.composer).toHaveValue(suggestion);
  // Filling the box and sending are two decisions; a reader may want to edit it.
  await expect(page.getByTestId('question')).toHaveCount(2);
});

test('Enter asks and Shift+Enter breaks the line', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await notebook.composer.fill('Erste Zeile');
  await notebook.composer.press('Shift+Enter');
  await notebook.composer.press('a');
  await expect(notebook.composer).toHaveValue('Erste Zeile\na');

  await notebook.composer.press('Enter');

  await expect(page.getByTestId('question')).toHaveCount(3);
  await expect(notebook.composer).toHaveValue('');
});
