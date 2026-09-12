'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { AddSourcesDialog } from './AddSourcesDialog';
import { SourceItem } from './SourceItem';
import type { SourceSummary, SourcesState } from '../types/source';

/** docs/SPEC.md, "Zahlen". Shown in the dialog foot, enforced by the route. */
const MAX_SOURCES = 50;

export interface SourcesPanelProps {
  sources: SourceSummary[];
  state?: SourcesState;
  onOpen?: (id: string) => void;
  currentSourceId?: string;
  onRetry?: () => void;
}

/**
 * The sources column: the list and the Add source button.
 *
 * It fills the panel rather than sitting inside its scroll area, because the
 * button at the bottom has to stay put while the list moves. The scroll region
 * is here, and keeps the id the shell test knows it by.
 *
 * There is no per-source selection and no select-all row. An answer sees every
 * ready source of the notebook, for the reason in docs/KNOWN-LIMITS.md: the
 * documents are cached as one prefix for an hour and dropping one would cost the
 * full price of the next turn. What the composer says underneath - how many
 * sources are ready - is true; a checkbox would not have been.
 */
export function SourcesPanel({
  sources,
  state = 'ready',
  onOpen,
  currentSourceId,
  onRetry,
}: SourcesPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="scroll-sources"
      >
        {state === 'loading' ? (
          <div className="grid gap-0.5 p-2" aria-hidden="true">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="grid grid-cols-[16px_1fr] items-start gap-2 p-2">
                <div className="mt-px h-[14px] w-[14px] rounded bg-surface-sunken" />
                <div className="grid gap-1">
                  <div className="h-[13px] w-4/5 rounded bg-surface-sunken" />
                  <div className="h-[11px] w-2/5 rounded bg-surface-sunken" />
                </div>
              </div>
            ))}
            <p className="sr-only" role="status">
              Loading the sources
            </p>
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="grid gap-3 p-4" role="alert">
            <p className="m-0 text-ui font-medium">The sources could not be loaded.</p>
            <p className="m-0 text-ink-muted">
              Nothing was lost. The documents are on the server; only this list failed to arrive.
            </p>
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

        {state === 'ready' && sources.length === 0 ? (
          <p className="m-0 p-4 text-ink-muted">
            No sources yet. Add a document and Quellwerk will read it before you ask anything.
          </p>
        ) : null}

        {state === 'ready' && sources.length > 0 ? (
          <ul className="m-0 grid list-none gap-0.5 p-2">
            {sources.map((source) => (
              <li key={source.id}>
                <SourceItem
                  source={source}
                  onOpen={onOpen}
                  current={source.id === currentSourceId}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex-none border-t border-rule p-3">
        <AddSourcesDialog sourceCount={sources.length} maxSources={MAX_SOURCES} />
      </div>
    </div>
  );
}
