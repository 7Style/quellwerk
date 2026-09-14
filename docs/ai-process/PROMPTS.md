# Prompt-Log

Die Prompts stehen nicht in dieser Datei, sondern wörtlich in den Exporten unter
[sessions/](sessions/): ein Dokument je Tag, meine Eingaben unverändert, die
Antworten als Text, die Werkzeugaufrufe als eine Zeile. Wer lesen will, wie
dieses Repository gesteuert wurde, liest dort und nicht hier.

Hier stand eine Tabelle mit einer Zeile je Session — Ziel, Prompt, übernommen,
abgelehnt — und sie ist leer geblieben. Neben einem vollständigen Verlauf noch
eine nacherzählte Kurzfassung zu führen heißt, zwei Fassungen zu pflegen, von
denen die kürzere immer die ungeprüfte ist. Der Export ist die Quelle.

Die Prompts sind nicht alle von mir getippt: die zweite Session hat die meisten
vorformuliert, ich habe sie gelesen, geändert und abgeschickt. Wer welche Rolle
hatte, steht in [AI-DECLARATION.md](AI-DECLARATION.md) unter "Zwei Sessions, und
wer was gemacht hat". In den Exporten liegt nur die bauende Session.

Vorbereitung vor dem ersten Commit: Die Strategie, der Prompt-Ablauf, CLAUDE.md,
die Hooks und der Vertrag in prompts/README.md sind in der zweiten Session
entstanden und danach von mir von Hand geprüft und geändert worden. Die
Prompt-Dateien unter prompts/ selbst entstehen Meilenstein für Meilenstein in der
bauenden Session und sind im Export des jeweiligen Tages nachzulesen.

## Abgelehnt und warum

Die eine Spalte der alten Tabelle, die der Export nicht ersetzt: er zeigt, was
der Agent geliefert hat, aber nicht, was ich davon verworfen habe. Ein Eintrag je
Session, angehängt über den Skill `/prompt-log`. Die ausführlichen Fälle stehen
in [AI-DECLARATION.md](AI-DECLARATION.md), die Entscheidungen ohne eigenen ADR in
[DECISION-LOG.md](DECISION-LOG.md).

