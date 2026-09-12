# Quellwerk

Ein NotebookLM-Klon, der Fragen ausschließlich aus Dokumenten beantwortet, die
man selbst hinzugefügt hat. Jeder Satz einer Antwort trägt die Passage, aus der
er stammt, und jedes Zitat wird serverseitig gegen den gespeicherten Quelltext
geprüft, bevor es angezeigt wird: `source.text.slice(start, end) === cited_text`.
Was diese Prüfung nicht besteht, wird verworfen und gezählt, nie gerendert.

Das ist der einzige Anspruch, an dem sich das Projekt messen lässt. Umfang,
Grenzen und Schwellen stehen in [docs/SPEC.md](docs/SPEC.md), der Aufbau in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), die Entscheidungen mit ihren
verworfenen Alternativen in [docs/adr/](docs/adr/), der Ausführungsplan in
[docs/PLAN.md](docs/PLAN.md).

Alles läuft auf einem eigenen Server. Der einzige Aufruf nach außen ist die
Modellinferenz bei Anthropic, hinter `AnthropicLlmAdapter` (ADR-0004, ADR-0006).

**Live: <https://quellwerk.7style.net>** — das Demo-Notizbuch steht auf der
Startseite und ist ohne Anmeldung lesbar, direkt unter
<https://quellwerk.7style.net/n/demo>. Fragen stellen geht dort, Quellen
hinzufügen nicht; ein eigenes Notizbuch legt man mit einem Klick an, ohne
Konto.

## Was gemessen ist

Der Abschlusslauf über das ganze Golden Set, dreißig Items aus
[`backend/evals/golden.jsonl`](backend/evals/golden.jsonl), beantwortet über die
echte Route mit `claude-opus-5`. Die zehn Held-out-Items sind darin einmal
gemessen, zum ersten und einzigen Mal. Die vollen Blöcke mit Deltas stehen in
[backend/evals/RESULTS.md](backend/evals/RESULTS.md).

| Metrik | Wert | Schwelle | Wie sie zustande kommt |
|---|---|---|---|
| Beleggüte | 100,0 % (146/146) | 100 % | `source.text.slice(start, end) === cited_text`, kein Richter, kein Ermessen |
| Abstinenz | 85,7 % (6/7) | 100 % | Fragen, die der Korpus nicht beantwortet, programmatisch am wörtlichen Satzanfang |
| Korrektheit | 100,0 % | ≥ 85 % | Richter `claude-sonnet-5`, ein anderes Modell als das geprüfte (ADR-0011) |
| Treue | 1,00 | ≥ 0,90 | derselbe Richter, je Behauptung geprüft, Ablehnungen ausgenommen |

Dazu zwei Zahlen, die null sein müssen und null sind: keine falsche Ablehnung
bei dreiundzwanzig beantwortbaren Items, kein Beleg an einer Ablehnung.

**Die Abstinenz liegt unter ihrer Schwelle, und das ist die interessanteste Zahl
im Repository.** Ein Held-out-Item, `g30`, fragt nach harmonisierten Normen zu
Artikel 15: der Artikel steht im Korpus, die Normen nicht. Das Modell hat nicht
erfunden, sondern geantwortet, es sei keine genannt, und danach mit fünf
geprüften Belegen erzählt, was die Quellen über die laufende Normungsarbeit
sagen. Nur hat es den wörtlichen Ablehnungssatz nicht benutzt, auf dem die
Messung besteht. Was gebrochen ist, ist die Regel, nicht die Erdung -- und ob
die Regel oder die Messung falsch ist, ist eine Produktentscheidung. Getroffen
wird sie nicht gegen diese Zahl: ein Held-out-Split, gegen den man tunt, ist ein
Dev-Split mit Zusatzschritten. Die Begründung und die Reihenfolge stehen in
RESULTS.md.

### Am laufenden Server gemessen

Eine Frage über das Demo-Notizbuch auf <https://quellwerk.7style.net>, von Hand
gemessen, nicht geschätzt:

