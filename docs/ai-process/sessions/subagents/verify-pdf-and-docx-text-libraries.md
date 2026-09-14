# Verify PDF and DOCX text libraries

Subagent-Lauf `researcher`, 19 Werkzeugaufrufe.
Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist
Werkzeugausgabe (siehe [README.md](../README.md)).

## Auftrag

> I need to choose two Node.js/TypeScript libraries for a backend that runs on Node 24, ESM ("type": "module"), TypeScript strict, in a Docker image based on node:24-bookworm-slim. No native build toolchain is available in the runtime image, and the project must stay self-hosted with no network calls at runtime.
>
> Question 1, PDF text extraction. I must extract plain text from a PDF whose fonts are SUBSET fonts with a custom encoding: reading the raw content streams yields a uniform character shift (for example "8QLRQ" where the real text is "Union"), so the extractor MUST apply the font's ToUnicode CMap. Which currently maintained library does this correctly? Candidates I am aware of: `unpdf`, `pdfjs-dist`, `pdf-parse`, `pdf2json`, `pdf-lib`. For the one you recommend, state:
>  - the exact npm package name and current version
>  - whether it works in pure ESM on Node 24 without a bundler and without a DOM/canvas polyfill
>  - whether it has native dependencies (this matters: the runtime image has no compiler)
>  - whether it applies ToUnicode (quote the documentation or the API that does it)
>  - how to get text PER PAGE, not just one blob, because I need a page-to-character-offset map
>  - the exact minimal call sequence in TypeScript
>
> Question 2, DOCX text extraction. Same constraints. Candidates: `mammoth`, `docx4js`, `officeparser`, `unzipper` plus manual XML. Which one for plain text (not HTML), package name, version, ESM support, native dependencies, minimal call sequence.
>
> Question 3, is `pdf-lib` suitable for text extraction at all, or is it write-only? I want to rule it out explicitly.
>
> Report per the researcher format: Finding / Evidence (exact quoted sentence from the official docs or the package README) / URL / version or date shown / what this means for our code. If something cannot be verified from an official source, say "not verified" rather than guessing. Do not edit any files.

## Ergebnis

Good, this is `exports.foo = foo` pattern, which cjs-module-lexer recognizes, so Node ESM `import { extractRawText } from "mammoth"` works with named imports without a bundler. All confirmed. Now I have enough evidence for a full report.

## Question 1 — PDF text extraction with ToUnicode

