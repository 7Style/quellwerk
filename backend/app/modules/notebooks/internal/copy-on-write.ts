/**
 * Was ein Schreibzugriff auf ein Notizbuch für diese Sitzung bedeutet.
 *
 * Pure and exported, like `chatAccess` in the chat wiring: this is the whole
 * ownership rule for a write, and a rule nobody can test is a rule that quietly
 * stops holding.
 *
 * Three answers, because there are three cases and they are not variations of
 * each other. Its own notebook is written directly. A stranger's notebook does
 * not exist (404, never 403 - a 403 confirms the id, SECURITY.md 7.2). The demo
 * notebook is the interesting one: it belongs to nobody, every visitor may read
 * it, and a write in it would change what everybody else sees. So the write
 * goes to a copy that belongs to the caller, and the original stays as it was.
 */
export interface WritableNotebook {
  id: string;
  sessionId: string | null;
  isDemo: boolean;
}

export type WriteDecision =
  /** It is this session's own notebook. */
  | { kind: 'own' }
  /** The demo notebook: copy it into this session and write there. */
  | { kind: 'copy' }
  /** Somebody else's, or none at all. */
  | { kind: 'refuse' };

export function writeDecision(
  notebook: WritableNotebook | null,
  sessionId: string,
  /**
   * False for a write that cannot create anything new - asking again for a
   * report that failed, for instance. Copying the notebook for one of those
   * would leave a copy behind whose row the caller then does not find, so the
   * honest answer there is the same as for a stranger's notebook.
   */
  mayCreate = true
): WriteDecision {
  if (!notebook) return { kind: 'refuse' };
  if (notebook.sessionId === sessionId) return { kind: 'own' };
  if (notebook.isDemo && mayCreate) return { kind: 'copy' };
  return { kind: 'refuse' };
}
