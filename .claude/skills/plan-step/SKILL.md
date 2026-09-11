---
name: plan-step
description: Work through one task from docs/PLAN.md end to end. Restates goal and test command, implements, runs the test, pastes the output, ticks the checkbox, commits with the milestone prefix. Closes a milestone only after verify, security review, eval, the SECURITY.md checklist and the tag.
allowed-tools: Read, Edit, Write, Glob, Grep, Skill, Bash(pnpm *), Bash(git add *), Bash(git commit *), Bash(git status), Bash(git diff *), Bash(git log *), Bash(git tag *), Bash(docker compose *), Bash(bash scripts/*)
argument-hint: "<task id or milestone, for example M3-T2 or M3>"
---
Task id: $ARGUMENTS

1. Open docs/PLAN.md. If $ARGUMENTS is a task id (M3-T2), work on that task only. If it is a milestone (M3, or "the M3 tasks"), take every unticked task of that milestone in PLAN order and run steps 2 to 7 for each one, one commit per task; stop at the first task whose test cannot pass. For each task print its Goal, Files, Test and Expected lines verbatim before writing any code. If the task does not exist, stop.
2. Read CLAUDE.md and the files the task names. Read the ADRs the task references.
3. Implement only that task. If you discover that the task needs a decision that is not in docs/SPEC.md or an ADR, stop and ask; do not decide silently.
4. Run the task's Test command. Paste the output. If it fails, fix and re-run. If it cannot pass, say why and stop; do not tick the box.
5. Tick the checkbox in docs/PLAN.md.
6. Before committing, state in one sentence whether the change still satisfies the
   two rules the architecture stands on: modules import nothing from each other
   and reach one another only through `modules/index.ts`, and the only external
   call is model inference at Anthropic behind `AnthropicLlmAdapter`. Say which
   of the two you checked and how; if either is broken, fix it before the commit
   rather than noting it.
7. Commit with the message format "<milestone> <area>: <what and why>" (for example "M3 chat: verify citations against stored text before persisting"). Keep the Co-Authored-By trailer.
8. Print: task id, files changed, test command, first line of the test output, commit hash.

## Closing a milestone

The last ticked task does not finish a milestone. Run this routine in order and
print the result of every line. A milestone may only be reported as done when
every line that applies has passed with evidence on screen; if one cannot be
answered, say which and stop instead of calling the milestone finished.

1. **Verify, every milestone.** Run `/verify` and paste its summary.
2. **Security review, from M2 on.** Run `/security-review` over what this
   milestone added: new routes, uploads, URL ingestion, SSE. Print every finding.
   Each one becomes a task in THIS milestone and is fixed before the tag; nothing
   rated high or critical stays open. Print what happened to each finding.
3. **Eval, from M3 on.** Run `/eval` and record the numbers in
   backend/evals/RESULTS.md. Print the delta lines. If a metric got worse, say so
   in the first line and do not tag until it is explained or fixed.
4. **Checklist, SECURITY.md section 8.** Walk the part that applies at this point:
   compose and environment from M0 on, the server block once a deploy exists.
   Print each box with pass or fail, and run `bash scripts/security-check.sh`;
   a single FAIL blocks the tag.
5. **Tag.** `m1-evals` after M1, `m3-chat` after M3, `m6-reports` after M6,
   `m8-live` after M8. Create it only when 1 to 4 are green.
6. **Summary.** Print: tasks completed, their test commands, the eval numbers,
   the findings and their fixes, the tag name.

Never tick a milestone, write "done" or create its tag on the strength of the
task boxes alone.
