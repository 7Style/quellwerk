'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { NotebookCard } from './NotebookCard';
import type { NotebookSort, NotebookSummary, NotebooksState } from '../types/notebook';

export interface NotebookGridProps {
  notebooks: NotebookSummary[];
  /** M4-T6 drives this from the query. With fixtures it is always 'ready'. */
  state?: NotebooksState;
  onCreate?: () => void;
  onRetry?: () => void;
}

const SORTS: Array<{ value: NotebookSort; label: string }> = [
  { value: 'recent', label: 'Most recent' },
  { value: 'title', label: 'Title' },
  { value: 'sources', label: 'Most sources' },
];

function sortNotebooks(notebooks: NotebookSummary[], sort: NotebookSort): NotebookSummary[] {
  const copy = [...notebooks];
  if (sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'sources') return copy.sort((a, b) => b.sourceCount - a.sourceCount);
  return copy.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/**
 * The home grid, with the four states every panel in M4 owns for itself.
 *
 * Search and sort run over what the component was handed. That is right for a
 * demo with tens of notebooks and wrong for thousands; the day it is wrong, the
 * query moves to the server and this component keeps its props.
 */
export function NotebookGrid({ notebooks, state = 'ready', onCreate, onRetry }: NotebookGridProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<NotebookSort>('recent');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? notebooks.filter((notebook) => notebook.title.toLowerCase().includes(needle))
      : notebooks;
    return sortNotebooks(matching, sort);
  }, [notebooks, query, sort]);

  if (state === 'error') {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-surface border border-dashed border-rule p-6"
        role="alert"
      >
        <p className="m-0 text-ui-lg font-medium">Your notebooks could not be loaded.</p>
        <p className="m-0 text-ink-muted">
          The list is on the server and the server did not answer. Nothing was lost.
        </p>
        {onRetry ? (
          <Button variant="outline" type="button" onClick={onRetry}>
            <Icon name="refresh" />
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3 border-b border-rule pb-3">
        <div className="relative w-[260px]">
          <label className="sr-only" htmlFor="home-search">
            Search notebooks
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-2 left-2.5 text-ink-faint"
          />
          <input
            id="home-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notebooks"
            disabled={state === 'loading'}
            className="h-[32px] w-full rounded-control border border-rule-strong bg-surface pr-3 pl-8 text-ui focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <span className="flex-1" />
        <label className="sr-only" htmlFor="home-sort">
          Sort by
        </label>
        <select
          id="home-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as NotebookSort)}
          disabled={state === 'loading'}
          className="h-[32px] rounded-control border border-rule-strong bg-surface px-2 text-ui"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-4 p-0">
        <li>
          <button
            type="button"
            onClick={onCreate}
            className="flex h-full min-h-[148px] w-full flex-col items-center justify-center gap-2 rounded-surface border border-dashed border-rule-strong font-medium text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Icon name="plus" size="lg" />
            Create new notebook
          </button>
        </li>

        {state === 'loading'
          ? // Three, because the grid is three wide at 1280 and a single
            // skeleton reads as a card that failed rather than as a wait.
            [0, 1, 2].map((slot) => (
              <li key={slot}>
                <div
                  className="flex h-full min-h-[148px] flex-col gap-3 rounded-surface border border-rule bg-surface p-4"
                  aria-hidden="true"
                >
                  <div className="h-[22px] w-[24px] rounded bg-surface-sunken" />
                  <div className="h-[17px] w-4/5 rounded bg-surface-sunken" />
                  <div className="mt-auto h-[12px] w-1/2 rounded bg-surface-sunken" />
                </div>
              </li>
            ))
          : visible.map((notebook) => (
              <li key={notebook.id}>
                <NotebookCard notebook={notebook} />
              </li>
            ))}
      </ul>

      {state === 'loading' ? (
        <p className="sr-only" role="status">
          Loading your notebooks
        </p>
      ) : null}

      {state === 'ready' && notebooks.length === 0 ? (
        <p className="mt-5 text-ink-muted">
          No notebooks yet. Create one and add the documents you want to ask about.
        </p>
      ) : null}

      {state === 'ready' && notebooks.length > 0 && visible.length === 0 ? (
        <p className="mt-5 text-ink-muted" role="status">
          No notebook matches “{query.trim()}”.
        </p>
      ) : null}
    </>
  );
}
