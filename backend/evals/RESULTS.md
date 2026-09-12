# Eval results

One block per measured run, newest first. A block records what ran, against
which golden set, and what came out. The thresholds live in `docs/SPEC.md` and
are not repeated here: a row says whether it cleared the threshold, never what
the threshold is.

Every block names the answerer. A citation validity of 100 percent from recorded
fixtures and one from the live route are not the same number, and a table that
leaves the word out will be quoted as if it were the better of the two.

Why a revision moved a number belongs in `HILLCLIMB.md`, not here.

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
