# Verify prices and zodOutputFormat

Subagent-Lauf `researcher`, 9 Werkzeugaufrufe.
Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist
Werkzeugausgabe (siehe [README.md](../README.md)).

## Auftrag

> Zwei Fragen gegen die aktuelle offizielle Anthropic-Dokumentation, jeweils mit Quell-URL. Knapp und konkret. Wo etwas nicht eindeutig belegbar ist, sag das ausdrücklich statt zu raten.
>
> **1. Preise (für eine Kostentabelle in config/prices.ts)**
>
> Für die Modelle `claude-opus-5`, `claude-sonnet-5` und `claude-haiku-4-5`:
>
> - Preis je Million Input-Token und je Million Output-Token.
> - Preis für Prompt-Caching: Cache-Write mit 5 Minuten TTL und Cache-Write mit 1 Stunde TTL, jeweils als Faktor auf den Input-Preis oder als absoluter Preis je Million Token.
> - Preis für Cache-Read (cache hit).
> - Falls es gestaffelte Preise gibt (z.B. ab einer bestimmten Kontextlänge oder Batch-Rabatt), nenne die Staffel.
>
> Gib die Zahlen so an, dass ich sie direkt in eine Tabelle übernehmen kann, und nenne das Datum bzw. die Version der Preisseite.
>
> **2. Strukturierte Ausgaben im TypeScript-SDK (`@anthropic-ai/sdk` ^0.124.0)**
>
> - Wie lautet der genaue Import und die Signatur von `zodOutputFormat`? Aus welchem Pfad wird es importiert (`@anthropic-ai/sdk/helpers/zod` oder anders)?
> - Wie wird es benutzt: mit `client.messages.parse(...)` oder mit `client.messages.create(...)` plus `output_config.format`? Zeig ein vollständiges Minimalbeispiel.
> - Wie heißt das Feld im Ergebnis, das das geparste Objekt enthält (`parsed_output`, `parsed`, etwas anderes)?
> - Unterstützt es zod 4 (das Projekt nutzt `zod@^4.5.4`) oder nur zod 3?
> - Welche JSON-Schema-Konstrukte lehnt die API ab? Konkret: `minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems`, `enum`, `optional`, rekursive Schemas, `additionalProperties`.
> - Was passiert bei einem Validierungsfehler, und gibt es einen eingebauten Retry?
> - Bestätige oder widerlege: Citations (`citations: {enabled: true}` auf Dokumentblöcken) und strukturierte Ausgaben lassen sich nicht kombinieren, die API antwortet mit HTTP 400. Wenn ja, mit welcher Fehlermeldung?
>
> Nenne für jede Antwort die URL.

## Ergebnis

Konfirmiert mit Primärquellen. Zwei Punkte in der Annahme der Frage sind falsch: Es gibt kein Modell `claude-opus-5` mit "Fast"-Sonderpreis-Verwechslung zu beachten (Opus 5 existiert, Preise unten), aber `zodOutputFormat` ist zod-3-basiert intern (nutzt `zod-to-json-schema`) — laut SDK-`package.json` als Peer-Dependency aber offiziell für zod 4 freigegeben; Community-Berichte nennen Inkompatibilitäten. Details unten.

## 1. Preise (Stand der Pricing-Seite, Abschnitt "Model pricing" bzw. "Prompt caching", Datum nicht explizit auf der Seite vermerkt, aber Sonnet-5-Notiz erwähnt "September 1, 2026" als bereits vergangenes Datum, d.h. Stand ≥ September 2026)

| Modell | Input | Output | 5-Min Cache Write | 1-Std Cache Write | Cache Read (Hit) |
|---|---|---|---|---|---|
| claude-opus-5 | $5 / MTok | $25 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok |
| claude-sonnet-5 | $2 / MTok | $10 / MTok | $2.50 / MTok | $4 / MTok | $0.20 / MTok |
| claude-haiku-4-5 | $1 / MTok | $5 / MTok | $1.25 / MTok | $2 / MTok | $0.10 / MTok |

