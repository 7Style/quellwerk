# Verify Anthropic pricing

Subagent-Lauf `researcher`, 7 Werkzeugaufrufe.
Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist
Werkzeugausgabe (siehe [README.md](../README.md)).

## Auftrag

> Verify the current official Anthropic API pricing and caching multipliers, for an ADR in a German repository. I need exact numbers with the source URL and the date the page shows.
>
> Answer these precisely:
>
> 1. Current list price per million tokens (input and output) for the models with these ids: claude-opus-5, claude-sonnet-5, claude-haiku-4-5. If an id does not exist under that exact name, say so and give the correct current id.
>
> 2. Prompt caching pricing: what multiplier of the base input price is charged for a cache WRITE with the default 5-minute TTL, and for a cache WRITE with the 1-hour TTL? What multiplier (or fraction) is charged for a cache READ (cache hit)? I have been told 1.25x for the 5-minute write, 2x for the 1-hour write; confirm or correct with the official page.
>
> 3. Is there any minimum token count for a prompt-cache breakpoint to be effective, and does it differ per model?
>
> 4. For claude-haiku-4-5 specifically: confirm whether it rejects an `output_config.effort` parameter and whether it supports extended thinking. I need to state in the ADR that requests on this model carry no effort and no thinking.
>
> Report in the shape the researcher role requires: Finding / Evidence (exact quoted sentence) / URL / version or date shown / what this means for our code. If something cannot be verified against an official page, say "not verified" rather than guessing. Do not edit any files.

## Ergebnis

Correcting the assumption up front: Haiku 4.5 rejects `output_config.effort` (confirmed), but it does **not** reject thinking outright — it supports extended (manual) thinking, off by default, and rejects only `adaptive`. So "no effort and no thinking" is accurate for your request shape only because thinking defaults to off when the `thinking` param is omitted, not because the model rejects thinking as a whole.

## 1. List prices per MTok (base input / output)

**Finding:** All three ids exist exactly as named in your question (they map to the display names "Claude Opus 5", "Claude Sonnet 5", "Claude Haiku 4.5" in the pricing table, and to `claude-opus-5` / `claude-sonnet-5` in the code examples on the Effort page — Haiku 4.5's exact API id wasn't shown on this page, only the display name).

| Model | Base input | Output |
|---|---|---|
| claude-opus-5 | $5 / MTok | $25 / MTok |
| claude-sonnet-5 | $2 / MTok | $10 / MTok |
| claude-haiku-4-5 | $1 / MTok | $5 / MTok |

**Evidence (quote):**
> "Claude Opus 5 | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok | $25 / MTok"
> "Claude Sonnet 5 | $2 / MTok | $2.50 / MTok | $4 / MTok | $0.20 / MTok | $10 / MTok"
> "Claude Haiku 4.5 | $1 / MTok | $1.25 / MTok | $2 / MTok | $0.10 / MTok | $5 / MTok"

Also note the introductory-pricing clarification for Sonnet 5:
> "The $2/$10 per million input/output token pricing for Claude Sonnet 5, announced at launch as introductory pricing through August 31, 2026, is now the standard price. The previously scheduled increase to $3/$15 per million input/output tokens on September 1, 2026 will not occur."

**URL:** https://platform.claude.com/docs/en/about-claude/pricing
**Date/version shown:** No explicit "last updated" date on the page; the standing note above is time-anchored to September 1, 2026, which is before today (2026-09-10), confirming this is current.

**What this means for our code:** `backend/app/config/prices.ts` should use $5/$25 (opus-5), $2/$10 (sonnet-5), $1/$5 (haiku-4-5) per MTok as the base input/output rates, keyed by the model IDs actually read from `MODEL_CHAT`/`MODEL_FAST` env vars.

## 2. Prompt caching multipliers

**Finding:** Your figures are correct for 5-minute writes and confirmed for 1-hour writes; cache read is confirmed at 0.1x (not "1.25x / 2x / read-fraction" ambiguity — all three multipliers are exactly as you stated).

**Evidence (quote):**
> "5-minute cache write | 1.25x base input price | Cache valid for 5 minutes"
> "1-hour cache write | 2x base input price | Cache valid for 1 hour"
> "Cache read (hit) | 0.1x base input price (0.025x on Claude Fable 5.1 and Claude Mythos 5.1) | Same duration as the preceding write"
> "A cache hit costs 10% of the standard input price, which means caching pays off after one cache read for the 5-minute duration (1.25x write), or after two cache reads for the 1-hour duration (2x write)."

**URL:** https://platform.claude.com/docs/en/about-claude/pricing (section "Prompt caching")
**Date/version shown:** Same page as above, no explicit date; internally consistent with the September 2026 note.

