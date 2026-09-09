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

Von mir allein geschrieben: docs/BRIEF.md, die Erwartungsantworten in
backend/evals/golden.jsonl, die README-Prosa nach der Überarbeitung.

Abgelehnte oder umgeschriebene Modell-Ausgaben (mindestens drei konkrete Fälle,
aus docs/ai-process/PROMPTS.md übernommen):

1. ...
2. ...
3. ...

Die Co-Authored-By-Trailer in der Git-Historie sind korrekt.
