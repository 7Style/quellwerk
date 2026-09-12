'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Icon } from '@/components/icon';

/** docs/SPEC.md, "Zahlen": 20 MB per upload, 50 sources per notebook. */
const MAX_UPLOAD_MB = 20;

export interface AddSourcesDialogProps {
  sourceCount: number;
  maxSources: number;
  /** Wired in M4-T6. Until then the dialog opens, closes and validates only. */
  onAddPaste?: (input: { title: string; text: string }) => void;
  onAddFiles?: (files: File[]) => void;
}

type Tab = 'upload' | 'paste';

/**
 * Add sources: a file drop and a paste box.
 *
 * The prototype has a third tab, Link, for a URL. It is not here: fetching a
 * URL the reader picked turns this server into something that makes outbound
 * requests on request, and that is cut (docs/KNOWN-LIMITS.md). The backend
 * agrees - `SOURCE_KINDS` has no url kind - so a tab would offer something no
 * route accepts.
 *
 * Built on the Radix dialog rather than on `<dialog>`: focus goes into the
 * panel and comes back to the button that opened it, Escape closes, and the
 * page behind it stops scrolling. All three are what the prototype's plain
 * element does not do.
 */
export function AddSourcesDialog({
  sourceCount,
  maxSources,
  onAddPaste,
  onAddFiles,
}: AddSourcesDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('upload');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const titleId = useId();
  const textId = useId();

  const full = sourceCount >= maxSources;
  const canAdd = tab === 'paste' ? title.trim().length > 0 && text.trim().length > 0 : false;

  function reset() {
    setTab('upload');
    setTitle('');
    setText('');
    setDragging(false);
  }

  function submit() {
    if (tab === 'paste' && canAdd) onAddPaste?.({ title: title.trim(), text });
    setOpen(false);
    reset();
  }

  function takeFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onAddFiles?.([...files]);
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" type="button" className="w-full" disabled={full}>
          <Icon name="plus" />
          Add source
        </Button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="w-[560px] max-w-[calc(100vw-64px)] gap-0 rounded-surface border-rule-strong bg-surface-raised p-0 shadow-modal sm:max-w-[560px]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-4 pt-4 pb-3">
          <DialogTitle className="m-0 text-h3 font-semibold">Add sources</DialogTitle>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <Icon name="close" />
          </Button>
        </div>

        <div className="max-h-[min(62vh,520px)] overflow-y-auto p-4">
          <DialogDescription className="sr-only">
            Add a document or paste text. The text is stored once and never fetched again.
          </DialogDescription>

          <div
            role="tablist"
            aria-label="How to add a source"
            className="mb-4 flex gap-1 rounded-control border border-rule bg-surface-sunken p-[3px]"
          >
            {(
              [
                ['upload', 'Upload'],
                ['paste', 'Paste text'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls={`${titleId}-${value}`}
                onClick={() => setTab(value)}
                className={`h-[28px] flex-1 rounded-[4px] text-ui font-medium ${
                  tab === value
                    ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(27,32,36,0.12)]'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'upload' ? (
            <div
              id={`${titleId}-upload`}
              role="tabpanel"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                takeFiles(event.dataTransfer.files);
              }}
              data-dragging={dragging}
              className={`grid place-items-center gap-2 rounded-control border border-dashed px-4 py-7 text-center ${
                dragging ? 'border-ink bg-surface-sunken' : 'border-rule-strong bg-surface'
              }`}
            >
              <Icon name="doc" size="lg" className="text-ink-faint" />
              <strong className="font-medium">Drop files here</strong>
              <span className="text-small text-ink-faint">
                PDF, TXT, Markdown or DOCX, up to {MAX_UPLOAD_MB} MB each
              </span>
              <label className="mt-1">
                <span
                  className={
                    'inline-flex h-[32px] cursor-pointer items-center rounded-control border border-rule-strong bg-surface px-3 text-ui font-medium hover:bg-surface-sunken'
                  }
                >
                  Choose files
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.markdown,.docx"
                  className="sr-only"
                  onChange={(event) => takeFiles(event.target.files)}
                />
              </label>
            </div>
          ) : (
            <div id={`${titleId}-paste`} role="tabpanel" className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-ui font-medium" htmlFor={titleId}>
                  Title
                </label>
                <input
                  id={titleId}
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What is this text?"
                  className="w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ui-lg leading-[1.5] focus:border-ink focus:outline-none"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-ui font-medium" htmlFor={textId}>
                  Text
                </label>
                <textarea
                  id={textId}
                  rows={7}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Paste the text you want to ask questions about"
                  className="min-h-[84px] w-full resize-y rounded-control border border-rule-strong bg-surface px-3 py-2 font-ui text-ui-lg leading-[1.5] focus:border-ink focus:outline-none"
                />
                <span className="justify-self-end text-micro text-ink-faint tabular-nums">
                  {text.length.toLocaleString('en-US')} characters
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-rule px-4 pt-3 pb-4">
          <span className="text-small text-ink-faint tabular-nums">
            {sourceCount} of {maxSources} sources used
          </span>
          <span className="flex-1" />
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {/* Only where it can do something. On the upload tab the work is done
              by choosing a file, and a button that is disabled whatever the
              reader does is a dead end in the corner of the panel. */}
          {tab === 'paste' ? (
            <Button type="button" onClick={submit} disabled={!canAdd}>
              Add
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
