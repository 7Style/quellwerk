import { expect, test } from '@playwright/test';

import { CITED, stubApi } from '../../fixtures/api';
import { NotebookPage } from '../../pages/notebook.page';

/**
 * Notizen im Studio.
 *
 * Aus docs/PLAN.md M5-T4. Die eine Behauptung, die zaehlt, steht im zweiten
 * Block: eine gesicherte Antwort behaelt ihre geprueften Belege, also oeffnet
 * ein Chip in einer Notiz dieselbe Stelle wie ein Chip im Gespraech. Eine Notiz
 * wird spaeter gelesen als die Antwort, oft von jemandem, der das Gespraech
 * nicht gefuehrt hat -- genau dann muss der Beleg noch tragen.
 */

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test.describe('the notes list', () => {
  test('shows where a note comes from', async ({ page }) => {
    const notes = page.getByTestId('notes');

    await expect(notes.locator('[data-note="n-saved"]')).toContainText('From an answer');
    await expect(notes.locator('[data-note="n-saved"]')).toContainText('1 citation');
    // Eine selbst geschriebene Notiz traegt keine Belege, und die Zeile sagt
    // das, statt eine Null zu zeigen.
    await expect(notes.locator('[data-note="n-own"]')).toContainText('Written by you');
  });

  test('asks for a title and a text before it writes one', async ({ page }) => {
    await page.getByTestId('add-note').click();

    const dialog = page.getByRole('dialog');
    const add = dialog.getByRole('button', { name: 'Add note' });
    await expect(add).toBeDisabled();

    await dialog.getByLabel('Title').fill('Offene Fragen');
    await expect(add).toBeDisabled();

    await dialog.getByLabel('Text').fill('Wer ist Anbieter, wer Betreiber?');
    await expect(add).toBeEnabled();

    await add.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('a saved answer', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('[data-note="n-saved"]').click();
    await expect(page.getByTestId('note-view')).toBeVisible();
  });

  test('keeps the chips, and they still open the source at the passage', async ({ page }) => {
    const notebook = new NotebookPage(page);

    // In der Ansicht, nicht in der Liste: dort steht dieselbe Zahl.
    await expect(page.getByTestId('note-view').getByText('1 citation')).toBeVisible();

    await notebook.citation(1).click();

    await expect(notebook.viewerTitle).toHaveText('Commission Q&A on high-risk AI systems');
    // Genau das, was der Beleg behauptet, aus dem gespeicherten Text
    // geschnitten - dieselbe Pruefung wie im Gespraech (ADR-0003).
    expect(await notebook.mark.textContent()).toBe(CITED[0]);
  });

  test('takes the column and keeps the composer out of it', async ({ page }) => {
    await expect(page.getByTestId('thread')).toHaveCount(0);
    await expect(page.getByLabel('Ask a question about your sources')).toHaveCount(0);
  });

  test('offers Convert to source and Delete', async ({ page }) => {
    await expect(page.getByTestId('note-convert')).toBeVisible();
    await expect(page.getByTestId('note-delete')).toBeVisible();
  });

  test('goes back to the conversation', async ({ page }) => {
    await page.getByTestId('note-close').click();

    await expect(page.getByTestId('note-view')).toHaveCount(0);
    await expect(page.getByTestId('thread')).toBeVisible();
    await expect(page.getByLabel('Ask a question about your sources')).toBeVisible();
  });
});

test.describe('a note written by hand', () => {
  test('is drawn as text, without a single chip', async ({ page }) => {
    await page.locator('[data-note="n-own"]').click();

    const view = page.getByTestId('note-view');
    await expect(view).toContainText('Wer ist bei uns Anbieter');
    // Kein Chip: an dieser Notiz hat nie ein Resolver etwas geprueft, und ein
    // Beleg, den niemand nachgerechnet hat, wird hier nicht gezeichnet.
    await expect(view.getByRole('button', { name: /^Citation / })).toHaveCount(0);
    await expect(view).toContainText('Written by you');
  });

  test('disappears from the list when it is deleted', async ({ page }) => {
    await page.locator('[data-note="n-own"]').click();
    await page.getByTestId('note-delete').click();

    // Zurueck im Gespraech, weil die Notiz, die offen war, nicht mehr da ist.
    await expect(page.getByTestId('note-view')).toHaveCount(0);
    await expect(page.getByTestId('thread')).toBeVisible();
  });
});

test.describe('Save to note', () => {
  test('sits on an answer from the history and opens the note it wrote', async ({ page }) => {
    // Der Knopf haengt an einer gespeicherten Antwort: er schickt deren Id, und
    // der Server holt die geprueften Segmente aus seiner eigenen Zeile.
    const answers = page.getByTestId('answer');
    await expect(answers.first()).toBeVisible();

    await page.getByTestId('save-to-note').first().click();

    await expect(page.getByTestId('note-view')).toBeVisible();
    await expect(page.getByTestId('note-view')).toContainText('Four obligations come up');
  });
});
