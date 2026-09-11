/**
 * An answerer that needs neither a model nor a recording: it builds the answer
 * out of the golden item itself and looks the offsets up in the corpus.
 *
 * Two jobs, and the second is the important one.
 *
 * It grades the harness. `--sanity` runs it over every golden item, so a quote
 * that cannot be found, a refusal that is not phrased as one, or a language
 * without a refusal sentence shows up before a single token is paid for.
 *
 * And it can lie. ADR-0008 says it in one line: the stub has to be honest,
 * which means it has to be able to produce a wrong citation. A test suite whose
 * only fixtures are correct proves that correct fixtures pass, and that is not
 * what anyone wants to know. `corrupt` makes it return a citation whose offsets
 * no longer match the text, or a refusal that carries a chip, so the check can
 * be seen failing on purpose.
 *
 * What it cannot do is say anything about answer quality. Its answers are the
 * expected answers, rearranged. A correctness number from this answerer would
 * be the golden set marking itself.
 */
import type { CorpusFile } from '../corpus.js';
import type { GoldenItem } from '../golden.js';
import { REFUSALS } from '../score.js';
import type { Answerer, EvalAnswer, EvalCitation } from './types.js';

/** The ways a citation can be wrong, each one a real failure mode. */
export type Corruption =
  /** Offsets moved by one character: the classic off-by-one in a highlight. */
  | 'shift-offset'
  /** Offsets far outside the text: a document index mapped to the wrong source. */
  | 'out-of-range'
  /** The quoted text edited while the offsets stay: a model paraphrasing its own quote. */
  | 'edit-cited-text'
  /** A refusal that still carries a chip, which the spec forbids outright. */
  | 'cite-while-refusing';

export interface StubOptions {
  /** Applied to the first citation of `corruptItem`, or of every item when that is unset. */
  corrupt?: Corruption;
  corruptItem?: string;
}

export class QuoteNotFoundError extends Error {
  constructor(itemId: string, file: string) {
    super(`${itemId}: evidence quote not found in ${file}; run validate-golden.ts`);
    this.name = 'QuoteNotFoundError';
  }
}

export class StubAnswerer implements Answerer {
  readonly name: string;
  readonly callsModel = false;

  constructor(
    private readonly corpus: Map<string, CorpusFile>,
    private readonly options: StubOptions = {}
  ) {
    this.name = options.corrupt ? `stub (${options.corrupt})` : 'stub';
  }

  async answer(item: GoldenItem): Promise<EvalAnswer> {
    const corrupt = this.corruptionFor(item);

    if (item.type === 'unanswerable') {
      const text = REFUSALS[item.lang] ?? `no refusal sentence for language ${item.lang}`;
      const citations =
        corrupt === 'cite-while-refusing' ? [this.anyCitation()].filter(isCitation) : [];
      return { text, citations, latencyMs: 0 };
    }

    const citations = item.evidence.map((evidence) => {
      const file = this.corpus.get(evidence.file);
      if (!file) throw new QuoteNotFoundError(item.id, evidence.file);
      const start = file.text.indexOf(evidence.quote);
      if (start === -1) throw new QuoteNotFoundError(item.id, evidence.file);
      return {
        file: evidence.file,
        start,
        end: start + evidence.quote.length,
        citedText: evidence.quote,
      };
    });

    if (corrupt && citations.length > 0) {
      citations[0] = damage(citations[0], corrupt);
    }

    // The answer text is the reference facts followed by the quotes. It reads
    // like an answer, which is all the harness needs; nothing here is meant to
    // pass for one.
    const text = [...item.facts, ...item.evidence.map((evidence) => evidence.quote)].join(' ');
    return { text, citations, latencyMs: 0 };
  }

  private corruptionFor(item: GoldenItem): Corruption | undefined {
    if (!this.options.corrupt) return undefined;
    if (this.options.corruptItem && this.options.corruptItem !== item.id) return undefined;
    return this.options.corrupt;
  }

  /** Any real citation, used only to prove that a refusal must not carry one. */
  private anyCitation(): EvalCitation | undefined {
    const first = this.corpus.values().next();
    if (first.done) return undefined;
    const file = first.value;
    return {
      file: file.file,
      start: 0,
      end: Math.min(20, file.text.length),
      citedText: file.text.slice(0, Math.min(20, file.text.length)),
    };
  }
}

function isCitation(citation: EvalCitation | undefined): citation is EvalCitation {
  return citation !== undefined;
}

function damage(citation: EvalCitation, corruption: Corruption): EvalCitation {
  switch (corruption) {
    case 'shift-offset':
      return { ...citation, start: citation.start + 1, end: citation.end + 1 };
    case 'out-of-range':
      return { ...citation, start: 10_000_000, end: 10_000_042 };
    case 'edit-cited-text':
      return { ...citation, citedText: `${citation.citedText} ` };
    case 'cite-while-refusing':
      return citation;
    default: {
      const never: never = corruption;
      throw new Error(`unknown corruption ${String(never)}`);
    }
  }
}
