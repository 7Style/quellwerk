import { expect, test } from '@playwright/test';

import { NotebookPage } from '../../pages/notebook.page';

/**
 * The whole thing, against a running stack.
 *
 * From docs/PLAN.md M4-T6: a question produces a streamed answer whose chips
 * open the real source. Nothing is stubbed here - the notebook is created
 * through the API, the document is read by the worker, the answer comes from
 * the model, and the citation is checked against the stored text before the
 * chip exists.
 *
 * It costs a model call, so it does not run by accident:
 *
 *   pnpm dev                                 # db, redis, backend, worker, frontend
 *   E2E_STACK=1 BASE_URL=http://127.0.0.1:3010 \
 *     pnpm --filter @quellwerk/e2e exec playwright test tests/e2e
 *
 * CI leaves E2E_STACK unset. Its stack has no usable API key, and a spec that
 * needs one would fail there for a reason that says nothing about the code.
 */

const QUOTE =
  'Ein Risikomanagementsystem wird eingerichtet, angewendet, dokumentiert und aufrechterhalten.';

const DOCUMENT = `Artikel 9
Risikomanagementsystem

1. ${QUOTE}

2. Das Risikomanagementsystem ist als kontinuierlicher iterativer Prozess zu verstehen, der den gesamten Lebenszyklus eines Hochrisiko-KI-Systems hindurch geplant und durchgefuehrt wird.

Artikel 11
Technische Dokumentation

1. Die technische Dokumentation eines Hochrisiko-KI-Systems wird erstellt, bevor dieses System in Verkehr gebracht wird.`;

test.skip(!process.env.E2E_STACK, 'needs a running stack with a usable API key');

test.describe.configure({ mode: 'serial' });

test('answers a question from a document it just read, and the chip opens it', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  // The notebook and the source go in through the API, with the browser's
  // session cookie: the page has to find them there, which is the point.
  await page.goto('/');
  const cookies = await page.context().cookies();
  const cookie = cookies.map((one) => `${one.name}=${one.value}`).join('; ');
  const apiBase = process.env.API_URL ?? 'http://127.0.0.1:3011';

  const created = await request.post(`${apiBase}/api/notebooks`, {
    headers: { cookie },
    data: { title: 'Stack test' },
  });
  expect(created.ok()).toBeTruthy();
  const notebookId = (await created.json()).id as string;

  const added = await request.post(`${apiBase}/api/notebooks/${notebookId}/sources`, {
    headers: { cookie },
    data: { kind: 'paste', title: 'KI-Verordnung, Auszug', text: DOCUMENT },
  });
  expect(added.ok()).toBeTruthy();

  await page.goto(`/n/${notebookId}`);
  const notebook = new NotebookPage(page);

  // The worker reads it. The panel polls while anything is queued, so this is
  // the product's own waiting and not the test's.
  await expect(page.getByText('Pasted text · ', { exact: false })).toBeVisible({ timeout: 90_000 });

  await notebook.composer.fill('Was verlangt Artikel 9 zum Risikomanagement?');
  await notebook.composer.press('Enter');

  // The answer arrives token by token; the first chip cannot appear before the
  // server has checked it against the stored text (ADR-0003).
  const answer = page.getByTestId('answer').last();
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(notebook.citation(1)).toBeVisible({ timeout: 60_000 });

  // The card names the source and the character range it checked.
  await notebook.citation(1).hover();
  await expect(notebook.citationCard(1)).toContainText('KI-Verordnung, Auszug');
  await expect(notebook.citationCard(1)).toContainText(/characters [\d,]+-[\d,]+/);

  // And the chip opens the document at exactly that passage: what is marked is
  // a slice of the text the model was given, not a copy of what it claimed.
  await notebook.citation(1).click();
  await expect(notebook.viewerTitle).toHaveText('KI-Verordnung, Auszug');

  const marked = await notebook.mark.textContent();
  expect(marked && marked.length > 0).toBeTruthy();

  const whole = (await page.getByTestId('source-text').textContent()) ?? '';
  const at = whole.indexOf(marked ?? '');
  expect(at).toBeGreaterThan(-1);
  expect(whole.slice(at, at + (marked?.length ?? 0))).toBe(marked);

  // A reload shows the conversation again: the turn was stored, not only drawn.
  await page.reload();
  await expect(page.getByTestId('question')).toHaveCount(1);
  await expect(page.getByTestId('answer')).toHaveCount(1);
});

test('says the sources do not cover a question they do not cover', async ({ page, request }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  const cookies = await page.context().cookies();
  const cookie = cookies.map((one) => `${one.name}=${one.value}`).join('; ');
  const apiBase = process.env.API_URL ?? 'http://127.0.0.1:3011';

  const created = await request.post(`${apiBase}/api/notebooks`, {
    headers: { cookie },
    data: { title: 'Refusal test' },
  });
  const notebookId = (await created.json()).id as string;

  await request.post(`${apiBase}/api/notebooks/${notebookId}/sources`, {
    headers: { cookie },
    data: { kind: 'paste', title: 'KI-Verordnung, Auszug', text: DOCUMENT },
  });

  await page.goto(`/n/${notebookId}`);
  const notebook = new NotebookPage(page);
  await expect(page.getByText('Pasted text · ', { exact: false })).toBeVisible({ timeout: 90_000 });

  await notebook.composer.fill(
    'Welche Geldbusse hat das Landgericht Muenchen im Fall Weber verhaengt?'
  );
  await notebook.composer.press('Enter');

  const answer = page.getByTestId('answer').last();
  await expect(answer).toHaveAttribute('data-refusal', 'true', { timeout: 60_000 });
  // docs/SPEC.md: a refusal carries no chip. The route drops one if the model
  // sends it, so this is the product's guarantee and not the model's manners.
  await expect(answer.locator('[data-testid^="cite-"]')).toHaveCount(0);
});
