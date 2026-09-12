import { baseApi } from '@/lib/api';
import type { Note } from '../types/note';

/**
 * Die Notizen eines Notizbuchs.
 *
 * Vier Schreibwege, einer davon besonders: "Save to note" schickt eine
 * Nachrichten-Id und keine Belege. Der Server holt die geprüften Segmente aus
 * seiner eigenen Zeile - ein Client, der seine Chips mitschickte, könnte
 * welche ablegen, die nie jemand nachgerechnet hat (ADR-0003).
 *
 * `notebookId` in jeder Antwort, weil eine Notiz im Demo-Notizbuch in einer
 * Kopie landet (Copy-on-first-write) und die Route dorthin wechselt.
 */
export const notesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNotes: build.query<Note[], string>({
      query: (notebookId) => `/api/notebooks/${notebookId}/notes`,
      transformResponse: (response: { notes: Note[] }) => response.notes,
      providesTags: (_result, _error, notebookId) => [{ type: 'Note' as const, id: notebookId }],
    }),

    addNote: build.mutation<Note, { notebookId: string; title: string; markdown: string }>({
      query: ({ notebookId, title, markdown }) => ({
        method: 'POST',
        url: `/api/notebooks/${notebookId}/notes`,
        body: { title, markdown },
      }),
      invalidatesTags: (result, _error, { notebookId }) => notesTags(result, notebookId),
    }),

    saveAnswerToNote: build.mutation<Note, { notebookId: string; messageId: string; title: string }>(
      {
        query: ({ notebookId, messageId, title }) => ({
          method: 'POST',
          url: `/api/notebooks/${notebookId}/notes/from-message`,
          body: { messageId, title },
        }),
        invalidatesTags: (result, _error, { notebookId }) => notesTags(result, notebookId),
      }
    ),

    convertNoteToSource: build.mutation<
      { sourceId: string; notebookId: string },
      { notebookId: string; noteId: string }
    >({
      query: ({ notebookId, noteId }) => ({
        method: 'POST',
        url: `/api/notebooks/${notebookId}/notes/${noteId}/convert`,
      }),
      // Die Quellenliste, nicht die Notizenliste: die Notiz bleibt, wie sie war,
      // und was dazukommt, ist eine Quelle.
      invalidatesTags: (result, _error, { notebookId }) => [
        { type: 'Source' as const, id: notebookId },
        ...(result && result.notebookId !== notebookId
          ? [{ type: 'Source' as const, id: result.notebookId }]
          : []),
        'Notebook',
      ],
    }),

    deleteNote: build.mutation<void, { notebookId: string; noteId: string }>({
      query: ({ notebookId, noteId }) => ({
        method: 'DELETE',
        url: `/api/notebooks/${notebookId}/notes/${noteId}`,
      }),
      invalidatesTags: (_result, _error, { notebookId }) => [
        { type: 'Note' as const, id: notebookId },
      ],
    }),
  }),
});

/** Die Liste des Notizbuchs, und die der Kopie, falls eine entstanden ist. */
function notesTags(result: Note | undefined, notebookId: string) {
  return [
    { type: 'Note' as const, id: notebookId },
    ...(result && result.notebookId !== notebookId
      ? [{ type: 'Note' as const, id: result.notebookId }]
      : []),
    'Notebook' as const,
  ];
}

export const {
  useListNotesQuery,
  useAddNoteMutation,
  useSaveAnswerToNoteMutation,
  useConvertNoteToSourceMutation,
  useDeleteNoteMutation,
} = notesApi;
