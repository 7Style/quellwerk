# prompts/

Every text that is sent to a model lives here as a Markdown file and is loaded at
runtime by the backend's prompt-loader service (path `../prompts` from `backend/`;
the backend Docker image is built from the repo root so the folder is inside it).
Nothing is inlined in TypeScript. The "View prompt used" menu in the app
shows the rendered file, so a reviewer reads the real prompt, not a copy.

The files are written in the milestone that needs them (M1 judges, M2 ingest, M3
chat, M6 reports, M10 and M11 optional) and change only through the eval loop
(backend/evals/HILLCLIMB.md). Until then this README is the only file here; it is
the contract every prompt follows.

## File format

Optional YAML front matter (documentation for humans and for the loader), then the
prompt text. The loader strips the front matter.

```yaml
---
route: chat            # where it is used
model: MODEL_CHAT      # env var name, resolved in backend/app/config/models.ts
effort: low            # output_config.effort; absent on MODEL_FAST prompts (Haiku 4.5 has no effort parameter)
citations: true        # document blocks with citations enabled?
output: text           # text | json (structured outputs) 
cache: frozen          # frozen = must stay byte-identical (part of the cached prefix)
---
```

## Template syntax (deliberately tiny, see backend/app/services/prompt-loader/render.ts)

- `{{name}}` is replaced by the value, with `<` and `>` replaced by the single-angle characters `‹` and `›` (U+2039, U+203A); missing values throw at render time. Nothing else happens to the value: no whitespace collapsing, no shortening, no HTML escaping. A value can therefore never open or close a tag of the prompt, wherever in the file it lands, and the reader still sees what the user wrote.
- `{{#if name}} ... {{/if}}` keeps the block only when the value is truthy.
- Nothing else. No loops: the caller pre-formats lists as strings.
- `{{language}}` is always an English language name ("German", "English"), derived from the majority `language` code of the ready sources' guides (ties: the first source). Never pass the BCP-47 code; "Write in de." is not a sentence.
- `{{{name}}}` renders the value raw. It is allowed only for content that lives in this repository; that is `structure` in report-common.md and nothing else, because the report structure blocks use angle brackets as placeholders. Never use it for source text or for anything a user typed.
- Lengths are limited by the zod schema of the route, never by the renderer. The renderer does not truncate.

## Two request builders, one data model

| Builder | Documents | Citations | Structured output | Used by |
|---|---|---|---|---|
| `buildChatRequest` | all ready sources as `text/plain` document blocks | on | no (400 if combined) | chat, reports |
| `buildArtifactRequest` | same documents | off | yes (`messages.parse` + `zodOutputFormat`) | overview, mind map, audio script |

Both builders emit the documents in the same order (source `position`), with
`title` and `context: JSON.stringify({sourceId, kind, pages})`. `document_index`
in a citation is 0-based over document blocks only, across all messages, so the
citation resolver maps it through the builder's ordered `sourceId[]` (the same
order the documents were emitted in). `context` is informational for the model
and is never returned in a citation.

## Cache rules (prefix must be byte-identical)

1. `notebook-chat-system.md` is frozen: no dates, no notebook title, no user data.
2. `cache_control: {type:'ephemeral', ttl:'1h'}` on the LAST document block. It
   caches system + all documents. No breakpoint on the system block (a
   shorter-TTL breakpoint before a longer one is the wrong order). A second
   5-minute breakpoint (`{type:'ephemeral'}`) may sit on the LAST TEXT block of
   the last assistant turn (never on a thinking block or a citation; those cannot
   carry `cache_control`) so long conversations read their history from cache too.
3. Everything that changes per turn (Configure chat, selected sources, the
   question) goes into the LAST user turn via `chat-preferences-tail.md`.
