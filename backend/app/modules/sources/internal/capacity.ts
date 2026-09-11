/**
 * The three caps from docs/SPEC.md, decided in one pure function.
 *
 * Pure, because the interesting part is the arithmetic and the wording, and
 * both should be testable without a request, a database or a model. The route
 * gathers the numbers; this decides.
 *
 * Where each cap is enforced, and why not all three in the same place:
 *
 *   sources   here, always. The count is known before anything is read.
 *   bytes     at the multer limit, before the file reaches the disk. Reading
 *             20 MB into memory to then refuse it is the wrong order.
 *   tokens    here when the text is already known, which is pasted text; for
 *             an uploaded file the count only exists after extraction, and
 *             extraction belongs to the worker (docs/ARCHITECTURE.md). There
 *             the same cap ends the job as `failed` with a reason instead of a
 *             413, because by then the response is long gone.
 *
 * That split is the one decision in this file that is not obvious, and it is
 * deliberate: a notebook that is already full is refused at the door, in every
 * case, and a file that only turns out to be too large after extraction fails
 * visibly on the source row.
 */

export interface CapacityLimits {
  maxSources: number;
  maxTokens: number;
}

export interface NotebookCapacity {
  /** Sources already in the notebook, whatever their status. */
  sourceCount: number;
  /** Measured total of the notebook's sources, from a real count-tokens call. */
  tokenCount: number;
}

export interface CapacityRequest {
  /**
   * Tokens the new source would add, when they are known at this point. Absent
   * for an uploaded file, whose text does not exist yet.
   */
  addedTokens?: number;
}

export type CapacityReason = 'sources' | 'tokens';

export interface CapacityRefusal {
  reason: CapacityReason;
  /** Shown to the user as it stands, so it says what to do next. */
  message: string;
  /** For the log and for the UI, never a bare "limit reached". */
  limit: number;
  current: number;
}

/** Thousands separators, because 150000 in a sentence is a number nobody reads. */
function readable(value: number): string {
  return value.toLocaleString('en-US');
}

export function checkCapacity(
  notebook: NotebookCapacity,
  request: CapacityRequest,
  limits: CapacityLimits
): CapacityRefusal | null {
  if (notebook.sourceCount >= limits.maxSources) {
    return {
      reason: 'sources',
      message: `This notebook already holds ${limits.maxSources} sources. Remove one before adding another.`,
      limit: limits.maxSources,
      current: notebook.sourceCount,
    };
  }

  // A full notebook is refused before anything is read, even when the new
  // source's size is still unknown. Nothing can be added to it in any case, and
  // finding that out after an upload and an extraction helps nobody.
  if (notebook.tokenCount >= limits.maxTokens) {
    return {
      reason: 'tokens',
      message: `This notebook is at its limit of ${readable(limits.maxTokens)} tokens. Remove a source before adding another.`,
      limit: limits.maxTokens,
      current: notebook.tokenCount,
    };
  }

  if (request.addedTokens !== undefined) {
    const total = notebook.tokenCount + request.addedTokens;
    if (total > limits.maxTokens) {
      return {
        reason: 'tokens',
        message:
          `That source has ${readable(request.addedTokens)} tokens and the notebook would come to ` +
          `${readable(total)}, over the limit of ${readable(limits.maxTokens)}. Shorten it or remove a source.`,
        limit: limits.maxTokens,
        current: total,
      };
    }
  }

  return null;
}
