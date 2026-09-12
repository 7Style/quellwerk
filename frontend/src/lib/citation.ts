/**
 * A citation that survived the server's check.
 *
 * The shape is `VerifiedCitation` from backend/app/modules/chat/internal/
 * citations.ts. Nothing unverified ever reaches the browser: the route slices
 * the stored text at these offsets and compares it with what the model claimed
 * before the chip is sent (CLAUDE.md, ADR-0003). So `text` here is not the
 * model's word for it - it is the slice.
 *
 * It lives in lib/ rather than in a module because two modules need it and a
 * module may not import another one: chat draws the chip, sources marks the
 * passage. The page wires the click from one to the other.
 */
export interface Citation {
  sourceId: string;
  sourceTitle: string;
  /** Character offsets into the stored text, which is normalised once at ingest. */
  start: number;
  end: number;
  /** Exactly what stands between those offsets. */
  text: string;
  /** 1-based page, or null for a source without pages. */
  page: number | null;
}

/** Where the viewer should scroll and what it should mark. */
export interface Highlight {
  start: number;
  end: number;
}

export function highlightOf(citation: Citation): Highlight {
  return { start: citation.start, end: citation.end };
}

/**
 * Builds a citation the way the server would: by finding the quote in the text
 * and taking its offsets, never by writing numbers down.
 *
 * For fixtures only, and in lib/ because the fixtures of two modules need it -
 * chat's chips and the source viewer - and a module may not import another one.
 * Offsets typed by hand into a fixture are offsets that drift the first time
 * someone fixes a typo in the text, and a viewer test that marks the wrong
 * range would still be green.
 *
 * Throws on a quote that is not there, or that is there twice: both mean the
 * fixture is asking for something it cannot point at unambiguously.
 */
export function citeQuote(
  source: { id: string; title: string; text: string },
  quote: string,
  page: number | null = null
): Citation {
  const start = source.text.indexOf(quote);
  if (start === -1)
    throw new Error(`fixture quote not found in ${source.id}: ${quote.slice(0, 40)}`);
  if (source.text.indexOf(quote, start + 1) !== -1) {
    throw new Error(`fixture quote occurs twice in ${source.id}: ${quote.slice(0, 40)}`);
  }

  return {
    sourceId: source.id,
    sourceTitle: source.title,
    start,
    end: start + quote.length,
    text: source.text.slice(start, start + quote.length),
    page,
  };
}
