import Link from 'next/link';

import { relativeTime } from '@/lib/relative-time';
import type { NotebookSummary } from '../types/notebook';

export interface NotebookCardProps {
  notebook: NotebookSummary;
}

export function NotebookCard({ notebook }: NotebookCardProps) {
  const sources =
    notebook.sourceCount === 0
      ? 'No sources yet'
      : `${notebook.sourceCount} ${notebook.sourceCount === 1 ? 'source' : 'sources'}`;

  return (
    <Link
      href={`/n/${notebook.id}`}
      className="flex h-full min-h-[148px] flex-col gap-3 rounded-surface border border-rule bg-surface p-4 text-left no-underline hover:border-rule-strong"
    >
      {/* The emoji is content, so it is not aria-hidden; it is the notebook's
          name as much as the title is, and a screen reader user picking between
          five notebooks should hear it. */}
      <span className="flex items-center gap-2">
        <span className="text-[22px] leading-none">{notebook.emoji}</span>
        {notebook.isDemo ? (
          // The demo notebook is in every visitor's list and belongs to none of
          // them: it can be read and asked questions, and not written to. Saying
          // so on the card is cheaper than an error the first time somebody
          // tries to add a source to it.
          <span
            className="rounded-control border border-rule-strong px-1.5 py-px text-micro text-ink-muted"
            data-testid="demo-badge"
          >
            Read-only example
          </span>
        ) : null}
      </span>
      <h2 className="m-0 text-h3 leading-[1.3] font-semibold">{notebook.title}</h2>
      <span className="mt-auto flex items-center gap-2 text-small text-ink-faint tabular-nums">
        {sources}
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
        <time dateTime={notebook.updatedAt} suppressHydrationWarning>
          {notebook.isNew ? 'Created ' : 'Updated '}
          {relativeTime(notebook.updatedAt)}
        </time>
      </span>
    </Link>
  );
}
