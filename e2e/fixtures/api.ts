import type { Page } from '@playwright/test';

/**
 * The API, answered from memory.
 *
 * The specs under tests/ui are about the interface and must stay green when no
 * backend is running (docs/PLAN.md, M4). Since M4-T6 the pages fetch their data,
 * so "no backend" now means "the responses come from here" rather than "the
 * components are handed fixtures". That is the better test of the two: it
 * exercises the same mapping, the same loading states and the same error paths
 * the product uses, and it fails when a response shape changes.
 *
 * The shapes below are the DTOs, field for field. A citation's offsets are
 * computed from the document rather than written down, the way the route
 * computes them: numbers typed into a fixture go stale the first time somebody
 * fixes a typo in the text, and a viewer test that then marks the wrong range
 * would still be green.
 */

export const NOTEBOOK_ID = '3f1b0a3c-1f2e-4c3a-9a1b-000000000001';

const REGULATION = `Article 9
Risk management system

1. A risk management system shall be established, implemented, documented and maintained in relation to high-risk AI systems.

2. The risk management system shall be understood as a continuous iterative process planned and run throughout the entire lifecycle of the high-risk AI system, requiring regular systematic review and updating.

Article 10
Data and data governance

3. Training, validation and testing data sets shall be relevant, sufficiently representative, and to the best extent possible, free of errors and complete in view of the intended purpose.

Article 11
Technical documentation

1. The technical documentation of a high-risk AI system shall be drawn up before that system is placed on the market and shall be kept up-to-date.`;

const FAQ = `Navigating the AI Act

What must providers do before placing a high-risk system on the market?

Before a high-risk AI system is placed on the market or put into service, providers must establish, implement, document and maintain a risk management system and keep it current for as long as the system remains available.

When do the rules for high-risk AI systems start to apply?

The rules for high-risk AI systems will apply starting 2 December 2027.`;

const TEXTS: Record<string, string> = { s1: REGULATION, s2: FAQ };

const SOURCES = [
  {
    id: 's1',
    position: 1,
    title: 'Regulation (EU) 2024/1689, Chapter III (excerpt)',
    kind: 'pdf',
    status: 'ready',
    step: null,
    error: null,
    charCount: REGULATION.length,
    tokenCount: 41_200,
    createdAt: '2026-09-12T06:00:00.000Z',
  },
  {
    id: 's2',
    position: 2,
    title: 'Commission Q&A on high-risk AI systems',
    kind: 'md',
    status: 'ready',
    step: null,
    error: null,
    charCount: FAQ.length,
    tokenCount: 11_700,
    createdAt: '2026-09-12T06:01:00.000Z',
  },
  {
    id: 's3',
    position: 3,
    title: 'Internal memo: readiness gaps in the triage model',
    kind: 'paste',
    status: 'queued',
    step: 'guide',
    error: null,
    charCount: 9_400,
    tokenCount: 0,
    createdAt: '2026-09-12T07:58:00.000Z',
  },
  {
    id: 's4',
    position: 4,
    title: 'Board minutes, March 2024.pdf',
    kind: 'pdf',
    status: 'failed',
    step: null,
    error: 'The file is not a readable PDF.',
    charCount: 0,
    tokenCount: 0,
    createdAt: '2026-09-12T07:55:00.000Z',
  },
];

const NOTEBOOKS = [
  {
    id: NOTEBOOK_ID,
    title: 'EU AI Act obligations',
    emoji: '⚖️',
    summary:
      'Four sources on the obligations of providers of high-risk AI systems: the regulation itself, the Commission Q&A, an internal memo on readiness and the March board minutes. They disagree on when the high-risk rules start to apply.',
    tokenCount: 52_900,
    sourceCount: 4,
    suggestedQuestions: [
      'What must a provider do before placing a high-risk system on the market?',
      'When do the rules for high-risk AI systems start to apply?',
      'Which data governance requirements apply to training data?',
      'Where do the sources disagree?',
    ],
    isDemo: false,
    createdAt: '2026-09-12T04:00:00.000Z',
    lastUsedAt: '2026-09-12T06:00:00.000Z',
  },
  {
    id: '3f1b0a3c-1f2e-4c3a-9a1b-000000000002',
    title: 'Clinical trial protocols, phase II',
    emoji: '\u{1F3E5}',
    summary: null,
    tokenCount: 98_000,
    sourceCount: 11,
    suggestedQuestions: [],
    isDemo: false,
    createdAt: '2026-09-11T09:00:00.000Z',
    lastUsedAt: '2026-09-11T09:00:00.000Z',
  },
];

/** The offsets come from the document, exactly as the route computes them. */
function cite(sourceId: string, quote: string, page: number | null = null) {
  const text = TEXTS[sourceId];
  const start = text.indexOf(quote);
  if (start === -1) throw new Error(`fixture quote not in ${sourceId}: ${quote.slice(0, 40)}`);
  if (text.indexOf(quote, start + 1) !== -1) {
    throw new Error(`fixture quote twice in ${sourceId}: ${quote.slice(0, 40)}`);
  }
  return {
    sourceId,
    sourceTitle: SOURCES.find((source) => source.id === sourceId)!.title,
    start,
    end: start + quote.length,
    text: quote,
    page,
  };
}

