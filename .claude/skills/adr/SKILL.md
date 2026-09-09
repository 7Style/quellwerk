---
name: adr
description: Create a new Architecture Decision Record docs/adr/NNNN-<slug>.md from docs/adr/TEMPLATE.md, in German, with the next free number. Existing ADRs are immutable (enforced by a hook); to change a decision, write a new ADR that supersedes the old one.
allowed-tools: Read, Write, Glob
argument-hint: "<decision in one sentence>"
---
1. List docs/adr/ and take the next free four-digit number.
2. Derive a short kebab-case slug from $ARGUMENTS (German or English, at most five words).
3. Copy docs/adr/TEMPLATE.md to docs/adr/NNNN-<slug>.md and fill every section in German: Kontext, Optionen (at least two alternatives), Entscheidung, Konsequenzen, Verworfen weil (one concrete reason per rejected option, with a number or limit where possible), Würde sich ändern wenn.
4. Status "angenommen", today's date.
5. If this ADR supersedes an older one, add "ersetzt ADR-NNNN" to the status line of the new file. Do not touch the old file.
6. Print the path and the Entscheidung paragraph.
