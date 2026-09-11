# Herkunft: was aus der Vorlage stammt

Das Repository beginnt nicht bei null. Der erste Commit ist meine Vorlage
[7Style/bp-monolith](https://github.com/7Style/bp-monolith) im Stand
`chore/upgrade-2026-09` (`acef9f34`). Dieses Dokument trennt, was von dort kommt,
was M0 entfernt hat und was für Quellwerk neu ist, damit ein Reviewer nicht raten
muss, welche Arbeit zu welchem Projekt gehört.

## Übernommen und behalten

Das Gerüst, das ein Monolith ohnehin braucht und das nichts mit dem Fachthema zu
tun hat:

- pnpm-Workspace mit `backend/`, `frontend/`, `e2e/`, Catalog und Versionssperren
- Express 5 mit Helmet, CORS-Allowlist, Compression, morgan ohne Query-Strings
- Prisma 7 auf dem pg-Adapter, Client-Singleton, Migrationen, Seed-Einstiegspunkt
- winston-Logger mit Maskierung von `authorization`, `cookie`, `password`, `token`
- `express-rate-limit` mit Redis-Store
- Zentrale Env-Validierung mit zod: `env.config.ts` ist die einzige Stelle, die
  `process.env` liest
- Next.js 16 mit App Router, Redux Toolkit mit RTK Query, Tailwind 4, shadcn/ui
- Docker: mehrstufige Images, Non-Root-Benutzer, Healthchecks, Compose für lokal
  und Produktion, `.dockerignore` als einzige Ignore-Datei
- CI mit typecheck, lint, test, Build, gitleaks und `scripts/security-check.sh`
- Husky-Hooks vor Commit und Push
- `SECURITY.md`: Serverhärtung, Docker-Regeln, Firewall, Deploy-Checkliste

## Von M0 entfernt

Die Vorlage bringt ein vollständiges Kontosystem mit. Quellwerk läuft anonym
(ADR-0005), also ist es heraus statt ungenutzt mitzulaufen; ungenutzter
Auth-Code ist Angriffsfläche ohne Gegenwert.

- Module `auth`, `users`, `audit`, `audit-logs`, `upload`
- Adapter `auth-email`, `user-email`, der gesamte E-Mail-Service mit SMTP und Brevo
- Middleware für Authentifizierung, Autorisierung, Rollen und Berechtigungen
- `password.util`, `random-password.util`, `crypto.util` (verschlüsselte 2FA-Geheimnisse)
- Prisma-Modelle für Benutzer, Rollen, Berechtigungen, Sessions, 2FA, Audit-Logs
- Frontend-Module `auth` und `users`, Routen `/login`, `/dashboard`, `/users`
- Auth-Specs, Page-Objects und Fixtures in `e2e/`
- Die Umgebungsvariablen `JWT_*`, `ENCRYPTION_KEY`, `BCRYPT_SALT_ROUNDS`,
  `EMAIL_*`, `SMTP_*`, `BREVO_*`, `SEED_ADMIN_*`, `SEED_DEMO_*`

In Zahlen: rund 20.000 Zeilen gelöscht, der Lint fiel dabei von 503 Problemen auf
15 Warnungen.

## Für Quellwerk neu

Alles, was das Produkt ausmacht:

- Datenmodell aus sechs Tabellen (`docs/ARCHITECTURE.md`), Zitate als geprüfte
  `segments` an der Zeile, die sie zeigt
- Adapter `ILlmProvider` mit `AnthropicLlmAdapter`, `IFileStorage`, `ITtsProvider`
- Services `prompt-loader`, `usage-log`, `queue`, `quota`
- Worker-Prozess mit vier Warteschlangen
- Module `session`, `notebooks`, `sources`, `chat`, `studio`, `notes`, `admin`
- `prompts/` mit dem Vertrag in `prompts/README.md`: jeder Text, der an ein Modell
  geht, liegt dort und wird zur Laufzeit geladen
- `backend/evals/` mit Golden-Set, Runner und Judges
- `design/`: statischer Prototyp der Oberfläche als Referenz
- Die Dokumente `SPEC`, `ARCHITECTURE`, `PLAN` und zwölf ADRs
- Der Harness: `CLAUDE.md`, Hooks gegen Secrets und unveränderliche ADRs, Skills
  für `/plan-step`, `/verify`, `/eval`, `/adr`, `/prompt-log`, und die
  Modulgrenzen als ESLint-Regel statt als Konvention

## Warum überhaupt eine Vorlage

Drei Tage reichen nicht, um Express, Prisma, Docker, CI und Härtung neu
aufzusetzen und dabei ein Produkt zu bauen. Die Vorlage ist die Antwort auf die
Frage, was ich nicht in diesem Projekt entschieden habe. Was ich hier entschieden
habe, steht in `docs/adr/`.
