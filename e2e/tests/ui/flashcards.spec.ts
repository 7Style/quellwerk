import { expect, test } from '@playwright/test';

import { CITED, stubApi } from '../../fixtures/api';
import { NotebookPage } from '../../pages/notebook.page';

/**
 * Flashcards im Studio.
 *
 * Aus docs/PLAN.md M11-T3. Die Behauptung, die zaehlt, steht im dritten Test:
 * man dreht eine Karte um und kommt aus ihrer Rueckseite in die Quelle. Eine
 * Karte, die man Wochen spaeter liest, ist genau dann etwas wert, wenn man
 * nachsehen kann, ob stimmt, was darauf steht.
 */

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test('says how many cards there are before they are opened', async ({ page }) => {
  await expect(page.getByTestId('flashcards-line')).toHaveText('3 cards');
});

test('shows the question first and the answer only after a click', async ({ page }) => {
  await page.getByTestId('open-flashcards').click();

  const card = page.getByTestId('flashcard');
  await expect(card).toHaveAttribute('data-side', 'front');
  await expect(card).toContainText('What must a provider do');
  // Die Antwort steht noch nicht da: eine Karte, die beide Seiten zeigt, ist
  // keine Karte.
  await expect(card).not.toContainText('must be established');

  await page.getByTestId('flashcard-flip').click();

  await expect(card).toHaveAttribute('data-side', 'back');
  await expect(card).toContainText('must be established');
});

test('a chip on the back opens the source at the passage', async ({ page }) => {
  const notebook = new NotebookPage(page);

  await page.getByTestId('open-flashcards').click();
  await page.getByTestId('flashcard-flip').click();
  await notebook.citation(1).click();

  await expect(notebook.viewerTitle).toHaveText('Commission Q&A on high-risk AI systems');
  expect(await notebook.mark.textContent()).toBe(CITED[0]);
});

test('goes through the stack, one card at a time', async ({ page }) => {
  await page.getByTestId('open-flashcards').click();
  await expect(page.getByTestId('flashcard-previous')).toBeDisabled();

  await page.getByTestId('flashcard-next').click();

  await expect(page.getByTestId('flashcard')).toContainText('When do the rules');
  // Die naechste Karte liegt wieder auf der Vorderseite.
  await expect(page.getByTestId('flashcard')).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('flashcard-previous')).toBeEnabled();
});

test('takes the column and keeps the composer out of it', async ({ page }) => {
  await page.getByTestId('open-flashcards').click();

  await expect(page.getByTestId('thread')).toHaveCount(0);
  await expect(page.getByLabel('Ask a question about your sources')).toHaveCount(0);
});
