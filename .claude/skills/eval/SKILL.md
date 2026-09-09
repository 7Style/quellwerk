---
name: eval
description: Run the eval harness on the golden set, rewrite the table in backend/evals/RESULTS.md with the previous run next to it, and print the diff. Use after every change to a prompt in prompts/ or to the request builder.
allowed-tools: Bash(pnpm eval *), Read, Edit, Bash(git diff *)
argument-hint: "[--smoke | --dev | --full | --cache-check | --record]"
---
0. Read the root package.json. If it has no `eval` script, print the single line
   `eval: kommt in M1` and stop. Do not improvise a run.
1. Run `pnpm eval $ARGUMENTS` (default `--full`). Do not modify backend/evals/golden.jsonl.
2. Read the new results file under backend/evals/results/.
3. With --dev: append one row to backend/evals/HILLCLIMB.md (revision, commit, what changed, citation validity / abstention / correctness / faithfulness before -> after, dev split only); do not touch RESULTS.md. With --full: rewrite only the section "## Letzter Lauf" in backend/evals/RESULTS.md (metric, previous run, this run, delta; metrics: citation validity, correctness, faithfulness with the number of excluded rows, abstention accuracy, conflict items presenting all positions, injection reported, mean tokens, mean cost per answer, p50 latency, judge model, eval cost); the final comparison table above it is maintained by hand.
4. With --full also keep the section "Schlechteste drei Fälle" up to date: the three worst rows with a one-line diagnosis each.
5. Print the delta lines only. If a metric got worse, say so in the first line.
