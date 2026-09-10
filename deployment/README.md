# Deployment

Compose-Dateien für die Umgebungen LOCAL, DEV, PROD und PROD mit nativen
Datenbanken. Alle bauen die beiden Produktions-Images aus dem Repo-Root
(`backend/Dockerfile`, `frontend/Dockerfile`, Build-Kontext `.`).

## Ordnerstruktur

```
deployment/
├── local/
│   ├── docker/docker-compose.yml   # LOCAL: kompletter Stack, selbstsigniertes Zertifikat
│   └── nginx/                      # Nginx-Image (Dockerfile, Entrypoint, Fehlerseiten), von allen genutzt
├── dev/docker/docker-compose.yml   # DEV/Staging-Server, Let's Encrypt
├── prod/docker/docker-compose.yml  # PROD-Server, Datenbanken im Container
├── prod-native/
│   ├── docker/docker-compose.yml   # PROD, Datenbanken nativ auf dem Host, network_mode: host
│   └── SERVER-SETUP.md             # Host-Einrichtung für die native Variante
└── server/daemon.json              # Docker-Daemon: iptables aus, keine Bridge, Log-Rotation
```

Der Stack im Repo-Root (`docker-compose.yml`) ist die Variante ohne Nginx mit
Ports auf 127.0.0.1 (3010, 3011, 5432, 6379) und ist für die lokale Arbeit gedacht.

## Variablen

Zwei Quellen, keine Überschneidung:

| Datei | Inhalt | Vorlage |
|---|---|---|
| `.env` (Repo-Root) | Compose-Variablen: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`, `APP_NAME`, `APP_DESCRIPTION`, `NEXT_PUBLIC_API_URL`, `SEED_ON_START`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_USERS`, `SEED_DEMO_PASSWORD`, `LETSENCRYPT_EMAIL` | `example.env` |
| `backend/.env` | Anwendungs-Einstellungen des Backends: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `CORS_ORIGIN`, `SMTP_*`, `UPLOAD_*`, `RATE_LIMIT_*`, `LOG_LEVEL` | `backend/example.env` |

Compose setzt `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`, `APP_NAME`,
`UPLOAD_DIR` und alle `SEED_*`-Variablen (prod-native zusätzlich `HOST`) selbst
im Block `environment`. Diese Werte gewinnen gegen `backend/.env` (`env_file`);
dort gesetzte Werte sind im Container wirkungslos (auch ein leerer Wert aus der
Root-`.env` gewinnt, das Backend behandelt leer wie "nicht gesetzt").
`NEXT_PUBLIC_API_URL`, `APP_NAME` und `APP_DESCRIPTION` gehen als Build-Args in
das Frontend-Image (`NEXT_PUBLIC_*` wird beim Build eingebrannt).

Passwörter haben keine Defaults. Fehlt `POSTGRES_PASSWORD` oder `REDIS_PASSWORD`,
bricht `docker compose` mit `required variable ... fehlt` ab.

```bash
cp example.env .env
cp backend/example.env backend/.env
openssl rand -hex 24   # POSTGRES_PASSWORD, REDIS_PASSWORD
openssl rand -hex 32   # JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY
bash scripts/security-check.sh
```

`NEXT_PUBLIC_API_URL` ist der Origin des Backends ohne `/api`-Suffix
(die Frontend-Endpunkte tragen `/api` selbst) und wird beim Image-Build
eingebrannt. Nach einer Änderung muss das Frontend-Image neu gebaut werden.

## Aufruf

Immer vom Repo-Root, mit `--env-file .env`, weil Compose die `.env` sonst
neben der Compose-Datei sucht:

```bash
# LOCAL (bp-local.7style.net)
echo "127.0.0.1 bp-local.7style.net" | sudo tee -a /etc/hosts
docker compose --env-file .env -f deployment/local/docker/docker-compose.yml up -d --build

# DEV (bp-dev.7style.net)
docker compose --env-file .env -f deployment/dev/docker/docker-compose.yml up -d --build

# PROD (bp-prod.7style.net)
docker compose --env-file .env -f deployment/prod/docker/docker-compose.yml up -d --build

# PROD, native Datenbanken
docker compose --env-file .env -f deployment/prod-native/docker/docker-compose.yml up -d --build
```

Domains: `DEV_DOMAIN`, `PROD_DOMAIN`, `LOCAL_DOMAIN` in `.env` (Defaults siehe
`domains.conf`). DEV und PROD erwarten `/etc/letsencrypt` auf dem Host.

## Migrationen und Seed

Der Backend-Entrypoint führt bei jedem Start `prisma migrate deploy` aus.
Ein Seed läuft nur mit `SEED_ON_START=true` und nie mit `NODE_ENV=production`;
im Container werden dafür `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`,
`SEED_DEMO_USERS` und `SEED_DEMO_PASSWORD` aus der Root-`.env` gelesen (das
Produktions-Image hat kein `tsx`, der Entrypoint startet den kompilierten
Seed `dist/prisma/seed.js`).

Für PROD: den ersten Admin einmalig vom Host aus anlegen, mit `DATABASE_URL`
auf die Produktionsdatenbank (per SSH-Tunnel oder auf dem Server selbst):

```bash
SEED_ADMIN_PASSWORD='...' NODE_ENV=development pnpm --filter @quellwerk/backend run prisma:seed
```

Prisma Studio läuft nicht mehr als Container (bindet ab Prisma 7 nur localhost):

```bash
pnpm --filter @quellwerk/backend exec prisma studio
```

## Services

| Service | Port im Container | Host-Port (Root-Stack) | Hinweis |
|---|---|---|---|
| frontend | 3000 | 127.0.0.1:3010 | Next.js Standalone, Healthcheck auf `/` |
| backend | 3011 | 127.0.0.1:3011 | Express, Healthcheck auf `/health` |
| db (Root) / postgres (deployment/*) | 5432 | 127.0.0.1:5432 (Root, LOCAL) | `postgres:17-alpine`, in DEV/PROD ohne Host-Port |
| redis | 6379 | 127.0.0.1:6379 (Root, LOCAL) | `redis:8-alpine`, `--appendonly yes`, `noeviction` |
| nginx-ssl-proxy | 80/443 | 80/443 | einziger Dienst mit öffentlichem Port |

Uploads liegen im Volume `backend_uploads` (`/usr/src/app/uploads`), Postgres in
`postgres_data`, Redis-AOF in `redis_data`.

Postgres 17 ist ein Major-Upgrade: bestehende `postgres_data`-Volumes aus
Postgres 16 brauchen `pg_upgrade` oder Dump/Restore, sonst startet der Container nicht.

## Vergleich

| | Root | LOCAL | DEV | PROD | PROD native |
|---|---|---|---|---|---|
| Nginx | nein | ja, selbstsigniert | ja, Let's Encrypt | ja, Let's Encrypt | Host-Nginx |
| DB/Redis | Container, 127.0.0.1 | Container, 127.0.0.1 | Container, kein Port | Container, kein Port | nativ auf dem Host |
| `NODE_ENV` Backend | development | development | development | production | production |
| Seed erlaubt | ja | ja | ja | nein | nein |
| Ressourcenlimits | nein | nein | ja | ja | ja |
| Backend bindet | 0.0.0.0 (internes Netz) | 0.0.0.0 (internes Netz) | 0.0.0.0 (internes Netz) | 0.0.0.0 (internes Netz) | `HOST=127.0.0.1` (Host-Netz) |

Hot Reload gibt es in keiner Compose-Variante; dafür `docker compose up -d db redis`
und `pnpm dev` auf dem Host (siehe README.md im Root).
