---
name: plan-step
description: Work through one task from docs/PLAN.md end to end. Restates goal and test command, implements, runs the test, pastes the output, ticks the checkbox, commits with the milestone prefix.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(pnpm *), Bash(git add *), Bash(git commit *), Bash(git status), Bash(git diff *), Bash(git log *), Bash(docker compose *)
argument-hint: "<task id or milestone, for example M3-T2 or M3>"
---
Task id: $ARGUMENTS

1. Open docs/PLAN.md. If $ARGUMENTS is a task id (M3-T2), work on that task only. If it is a milestone (M3, or "the M3 tasks"), take every unticked task of that milestone in PLAN order and run steps 2 to 7 for each one, one commit per task; stop at the first task whose test cannot pass. For each task print its Goal, Files, Test and Expected lines verbatim before writing any code. If the task does not exist, stop.
2. Read CLAUDE.md and the files the task names. Read the ADRs the task references.
3. Implement only that task. If you discover that the task needs a decision that is not in docs/SPEC.md or an ADR, stop and ask; do not decide silently.
4. Run the task's Test command. Paste the output. If it fails, fix and re-run. If it cannot pass, say why and stop; do not tick the box.
5. Tick the checkbox in docs/PLAN.md.
6. Commit with the message format "<milestone> <area>: <what and why>" (for example "M3 chat: verify citations against stored text before persisting"). Keep the Co-Authored-By trailer.
7. Print: task id, files changed, test command, first line of the test output, commit hash.
