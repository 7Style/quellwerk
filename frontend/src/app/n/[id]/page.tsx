import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { APP_NAME } from '@/lib/app';
import { relativeTime } from '@/lib/relative-time';
import { notebookFixtureById } from '@/modules/notebooks';
import { Topbar } from '@/modules/shell';
import { sourceFixtures, sourceTextFixtures } from '@/modules/sources';
import { NotebookWorkspace } from './NotebookWorkspace';

interface NotebookRouteProps {
  /** A Promise since Next 15; awaited before anything reads it. */
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: NotebookRouteProps): Promise<Metadata> {
  const { id } = await params;
  const notebook = notebookFixtureById(id);
  return { title: notebook ? `${notebook.title} - ${APP_NAME}` : APP_NAME };
}

/**
 * A notebook: the topbar, then the three columns.
 *
 * This page composes the panels instead of letting them find each other.
 * Sources, chat and studio are separate modules and a module may not import
 * another one (frontend/eslint.config.mjs); the route is the one place allowed
 * to know about all three, which is also what lets them be built in parallel.
 *
 * The three panel bodies below are the empty states of M4-T2 to M4-T4. They are
 * what a new notebook really shows, not placeholder text, so the tasks that
 * follow extend them rather than delete them.
 */
export default async function NotebookPage({ params }: NotebookRouteProps) {
  const { id } = await params;
  const notebook = notebookFixtureById(id);

  // A notebook of another session does not exist as far as this session is
  // concerned (SECURITY.md 7.2), so a missing one is a 404 and not an error.
  if (!notebook) notFound();

  return (
    <div className="flex h-dvh flex-col">
      <Topbar meta={`Saved ${relativeTime(notebook.updatedAt)}`}>
        <span className="h-[20px] w-px flex-none bg-rule" aria-hidden="true" />
        <span className="text-base leading-none">{notebook.emoji}</span>
        <h1 className="m-0 truncate text-ui-lg font-medium">{notebook.title}</h1>
      </Topbar>

      <NotebookWorkspace
        sources={sourceFixtures}
        texts={sourceTextFixtures}
        studio={
          <div className="flex flex-col gap-5 p-3">
            <section>
              <h3 className="m-0 mb-2 text-small font-semibold text-ink-muted">Reports</h3>
              <p className="m-0 text-ink-faint">
                A Briefing Doc, a Study Guide, an FAQ or a Timeline, written from the sources.
              </p>
            </section>
            <section>
              <h3 className="m-0 mb-2 text-small font-semibold text-ink-muted">Notes</h3>
              <p className="m-0 text-ink-faint">
                Save an answer here, or write your own and turn it into a source.
              </p>
            </section>
          </div>
        }
      />
    </div>
  );
}
