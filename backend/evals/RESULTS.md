# Eval results

One block per measured run, newest first. A block records what ran, against
which golden set, and what came out. The thresholds live in `docs/SPEC.md` and
are not repeated here: a row says whether it cleared the threshold, never what
the threshold is.

Every block names the answerer. A citation validity of 100 percent from recorded
fixtures and one from the live route are not the same number, and a table that
leaves the word out will be quoted as if it were the better of the two.

Why a revision moved a number belongs in `HILLCLIMB.md`, not here.

## 2026-09-12, M9-T1: the final run, and the one thing the held-out split found

**One metric is below its threshold**: abstention accuracy is 85.7 percent
where docs/SPEC.md asks for 100. Six of seven unanswerable items were refused;
`g30` was answered. Everything else cleared, including the one that is measured
without a judge: 146 of 146 citations valid.

`pnpm eval --full`, thirty items from `golden.jsonl`, 425.6s, live answerer on
claude-opus-5 at effort low. This is the first and only measurement of the ten
held-out items.

| Metric | M6 close (dev, 20) | M9-T1 (all, 30) | Threshold | |
|---|---|---|---|---|
| Citation validity | 100.0% (97/97) | 100.0% (146/146) | 100% | met |
| Abstention accuracy | 100.0% (5/5) | 85.7% (6/7) | 100% | **missed** |
| False refusals | 0 of 15 | 0 of 23 | 0 | met |
| Citations on a refusal | 0 | 0 | 0 | met |
| Correctness | 100.0% | 100.0% | >= 85% | met |
| Faithfulness | 1.00 | 1.00 | >= 0.90 | met |
| Judge | `claude-sonnet-5` | `claude-sonnet-5` | different model | not self-judged (ADR-0011) |

Results file: `evals/results/2026-09-12T14-09-39-934Z-full.json`.

### The case: g30

The question is a held-out one and it is built as a trap: *"Which harmonised
standards have been published for the accuracy requirements of Article 15?"*
Article 15 is in the excerpt, the harmonised standards are not. The item's own
note says it: "Die halbe Kenntnis ist der Koeder."

What came back was not an invention. It began:

> None are named in the sources, and the standardisation work has not
> delivered: in May 2023 the Commission mandated CEN and CENELEC to develop
> standards for the high-risk requirements ...

Five citations, all five valid, and the judge scored the content correct. The
model said there is nothing to name and then said what the sources do carry
about the standardisation work.

So what failed is not the grounding, it is the rule. Abstention is measured
programmatically on the literal opening sentence (docs/SPEC.md), and
`beginsWithRefusal` did not match "None are named in the sources". The frozen
system prompt asks for that exact sentence and the model paraphrased it.

**Two candidate reasons, and they lead to different fixes.** Either the prompt
is too weak about the exact wording on a question whose answer is half in the
corpus - then the fix is a prompt revision. Or the measurement is too narrow,
because an answer that says "none are named in the sources" and cites the
surrounding facts is arguably the better product behaviour than a bare refusal -
then the fix is the metric, and the golden set would have to say which of the two
it wants.

**Neither is done here, and that is the point of a held-out split.** Tuning
either the prompt or the metric against this number would turn the one honest
measurement in this repository into a dev run with extra steps. What belongs
next, in this order: decide which of the two readings is right (it is a product
decision, not a bug), write it into docs/SPEC.md, then revise prompt or metric
and measure on the dev split, and only a *new* held-out set may check the
result.

### What these numbers do not cover

The same three things as every run before: the report path has no judge, the
follow-up questions have no golden item, and the notebook overview has none
either. The eval measures a chat turn.

## 2026-09-12, M6 close: unchanged, and the first run from the real golden set

**From `golden.jsonl`**, not from the draft. M1-T3 took the set over by hand
(3f3aee9), so this is the first close whose numbers come from the file the
reviewer reads.

| Metric | M4 close | M6 close | |
|---|---|---|---|
| Citation validity | 100.0% (103/103) | 100.0% (97/97) | unchanged |
| Abstention accuracy | 100.0% (5/5) | 100.0% (5/5) | unchanged |
| False refusals | 0 of 15 | 0 of 15 | unchanged |
| Citations on a refusal | 0 | 0 | unchanged |
| Correctness | 100.0% | 100.0% | unchanged |
| Faithfulness | 1.00 | 1.00 | unchanged |

`pnpm eval --dev`, twenty items, 287.7s, live answerer on claude-opus-5 at
effort low. The held-out split was not touched and stays closed until M9-T1.

Measured at 51b7ca8, before the two hardening commits that close the milestone.
They do not touch the chat path: no prompt, no request builder and no line of
`chat.service.ts` changed in them, so re-running would have reproduced these
numbers at the price of twenty turns.

Unchanged is the answer the run was for. M6 added six prompts and a second
caller of `buildChatRequest`, and the risk was never that a report would be
graded badly - no golden item produces one - but that the report path would
change the chat path on its way in. It shares the system block, the documents
and the effort with every answer; a number that had moved here would have meant
the reports were writing into the conversation's cache namespace or its prompt.

What no number here covers is the report itself. Correctness and faithfulness
are judged on golden items, and a report is a page rather than an answer to a
question somebody wrote an expected answer for. What guards a report today is
the chat's own resolver - every chip is checked against the stored text before
it is stored - and the structure blocks that ask for the two sections a smoothed
report would drop: where the sources disagree, and what is not in them.

