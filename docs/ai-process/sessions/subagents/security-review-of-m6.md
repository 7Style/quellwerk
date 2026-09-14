# Security review of M6

Subagent-Lauf `reviewer`, 76 Werkzeugaufrufe.
Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist
Werkzeugausgabe (siehe [README.md](../README.md)).

## Auftrag

> Review milestone M6 (Studio reports) of /Users/7style/Projects/quellwerk against docs/SPEC.md, docs/PLAN.md (section "## M6 Studio reports"), CLAUDE.md and SECURITY.md section 7.
>
> The diff is `git log --oneline af2cc24~1..HEAD` — four commits: af2cc24, f5ba425, dfcd8cd, 51b7ca8. Use `git diff af2cc24~1..HEAD` and read the files in full where it matters.
>
> What M6 added:
> - prompts/report-common.md and prompts/report-{briefing,study-guide,faq,timeline,custom}.md. report-common.md renders the structure block raw through {{{structure}}} and the reader's focus escaped through {{focus}}.
> - backend/app/modules/studio/* — a new module: routes to request a report, list reports, read one, retry a failed one; a BullMQ job (internal/report.job.ts) that writes it; internal/prisma.repository.ts with an idempotency key.
> - backend/app/wiring/studio.ts — buildReportRequest, shared by the worker and backend/evals/cache-check.ts.
> - backend/app/worker.ts — the report queue.
> - frontend/src/modules/studio/* and frontend/src/components/cited-text.tsx — the panel and the report view.
> - e2e/fixtures/api.ts, e2e/tests/ui/studio.spec.ts.
>
> Check these areas specifically, in this order:
>
> 1. Access control on every new route: is each one scoped to the anonymous session, does a foreign notebook return 404 rather than 403 or data, and is reading a report scoped the same way as writing one? Check the controllers and the service, not just the routes.
> 2. Prompt injection: the report focus and the custom-report description are user-typed. Do they reach only the last user turn, never the system block? Is the raw {{{structure}}} path reachable with anything that is not a repository file? Can a source's text or a file name change the structure?
> 3. What reaches a log, an error response or the artifact row. CLAUDE.md forbids source text, cited text and slices in logs and error bodies; artifact.error must be one sentence from a fixed list, never an upstream message.
> 4. Resource limits and money: can a reader make the server write many reports (the idempotency key, the retry route, the budget check, rate limits)? Is the budget checked before the row is created? Is REPORT_MAX_TOKENS bounded? Can a queued job run twice?
> 5. Citation verification: is every chip in a report verified server-side against the stored text before it is stored, the same way a chat citation is (ADR-0003)?
> 6. Secrets, and anything that would break the module boundary rule (modules never import each other; only AnthropicLlmAdapter calls the API).
>
> Report findings with a severity (critical/high/medium/low), the file and line, what an attacker or a bug would actually do, and the smallest fix. No style preferences. If you find nothing in an area, say so explicitly for that area.

## Ergebnis

## M6 review, Studio reports (af2cc24~1..HEAD)

Ticked-task check first: `pnpm --filter @quellwerk/backend test -- report-prompts` (9 passed), `... -- studio.reports` (14 passed) and `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/studio.spec.ts` (40 passed) all pass here. `pnpm eval --cache-check` needs a live key and cannot be re-run in review; `/Users/7style/Projects/quellwerk/backend/evals/RESULTS.md` records the four numbers, so the tick rests on that record alone.

### 1. Access control on the new routes

No defect found. `list`/`get` go through `notebooks.service.readable`, `request`/`retry` through `writable`, both before any repository call (`/Users/7style/Projects/quellwerk/backend/app/modules/studio/services/studio.service.ts:29,34,60,95`); `NotebookNotFoundError` is 404, not 403 (`/Users/7style/Projects/quellwerk/backend/app/modules/notebooks/internal/errors.ts:10`), and `findById` carries both ids in the WHERE clause (`/Users/7style/Projects/quellwerk/backend/app/modules/studio/internal/prisma.repository.ts:89`), so a report id from a foreign notebook misses rather than resolving. Demo is readable by all and writable by none, which matches SECURITY 7.2.

1. **medium — the read path's scoping is asserted nowhere.** `/Users/7style/Projects/quellwerk/backend/app/modules/studio/_tests_/studio.reports.test.ts:82-93`: the `NotebookAccess` fake returns success from `readable` for every session, and only `writable` is made to throw. So the only tests of `get`/`list` prove nothing about session scoping, and there is no supertest file for studio although sources, chat, notebooks and session all have one (`modules/sources/_tests_/sources.routes.test.ts`, `modules/chat/_tests_/chat.route.test.ts`). Smallest fix: make the fake's `readable` throw for `session-b` as `writable` does, and add two cases (`get`/`list` from a foreign session → `NOTEBOOK_NOT_FOUND`).

### 2. Prompt injection

No defect found. The focus reaches only the rendered tail and therefore only the last user turn (`/Users/7style/Projects/quellwerk/backend/app/wiring/studio.ts:58-78`), escaped by the `{{focus}}` pass; the system block is the frozen `notebook-chat-system` body, unchanged. `{{{structure}}}` is fed `FORMATS[format].prompt`, a template-literal-typed member of a closed record over a zod enum (`internal/formats.ts:17,28-34`, `dto/studio.dto.ts:25`), so no user string can reach `loadPrompt`'s path join and no source text or file name can influence the structure. `language` is the one model-derived value in the tail and passes the `LANGUAGES` allowlist (`worker.ts:142-173,394-401`). Raw substitution happens before the escaped pass, and user values inserted in the escaped pass are never re-scanned (`services/prompt-loader/render.ts:88-120`).

### 3. Logs, error responses, artifact row

2. **medium — the upstream error message still reaches the log file.** `/Users/7style/Projects/quellwerk/backend/app/worker.ts:519-521` passes the caught error to `logger.error`, which writes `error.message` and `error.stack` verbatim (`/Users/7style/Projects/quellwerk/backend/app/common/utils/logger.util.ts:174-181`; `scrubSensitive` only masks known key names). The repo's own test states the risk it is guarding against — `studio.reports.test.ts:295-310` uses `'invalid_request: messages.0.content[3].text "Sie gilt ab"'` as the realistic upstream message — and protects `artifact.error` from it while the same string lands in the log, against SECURITY 7.5 ("Logs ... nie Quelltext"). Same pattern as M2 ingest (`worker.ts:337-339`), so this is a doctrine question, not an M6 regression. Smallest fix: log `{status, type, requestId}` off the SDK error plus `error.name`, and keep the message out.

Everything else here is clean: `reasonFor` is a fixed four-sentence list (`internal/report.job.ts:88-96`), the dropped-citation warning carries only ids, offsets and lengths (`worker.ts:482-489`), `logger.info('[Worker] report', ...)` logs only the fixed `reason`, and the error middleware emits no stack for 4xx and no raw JSON to the client.

### 4. Resource limits and money

3. **high — "Try again" re-queues nothing; the row goes back to `queued` and stays there.** `/Users/7style/Projects/quellwerk/backend/app/modules/studio/services/studio.service.ts:112-113` calls `requeue` then `enqueueReport`, and the job id is deterministic per artifact (`/Users/7style/Projects/quellwerk/backend/app/modules/index.ts:165-170`, `dedupeKey(notebookId,'report',artifactId)`). A terminally failed report does **not** fail its BullMQ job — `runReportJob` catches and returns — so the job sits in the completed set, which `removeOnComplete: {count: 50}` keeps (`services/queue/index.ts:74`), and `addStandardJob` returns early on `EXISTS jobIdKey` (`bullmq@6.3.4/dist/cjs/scripts/addStandardJob-9.js:491`, `handleDuplicatedJob`). Result: the route answers 200 with `status: 'queued'`, the panel shows "Waiting for the writer" and the sliding bar, and the poll never stops because nothing will ever run the job (until 50 further report jobs evict the old id). Nothing tests this: the in-memory `enqueueReport` in `studio.reports.test.ts:111` has no id semantics and only counts calls, and the e2e never clicks `retry-r-failed` (the POST is not even stubbed in `e2e/fixtures/api.ts`). Smallest fix: in the retry path remove the old job first (`await queue.remove(jobId)`) or add an attempt suffix to the job id.

4. **high — reports run on the sources limiter, so the documented artifact ceiling is not enforced.** `/Users/7style/Projects/quellwerk/backend/app/modules/index.ts:173` wires `createRateLimiter('sources', config.rateLimit.sources)`. `config.rateLimit.artifacts` exists with `RATE_LIMIT_ARTIFACTS_PER_SESSION` default 10 (`config/rate-limit.config.ts:94-101`, `config/env.config.ts:98`) and is now dead config. Two consequences: the ceiling for the most expensive call in the product is 20/hour instead of SECURITY 7.3's 10, and reports and uploads share the `rl:sources:` bucket against SECURITY 7.3's "je Limiter ein eigener Prefix" — 20 uploads block every report for the rest of the hour, which is a plausible way to lose the demo. Smallest fix: `createRateLimiter('artifacts', config.rateLimit.artifacts)`.

5. **medium — the daily budget is checked once per request and never by the job.** `assertBudgetLeft` sums `usage_log` (`services/quota/index.ts:66-80`) and runs before the row is created (correct, `studio.service.ts:71`), but spend is only recorded after a call completes (`worker.ts:462-471`) and `runReportJob` never re-checks. Twenty report requests inside a second all pass the same pre-spend check and then run serially, each a full-notebook call with `REPORT_MAX_TOKENS = [geschwärzt] output, with no cap consulted again. Smallest fix: add `assertBudget()` to `ReportDeps`, call it in `runReportJob` right before `deps.write`, and fail the row with the existing budget sentence.

6. **medium — a report that dies mid-call stays `running` for ever, and the panel animates for ever.** `heartbeatAt` is written once, in `start` (`worker.ts:444-449`); nothing refreshes it during the model call, and the stall sweeper is M7-T5. The frontend keys the animation and the 2-second poll purely on `queued|running` (`frontend/src/modules/studio/types/report.ts:46-48`, `frontend/src/app/n/[id]/NotebookWorkspace.tsx:104-112`), with no age cut-off, so a killed worker or a `fail()` that itself throws leaves an infinite shimmer with no way back (the format button is disabled because the row exists, and retry only accepts `failed`). Smallest fix for M6: let the panel show "This is taking longer than expected" plus the retry button once `createdAt` is older than a few minutes, so the reader is never stuck.

7. **low — `reportKey` is a 32-bit FNV hash of the focus** (`internal/formats.ts:48-61`). A collision hands back somebody else's report of the same notebook under a different description. Same-notebook only and improbable, but the fix is free: use the normalised focus itself (or a truncated SHA-256) in the key.

8. **low — `listByNotebook` does not filter `type`** (`internal/prisma.repository.ts:77-84`), while `createOrGet` writes `type: 'report'`. When audio artifacts land in the same table (M10) they will appear as reports, defaulting to `format: 'briefing'` via `toReportResponse` (`dto/studio.dto.ts:47`), which would disable the Briefing Doc button. Add `type: 'report'` to the `where`.

Positive: idempotency rests on the real unique index `@@unique([notebookId, idempotencyKey])` (`backend/prisma/schema.prisma:130`) and is created-then-caught rather than read-then-written, the enqueue happens only for `created`, and the job's `status === 'ready'` guard covers a re-delivery after a crash.

### 5. Citation verification

Clean in substance: the report runs `resolveAnswer` from the chat module, i.e. the same `source.text.slice(start, end) === citation.cited_text` check, and stores `slice` rather than `cited_text` (`modules/chat/internal/citations.ts:150-175`, `worker.ts:476-480`); nothing is written before that (`report.job.ts:129-131`), and the renderer is the same component as the chat's (`frontend/src/components/cited-text.tsx`). One bug in that neighbourhood:

9. **medium — every report citation loses its page.** `/Users/7style/Projects/quellwerk/backend/app/worker.ts:474` creates `const pagesById = new Map<string, PageSpan[]>()` and never fills it (`readySources` at `worker.ts:424-442` selects `pages` but keeps only `pages.length` as `pageCount`), so the resolver at `worker.ts:479` always returns `null` and every chip in a report renders "characters 1,234-1,300" where a chat chip renders "page 12, characters …" (`frontend/src/components/citation-chip.tsx:29-32`). The chat wiring does it right (`wiring/chat.ts:119-126`). The variable is also dead as written. Smallest fix: return `pages` from `readySources` (or keep the raw rows) and build the map from them.

10. **low — `droppedCitations` is computed and thrown away.** `report.job.ts:61,133` and `worker.ts:494` produce the count, `finish` (`worker.ts:498-509`) does not persist it, and the DTO does not expose it — unlike a chat message, which carries `droppedCitations` (see `e2e/fixtures/api.ts:171`). The Trace requirement in docs/SPEC.md is written for the chat, so this is not a broken MUST, but the number a reviewer would ask for on a report does not exist after the log line scrolls away.

### 6. Secrets and module boundaries

No defect found. No file under `modules/studio/` imports another module: `NotebookAccess` and `ReportCitation` are re-declared locally with the reason stated (`interfaces/studio.repository.ts:1-8`, `internal/report.job.ts:16-32`), the 404/400 errors are built inline in the controller and service, and the cross-module joins live in `modules/index.ts` and `worker.ts`, the two composition roots. `buildReportRequest` sits in `wiring/`, not in a module, and only `AnthropicLlmAdapter` touches the SDK (`worker.ts:62`, `evals/cache-check.ts:64`). No model id or key is hard-coded; `models.chat`/`effortChat` come from config. Cached prefix is clean: frozen system block, document blocks with the single 1h breakpoint, no date, no notebook title, no per-user data, same `EFFORT_CHAT` as the chat, and the focus/language/task all behind the breakpoint in the last user turn.

11. **low — dead export.** `isReportFormat` (`internal/formats.ts:36`, re-exported at `index.ts:40`) has no caller anywhere in backend, frontend or e2e; the zod enum does the same job at the route.

### Frontend, one item

12. **low — a refused custom report loses what the reader typed.** `CustomReportDialog.submit` (`frontend/src/modules/studio/components/CustomReportDialog.tsx:29-41`) clears the textarea and closes the dialog after `await onSubmit(...)`, but `onSubmit` is `StudioPanel.request`, which swallows the rejection (`StudioPanel.tsx:55-65`). So on a 429, 503 or 422 the dialog closes and the description is gone, contradicting the comment two lines below ("Left open on a failure, with the text still in the box"). Smallest fix: have `onRequest` report success/failure back (return a boolean or re-throw from `request`) and close only on success.

### The three I would fix first

1. **Finding 3, the retry that queues nothing** (`modules/index.ts:165-170` + `studio.service.ts:112`). It is the one path in M6 that is broken rather than merely thin, it is on the demo's unhappy path — a 529 from the model is exactly what a live demo hits — and it ends in the failure mode the milestone's own test file says it exists to prevent: a row that spins and never clears. Two tests pass while asserting the wrong thing, so nothing will catch it before a reviewer does.
2. **Finding 4, the wrong rate limiter** (`modules/index.ts:173`). One line, and it restores the documented money ceiling while un-coupling reports from uploads; leaving it means SECURITY 7.3 describes a control that is not wired and the artifact limiter stays dead config that nobody will notice again.
3. **Finding 9, the empty page map** (`worker.ts:474`). A citation chip is the product's whole claim, and in a report it currently carries strictly less provenance than the same chip in the chat — the file even documents the correct version three files away. It is a two-line fix and it removes a variable that looks like it works.

