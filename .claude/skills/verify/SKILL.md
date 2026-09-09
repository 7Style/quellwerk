---
name: verify
description: Run typecheck, lint, unit tests and the eval smoke subset, then summarise in at most ten lines. Use before every commit and before saying a task is done.
allowed-tools: Bash(pnpm typecheck), Bash(pnpm lint), Bash(pnpm test), Bash(pnpm eval *), Read
---
Run these in order and stop at the first failure:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm eval --smoke` (recorded fixtures, no API key needed), but only if the root
   package.json has an `eval` script. Read package.json and check before running.
   If there is no `eval` script, print the single line `eval: kommt in M1`, treat the
   step as neither passed nor failed, and continue to the summary.

Then write a summary of at most ten lines: one line per step with pass/fail, the first error message verbatim if a step failed, and the eval smoke numbers (citation validity, abstention) if it ran. Do not paraphrase errors. Do not claim a step passed that you did not run.
