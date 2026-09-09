# Frontend-Regeln

Kurzfassung für Menschen und LLMs. Stack: Next.js 16 (App Router), React 19,
Redux Toolkit mit RTK Query, Tailwind 4, TypeScript 6.

## Styling

1. Tailwind-4-Utilities in JSX sind der Standard; `cn()` aus `@/lib/utils` zum Zusammensetzen.
2. Farben, Abstände und Radien kommen aus den CSS-Variablen in `src/styles/global.css`, keine Hex- oder rgb-Werte im Code.
3. Keine Inline-Styles (`style={{ }}`), kein SCSS (sass ist nicht installiert).
4. Dark Mode über CSS-Variablen, nicht über doppelte Styles.

## Modul-Unabhängigkeit

1. Keine Importe zwischen Modulen (`src/modules/auth` importiert nie aus `src/modules/users`).
2. Co-Location: Komponenten, Hooks, Services, Store-Slice und Typen liegen im Modul.
3. Öffentliche API nur über `index.ts`.
4. Seiten liegen in `src/modules/<domain>/pages/`, Routen in `src/app/` sind dünn.

```
frontend/src/modules/<domain>/
├── components/   wiederverwendbare UI des Moduls
├── pages/        Seitenkomponenten
├── hooks/
├── services/     RTK-Query-Endpunkte (injectEndpoints auf src/lib/api.ts)
├── store/        Slice, falls nötig
├── types/        DTOs, ViewModels
└── index.ts
```

## Kernregeln

- Dateien max. 300 Zeilen (hart 500), Komponenten max. 150 Zeilen.
- Kein `any`; Props-Interfaces `XxxProps`; DTOs für API-Daten, ViewModels für die UI.
- Fachlogik in Hooks und Services, API-Aufrufe nie direkt in Komponenten.
- Jede Ansicht behandelt loading, error, empty, success.
- Server-State über RTK Query (`src/lib/api.ts`), Redux nur für globalen UI-State, lokaler State zuerst; Formulare mit react-hook-form, nie im Store.
- Texte nicht in Komponenten verstreuen; wiederverwendete Texte in Konstanten des Moduls.

## Namensgebung

| Typ | Konvention | Beispiel |
|---|---|---|
| Komponenten | PascalCase | `UserCard.tsx` |
| Hooks | use-Präfix | `useAuth.ts` |
| Services | camelCase | `authService.ts` |
| Typen | PascalCase | `UserDto` |
| Handler | handle-Präfix | `handleSubmit` |
| Booleans | is/has/can | `isLoading` |

Import-Reihenfolge: externe Pakete, `@/`-Aliase, relative Importe, Typ-Importe.
Pfad-Alias `@/` ist Pflicht, keine `../../../`-Ketten.

## Design-System

Vor jeder neuen Komponente `src/components/ui/*` prüfen (Button, Card, Input,
Label, Radix-Primitives). Neu nur, wenn nichts passt.

## Sicherheit

- Kein `dangerouslySetInnerHTML` ohne Sanitizer.
- Access- und Refresh-Token liegen im `localStorage` (bewusste Grenze, siehe
  `SECURITY.md`). Deshalb: keine Fremd-Skripte, strikte CSP, Eingaben vor dem
  API-Aufruf validieren.
- `NEXT_PUBLIC_*` ist öffentlich; nie Secrets darin ablegen.

## Barrierefreiheit

Semantisches HTML (`<button>`, nicht `<div onClick>`), `aria-label` für reine
Icon-Buttons, Tastaturbedienung, Kontrast mindestens 4.5:1.

## e2e-Hooks (Playwright)

Elemente, die die e2e-Tests ansprechen, tragen ein `data-testid` nach dem
Muster `<seite>-<element>` (`login-email`, `login-submit`, `dashboard-logout`).
Die Specs in `e2e/` benutzen nur `getByTestId` und `getByRole`, nie
CSS-Klassen; beim Umbenennen `e2e/pages/*.page.ts` mit anpassen.
Fehlermeldungen bekommen `role="alert"`, Formulare mit react-hook-form
`noValidate`, damit die eigenen Validierungstexte erscheinen.

## Prüfungen vor dem PR

```bash
pnpm --filter bp-monolith-frontend run typecheck
pnpm --filter bp-monolith-frontend run lint
pnpm --filter bp-monolith-frontend run build
pnpm --filter bp-monolith-frontend exec prettier --check .
```

## Quality-Gate-Suchen (müssen 0 Treffer liefern)

```bash
rg "#[0-9a-fA-F]{3,8}|rgba?\(|hsl\(" frontend/src --type ts --type tsx -g '!global.css'
rg "style=\{\{" frontend/src --type tsx
rg "from '.*modules/[^/]+/" frontend/src/modules
rg "fetch\(" frontend/src/modules --type tsx
```

## Referenzpfade

| Zweck | Pfad |
|---|---|
| Design-System | `frontend/src/components/ui/*` |
| CSS-Variablen | `frontend/src/styles/global.css` |
| API-Client (RTK Query) | `frontend/src/lib/api.ts` |
| Typed Hooks | `frontend/src/store/hooks.ts` |
