/**
 * Checks the golden set against the corpus before anything is measured with it.
 *
 * Run:
 *   pnpm --filter @quellwerk/backend exec tsx evals/validate-golden.ts
 *   pnpm --filter @quellwerk/backend exec tsx evals/validate-golden.ts evals/golden.draft.jsonl
 *
 * The point of this file is one property: an evidence quote must exist, exactly
 * once, in the NORMALISED text of the corpus file it names. Normalised, because
 * that is the string the model sees and the string a citation's offsets point
 * into (ADR-0003); a quote checked against the raw file would be checked against
 * a text that never exists at runtime. Exactly once, because a quote that occurs
 * twice does not identify a character range, and a grader that picked the first
 * occurrence would silently accept a citation into the wrong passage.
 *
 * Everything here is deterministic and offline. No API key, no model.
 */
import path from 'node:path';

import { byFile, loadCorpus, type CorpusFile } from './corpus.js';
import { GOLDEN_FILE, ITEM_TYPES, loadGolden, type GoldenItem } from './golden.js';

const EXPECTED_TOTAL = 30;
const EXPECTED_DEV = 20;
const EXPECTED_HELDOUT = 10;

const problems: string[] = [];

function fail(where: string, message: string): void {
  problems.push(`${where}: ${message}`);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + 1;
  }
}

/**
 * Says WHERE a quote stops matching instead of guessing why.
 *
 * The first version of this function guessed: if the first 24 characters were
 * present it blamed a line break. That reads well and is wrong as often as it
 * is right, and a diagnosis that is confidently wrong costs more time than none
 * at all. So it now measures: the longest prefix that still occurs in the file,
 * and what actually follows it there.
 */
function explainMiss(file: CorpusFile, quote: string): string {
  const collapsed = quote.replace(/\s+/g, ' ');
  if (collapsed !== quote && file.text.includes(collapsed)) {
    return 'it matches after collapsing whitespace; copy it from the normalised text, not from a PDF viewer';
  }

  // Longest prefix of the quote that still occurs in the file. Binary search
  // over the length: the property is monotonic, a longer prefix can only be
  // rarer than a shorter one.
  let low = 0;
  let high = quote.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (file.text.includes(quote.slice(0, mid))) low = mid;
    else high = mid - 1;
  }

  if (low === 0) return 'not found in the normalised text, not even its first character';

  const at = file.text.indexOf(quote.slice(0, low));
  const actual = file.text.slice(at + low, at + low + 30).replace(/\n/g, '\\n');
  const expected = quote.slice(low, low + 30).replace(/\n/g, '\\n');
  return `matches for ${low} characters, then the file has "${actual}" where the quote has "${expected}"`;
}

function checkStructure(items: GoldenItem[]): void {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) fail(item.id, 'duplicate id');
    seen.add(item.id);

    const files = new Set(item.evidence.map((evidence) => evidence.file));

    if (item.type === 'unanswerable') {
      if (item.evidence.length > 0) {
        fail(item.id, 'unanswerable carries evidence; a refusal has nothing to cite');
      }
      if (item.facts.length > 0) {
        fail(item.id, 'unanswerable carries reference facts; there is nothing to be right about');
      }
    } else {
      if (item.evidence.length === 0) {
        fail(item.id, `${item.type} needs at least one evidence quote`);
      }
      if (item.facts.length === 0) {
        fail(item.id, `${item.type} needs at least one reference fact`);
      }
    }

    // Both types exist to test what happens ACROSS sources: one file cannot be
    // complementary to itself, and a disagreement inside a single file is a
    // different case (the grounding contract calls it "probable error").
    if ((item.type === 'multi_source' || item.type === 'conflict') && files.size < 2) {
      fail(item.id, `${item.type} must quote at least two different corpus files, got ${files.size}`);
    }
  }
}

function checkQuotes(items: GoldenItem[], corpus: Map<string, CorpusFile>): void {
  for (const item of items) {
    for (const [index, evidence] of item.evidence.entries()) {
      const file = corpus.get(evidence.file);
      if (!file) {
        fail(`${item.id}.evidence[${index}]`, `unknown corpus file "${evidence.file}"`);
        continue;
      }
      const hits = countOccurrences(file.text, evidence.quote);
      if (hits === 0) {
        fail(`${item.id}.evidence[${index}]`, `${evidence.file}: ${explainMiss(file, evidence.quote)}`);
      } else if (hits > 1) {
        fail(
          `${item.id}.evidence[${index}]`,
          `${evidence.file}: the quote occurs ${hits} times, so it does not identify one passage`
        );
      }
    }
  }
}

function tally<T extends string>(items: GoldenItem[], key: (item: GoldenItem) => T): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const file = arg ? path.resolve(process.cwd(), arg) : GOLDEN_FILE;
  const relative = path.relative(process.cwd(), file);
  // A path outside the working directory produces a relative path of nothing
  // but "../", which is harder to read than the absolute one.
  const shown = relative.startsWith('..') ? file : relative;

  let items: GoldenItem[];
  try {
    const parsed = await loadGolden(file);
    items = parsed.items;
    problems.push(...parsed.problems);
  } catch {
    console.error(`Cannot read ${shown}.`);
    console.error('The golden set is written by hand; a draft lives in evals/golden.draft.jsonl.');
    process.exit(1);
  }

  checkStructure(items);
  checkQuotes(items, byFile(await loadCorpus()));

  const bySplit = tally(items, (item) => item.split);
  const dev = bySplit.get('dev') ?? 0;
  const heldout = bySplit.get('heldout') ?? 0;

  if (items.length !== EXPECTED_TOTAL) {
    fail('total', `expected ${EXPECTED_TOTAL} items, got ${items.length}`);
  }
  if (dev !== EXPECTED_DEV) fail('split', `expected ${EXPECTED_DEV} dev items, got ${dev}`);
  if (heldout !== EXPECTED_HELDOUT) {
    fail('split', `expected ${EXPECTED_HELDOUT} heldout items, got ${heldout}`);
  }

  console.log(`${shown}`);
  console.log(`${items.length} items, ${dev} dev / ${heldout} heldout`);

  const byType = tally(items, (item) => item.type);
  for (const type of ITEM_TYPES) {
    const total = byType.get(type) ?? 0;
    const inDev = items.filter((item) => item.type === type && item.split === 'dev').length;
    console.log(
      `  ${type.padEnd(13)} ${String(total).padStart(2)}  (${inDev} dev / ${total - inDev} heldout)`
    );
  }

  const byLang = tally(items, (item) => item.lang);
  console.log(`  de ${byLang.get('de') ?? 0}, en ${byLang.get('en') ?? 0}`);
  console.log(
    `  evidence quotes: ${items.reduce((sum, item) => sum + item.evidence.length, 0)} checked against the normalised corpus`
  );

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log('\nEvery quote occurs exactly once in the normalised corpus text.');
}

await main();
