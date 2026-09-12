import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The notebook screen, named the way a person would describe it.
 *
 * A page object earns its place when a spec would otherwise repeat selectors
 * that are not the point of the test. The smoke spec walks the demo path and
 * cares about the path, not about which element carries which test id; the
 * specs that are about a panel keep their own selectors, because there the
 * selector is the claim.
 */
export class NotebookPage {
  readonly sources: Locator;
  readonly chat: Locator;
  readonly studio: Locator;
  readonly composer: Locator;

  constructor(private readonly page: Page) {
    this.sources = page.getByTestId('scroll-sources');
    this.chat = page.getByTestId('scroll-chat');
    this.studio = page.getByTestId('scroll-studio');
    this.composer = page.getByLabel('Ask a question about your sources');
  }

  async openFromHome(title: string | RegExp): Promise<void> {
    await this.page.goto('/');
    await this.page.getByRole('link', { name: title }).click();
    await expect(this.sources).toBeVisible();
  }

  sourceRow(title: string | RegExp): Locator {
    return this.sources.getByRole('button', { name: title });
  }

  /** The numbered chip at the end of a sentence, counted across the answer. */
  citation(index: number): Locator {
    return this.page.getByTestId(`cite-${index}`);
  }

  citationCard(index: number): Locator {
    return this.page.getByTestId(`cite-card-${index}`);
  }

  get mark(): Locator {
    return this.page.getByTestId('passage-mark');
  }

  get viewerTitle(): Locator {
    return this.page.getByTestId('viewer-title');
  }

  async closeViewer(): Promise<void> {
    await this.page.getByTestId('viewer-close').click();
  }

  async collapse(panel: 'sources' | 'studio'): Promise<void> {
    await this.page.getByTestId(`toggle-${panel}`).click();
  }

  /** True when the document itself scrolls, which it never may. */
  async pageScrolls(): Promise<boolean> {
    return this.page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return root.scrollHeight > root.clientHeight;
    });
  }
}
