/**
 * Verifies every citation against the stored text before anything renders it.
 *
 * This is the one check the whole product rests on. Quellwerk's claim is not
 * that the answer reads well; it is that every sentence is traceable to an
 * exact character range in a source the user added. A chip that points at the
 * wrong range is worse than no chip at all, because it invites a reader to
 * check and then confirms a lie.
 *
 * The rule, from CLAUDE.md and ADR-0003:
 *
 *   source.text.slice(start_char_index, end_char_index) === cited_text
 *
 * Not "close enough", not after normalising again, not after trimming. The
 * stored text was normalised once at ingest and never touched since; the model
 * received exactly that string, so an honest citation reproduces it exactly.
 *
 * A mismatch is dropped and counted. What gets logged is ids, offsets and
 * lengths - never the cited text and never the slice. Both are source content,
 * and source content does not go into logs.
 */
import type Anthropic from '@anthropic-ai/sdk';

/** A source as the resolver needs it: the stored text and nothing else. */
export interface CitableSource {
  id: string;
  title: string;
  text: string;
}

/** A citation that survived the check and may be rendered. */
export interface VerifiedCitation {
  sourceId: string;
  sourceTitle: string;
  /** Character offsets into the stored text. What the viewer marks. */
  start: number;
  end: number;
  /** Byte for byte what stands at those offsets. */
  text: string;
  /** 1-based page for the hover, or null for a source without pages. */
  page: number | null;
}

/**
 * Why a citation was dropped. Enough to find the bug, nothing that could carry
 * document content.
 */
export interface DroppedCitation {
  reason: 'unknown-document' | 'out-of-range' | 'mismatch' | 'unsupported-location';
  /** Null when the document index could not be mapped to a source at all. */
  sourceId: string | null;
  documentIndex: number | null;
  start: number | null;
  end: number | null;
  citedLength: number | null;
  sliceLength: number | null;
}

export interface ResolveResult {
  kept: VerifiedCitation[];
  dropped: DroppedCitation[];
}

/** Maps an offset to its 1-based page, or null when the source has no pages. */
export type PageResolver = (sourceId: string, offset: number) => number | null;

export interface ResolveOptions {
  /**
   * Position in this array is the `document_index` a citation carries. It comes
   * from the request builder, which emitted the document blocks in exactly this
   * order (prompts/README.md).
   */
  sourceIds: readonly string[];
  sources: ReadonlyMap<string, CitableSource>;
  pageAt?: PageResolver;
}

/**
 * The Citations API returns several location types. Only `char_location`
 * carries character offsets into a text document, which is the only kind
 * Quellwerk sends (ADR-0010).
 *
 * Anything else is dropped rather than guessed at: a `page_location` would make
 * the viewer mark a page it cannot resolve to characters, and a citation that
 * cannot be checked is exactly what this file exists to refuse.
 */
function isCharLocation(
  citation: Anthropic.TextCitation
): citation is Anthropic.CitationCharLocation {
  return citation.type === 'char_location';
}

export function resolveCitations(
  citations: readonly Anthropic.TextCitation[],
  options: ResolveOptions
): ResolveResult {
  const kept: VerifiedCitation[] = [];
  const dropped: DroppedCitation[] = [];

  for (const citation of citations) {
    if (!isCharLocation(citation)) {
      dropped.push({
        reason: 'unsupported-location',
        sourceId: null,
        documentIndex: null,
        start: null,
        end: null,
        citedLength: null,
        sliceLength: null,
      });
      continue;
    }

    const documentIndex = citation.document_index;
    const sourceId = options.sourceIds[documentIndex] ?? null;
    const source = sourceId ? options.sources.get(sourceId) : undefined;

    if (!source) {
      // The index pointed outside the list the builder emitted. That is a bug
      // on our side, not a bad answer, and it is worth seeing in the log.
      dropped.push({
        reason: 'unknown-document',
        sourceId,
        documentIndex,
        start: citation.start_char_index,
        end: citation.end_char_index,
        citedLength: citation.cited_text.length,
        sliceLength: null,
      });
      continue;
    }

    const start = citation.start_char_index;
    const end = citation.end_char_index;
    const inRange = start >= 0 && end <= source.text.length && start < end;

    if (!inRange) {
      dropped.push({
        reason: 'out-of-range',
        sourceId: source.id,
        documentIndex,
        start,
        end,
        citedLength: citation.cited_text.length,
        sliceLength: null,
      });
      continue;
    }

    const slice = source.text.slice(start, end);

    if (slice !== citation.cited_text) {
      dropped.push({
        reason: 'mismatch',
        sourceId: source.id,
        documentIndex,
        start,
        end,
        // Lengths, not the strings. Both are source content.
        citedLength: citation.cited_text.length,
        sliceLength: slice.length,
      });
      continue;
    }

    kept.push({
      sourceId: source.id,
      sourceTitle: source.title,
      start,
      end,
      // The slice, not `cited_text`. They are equal by the check above, and
      // taking the slice makes the stored text the single source of truth even
      // if that ever stops being so.
      text: slice,
      page: options.pageAt?.(source.id, start) ?? null,
    });
  }

  return { kept, dropped };
}

/**
 * An answer as it is stored and rendered: text, and the verified citations that
 * belong to it.
 *
 * The segments are what the UI draws chips from. A segment carries no offset
 * into the ANSWER, because the Citations API attaches citations to a text
 * block, not to a character range of the answer; the chip sits at the end of
 * the block it belongs to.
 */
export interface AnswerSegment {
  text: string;
  citations: VerifiedCitation[];
}

export interface ResolvedAnswer {
  segments: AnswerSegment[];
  /** Counted for the Trace panel and for the eval. */
  droppedCitations: DroppedCitation[];
}

/**
 * Walks the content blocks of a finished answer and verifies every citation in
 * them.
 *
 * Thinking blocks are skipped: they carry no citations, and their text is a
 * summary of reasoning rather than an answer. Whatever the model thought is not
 * what it claimed.
 */
export function resolveAnswer(
  content: readonly Anthropic.ContentBlock[],
  options: ResolveOptions
): ResolvedAnswer {
  const segments: AnswerSegment[] = [];
  const droppedCitations: DroppedCitation[] = [];

  for (const block of content) {
    if (block.type !== 'text') continue;

    const { kept, dropped } = resolveCitations(block.citations ?? [], options);
    segments.push({ text: block.text, citations: kept });
    droppedCitations.push(...dropped);
  }

  return { segments, droppedCitations };
}

/**
 * The answer as one string.
 *
 * The text blocks of a cited answer are contiguous pieces of one prose text,
 * not paragraphs. The API opens a new block wherever a citation begins and ends,
 * so "The rules apply from" and " 2 August 2027" arrive as two blocks that were
 * never meant to be apart. Joining them with a blank line tears every sentence
 * open at its chip, and everything that reads the answer as text afterwards -
 * the follow-up call, the replayed history, the eval judge - reads something no
 * reader ever saw.
 */
export function answerText(segments: readonly { text: string }[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** True when the answer carries no citation at all, which a refusal must not. */
export function hasNoCitations(answer: ResolvedAnswer): boolean {
  return answer.segments.every((segment) => segment.citations.length === 0);
}
