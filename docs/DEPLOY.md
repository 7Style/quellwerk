# Betrieb

## Lokal aus einem frischen Klon

```bash
git clone <repo> quellwerk && cd quellwerk
cp example.env .env
cp backend/example.env backend/.env
```

Beide Dateien werden von Hand gefüllt; kein Werkzeug schreibt sie. Ohne die fünf
Pflichtwerte startet das Backend nicht:

| Datei | Wert | Erzeugen mit |
|---|---|---|
| `.env` | `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `.env` | `REDIS_PASSWORD` | `openssl rand -hex 24` |
| `backend/.env` | `SESSION_SECRET` | `openssl rand -hex 32` |
| `backend/.env` | `ADMIN_TOKEN` | `openssl rand -hex 16` |
| `backend/.env` | `ANTHROPIC_API_KEY` | Konsole von Anthropic |

```bash
pnpm install --frozen-lockfile
pnpm verify        # typecheck, lint, test
pnpm dev           # docker compose up -d --build
```

Erwartet: fünf Dienste, vier davon `healthy`, der Worker `Up` ohne Healthcheck
(er bedient nichts, siehe docker-compose.yml). Prüfen:

```bash
docker compose ps --format '{{.Service}} {{.Status}}'
curl -sI http://127.0.0.1:3011/health | head -1     # HTTP/1.1 200
docker compose exec backend ls ../prompts/README.md  # Prompts liegen im Image
```

Belegt ein anderes Projekt 3010 oder 3011, gehört die Abweichung in eine lokale
`docker-compose.override.yml`. Compose sieht diese Datei dafür vor; sie ist
absichtlich nicht im Repository, weil sie sonst bei jedem Klon greifen würde.
Wichtig dabei: `ports` wird von Compose angehängt statt ersetzt, eine Abweichung
braucht also `ports: !override`.

## Der Server

Quellwerk läuft auf `intern` (217.160.14.35) unter `quellwerk.7style.net`. Der
Server trägt neun weitere Vhosts; Quellwerk ist Gast darauf, und daraus folgt
alles Weitere:

| | |
|---|---|
| Verzeichnis | `/apps/quellwerk`, Eigentümer `root:root` |
| Ports | nur `127.0.0.1:3020` (Frontend) und `127.0.0.1:3021` (Backend) |
| Container-Netz | `quellwerk_internal`, Bridge `br-quellwerk`, `172.30.0.0/24` |
| Nginx | 1.24 auf dem Host, `sites-available`/`sites-enabled`, kein Container |
| Docker | läuft mit `"iptables": false`, jeder Stack setzt seine Regeln selbst |
| Interface | `ens192` |
| Sicherungen | `/var/backups/quellwerk`, außerhalb von `/apps/quellwerk` |

Die drei Punkte, die man auf einem geteilten Server nur einmal falsch macht,
stehen in SECURITY.md 4.3. Der wichtigste: die eigenen ACCEPT-Regeln gehen mit
`iptables -I DOCKER-USER 1` an den **Anfang** der Kette, nie mit `-A`. Am Ende
von `DOCKER-USER` steht auf diesem Server eine DROP-Regel eines anderen Stacks;
angehängte Regeln stünden dahinter und wären wirkungslos.

## Der erste Deploy, 11.09.2026

Ausgeführt von Hand, Befehl für Befehl, weil es noch kein Repository gibt, aus
dem eine Action ziehen könnte (M8-T5 holt das nach). Was hier in einem Codeblock
steht, ist die Ausgabe des Servers; was als Satz danebensteht, ist das Ergebnis
in Worten.

### 1. Zielverzeichnis

```bash
mkdir -p /apps/quellwerk && ls -la /apps/quellwerk && df -h /apps | tail -1
```

```text
total 8
drwxr-xr-x  2 root root 4096 Sep 11 13:03 .
drwxr-xr-x 12 root root 4096 Sep 11 13:03 ..
/dev/mapper/vg00-lv01  489G   81G  388G  18% /
```

388 GB frei. Der Platz wird vor dem Bauen geprüft und nicht danach: Postgres,
Redis, zwei Node-Images und der Build-Cache brauchen zusammen einige Gigabyte,
und auf einem Server mit neun anderen Seiten ist eine volle Platte der teuerste
Fehler.

### 2. Code spiegeln

Erst im Trockenlauf, vom Arbeitsrechner aus:

```bash
bash deployment/prod/deploy.sh --dry-run
```

296 Einträge, 216 Dateien, 1,3 MB. Der Lauf wurde zusätzlich mit
`--out-format='%n'` wiederholt und die Dateiliste durchsucht: keine
Konfigurationsdatei, keine Override-Datei, kein Schlüssel. Danach dasselbe ohne
`--dry-run`: 240 Einträge, 174 Dateien, 1,1 MB übertragen, auf dem Server
1,8 MB. Die Differenz sind `.claude`, `.github`, `.husky` und `design`, die nach
dem Trockenlauf ausgeschlossen wurden.

Zwei Dinge sind dabei aufgefallen und stehen jetzt fest im Skript:

- `rsync -a` überträgt Besitzer numerisch. Auf dem Server gehörte alles der
  uid 501, dem Benutzer des Arbeitsrechners. Die gibt es dort nicht, aber ein
  späterer Deploy-Benutzer könnte genau diese Nummer bekommen und dann an
  `docker-compose.yml` schreiben. Deshalb `--chown=root:root`.
- `--delete` räumt auf dem Server weg, was im Repository nicht mehr existiert.
  Ausgeschlossene Pfade fasst rsync gar nicht an, die Konfiguration auf dem
  Server ist also sicher. Die Sicherungen liegen trotzdem außerhalb, unter
  `/var/backups/quellwerk`: eine Datei, die nur durch einen Ausschluss überlebt,
  überlebt genau so lange, bis jemand den Ausschluss streicht.

### 3. Konfiguration

`/apps/quellwerk/.env` und `/apps/quellwerk/backend/.env` werden **auf dem
Server von Hand geschrieben**, mit eigenen Werten, und nie aus dem Repository
kopiert. Der Schlüssel für Anthropic ist ein eigener, nicht der vom
Arbeitsrechner: so lässt sich einer von beiden sperren, ohne den anderen zu
treffen, und der Verbrauch des Servers ist in der Konsole getrennt sichtbar.

Geprüft wird ohne die Werte zu zeigen:

```bash
cd /apps/quellwerk && for f in .env backend/.env; do
  echo "--- $f ($(stat -c '%a %U:%G' $f))"
  awk -F= '/^[A-Z]/ {printf "  %-26s %d Zeichen\n", $1, length($2)}' "$f"
