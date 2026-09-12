import { baseApi } from '@/lib/api';
import type { Flashcards } from '../types/flashcards';

/** Solange geschrieben wird, wird nachgefragt; nichts schiebt. */
export const WHILE_WRITING_CARDS_MS = 2_000;

export const flashcardsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    flashcards: build.query<Flashcards | null, string>({
      query: (notebookId) => `/api/notebooks/${notebookId}/flashcards`,
      transformResponse: (response: { flashcards: Flashcards | null }) => response.flashcards,
      providesTags: (_result, _error, notebookId) => [
        { type: 'Flashcards' as const, id: notebookId },
      ],
    }),

    requestFlashcards: build.mutation<Flashcards, string>({
      query: (notebookId) => ({ method: 'POST', url: `/api/notebooks/${notebookId}/flashcards` }),
      transformResponse: (response: { flashcards: Flashcards }) => response.flashcards,
      invalidatesTags: (result, _error, notebookId) => [
        { type: 'Flashcards' as const, id: notebookId },
        ...(result && result.notebookId !== notebookId
          ? [{ type: 'Flashcards' as const, id: result.notebookId }]
          : []),
        'Notebook',
      ],
    }),
  }),
});

export const { useFlashcardsQuery, useRequestFlashcardsMutation } = flashcardsApi;