Zitat: "5-minute cache write | 1.25x base input price | Cache valid for 5 minutes" / "1-hour cache write | 2x base input price" / "Cache read (hit) | 0.1x base input price ... | Same duration as the preceding write"

Wichtiger Hinweis für Sonnet 5: "The $2/$10 per million input/output token pricing for Claude Sonnet 5, announced at launch as introductory pricing through August 31, 2026, is now the standard price. The previously scheduled increase to $3/$15 per million input/output tokens on September 1, 2026 will not occur." — d.h. $2/$10 ist der dauerhafte Preis, kein Übergangspreis mehr.

Staffelungen, die für euch relevant sein können:
- Batch API (50 % Rabatt, kombinierbar mit Caching): Opus 5 Input $2.50/MTok, Output $12.50/MTok; Sonnet 5 Input $1/MTok, Output $5/MTok; Haiku 4.5 Input $0.50/MTok, Output $2.50/MTok.
- Long-context-Staffel: Für Claude 4.6+ und neuer inkl. Opus 5/Sonnet 5/Haiku 4.5 gilt der volle 1M-Token-Kontext zum Standardpreis, kein Aufschlag ab bestimmter Länge: "A 900k-token request is billed at the same per-token rate as a 9k-token request."
- Data residency (`inference_geo: "us"`): 1.1x-Multiplikator auf alle Token-Kategorien, gilt für Claude 4.6+ (relevant nur falls ihr das nutzt — CLAUDE.md erwähnt es nicht).
- Fast mode (nur Opus 5/4.8, Research Preview): Input $10/MTok, Output $50/MTok — falls ihr `speed:"fast"` nie setzt, irrelevant.

URL: https://platform.claude.com/docs/en/about-claude/pricing

## 2. Strukturierte Ausgaben im TS-SDK

**Import & Signatur**
```ts
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
```
`zodOutputFormat(zodObject)` — "Creates a JSON schema output format from a Zod schema."

**Verwendung** — mit `client.messages.parse()`, `output_config.format`:
```ts
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Anthropic } from '@anthropic-ai/sdk';

const NumbersResponse = z.object({ primes: z.array(z.number()) });
const client = new Anthropic();

const message = await client.messages.parse({
  model: 'claude-sonnet-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What are the first 3 prime numbers?' }],
  output_config: { format: zodOutputFormat(NumbersResponse) },
});
```
`client.messages.create()` mit `output_config.format` funktioniert ebenfalls (parst dann aber nicht clientseitig).

**Ergebnisfeld**: `message.parsed_output` — bestätigt sowohl in helpers.md-Beispiel als auch in der Docs-Zusammenfassung.

URL: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md und https://platform.claude.com/docs/en/build-with-claude/structured-outputs

**Zod-Version**: In `package.json` des SDK steht als `peerDependencies`-Eintrag `"zod": "^3.25.0 || ^4.0.0"` — zod 4 (euer `zod@^4.5.4`) ist damit formal unterstützt. Achtung, nicht primär verifizierbar aus der Docs-Prosa selbst, nur aus dem Manifest; ein offen gemeldetes GitHub-Issue (`vercel/ai#14342`, nicht Anthropic-eigenes Repo, daher nur als Warnsignal, nicht als Beleg zu werten) beschreibt Inkompatibilitäten bestimmter JSON-Schema-Keywords bei zod-4-Schemas. Für euren Fall (keine `minLength`/`min`/etc., siehe unten) sollte das nicht greifen — testet es aber im Eval, bevor ihr euch darauf verlasst.
URL: https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/package.json