done
```

Erwartet: beide `600 root:root`, acht Einträge in der ersten Datei, neun in der
zweiten, und keine Länge null außer bei `APP_DESCRIPTION`. Die Ausgabe zeigt
Namen und Längen, nie Werte.

Was bewusst **nicht** in diesen Dateien steht: `DATABASE_URL`, `REDIS_URL`,
`NODE_ENV`, `PORT`, `TRUST_PROXY`, `UPLOAD_DIR`, `PUBLIC_URL`, `CORS_ORIGIN`,
`FRONTEND_URL`, `API_URL`. Die setzt das Produktions-Compose über `environment`,
und `environment` gewinnt gegen `env_file`. Stünden sie zusätzlich in der Datei,
wären sie wirkungslos und würden beim nächsten Lesen in die Irre führen.
`PROD_DOMAIN` gehört dagegen in die Wurzeldatei, weil Compose es interpoliert.

### 4. Compose prüfen, bevor gebaut wird

```bash
cd /apps/quellwerk
docker compose -f deployment/prod/docker/docker-compose.yml --env-file .env config --format json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['name']); [print(n, s.get('ports','-')) for n,s in d['services'].items()]"
```

Fünf Dienste, `backend 127.0.0.1:3021 -> 3011`, `frontend 127.0.0.1:3020 -> 3000`,
`db`, `redis` und `worker` ohne Ports.

Die Prüfung läuft über `--format json` und nicht über `grep` auf die Textausgabe:
`published: 3021` sieht in beiden Fällen gleich aus, aber nur das JSON zeigt
`host_ip`, und genau darauf kommt es hier an. Eine Datenbank, die versehentlich
auf `0.0.0.0` liegt, ist auf diesem Server der teuerste Fehler, und ein
Prüfbefehl, der ihn nicht zeigen kann, ist keiner.

### 5. Bauen

```bash
cd /apps/quellwerk
time docker compose -f deployment/prod/docker/docker-compose.yml --env-file .env build 2>&1 \
  | tee /tmp/quellwerk-build.log | tail -25
