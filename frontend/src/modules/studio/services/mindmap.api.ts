import { baseApi } from '@/lib/api';
import type { MindMap } from '../types/mindmap';

/** Solange die Karte geschrieben wird, wird sie erneut erfragt; nichts schiebt. */
export const WHILE_DRAWING_MS = 2_000;

export const mindMapApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    mindMap: build.query<MindMap | null, string>({
      query: (notebookId) => `/api/notebooks/${notebookId}/mindmap`,
      transformResponse: (response: { mindMap: MindMap | null }) => response.mindMap,
      providesTags: (_result, _error, notebookId) => [{ type: 'MindMap' as const, id: notebookId }],
    }),

    /**
     * Bestellt die Karte, oder schreibt sie neu.
     *
     * Derselbe Aufruf fuer beides: es gibt eine Karte je Notizbuch, und was
     * "neu" daran ist, entscheidet der Server an ihrem Zustand.
     */
    requestMindMap: build.mutation<MindMap, string>({
      query: (notebookId) => ({ method: 'POST', url: `/api/notebooks/${notebookId}/mindmap` }),
      transformResponse: (response: { mindMap: MindMap }) => response.mindMap,
      invalidatesTags: (result, _error, notebookId) => [
        { type: 'MindMap' as const, id: notebookId },
        ...(result && result.notebookId !== notebookId
          ? [{ type: 'MindMap' as const, id: result.notebookId }]
          : []),
        'Notebook',
      ],
    }),
  }),
});

export const { useMindMapQuery, useRequestMindMapMutation } = mindMapApi;
