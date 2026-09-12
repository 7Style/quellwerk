import { expect, test } from '@playwright/test';

import { stubApi } from '../../fixtures/api';

/**
 * Die Mind Map im Studio.
 *
 * Aus docs/PLAN.md M11-T1. Die Behauptung, die zaehlt, steht im letzten Block:
 * ein Klick auf einen Knoten fuellt das Eingabefeld und schickt nichts ab. Die
 * Karte sagt, was in den Quellen steht; die Antwort darauf sagt es mit Belegen,
 * und ob sie gestellt wird, entscheidet der Leser.
 */

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test('says what the map holds before it is opened', async ({ page }) => {
  await expect(page.getByTestId('mindmap-line')).toHaveText('7 topics');
});

test('draws the nodes as levels, root first', async ({ page }) => {
  await page.getByTestId('open-mindmap').click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('EU AI Act obligations');
  // Die Wurzel steht als Ueberschrift, nicht als Knopf: sie ist das Notizbuch
  // und keine Frage.
  await expect(page.getByTestId('mindmap-nodes').locator('[data-node]')).toHaveCount(7);
  await expect(page.locator('[data-node="risk"]')).toHaveText('Risk classes');
  await expect(page.locator('[data-node="prohibited"]')).toHaveText('Prohibited practices');
});

test('takes the column and keeps the composer out of it', async ({ page }) => {
  await page.getByTestId('open-mindmap').click();

  await expect(page.getByTestId('thread')).toHaveCount(0);
  await expect(page.getByLabel('Ask a question about your sources')).toHaveCount(0);
});

test('a click on a node fills the box and sends nothing', async ({ page }) => {
  await page.getByTestId('open-mindmap').click();
  await page.locator('[data-node="risk-management"]').click();

  // Zurueck im Gespraech, mit der Frage im Feld und ohne eine Antwort darunter.
  const box = page.getByLabel('Ask a question about your sources');
  await expect(box).toHaveValue('What do the sources say about Risk management system?');
  await expect(page.getByTestId('answer')).toHaveCount(2);
});

test('goes back to the conversation', async ({ page }) => {
  await page.getByTestId('open-mindmap').click();
  await page.getByTestId('mindmap-close').click();

  await expect(page.getByTestId('mindmap-view')).toHaveCount(0);
  await expect(page.getByTestId('thread')).toBeVisible();
});
