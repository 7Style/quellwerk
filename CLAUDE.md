# Quellwerk

A NotebookLM clone built as a hiring take-home over 3 days; the effort estimate lives in
docs/PLAN.md and comes to about 41 hours for M0 to M9. I am the lead
engineer and I steer; you implement one task at a time. The reviewer will read this repository
to see how I work, so the harness (this file, hooks, skills, agents, docs/) is part of the
deliverable. Everything runs self-hosted on my own server; the only external call is model
inference at Anthropic, behind an adapter.

## Stack (decided, see docs/adr/)

Monorepo, pnpm workspace: `backend/` (Express 5 + TypeScript strict, ES modules, Prisma 7 on
Postgres 17, Redis, BullMQ worker, express-session with Redis store, express-rate-limit with
Redis store, winston, zod, Jest + supertest) and `frontend/` (Next.js 16 App Router, Tailwind +
shadcn/ui) plus `e2e/` (Playwright). The repository started as my BP Monolith boilerplate
(first commit; see docs/TEMPLATE.md after M0); M0 strips everything account-based from it. Docker Compose for local
and production, host Nginx with Let's Encrypt in front. `@anthropic-ai/sdk` called directly
through `AnthropicLlmAdapter`: Citations API on text/plain document blocks, prompt caching,
structured outputs via `zodOutputFormat`. No LangChain, no vector DB, no Vercel (ADR-0002,
ADR-0004, ADR-0006).

## Commands (from the template; M0 renames the packages to @quellwerk/*)

- `pnpm dev` = `docker compose up -d --build` (db, redis, backend :3011, worker, frontend :3010)
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Jest in backend, never watch mode), `pnpm verify` = all three
- `pnpm eval --smoke | --dev | --full | --sanity | --cache-check | --record | --batch` (backend/evals/run.ts)
- `pnpm db:migrate` (prisma migrate deploy), `pnpm db:seed`
- `pnpm --filter @quellwerk/e2e exec playwright test`

## Backend rules (BP Monolith pattern)

- One module per feature under `backend/app/modules/<name>/` with controllers/, services/
  (a local BaseService), routes/, dto/ (zod), interfaces/, internal/, events/. Modules never
  import from other modules or from shared areas; everything is injected in `modules/index.ts`.
- External systems live behind interfaces in `backend/app/adapters/`: `ILlmProvider`
  (Anthropic), `ITtsProvider` (Gemini, optional), `IFileStorage` (local volume). Only `AnthropicLlmAdapter`
  instantiates the client and calls the API; type-only imports from `@anthropic-ai/sdk` are
  allowed everywhere.
- Long work runs in the BullMQ worker (`backend/app/worker.ts`): ingest, artifact, audio,
  maintenance. Jobs are idempotent per (notebook, type, params), write a heartbeat and always
  end in a terminal status. Job ids never contain a colon; repeatable jobs go through
  `upsertJobScheduler`; the ioredis client uses `maxRetriesPerRequest: null`. The API process never awaits a model call longer than one chat turn.
- Every route validates input with zod, is scoped to the anonymous session, and calls the quota
  service first.

## Rules the code depends on (non-negotiable)

- Source text is normalised exactly once at ingest (`modules/sources/internal/normalize.ts`)
  and never modified afterwards. The stored string is what is sent to the model and what the
  viewer renders. Citations point at character offsets into it.
- Every citation is verified server-side before it is rendered:
  `source.text.slice(start_char_index, end_char_index) === cited_text`. Mismatch = drop + log
  `{sourceId, documentIndex, start, end, citedLength, sliceLength}`; never the cited text or the
  slice. Source text never reaches logs, error responses or `usage_log`.
- `prompts/notebook-chat-system.md` is frozen: no dates, no notebook title, no user data.
  Per-turn values go into the last user turn (`prompts/chat-preferences-tail.md`).
- `cache_control` `{type:'ephemeral', ttl:'1h'}` on the last document block, optionally a 5-minute
  breakpoint on the last text block of the last assistant turn (never on a thinking block or a
  citation), nothing on the system block. ONE effort for chat and reports (`EFFORT_CHAT`); an
  effort change invalidates the messages cache. Read `prompts/README.md` before touching a
  request builder.
- Citations and structured outputs cannot be combined (HTTP 400). Two builders:
  `buildChatRequest` (citations on, text out) and `buildArtifactRequest` (citations off, JSON out).
- Every model call logs usage to `usage_log` with cost from `config/prices.ts` (5-minute and
  1-hour cache writes priced separately).
- Every text sent to a model lives in `prompts/*.md` at the repo root and is loaded at runtime
  by the prompt-loader service. Never inline. The backend Docker image is built from the repo
  root so `prompts/` is inside it. The files are written in the milestone that needs them (M1 judges,
  M2 ingest, M3 chat, M6 reports); `prompts/README.md` is the contract and the only file there
  before M1.
