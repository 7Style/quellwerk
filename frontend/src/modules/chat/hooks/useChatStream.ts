'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '@/lib/api';
import type { Citation } from '@/lib/citation';
import type { AnswerSegment, AssistantMessage, Message, TurnState } from '../types/message';

/**
 * The events the route sends (backend/app/modules/chat/internal/stream.ts).
 * Kept as a union so a new event type is a compile error here and not a silent
 * no-op at runtime.
 */
type ChatEvent =
  | { t: 'open'; i: number }
  | { t: 'text'; i: number; d: string }
  | { t: 'cite'; i: number; c: Citation }
  | { t: 'followups'; q: string[] }
  | { t: 'truncated' }
  | { t: 'refused'; m: string }
  | { t: 'done'; usage: unknown; trace: unknown; refused: boolean }
  | { t: 'error'; m: string; retry: boolean };

export interface UseChatStreamOptions {
  notebookId: string;
  /** The stored turns, once they have arrived. */
  initial?: Message[];
}

export interface UseChatStreamResult {
  messages: Message[];
  state: TurnState;
  error: string | null;
  /** Whether trying the same question again could work. From the server. */
  retryable: boolean;
  suggestions: string[];
  ask: (question: string) => void;
  stop: () => void;
  dismissError: () => void;
}

/** A fresh assistant turn, before a single token has arrived. */
function emptyAnswer(id: string): AssistantMessage {
  return { id, role: 'assistant', segments: [], droppedCitations: 0, refused: false };
}

/**
 * One chat turn over SSE, and the thread it appends to.
 *
 * `fetch` and not `EventSource`, for two reasons that both matter here: the
 * turn is a POST with a body, which EventSource cannot send, and the request
 * has to carry the session cookie cross-origin, which needs `credentials`.
 * What is lost is EventSource's automatic reconnect, and losing it is correct -
 * a reconnect would ask the same question a second time and pay for a second
 * answer.
 *
 * The parser is the small half: an SSE frame is lines until a blank line, a
 * line starting with `:` is a comment, and the route sends exactly one
 * `data:` line per event. The heartbeat the route sends every fifteen seconds
 * is such a comment, and it exists so a proxy does not close a quiet stream.
 */
export function useChatStream({ notebookId, initial }: UseChatStreamOptions): UseChatStreamResult {
  const [messages, setMessages] = useState<Message[]>(initial ?? []);
  const [state, setState] = useState<TurnState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const running = useRef<AbortController | null>(null);

  // The stored turns arrive after the first render, and they go in front of
  // whatever has been asked since. Replacing the thread instead would lose a
  // turn that started before the history landed - and lose it for good, because
  // the history does not arrive twice.
  const historyApplied = useRef(false);
  useEffect(() => {
    if (!initial || historyApplied.current) return;
    historyApplied.current = true;
    setMessages((current) => [...initial, ...current]);
  }, [initial]);

  // A turn that is still open when the reader leaves the notebook is a turn
  // nobody will read. Aborting it stops the tokens being billed.
  useEffect(() => () => running.current?.abort(), []);

  const patchAnswer = useCallback(
    (id: string, change: (answer: AssistantMessage) => AssistantMessage) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === id && message.role === 'assistant' ? change(message) : message
        )
      );
    },
    []
  );

  const stop = useCallback(() => {
    running.current?.abort();
    running.current = null;
  }, []);

  const ask = useCallback(
    (question: string) => {
      if (running.current) return;

      const controller = new AbortController();
      running.current = controller;

      const turn = Date.now();
      const answerId = `a-${turn}`;

      setError(null);
      setRetryable(false);
      setSuggestions([]);
      setMessages((current) => [
        ...current,
        { id: `q-${turn}`, role: 'user', text: question },
        emptyAnswer(answerId),
      ]);
      setState('thinking');

      void (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/notebooks/${notebookId}/chat`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            // Before the stream opens the route still answers as JSON, which is
            // where the rate limit, the budget and a malformed question land.
            const body = (await response.json().catch(() => null)) as {
              error?: { message?: string };
            } | null;
            setError(body?.error?.message ?? 'The question could not be sent.');
            setRetryable(response.status === 429 || response.status >= 500);
            setState('error');
            return;
          }

          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';

          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;
            // Frames are separated by a blank line. Everything before the last
            // separator is complete; what follows it may be half an event.
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
              for (const line of frame.split('\n')) {
                if (!line.startsWith('data:')) continue;
                apply(JSON.parse(line.slice(5).trim()) as ChatEvent);
              }
            }
          }

          setState((current) => (current === 'error' ? current : 'idle'));
        } catch (cause) {
          if (controller.signal.aborted) {
            // The reader pressed stop, or left. What arrived stays on screen
            // and is marked, because those sentences were checked like any
            // other and can still be cited.
            patchAnswer(answerId, (answer) => ({ ...answer, stopped: true }));
            setState('idle');
            return;
          }
          setError('The connection to the server was lost. Nothing you typed is gone.');
          setRetryable(true);
          setState('error');
        } finally {
          if (running.current === controller) running.current = null;
        }
      })();

      function apply(event: ChatEvent): void {
        switch (event.t) {
          case 'open':
            setState('streaming');
            patchAnswer(answerId, (answer) => ({
              ...answer,
              segments: withSegment(answer.segments, event.i),
            }));
            break;

          case 'text':
            setState('streaming');
            patchAnswer(answerId, (answer) => ({
              ...answer,
              segments: withSegment(answer.segments, event.i).map((segment, index) =>
                index === event.i ? { ...segment, text: segment.text + event.d } : segment
              ),
            }));
            break;

          case 'cite':
            // Already verified against the stored text before it was sent
            // (ADR-0003). The chip can be drawn without asking anything else.
            patchAnswer(answerId, (answer) => ({
              ...answer,
              segments: withSegment(answer.segments, event.i).map((segment, index) =>
                index === event.i
                  ? { ...segment, citations: [...segment.citations, event.c] }
                  : segment
              ),
            }));
            break;

          case 'truncated':
            patchAnswer(answerId, (answer) => ({ ...answer, truncated: true }));
            break;

          case 'refused':
            // The model declined, which is not the product's refusal sentence.
            setError(event.m);
            setRetryable(false);
            setState('error');
            break;

          case 'followups':
            setSuggestions(event.q);
            break;

          case 'done':
            patchAnswer(answerId, (answer) => ({ ...answer, refused: event.refused }));
            setState('idle');
            break;

          case 'error':
            setError(event.m);
            setRetryable(event.retry);
            setState('error');
            break;
        }
      }
    },
    [notebookId, patchAnswer]
  );

  const dismissError = useCallback(() => {
    setError(null);
    setState('idle');
  }, []);

  return { messages, state, error, retryable, suggestions, ask, stop, dismissError };
}

/** Grows the segment list so index `i` exists, without touching what is there. */
function withSegment(segments: AnswerSegment[], index: number): AnswerSegment[] {
  if (segments[index]) return segments;
  const grown = [...segments];
  while (grown.length <= index) grown.push({ text: '', citations: [] });
  return grown;
}
