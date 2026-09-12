'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CitedText } from '@/components/cited-text';
import { Icon } from '@/components/icon';
import type { Citation } from '@/lib/citation';
import { relativeTime } from '@/lib/relative-time';
import { citationCount, type Note } from '../types/note';

export interface NoteViewProps {
  note: Note | null;
  loading?: boolean;
  onClose: () => void;
  onOpenCitation: (citation: Citation) => void;
  /** Legt eine Quelle aus dieser Notiz an; die Notiz bleibt. */
  onConvert: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Eine Notiz in der Spalte des Gesprächs, wie ein Report.
 *
 * Eine gesicherte Antwort wird mit demselben Renderer gezeichnet wie die Antwort
 * selbst: ein Chip hier bedeutet, was ein Chip dort bedeutet - der Server hat
 * den gespeicherten Text an diesen Offsets geschnitten und verglichen, bevor es
 * die Notiz gab (ADR-0003). Eine selbst geschriebene Notiz hat keine Segmente
 * und wird als Text gezeichnet, ohne dass irgendwo ein Chip erscheint, den
 * niemand geprüft hat.
 */
export function NoteView({
  note,
  loading = false,
  onClose,
  onOpenCitation,
  onConvert,
  onDelete,
}: NoteViewProps) {
  const [busy, setBusy] = useState<'convert' | 'delete' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(what: 'convert' | 'delete', action: () => Promise<void>) {
    setFailure(null);
    setBusy(what);
    try {
      await action();
    } catch (cause) {
      setFailure(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  const citations = note ? citationCount(note) : 0;

  return (
    <div className="mx-auto grid max-w-[var(--measure)] gap-4 px-5 py-6" data-testid="note-view">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Back to the conversation"
          data-testid="note-close"
        >
          <Icon name="chevronLeft" />
        </Button>
        <span className="text-small text-ink-faint">
          Note{note ? ` · ${relativeTime(note.createdAt)}` : ''}
        </span>
      </div>

      {loading ? (
        <div className="grid gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="h-[16px] w-full rounded bg-surface-sunken" />
          ))}
        </div>
      ) : null}

      {!loading && note ? (
        <>
          <h1 className="m-0 font-ui text-h2 font-semibold tracking-[-0.01em]">{note.title}</h1>

          {note.segments ? (
            <CitedText
              segments={note.segments}
              onOpenCitation={onOpenCitation}
              className="font-read text-read leading-read"
            />
          ) : (
            <div className="font-read text-read leading-read whitespace-pre-wrap">
              {note.markdown}
            </div>
          )}

          {failure ? (
            <p className="m-0 text-small text-danger" role="alert" data-testid="note-error">
              {failure}
            </p>
          ) : null}

          <div className="flex items-center gap-3 border-t border-rule pt-3 text-small text-ink-faint">
            {citations > 0 ? (
              <span className="inline-flex items-center gap-1 text-cite-ink tabular-nums">
                <Icon name="quote" className="h-[13px] w-[13px]" />
                {citations} {citations === 1 ? 'citation' : 'citations'}
              </span>
            ) : (
              <span>{note.fromMessageId ? 'No citations' : 'Written by you'}</span>
            )}
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => void run('convert', onConvert)}
              disabled={busy !== null}
              data-testid="note-convert"
            >
              <Icon name="plus" className="h-[14px] w-[14px]" />
              Convert to source
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => void run('delete', onDelete)}
              disabled={busy !== null}
              data-testid="note-delete"
            >
              <Icon name="trash" className="h-[14px] w-[14px]" />
              Delete
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function messageOf(cause: unknown): string {
  const body = (cause as { data?: { error?: { message?: string } } } | null)?.data?.error;
  return body?.message ?? 'That did not work.';
}
