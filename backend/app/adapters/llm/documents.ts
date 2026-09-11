/**
 * Builds the document blocks that both request builders send.
 *
 * One place, because two things depend on the order and must never disagree
 * about it: the cache prefix (system plus all documents, with the one-hour
 * breakpoint on the last block) and the citation resolver, which maps a
 * `document_index` back to a source id by counting document blocks from zero
 * (prompts/README.md). If chat and artifacts ordered their documents
 * differently, a citation resolved through the wrong list would point at the
 * wrong source and still look perfectly valid.
 *
 * Deliberately ignorant of the database. It takes plain values, not Prisma
 * rows, so the adapter layer never learns what a module's table looks like.
 */
import type Anthropic from '@anthropic-ai/sdk';

/** What a document block needs to know about a source, and nothing more. */
export interface DocumentSource {
  id: string;
  /** Order within the notebook. Ties are broken by id so the order is total. */
  position: number;
  title: string;
  kind: string;
  /** The stored, normalised text. Never touched here (ADR-0003). */
  text: string;
  /** Pages for a PDF, null for formats that have none. */
  pageCount?: number | null;
}

export interface BuildDocumentsOptions {
  /**
   * Citations on for chat and reports, off for artifacts. The two cannot be
   * combined with structured outputs (HTTP 400), which is why there are two
   * builders in the first place (ADR-0007).
   */
  citations: boolean;
  /**
   * Applied to the LAST block only, never to any other. A breakpoint in the
   * middle of the documents would cache a prefix that the next turn does not
   * repeat.
   */
  cacheControl?: Anthropic.CacheControlEphemeral | null;
}

export interface BuiltDocuments {
  blocks: Anthropic.DocumentBlockParam[];
  /**
   * Position in this array is the `document_index` a citation carries. The
   * resolver maps through it; nothing else may reorder the blocks afterwards.
   */
  sourceIds: string[];
  /** Characters over all documents. A cheap sanity number, not a token count. */
  chars: number;
}

/**
 * A title is user data: it comes from a file name or from what someone typed.
 * It travels as a field of the document block, never into the system prompt,
 * and it is put on one line so it cannot pretend to be structure. Nothing else
 * happens to it: no shortening, no escaping. Length limits belong to the zod
 * schema of the route that accepted it.
 */
function oneLine(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * `context` is informational for the model and never comes back in a citation.
 * It carries the page COUNT, not the page map: the offset to page lookup is a
 * server-side concern (modules/sources/internal/pages.ts), and twenty-five span
 * objects in the cached prefix would cost tokens on every single turn to tell
 * the model something it cannot use.
 */
function contextFor(source: DocumentSource): string {
  return JSON.stringify({
    sourceId: source.id,
    kind: source.kind,
    pages: source.pageCount ?? null,
  });
}

/**
 * The order the document blocks go out in, and therefore the meaning of
 * `document_index` in every citation that comes back.
 *
 * Exported because the caller has to be able to produce the same order. Position
 * alone does not decide it: two sources can share a position after a re-order or
 * a duplicate upload, and a database that breaks the tie its own way while this
 * file breaks it by id gives `document_index` a different meaning on each side.
 * The citation check would usually catch that as a mismatch - and would not
 * catch it at all for the same file uploaded twice, where the slice matches and
 * the chip points at the wrong source.
 */
export function byDocumentOrder(left: DocumentSource, right: DocumentSource): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

export function buildDocuments(
  sources: readonly DocumentSource[],
  options: BuildDocumentsOptions
): BuiltDocuments {
  const ordered = [...sources].sort(byDocumentOrder);

  const blocks: Anthropic.DocumentBlockParam[] = ordered.map((source) => ({
    type: 'document',
    source: { type: 'text', media_type: 'text/plain', data: source.text },
    title: oneLine(source.title),
    context: contextFor(source),
    citations: { enabled: options.citations },
  }));

  const last = blocks.at(-1);
  if (last && options.cacheControl) {
    last.cache_control = options.cacheControl;
  }

  return {
    blocks,
    sourceIds: ordered.map((source) => source.id),
    chars: ordered.reduce((sum, source) => sum + source.text.length, 0),
  };
}

/**
 * Maps a citation's `document_index` back to a source id.
 *
 * Zero-based over document blocks only, across all messages. An index outside
 * the list is not an error to throw on: it is a citation to drop, and the
 * caller logs it with ids and lengths (CLAUDE.md).
 */
export function sourceIdForDocumentIndex(
  built: Pick<BuiltDocuments, 'sourceIds'>,
  documentIndex: number
): string | null {
  return built.sourceIds[documentIndex] ?? null;
}