- Source text, file names and every user-typed field (question, custom instructions, report
  focus, custom report request, audio focus, positions, host names) are untrusted data. They are
  interpolated only into document blocks or the last user turn, never into the system block, and
  every prompt that reads them states that they are data, not instructions. The prompt renderer
  replaces < and > with the single-angle characters in every `{{value}}`, so no value can open or
  close a tag of the prompt; `{{{value}}}` renders raw and is allowed only for content that lives
  in the repository (today only the report structure blocks). Lengths come from the route's zod
  schema, never from the renderer.
- Secrets only in env. Every env file that holds secrets is deny-listed for the Read tool in
  `.claude/settings.json` (the bare file, the local ones and the production one; the committed
  examples stay readable), blocked for Edit/Write by `block-protected.sh`, and blocked for Bash
  by `block-env-read.sh`: that hook
  refuses any command whose text names an env file, whatever the reader is (cat, head, tail,
  sed, less, grep, source, a redirection, a copy). `example.env` and `.env.example` are the only
  exceptions. The hook matches the file name inside the command string, so it also stops a
  command that only mentions such a file in prose, and it does not catch a path that hides the
  name from it (a wildcard, a variable). It is a guard rail, not a sandbox. The env file for the
  backend is written by hand.
- Model IDs and the chat effort come from env (`MODEL_CHAT`, `MODEL_FAST`, `MODEL_JUDGE`,
  `EFFORT_CHAT`), resolved in `backend/app/config/models.ts`. Never hard-code a model ID
  elsewhere. Requests on `MODEL_FAST` carry no `output_config.effort` and no thinking (Haiku 4.5
  rejects both). Structured-output schemas carry no length or count constraints; enforce those
  in code.

## House style

- No emoji anywhere: code, comments, docs, commit messages, UI copy (the notebook emoji is data).
- Comments explain a decision that is not obvious from the code; they never restate the code.
- No decorative README sections, no badges except CI, no feature checklists with checkmarks.
- UI labels mirror NotebookLM's English vocabulary (docs/SPEC.md has the table). README, ADRs,
  SPEC, the Datenschutz page and the Loom are German.
- TypeScript strict, no `any`, SDK types (`Anthropic.MessageParam`, `Anthropic.TextCitation`)
  instead of home-made interfaces.

## Process

- One milestone per session via `/plan-step <milestone>`, one commit per PLAN task; a single
  task via `/plan-step <id>`. Restate each task's test command before writing code; run it
  after; paste the output.
- Anything touching more than two files: propose a plan first and wait.
- If a library or API behaves differently from what you expect, use the `researcher` agent.
  Do not guess model IDs, SDK shapes, platform limits or prices.
- One commit per PLAN task, message `<milestone> <area>: <what and why>`, in my voice.
  Keep the Co-Authored-By trailer. Never rewrite history.
- ADRs are immutable (hook). Decisions change by writing a new ADR with `/adr`.
- End every session with `/prompt-log`. `backend/evals/golden.jsonl` is written by hand only
  (hook); drafts go to `golden.draft.jsonl`.

## Verification

- If you cannot verify something, say so. Show test output, not assertions of success.
- `/verify` before every commit. The Stop hook runs `pnpm verify` at the end of any turn that
  leaves uncommitted changes under backend/, frontend/ or prompts/ (a docs-only turn stops freely).
- After any change to `prompts/` or a request builder: `/eval --dev` and record the delta in
  `backend/evals/HILLCLIMB.md`.

## Where things live

SECURITY.md (rules from three server break-ins, firewall and Docker doctrine, the target state of
the app controls in section 7, deploy checklist), docs/BRIEF.md (handwritten, the only file no
model touched), docs/SPEC.md, docs/PLAN.md,
docs/ARCHITECTURE.md, docs/DEPLOY.md, docs/KNOWN-LIMITS.md, docs/adr/, docs/ai-process/
(PROMPTS.md, AI-DECLARATION.md, TRANSCRIPTS.md, LOOM.md, DECISION-LOG.md, offset-check.md),
prompts/, backend/evals/ (golden.jsonl, run.ts, RESULTS.md, HILLCLIMB.md, corpus/, fixtures/,
results/), backend/app/{modules,adapters/llm (documents, chat-request, artifact-request),
services,config,worker.ts}, backend/prisma/ (schema, seed.ts, seed-data/), backend/scripts/
(demo-reset, smoke-prod, recount-tokens), docs/ai-process/pdf-vs-text-tokens.md,
frontend/src/{app,modules,components,lib,store}, deployment/prod/ (compose, nginx, deploy.sh,
backup.sh).