4. ONE effort level per cache namespace. Changing `output_config.effort` (or the
   model) invalidates the messages cache, and the documents live in messages.
   Chat and reports therefore both use `EFFORT_CHAT`. The artifact builder is a
   separate namespace anyway: citations off changes the system prefix, and
   `output_config.format` injects the schema as an additional system prompt, so
   overview, mind map and audio script never share a cache with chat or with each
   other. Effort may therefore differ per artifact. The artifact builder sets no
   1h breakpoint; at most a 5-minute `{type:'ephemeral'}` on the last document
   block so the one validation retry reads the documents.
5. Assistant turns are replayed with their original content blocks (thinking
   blocks with signature, text blocks with citations; `cited_text` is not billed
   again). History is capped at the last 20 turns or 60K tokens. When the source
   set changes, the thread is reset (replayed citations would point at the wrong
   document indexes).
6. Verify: `usage.cache_read_input_tokens > 0` on the second turn, after a
   Configure-chat change, and on a report request right after a chat turn. The
   eval asserts all three. The Trace toggle shows the numbers.

## Structured outputs: schema limits

`output_config.format` rejects recursive schemas, `minLength`/`maxLength`,
`minimum`/`maximum`, and array constraints beyond `minItems` 0 or 1. Keep the zod
schemas free of counts and lengths; enforce "exactly 4 questions", "max 8 words",
"2-6 children" in code after `parsed_output`, and warm every schema in the seed
script and in the warm-cache job during the review window (the smoke eval runs on
fixtures and cannot warm anything); the compiled grammar expires 24 hours after
last use.

## Model routing (backend/app/config/models.ts, from backend/.env)

| Env | Default | Used for |
|---|---|---|
| MODEL_CHAT | claude-opus-5 | chat and reports (EFFORT_CHAT, default low; one value for both), overview (low), mind map (low), audio script (high) |
| MODEL_FAST | claude-haiku-4-5 | source guide, notebook title, follow-up questions. No `output_config.effort` and no thinking: Haiku 4.5 rejects effort, and the loader must not default it when the front-matter key is absent |
| MODEL_JUDGE | claude-sonnet-5 | eval judges only. Differs from the default chat model; when MODEL_CHAT is switched to claude-sonnet-5 for the comparison row, the judge stays claude-sonnet-5 so both rows are graded by the same judge, and RESULTS.md marks that row as self-judged |

`MODEL_CHAT=claude-sonnet-5` is a one-line switch if latency or cost matters
more than answer quality; the README cost table shows both. If you switch for
good, set `MODEL_JUDGE=claude-opus-5` so the judge stays a different model from
the route under test.

## Evals

`backend/evals/golden.jsonl` holds German and English questions only. The runner's
abstention check compares the answer against exactly the two refusal sentences that
notebook-chat-system.md fixes ("Die Quellen enthalten dazu keine Informationen." and
"The sources do not cover this."); an answer in a third language is not measured.
Adding a language means adding its sentence to the runner, not touching the frozen
system prompt.

## Files (target list; each file appears in the milestone named above)

| File | Route | Notes |
|---|---|---|
| notebook-chat-system.md | chat + reports | frozen system block |
| chat-preferences-tail.md | chat | appended to the latest user turn |
| source-guide.md | ingest | per source, MODEL_FAST (no effort), json; the source is a document block above the instructions, never a template value |
| notebook-title.md | ingest | first source only, MODEL_FAST, json |
| notebook-overview.md | ingest (debounced) | MODEL_CHAT effort low, json, no citations |
| follow-up-questions.md | chat (after stream) | MODEL_FAST, json |
| report-common.md + report-*.md | studio reports | user turn on the chat builder, same EFFORT_CHAT, citations on |
| mind-map.md | studio | MODEL_CHAT effort low, json, no citations |
| audio-overview-script.md | studio | MODEL_CHAT effort high, json, no citations |
| eval-judge-faithfulness.md | evals | MODEL_JUDGE effort low, json; score null for refusals, excluded from the mean |
| eval-judge-correctness.md | evals | MODEL_JUDGE effort low, json; behaviours incl. hijacked, reported_injection |
