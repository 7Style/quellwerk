# Execution plan

One task at a time via `/plan-step <id>` (a whole milestone via `/plan-step M3`).
Each task states the command that proves it. A task is done when that command
passes and the box is ticked; one commit per task, message
`<milestone> <area>: <what and why>`.

Package names change in M0-T1. Every test command before that task uses
`bp-monolith-*`, every command after it uses `@quellwerk/*`.

## Ids that no longer exist

Four tasks were merged into the task they share files with, and two were dropped.
Their ids are gone; a session prompt that names one of them will find nothing:

| Gone | Where the work lives now |
|---|---|
| M2-T3 | merged into M2-T2 (the ingest worker writes usage_log in the same pass) |
| M3-T4 | merged into M3-T5 (the first eval run is the first hillclimb row) |
| M4-T5 | merged into M4-T4 (the smoke spec is written with the chat spec) |
| M6-T3 | merged into M6-T1 (the cache assertion belongs to the job that reads it) |
| M7-T6 | dropped: admin stats |
| M9-T0 | dropped: batch mode |

**M8-T2 and M8-T3 are pulled forward** and run directly after M0, before M1. A
deploy first attempted on the last evening is the largest risk in this plan; one
that has been running since day one is none. Their ids stay M8-T2 and M8-T3.

## Gates and tags

- **Day 1 gate (M0, deploy, M1, M2)**: the empty shell is live on the server, a
  source can be added and is readable, ingestion runs as jobs, the eval harness is
  green against a stub. Tag `m1-evals`.
- **Day 2 gate (M3 to M6)**: chat answers with verified citations, reports are
  written as jobs, the numbers from `/eval` are recorded. Tags `m3-chat`, `m6-reports`.
- **Day 3 gate (M7 to M9, optional M10 and M11)**: hardening, privacy page, seed
  and cold start, final eval and documentation. Tag `m8-live`.

From M3 on, every milestone ends with `run /eval and record numbers` before the tag.
After every milestone the current state is deployed again, so the live site never
drifts more than one milestone from the branch.

If M6 slips, the optional features fall in this order: **Mind Map (M11) first,
Audio Overview (M10) second.** The mind map is the smaller loss because the
report formats already show structured output over the same documents; the audio
overview is the only artefact a reviewer can experience without reading. The
numbering follows that order: M11 is only started when M10 is finished.

---

## M0 Documents, trim the template, raise the Quellwerk skeleton

### M0-T0 SPEC, architecture and the ADRs
Goal: The documents that every later task reads exist: scope with its numbers, the data model, and the eight decisions that are already assumed elsewhere.
Files: docs/SPEC.md, docs/ARCHITECTURE.md, docs/adr/0001-citations-api.md, docs/adr/0002-whole-notebook-in-context.md, docs/adr/0003-normalise-once-character-offsets.md, docs/adr/0004-sdk-direkt-statt-langchain.md, docs/adr/0005-anonyme-session.md, docs/adr/0006-self-hosted.md, docs/adr/0007-ein-effort-zwei-builder.md, docs/adr/0008-evals-vor-dem-chat-code.md
Test: `rg -c '^## ' docs/SPEC.md docs/ARCHITECTURE.md && ls docs/adr/*.md | wc -l && rg -n 'model (Notebook|Source|Message|Note|Artifact|Job|UsageLog)' docs/ARCHITECTURE.md | wc -l`
Expected: both documents have their sections, `9` files under docs/adr (eight ADRs plus TEMPLATE.md), and `7` Prisma models found; ARCHITECTURE.md carries two mermaid blocks and every id is `String @id @default(uuid())` so the demo notebook can hold the fixed id `demo`.
Box: 90
Status: [x]

SPEC.md is German and short: goal and audience, scope as MUSS / KANN / bewusst
weggelassen, the numbers (20 MB per file, 50 sources, 150K tokens, 4000
characters per question, 7 days retention), the eval thresholds, and the table of
English UI words. ARCHITECTURE.md is German with two mermaid diagrams (deployment;
one chat turn from the route to the resolved citation) and a data model section
holding the Prisma schema as a code block with notebooks, sources, messages,
notes, artifacts, jobs and usage_log.

