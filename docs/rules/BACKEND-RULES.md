# Backend-Regeln

Kurzfassung für Menschen und LLMs. Architektur in `../BACKEND-ARCHITECTURE.md`.

## Modul-Unabhängigkeit (keine Ausnahmen)

1. Keine modulübergreifenden Importe: nie `../../common`, nie `../other-module`.
2. Jedes Modul hat seinen eigenen `BaseService`; Prisma, Logger und Events kommen per DI beim Init.
3. Logger ist Pflicht, nie optional.
4. Kein `asyncHandler`: Express 5 fängt abgelehnte Promises selbst. Handler sind `async (req, res) => {...}`.

```
Erlaubt:   ./services, ./internal, ./dto, ./interfaces
Verboten:  ../common, ../other-module, ../../shared
```

## Modulstruktur

```
backend/app/modules/<domain>/
├── controllers/          nur HTTP, keine Fachlogik, kein direkter Prisma-Zugriff
├── services/
│   ├── base.service.ts   lokaler BaseService mit initModuleServices()
│   └── <entity>.service.ts
├── dto/                  zod-Schemas (*.schemas.ts), Typen per z.infer (ersetzt DTO-Klassen)
├── routes/               validateBody(schema) vor dem Controller
├── interfaces/           IModuleConfig: prisma, logger, events
├── internal/             Middleware, Repositories, Utilities des Moduls
└── index.ts              createModule(config)
```

## Kernregeln

- Dateien max. 300 Zeilen (hart 500), Funktionen und Klassen max. 150 Zeilen.
- Kein `any`, explizite Rückgabetypen, Prisma-Typen nie in API-Antworten.
- Eingaben mit zod validieren (`schema.parse` oder `validateBody`), `ZodError` wird zentral zu 400.
- Services: Fachlogik, `this.logger` statt `console.log`, typisierte Exceptions.
- Datenbank: immer `select`, immer paginieren, Transaktionen für mehrstufige Vorgänge, keine unparametrisierten Raw-Queries.
- Sicherheit: keine sensiblen Daten in Logs oder Antworten, Auth über Middleware, Secrets nur aus `env.config.ts` (nie `process.env` im Modul, nie Fallback-Literale).
- Importe aus dem generierten Prisma-Client nur über `app/lib/prisma.ts`.

## Namensgebung

| Typ | Konvention | Beispiel |
|---|---|---|
| Dateien | kebab-case | `user.service.ts`, `user.schemas.ts` |
| Klassen | PascalCase | `UserService` |
| DI-Interfaces | I-Präfix | `IUserService` |
| Schemas / Typen | `xxxSchema`, `Xxx` | `createUserSchema`, `CreateUser` |
| Funktionen | camelCase, Verb zuerst | `findUserById` |
| Konstanten | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| Booleans | is/has/can | `isActive`, `hasPermission` |

## Prüfungen vor dem PR

```bash
pnpm --filter bp-monolith-backend exec prisma validate
pnpm --filter bp-monolith-backend exec prisma generate
pnpm --filter bp-monolith-backend run typecheck
pnpm --filter bp-monolith-backend run lint
pnpm --filter bp-monolith-backend run test
```

Pre-Commit prüft Typen, Prisma-Schema und Sicherheitsregeln (`scripts/security-check.sh --staged`);
Lint und Tests laufen in CI, der Pre-Push-Hook baut Backend und Frontend. Ein roter Schritt blockiert.

## Quality-Gate-Suchen (müssen 0 Treffer liefern)

```bash
rg "from '.*common.*'" backend/app/modules/<domain>
rg "from '\.\./\.\./\.\." backend/app/modules/<domain>
rg ": any|as any" backend/app/modules/<domain> --type ts
rg "console\.(log|error|warn)" backend/app/modules/<domain> --type ts
rg "process\.env" backend/app/modules/<domain> --type ts
rg "asyncHandler" backend/app
```

## Checkliste

- [ ] Keine Importe aus `common` oder anderen Modulen
- [ ] Lokaler `BaseService` mit DI, Logger injiziert
- [ ] Kein `asyncHandler`, Handler `async (req, res)`
- [ ] zod-Schema für jede Eingabe, Typen per `z.infer`
- [ ] Datei <= 300 Zeilen, kein `any`, explizite Rückgabetypen
- [ ] Keine sensiblen Daten in Logs oder Antworten
- [ ] Keine `process.env`-Zugriffe und keine Secret-Fallbacks im Modul

## Referenzpfade

| Zweck | Pfad |
|---|---|
| BaseService | `backend/app/modules/auth/services/base.service.ts` |
| Modul-Interface | `backend/app/modules/auth/interfaces/module.interface.ts` |
| Env-Schema | `backend/app/config/env.config.ts` |
| Prisma-Barrel | `backend/app/lib/prisma.ts` |
