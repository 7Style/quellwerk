/**
 * Turns an uploaded file or pasted text into the one string that gets stored.
 *
 * Everything here runs exactly once per source, at ingest. What comes out is
 * normalised and never touched again; a citation's character offsets point into
 * it (ADR-0003). Extraction is therefore not a convenience step but the place
 * where a wrong decision becomes a wrong highlight months later.
 */
import { buildPagedText, type PageSpan } from './pages.js';
import { normalize } from './normalize.js';

/** The kinds docs/SPEC.md allows. Website sources are cut (docs/KNOWN-LIMITS.md). */
export type SourceKind = 'pdf' | 'txt' | 'md' | 'docx' | 'paste';

export interface ExtractResult {
  /** Normalised, ready to store. */
  text: string;
  /**
   * Page spans, empty for formats that have no pages. Empty is the honest
   * answer for a pasted note: inventing "page 1" would put a number in the
   * hover that means nothing.
   */
  pages: PageSpan[];
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly reason: 'empty' | 'no-text-layer' | 'unsupported' | 'broken'
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/** A PDF with almost no extractable text is a scan; OCR is out of scope. */
const MIN_PDF_CHARS = 200;

export async function extract(kind: SourceKind, input: Buffer | string): Promise<ExtractResult> {
  switch (kind) {
    case 'txt':
    case 'md':
    case 'paste':
      return extractPlain(input);
    case 'pdf':
      return extractPdf(toBuffer(input));
    case 'docx':
      return extractDocx(toBuffer(input));
    default: {
      const never: never = kind;
      throw new ExtractionError(`unsupported source kind: ${String(never)}`, 'unsupported');
    }
  }
}

function toBuffer(input: Buffer | string): Buffer {
  return typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
}

function extractPlain(input: Buffer | string): ExtractResult {
  const raw = typeof input === 'string' ? input : input.toString('utf8');
  const text = normalize(raw);
  if (text.length === 0) {
    throw new ExtractionError('the source is empty after normalisation', 'empty');
  }
  return { text, pages: [] };
}

/**
 * PDF text, page by page.
 *
 * The corpus PDF uses subset fonts with their own encoding: reading the content
 * streams directly returns a uniform character shift, not German. The library
 * has to apply the font's ToUnicode map, and the tests assert that with three
 * sentences that stand verbatim in the document, rather than asserting that any
 * text came out at all.
 */
async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const pageTexts = await readPdfPages(buffer);
  const { text, pages } = buildPagedText(pageTexts);

  if (text.length < MIN_PDF_CHARS) {
    throw new ExtractionError(
      'this PDF carries almost no text; it is probably a scan, and OCR is out of scope',
      'no-text-layer'
    );
  }
  return { text, pages };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const raw = await readDocxText(buffer);
  const text = normalize(raw);
  if (text.length === 0) {
    throw new ExtractionError('the document contains no text', 'empty');
  }
  return { text, pages: [] };
}

/* -------------------------------------------------------------------------- */
/* Library boundary. Kept in two thin functions so the choice of library is one */
/* import and not spread through the module.                                    */
/* -------------------------------------------------------------------------- */

/**
 * pdfjs-dist is Mozilla's own engine and the reason the subset fonts decode:
 * it reads each font's ToUnicode map instead of the raw content stream. The
 * legacy ESM build is the one that runs on Node without a DOM.
 *
 * Both readers are loaded with a dynamic import. Extraction happens in the
 * worker, never in the API process, and this way the API never pulls the
 * library into its module graph at all.
 */
async function readPdfPages(buffer: Buffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // useSystemFonts stays off: a crafted file should not make the process go
  // looking through the host's font directories.
  //
  // verbosity 0 is errors only, so a malformed document does not fill the log
  // with per-page notices.
  //
  // It does NOT silence the three lines pdfjs prints when the module is first
  // imported, about a missing @napi-rs/canvas and DOMMatrix polyfills: those
  // fire at load time, before any option is read. They concern rendering a page
  // to an image, which we never do, and the canvas dependency is removed on
  // purpose (pnpm-workspace.yaml). Measured: they appear once per process, not
  // once per extraction, so the worker logs them at startup and never again.
  // Four lines once is the better trade than a native binary nothing calls.
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) {
          continue;
        }
        // The items already carry their spaces. Joining with a space instead
        // would put one inside every word that the layout split into two runs.
        text += item.str;
        if (item.hasEOL) {
          text += '\n';
        }
      }
      pages.push(text);
      page.cleanup();
    }
    return pages;
  } finally {
    // destroy() lives on the loading task, not on the document.
    await loadingTask.destroy();
  }
}

async function readDocxText(buffer: Buffer): Promise<string> {
  const { extractRawText } = await import('mammoth');
  const { value } = await extractRawText({ buffer });
  return value;
}