**Abgelehnte/transformierte JSON-Schema-Konstrukte**: Laut Docs-Zusammenfassung (Helper-Verhalten, nicht wörtlich als API-Fehlerliste zitierbar aus meinem Fetch) werden `minLength`/`maxLength`, `minimum`/`maximum`/`multipleOf` sowie die meisten `minItems`/`maxItems`-Werte automatisch entfernt/in die Beschreibung verschoben statt einen Fehler zu werfen; `additionalProperties` muss `false` sein (alles andere → Fehler); rekursive Schemas und externe `$ref` sind **nicht unterstützt** und führen zu 400; `enum` mit primitiven Werten ist unterstützt, komplexe Typen darin nicht; `z.optional()` wird auf "nicht required" gemappt und ist unterstützt. Das deckt sich mit eurer Projektregel "Structured-output schemas carry no length or count constraints; enforce those in code" — die Regel ist also korrekt begründet, denn selbst wenn die Constraints nicht hart abgelehnt würden, würden sie stillschweigend entfernt.
Diese Details konnte ich nicht wörtlich aus der Docs-Seite zitieren (mein Fetch lieferte nur eine paraphrasierte Zusammenfassung, keine wörtliche Passage) — **nicht verifiziert im Wortlaut**, nur als Werkzeug-Zusammenfassung der Seite https://platform.claude.com/docs/en/build-with-claude/structured-outputs. Wenn das für eure Implementierung entscheidend ist, lohnt ein zweiter, gezielter Fetch mit Zitatpflicht auf den Abschnitt "Supported schema features"/"Unsupported" (nicht in meinem aktuellen Fetch-Ausschnitt enthalten).

**Validierungsfehler / Retry**: Docs-Zitat: "Structured outputs guarantee schema-compliant responses through constrained decoding: Always valid ... Reliable: No retries needed for schema violations." Es gibt laut Doku also **keinen Retry-Mechanismus**, weil constrained decoding das Modell zur Laufzeit auf gültige Tokens beschränkt — ein Validierungsfehler im eigentlichen Sinn (Schema-Verstoß) soll dadurch praktisch nicht auftreten. Was bei anderen Fehlern (z. B. `max_tokens` erreicht, bevor das JSON komplett ist) passiert, steht in meinem Fetch nicht — **nicht verifiziert**.

**Citations + Structured Outputs**: Bestätigt, wörtliches Zitat von der Citations-Seite:
> "Citations and structured outputs are incompatible. Citations cannot be used together with structured outputs. If you enable citations on any user-provided document (`document` blocks or `search_result` blocks) and also include the `output_config.format` parameter (or the deprecated `output_format` parameter), the API returns a 400 error."
> "This is because citations require interleaving citation blocks with text output, which is incompatible with the strict JSON schema constraints of structured outputs."

Die genaue Fehlermeldung (Wortlaut des 400-Response-Bodys) ist auf dieser Seite nicht angegeben — **nicht verifiziert**.

URL: https://platform.claude.com/docs/en/build-with-claude/citations (Abschnitt "Citations and structured outputs are incompatible")

## Für euren Code

- `config/prices.ts`: Tabelle oben direkt übernehmbar; Sonnet-5-Preis ist jetzt dauerhaft $2/$10, kein Übergangspreis mehr — falls in `prices.ts` ein Kommentar zu "introductory pricing" steht, entfernen.
- Die 400-Kombination Citations+Structured-Outputs ist primärquellenseitig bestätigt, eure ADR-Trennung `buildChatRequest` (Citations) vs. `buildArtifactRequest` (JSON) ist korrekt begründet.
- Die Regel "keine Length/Count-Constraints in Structured-Output-Schemas, das in Code prüfen" ist ebenfalls durch das (paraphrasierte, nicht wörtlich zitierte) SDK-Verhalten gedeckt — empfehle einen zweiten, gezielten Doku-Check vor einer harten Entscheidung, falls das für M6-Reports sicherheitskritisch wird.
- zod 4-Support ist laut SDK-`package.json` gegeben; keine Gegenbelege in offizieller Anthropic-Doku gefunden, nur ein Community-Issue in einem fremden Repo als Warnsignal.

