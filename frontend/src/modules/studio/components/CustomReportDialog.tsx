'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon';

/** docs/SPEC.md: the route's zod schema caps the focus at 1,000 characters. */
const MAX_FOCUS_CHARS = 1_000;

export interface CustomReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when the report was actually asked for; false when the server refused. */
  onSubmit: (focus: string) => Promise<boolean>;
}

/**
 * "Create your own": the one format that needs the reader to say something.
 *
 * Without a description there is no report to write, and asking the model to
 * invent one would be the opposite of a format the reader chose. The route
 * refuses an empty focus too; this is the same rule where the reader can see it.
 */
export function CustomReportDialog({ open, onOpenChange, onSubmit }: CustomReportDialogProps) {
  const [focus, setFocus] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    if (focus.trim().length === 0 || sending) return;
    setSending(true);
    try {
      // Left open on a failure, with the text still in the box: a reader who
      // typed five lines and met a 429 must not have to type them again. The
      // panel shows what the server said.
      if (await onSubmit(focus.trim())) {
        setFocus('');
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
        className="w-[520px] max-w-[calc(100vw-64px)] gap-0 rounded-surface border-rule-strong bg-surface-raised p-0 shadow-modal sm:max-w-[520px]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-4 pt-4 pb-3">
          <DialogTitle className="m-0 text-h3 font-semibold">Create your own</DialogTitle>
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
            Describe the report you want. It is written from the sources in this notebook, with the
            same citations as an answer.
          </DialogDescription>
          <label className="sr-only" htmlFor="custom-focus">
            Describe the report
          </label>
          <textarea
            id="custom-focus"
            rows={5}
            value={focus}
            maxLength={MAX_FOCUS_CHARS}
            onChange={(event) => setFocus(event.target.value)}
            placeholder="A one-page comparison of the deadlines, for a lawyer who has not read the sources"
            className="min-h-[96px] w-full resize-y rounded-control border border-rule-strong bg-surface px-3 py-2 font-ui text-ui-lg leading-[1.5] focus:border-ink focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 border-t border-rule px-4 pt-3 pb-4">
          <span className="flex-1" />
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={focus.trim().length === 0 || sending}
          >
            Write it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
