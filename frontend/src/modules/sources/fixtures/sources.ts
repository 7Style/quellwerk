import type { SourceSummary } from '../types/source';

/**
 * Four sources, one per state the column has to draw.
 *
 * The prototype shows three ready and one in progress. The fourth here failed
 * instead, because a source that could not be read is the state a reader most
 * needs to see and the one a demo never shows: it has to be legible in the
 * column itself, not only in the state gallery of M4-T4.
 *
 * The titles are the prototype's, with one change. Its second source is a web
 * page, and website sources are cut (docs/KNOWN-LIMITS.md); the same document
 * arrives here as Markdown.
 */
const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const sourceFixtures: SourceSummary[] = [
  {
    id: 's1',
    position: 1,
    title: 'Regulation (EU) 2024/1689, Chapter III (excerpt)',
    kind: 'pdf',
    status: 'ready',
    step: null,
    error: null,
    charCount: 148_320,
    tokenCount: 41_200,
    createdAt: minutesAgo(180),
  },
  {
    id: 's2',
    position: 2,
    title: 'Commission Q&A on high-risk AI systems',
    kind: 'md',
    status: 'ready',
    step: null,
    error: null,
    charCount: 38_900,
    tokenCount: 11_700,
    createdAt: minutesAgo(174),
  },
  {
    id: 's3',
    position: 3,
    title: 'Internal memo: readiness gaps in the triage model',
    kind: 'paste',
    status: 'queued',
    step: 'guide',
    error: null,
    charCount: 9_400,
    tokenCount: 0,
    createdAt: minutesAgo(1),
  },
  {
    id: 's4',
    position: 4,
    title: 'Board minutes, March 2024.pdf',
    kind: 'pdf',
    status: 'failed',
    step: null,
    error: 'The file is not a readable PDF.',
    charCount: 0,
    tokenCount: 0,
    createdAt: minutesAgo(4),
  },
];