### M0-T1 Rename to @quellwerk/*
Goal: Every package, container and filter name says Quellwerk instead of bp-monolith.
Files: package.json, backend/package.json, frontend/package.json, e2e/package.json, pnpm-workspace.yaml, docker-compose.yml, backend/Dockerfile, backend/Dockerfile.dev, frontend/Dockerfile.dev, backend/app/config/redis.config.ts, README.md, backend/README.md, frontend/README.md, .github/workflows/ci.yml
Test: `rg -n 'bp-monolith|bp-backend|bp-frontend|bp-db|bp-redis' --glob '!pnpm-lock.yaml' --glob '!docs/**' | wc -l`
Expected: `0`, and `pnpm install && pnpm typecheck && pnpm test` pass.
Box: 30
Status: [ ]

### M0-T2 Trim the backend
Goal: Everything account-based leaves the backend; what remains starts and is green.
Files: delete backend/app/modules/{auth,users,audit,audit-logs,upload}, backend/app/adapters/{auth-email,user-email}.adapter.ts, backend/app/common/middleware/{auth,authenticate,authorize,permission}.middleware.ts, backend/app/common/utils/{password,random-password}.util.ts, backend/app/services/email; touch backend/app/modules/index.ts, backend/app/app.ts
Test: `pnpm --filter @quellwerk/backend run typecheck && pnpm --filter @quellwerk/backend run lint && pnpm --filter @quellwerk/backend test`
Expected: typecheck clean, lint back to zero errors (the six module-boundary violations in audit-logs and users leave with those modules), Jest green.
Box: 60
Status: [ ]

