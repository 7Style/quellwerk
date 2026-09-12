import type { Citation } from '@/lib/citation';
import type { Message } from '../types/message';

/**
 * Resolves a quote to a citation against the real source text.
 *
 * The fixtures do not carry offsets, and that is deliberate. A citation is a
 * claim about where a passage stands in a document; numbers typed into a fixture
 * are a claim about nothing, and they go stale the first time the text changes.
 * The route computes them from the document, so the fixture asks its caller to
 * do the same (`citeQuote` in lib/citation.ts).
 *
 * It also keeps the module boundary: the documents belong to the sources
 * module, which this one may not import, so the page that has both wires them.
 */
export type CiteResolver = (sourceId: string, quote: string) => Citation;

/**
 * Two turns: an answer with five citations across two sources, and a refusal
 * with none.
 *
 * The second one is the important one. It is what the product does when the
 * documents do not answer the question, and it has to be visible next to an
 * answer that does - same thread, same screen, no chip anywhere in it.
 */
export function threadFixture(cite: CiteResolver): Message[] {
  return [
    {
      id: 'm1',
      role: 'user',
      text: 'What exactly does a provider have to do before putting a high-risk system on the market?',
    },
    {
      id: 'm2',
      role: 'assistant',
      droppedCitations: 0,
      segments: [
        {
          text: 'Four obligations come up across the sources. A provider must set up a risk management system before the system is placed on the market',
          citations: [
            cite(
              's2',
              'providers must establish, implement, document and maintain a risk management system'
            ),
          ],
        },
        {
          text: ', and that system is not a one-off exercise: it runs ',
          citations: [cite('s1', 'throughout the entire lifecycle of the high-risk AI system')],
        },
        {
          text: '.\n\nFor systems that involve training, the data sets underneath them carry their own requirements',
          citations: [
            cite(
              's1',
              'Training, validation and testing data sets shall be relevant, sufficiently representative'
            ),
          ],
        },
        {
          text: '. Technical documentation must exist before the system reaches the market, not afterwards',
          citations: [cite('s1', 'shall be drawn up before that system is placed on the market')],
        },
        {
          text: '.\n\nThe obligations themselves apply later than the Act as a whole',
          citations: [
            cite('s2', 'The rules for high-risk AI systems will apply starting 2 December 2027.'),
          ],
        },
        { text: '.', citations: [] },
      ],
    },
    {
      id: 'm3',
      role: 'user',
      text: 'Which fine did the Munich court impose in the Weber case?',
    },
    {
      id: 'm4',
      role: 'assistant',
      droppedCitations: 0,
      segments: [
        {
          text: 'The sources do not cover this. What they do cover is what providers owe before and after a high-risk system reaches the market, the data governance requirements behind it, and the dates from which those rules apply. None of them mentions a court decision or a penalty in an individual case.',
          citations: [],
        },
      ],
    },
  ];
}

/** The follow-ups of the last turn, as MODEL_FAST would return them. */
export const suggestionFixtures = [
  'What does the regulation require for post-market monitoring?',
  'Who counts as a provider under the Act?',
  'Which obligations apply to providers outside the EU?',
];
