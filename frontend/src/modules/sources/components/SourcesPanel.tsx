'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { AddSourcesDialog } from './AddSourcesDialog';
import { SourceItem } from './SourceItem';
import { isUsable, type SourceSummary, type SourcesState } from '../types/source';

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
 * The sources column: the list, the select-all row and the Add source button.
 *
 * It fills the panel rather than sitting inside its scroll area, because the
 * button at the bottom has to stay put while the list moves. The scroll region
 * is here, and keeps the id the shell test knows it by.
 *
 * On the checkboxes: they toggle, and today they change nothing about an answer.
 * docs/KNOWN-LIMITS.md explains why there is no per-source selection - the
 * documents are cached for an hour as one prefix and dropping one would cost the
 * full price of the next turn - and docs/PLAN.md M4-T2 asks for select-all all
 * the same. A control that promises a filter it does not apply is the kind of
 * thing this product cannot afford twice, so the decision belongs to the person
 * who wrote both documents before the composer starts printing "3 of 4 sources
 * selected" in M4-T4.
 */
export function SourcesPanel({
  sources,
  state = 'ready',
  onOpen,
  currentSourceId,
  onRetry,
}: SourcesPanelProps) {
  const usable = useMemo(() => sources.filter(isUsable), [sources]);
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());

  // Selection is kept as the set that is OFF, so a source that finishes reading
  // arrives selected instead of silently excluded.
  const selectedCount = usable.filter((source) => !deselected.has(source.id)).length;
  const allSelected = usable.length > 0 && selectedCount === usable.length;

  function setSelected(id: string, selected: boolean) {
    setDeselected((current) => {
      const next = new Set(current);
      if (selected) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(selected: boolean) {
    setDeselected(selected ? new Set() : new Set(usable.map((source) => source.id)));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {state === 'ready' && sources.length > 0 ? (
        <div className="flex flex-none items-center gap-2 border-b border-rule px-3 py-2 text-small text-ink-muted">
          <input
            id="select-all-sources"
            type="checkbox"
            checked={allSelected}
            disabled={usable.length === 0}
            onChange={(event) => toggleAll(event.target.checked)}
            className="cursor-pointer accent-[var(--ink)]"
          />
          <label htmlFor="select-all-sources" className="cursor-pointer">
            Select all sources
          </label>
          <span className="flex-1" />
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="scroll-sources"
      >
        {state === 'loading' ? (
          <div className="grid gap-0.5 p-2" aria-hidden="true">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="grid grid-cols-[auto_1fr] items-start gap-2 p-2">
                <div className="mt-px h-[15px] w-[15px] rounded bg-surface-sunken" />
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
                  selected={!deselected.has(source.id)}
                  onSelectedChange={(selected) => setSelected(source.id, selected)}
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
