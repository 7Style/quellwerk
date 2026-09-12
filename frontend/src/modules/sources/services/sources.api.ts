import { baseApi } from '@/lib/api';
import type { SourceSummary } from '../types/source';

/** `SourceResponse` from backend/app/modules/sources/dto/source.dto.ts. */
interface SourceApiRow {
  id: string;
  position: number;
  title: string;
  kind: string;
  status: string;
  step: string | null;
  error: string | null;
  charCount: number;
  tokenCount: number;
  createdAt: string;
}

/**
 * The API sends `kind`, `status` and `step` as strings, because that is what
 * the column holds. The interface narrows them, and anything it does not know
 * falls back rather than throwing: a value the server learns before the browser
 * is reloaded should draw a plain row, not an empty column.
 */
function toSummary(row: SourceApiRow): SourceSummary {
  return {
    ...row,
    kind: (['pdf', 'txt', 'md', 'docx', 'paste'].includes(row.kind)
      ? row.kind
      : 'paste') as SourceSummary['kind'],
    status: (['queued', 'ready', 'failed', 'skipped'].includes(row.status)
      ? row.status
      : 'queued') as SourceSummary['status'],
    step: (['extract', 'measure', 'guide', 'title', 'done'].includes(row.step ?? '')
      ? row.step
      : null) as SourceSummary['step'],
  };
}

/** Ingest runs in the worker, so the list has to be asked again while it works. */
const WHILE_READING_MS = 2_000;

export const sourcesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listSources: build.query<SourceSummary[], string>({
      query: (notebookId) => `/api/notebooks/${notebookId}/sources`,
      transformResponse: (response: { sources: SourceApiRow[] }) => response.sources.map(toSummary),
      providesTags: (_result, _error, notebookId) => [{ type: 'Source' as const, id: notebookId }],
    }),

    /**
     * The stored text of one source, for the viewer.
     *
     * Cached by id and never refetched on its own: the text is written once at
     * ingest and never changes (ADR-0003), so a second fetch would cost a
     * document to learn nothing. It is also the reason the list does not carry
     * it - a sidebar of titles must not weigh a megabyte.
     */
    sourceText: build.query<
      { id: string; title: string; text: string },
      { notebookId: string; sourceId: string }
    >({
      query: ({ notebookId, sourceId }) => `/api/notebooks/${notebookId}/sources/${sourceId}/text`,
      transformResponse: (response: { source: SourceApiRow & { text: string } }) => ({
        id: response.source.id,
        title: response.source.title,
        text: response.source.text,
      }),
      providesTags: (_result, _error, { sourceId }) => [{ type: 'Source' as const, id: sourceId }],
    }),

    addPastedSource: build.mutation<
      SourceApiRow,
      { notebookId: string; title: string; text: string }
    >({
      query: ({ notebookId, title, text }) => ({
        method: 'POST',
        url: `/api/notebooks/${notebookId}/sources`,
        body: { kind: 'paste', title, text },
      }),
      invalidatesTags: (_result, _error, { notebookId }) => [
        { type: 'Source' as const, id: notebookId },
        'Notebook',
      ],
    }),

    uploadSource: build.mutation<SourceApiRow, { notebookId: string; file: File }>({
      query: ({ notebookId, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { method: 'POST', url: `/api/notebooks/${notebookId}/sources`, body };
      },
      invalidatesTags: (_result, _error, { notebookId }) => [
        { type: 'Source' as const, id: notebookId },
        'Notebook',
      ],
    }),
  }),
});

export const {
  useListSourcesQuery,
  useSourceTextQuery,
  useAddPastedSourceMutation,
  useUploadSourceMutation,
} = sourcesApi;

export { WHILE_READING_MS };
