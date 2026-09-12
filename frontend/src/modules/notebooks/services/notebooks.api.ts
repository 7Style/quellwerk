import { baseApi } from '@/lib/api';
import type { NotebookSummary } from '../types/notebook';

/**
 * What `GET /api/notebooks` returns, field for field
 * (backend/app/modules/notebooks/dto/notebook.dto.ts).
 *
 * It is not the shape the grid draws. The card wants a source count and a
 * timestamp; the API sends a token count and two dates. Mapping here rather
 * than in the component means the cards keep working when the response gains a
 * field, and it keeps the mapping in one place instead of in every caller.
 */
interface NotebookApiRow {
  id: string;
  title: string;
  emoji: string | null;
  summary: string | null;
  tokenCount: number;
  sourceCount: number;
  suggestedQuestions: string[];
  isDemo: boolean;
  createdAt: string;
  lastUsedAt: string;
}

/** The notebook emoji is data the user picks; this is the one before they do. */
const DEFAULT_EMOJI = '\u{1F4C4}';

function toSummary(row: NotebookApiRow): NotebookSummary {
  return {
    id: row.id,
    emoji: row.emoji ?? DEFAULT_EMOJI,
    title: row.title,
    sourceCount: row.sourceCount,
    updatedAt: row.lastUsedAt,
    summary: row.summary,
    suggestedQuestions: row.suggestedQuestions,
    isDemo: row.isDemo,
    // A notebook nobody has written to since it was made. The card then says
    // "Created" instead of "Updated", which is the difference between an empty
    // notebook and one somebody worked in.
    isNew: row.lastUsedAt === row.createdAt,
  };
}

export const notebooksApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNotebooks: build.query<NotebookSummary[], void>({
      query: () => '/api/notebooks',
      // A collection comes back under a key, a single resource comes back bare.
      // That is the backend's shape and not a slip: the key leaves room for a
      // cursor next to the rows, where a single notebook has nothing to sit
      // beside.
      transformResponse: (response: { notebooks: NotebookApiRow[] }) =>
        response.notebooks.map(toSummary),
      providesTags: ['Notebook'],
    }),

    getNotebook: build.query<NotebookSummary, string>({
      query: (id) => `/api/notebooks/${id}`,
      transformResponse: toSummary,
      providesTags: (_result, _error, id) => [{ type: 'Notebook' as const, id }],
    }),

    createNotebook: build.mutation<NotebookSummary, { title?: string } | void>({
      query: (input) => ({
        method: 'POST',
        url: '/api/notebooks',
        body: { title: input?.title ?? 'Untitled notebook' },
      }),
      transformResponse: toSummary,
      invalidatesTags: ['Notebook'],
    }),
  }),
});

export const { useListNotebooksQuery, useGetNotebookQuery, useCreateNotebookMutation } =
  notebooksApi;
