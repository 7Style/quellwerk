/**
 * What may be written about an error that came back from a library.
 *
 * `logger.error` writes `error.message` and `error.stack`, and for the two
 * libraries this application hands documents to, the message is the risk. An
 * Anthropic 400 quotes the block it rejected, and a Prisma validation error
 * prints the statement it could not run - and in this product a statement holds
 * the source text. CLAUDE.md and SECURITY.md 7.5 both say the same thing: source
 * text never reaches a log.
 *
 * So the message is dropped and what is left is what actually helps at three in
 * the morning: the class, the status or code, the request id, and the first
 * frames of the stack. The frames start at index one, because the first line of
 * a stack is the message again.
 *
 * The row a reader sees is a separate question and a stricter one - a sentence
 * from a fixed list (`report.job.ts`, `ingest.job.ts`); this is the log.
 */
export interface SafeCause {
  name: string;
  /** HTTP status of an SDK error, when there is one. */
  status?: number;
  /** Prisma's `P2002` and friends. */
  code?: string;
  requestId?: string;
  at?: string[];
}

export function safeCause(error: unknown): SafeCause {
  if (!(error instanceof Error)) {
    // Never the value itself: a thrown string is a message with no class.
    return { name: typeof error };
  }

  const carrier = error as Error & {
    status?: unknown;
    code?: unknown;
    requestID?: unknown;
    request_id?: unknown;
  };

  const requestId = carrier.requestID ?? carrier.request_id;

  return {
    name: error.name,
    ...(typeof carrier.status === 'number' ? { status: carrier.status } : {}),
    ...(typeof carrier.code === 'string' ? { code: carrier.code } : {}),
    ...(typeof requestId === 'string' ? { requestId } : {}),
    ...(error.stack ? { at: error.stack.split('\n').slice(1, 4).map((line) => line.trim()) } : {}),
  };
}