```

Der Build braucht den API-Schlüssel nicht, `up` schon. Beides lässt sich also
trennen, und das Bauen läuft, während der Schlüssel angelegt wird.

Zwei Dinge, die im Log stehen müssen: `Generated Prisma Client` (der Client wird
im Image erzeugt, nicht kopiert, weil `app/generated/` sowohl im rsync als auch
in `.dockerignore` ausgeschlossen ist) und ein Frontend-Build mit
`NEXT_PUBLIC_API_URL=https://quellwerk.7style.net`. Der Wert wird eingebrannt,
nicht zur Laufzeit gelesen: wechselt die Domain, reicht kein Neustart, dann muss
das Image neu gebaut werden.

### 6. Starten, Firewall, Vhost

Die Reihenfolge ist nicht beliebig. Die Firewall kommt **nach** `up`, weil
`quellwerk-firewall.sh` auf das Docker-Netz wartet und es vorher nicht gibt.

```bash
set -e
cd /apps/quellwerk
C="docker compose -f deployment/prod/docker/docker-compose.yml --env-file .env"

$C up -d
sleep 20
$C ps --format '{{.Service}} {{.Status}}'

install -m 755 deployment/prod/firewall/quellwerk-firewall.sh /usr/local/bin/quellwerk-firewall.sh
install -m 644 deployment/prod/firewall/quellwerk-firewall.service /etc/systemd/system/quellwerk-firewall.service
ufw allow out to 172.30.0.0/24
systemctl daemon-reload
systemctl enable --now quellwerk-firewall
systemctl status quellwerk-firewall --no-pager | head -12

echo "--- NAT ---";         iptables -t nat -S POSTROUTING | grep 172.30 || echo "FEHLT"
echo "--- DOCKER-USER ---"; iptables -S DOCKER-USER | head -6

install -m 644 deployment/prod/nginx/quellwerk.conf /etc/nginx/sites-available/quellwerk.conf
ln -sfn ../sites-available/quellwerk.conf /etc/nginx/sites-enabled/quellwerk.conf
nginx -t
systemctl reload nginx
```

Dass `nginx -t` vor `reload` steht und `set -e` davor abbricht, ist Absicht: auf
einem Host mit neun anderen Seiten darf ein kaputtes Reload nie durchgehen.

Ergebnis: alle fünf Dienste laufen. `MASQUERADE` für `172.30.0.0/24` steht in
`POSTROUTING`, die zwei ACCEPT-Regeln stehen ganz oben in `DOCKER-USER`, also vor
der fremden DROP-Regel am Kettenende. Das war der eigentliche Prüfpunkt: stünden
sie darunter, fehlte keine Regel, und der Fehler zeigte sich erst später als
"Container kommt nicht ins Internet".

### 7. Nachweise

```bash
echo "--- Backend ---";  curl -sI http://127.0.0.1:3021/health | head -1
echo "--- Frontend ---"; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3020/
echo "--- Anthropic aus dem Container ---"
$C exec -T backend node -e "fetch('https://api.anthropic.com/v1/models').then(r=>console.log('reachable',r.status)).catch(e=>console.log('blocked',e.cause?.code??e.message))"
echo "--- nichts auf 0.0.0.0 ---"
ss -tlnp | grep -E '3020|3021|5432|6379' || echo "keine dieser Ports offen"
echo "--- Vhost über den Host ---"
curl -sI -H 'Host: quellwerk.7style.net' http://127.0.0.1/ | head -3
```

Ergebnis: Backend 200, Frontend 200, Vhost 301 auf https. Anthropic ist aus dem
Container erreichbar; erwartet ist dort `reachable 401`, denn `/v1/models` ohne
Schlüsselheader lehnt richtigerweise ab. `blocked ENETUNREACH` hieße, dass
MASQUERADE fehlt. `ss` zeigt nur `127.0.0.1:3020` und `127.0.0.1:3021`, für 5432
und 6379 nichts.

