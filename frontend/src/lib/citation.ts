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