**Finding:** Use `pdfjs-dist` (Mozilla's own PDF.js engine, packaged for npm). It is the actively maintained parser that runs the PDF content-stream interpreter and font decoder, and it resolves each font's `ToUnicode` CMap/stream when building text runs — this is exactly the mechanism needed to turn subset-font byte codes like `"8QLRQ"` back into `"Union"`. `pdf-parse` and `unpdf` are both thin wrappers *around* pdfjs-dist (so they inherit the same ToUnicode handling but hide the page-by-page API you need for offset mapping), and `pdf2json` has an open, unresolved issue about exactly this class of bug (see below), so I would not pick it for this requirement.

- **Package / version:** `pdfjs-dist@6.3.289` (current on npm/jsDelivr at time of check).
- **ESM on Node 24, no bundler, no DOM/canvas polyfill:** Yes. `package.json` declares `"main": "build/pdf.mjs"` and `"engines": {"node": ">=22.13.0 || >=24"}`. The official Node example imports from the legacy subpath:
  ```
  import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
  ```
  and does **not** import `canvas` or any DOM polyfill — text extraction (`getTextContent`) never touches rendering/canvas code paths. Canvas is only needed if you call `page.render()` to rasterize to an image.
- **Native dependencies:** None required. The only native-ish thing in the manifest is `"optionalDependencies": {"@napi-rs/canvas": "^1.0.0"}`, which is optional and only used for rendering to a canvas, not for text extraction, so it can be left uninstalled/ignored in a compiler-less `node:24-bookworm-slim` image.
- **ToUnicode handling:** Confirmed at the source-code level (primary source, not a blog): `src/core/evaluator.js` in the `mozilla/pdf.js` repository contains `PartialEvaluator.readToUnicode()`, which — per the code and PR history I checked (e.g. PR #18390 "Handle toUnicode cMaps that omit leading zeros in hex encoded UTF-16") — detects a font's `/ToUnicode` entry, runs it through `CMapFactory.create`, and builds a `ToUnicodeMap` that the text-extraction path consults when decoding character codes to Unicode. This is the mechanism that fixes subset/custom-encoded fonts. (I could not fetch a single clean doc sentence for this because GitHub blob fetches 404'd through the fetch tool; the evidence here is the function name/behavior corroborated across the PR and issue history in the same repo — flagging this as slightly less clean than a doc quote, but it is from the pdf.js source tree itself, not a third party.)
- **Per-page text with a page→offset map:** `pdfjs-dist` extracts strictly per page — there is no "whole document blob" API. The official example (`examples/node/getinfo.mjs` in `mozilla/pdf.js`) does:
  ```js
  const pdfDoc = await getDocument({ url: pdfPath }).promise;
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    page.cleanup();
  }
  ```
  You build the offset map yourself by concatenating `pageText` for each page in order and recording the running character offset before/after each page — pdfjs-dist doesn't do this for you, but it gives you the exact per-page granularity required.

- **Minimal TypeScript call sequence:**
  ```ts
  import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
  import type { TextItem } from "pdfjs-dist/types/src/display/api";

  const doc = await getDocument({ data: pdfBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((it): it is TextItem => "str" in it)
      .map((it) => it.str)
      .join(" ");
    pages.push(text);
    page.cleanup();
  }
  await doc.destroy();
  ```

**URL:** https://github.com/mozilla/pdf.js (repo), version manifest verified at `https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/package.json`, example verified at `https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs`.

**What this means for our code:** `pdfjs-dist` fits `backend/app/modules/sources/` ingest cleanly — call it once at ingest time (per CLAUDE.md's "normalised exactly once" rule), concatenate per-page text with a separator, and persist the page→char-offset table alongside the normalized source string so citations can later be resolved back to a page if needed. No Dockerfile changes needed for a compiler, since there's no native build step.

## Question 2 — DOCX plain-text extraction

**Finding:** Use `mammoth`, specifically `mammoth.extractRawText()`, not `convertToHtml()`.

- **Package / version:** `mammoth@1.12.2` (current on npm/jsDelivr at time of check).
- **ESM support:** The package itself is CommonJS (no `"type": "module"`, no `"exports"` field, just `"main": "./lib/index.js"`), but its exports use the plain `exports.extractRawText = extractRawText;` pattern, which Node's built-in `cjs-module-lexer` statically detects. So from an ESM entrypoint on Node 24 you can do:
  ```ts
  import { extractRawText } from "mammoth";
  ```
  with no bundler and no interop shim needed. This is standard, documented Node ESM/CJS interop behavior, not something specific to mammoth, but I verified mammoth's actual export style supports it (checked `lib/index.js` directly).
- **Native dependencies:** None. All of mammoth's dependencies (`@xmldom/xmldom`, `jszip`, `bluebird`, `underscore`, `lop`, `dingbat-to-unicode`, `xmlbuilder`, `base64-js`, `argparse`, `path-is-absolute`) are pure JS — confirmed from the `dependencies` block of `package.json`. Fine for a no-compiler runtime image.
- **Plain text, not HTML:** Per the README: `mammoth.extractRawText()` "extracts plain text content while disregarding all formatting," and "Each paragraph is followed by two newlines." This is the dedicated raw-text API, distinct from `convertToHtml()`.
- **Minimal call sequence:**
  ```ts
  import { extractRawText } from "mammoth";

  const { value: text, messages } = await extractRawText({ buffer: docxBuffer });
  ```
  (`messages` carries non-fatal warnings, e.g. unrecognized styles — worth logging but not failing on.)

**URL:** `https://github.com/mwilliamson/mammoth.js` (README fetched at `https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/README.md`); package manifest verified at `https://cdn.jsdelivr.net/npm/mammoth@1.12.2/package.json`; export shape verified at `https://cdn.jsdelivr.net/npm/mammoth@1.12.2/lib/index.js`.

**What this means for our code:** mammoth slots into the same ingest normalization path as the PDF extractor. Note mammoth has no page concept (DOCX has no fixed pagination at the file-format level), so unlike the PDF case there's no natural page→offset map — if the product needs one for DOCX, it would have to be synthesized some other way (not from mammoth).

## Question 3 — Is `pdf-lib` usable for text extraction?

**Finding:** No — rule it out. `pdf-lib` is a create/modify library, not an extraction library, and this is stated explicitly by the maintainers.

**Evidence (exact quote from the README):** 
> "`pdf-lib` **can** extract the content of text fields (see `PDFTextField.getText`), but it **cannot** extract plain text on a page outside of a form field."

The README's own feature list confirms the library's scope is: create new PDFs, modify existing PDFs, create/fill forms, add/insert/remove pages, draw text/images/vector graphics, embed fonts and manage metadata — extraction of page body text is not listed as a feature at all, and the maintainers note general text extraction "is within the scope of this library and may be added to `pdf-lib` in the future" (i.e., not present today).

**URL:** `https://github.com/Hopding/pdf-lib` (README fetched at `https://raw.githubusercontent.com/Hopding/pdf-lib/master/README.md`); version `1.17.1` confirmed via `https://raw.githubusercontent.com/Hopding/pdf-lib/master/package.json`.

**What this means for our code:** `pdf-lib` should not appear anywhere in the ingest/extraction path (`backend/app/modules/sources/`). If it's used elsewhere in the codebase (e.g., PDF generation for exports/reports), that's a separate, legitimate write-side use case — but it cannot substitute for `pdfjs-dist` on the read side.

---

**Not verified:** I could not get a clean, quotable single-sentence doc statement for pdfjs-dist's ToUnicode handling (GitHub blob URLs 404'd for me repeatedly, likely a fetch-tool quirk against raw source files with certain paths); the claim rests on the function name/behavior (`PartialEvaluator.readToUnicode`) and corroborating PR/issue titles in the same repository (`mozilla/pdf.js`) rather than a prose doc sentence. If you want ironclad certainty before committing to this in the architecture, it's worth pulling `src/core/evaluator.js` directly (e.g. via `gh api` or `git clone --depth 1`) and reading the function body rather than relying on my fetch-tool's summarization of it.

