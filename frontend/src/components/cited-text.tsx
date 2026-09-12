'use client';

import { Fragment, type ReactNode } from 'react';

import { CitationChip } from '@/components/citation-chip';
import type { Citation } from '@/lib/citation';

export interface CitedSegment {
  text: string;
  citations: Citation[];
}

export interface CitedTextProps {
  segments: CitedSegment[];
  onOpenCitation: (citation: Citation) => void;
  /** A caret while the text is still arriving. Only the chat uses it. */
  caret?: boolean;
  className?: string;
  /** Marked up differently for the first segment, when there is a lead. */
  lead?: string | null;
  /**
   * Reports only: draw the heading lines as headings.
   *
   * Off for an answer. The chat writes prose, and a source line that happens to
   * begin with a hash would turn into a heading it never was.
   */
  headings?: boolean;
}

/**
 * Text with its citations, numbered across the whole piece.
 *
 * The one renderer for both an answer and a report, because a chip has to mean
 * the same thing in both: the server sliced the stored text at those offsets and
 * compared it before this existed (ADR-0003). Two renderers would be two places
 * for that to stop being true.
 *
 * `pre-wrap`, and still not a markdown renderer. The model writes paragraphs as
 * blank lines and this shows them as blank lines; parsing would mean deciding
 * what a stray asterisk meant, and text whose rendering is a guess is not what a
 * citation should hang off.
 *
 * The one exception is `headings`, and it exists because we ask for it:
 * prompts/report-common.md tells the model to write a title and sections, so a
 * report arrives with `#` lines whatever this component would prefer. Showing
 * them raw would mean shipping the markup of a document instead of the document.
 * Only a line that begins with hashes is read, nothing else, and the text of the
 * line is passed through untouched.
 */
export function CitedText({
  segments,
  onOpenCitation,
  caret = false,
  className = '',
  lead = null,
  headings = false,
}: CitedTextProps) {
  if (headings) {
    const blocks = blocksOf(segments);
    // The first heading is the title, whatever it was marked with. The prompt
    // asks for one first-level heading and the model does not always oblige;
    // its position is the part that never moves.
    const titleAt = blocks.findIndex((block) => block.kind === 'heading');

    return (
      <div className={className} data-testid="report-body">
        {blocks.map((block, index) =>
          block.kind === 'heading' ? (
            heading(block, index, index === titleAt, onOpenCitation)
          ) : (
            <p key={index} className="m-0 mb-3 whitespace-pre-wrap last:mb-0">
              {pieces(block.pieces, onOpenCitation)}
            </p>
          )
        )}
      </div>
    );
  }

  // Worked out before anything renders: counting up inside the JSX would be a
  // variable reassigned during render, which the React compiler refuses.
  const firstNumber = segments.map((_, index) =>
    segments.slice(0, index).reduce((total, earlier) => total + earlier.citations.length, 0)
  );

  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {segments.map((segment, segmentIndex) => (
        <span key={segmentIndex}>
          {lead !== null && segmentIndex === 0 ? (
            <>
              <span className="font-medium text-ink">{lead}</span>
              {segment.text.slice(segment.text.indexOf(lead) + lead.length)}
            </>
          ) : (
            segment.text
          )}
          {segment.citations.map((citation, citationIndex) => (
            <CitationChip
              key={`${citation.sourceId}-${citation.start}-${citationIndex}`}
              citation={citation}
              index={firstNumber[segmentIndex] + citationIndex + 1}
              onOpen={onOpenCitation}
            />
          ))}
        </span>
      ))}
      {caret ? (
        <span
          data-testid="caret"
          className="ml-px inline-block h-[1.05em] w-0.5 bg-ink align-[-0.15em] motion-safe:animate-[qw-blink_1s_steps(2,start)_infinite]"
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

type Piece =
  | { kind: 'text'; value: string }
  | { kind: 'chip'; citation: Citation; index: number };

type Block = { kind: 'heading'; level: number; pieces: Piece[] } | { kind: 'paragraph'; pieces: Piece[] };

/** A heading line, and nothing else: no emphasis, no lists, no links. */
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;

/**
 * Segments and their chips, flattened into one stream.
 *
 * A citation belongs after the text of its segment, so the chip numbers run
 * across the whole report exactly as they run across an answer.
 */
function flatten(segments: CitedSegment[]): Piece[] {
  const out: Piece[] = [];
  let number = 0;

  for (const segment of segments) {
    if (segment.text !== '') out.push({ kind: 'text', value: segment.text });
    for (const citation of segment.citations) {
      number += 1;
      out.push({ kind: 'chip', citation, index: number });
    }
  }

  return out;
}

/** The stream cut at newlines, so a heading can be recognised by its line. */
function lines(stream: Piece[]): Piece[][] {
  const out: Piece[][] = [[]];

  for (const piece of stream) {
    if (piece.kind !== 'text') {
      out[out.length - 1].push(piece);
      continue;
    }
    const parts = piece.value.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) out.push([]);
      if (part !== '') out[out.length - 1].push({ kind: 'text', value: part });
    });
  }

  return out;
}

function blocksOf(segments: CitedSegment[]): Block[] {
  const out: Block[] = [];
  let open: Piece[] = [];

  for (const line of lines(flatten(segments))) {
    const first = line[0];
    const match = first !== undefined && first.kind === 'text' ? HEADING.exec(first.value) : null;

    // A heading and a blank line both end the paragraph above them.
    if (match !== null || line.length === 0) {
      if (open.length > 0) out.push({ kind: 'paragraph', pieces: open });
      open = [];
    }

    if (match !== null) {
      out.push({
        kind: 'heading',
        level: match[1].length,
        pieces: [{ kind: 'text', value: match[2] }, ...line.slice(1)],
      });
      continue;
    }
    if (line.length === 0) continue;

    // A single newline inside a paragraph is the model's own wrap; keep it.
    if (open.length > 0) open.push({ kind: 'text', value: '\n' });
    open.push(...line);
  }

  if (open.length > 0) out.push({ kind: 'paragraph', pieces: open });
  return out;
}

function pieces(list: Piece[], onOpen: (citation: Citation) => void): ReactNode[] {
  return list.map((piece, index) =>
    piece.kind === 'text' ? (
      <Fragment key={index}>{piece.value}</Fragment>
    ) : (
      <CitationChip key={index} citation={piece.citation} index={piece.index} onOpen={onOpen} />
    )
  );
}

/**
 * The headings, in the interface's own type rather than the document's.
 *
 * Sans above serif, the way the overview sits above its summary: the prose is
 * what is read, the headings are what it is skimmed by.
 */
function heading(
  block: { level: number; pieces: Piece[] },
  key: number,
  title: boolean,
  onOpen: (citation: Citation) => void
): ReactNode {
  const inner = pieces(block.pieces, onOpen);

  if (title) {
    return (
      <h1 key={key} className="m-0 mb-3 font-ui text-h2 font-semibold tracking-[-0.01em]">
        {inner}
      </h1>
    );
  }
  if (block.level >= 3) {
    return (
      <h3 key={key} className="m-0 mt-4 mb-2 font-ui text-ui-lg font-semibold">
        {inner}
      </h3>
    );
  }
  return (
    <h2 key={key} className="m-0 mt-6 mb-2 font-ui text-h3 font-semibold tracking-[-0.01em]">
      {inner}
    </h2>
  );
}
