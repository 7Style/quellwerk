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

Der Dev-Split des Golden Sets, zwanzig Items aus
[`backend/evals/golden.jsonl`](backend/evals/golden.jsonl), beantwortet über die
echte Route mit `claude-opus-5`. Die vollen Blöcke mit Deltas stehen in
[backend/evals/RESULTS.md](backend/evals/RESULTS.md).

| Metrik | Wert | Wie sie zustande kommt |
|---|---|---|
| Beleggüte | 100,0 % (97/97) | `source.text.slice(start, end) === cited_text`, kein Richter, kein Ermessen |
| Abstinenz | 100,0 % (5/5) | fünf Fragen, die der Korpus nicht beantwortet, fünf Ablehnungen |
| Korrektheit | 100,0 % | Richter `claude-sonnet-5`, ein anderes Modell als das geprüfte (ADR-0011) |
| Treue | 1,00 | derselbe Richter, je Behauptung geprüft, Ablehnungen ausgenommen |

Dazu zwei Zahlen, die null sein müssen und null sind: keine falsche Ablehnung
bei fünfzehn beantwortbaren Items, kein Beleg an einer Ablehnung.

Die zehn Held-out-Items sind bis zum Abschlusslauf ungemessen. Ein
Held-out-Split, der jeden Tag gemessen wird, ist ein Dev-Split mit
Zusatzschritten.

### Was ein Notizbuch kostet

Gemessen an vier echten Aufrufen über dieselben vier Quellen, aus denen das
Demo-Notizbuch besteht (`pnpm eval --cache-check`, Tabelle in RESULTS.md),
gerechnet mit den Preisen aus `backend/app/config/prices.ts`:

| Aufruf | Neue Eingabe | Aus dem Cache | Eingabe kostet |
|---|---|---|---|
| erste Frage einer Stunde | 21 Token | schreibt 76.239 | 0,76 $ |
| jede weitere Frage | 23 Token | liest 76.239 | 0,04 $ |
| Frage nach "Configure chat" | 42 Token | liest 76.239 | 0,04 $ |
| ein Report | 601 Token | liest 76.239 | 0,04 $ |

Der gecachte Präfix ist größer als die Summe der Quellen (63.431 Token), weil
der Systemblock und die Rahmen der Dokumentblöcke mitzählen.

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
- **Das Demo-Notizbuch wird nur gelesen.** Es gehört keiner Session, also würde
  ein Schreibzugriff darin die Arbeit von Fremden verändern.
- **Kein Gedächtnis im Demo-Notizbuch.** Aus demselben Grund: ein gespeicherter
  Verlauf wäre der Verlauf von Fremden, und die Frage von A stünde im Prompt
  von B.

## Stand

Was fertig ist, steht als abgehakte Aufgabe in
[docs/PLAN.md](docs/PLAN.md); dort steht auch, was ein Meilenstein jeweils
beweisen musste, und was offen ist, steht als offene Box.

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

Privates Bewerbungsprojekt, keine Lizenz zur Weiterverwendung.
