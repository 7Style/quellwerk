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
    summary: null,
    tokenCount: 52_900,
    sourceCount: 4,
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

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/**
 * Answers every API call the interface makes.
 *
 * Anything not listed answers 404, on purpose: a request nobody expected should
 * make a test fail rather than hang on a real network that is not there.
 */
export async function stubApi(page: Page): Promise<void> {
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
