---
name: prompt-log
description: Append this session's entry to docs/ai-process/PROMPTS.md (date, goal, the prompt as pasted, what was accepted, what was rejected and why). Run at the end of every session.
allowed-tools: Read, Edit, Write, Bash(date *), Bash(git log *)
argument-hint: "[one-line session goal]"
---
Append one row to the table in docs/ai-process/PROMPTS.md:

| Datum | Session-Ziel | Prompt (wie eingegeben) | Übernommen | Abgelehnt und warum |

- Datum: today's date from `date +%Y-%m-%d`.
- Session-Ziel: $ARGUMENTS if given, otherwise one line derived from the first user message of this session.
- Prompt: the first user prompt of this session, shortened to at most 400 characters with "..." if longer, escaped pipe characters; the full prompt goes to docs/ai-process/sessions/<date>-<slug>.md and the cell links to it.
- Übernommen: the files created or changed and the commit hash(es) from `git log --oneline -5`, one line.
- Abgelehnt und warum: everything the user rejected, reverted, or rewrote by hand during this session, with the reason the user gave. If nothing was rejected, write "nichts" and do not invent an entry.

Never edit earlier rows. Never delete anything from the file.
