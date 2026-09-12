import { baseApi } from '@/lib/api';
import type { Citation } from '@/lib/citation';
import type { Message } from '../types/message';

/** `MessageResponse` from backend/app/modules/chat/dto/message.dto.ts. */
interface MessageApiRow {
  id: string;
  role: 'user' | 'assistant';
  segments: Array<{ text: string; citations: Citation[] }>;
  droppedCitations: number;
  refused: boolean;
  createdAt: string;
}

function toMessage(row: MessageApiRow): Message {
  if (row.role === 'user') {
    // A question is stored as one segment with no citations, so its text is
    // the text of that segment.
    return { id: row.id, role: 'user', text: row.segments.map((one) => one.text).join('') };
  }

  return {
    id: row.id,
    role: 'assistant',
    segments: row.segments,
    droppedCitations: row.droppedCitations,
    refused: row.refused,
  };
}

export const chatApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The stored turns of a notebook.
     *
     * A reload has to show the conversation that was there, and the stream only
     * carries the turn it is running. The two are separate routes for that
     * reason, and this one has no rate limit in front of it: somebody over the
     * hourly turn limit may still read what was already answered.
     */
    listMessages: build.query<Message[], string>({
      query: (notebookId) => `/api/notebooks/${notebookId}/messages`,
      transformResponse: (response: { messages: MessageApiRow[] }) =>
        response.messages.map(toMessage),
      providesTags: (_result, _error, notebookId) => [{ type: 'Message' as const, id: notebookId }],
    }),
  }),
});

export const { useListMessagesQuery } = chatApi;