> Was zählt laut Anhang III im Bereich Beschäftigung als Hochrisiko-System?

| | |
|---|---|
| Erste Token beim Leser | nach 2,3 s |
| Ereignisse im Stream | 118, verteilt über 11,4 s |
| Geprüfte Zitate in der Antwort | 4 |

Die mittlere Zeile ist die, auf die es ankommt. Kämen die 118 Ereignisse als ein
Klumpen am Ende an, sammelt etwas zwischen dem Backend und dem Browser. Zwei
Stellen tun das, wenn man sie lässt: `proxy_buffering` und gzip. Deshalb stehen
im Vhost `proxy_buffering off` und `gzip off`, schickt das Backend zusätzlich
`X-Accel-Buffering: no` und nimmt `text/event-stream` aus seiner eigenen
Kompression heraus — vier Zeilen an zwei Orten für eine Eigenschaft, die man nur
am laufenden Server sieht. Eine Antwort, die fertig geschrieben ist, bevor das
erste Wort erscheint, fühlt sich langsamer an als eine, die tippt.

Ein Lauf, von Hand, auf der Produktions-URL. Das Skript, das daraus einen
wiederholbaren Rauchtest macht, ist M8-T4 und offen.

### Was ein Notizbuch kostet

Gemessen an vier echten Aufrufen über dieselben vier Quellen, aus denen das
Demo-Notizbuch besteht (`pnpm eval --cache-check`, Tabelle in RESULTS.md),
gerechnet mit den Preisen aus `backend/app/config/prices.ts`:

| Aufruf | Neue Eingabe | Aus dem Cache | Eingabe kostet |
|---|---|---|---|
| erste Frage einer Stunde | 21 Token | schreibt 76.239 | 0,76 $ |
| jede weitere Frage | 23 Token | liest 76.239 | 0,04 $ |
| Frage mit Stil- und Längenvorgabe | 42 Token | liest 76.239 | 0,04 $ |
| ein Report | 601 Token | liest 76.239 | 0,04 $ |

Der gecachte Präfix ist größer als die Summe der Quellen (63.431 Token), weil
der Systemblock und die Rahmen der Dokumentblöcke mitzählen.

Die dritte Zeile prüft eine Regel, nicht eine Funktion: Stil und Länge gehen in
den letzten Benutzerturn, hinter den Cache-Punkt, und nicht in den Systemblock
davor. Der Dialog, mit dem ein Leser sie setzt, ist offen (M5-T2) -- der Weg,
den die Werte nehmen, steht und ist gemessen.

Die Spalte ist die Eingabeseite; die Ausgabe kommt mit 25 $ je Million Token
dazu und ist das, was sich zwischen einer Antwort und einem Report
unterscheidet: gemessen 124 Token für eine Antwort, 5.744 für einen Briefing
Doc. Der eine Report, den ich ganz gemessen habe, kostete 0,91 $, weil er den
Cache selbst geschrieben hat; der nächste über dieselben Quellen kostet ein
Zehntel davon.

Das ist der ganze Grund für ADR-0002: die Dokumente werden einmal je Stunde
bezahlt und nicht einmal je Frage. Ein Durchschnitt je Antwort steht erst nach
dem Abschlusslauf hier, weil er dann gemessen ist.

## Was bewusst fehlt

Jede Zeile ist eine Entscheidung, nicht eine Lücke, die noch keiner gesehen hat.
Die Langfassung steht in [docs/KNOWN-LIMITS.md](docs/KNOWN-LIMITS.md).

- **Keine Website-Quellen.** Ein Dienst, der eine vom Nutzer gewählte URL
  abruft, ist eine serverseitige Anfrageschleuse, und ein Fehler darin trifft
  nicht Quellwerk, sondern die neun anderen Seiten auf derselben Maschine.
