import { expect, test } from '@playwright/test';

import { CITED, stubApi } from '../../fixtures/api';
import { NotebookPage } from '../../pages/notebook.page';

/**
 * The studio panel and the report it opens.
 *
 * From docs/PLAN.md M6-T2: a generating report shows its step, a finished
 * report renders chips that open the source, the prompt dialog shows the
 * rendered file.
 *
 * The middle claim is the one that matters. A report is read away from the
 * conversation, often by somebody who was not there, so a chip in it has to
 * carry the reader into the document the same way a chip in an answer does.
 */

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test.describe('the panel', () => {
  test('offers the five formats', async ({ page }) => {
    // By test id, not by text: a format that has already been written appears
    // twice in this column, once as an offer and once as the report itself.
    for (const format of ['briefing', 'study-guide', 'faq', 'timeline', 'custom']) {
      await expect(page.getByTestId(`request-${format}`)).toBeVisible();
    }
  });

  test('does not offer a format that has already been written', async ({ page }) => {
    // Asking twice gives the same report back: the route is idempotent. An
    // enabled button that quietly does nothing would promise a second report
    // the server will not write.
    await expect(page.getByTestId('request-briefing')).toBeDisabled();
    await expect(page.getByTestId('request-study-guide')).toBeEnabled();
    // A failed one counts as written too: its row carries the retry, and a
    // second offer above it would make two rows for one report.
    await expect(page.getByTestId('request-timeline')).toBeDisabled();
  });

  test('says what is happening to a report that is being written', async ({ page }) => {
    await expect(page.locator('[data-report="r-writing"]')).toHaveAttribute(
      'data-status',
      'running'
    );
    await expect(page.getByTestId('state-r-writing')).toHaveText(
      'Reading the sources and writing'
    );
    // Not openable while it is being written.
    await expect(
      page.locator('[data-report="r-writing"]').getByRole('button').first()
    ).toBeDisabled();
  });

  test('shows why a report failed, and offers to ask again', async ({ page }) => {
    const failed = page.locator('[data-report="r-failed"]');

    await expect(failed).toContainText('The model was busy. Try again in a moment.');
    await expect(page.getByTestId('retry-r-failed')).toBeVisible();
  });

  test('says so when a report has been written for longer than that can mean', async ({
    page,
  }) => {
    // Not a spinner that never ends (docs/SPEC.md). The row stops claiming to
    // be in progress and says what is actually the case.
    await expect(page.getByTestId('state-r-stalled')).toHaveText('Taking too long');
    await expect(page.getByTestId('stuck-r-stalled')).toContainText(
      'the writer on the server did not pick it up'
    );
    // The fresh one next to it still reads as work in progress.
    await expect(page.getByTestId('state-r-writing')).toHaveText(
      'Reading the sources and writing'
    );
  });

  test('asks for Create your own before writing it', async ({ page }) => {
    await page.getByTestId('request-custom').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Without a description there is no report to write, and inventing one
    // would be the opposite of a format the reader chose.
    await expect(dialog.getByRole('button', { name: 'Write it' })).toBeDisabled();

    await dialog.getByLabel('Describe the report').fill('Only the deadlines, one page');
    await expect(dialog.getByRole('button', { name: 'Write it' })).toBeEnabled();
  });
});

test.describe('a refused request', () => {
  test('keeps the description the reader typed', async ({ page }) => {
    await stubApi(page, {
      refuseReport: {
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many artifacts in this hour. The limit resets on the hour.',
      },
    });
    await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');

    await page.getByTestId('request-custom').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Describe the report').fill('Only the deadlines, one page');
    await dialog.getByRole('button', { name: 'Write it' }).click();

    // Five lines typed and a 429 is not a reason to type them again.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Describe the report')).toHaveValue(
      'Only the deadlines, one page'
    );
    await expect(page.getByTestId('studio-error')).toHaveText(
      'Too many artifacts in this hour. The limit resets on the hour.'
    );
  });
});

test.describe('a finished report', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('[data-report="r-ready"]').getByRole('button').first().click();
    await expect(page.getByTestId('report-view')).toBeVisible();
  });

  test('takes the column and keeps the composer out of it', async ({ page }) => {
    await expect(page.getByTestId('thread')).toHaveCount(0);
    // The conversation's box does not belong over a report; the way back is the
    // chevron at the top.
    await expect(page.getByLabel('Ask a question about your sources')).toHaveCount(0);
  });

  test('renders chips that open the source at the passage', async ({ page }) => {
    const notebook = new NotebookPage(page);

    await expect(page.getByText('2 citations')).toBeVisible();

    await notebook.citation(2).click();

    await expect(notebook.viewerTitle).toHaveText(
      'Regulation (EU) 2024/1689, Chapter III (excerpt)'
    );
    // Exactly what the citation claimed, sliced out of the stored text.
    expect(await notebook.mark.textContent()).toBe(CITED[1]);
  });

  test('reads the markup as a document instead of showing it', async ({ page }) => {
    const body = page.getByTestId('report-body');

    // The title is the first heading whatever it was marked with: the prompt
    // asks for one first-level heading and the model writes two hashes anyway.
    await expect(body.getByRole('heading', { level: 1 })).toHaveText(
      'Pflichten für Hochrisiko-KI-Systeme'
    );
    await expect(body.getByRole('heading', { level: 2 })).toHaveText([
      'Das Wichtigste in Kürze',
      'Wo sich die Quellen widersprechen',
    ]);
    await expect(body.getByRole('heading', { level: 3 })).toHaveText('Risikomanagement (Artikel 9)');
    // And the hashes themselves never reach the reader.
    expect(await body.textContent()).not.toContain('#');
  });

  test('shows the prompt that produced it, verbatim', async ({ page }) => {
    await page.getByTestId('view-prompt').click();

    const shown = await page.getByTestId('prompt-used').textContent();
    // The rendered file, not the template and not a description of it. The
    // structure block comes through with its angle brackets intact, which is
    // the one place in this repository that renders raw.
    expect(shown).toContain('Write a report from the documents above.');
    expect(shown).toContain('# ‹Title›');
  });

  test('goes back to the conversation', async ({ page }) => {
    await page.getByTestId('report-close').click();

    await expect(page.getByTestId('report-view')).toHaveCount(0);
    await expect(page.getByTestId('thread')).toBeVisible();
    await expect(page.getByLabel('Ask a question about your sources')).toBeVisible();
  });
});