Results file: `evals/results/2026-09-12T11-17-57-248Z-dev.json`.

## 2026-09-12, M6-T1: the cache is read, including by a report

`pnpm eval --cache-check`, four calls against the real API.

| call | input | cache read | cache write |
|---|---|---|---|
| first turn | 21 | 0 | 76,239 |
| second turn | 23 | 76,239 | 0 |
| after Configure chat | 42 | 76,239 | 0 |
| report right after a chat turn | 601 | 76,239 | 0 |

This is the whole economic claim of ADR-0002 on one screen. The documents are
paid for once, and every call after that reads them back for a tenth of the
price. The input column is what is actually new each time: a question is twenty
tokens, a report task is six hundred.

The fourth row is the one worth the four calls. A report is a chat turn whose
last message is a task instead of a question - same documents, same system
block, same effort - and if any of those three had drifted it would be a second
cache namespace. Nothing in the interface would look different; every report
over a full notebook would simply cost about ten times what it should, for ever,
and the only trace would be this number staying at zero.

The third row is the one that is easy to get wrong the other way. Configure chat
sets style and length, and they go into the last user turn, behind the
breakpoint (prompts/README.md, cache rule 3). Had they gone into the system
block - which is where a reader would first think to put them - changing the
style would throw away the whole prefix.

Run it after touching a request builder, the system prompt or the effort. It
costs four calls and it is the only thing that notices.

## 2026-09-12, M4 close: unchanged, which is the result

**From `golden.draft.jsonl` again**; the golden set is still written by hand
(ADR-0008).

| Metric | M3 close | M4 close | |
|---|---|---|---|
| Citation validity | 100.0% (94/94) | 100.0% (103/103) | unchanged |
| Abstention accuracy | 100.0% (5/5) | 100.0% (5/5) | unchanged |
| False refusals | 0 of 15 | 0 of 15 | unchanged |
| Citations on a refusal | 0 | 0 | unchanged |
| Correctness | 100.0% | 100.0% | unchanged |
| Faithfulness | 1.00 | 1.00 | unchanged |

Run because the milestone routine says so, and worth the four minutes for what
it rules out rather than for what it shows. M4 is the interface: it added two
read routes, a computed `refused` field and a streaming client, and it changed
`chat.service.ts` in one place that the eval does not reach - the answerer goes
through `buildChatRequest` directly, not through the route. A number that had
moved here would have meant something changed that nobody intended.

The citation count differs between runs because the model cites as much as it
needs to. It is not a metric; the share is.

Results file: `evals/results/2026-09-12T09-13-27-449Z-dev.json`.

## 2026-09-11, M3-T5: the first live run on the dev split

**These numbers come from `golden.draft.jsonl`.** The golden set is written by
hand and does not exist yet (ADR-0008, and a hook keeps it that way). The draft
is 30 items written by me, so a number from it says what the route does on
questions I chose. It is not a held-out measurement of anything, and it is
replaced the moment `golden.jsonl` lands.

| | |
|---|---|
| Mode | `pnpm eval --dev`, 20 dev items |
| Answerer | live, through `buildChatRequest` and the frozen system prompt |
| Model under test | `claude-opus-5`, effort low |
| Judge | `claude-sonnet-5`, a different model (ADR-0011), so not self-judged |
| Duration | 287.2s |
| Results file | `evals/results/2026-09-11T22-20-26-268Z-dev.json` |

| Metric | Value | Basis | Threshold |
|---|---|---|---|
| Citation validity | 100.0% | 94 of 94 citations, `slice(start, end) === cited_text`, no judge | met |
| Abstention accuracy | 100.0% | 5 of 5 `unanswerable` items refused with the exact sentence, no judge | met |
| False refusals | 0 | of 15 answerable items | met |
| Citations on a refusal | 0 | must be 0, or the run fails | met |
| Correctness | 100.0% | judge, against the reference facts of each item | met |
| Faithfulness | 1.00 | judge, share of supported claims, refusals excluded | met |

This is the second run at these numbers. The first reached them at the end of
M3-T5 (91 of 91 citations, everything else identical); this one was run again
after the security review's fixes landed, because a milestone tag is a claim
about the tree it points at and not about the tree four commits ago.

The held-out split was not touched. It is measured once, with `--full`, at the
end of M9.

### The abstention number, checked a second time

100 percent over five items is five coin flips coming up heads. The three runs
before this one each missed exactly one of the five, and not always the same
one, so a single clean run is weak evidence for a fix. The five `unanswerable`
dev items were therefore run three more times on their own:

```
15/15 refused in the right language with no citation
```

Twenty consecutive correct refusals against three misses in the fifteen attempts
before the change. That is evidence; it is still not proof, and the metric to
watch on the held-out split is this one.

### What these numbers do not cover

- **Cost.** The eval calls the API directly and does not write `usage_log`, so a
  run's cost is not accounted anywhere. The per-turn economics measured in
  `HILLCLIMB.md` (M3-T0) are the only figures available today.
- **The stream.** Everything above is measured on the assembled message. The SSE
  path, its heartbeat and its abort behaviour are covered by the route tests and
  by the manual run through nginx, not by an eval item.
- **Anything outside the four corpus documents.** Twenty items over four
  documents on one subject. A regression this set cannot see is a regression
  that ships.