export const CITED = [
  'providers must establish, implement, document and maintain a risk management system',
  'throughout the entire lifecycle of the high-risk AI system',
  'Training, validation and testing data sets shall be relevant, sufficiently representative',
  'shall be drawn up before that system is placed on the market',
  'The rules for high-risk AI systems will apply starting 2 December 2027.',
];

const MESSAGES = [
  {
    id: 'm1',
    role: 'user',
    segments: [
      {
        text: 'What exactly does a provider have to do before putting a high-risk system on the market?',
        citations: [],
      },
    ],
    droppedCitations: 0,
    refused: false,
    createdAt: '2026-09-12T06:02:00.000Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    segments: [
      {
        text: 'Four obligations come up across the sources. A provider must set up a risk management system before the system is placed on the market',
        citations: [cite('s2', CITED[0])],
      },
      {
        text: ', and that system is not a one-off exercise: it runs ',
        citations: [cite('s1', CITED[1], 12)],
      },
      {
        text: '.\n\nFor systems that involve training, the data sets underneath them carry their own requirements',
        citations: [cite('s1', CITED[2], 14)],
      },
      {
        text: '. Technical documentation must exist before the system reaches the market, not afterwards',
        citations: [cite('s1', CITED[3], 15)],
      },
      {
        text: '.\n\nThe obligations themselves apply later than the Act as a whole',
        citations: [cite('s2', CITED[4])],
      },
      { text: '.', citations: [] },
    ],
    droppedCitations: 0,
    refused: false,
    createdAt: '2026-09-12T06:02:30.000Z',
  },
  {
    id: 'm3',
    role: 'user',
    segments: [
      { text: 'Which fine did the Munich court impose in the Weber case?', citations: [] },
    ],
    droppedCitations: 0,
    refused: false,
    createdAt: '2026-09-12T06:05:00.000Z',
  },
  {
    id: 'm4',
    role: 'assistant',
    segments: [
      {
        text: 'The sources do not cover this. What they do cover is what providers owe before and after a high-risk system reaches the market, and the dates from which those rules apply. None of them mentions a court decision or a penalty in an individual case.',
        citations: [],
      },
    ],
    droppedCitations: 0,
    // The server decides this; the stub says what the server would say.
    refused: true,
    createdAt: '2026-09-12T06:05:20.000Z',
  },
];

/**
 * One streamed turn, as the route would send it.
 *
 * Playwright delivers the whole body at once, so this does not test how the
 * answer arrives over the wire - the proxy and the buffering are checked on the
 * server, by hand, through nginx. What it does test is the client: that frames
 * are split on the blank line, that a comment heartbeat is skipped, that a
 * citation lands in the segment it belongs to, and that `done` ends the turn.
 */
function chatStream(question: string): string {
  const events: unknown[] = [
    { t: 'open', i: 0 },
    { t: 'text', i: 0, d: 'Providers have to plan for what happens after the system is in use' },
    { t: 'text', i: 0, d: ', not only before it ships' },
    { t: 'cite', i: 0, c: cite('s1', CITED[1], 12) },
    { t: 'text', i: 1, d: '. That is the risk management system.' },
    { t: 'followups', q: SUGGESTIONS },
    { t: 'done', usage: { inputTokens: 12, outputTokens: 34 }, trace: {}, refused: false },
  ];

  const refusal: unknown[] = [
    { t: 'open', i: 0 },
    { t: 'text', i: 0, d: 'The sources do not cover this.' },
    { t: 'done', usage: { inputTokens: 12, outputTokens: 8 }, trace: {}, refused: true },
  ];

  const chosen = /weber|munich|fine/i.test(question) ? refusal : events;

  // A comment line first: the route sends one every fifteen seconds so a proxy
  // does not close a quiet stream, and the client has to skip it.
  return [': ping', ...chosen.map((event) => `data: ${JSON.stringify(event)}`)]
    .map((frame) => `${frame}\n\n`)
    .join('');
}

export const SUGGESTIONS = [
  'What does the regulation require for post-market monitoring?',
  'Who counts as a provider under the Act?',
];

/**
 * Four reports, one per state the panel has to draw: written, being written,
 * failed, and being written for so long that it is not being written at all.
 * The written one carries real citations, so the chips in a report can be
 * clicked into the document exactly as the chips in an answer are.
 *
 * Two of the four carry a clock rather than a date, because the panel reads the
 * age of a row and not its timestamp: `r-writing` has to be young enough to
 * still be plausible and `r-stalled` old enough not to be, whenever the suite
 * happens to run.
 */
