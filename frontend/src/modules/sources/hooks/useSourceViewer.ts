'use client';

import { useCallback, useState } from 'react';

import type { Highlight } from '@/lib/citation';

export interface ViewerTarget {
  sourceId: string;
  /** Absent when the reader opened the source from the list rather than a chip. */
  highlight: Highlight | null;
}

export interface UseSourceViewerResult {
  target: ViewerTarget | null;
  open: (sourceId: string, highlight?: Highlight | null) => void;
  close: () => void;
}

/**
 * Which source the column is showing, and what is marked in it.
 *
 * One piece of state for both, because they are one thing: a chip opens a
 * source at a passage, the list opens a source at the top, and closing goes
 * back to the list. Keeping the mark separately would allow the fourth
 * combination - a mark with no source open - which means nothing.
 *
 * The hook holds no text. The viewer is handed the source it should draw, so
 * the same component works against fixtures now and against the endpoint in
 * M4-T6 without knowing which it is.
 */
export function useSourceViewer(): UseSourceViewerResult {
  const [target, setTarget] = useState<ViewerTarget | null>(null);

  const open = useCallback((sourceId: string, highlight: Highlight | null = null) => {
    setTarget({ sourceId, highlight });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  return { target, open, close };
}
