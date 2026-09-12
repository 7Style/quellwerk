# AI Declaration

Format nach ai-declaration.md. Stufen: none, hint, assist, pair, copilot, auto.

```yaml
global: pair
processes:
  design: assist        # Entscheidungen von mir, Entwürfe vom Modell
  implementation: copilot
  testing: pair
  documentation: assist
  review: pair          # Reviewer-Subagent plus eigene Durchsicht
  deployment: assist
tools:
  - Claude Code (Fable 5.1 / Opus 5)
  - Claude API (Opus 5, Haiku 4.5, Sonnet 5 als Eval-Richter)
```

## Notes

Von mir allein geschrieben: docs/BRIEF.md und die README-Prosa nach der
Überarbeitung.

### Das Golden Set, genau wie es entstanden ist

Es ist der Grenzfall dieser Erklärung, deshalb steht es hier ausführlich und
nicht in einem Halbsatz.

Den Entwurf hat der Agent aus dem Korpus geschrieben: dreißig Fragen über fünf
Typen, die erwarteten Fakten dazu und dreiunddreißig Belegzitate. Ablegen durfte
er ihn nur als `backend/evals/golden.draft.jsonl`; ein Hook verbietet dem Agenten
jeden Schreibzugriff auf `backend/evals/golden.jsonl` (ADR-0008). Der Grund ist
nicht Misstrauen gegen den Entwurf, sondern die Rolle der Datei: ein Harness, das
seine eigenen Hausaufgaben benotet, misst nichts.

Ich habe den Entwurf durchgesehen und unverändert nach `golden.jsonl`
übernommen. Unverändert heißt hier byteweise identisch, und das ist eine Aussage
über die Prüfung, nicht über ihren Aufwand: ein Item ging vorher zurück. `g14`
verlangte, bei widersprüchlichen Terminen den Verordnungstext als bindend zu
markieren. Das widerspricht der Konfliktregel des eingefrorenen Systemprompts,
die bei einer veralteten Quelle die neuere bevorzugt, und dem Korpus, in dem die
Kommissions-FAQ vom 11.09.2026 den seit dem 27.07.2026 geltenden Digital Omnibus
nennt. Der Agent hat den Widerspruch beim ersten Dev-Lauf gemeldet, die Erwartung
im Entwurf geändert und die Begründung nach `backend/evals/HILLCLIMB.md`
geschrieben; freigegeben habe ich sie. Ein Golden-Item zu ändern, bis das Modell
besteht, ist der Weg, auf dem ein Eval aufhört zu messen — dass hier der Prompt
älter war als die Erwartung, ist der Unterschied.

Alle Eval-Zahlen vor dem 12.09.2026 stammen aus dem Entwurf. Der Runner schreibt
das in jeden Lauf und in jede Ergebnisdatei, und die Blöcke in
`backend/evals/RESULTS.md` sagen es in ihrer ersten Zeile.

Die zehn Held-out-Items bleiben bis M9-T1 ungemessen. Bis dahin läuft jede
Messung auf den zwanzig Dev-Items; ein Held-out-Split, der jeden Tag gemessen
wird, ist ein Dev-Split mit Zusatzschritten.

Abgelehnte oder umgeschriebene Modell-Ausgaben (mindestens drei konkrete Fälle,
aus docs/ai-process/PROMPTS.md übernommen):

1. ...
2. ...
3. ...

Die Co-Authored-By-Trailer in der Git-Historie sind korrekt.
