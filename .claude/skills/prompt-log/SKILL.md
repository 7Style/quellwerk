---
name: prompt-log
description: Append this session's entry to the "Abgelehnt und warum" section of docs/ai-process/PROMPTS.md (date, goal, what the user rejected and why). Run at the end of every session.
allowed-tools: Read, Edit, Write, Bash(date *), Bash(git log *)
argument-hint: "[one-line session goal]"
---
The prompts themselves are no longer logged here: they are exported verbatim to
docs/ai-process/sessions/<date>.md by scripts/export-sessions.mjs. Do not
summarise them again. What the export cannot show is what the user threw away,
and that is what this skill records.

Append one entry to the end of the "Abgelehnt und warum" section of
docs/ai-process/PROMPTS.md, in this shape:

### YYYY-MM-DD -- <session goal>

<one paragraph per rejected item>

- Date: today's date from `date +%Y-%m-%d`.
- Session goal: $ARGUMENTS if given, otherwise one line derived from the first
  user message of this session. Name the commits from `git log --oneline -5` in
  the paragraph if they are what the rejection led to.
- Content: everything the user rejected, reverted, or rewrote by hand during this
  session, with the reason the user gave, in the user's words where they gave
  one. If nothing was rejected, write a single line "Nichts abgelehnt." and do
  not invent an entry.

Never edit earlier entries. Never delete anything from the file.
