# Frontend (`bp-monolith-frontend`)

Next.js 16 (App Router, Standalone-Output), React 19, Redux Toolkit mit
RTK Query, Tailwind 4, TypeScript 6. Paket des pnpm-Workspace im Repo-Root;
Regeln in `docs/rules/FRONTEND-RULES.md`.

## Entwicklung

```bash
pnpm install                                            # im Repo-Root
docker compose up -d db redis                           # Backend-Abhängigkeiten
pnpm --filter bp-monolith-backend run dev               # API auf http://localhost:3011
pnpm --filter bp-monolith-frontend run dev -p 3010      # http://localhost:3010
```

| Skript                   | Was                                                           |
| ------------------------ | ------------------------------------------------------------- |
| `dev`                    | `next dev`                                                    |
| `build`                  | `next build` (Standalone-Output in `.next/standalone`)        |
| `start`                  | `next start`                                                  |
| `typecheck`              | `tsc --noEmit`                                                |
| `lint`                   | `eslint .` (ESLint 9, siehe Kommentar in `eslint.config.mjs`) |
| `format`, `format:check` | Prettier mit `prettier-plugin-tailwindcss`                    |

Aufruf immer über `pnpm --filter bp-monolith-frontend run <skript>`.

## Umgebungsvariablen

Alle Variablen sind `NEXT_PUBLIC_*` und werden beim Build in das Bundle
eingebrannt. Lokal in `frontend/.env.local` (gitignored), im Docker-Image als
Build-Args (`frontend/Dockerfile`, `build.args` der Compose-Dateien); ein
Laufzeit-`environment` ändert nichts mehr.

| Variable                      | Bedeutung                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`         | Backend-Origin ohne `/api`-Suffix (`src/lib/api.ts`). Development: Fallback `http://localhost:3011`. Production: kein Fallback, ein fehlender Wert bedeutet gleicher Origin und wird einmal per `console.error` gemeldet. |
| `NEXT_PUBLIC_APP_NAME`        | Anzeigename (`src/lib/app.ts`: Metadata, Login- und Dashboard-Seite), Default `bp-monolith`                                                                                                                               |
| `NEXT_PUBLIC_APP_DESCRIPTION` | Beschreibung (Metadata), Default leer                                                                                                                                                                                     |

Keine Secrets in `NEXT_PUBLIC_*`: alles darin ist öffentlich.

## Wo was liegt

```
frontend/
├── src/app/                 Routen des App Routers (dünn: layout.tsx, page.tsx, login/, dashboard/, users/)
├── src/modules/<domain>/    Fachmodule (auth, users): components/, pages/, hooks/, services/ (RTK Query
│                            injectEndpoints), store/ (Slice), types/, index.ts als öffentliche API
├── src/components/ui/       Design-System (Button, Card, Input, Label; Radix-Primitives)
├── src/lib/api.ts           baseApi (RTK Query, Bearer-Token aus localStorage), src/lib/app.ts (APP_NAME), src/lib/utils.ts (cn)
├── src/store/               Store, typisierte Hooks, Provider
├── src/styles/global.css    Tailwind 4, CSS-Variablen für Farben, Abstände, Radien
├── public/                  statische Dateien (robots.txt), landet im Image
├── next.config.ts           output: 'standalone', outputFileTracingRoot/turbopack.root = Workspace-Root
└── Dockerfile               Multi-Stage, Build-Kontext Repo-Root, Runner: node server.js auf Port 3000
```

Access- und Refresh-Token liegen im `localStorage` (bewusste Grenze, siehe
`SECURITY.md`).

## Tests

Keine Unit-Tests im Frontend. Die e2e-Tests (Playwright) liegen im Paket
`e2e/` und sprechen die Seiten über `data-testid`-Attribute an (`login-*`,
`password-toggle`, `dashboard-*`; Regel in `docs/rules/FRONTEND-RULES.md`).
Ablauf im README des Repo-Roots, Abschnitt "e2e-Tests".

## Docker

```bash
docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3011 -t bp-frontend .
```

Build-Kontext ist das Repo-Root (`.dockerignore` dort); der Runner startet
`node server.js` aus dem Standalone-Output, Port `3000`, Interface über
`HOSTNAME` (Compose: `0.0.0.0`, prod-native: `127.0.0.1`).
