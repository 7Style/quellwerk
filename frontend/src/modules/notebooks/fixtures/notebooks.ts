import type { NotebookSummary } from '../types/notebook';

/**
 * The five notebooks from design/index.html.
 *
 * Fixtures, not seed data: they exist so the grid can be built and tested
 * before an endpoint does (docs/PLAN.md, M4). `pnpm db:seed` fills a real
 * notebook from the eval corpus; these five never reach a database.
 *
 * The timestamps are offsets from load time rather than fixed dates, so the meta
 * line reads the same next month as it does today.
 */
const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const notebookFixtures: NotebookSummary[] = [
  {
    id: 'eu-ai-act-obligations',
    emoji: '\u2696\uFE0F',
    title: 'EU AI Act obligations',
    sourceCount: 4,
    updatedAt: minutesAgo(2 * 60),
  },
  {
    id: 'clinical-trial-protocols',
    emoji: '\u{1F3E5}',
    title: 'Clinical trial protocols, phase II',
    sourceCount: 11,
    updatedAt: minutesAgo(26 * 60),
  },
  {
    id: 'q3-board-reporting',
    emoji: '\u{1F4CA}',
    title: 'Q3 board reporting pack',
    sourceCount: 6,
    updatedAt: minutesAgo(4 * 24 * 60),
  },
  {
    id: 'supplier-contracts',
    emoji: '\u{1F4DC}',
    title: 'Supplier contracts 2023-2025',
    sourceCount: 23,
    updatedAt: minutesAgo(9 * 24 * 60),
  },
  {
    id: 'untitled-notebook',
    emoji: '\u{1F4C4}',
    title: 'Untitled notebook',
    sourceCount: 0,
    updatedAt: minutesAgo(0),
    isNew: true,
  },
];

export function notebookFixtureById(id: string): NotebookSummary | undefined {
  return notebookFixtures.find((notebook) => notebook.id === id);
}
