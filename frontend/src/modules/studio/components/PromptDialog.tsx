'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon';

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rendered file, exactly as it was sent. Null while it is being written. */
  prompt: string | null;
}

/**
 * "View prompt used" (docs/SPEC.md).
 *
 * The rendered file, byte for byte, not a description of it and not the
 * template. Everything this product claims rests on the reader being able to
 * check it; the prompt is the one part of the chain they otherwise have to take
 * on trust, and it costs nothing to show.
 *
 * What it does not show is the documents. They are the reader's own, they sit
 * above this text in the request, and the sources column already has them.
 */
export function PromptDialog({ open, onOpenChange, prompt }: PromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[680px] max-w-[calc(100vw-64px)] gap-0 rounded-surface border-rule-strong bg-surface-raised p-0 shadow-modal sm:max-w-[680px]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-4 pt-4 pb-3">
          <DialogTitle className="m-0 text-h3 font-semibold">Prompt used</DialogTitle>
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

        <div className="max-h-[min(62vh,560px)] overflow-y-auto p-4">
          <DialogDescription className="mb-3 text-ui text-ink-muted">
            The last message of the request, as it was sent. The documents sit above it and are the
            ones in the sources column.
          </DialogDescription>
          <pre
            className="m-0 overflow-x-auto rounded-control bg-surface-sunken p-3 font-mono text-small whitespace-pre-wrap"
            data-testid="prompt-used"
          >
            {prompt ?? 'The prompt is stored when the report is written.'}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
