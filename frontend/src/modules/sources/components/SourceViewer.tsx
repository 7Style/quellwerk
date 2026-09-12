'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import type { Highlight } from '@/lib/citation';
import { SourcePassage } from './SourcePassage';

export interface ViewerSource {
  id: string;
  title: string;
  /** The stored text. Fetched by id, never carried in the source list. */
  text: string;
}

export interface SourceViewerProps {
  source: ViewerSource | null;
  highlight: Highlight | null;
  onClose: () => void;
  /** True while the text is being fetched (M4-T6). */
  loading?: boolean;
  /** Set when the fetch failed. One sentence, already safe to show. */
  error?: string | null;
  onRetry?: () => void;
}

/**
 * The source, in the column where the list was.
 *
 * It replaces the list rather than opening beside it, which is what the
 * prototype does and what the width allows: 300px has room for one thing. The
 * way back is the chevron, and it is the first thing in the tab order for that
 * reason.
 */
export function SourceViewer({
  source,
  highlight,
  onClose,
  loading = false,
  error = null,
  onRetry,
}: SourceViewerProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="source-viewer">
      <div className="flex flex-none items-center gap-2 border-b border-rule px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Back to sources"
          data-testid="viewer-close"
        >
          <Icon name="chevronLeft" />
        </Button>
        <span className="truncate text-ui font-medium" data-testid="viewer-title">
          {source?.title ?? 'Source'}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="scroll-sources"
      >
        {loading ? (
          <div className="grid gap-2 p-4" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((line) => (
              <div key={line} className="h-[14px] w-full rounded bg-surface-sunken" />
            ))}
            <p className="sr-only" role="status">
              Opening the source
            </p>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="grid gap-3 p-4" role="alert">
            <p className="m-0 text-ui font-medium">This source could not be opened.</p>
            <p className="m-0 text-ink-muted">{error}</p>
            {onRetry ? (
              <Button
                variant="outline"
                type="button"
                onClick={onRetry}
                className="justify-self-start"
              >
                <Icon name="refresh" />
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && source ? (
          <SourcePassage text={source.text} highlight={highlight} />
        ) : null}
      </div>
    </div>
  );
}
