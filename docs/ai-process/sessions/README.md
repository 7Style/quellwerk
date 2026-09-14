# Sessions

Die Arbeit an diesem Repository, als Markdown. Erzeugt von
`scripts/export-sessions.mjs` aus den Transkripten von Claude Code; die
Rohdateien selbst sind nicht eingecheckt (siehe ../TRANSCRIPTS.md).

6 Tage aus der bauenden Session, 64 Prompts,
759 Antworten, 2514 Werkzeugaufrufe als Zeile.
Dazu 8 Subagent-Läufe unter [subagents/](subagents/).

## Was drin ist, und was nicht

- **Meine Prompts, wörtlich.** Entfernt ist nur, was die Oberfläche
  angehängt hat: `<ide_opened_file>`, `<system-reminder>`. Das habe ich
  nicht getippt.
- **Die Antworten als Text.** Kein Thinking: das ist ein Zwischenstand und
  kein Ergebnis, und als Beleg gelesen wäre es ein Missverständnis.
- **Werkzeugaufrufe als eine Zeile:** welches Werkzeug, worauf.
- **Keine Werkzeugausgaben.** Sie sind der grösste Teil eines Transkripts -
  Dateiinhalte, Datenbankzeilen, Testläufe - und was daran eine Entscheidung
  war, steht in der Antwort daneben. Was der Code tut, steht im Code; was
  gemessen wurde, in RESULTS.md und in den Commit-Nachrichten.

## Geschwärzt

Vor dem Schreiben, nicht danach: Schlüssel, Token, Passwörter und
Verbindungs-URLs mit Zugangsdaten werden ersetzt, das Etikett bleibt
stehen. Danach liest `scripts/scan-secrets.mjs` die geschriebenen Dateien
noch einmal mit eigenen Mustern. Der Export wird erst committet, wenn diese
zweite Suche nichts findet.

Das ist eine Maschine, kein Versprechen. Wer hier etwas findet, das nicht
öffentlich sein sollte: bitte melden.

## Zwei Sessions

Hier liegt die bauende Session. Die zweite, mit der geplant und deployt
wurde, ist nicht dabei; was sie gemacht hat, steht in
[../AI-DECLARATION.md](../AI-DECLARATION.md).