### M0-T3 Trim the frontend and e2e
Goal: The template pages and their specs are gone; `/` is free for the Quellwerk home.
Files: delete frontend/src/modules/{auth,users}, frontend/src/app/{login,dashboard,users}, e2e/tests/auth, e2e/pages/*.page.ts, e2e/fixtures; touch frontend/src/app/page.tsx, frontend/src/store/store.ts, frontend/src/lib/api.ts
Test: `pnpm --filter @quellwerk/frontend run lint && pnpm --filter @quellwerk/frontend run build && pnpm --filter @quellwerk/e2e run typecheck`
Expected: lint back to zero errors (the four boundary violations leave with the pages), build lists `/` and no `/login`, `/dashboard`, `/users`; e2e typecheck clean.
Box: 45
Status: [ ]

### M0-T4 Quellwerk configuration and skeletons
Goal: Config, adapters, services, session and admin modules and the Prisma schema exist as wired but empty skeletons.
Files: backend/app/config/{env.config.ts,models.ts,prices.ts}, backend/app/adapters/llm/{index.ts,anthropic.adapter.ts}, backend/app/adapters/storage/local-file-storage.ts, backend/app/adapters/tts/tts.interface.ts, backend/app/services/{prompt-loader,usage-log,queue,quota}/*, backend/app/worker.ts, backend/app/modules/{session,admin}/*, backend/app/modules/index.ts, backend/prisma/schema.prisma, backend/prisma/migrations/*_init/
Test: `pnpm --filter @quellwerk/backend run typecheck && pnpm --filter @quellwerk/backend exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code`
Expected: typecheck clean, `The datamodel is in sync with the migrations`, exit code 0. The schema is copied from the data model section of docs/ARCHITECTURE.md, not invented here.
Box: 90
Status: [ ]

### M0-T5 Compose, CI, hooks, docs
Goal: The stack starts with the worker and the prompts inside the image, CI runs the trimmed tree.
Files: docker-compose.yml, backend/Dockerfile, .dockerignore, .github/workflows/ci.yml, .claude/hooks/*, docs/TEMPLATE.md, README.md
Test: `docker compose config --quiet && docker compose up -d --build && docker compose ps --format '{{.Service}} {{.Status}}'`
Expected: five services (db, redis, backend, worker, frontend), all `healthy`; `docker compose exec backend ls ../prompts/README.md` finds the file.
Box: 45
Status: [ ]

### M0-T6 Clean-clone gate
Goal: A fresh clone installs, builds and starts after copying the two configuration files from their examples.
Files: docs/DEPLOY.md, README.md, scripts/security-check.sh
Test: `git clone . /tmp/qw-clean && cd /tmp/qw-clean && cp example.env .env && cp backend/example.env backend/.env && pnpm install --frozen-lockfile && pnpm verify`
Expected: install without missing-peer warnings, `pnpm verify` green; the two copy steps and the values that still have to be filled in by hand are named in README.
Box: 30
Status: [ ]

---

## Deploy first (M8-T2 and M8-T3, pulled forward)

Runs directly after M0 and before M1, on the empty shell. Every later milestone
ends with another deploy, so the pipeline is exercised a dozen times instead of once.

### M8-T2 Production compose, nginx vhost, deploy workflow
Goal: Images are built to GHCR and deployed over SSH from GitHub Actions.
Files: deployment/prod/docker/docker-compose.yml, deployment/prod/nginx/*, deployment/prod/deploy.sh, .github/workflows/deploy.yml
Test: `docker compose -f deployment/prod/docker/docker-compose.yml config --quiet && ! rg -q 'echo .*secrets\.' .github/workflows/deploy.yml`
Expected: exit code 0 — the production compose file validates and no workflow step echoes a secret.
Box: 60
Status: [ ]

### M8-T3 DEPLOY.md and the first deploy
Goal: The empty shell is live on the server behind nginx with a certificate.
Files: docs/DEPLOY.md, deployment/prod/*
Test: `curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://<domain>/api/health`
Expected: `200 0`, and the same request over http redirects to https.
Box: 45
Status: [ ]

---

## M1 Evals before the chat code

The harness exists before the route it grades. Every task here runs against
recorded fixtures and a stub answerer, so it needs no API key.

### M1-T1 Ingestion primitives
Goal: normalize, extract and the page map are pure functions with tests, because every offset later depends on them.
Files: backend/app/modules/sources/internal/{normalize.ts,extract.ts,pages.ts}, backend/app/modules/sources/internal/_tests_/*.test.ts, backend/evals/fixtures/*
Test: `pnpm --filter @quellwerk/backend test -- sources/internal`
Expected: all suites pass, including the case that normalising twice changes nothing and that a page map survives a round trip.
Box: 45
Status: [ ]

### M1-T2 Draft the golden set
Goal: 30 questions exist as a hand-written file, 20 dev and 10 held out, with the item types the brief needs.
Files: backend/evals/golden.jsonl, backend/evals/corpus/*, backend/evals/README.md
Test: `pnpm --filter @quellwerk/backend exec tsx evals/validate-golden.ts`
Expected: `30 items, 20 dev / 10 heldout` with the type counts, and every evidence quote found verbatim in its corpus file.
Box: 60
Status: [ ]

### M1-T3 backend/evals/run.ts with its modes
Goal: The runner reads the golden set, calls an answerer and writes a results file, with the modes the commands promise.
Files: backend/evals/run.ts, backend/evals/{report.ts,judges.ts}, backend/evals/results/.gitkeep, package.json
Test: `pnpm eval --smoke`
Expected: a table with citation validity and abstention accuracy, a new file under backend/evals/results/, exit code 0.
Box: 75
Status: [ ]

### M1-T4 StubAnswerer, smoke subset, CI
Goal: The smoke subset runs in CI without an API key and fails when a citation does not match its source.
Files: backend/evals/answerers/stub.answerer.ts, backend/evals/_tests_/citation-validity.test.ts, .github/workflows/ci.yml
Test: `pnpm --filter @quellwerk/backend test -- evals && pnpm eval --smoke`
Expected: the deliberately broken fixture is reported as an invalid citation and drops the run to a non-zero exit; the correct fixture passes.
Box: 45
Status: [ ]

Milestone end: tag `m1-evals`, then deploy.

---

## M2 Session, ingestion, source guide, overview

### M2-T0 Session module, documents.ts, countChatTokens
Goal: An anonymous session exists, and the document blocks plus their token count are built in one place.
Files: backend/app/modules/session/*, backend/app/adapters/llm/documents.ts, backend/app/adapters/llm/count-tokens.ts, backend/app/app.ts
Test: `pnpm --filter @quellwerk/backend test -- session documents`
Expected: a request without a cookie creates a session, a second request keeps it; documents are emitted in position order with title and context.
Box: 45
Status: [ ]

### M2-T1 Routes for notebooks and sources, capacity gate
Goal: Notebooks and sources can be created through zod-validated routes that refuse to exceed the caps.
Files: backend/app/modules/notebooks/*, backend/app/modules/sources/{controllers,routes,dto,services}/*
Test: `pnpm --filter @quellwerk/backend test -- notebooks sources.routes`
Expected: 201 for a valid source, 413 with a readable message at the 51st source, at 20 MB and at 150K tokens.
Box: 60
Status: [ ]

### M2-T2 Ingest worker, artifact-request.ts and usage_log
Goal: Adding a source runs an idempotent job chain that ends in a terminal status, and every model call it makes is priced into usage_log.
Files: backend/app/worker.ts, backend/app/modules/sources/internal/ingest.job.ts, backend/app/modules/notebooks/internal/overview.job.ts, backend/app/adapters/llm/artifact-request.ts, backend/app/services/usage-log/*, backend/app/config/prices.ts, prompts/{source-guide.md,notebook-title.md,notebook-overview.md}
Test: `pnpm --filter @quellwerk/backend test -- ingest.job overview.job artifact-request usage-log`
Expected: the same job id twice produces one result, every step writes a heartbeat, the overview is debounced to one run for three sources added together; the artifact request carries no citations and no schema constraints, and a call with 5 minute and 1 hour cache writes is priced on separate lines.
Box: 105
Status: [ ]

### M2-T4 Tests for the ingestion path
Goal: The path from upload to ready source is covered end to end against a fake LLM adapter.
Files: backend/app/modules/sources/_tests_/*.test.ts, backend/app/modules/notebooks/_tests_/*.test.ts
Test: `pnpm --filter @quellwerk/backend test`
Expected: all suites pass; a PDF without a text layer ends as `failed` with a reason, never as a hanging job.
Box: 45
Status: [ ]

### M2-T5 Base seed and token measurement
Goal: A demo notebook with the fixed id `demo` exists after seeding, and its real token count is recorded.
Files: backend/prisma/seed.ts, backend/prisma/seed-data/*, backend/scripts/recount-tokens.ts, docs/ai-process/pdf-vs-text-tokens.md
Test: `pnpm db:seed && pnpm --filter @quellwerk/backend exec tsx scripts/recount-tokens.ts demo`
Expected: the notebook has four ready sources and prints a token total under 150000, written into the document.
Box: 30
Status: [ ]

Milestone end: deploy.

---

## M3 Chat with citations

### M3-T0 Chat prompts
Goal: The frozen system prompt and the per-turn tail exist and follow the contract in prompts/README.md.
Files: prompts/notebook-chat-system.md, prompts/chat-preferences-tail.md, prompts/follow-up-questions.md
Test: `pnpm --filter @quellwerk/backend test -- prompt-loader`
Expected: the loader renders every placeholder, throws on a missing value, escapes angle brackets, and the system prompt contains no `{{`.
Box: 30
Status: [ ]

### M3-T1 chat-request.ts
Goal: One builder produces the chat request with citations on and the cache breakpoints in the documented places.
Files: backend/app/adapters/llm/chat-request.ts, backend/app/adapters/llm/_tests_/chat-request.test.ts
Test: `pnpm --filter @quellwerk/backend test -- chat-request`
Expected: one 1h breakpoint on the last document block, nothing on the system block, no breakpoint on a thinking block or a citation.
Box: 45
Status: [ ]

### M3-T2 citations.ts and offset check
Goal: Every citation is verified against the stored text before it is rendered, and the check is proven against a real API response.
Files: backend/app/modules/chat/internal/citations.ts, backend/app/modules/chat/internal/_tests_/citations.test.ts, backend/scripts/offset-probe.ts, docs/ai-process/offset-check.md
Test: `pnpm --filter @quellwerk/backend test -- citations && pnpm --filter @quellwerk/backend exec tsx scripts/offset-probe.ts`
Expected: a mismatch is dropped and logged with ids and lengths only; the probe reports `N of N citations matched` against the live API and the result is written into offset-check.md.
Box: 75
Status: [ ]

### M3-T3 stream.ts, the SSE route and the error cases
Goal: The answer streams over SSE and every failure ends the stream with a readable event.
Files: backend/app/modules/chat/{controllers,routes,services}/*, backend/app/modules/chat/internal/stream.ts
Test: `pnpm --filter @quellwerk/backend test -- chat.route stream`
Expected: events arrive in order, an aborted request stops the upstream call, an upstream error emits one `error` event and closes; compression leaves `text/event-stream` alone.
Box: 75
Status: [ ]

### M3-T5 LiveAnswerer, first eval run and hillclimb
Goal: The runner grades the real route, and the first numbers and the changes that improved them are recorded.
Files: backend/evals/answerers/live.answerer.ts, backend/evals/RESULTS.md, backend/evals/HILLCLIMB.md, prompts/notebook-chat-system.md
Test: `pnpm eval --dev`
Expected: citation validity, abstention accuracy, correctness and faithfulness on the dev split; one row per revision in HILLCLIMB.md with before and after; the held-out split is untouched.
Box: 90
Status: [ ]

Milestone end: run `/eval` and record numbers, tag `m3-chat`, then deploy.

---

## M4 UI

M4-T1 to M4-T4 are **parallelisable**: they run on fixtures under
`frontend/src/modules/<domain>/fixtures/` and may be built before M2 exists.
M4-T6 is the only task here that needs the backend.

### M4-T0 Tokens, theme, shadcn primitives
Goal: The prototype's tokens, the theme switch and the shadcn primitives are in the frontend.
Files: frontend/src/styles/global.css, frontend/src/modules/shell/hooks/useTheme.ts, frontend/src/components/ui/*
Test: `pnpm --filter @quellwerk/frontend run build`
Expected: build green; `--paper` resolves to `#f6f7f5` light and `#14171a` under `data-theme="dark"`; no utility carries the provenance accent.
Box: 60
Status: [x]

### M4-T1 Home and shell (parallelisable)
Goal: `/` shows the notebook grid and `/n/[id]` the three panel layout with the 48px rail.
Files: frontend/src/modules/notebooks/{pages,components,fixtures,types}/*, frontend/src/modules/shell/components/*, frontend/src/app/page.tsx, frontend/src/app/n/[id]/page.tsx
Test: `pnpm --filter @quellwerk/frontend run build && pnpm --filter @quellwerk/e2e exec playwright test tests/ui/shell.spec.ts`
Expected: both routes render, each column scrolls on its own, the page itself never scrolls, both panels collapse to the rail.
Box: 60
Status: [ ]

### M4-T2 Sources panel (parallelisable)
Goal: The source list with status, selection and the Add sources dialog matches the prototype.
Files: frontend/src/modules/sources/{components,fixtures,types}/*
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/sources.spec.ts`
Expected: four fixture sources with their status dots, select all toggles all, the dialog opens on Add source and closes on Escape.
Box: 45
Status: [ ]

### M4-T3 Source viewer and highlight (parallelisable)
Goal: Clicking a citation chip opens the source and marks the exact character range.
Files: frontend/src/modules/sources/components/{SourceViewer,SourcePassage}.tsx, frontend/src/modules/sources/hooks/useSourceViewer.ts
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/viewer.spec.ts`
Expected: the marked text equals the fixture's `cited` string, the passage is scrolled into view, a second click on another chip moves the mark.
Box: 60
Status: [ ]

### M4-T4 Chat rendering, chips and the smoke spec (parallelisable)
Goal: Answers render with citation chips and hover cards, a refusal renders without any chip, and one spec walks the demo path.
Files: frontend/src/modules/chat/{components,fixtures,types}/*, e2e/tests/ui/smoke.spec.ts, e2e/pages/notebook.page.ts, e2e/playwright.config.ts
Test: `pnpm --filter @quellwerk/e2e exec playwright test`
Expected: five chips on the answer fixture, hovering shows the passage with source title and offsets, the refusal fixture has zero chips and no accent colour; the whole run is green at 1440 and 1280, light and dark.
Box: 90
Status: [ ]

### M4-T6 Wire the UI to the backend
Goal: The fixtures are replaced by RTK Query endpoints and an SSE client.
Files: frontend/src/lib/api.ts, frontend/src/modules/*/services/*.api.ts, frontend/src/modules/chat/hooks/useChatStream.ts
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/e2e/notebook.spec.ts`
Expected: against the running stack a question produces a streamed answer whose chips open the real source.
Box: 60
Status: [ ]

Milestone end: deploy.

---

## M5 Overview header, configure chat, notes, trace

### M5-T1 Overview header
Goal: The notebook header shows title, emoji, summary and the four suggested questions.
Files: frontend/src/modules/notebooks/components/OverviewHeader.tsx, backend/app/modules/notebooks/dto/*
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/overview.spec.ts`
Expected: exactly four questions, each one fills the composer on click.
Box: 45
Status: [ ]

### M5-T2 Configure chat
Goal: Style and length reach the model in the last user turn, never in the system block.
Files: frontend/src/modules/chat/components/ConfigureChatDialog.tsx, backend/app/modules/chat/dto/chat.dto.ts, prompts/chat-preferences-tail.md
Test: `pnpm --filter @quellwerk/backend test -- chat-request.preferences`
Expected: the built request carries the preferences block in the last user message and a byte-identical system block.
Box: 45
Status: [ ]

### M5-T3 Source selection
Goal: Deselecting a source removes it from the request and the answer says so when it would have been needed.
Files: frontend/src/modules/sources/hooks/useSourceSelection.ts, backend/app/modules/chat/services/*
Test: `pnpm --filter @quellwerk/backend test -- selected-sources`
Expected: only selected sources are emitted as document blocks, and the document index mapping still resolves.
Box: 30
Status: [ ]

### M5-T4 Notes
Goal: Add note, Save to note and Convert to source work against the session's notebook.
Files: backend/app/modules/notes/*, frontend/src/modules/studio/components/Notes*.tsx
Test: `pnpm --filter @quellwerk/backend test -- notes`
Expected: a converted note appears as a ready source without going through the extractor.
Box: 45
Status: [ ]

### M5-T5 Trace toggle and delete chat history
Goal: The trace shows model, tokens, cache read and write, latency and cents; the history can be deleted.
Files: frontend/src/modules/chat/components/TracePanel.tsx, backend/app/modules/chat/routes/*
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/trace.spec.ts`
Expected: the second turn shows a cache read above zero; deleting the history empties the thread and the next answer starts a new one.
Box: 45
Status: [ ]

Milestone end: deploy.

---

## M6 Studio reports

### M6-T0 Report prompts
Goal: The common task block and the five structure blocks exist and follow the contract.
Files: prompts/report-common.md, prompts/report-{briefing,study-guide,faq,timeline,custom}.md
Test: `pnpm --filter @quellwerk/backend test -- report-prompts`
Expected: the structure block renders raw through `{{{structure}}}`, the focus value renders escaped, no schema constraint appears in any file.
Box: 30
Status: [ ]

### M6-T1 Artifact queue, reports job and the cache assertion
Goal: A report is written by a job that always ends in a terminal status, stores its chips, and demonstrably reads the cache.
Files: backend/app/modules/studio/*, backend/app/worker.ts, backend/evals/run.ts, backend/evals/RESULTS.md
Test: `pnpm --filter @quellwerk/backend test -- studio.reports && pnpm eval --cache-check`
Expected: the same request twice produces one report, a failing model call ends as `failed` with a reason and nothing half-written; `cache_read_input_tokens > 0` on the second turn, after a Configure chat change and on a report request.
Box: 75
Status: [ ]

### M6-T2 Studio panel
Goal: The panel lists the formats, shows progress and opens a finished report with its chips and "View prompt used".
Files: frontend/src/modules/studio/{components,pages}/*
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/studio.spec.ts`
Expected: a generating report shows its step, a finished report renders chips that open the source, the prompt dialog shows the rendered file.
Box: 60
Status: [ ]

Milestone end: run `/eval` and record numbers, tag `m6-reports`, then deploy.

---

## M7 Hardening and privacy

### M7-T1 Harden the session, CSRF, copy-on-first-write
Goal: Foreign notebooks are invisible, cross-site writes are refused, the demo notebook is never written.
Files: backend/app/modules/session/internal/*, backend/app/common/middleware/csrf.middleware.ts, backend/app/modules/notebooks/internal/copy-on-write.ts
Test: `pnpm --filter @quellwerk/backend test -- session.hardening csrf copy-on-write`
Expected: a foreign notebook returns 404 and not 403, a cross-site Origin returns 403, the first write to `demo` creates a copy and leaves the original untouched.
Box: 45
Status: [ ]

### M7-T2 Quota
Goal: Rate limits and the daily budget hold, and the UI can show why.
Files: backend/app/services/quota/*, backend/app/config/rate-limit.config.ts
Test: `pnpm --filter @quellwerk/backend test -- quota rate-limit`
Expected: the 31st chat request in an hour returns 429 with a readable message; above the cap every model route returns 503 with the banner text.
Box: 45
Status: [ ]

### M7-T3 Input hardening and security headers
Goal: Uploads, URLs and headers match section 7 of SECURITY.md.
Files: backend/app/modules/sources/internal/{mime.ts,ssrf.ts}, backend/app/app.ts, frontend/next.config.ts
Test: `pnpm --filter @quellwerk/backend test -- mime ssrf headers`
Expected: a renamed executable is refused on content, 169.254.169.254 is refused before and after a redirect, the CSP and `X-Robots-Tag: noindex` are present.
Box: 45
Status: [ ]

### M7-T4 Empty and error states
Goal: Every view handles loading, error, empty and success; no spinner runs forever.
Files: frontend/src/modules/*/components/*, frontend/src/app/dev/states/page.tsx
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/states.spec.ts`
Expected: every state from design/states.html is reachable, and `/dev/states` is 404 in a production build.
Box: 45
Status: [ ]

### M7-T5 Privacy page and cleanup job
Goal: `/datenschutz` exists and notebooks are deleted after seven days.
Files: frontend/src/app/datenschutz/page.tsx, backend/app/modules/notebooks/internal/cleanup.job.ts, frontend/public/robots.txt
Test: `pnpm --filter @quellwerk/backend test -- cleanup`
Expected: a notebook untouched for eight days is deleted with its files; one touched yesterday survives.
Box: 45
Status: [ ]

Milestone end: deploy.

---

## M8 Seed, smoke, cold start

M8-T2 and M8-T3 ran after M0. What remains is the demo content and the
measurement on the live site.

### M8-T1 Seed, demo reset, DEMO_OFFLINE
Goal: The demo notebook is reproducible and the app survives a missing API key.
Files: backend/prisma/seed.ts, backend/scripts/demo-reset.ts, backend/app/config/env.config.ts
Test: `pnpm db:seed && pnpm --filter @quellwerk/backend exec tsx scripts/demo-reset.ts --check`
Expected: the demo notebook is restored to its seeded state; with `DEMO_OFFLINE=true` the chat answers from recorded fixtures instead of failing.
Box: 45
Status: [ ]

### M8-T4 Smoke and cold start measurement
Goal: A smoke script proves the live path and the cold start number is recorded.
Files: backend/scripts/smoke-prod.ts, docs/KNOWN-LIMITS.md
Test: `pnpm --filter @quellwerk/backend exec tsx scripts/smoke-prod.ts https://<domain>`
Expected: source, chat with a verified citation and one report pass; the first answer's latency after an idle hour is written into KNOWN-LIMITS.md.
Box: 30
Status: [ ]

Milestone end: run `/eval` and record numbers, then tag `m8-live`.

---

## M9 Final eval and documentation

### M9-T1 Final evals
Goal: The held-out split is run once, and both model rows are in RESULTS.md.
Files: backend/evals/RESULTS.md, backend/evals/HILLCLIMB.md
Test: `pnpm eval --full`
Expected: the table shows the previous run beside this one; the held-out numbers appear for the first time; the self-judged row is marked.
Box: 45
Status: [ ]

### M9-T2 README, AI declaration, transcripts
Goal: The documents a reviewer reads first are complete and honest.
Files: README.md, docs/ai-process/{AI-DECLARATION.md,TRANSCRIPTS.md,DECISION-LOG.md}, docs/KNOWN-LIMITS.md
Test: `rg -n 'TODO|TBD|FIXME' README.md docs/ | wc -l`
Expected: `0`, and the cost table in README matches the numbers in RESULTS.md.
Box: 60
Status: [ ]

---

## M10 Audio Overview (optional, only if the live site is stable)

### M10-T1 Script and TTS
Goal: A dialogue script is generated and spoken through the TTS adapter.
Files: prompts/audio-overview-script.md, backend/app/adapters/tts/gemini.adapter.ts, backend/app/modules/studio/internal/audio.job.ts
Test: `pnpm --filter @quellwerk/backend test -- audio.job`
Expected: speakers alternate, every turn is at most 280 characters, the job ends terminal even when TTS fails.
Box: 60
Status: [ ]

### M10-T2 Player
Goal: The finished audio plays in the studio panel.
Files: frontend/src/modules/studio/components/AudioPlayer.tsx
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/audio.spec.ts`
Expected: the player appears when the job is done and shows the title and summary.
Box: 45
Status: [ ]

### M10-T3 Measurement
Goal: Cost and latency of an audio overview are recorded.
Files: backend/evals/RESULTS.md
Test: `pnpm eval --sanity`
Expected: one line with tokens, cents and latency for the audio route.
Box: 30
Status: [ ]

---

## M11 Mind map (optional, only if M10 is finished)

### M11-T1 Mind map prompt and job
Goal: A flat node list is generated and validated.
Files: prompts/mind-map.md, backend/app/modules/studio/internal/mind-map.job.ts
Test: `pnpm --filter @quellwerk/backend test -- mind-map`
Expected: parent ids resolve, depth is at most four, labels are unique, an invalid map is retried once and then fails cleanly.
Box: 45
Status: [ ]

### M11-T2 Mind map rendering
Goal: The map is drawn and a node opens the notebook with that question.
Files: frontend/src/modules/studio/components/MindMap*.tsx
Test: `pnpm --filter @quellwerk/e2e exec playwright test tests/ui/mindmap.spec.ts`
Expected: the root and its branches render, a node click fills the composer.
Box: 45
Status: [ ]

---

## M12 Loom preparation

### M12-T1 Script and dry run
Goal: The demo path is scripted so the recording needs no second take.
Files: docs/ai-process/LOOM.md
Test: `pnpm --filter @quellwerk/backend exec tsx scripts/smoke-prod.ts https://<domain>`
Expected: the scripted path runs green in one pass; the script names the three moments that show the citation check.
Box: 45
Status: [ ]

---

## Budget

| Milestone | Tasks | Minutes |
|---|---|---|
| M0 | 7 | 390 |
| Deploy first (M8-T2, M8-T3) | 2 | 105 |
| M1 | 4 | 225 |
| M2 | 5 | 285 |
| M3 | 5 | 315 |
| M4 | 6 (1 done) | 375 |
| M5 | 5 | 210 |
| M6 | 3 | 165 |
| M7 | 5 | 225 |
| M8 (rest) | 2 | 75 |
| M9 | 2 | 105 |
| **M0 to M9** | **46** | **2475 (41.3 h)** |
| M10 | 3 | 135 |
| M11 | 2 | 90 |
| M12 | 1 | 45 |

The merges and the two dropped tasks save 165 minutes; M0-T0 adds 90, so the net
change against the first version is minus 15 minutes. The 24 hour cap still is
not met and cannot be met with this scope: the honest number is 41 hours. Nothing
was padded or shaved to make it look otherwise. The order is what protects the
outcome now, not the total: the site is live after M0, and every milestone
deploys again, so the last evening holds no first attempt at anything.