- **Kein Vektorindex, kein Retrieval.** Die Dokumente gehen ganz in den Prompt
  und werden gecacht; bis 150.000 Token je Notizbuch ist das genauer und
  billiger als eine Ähnlichkeitssuche, deren Fehler niemand sieht (ADR-0002).
  Was oberhalb dieser Kante zu tun wäre, ist entworfen und nicht gebaut
  (ADR-0012).
- **Keine Audio Overview, keine Mind Map.** Beides ist in NotebookLM
  beeindruckend, und die Tage dafür sind in die Belege gegangen: geprüfte
  Zitate, Evals mit Richtern, der Cache-Beweis oben.
- **Keine Auswahl einzelner Quellen.** Jede Frage geht über alle Quellen des
  Notizbuchs: ein wechselnder Teil der Dokumente wäre ein anderer Cache-Präfix
  und damit voller Preis bei jeder Umschaltung.
- **Keine Konten.** Ein Notizbuch hängt an einer anonymen Session im Cookie; ein
  Login vor der ersten Frage hätte die Demo teurer gemacht als das Produkt
  (ADR-0005).
- **Kein Gedächtnis im Demo-Notizbuch.** Es gehört keiner Session, ein
  gespeicherter Verlauf wäre also der Verlauf von Fremden, und die Frage von A
  stünde im Prompt von B. Wer eine Quelle hinzufügt oder einen Report bestellt,
  bekommt eine Kopie in der eigenen Sitzung und darin einen Verlauf
  (Copy-on-first-write); eine Frage allein löst das nicht aus.

## Stand

Was fertig ist, steht als abgehakte Aufgabe in
[docs/PLAN.md](docs/PLAN.md); dort steht auch, was ein Meilenstein jeweils
beweisen musste, und was offen ist, steht als offene Box.

Jede offene Box hat eine Zeile am Ende von
[docs/KNOWN-LIMITS.md](docs/KNOWN-LIMITS.md), die sagt, warum sie offen ist.
Dreizehn davon sind es am Ende des dritten Tages, und die Liste ist der Teil der
Dokumentation, den ich zuletzt geschrieben habe: sie ist leichter zu schreiben,
solange der Grund noch stimmt.

## Dienste und Ports

| Dienst | Port (nur 127.0.0.1) | Zweck |
|---|---|---|
| frontend | 3010 | Next.js |
| backend | 3011 | Express, API und SSE |
| worker | kein Port | BullMQ: Ingestion, Reports, Audio, Aufräumen |
| db | 5432 | PostgreSQL 17 |
| redis | 6379 | Warteschlangen und Sessions |

## Voraussetzungen

Node 24 (siehe `.nvmrc`), pnpm 11, Docker mit Compose.

## Schnellstart

Zwei Konfigurationsdateien werden von Hand geschrieben, nie von einem Werkzeug.
Beide haben eine Vorlage im Repository:

```bash
cp example.env .env                  # Compose: Datenbank- und Redis-Passwörter
cp backend/example.env backend/.env  # Anwendung: Secrets, Modelle, Grenzen
```

Danach in beiden Dateien die leeren Pflichtwerte füllen:

