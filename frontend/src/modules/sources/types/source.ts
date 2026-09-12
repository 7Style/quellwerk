/**
 * A source as the sources column needs it.
 *
 * The shape is `SourceResponse` from the backend (backend/app/modules/sources/
 * dto/source.dto.ts), field for field, so M4-T6 swaps the fixtures for the
 * endpoint without touching a component. What is deliberately not in it is the
 * text: the list draws titles, and sending a megabyte to draw a row of titles
 * would be the wrong trade. The viewer asks for the text by id (M4-T3).
 */

/** The kinds the product accepts. Website sources are cut (docs/KNOWN-LIMITS.md). */
export const SOURCE_KINDS = ['pdf', 'txt', 'md', 'docx', 'paste'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** `skipped` exists in the schema for work the worker chose not to do. */
export type SourceStatus = 'queued' | 'ready' | 'failed' | 'skipped';

/** Written to the row before each step, so a stuck source says where it stands. */
export const INGEST_STEPS = ['extract', 'measure', 'guide', 'title', 'done'] as const;
export type IngestStep = (typeof INGEST_STEPS)[number];

export interface SourceSummary {
  id: string;
  position: number;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
  /** Null once the source is ready or failed. */
  step: IngestStep | null;
  /** One sentence, already safe to show. Never carries document text. */
  error: string | null;
  charCount: number;
  tokenCount: number;
  createdAt: string;
}

/** What the panel is doing. M4-T6 drives it from the query state. */
export type SourcesState = 'loading' | 'error' | 'empty' | 'ready';

/** Only a ready source can be read or cited; the rest are not selectable. */
export function isUsable(source: SourceSummary): boolean {
  return source.status === 'ready';
}