Der Vhost-Test läuft über den `Host`-Header, weil der A-Record noch nicht
sichtbar ist. 301 ist hier das richtige Ergebnis: der TLS-Block ist bis certbot
auskommentiert, es gibt also noch nichts, wohin die Umleitung führen könnte.

### 8. Aufräumen: Volumes aus dem namenlosen Projekt

Der erste Start lief ohne `name:` im Compose, also unter dem Projektnamen
`docker` (Compose nimmt dann den Ordnernamen). Die Container tragen feste Namen
und wurden beim zweiten Lauf ersetzt, die Volumes aber tragen das Projektpräfix
und bleiben als Waisen liegen. Sie sind leer, weil der Stack in diesem Zustand
nie sauber hochkam:

```bash
docker volume ls --filter name=docker_
docker volume inspect docker_postgres_data -f '{{.Mountpoint}}' | xargs du -sh
docker volume rm docker_postgres_data docker_redis_data docker_backend_uploads
```

`docker volume rm` verweigert den Dienst, solange ein Container das Volume
benutzt. Das ist hier die eigentliche Sicherung: geht der Befehl durch, hing
nichts mehr daran. Vor dem Löschen trotzdem die Größe ansehen, damit klar ist,
dass keine Daten mitgehen.

### 9. Offen: das Zertifikat

Wartet auf den A-Record für `quellwerk.7style.net`. Sobald er auflöst:

```bash
dig +short quellwerk.7style.net                       # muss 217.160.14.35 zeigen
certbot certonly --webroot -w /var/www/html -d quellwerk.7style.net
```

Dann den TLS-Block in `/etc/nginx/sites-available/quellwerk.conf` einkommentieren,
den Testblock auf `127.0.0.1:8081` **darüber löschen** und `nginx -t && systemctl
reload nginx`.

Der Testblock existiert nur, weil ohne Zertifikat der einzige aktive Block der auf
Port 80 ist und der alles nach https umleitet. Es gäbe also keinen Weg, über den
eine SSE-Antwort durch nginx läuft, und Buffering-Fehler zeigen sich nur dort. Er
trägt dieselben Direktiven wie der 443-Block und hört ausschließlich auf dem
Loopback; sobald der echte Block steht, ist er ein zweiter Pfad auf dieselbe
Anwendung und gehört weg.

Bewusst `certonly --webroot` und **nicht** `certbot --nginx`: der nginx-Installer
baut den 443-Block, indem er den vorhandenen 80-Block dupliziert. Dieser enthält
`return 301 https://$host$request_uri` — die Kopie würde also auf sich selbst
umleiten. Der Umweg über `certonly` lässt certbot die Vhost-Datei gar nicht erst
anfassen; sie bleibt das, was im Repository steht.

Danach die Abnahme aus M8-T3:

```bash
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://quellwerk.7style.net/api/health
```

Erwartet: `200 0`. Die Erneuerung übernimmt der Timer von certbot; der
`--webroot`-Pfad steht danach in der Renewal-Konfiguration und braucht keinen
Reload-Hook, weil `systemctl reload nginx` als `--deploy-hook` mitgegeben werden
kann.

## Der zweite Deploy: M2 auf den Server, 11.09.2026

Derselbe Weg, diesmal über `deployment/prod/deploy.sh`. Berichtet vom Server
nach dem Lauf:

- Alle fünf Dienste oben.
- `curl -sI http://127.0.0.1:3021/health` → 200.
- `curl -sI http://127.0.0.1:3021/api/health` → 200. Der zweite Pfad ist neu
  (M2-T0): der Vhost leitet `/api/` mit Präfix weiter, und ohne ihn hätte der in
  Abschnitt 9 dokumentierte Abnahmetest `https://quellwerk.7style.net/api/health`
  das Frontend getroffen statt das Backend.
- Frontend über 127.0.0.1:3020 → 200.
- Die Firewall-Regeln stehen unverändert; die systemd-Unit hat den Neustart der
  Container überdauert, was sie soll: sie hängt an `docker.service`, nicht am
  Stack.

Was mit M2 neu auf dem Server liegt und beim nächsten Deploy zu beachten ist:

**Der Worker hat jetzt Arbeit.** Bis M2 hielt er nur den Prozess offen; jetzt
bedient er die Ingest-Queue und ruft Modelle auf. Ein Neustart des Stacks
während eines laufenden Jobs lässt dessen Quelle auf `processing` stehen, bis
sie erneut eingestellt wird — der Aufräumer für abgestandene Jobs kommt mit
M7-T2.

