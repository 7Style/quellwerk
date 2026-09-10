# quellwerk

Fullstack-Boilerplate als pnpm-Workspace: Express-5-API mit Prisma 7 auf
PostgreSQL 17, Next.js-16-Frontend, Redis 8 als Store für Rate-Limits.
Authentifizierung mit JWT, Rollen und Berechtigungen, TOTP-2FA, Audit-Log,
Datei-Upload.

## Dienste und Ports

| Dienst | Port | Beschreibung |
|---|---|---|
| Frontend | http://localhost:3010 | Next.js 16 (Container-Port 3000) |
| Backend | http://localhost:3011 | Express 5, `/health`, `/api/...` |
| PostgreSQL | 127.0.0.1:5432 | `postgres:17-alpine` |
| Redis | 127.0.0.1:6379 | `redis:8-alpine`, Rate-Limit-Store |

Alle Host-Ports sind nur auf 127.0.0.1 gebunden.

## Voraussetzungen

- Node 24 über nvm (`nvm install 24 && nvm use`, Version steht in `.nvmrc`)
- pnpm 11.26.0: `npm i -g pnpm@11.26.0` (kein Corepack)
- Docker mit Compose v2

## Schnellstart

```bash
# 1. Variablen
cp example.env .env                     # Compose: POSTGRES_*, REDIS_PASSWORD, APP_NAME, NEXT_PUBLIC_API_URL
cp backend/example.env backend/.env     # Backend: JWT_*, ENCRYPTION_KEY, CORS_ORIGIN, SMTP_*, ...
openssl rand -hex 24                    # POSTGRES_PASSWORD und REDIS_PASSWORD (.env)
openssl rand -hex 32                    # JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY (backend/.env)

# 2. Abhängigkeiten (pnpm install erzeugt den Prisma-Client über postinstall)
pnpm install

# 3. Datenbank und Redis im Container
docker compose up -d db redis

# 4. Schema und erster Admin
pnpm --filter @quellwerk/backend exec prisma migrate deploy
SEED_ADMIN_PASSWORD='...' pnpm --filter @quellwerk/backend run prisma:seed

# 5. Entwicklung auf dem Host (zwei Terminals)
pnpm --filter @quellwerk/backend run dev
pnpm --filter @quellwerk/frontend run dev -p 3010
```

`pnpm install` erzeugt den Prisma-Client (`backend/app/generated`, gitignored)
über das `postinstall`-Skript des Backends; nach einer Schema-Änderung
`pnpm --filter @quellwerk/backend run prisma:generate` (läuft auch im
Pre-Commit-Hook). Für die Arbeit auf dem Host müssen `DATABASE_URL` und `REDIS_URL` in
`backend/.env` auf `localhost` zeigen und dieselben Passwörter wie `.env`
enthalten. Der Seed legt den Admin mit dem Passwort aus `SEED_ADMIN_PASSWORD`
an; es gibt keine eingebauten Zugangsdaten mehr. Demo-Konten
(`moderator@`, `user@`, `inactive@` mit der Domain des Admins) entstehen nur
mit `SEED_DEMO_USERS=true` und `SEED_DEMO_PASSWORD`.

Kompletter Stack in Containern (Produktions-Images, gleiche `.env`; Seed im
Container mit `SEED_ON_START=true` und `SEED_ADMIN_PASSWORD` in der Root-`.env`):

```bash
pnpm dev                                # = docker compose up -d --build
curl -s http://localhost:3011/health    # {"status":"healthy","database":"connected","redis":"connected",...}
```

Prisma Studio läuft auf dem Host, nicht im Container:

```bash
pnpm --filter @quellwerk/backend exec prisma studio
```

## Skripte

Root (`pnpm <script>`, laufen über `pnpm -r` in allen Paketen):

| Skript | Was |
|---|---|
| `pnpm dev` | `docker compose up -d --build` |
| `pnpm typecheck` | `tsc --noEmit` in Backend, Frontend, e2e |
| `pnpm lint` | ESLint in Backend und Frontend (e2e hat kein `lint`-Skript) |
| `pnpm test` | Jest (Backend); e2e ist ausgenommen, siehe unten |
| `pnpm build` | Backend `prisma generate && tsc`, Frontend `next build` |
| `pnpm verify` | typecheck + lint + test |
| `pnpm format` | Prettier |

Paket-Skripte (`pnpm --filter <paket> run <script>`), Pakete
`@quellwerk/backend`, `@quellwerk/frontend`, `@quellwerk/e2e`:

