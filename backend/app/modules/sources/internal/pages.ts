/**
 * Page map: which character range of the stored text came from which page.
 *
 * A citation carries character offsets into `Source.text` and nothing else
 * (ADR-0010). The page is not lost, it is derived: this map turns an offset
 * back into a page number so the hover can say "Seite 7" while the highlight
 * still marks exactly the cited characters.
 *
 * The map is built while the text is assembled, never by searching for page
 * texts afterwards. Searching would find the wrong occurrence the first time a
 * heading repeats.
 */
import { isNormalized, normalize } from './normalize.js';

/** Between two pages, so a sentence never runs into the next page's heading. */
export const PAGE_SEPARATOR = '\n\n';

export interface PageSpan {
  /** 1-based, as a reader counts pages. */
  page: number;
  /** Inclusive character offset into the assembled text. */
  start: number;
  /** Exclusive. `text.slice(start, end)` is this page's normalised text. */
  end: number;
}

export interface PagedText {
  text: string;
  pages: PageSpan[];
}

/**
 * Assembles the per-page texts into the one string that is stored, sent to the
 * model and rendered, plus the map from pages to offsets.
 *
 * An empty page keeps its number and gets a zero-length span: dropping it would
 * shift every later page number by one, and a page number that is off by one is
 * worse than a page that is empty.
 */
export function buildPagedText(pageTexts: readonly string[]): PagedText {
  const pages: PageSpan[] = [];
  let text = '';

  for (const [index, raw] of pageTexts.entries()) {
    const page = normalize(raw);
    // The separator goes between two non-empty pages only. Adding it around an
    // empty page would produce three newlines, and the result would no longer
    // be in normal form.
    if (text.length > 0 && page.length > 0) {
      text += PAGE_SEPARATOR;
    }
    const start = text.length;
    text += page;
    pages.push({ page: index + 1, start, end: text.length });
  }

  return { text, pages };
}

/**
 * The page an offset falls on, or null when it falls outside. A citation that
 * spans a page break is reported at the page it starts on, which is the page a
 * reader would name.
 */
export function pageAt(pages: readonly PageSpan[], offset: number): number | null {
  if (offset < 0) {
    return null;
  }
  for (const span of pages) {
    // Zero-length spans (empty pages) can never contain an offset.
    if (offset >= span.start && offset < span.end) {
      return span.page;
    }
  }
  // The very end of the text belongs to the last page that has content.
  const last = [...pages].reverse().find((span) => span.end > span.start);
  if (last && offset === last.end) {
    return last.page;
  }
  return null;
}

/** Guard used by the tests and by ingest: the assembled text must be in normal form. */
export function assertNormalized(text: string): void {
  if (!isNormalized(text)) {
    throw new Error('assembled page text is not in normal form');
  }
}