**Der Seed ist nicht gelaufen und soll es auch nicht.** `SEED_ON_START` steht auf
`false`, und in `NODE_ENV=production` bricht `prisma/seed.ts` ohnehin ab. Das
Demo-Notizbuch wird mit einem eigenen Befehl gesetzt (M8-T1), damit das Anlegen
von Demo-Inhalten eine Entscheidung bleibt und kein Nebeneffekt eines Neustarts.

**Das Tagesbudget greift ab jetzt.** `DAILY_SPEND_CAP_CENTS` aus der
Backend-Konfiguration wird vor jeder neuen Quelle gegen die Summe in `usage_log`
gehalten. Ist die Summe nicht lesbar, wird abgelehnt statt geraten; ein
Notizbuch, dem eine Quelle mit 503 verweigert wird, ist dann das erwartete
Verhalten und kein Fehler.

## Ein späterer Deploy

```bash
bash deployment/prod/deploy.sh
```

Spiegeln, bauen, starten, Zustand zeigen, Health prüfen. Was das Skript bewusst
nicht tut: Konfiguration übertragen, Migrationen ausführen (das macht der
Entrypoint des Backend-Containers), die Firewall anfassen (die hängt an ihrer
systemd-Unit) oder Sicherungen berühren.

## Sicherung

`quellwerk-backup.sh` nach `/usr/local/bin`, die Cron-Datei nach
`/etc/cron.d/quellwerk-backup`, Ziel `/var/backups/quellwerk`, sieben Tage
Aufbewahrung. Einmal von Hand ausführen **und einmal zurückspielen**; eine
Sicherung, die niemand zurückgespielt hat, ist eine Hoffnung. Das ist M8-T6 und
noch offen.

Gesichert wird die Datenbank, nicht das Upload-Volume. Der Text jeder Quelle
liegt in Postgres und ist das, worauf jedes Zitat zeigt; die hochgeladene
Originaldatei wird nur zum erneuten Herunterladen gebraucht und ist im Zweifel
wieder hochladbar. Das steht so auch in docs/KNOWN-LIMITS.md.

## Was beim Deploy schiefgehen kann

Diese vier haben es beim ersten Mal tatsächlich getan.

**Kein Projektname.** Ohne `name:` heißt das Projekt wie der Ordner, hier also
`docker`. Das ist kein Schönheitsfehler: die Volumes heißen dann
`docker_postgres_data`, und das Netz `docker_internal`, während
`quellwerk-firewall.sh` auf `quellwerk_internal` wartet. Es findet nichts, meldet
"Netz nicht da, nichts zu tun" und beendet sich mit 0. Die Firewall wäre still
nicht gesetzt gewesen.

**Redis in der Neustartschleife.** Der Entrypoint wechselt per `su-exec` auf den
Benutzer `redis` und braucht dafür `SETGID` und `SETUID`. Bei `cap_drop: ALL`
ohne diese beiden scheitert das Anlegen von `appendonlydir` an
`Permission denied`, und der Container startet in Ruhe immer wieder neu.

**Der Healthcheck war schneller als die Migrationen.** Beim allerersten Start
läuft `prisma migrate deploy` im Entrypoint, bevor der Server lauscht. Mit
`start_period: 40s` galt das Backend als unhealthy; der Worker wartet auf
`service_healthy` und startete deshalb gar nicht. Jetzt 120s. Ein großes
Startfenster kostet nichts: fehlgeschlagene Versuche darin zählen nicht gegen
`retries`, und ein erfolgreicher beendet es sofort.

**Die Konfigurationsdatei wird beim Erzeugen eines Containers gelesen, nicht beim
Start.** Wer einen Wert ändert, braucht `docker compose up -d --force-recreate`;
ein `restart` liest die Datei nicht neu. Das trifft besonders den API-Schlüssel,
der oft als Letztes eingetragen wird.

Und die zwei Wege, die offen sein müssen, sonst sieht man einen 502 vom Nginx
oder `fetch failed` im Backend: Host nach Container und Container nach Internet.
SECURITY.md 4.3 nennt für beide die Regel und den Prüfbefehl.