| Skript | Paket | Was |
|---|---|---|
| `dev` | backend | `tsx watch app/server.ts` |
| `dev` | frontend | `next dev` |
| `prisma:generate` | backend | Client erzeugen |
| `prisma:migrate:dev` | backend | Migration anlegen (Entwicklung) |
| `prisma:migrate:deploy` | backend | Migrationen einspielen |
| `prisma:seed` | backend | Seed, braucht `SEED_ADMIN_PASSWORD`, verweigert in `production` |
| `test` | e2e | Playwright gegen `BASE_URL` (Default http://localhost:3010), Zugangsdaten aus `e2e/.env` (Vorlage `e2e/.env.example`); Ablauf unter [e2e-Tests](#e2e-tests-playwright) |

## Projektstruktur

```
.
├── backend/                 Express 5, Prisma 7, Jest 30
│   ├── app/                 server.ts, app.ts, config/, common/, modules/, services/, lib/
│   ├── prisma/              schema.prisma, migrations/, seed.ts, seeds/
│   ├── Dockerfile           Multi-Stage, Build-Kontext Repo-Root
│   └── docker-entrypoint.sh prisma migrate deploy, Seed nur mit SEED_ON_START=true
├── frontend/                Next.js 16, React 19, Redux Toolkit, Tailwind 4
│   ├── src/                 app/, components/ui/, modules/, store/, lib/
│   └── Dockerfile           Standalone-Output, Build-Arg NEXT_PUBLIC_API_URL
├── e2e/                     Playwright: tests/auth, pages/ (Page Objects), fixtures/, utils/
├── deployment/              Compose-Dateien für local, dev, prod, prod-native; Nginx-Image
├── docs/                    Architektur, Regeln, Upgrade-Log
├── scripts/security-check.sh
├── .github/workflows/       ci.yml (verify, security-check, gitleaks, e2e), pr-preview.yml
├── docker-compose.yml       Stack im Root, Ports auf 127.0.0.1
├── pnpm-workspace.yaml      Pakete, Catalog, allowBuilds
└── example.env              Vorlage für .env (Compose-Variablen)
```

## e2e-Tests (Playwright)

Die Specs in `e2e/tests/auth` laufen gegen einen laufenden Stack, dessen Seed
die Demo-Konten angelegt hat (`SEED_DEMO_USERS=true`, `SEED_DEMO_PASSWORD`).
Gegen den Compose-Stack im Root:

```bash
# Root-.env: SEED_ON_START=true, SEED_ADMIN_PASSWORD, SEED_DEMO_USERS=true, SEED_DEMO_PASSWORD
pnpm dev                                                        # docker compose up -d --build
cp e2e/.env.example e2e/.env                                    # BASE_URL, SEED_* wie in .env
pnpm --filter @quellwerk/e2e exec playwright install chromium
pnpm --filter @quellwerk/e2e exec playwright test --project=chromium
pnpm --filter @quellwerk/e2e run report                        # HTML-Report
```

Die Locators sind `data-testid`-Attribute der Seiten (`login-*`,
`password-toggle`, `dashboard-*`), gekapselt in `e2e/pages/*.page.ts`; keine
CSS-Klassen (`docs/rules/FRONTEND-RULES.md`).

Rate-Limit: das Backend zählt fehlgeschlagene Logins je IP
(`RATE_LIMIT_LOGIN_MAX`, Default 5 in `RATE_LIMIT_WINDOW_MS` = 15 Minuten;
erfolgreiche Logins zählen nicht). Die Suite läuft deshalb mit einem Worker
und seriell, und jede Spec-Datei sendet höchstens 4 Fehlversuche. Für
wiederholte Läufe innerhalb des Fensters in `backend/.env`
`RATE_LIMIT_LOGIN_MAX=100` setzen oder die IP des Test-Clients in
`RATE_LIMIT_TRUSTED_IPS` eintragen (im Compose-Stack die Gateway-Adresse des
internen Netzes), danach das Backend neu starten. CI setzt für den Stack unter
Test `RATE_LIMIT_LOGIN_MAX=100`, weil ein Playwright-Retry die serielle Gruppe
komplett wiederholt.

## Deployment

Vier Compose-Varianten (`deployment/{local,dev,prod,prod-native}`) und der
Root-Stack, alle mit Build-Kontext Repo-Root, Passwörtern ohne Defaults und
Healthchecks. Aufruf, Variablen-Aufteilung und Seed-Ablauf in
[deployment/README.md](deployment/README.md).

## CI

`.github/workflows/ci.yml` läuft bei Push und Pull Request und wird von
`pr-preview.yml` als Reusable Workflow aufgerufen:

| Job | Was |
|---|---|
| `verify` | `pnpm install --frozen-lockfile`, Prisma generate, typecheck, lint, `prisma migrate deploy` gegen Postgres 17 und Redis 8, Jest, build |
| `security-check` | `bash scripts/security-check.sh` |
| `gitleaks` | Secret-Scan der Historie (`gitleaks/gitleaks-action@v2`) |
| `e2e` | nach `verify`: Root-Compose-Stack mit pro Lauf erzeugten `.env`/`backend/.env`, Seed mit Demo-Konten, Playwright (chromium); Report und Traces als Artefakt bei Fehlern, `docker compose down -v` immer |

GitHub-Secrets (Repository-Einstellungen):

- `PREVIEW_WEBHOOK_TOKEN`: Token für den 7Style Preview Manager (`pr-preview.yml`); ohne ihn bricht der Preview-Job ab.
- `GITLEAKS_LICENSE`: nur für Repositories einer Organisation (dort verlangt gitleaks-action eine Lizenz); bei persönlichen Repositories weglassen.

## Sicherheit

Kurzfassung, Details in [SECURITY.md](SECURITY.md):

- Ports nur auf 127.0.0.1, Redis und Postgres nur mit Passwort, nie den Docker-Socket mounten.
- Keine Secret-Fallbacks im Code; ohne `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (je 32+ Zeichen, `env.config.ts`) startet das Backend nicht. `SESSION_SECRET` ist optional und wird von der JWT-Auth nicht gelesen (Platzhalter für einen späteren Session-Store; wenn gesetzt, ebenfalls 32+ Zeichen).
- Rate-Limits in Redis, Uploads mit Magic-Byte-Prüfung, Access-Token 15 Minuten, Refresh-Token 7 Tage.
- `bash scripts/security-check.sh` vor jedem Deploy; läuft auch im Pre-Commit-Hook und in CI.
- Die Secrets aus Commit `326febbb` sind kompromittiert und dürfen nicht wiederverwendet werden.

## Upgrade-Log

Versionsmatrix, entfernte Pakete, Arbeitspakete und bewusste Auslassungen:
[docs/UPGRADE-2026-09.md](docs/UPGRADE-2026-09.md).

## Lizenz

MIT
