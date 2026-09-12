import { expect, test } from '@playwright/test';

import { stubApi } from '../../fixtures/api';

/**
 * The sources column and the Add sources dialog.
 *
 * From docs/PLAN.md M4-T2: four fixture sources with their status dots, select
 * all toggles all, the dialog opens on Add source and closes on Escape.
 *
 * Fixtures, no backend.
 */

test.beforeEach(async ({ page }) => {
  // No backend: the responses come from e2e/fixtures/api.ts.
  await stubApi(page);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/n/3f1b0a3c-1f2e-4c3a-9a1b-000000000001');
});

test.describe('the source list', () => {
  test('shows every source with the state it is in', async ({ page }) => {
    const items = page.locator('[data-source]');
    await expect(items).toHaveCount(4);

    // Two ready, one still being read, one that could not be read. The dot
    // carries the state in colour; the row says it in words as well, because a
    // colour alone is not a message.
    await expect(page.getByTestId('dot-s1')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('dot-s2')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('dot-s3')).toHaveAttribute('data-state', 'queued');
    await expect(page.getByTestId('dot-s4')).toHaveAttribute('data-state', 'failed');

    await expect(page.getByText('PDF · 41,200 tokens')).toBeVisible();
    await expect(page.getByText('Summarising')).toBeVisible();
    await expect(page.getByText('The file is not a readable PDF.')).toBeVisible();
  });

  test('paints the three states in three different colours', async ({ page }) => {
    const colourOf = (id: string) =>
      page.getByTestId(id).evaluate((element) => getComputedStyle(element).backgroundColor);

    const [ready, working, failed] = await Promise.all([
      colourOf('dot-s1'),
      colourOf('dot-s3'),
      colourOf('dot-s4'),
    ]);

    expect(new Set([ready, working, failed]).size).toBe(3);
  });

  test('offers no checkbox, because there is no selection to make', async ({ page }) => {
    // docs/KNOWN-LIMITS.md: an answer sees every ready source. A box that
    // promised to take one out would promise a filter nobody applies, and this
    // product sells exactly one thing - that what it shows can be checked.
    await expect(page.getByTestId('scroll-sources').getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText('Select all sources')).toHaveCount(0);
  });

  test('says how many sources the answer will see', async ({ page }) => {
    await expect(page.getByText('2 of 4 sources ready')).toBeVisible();
  });

  test('opens a ready source and leaves the others alone', async ({ page }) => {
    const list = page.getByTestId('scroll-sources');

    await expect(list.getByRole('button', { name: /Regulation/ })).toBeEnabled();
    await expect(list.getByRole('button', { name: /Internal memo/ })).toBeDisabled();
    await expect(list.getByRole('button', { name: /Board minutes/ })).toBeDisabled();
  });
});

test.describe('writing in the demo notebook', () => {
  test('lands in a copy of this session, and the reader goes with it', async ({ page }) => {
    // Copy-on-first-write (M7-T1). Das Demo-Notizbuch gehoert keiner Sitzung:
    // der Server legt beim ersten Schreibzugriff eine Kopie an und antwortet
    // mit deren Id, und die Oberflaeche wechselt dorthin. Ohne diesen Wechsel
    // haette der Leser gerade eine Quelle in ein Notizbuch geschrieben, das er
    // nicht offen hat.
    await page.goto('/n/demo');
    await expect(page.getByTestId('overview')).toBeVisible();

    await page.getByRole('button', { name: 'Add source' }).click();
    await page.getByRole('tab', { name: 'Paste text' }).click();
    await page.getByLabel('Title').fill('Meine Notiz');
    await page.getByLabel('Text').fill('Artikel 9 verlangt ein Risikomanagementsystem.');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page).toHaveURL(/\/n\/3f1b0a3c-1f2e-4c3a-9a1b-0000000000c0$/);
    // Und die Kopie ist ein normales Notizbuch: die Marke des Demos ist weg.
    await expect(page.getByTestId('demo-badge')).toHaveCount(0);
  });
});

test.describe('the Add sources dialog', () => {
  test('opens on Add source and closes on Escape', async ({ page }) => {
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add source' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Add sources')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('gives the focus to the panel and hands it back', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Add source' });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Inside the panel, not still on the button behind it.
    const inside = await page
      .getByRole('dialog')
      .evaluate((panel) => panel.contains(document.activeElement));
    expect(inside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('offers upload and paste, and no link', async ({ page }) => {
    // Fetching a URL the reader picked is cut (docs/KNOWN-LIMITS.md) and the
    // backend has no url kind, so a tab for it would offer what no route takes.
    await page.getByRole('button', { name: 'Add source' }).click();

    await expect(page.getByRole('tab', { name: 'Upload' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Paste text' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /link/i })).toHaveCount(0);
  });

  test('refuses to add pasted text without a title', async ({ page }) => {
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.getByRole('tab', { name: 'Paste text' }).click();

    const add = page.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeDisabled();

    await page.getByLabel('Text').fill('Artikel 9 verlangt ein Risikomanagementsystem.');
    await expect(add).toBeDisabled();

    await page.getByLabel('Title').fill('Notiz');
    await expect(add).toBeEnabled();
  });

  test('offers no Add button on the upload tab, where it could do nothing', async ({ page }) => {
    await page.getByRole('button', { name: 'Add source' }).click();

    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Paste text' }).click();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  });

  test('says how much room is left in the notebook', async ({ page }) => {
    await page.getByRole('button', { name: 'Add source' }).click();

    await expect(page.getByText('4 of 50 sources used')).toBeVisible();
  });

  test('closes on Cancel without adding anything', async ({ page }) => {
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-source]')).toHaveCount(4);
  });
});