| Datei | Wert | Erzeugen mit |
|---|---|---|
| `.env` | `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `.env` | `REDIS_PASSWORD` | `openssl rand -hex 24` |
| `backend/.env` | `SESSION_SECRET` (32+ Zeichen) | `openssl rand -hex 32` |
| `backend/.env` | `ADMIN_TOKEN` (16+ Zeichen) | `openssl rand -hex 16` |
| `backend/.env` | `ANTHROPIC_API_KEY` | Konsole von Anthropic |

Ohne diese Werte startet das Backend nicht. Das ist Absicht: eine Demo, die mit
einem fehlenden Secret läuft, läuft auch mit einem falschen.

```bash
pnpm install     # postinstall erzeugt den Prisma-Client
pnpm dev         # docker compose up -d --build, alle fünf Dienste
```

Danach liegt das Frontend auf <http://localhost:3010>, die API auf
<http://localhost:3011>. Belegt ein anderes Projekt diese Ports, gehört die
Abweichung in eine lokale `docker-compose.override.yml`; die Datei ist
absichtlich nicht im Repository.

## Befehle

| Befehl | Was er tut |
|---|---|
| `pnpm dev` | Stack bauen und starten |
| `pnpm typecheck` | tsc über alle drei Pakete |
| `pnpm lint` | ESLint, inklusive der erzwungenen Modulgrenzen |
| `pnpm test` | Jest im Backend, nie im Watch-Modus |
| `pnpm verify` | typecheck, lint, test |
| `pnpm db:migrate` | `prisma migrate deploy` |
| `pnpm db:seed` | Seed; das Demo-Notizbuch kommt in M2-T5 |
| `pnpm eval --smoke \| --dev \| --full` | Eval-Harness; kommt in M1 |

## Projektstruktur

```text
backend/app/
  modules/<name>/     ein Modul je Fachthema, Module importieren einander nie
  adapters/           llm, storage, tts hinter Interfaces
  services/           prompt-loader, usage-log, queue, quota
  worker.ts           BullMQ-Prozess
backend/prisma/       Schema und Migrationen
backend/evals/        Golden-Set, Runner, Judges (ab M1)
frontend/src/modules/ shell, notebooks, sources, chat, studio
prompts/              jeder Text, der an ein Modell geht
design/               statischer Prototyp, Referenz für Aussehen und Verhalten
docs/                 SPEC, ARCHITECTURE, PLAN, ADRs, AI-Prozess
```

Die Modulgrenzen sind keine Konvention, sondern eine Lint-Regel: ein Modul
erreicht seinen eigenen Teilbaum und sonst nichts unter `modules/`; was es von
einem anderen braucht, wird in `modules/index.ts` injiziert.

## Sicherheit

Die Regeln, gegen die gebaut wird, stehen in [SECURITY.md](SECURITY.md),
Abschnitt 7. Kurz: anonyme Sessions ohne Konten, jede Abfrage auf die Session
begrenzt, Rate-Limits und ein Tagesbudget, Upload- und URL-Prüfung gegen SSRF,
Löschung nach sieben Tagen, keine Quelltexte in Logs.

`bash scripts/security-check.sh` prüft vor jedem Commit und in CI auf getrackte
Konfigurationsdateien, offene Ports, fehlende Passwörter und Secret-Fallbacks.

## Herkunft

Das Repository beginnt mit meiner Vorlage
[7Style/bp-monolith](https://github.com/7Style/bp-monolith); M0 entfernt daraus
alles Kontobasierte. Was von der Vorlage stammt und was neu ist, steht in
[docs/TEMPLATE.md](docs/TEMPLATE.md).

## KI im Prozess

Dieses Projekt ist mit einem Coding-Agenten gebaut, und das Harness dafür ist
Teil der Abgabe: [CLAUDE.md](CLAUDE.md), die Hooks und Skills unter
[.claude/](.claude/), der Reviewer-Agent, den ich am Ende jedes Meilensteins auf
den Diff gesetzt habe. Was der Agent durfte und was nicht, ist damit lesbar und
nicht behauptet — `backend/evals/golden.jsonl` etwa darf er nicht schreiben, und
keine Konfigurationsdatei mit Secrets darf er lesen.

Die Erklärung nach ai-declaration.md, die vom Modell erzeugten Daten im
Repository und drei Fälle, in denen ich Ausgaben verworfen habe, stehen in
[docs/ai-process/AI-DECLARATION.md](docs/ai-process/AI-DECLARATION.md). Was
nachlesbar ist und was nicht, steht in
[docs/ai-process/TRANSCRIPTS.md](docs/ai-process/TRANSCRIPTS.md).

## Lizenz

MIT, siehe [LICENSE](LICENSE). Der Code darf benutzt werden; die vier
Korpusdateien unter `backend/evals/corpus/` sind fremde Inhalte (Rechtstext der
EU, eine Seite der Europäischen Kommission) und nicht meine, um sie zu
lizenzieren.
