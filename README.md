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

## Stand

Im Aufbau. Was fertig ist, steht als abgehakte Aufgabe in
[docs/PLAN.md](docs/PLAN.md); dort steht auch, was ein Meilenstein jeweils
beweisen musste.

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

Dieses Projekt ist mit einem Coding-Agenten gebaut. Was das genau hieß, welche
Prompts benutzt wurden und was ich verworfen habe, steht in
[docs/ai-process/](docs/ai-process/).

## Lizenz

Privates Bewerbungsprojekt, keine Lizenz zur Weiterverwendung.
