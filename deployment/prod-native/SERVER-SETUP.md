# Server-Einrichtung: native Datenbanken (Option B)

Postgres und Redis laufen nativ auf dem Host und hören nur auf 127.0.0.1.
Docker läuft nur für Backend und Frontend, beide mit `network_mode: host`.
Öffentlich ist ausschließlich der Nginx auf dem Host (80/443).

## 1. Docker-Daemon

```bash
install -m 0644 deployment/server/daemon.json /etc/docker/daemon.json
systemctl restart docker
```

`iptables: false` und `bridge: none`: Docker legt keine Firewall-Regeln an und
kann UFW nicht umgehen. Mit `network_mode: host` binden die Container ihre Ports
selbst, und zwar nur auf loopback: das Frontend über `HOSTNAME=127.0.0.1`, das
Backend über `HOST=127.0.0.1` (beides in der Compose-Datei gesetzt). UFW (nur
22/80/443) bleibt die zweite Schranke, falls eine der Variablen fehlt.

## 2. PostgreSQL 17

```bash
apt-get install -y postgresql-17 postgresql-client-17

PG_PW=$(openssl rand -hex 24)
sudo -u postgres psql -c "CREATE USER quellwerk_user WITH PASSWORD '$PG_PW';"
sudo -u postgres psql -c "CREATE DATABASE quellwerk OWNER quellwerk_user;"
```

Prüfen, dass nur 127.0.0.1 gebunden ist:

```bash
grep "^#\?listen_addresses" /etc/postgresql/17/main/postgresql.conf   # localhost
ss -tlnp | grep 5432                                                  # 127.0.0.1:5432
```

## 3. Redis

```bash
apt-get install -y redis-server

REDIS_PW=$(openssl rand -hex 24)
cat >> /etc/redis/redis.conf <<EOF_REDIS
requirepass $REDIS_PW
appendonly yes
maxmemory-policy noeviction
EOF_REDIS
systemctl restart redis-server
```

Prüfen:

```bash
grep "^bind" /etc/redis/redis.conf              # bind 127.0.0.1 -::1
grep "^protected-mode" /etc/redis/redis.conf    # protected-mode yes
redis-cli -a "$REDIS_PW" --no-auth-warning ping # PONG
```

`noeviction` ist Pflicht: Redis hält die Zähler des Rate-Limiters; ein
Verdrängen der Schlüssel würde die Limits aufheben.

## 4. Variablen

`.env` im Repo-Root (Vorlage `example.env`):

```
POSTGRES_USER=quellwerk_user
POSTGRES_PASSWORD=<PG_PW>
POSTGRES_DB=quellwerk
REDIS_PASSWORD=<REDIS_PW>
NEXT_PUBLIC_API_URL=https://bp-prod.7style.net
BACKEND_PORT=3011
FRONTEND_PORT=3000
```

Compose baut daraus `DATABASE_URL` und `REDIS_URL` auf `127.0.0.1` und setzt
`HOST=127.0.0.1` für das Backend. In `backend/.env` (Vorlage
`backend/example.env`) stehen `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`ENCRYPTION_KEY`, `CORS_ORIGIN` und die übrigen
Anwendungs-Einstellungen. `DATABASE_URL`, `REDIS_URL`, `HOST`, `PORT`,
`NODE_ENV`, `APP_NAME` und `UPLOAD_DIR` dort werden von Compose überschrieben.

## 5. Deploy

```bash
bash scripts/security-check.sh
docker compose --env-file .env -f deployment/prod-native/docker/docker-compose.yml up -d --build
curl -s http://127.0.0.1:3011/health
```

Der Entrypoint führt `prisma migrate deploy` aus. Seeds sind mit
`NODE_ENV=production` gesperrt; den ersten Admin einmalig anlegen mit

```bash
DATABASE_URL='postgresql://quellwerk_user:<PG_PW>@127.0.0.1:5432/quellwerk' \
SEED_ADMIN_PASSWORD='...' NODE_ENV=development \
pnpm --filter @quellwerk/backend run prisma:seed
```

## 6. Nginx auf dem Host

Nginx nativ installieren und als Reverse-Proxy auf `127.0.0.1:3000`
(Frontend) und `127.0.0.1:3011` (`/api`, `/health`) konfigurieren; die
Direktiven aus `deployment/local/nginx/docker-entrypoint.sh` (TLS, Header,
Rate-Limits) lassen sich übernehmen. Beide Container binden nur loopback
(`HOSTNAME=127.0.0.1` für das Frontend, `HOST=127.0.0.1` für das Backend);
prüfen mit `ss -tlnp | grep -E '3000|3011'` (erwartet `127.0.0.1:`), UFW
(`ufw status`) bleibt trotzdem auf 22/80/443 beschränkt.
