/**
 * What the home grid needs about a notebook, and nothing more.
 *
 * The shape is the one the API will return in M4-T6, so replacing the fixtures
 * with an endpoint is a change of source and not a change of type. `emoji` is
 * data the user picks, not decoration: it is the only picture on the card and
 * the one thing that tells two notebooks apart at a glance (docs/SPEC.md).
 */
export interface NotebookSummary {
  id: string;
  emoji: string;
  title: string;
  sourceCount: number;
  /** ISO. Rendered as "2 hours ago" by the card. */
  updatedAt: string;
  /** True while the notebook has never been written to. Changes the meta line. */
  isNew?: boolean;
  /** What the overview job wrote once a source was ready. Null until then. */
  summary?: string | null;
  /** Four of them, or none yet. Written by the same job as the summary. */
  suggestedQuestions?: string[];
  /**
   * The demo notebook: in every visitor's list, in nobody's ownership.
   *
   * The card says so, because the grid otherwise offers a notebook that refuses
   * the first thing anybody tries in it (SECURITY.md 7.2).
   */
  isDemo?: boolean;
}

/** What the grid is doing right now. M4-T6 drives it from the query state. */
export type NotebooksState = 'loading' | 'error' | 'empty' | 'ready';

export type NotebookSort = 'recent' | 'title' | 'sources';
