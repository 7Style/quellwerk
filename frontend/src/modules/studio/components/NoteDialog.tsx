'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon';

/** docs/SPEC.md: das Schema der Route deckelt eine Notiz bei 200.000 Zeichen. */
const MAX_NOTE_CHARS = 200_000;
const MAX_TITLE_CHARS = 200;

export interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wahr, wenn die Notiz angelegt wurde; falsch, wenn der Server ablehnt. */
  onSubmit: (input: { title: string; markdown: string }) => Promise<boolean>;
}

/**
 * "Add note": eine Notiz, die jemand selbst schreibt.
 *
 * Sie trägt keine Belege, und das ist keine Lücke, sondern der Unterschied: was
 * hier hineingeschrieben wird, hat kein Resolver gegen eine Quelle geprüft. Erst
 * wenn die Notiz eine Quelle wird, kann eine spätere Antwort sie zitieren.
 */
export function NoteDialog({ open, onOpenChange, onSubmit }: NoteDialogProps) {
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [sending, setSending] = useState(false);

  const ready = title.trim().length > 0 && markdown.trim().length > 0;

  async function submit() {
    if (!ready || sending) return;
    setSending(true);
    try {
      // Bleibt offen, wenn der Server ablehnt, mit dem Text im Feld: wer zehn
      // Zeilen getippt hat, tippt sie nach einem 429 nicht noch einmal.
      if (await onSubmit({ title: title.trim(), markdown })) {
        setTitle('');
        setMarkdown('');
        onOpenChange(false);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[560px] max-w-[calc(100vw-64px)] gap-0 rounded-surface border-rule-strong bg-surface-raised p-0 shadow-modal sm:max-w-[560px]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-4 pt-4 pb-3">
          <DialogTitle className="m-0 text-h3 font-semibold">Add note</DialogTitle>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <Icon name="close" />
          </Button>
        </div>

        <div className="grid gap-2 p-4">
          <DialogDescription className="m-0 text-ui text-ink-muted">
            A note of your own. It carries no citations; turn it into a source and later answers can
            cite it.
          </DialogDescription>

          <label className="text-ui font-medium" htmlFor="note-title">
            Title
          </label>
          <input
            id="note-title"
            value={title}
            maxLength={MAX_TITLE_CHARS}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What this note is about"
            className="h-[36px] w-full rounded-control border border-rule-strong bg-surface px-3 font-ui text-ui-lg focus:border-ink focus:outline-none"
          />

          <label className="mt-2 text-ui font-medium" htmlFor="note-text">
            Text
          </label>
          <textarea
            id="note-text"
            rows={8}
            value={markdown}
            maxLength={MAX_NOTE_CHARS}
            onChange={(event) => setMarkdown(event.target.value)}
            placeholder="Anything you want to keep beside the sources"
            className="min-h-[160px] w-full resize-y rounded-control border border-rule-strong bg-surface px-3 py-2 font-ui text-ui-lg leading-[1.5] focus:border-ink focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 border-t border-rule px-4 pt-3 pb-4">
          <span className="flex-1" />
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!ready || sending}>
            Add note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
