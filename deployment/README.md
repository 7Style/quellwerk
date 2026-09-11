# Deployment

Zwei Compose-Dateien, nicht mehr:

```text
docker-compose.yml                    # lokale Arbeit, Ports auf 127.0.0.1
deployment/
├── prod/
│   ├── docker/docker-compose.yml     # Produktion auf "intern"
│   ├── nginx/quellwerk.conf          # Vhost fuer den Nginx des Hosts
│   ├── firewall/quellwerk-firewall.{sh,service}
│   ├── deploy.sh                     # rsync, bauen, starten (laeuft lokal)
│   └── backup.sh, backup.cron        # pg_dump nach /var/backups/quellwerk
└── server/daemon.json                # Docker-Daemon: iptables aus, keine Bridge
```

Die Vorlage brachte zusätzlich LOCAL, DEV und eine Fassung mit nativen
Datenbanken mit, jeweils mit eigenem Nginx-Container. Alle drei sind mit dem
ersten Deploy entfallen: auf `intern` serviert der Nginx des Hosts, und eine
Umgebung, die niemand fährt, ist eine Datei, die beim nächsten Lesen in die Irre
führt. Der Ablauf des ersten Deploys mit seinen Ausgaben steht in
`docs/DEPLOY.md`.

## Variablen

Zwei Quellen, keine Überschneidung:

| Datei | Inhalt | Vorlage |
|---|---|---|
| `.env` (Repo-Wurzel) | Compose-Variablen: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`, `APP_NAME`, `APP_DESCRIPTION`, `NEXT_PUBLIC_API_URL`, `SEED_ON_START`, in Produktion `PROD_DOMAIN` | `example.env` |
| `backend/.env` | Einstellungen des Backends: `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`, `MODEL_*`, `EFFORT_CHAT`, Budget, Caps, `CORS_ORIGIN`, `RATE_LIMIT_*`, `UPLOAD_*`, `LOG_LEVEL` | `backend/example.env` |

Beide Dateien werden von Hand geschrieben, auf dem Server mit eigenen Werten.

Compose setzt `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`, `APP_NAME`,
`UPLOAD_DIR` und `SEED_ON_START` selbst im Block `environment`, in Produktion
zusätzlich `PUBLIC_URL`, `CORS_ORIGIN`, `FRONTEND_URL`, `API_URL` und
`TRUST_PROXY`. Diese Werte gewinnen gegen `backend/.env` (`env_file`); dort
gesetzt sind sie wirkungslos, auch ein leerer Wert aus der Wurzeldatei gewinnt.

`NEXT_PUBLIC_API_URL`, `APP_NAME` und `APP_DESCRIPTION` gehen als Build-Args in
das Frontend-Image. `NEXT_PUBLIC_*` wird beim Build eingebrannt: nach einer
Änderung muss das Image neu gebaut werden, ein Neustart genügt nicht.

Passwörter haben keine Defaults. Fehlt `POSTGRES_PASSWORD`, `REDIS_PASSWORD`
oder in Produktion `PROD_DOMAIN`, bricht `docker compose` mit
`required variable ... fehlt` ab, bevor etwas startet.

```bash
cp example.env .env
cp backend/example.env backend/.env
openssl rand -hex 24   # POSTGRES_PASSWORD, REDIS_PASSWORD
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 16   # ADMIN_TOKEN
bash scripts/security-check.sh
```

## Aufruf

```bash
# lokal
docker compose up -d --build

# Produktion, vom Arbeitsrechner aus
bash deployment/prod/deploy.sh

# Produktion, auf dem Server
cd /apps/quellwerk
docker compose -f deployment/prod/docker/docker-compose.yml --env-file .env up -d --build
```

Das Produktions-Compose braucht `--env-file .env` ausdrücklich: Compose sucht
die Datei sonst neben der Compose-Datei, also in `deployment/prod/docker/`.

## Dienste

| Dienst | Port im Container | Host (lokal) | Host (Produktion) |
|---|---|---|---|
| frontend | 3000 | 127.0.0.1:3010 | 127.0.0.1:3020 |
| backend | 3011 | 127.0.0.1:3011 | 127.0.0.1:3021 |
| worker | – | – | – |
| db | 5432 | 127.0.0.1:5432 | kein Port |
| redis | 6379 | 127.0.0.1:6379 | kein Port |

In Produktion veröffentlicht kein Dienst auf `0.0.0.0`, und Postgres und Redis
veröffentlichen gar nichts; erreichbar sind sie nur im Netz `quellwerk_internal`.
Der Worker teilt sich das Image mit dem Backend und hat nur einen anderen
Startbefehl, deshalb baut ihn Compose nicht eigens.

Uploads liegen im Volume `backend_uploads` (`/usr/src/app/uploads`), Postgres in
`postgres_data`, die Redis-AOF in `redis_data`. Postgres 17 ist gegenüber der
Vorlage ein Major-Upgrade: ein bestehendes `postgres_data` aus Postgres 16
braucht `pg_upgrade` oder Dump und Restore, sonst startet der Container nicht.

## Migrationen und Seed

Der Entrypoint des Backend-Containers führt bei jedem Start `prisma migrate
deploy` aus. Beim allerersten Start dauert das länger als der Healthcheck
erwartet; deshalb steht `start_period` in Produktion auf 120s.

Ein Seed läuft nur mit `SEED_ON_START=true` und nie mit `NODE_ENV=production`.
Das Demo-Notizbuch mit der festen id `demo` wird auf dem Server bewusst mit einem
eigenen Befehl gesetzt (M8-T1), nicht beim Hochfahren.

Kein Hot Reload in Compose. Dafür `docker compose up -d db redis` und `pnpm dev`
auf dem Host, siehe README.md in der Wurzel.