**What this means for our code:** `config/prices.ts` cache-write and cache-read multipliers of 1.25x, 2x, and 0.1x (applied to the model's own base input price) are correct for opus-5, sonnet-5, and haiku-4-5 — none of these three models get the reduced 0.025x cache-hit rate (that only applies to Fable 5.1 / Mythos 5.1, which are unrelated model families, not part of our stack).

## 3. Minimum token count for a cache breakpoint

**Finding:** Yes, there is a minimum, and it differs per model. For your three models: Opus 5 = 512 tokens, Sonnet 5 = 1,024 tokens, Haiku 4.5 = 4,096 tokens.

**Evidence (quote):**
> "the minimum cacheable prompt length is: 512 tokens for Claude Fable 5.1, Claude Mythos 5.1, Claude Opus 5, Claude Fable 5, and Claude Mythos 5 ... 1,024 tokens for Claude Opus 4.8, Claude Sonnet 5, Claude Sonnet 4.6, Claude Sonnet 4.5, Claude Opus 4.1, Claude Opus 4, and Claude Sonnet 4 ... 4,096 tokens for Claude Haiku 4.5"
> "Shorter prompts cannot be cached, even if marked with `cache_control`. Any requests to cache fewer than this number of tokens will be processed without caching, and no error is returned."

**URL:** https://platform.claude.com/docs/en/build-with-claude/prompt-caching
**Date/version shown:** No explicit date on page; content is consistent with the current (September 2026) model lineup.

**What this means for our code:** If `MODEL_FAST` is `claude-haiku-4-5` and it is ever used for a cached document block, the cached content must be at least 4,096 tokens or the `cache_control` breakpoint silently does nothing (no error, so this would be invisible in logs unless you check `cache_creation_input_tokens`/`cache_read_input_tokens`). Given `EFFORT_CHAT`/citations presumably run on `MODEL_CHAT` (opus-5 or sonnet-5), their thresholds (512 / 1,024 tokens) are much easier to clear.

## 4. Haiku 4.5: effort and thinking

**Finding (effort):** Confirmed — Haiku 4.5 is not in the list of models that support `output_config.effort`, so it rejects the parameter.

**Evidence (quote):**
> "Supported models: `claude-fable-5-1`, `claude-mythos-5-1`, `claude-fable-5`, `claude-mythos-5`, `claude-mythos-preview`, `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-5-20251101`, `claude-sonnet-5`, `claude-sonnet-4-6`"

`claude-haiku-4-5` is absent from this list. The page does not print the literal 400 error text for an unsupported model, but per-message effort docs elsewhere describe a similarly-worded 400 for models lacking a given effort capability, and Haiku 4.5 is excluded from the base "Supported models" set entirely.

**URL:** https://platform.claude.com/docs/en/build-with-claude/effort

**Finding (thinking):** Not a flat rejection — Haiku 4.5 supports thinking only in extended (manual, `type: "enabled"` + `budget_tokens`) mode, defaulting to **off**, and it explicitly rejects `type: "adaptive"` with a 400.

**Evidence (quote):**
> "| Claude Haiku 4.5 | Extended only | Off | `"adaptive"` |"
> "adaptive thinking is not supported on this model ... This happens because the model supports only extended thinking"
> "Claude Haiku 4.5 does not support interleaved thinking. On the Claude API, the beta header is accepted but ignored."

**URL:** https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting (per-model table) and https://platform.claude.com/docs/en/build-with-claude/extended-thinking (interleaved thinking section)

**What this means for our code / the ADR:** State it precisely, not as a blanket rejection:
- `output_config.effort` on `claude-haiku-4-5` requests: must be omitted entirely — the model is not on the supported-models list for that parameter, so sending it will fail.
- `thinking` on `claude-haiku-4-5`: defaults to off when the parameter is omitted (no code change needed to keep it off); if the request builder ever sets `thinking: {type: "adaptive"}` unconditionally for all models, it must special-case Haiku 4.5 to either omit `thinking` or use `type: "enabled"` with `budget_tokens`, because `adaptive` returns a 400 on this model.
- Since your ADR's actual requirement is "no effort and no thinking" for `MODEL_FAST` calls, the correct phrasing is: *no `output_config.effort` (the model does not support it) and no `thinking` parameter set (thinking is off by default; do not opt into extended/manual thinking for these calls)*.

**Not verified:** The literal wording of the 400 error body Anthropic returns when `output_config.effort` is sent to `claude-haiku-4-5` (the docs show the general 400 message pattern for per-message effort mismatches, but I did not find the exact string for a base-level unsupported-model effort request on this specific page).

Files relevant to where this lands in your repo (not read/edited, just the locations CLAUDE.md and your ADR process point to): `docs/adr/` (new ADR), `backend/app/config/prices.ts`, `backend/app/config/models.ts`, `backend/app/adapters/llm/` (chat-request / artifact-request builders).

