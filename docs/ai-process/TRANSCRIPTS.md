# Transkripte

Was von der Arbeit mit dem Agenten nachlesbar ist, und wo.

## Im Repository

| Datei | Was sie zeigt |
|---|---|
| [PROMPTS.md](PROMPTS.md) | Ein Eintrag je Session: Ziel, Prompt wie eingegeben, was übernommen und was abgelehnt wurde. |
| [AI-DECLARATION.md](AI-DECLARATION.md) | Die Stufen je Prozess, die vom Modell erzeugten Daten und drei Fälle, in denen ich Ausgaben verworfen habe. |
| [DECISION-LOG.md](DECISION-LOG.md) | Entscheidungen aus den Sessions, die keinen eigenen ADR bekommen haben. |
| [../../backend/evals/HILLCLIMB.md](../../backend/evals/HILLCLIMB.md) | Eine Zeile je Prompt-Revision: was geändert wurde, was es mit den Zahlen gemacht hat. |
| [../../backend/evals/results/](../../backend/evals/results/) | Die Rohdaten jedes Eval-Laufs, eine JSON-Datei je Lauf, mit Modell, Split und Zeitstempel. |
| [../adr/](../adr/) | Die Entscheidungen, die den Aufbau tragen, jede mit den verworfenen Alternativen. |
| Git-Historie | Ein Commit je PLAN-Aufgabe, die Nachricht sagt was und warum, `Co-Authored-By` nennt das Modell. |
| [../../.claude/](../../.claude/) | Das Harness selbst: CLAUDE.md, die Hooks, die Skills, der Reviewer-Agent. Was der Agent tun durfte und was nicht, ist damit lesbar und nicht behauptet. |

## Nicht im Repository

Die vollständigen Chat-Transkripte beider Sessions — der bauenden und der
planenden, siehe AI-DECLARATION.md — liegen lokal unter
`~/.claude/projects/<projektpfad>/*.jsonl` und sind nicht eingecheckt. Drei
Gründe, in dieser Reihenfolge:

Sie sind groß — eine Session sind mehrere Megabyte JSON, und der größte Teil
davon ist Werkzeugausgabe: Testläufe, Dateiinhalte, Diffs. Was daran eine
Entscheidung war, steht in den Dateien oben; was daran Rauschen war, hilft
niemandem.

Sie enthalten absolute Pfade dieser Maschine und beiläufig durchgelaufene
Ausgaben, bei denen ich für keine einzelne Zeile garantieren kann, dass kein
Wert daraus in ein öffentliches Repository gehört. Ein Transkript zu
veröffentlichen, das ich nicht Zeile für Zeile gelesen habe, wäre dasselbe
Versehen, gegen das die Hooks in diesem Projekt gebaut sind.

Und sie sind kein Beweis. Ein Transkript zeigt, was gesagt wurde; ob der Code
tut, was er behauptet, zeigen die Testausgaben, die Eval-Zahlen und der
laufende Server. Auf Anfrage gebe ich Ausschnitte heraus — etwa die Stelle, an
der der Reviewer-Subagent die zwölf Funde in M6 gemeldet hat, oder die, an der
ich die verworfene Neueinreihung gegen das echte Redis nachgemessen habe.
