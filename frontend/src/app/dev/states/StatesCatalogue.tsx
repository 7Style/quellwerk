'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { citeQuote } from '@/lib/citation';
import { Answer, Banner, Thinking, type AssistantMessage } from '@/modules/chat';
import { NotebookGrid } from '@/modules/notebooks';
import { Topbar } from '@/modules/shell';
import {
  SourceItem,
  SourcesPanel,
  sourceTextFixtures,
  type SourceSummary,
} from '@/modules/sources';

/**
 * Every state a person can land in, on one page.
 *
 * It is the working copy of design/states.html and it exists for two reasons:
 * a state that has no screen is a state nobody designed, and a reviewer should
 * be able to see all of them without provoking each one.
 *
 * Not part of the product. The route answers 404 unless DEV_STATES is set,
 * which the production compose does not set and scripts/security-check.sh
 * checks. Gated at request time rather than on NODE_ENV so the same image can
 * serve the states page in a test run and refuse it on the server.
 */
function Specimen({
  label,
  width,
  children,
}: {
  label: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    // The label is on the section as well, so a spec can ask for a specimen
    // without matching the same words inside the specimen it labels.
    <section className="mb-5 grid gap-2" data-specimen={label}>
      <span className="text-micro font-semibold tracking-[0.06em] text-ink-faint uppercase">
        {label}
      </span>
      <div
        className="rounded-surface border border-dashed border-rule bg-paper p-4"
        style={width ? { maxWidth: width } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

const SOURCE: Omit<SourceSummary, 'status' | 'step' | 'error'> = {
  id: 'x1',
  position: 1,
  title: 'Board minutes, March 2024.pdf',
  kind: 'pdf',
  charCount: 0,
  tokenCount: 0,
  createdAt: new Date().toISOString(),
};

function sourceIn(
  status: SourceSummary['status'],
  step: SourceSummary['step'],
  error: string | null = null
): SourceSummary {
  return { ...SOURCE, status, step, error };
}

const CITED = 'throughout the entire lifecycle of the high-risk AI system';

function answer(extra: Partial<AssistantMessage> = {}): AssistantMessage {
  const citation = citeQuote(
    {
      id: 's1',
      title: 'Regulation (EU) 2024/1689, Chapter III (excerpt)',
      text: sourceTextFixtures.s1,
    },
    CITED
  );

  return {
    id: 'a1',
    role: 'assistant',
    droppedCitations: 0,
    segments: [
      {
        text: 'Providers have to plan for what happens after the system is in use, not only before it ships. The risk management system runs ',
        citations: [citation],
      },
      { text: '.', citations: [] },
    ],
    ...extra,
  };
}

const REFUSAL: AssistantMessage = {
  id: 'r1',
  role: 'assistant',
  droppedCitations: 0,
  segments: [
    {
      text: 'The sources do not cover this. What they do cover is what providers owe before and after a high-risk system reaches the market, and the readiness gaps recorded in your internal memo.',
      citations: [],
    },
  ],
};

export function StatesCatalogue() {
  const noop = () => undefined;

  return (
    <div className="flex h-dvh flex-col">
      <Topbar meta="Loading and error states" />

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="scroll-states">
        <main className="mx-auto max-w-[1080px] px-5 pt-7 pb-8">
          <h1 className="mb-2 text-h2 font-semibold">States</h1>
          <p className="mb-6 max-w-[54ch] font-read text-read leading-read text-ink-muted">
            Every state a person can land in. An error says what happened and what to do next; it
            does not apologise and it never shows a stack trace.
          </p>

          <h2 className="mt-6 mb-3 border-b border-rule pb-2 text-h3 font-semibold">
            Source ingest
          </h2>

          <Specimen label="Queued" width={300}>
            <SourceItem
              source={sourceIn('queued', null)}
              selected={false}
              onSelectedChange={noop}
            />
          </Specimen>

          <Specimen label="Reading" width={300}>
            <SourceItem
              source={sourceIn('queued', 'extract')}
              selected={false}
              onSelectedChange={noop}
            />
          </Specimen>

          <Specimen label="Failed" width={300}>
            <SourceItem
              source={sourceIn('failed', null, 'The file is not a readable PDF.')}
              selected={false}
              onSelectedChange={noop}
            />
          </Specimen>

          <Specimen label="Almost no readable text" width={520}>
            <Banner tone="notice" title="Almost no readable text">
              This PDF looks like scanned pages. Quellwerk stores what it could read, which is very
              little; answers from it will be thin. A text PDF or pasted text works better.
            </Banner>
          </Specimen>

          <Specimen label="This source addresses an AI assistant" width={520}>
            <Banner title="This source addresses an AI assistant">
              A passage in it is written as an instruction. It is stored and quoted as content, and
              it is never followed.
            </Banner>
          </Specimen>

          <Specimen label="Only the first part is indexed" width={520}>
            <Banner tone="notice" title="Only the first part is indexed">
              The notebook holds 150,000 tokens and this document does not fit. What was stored can
              be quoted; the rest is not in the notebook.
            </Banner>
          </Specimen>

          <Specimen label="List loading" width={300}>
            <div className="h-[220px]">
              <SourcesPanel sources={[]} state="loading" />
            </div>
          </Specimen>

          <Specimen label="List error" width={300}>
            <div className="h-[220px]">
              <SourcesPanel sources={[]} state="error" onRetry={noop} />
            </div>
          </Specimen>

          <h2 className="mt-6 mb-3 border-b border-rule pb-2 text-h3 font-semibold">Chat</h2>

          <Specimen label="Thinking">
            <Thinking sourceCount={3} />
          </Specimen>

          <Specimen label="Streaming">
            <Answer message={answer()} onOpenCitation={noop} streaming />
          </Specimen>

          <Specimen label="Answered">
            <Answer message={answer()} onOpenCitation={noop} />
          </Specimen>

          <Specimen label="Stopped">
            <div className="grid gap-3">
              <Answer message={answer({ stopped: true })} onOpenCitation={noop} />
              <div className="flex items-center gap-3 text-small text-ink-faint">
                <span>Stopped. The part above is kept and can be cited.</span>
                <span className="flex-1" />
                <Button variant="outline" type="button">
                  <Icon name="refresh" />
                  Ask again
                </Button>
              </div>
            </div>
          </Specimen>

          <Specimen label="Refusal">
            <Answer message={REFUSAL} onOpenCitation={noop} />
          </Specimen>

          <Specimen label="Citation dropped" width={520}>
            <Banner title="One citation was removed">
              A quoted passage did not match the stored source text, so it was dropped rather than
              shown. The rest of the answer is unchanged.
            </Banner>
          </Specimen>

          <Specimen label="Answer cut at its length limit" width={520}>
            <Banner tone="notice" title="The answer stopped at its length limit">
              What stands above is complete as far as it goes, and every citation in it was checked.
              Ask a narrower question to get the rest.
            </Banner>
          </Specimen>

          <Specimen label="Model error" width={520}>
            <Banner
              tone="danger"
              title="The answer could not be generated"
              action={
                <Button variant="outline" type="button">
                  Try again
                </Button>
              }
            >
              The model did not respond in time. Your question is still in the box.
            </Banner>
          </Specimen>

          <Specimen label="Daily limit reached" width={520}>
            <Banner tone="notice" title="Daily limit reached">
              This demo has a daily budget and it is used up. The counter resets at midnight UTC.
              Reading sources and opening reports still works.
            </Banner>
          </Specimen>

          <Specimen label="Connection lost" width={520}>
            <Banner
              tone="danger"
              title="Connection lost"
              action={
                <span
                  aria-hidden="true"
                  className="h-[14px] w-[14px] shrink-0 rounded-full border-[1.5px] border-rule-strong border-t-ink-muted motion-safe:animate-[qw-spin_700ms_linear_infinite]"
                />
              }
            >
              Reconnecting. Nothing you typed is lost.
            </Banner>
          </Specimen>

          <h2 className="mt-6 mb-3 border-b border-rule pb-2 text-h3 font-semibold">Empty</h2>

          <Specimen label="No notebooks">
            <NotebookGrid notebooks={[]} />
          </Specimen>

          <Specimen label="Notebooks loading">
            <NotebookGrid notebooks={[]} state="loading" />
          </Specimen>

          <Specimen label="Notebooks could not be loaded">
            <NotebookGrid notebooks={[]} state="error" onRetry={noop} />
          </Specimen>

          <Specimen label="No sources yet" width={300}>
            <div className="h-[200px]">
              <SourcesPanel sources={[]} />
            </div>
          </Specimen>

          <h2 className="mt-6 mb-3 border-b border-rule pb-2 text-h3 font-semibold">
            Not built yet
          </h2>
          <p className="mb-6 text-ink-muted">
            The Studio states from design/states.html - a report being generated, a report that
            failed, an empty notes list - belong to M6 and M7. They are missing here on purpose
            rather than mocked, so this page keeps saying something true about what exists.
          </p>
        </main>
      </div>
    </div>
  );
}