function reports() {
  return [
    ...REPORTS,
    {
      id: 'r-writing',
      type: 'report',
      format: 'faq',
      focus: '',
      title: null,
      status: 'running',
      error: null,
      createdAt: new Date(Date.now() - 20_000).toISOString(),
      finishedAt: null,
    },
    {
      // Custom on purpose: it is the one format the panel never counts as
      // written, so this row does not take the offer away from another test.
      id: 'r-stalled',
      type: 'report',
      format: 'custom',
      focus: 'Only the deadlines, one page',
      title: null,
      status: 'running',
      error: null,
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      finishedAt: null,
    },
  ];
}

const REPORTS = [
  {
    id: 'r-ready',
    type: 'report',
    format: 'briefing',
    focus: '',
    title: 'Briefing Doc',
    status: 'ready',
    error: null,
    createdAt: '2026-09-12T07:00:00.000Z',
    finishedAt: '2026-09-12T07:00:41.000Z',
  },
  {
    id: 'r-failed',
    type: 'report',
    format: 'timeline',
    focus: '',
    title: null,
    status: 'failed',
    error: 'The model was busy. Try again in a moment.',
    createdAt: '2026-09-12T07:10:00.000Z',
    finishedAt: '2026-09-12T07:10:12.000Z',
  },
];

const REPORT_PROMPT = `Write a report from the documents above.

Every claim comes from the documents, and the ones that carry weight carry a
citation.

## Structure

# ‹Title›

One line naming what the documents are about.`;

function reportBody() {
  return {
    ...REPORTS[0],
    promptUsed: REPORT_PROMPT,
    // Copied from the shape of the first real report this repository produced
    // (M6-T1, a Briefing Doc over the corpus): the model marked its title with
    // two hashes although the prompt asks for one, and put its subsections a
    // level below its sections. The panel has to read that as a document.
    segments: [
      {
        text: '## Pflichten für Hochrisiko-KI-Systeme\n\n## Das Wichtigste in Kürze\n\nEin Risikomanagementsystem ist einzurichten, und die technische Dokumentation entsteht, bevor das System in Verkehr gebracht wird',
        citations: [cite('s2', CITED[0])],
      },
      {
        text: '. Das Risikomanagementsystem laeuft ',
        citations: [cite('s1', CITED[1], 12)],
      },
      {
        text:
          '.\n\n### Risikomanagement (Artikel 9)\n\nDer Prozess laeuft ueber den gesamten ' +
          'Lebenszyklus.\n\n## Wo sich die Quellen widersprechen\n\nDie Textstellen ' +
          'widersprechen einander nicht.',
        citations: [],
      },
    ],
  };
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/**
 * Answers every API call the interface makes.
 *
 * Anything not listed answers 404, on purpose: a request nobody expected should
 * make a test fail rather than hang on a real network that is not there.
 */
export interface StubOptions {
  /**
   * Answer a report request with this instead of creating one.
   *
   * The interesting case is not the 201: it is what the dialog does with five
   * lines the reader typed when the server says 429.
   */
  refuseReport?: { status: number; code: string; message: string };
}

export async function stubApi(page: Page, options: StubOptions = {}): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/notebooks') {
      return route.fulfill(json({ notebooks: NOTEBOOKS }));
    }
    if (path === `/api/notebooks/${NOTEBOOK_ID}`) {
      return route.fulfill(json(NOTEBOOKS[0]));
    }
    if (path === `/api/notebooks/${NOTEBOOK_ID}/sources`) {
      return route.fulfill(json({ sources: SOURCES }));
    }
    if (path === `/api/notebooks/${NOTEBOOK_ID}/reports`) {
      if (route.request().method() === 'POST') {
        const refusal = options.refuseReport;
        if (refusal) {
          return route.fulfill({
            status: refusal.status,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: refusal.code, message: refusal.message } }),
          });
        }
        const asked = route.request().postDataJSON() as { format: string };
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            report: {
              id: `r-new-${asked.format}`,
              type: 'report',
              format: asked.format,
              focus: '',
              title: null,
              status: 'queued',
              error: null,
              createdAt: new Date().toISOString(),
              finishedAt: null,
            },
          }),
        });
      }
      return route.fulfill(json({ reports: reports() }));
    }

    if (path === `/api/notebooks/${NOTEBOOK_ID}/reports/r-ready`) {
      return route.fulfill(json({ report: reportBody() }));
    }

    if (path === `/api/notebooks/${NOTEBOOK_ID}/messages`) {
      return route.fulfill(json({ messages: MESSAGES }));
    }

    if (path === `/api/notebooks/${NOTEBOOK_ID}/chat` && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { question: string };
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: chatStream(body.question),
      });
    }

    const text = /^\/api\/notebooks\/([^/]+)\/sources\/([^/]+)\/text$/.exec(path);
    if (text && text[1] === NOTEBOOK_ID && TEXTS[text[2]]) {
      const source = SOURCES.find((one) => one.id === text[2])!;
      return route.fulfill(json({ source: { ...source, text: TEXTS[text[2]] } }));
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such notebook.' } }),
    });
  });
}
