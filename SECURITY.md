# Sicherheit

Ein Dokument für alles, was Quellwerk vor Angriffen schützt: die Regeln aus drei
Server-Einbrüchen, die Härtung des Servers, Docker und Firewall, Nginx und TLS, das
Runbook für eine Neuinstallation und die Kontrollen in der Anwendung. Es ersetzt die vier
Einzeldokumente, die ich nach den Einbrüchen geschrieben habe (Server-Security-Guide,
Server-Härtung, Docker-Sicherheit, Server-Neuinstallation); die liegen noch in der
Git-Historie unter `hack/`. Wer wenig Zeit hat, liest Abschnitt 2 und die Checkliste in
Abschnitt 8.

1. Vorfall und Ursache
2. Die fünf goldenen Regeln und das Zielbild
3. Server härten: SSH, UFW, fail2ban, System
4. Docker: Daemon, Compose-Regeln, Firewall und Container-Netz, Datenbanken
5. Nginx und TLS
6. Neuinstallation eines Servers (Runbook)
7. Kontrollen in der Anwendung
8. Checkliste vor jedem Deploy und Prüfbefehle
9. Cheatsheet
10. Historie

---

## 1. Vorfall und Ursache

Drei Einbrüche auf meinen Servern, alle mit derselben Ursache:

| Einbruch | Ursache | Folge |
|---|---|---|
| 1 | `ports: "6379:6379"` ohne Passwort. Redis stand für die ganze Welt offen, Docker hat UFW umgangen. | Server für ausgehende DDoS-Angriffe missbraucht (UDP- und TCP-Flood), vom Hoster abgeschaltet. |
| 2 | Nach der Neuinstallation: Docker-Bridge-Netze umgingen UFW erneut, dazu der Docker-Socket im Backend-Container. | Erneut kompromittiert, Server gelöscht. |
| 3 | Dieselben Schwachstellen, die Docker-Konfiguration war nicht grundlegend geändert. | Dritte Neuinstallation, Architektur neu aufgesetzt. |

Die drei Fehler im Klartext:

```yaml
# Fehler 1: Port auf 0.0.0.0, die ganze Welt kann verbinden
redis:
  ports:
    - "6379:6379"          # identisch mit 0.0.0.0:6379:6379

# Fehler 2: kein Passwort, jeder kann Redis-Befehle ausführen
redis:
  image: redis:7-alpine    # Default = kein Passwort

# Fehler 3: Docker-Socket im Container = Root auf dem Host
backend:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

Warum UFW nicht geholfen hat: Docker schreibt eigene iptables-Regeln in die Ketten
PREROUTING und FORWARD, und die greifen vor den UFW-Ketten. `ufw deny 6379` ist damit
wirkungslos. Der Angreifer hat über das offene Redis Schlüssel eingeschleust und den
Server als Angriffswerkzeug benutzt.

```
Was ich dachte:         Internet -> UFW (blockt 6379) -> Redis
Was wirklich passierte: Internet -> iptables DOCKER-Kette -> Redis, UFW komplett umgangen
```

---

## 2. Die fünf goldenen Regeln und das Zielbild

```
REGEL 1:  NIE     ports: "PORT:PORT"  (ohne 127.0.0.1 davor)
REGEL 2:  IMMER   Passwörter für Redis und PostgreSQL
REGEL 3:  NIE     /var/run/docker.sock in einen Container mounten
REGEL 4:  WENN    ein Port auf dem Host nötig ist: 127.0.0.1:PORT:PORT
REGEL 5:  WENN    nur Container untereinander reden: gar kein ports:
```

Drei davon hätten alle drei Einbrüche verhindert: kein `ports:` ohne 127.0.0.1, immer
Passwörter, nie der Docker-Socket. Der Rest dieses Dokuments ist Absicherung in der Tiefe.

```
  Internet
     |
  [ UFW: eingehend nur 22/80/443, ausgehend nur das Nötige ]
     |
  [ Nginx auf dem Host: :80 -> Redirect, :443 TLS ]
     |
     +-- /api/, /health --> 127.0.0.1:3021 -> backend :3011 (Container, internes Netz)
     |                                          |
     |                                          +-- db:5432    PostgreSQL 17 (nur intern, Passwort, kein Host-Port)
     |                                          +-- redis:6379 Redis 8 (nur intern, Passwort, AOF, kein Host-Port)
     |                                          +-- worker     BullMQ, gleiches Image, kein Port
     |
     +-- /               --> 127.0.0.1:3020 -> frontend :3000 (Container, internes Netz)

  Container: kein Docker-Socket, no-new-privileges, Datenbanken mit cap_drop ALL,
             Prozesse ohne Root. Nach draußen nur der Backend- und Worker-Aufruf
             an api.anthropic.com über die Regeln in 4.3.
```

Lokal (`docker-compose.yml` im Root) liegen Datenbank und Redis zusätzlich auf
`127.0.0.1:5432` und `127.0.0.1:6379`, weil Tests, Migrationen und Evals auf dem Host
laufen. In Produktion (`deployment/prod/`) haben beide gar kein `ports:`.

---

## 3. Server härten

### 3.1 SSH: nur Schlüssel, kein Passwort

`/etc/ssh/sshd_config`:

```
PermitRootLogin prohibit-password
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
Banner /etc/issue.net
```

`AllowUsers` auf die Konten begrenzen, die sich wirklich einloggen (root und das
Deploy-Konto aus GitHub Actions). Cloud-Init überschreibt sonst die Einstellung, deshalb
zusätzlich `/etc/ssh/sshd_config.d/50-cloud-init.conf` mit `PasswordAuthentication no`.

Bevor `systemctl restart sshd` läuft: in einer zweiten Session prüfen, dass der Login mit
Schlüssel funktioniert. Sonst sperrt man sich selbst aus.

Dateirechte: `chmod 700 ~/.ssh`, `chmod 600 ~/.ssh/authorized_keys`. Login-Banner in
`/etc/issue.net`: "Authorized access only. All connections are monitored."

### 3.2 UFW: alles verbieten, nur das Nötige erlauben

```bash
apt-get install -y ufw
ufw default deny incoming
ufw default deny outgoing
ufw default deny routed           # Weiterleitung nur mit expliziten Regeln, siehe 4.3

ufw allow in 22/tcp               # SSH
ufw allow in 80/tcp               # HTTP (Let's Encrypt, Redirect)
ufw allow in 443/tcp              # HTTPS

ufw allow out 22/tcp              # git, GitHub
ufw allow out 53/udp              # DNS
ufw allow out 80/tcp              # apt, certbot
ufw allow out 443/tcp             # GitHub, GHCR, Anthropic
ufw allow out 123/udp             # NTP

ufw enable
ufw status verbose
```

`/etc/ufw/before.rules` darf keine Docker-Bridge-Regeln alter Installationen enthalten
(`grep "docker0\|172.16" /etc/ufw/before.rules` bleibt leer). Die Regeln für das
Container-Netz kommen in Abschnitt 4.3 dazu.

### 3.3 fail2ban gegen SSH-Brute-Force

```bash
apt-get install -y fail2ban
cat > /etc/fail2ban/jail.local <<'EOT'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
EOT
systemctl enable --now fail2ban
fail2ban-client status sshd
```

### 3.4 System

```bash
apt-get install -y unattended-upgrades       # automatische Sicherheitsupdates
dpkg-reconfigure -plow unattended-upgrades
timedatectl set-timezone Europe/Berlin
echo "tmpfs /run/shm tmpfs defaults,noexec,nosuid 0 0" >> /etc/fstab
systemctl list-units --type=service --state=running   # was läuft, das nicht laufen muss?
```

Kernel-Parameter in `/etc/sysctl.d/90-hardening.conf`, danach `sysctl --system`:

```
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
```

`net.ipv4.ip_forward` bleibt auf 1. Ein Docker-Host mit Bridge-Netz braucht die
Weiterleitung, sonst kommen die Container nicht ins Internet. Die alte Empfehlung
`ip_forward = 0` gilt nur für Server ohne Container-Netz (Variante B in 4.4).

---

## 4. Docker

### 4.1 Daemon: Docker darf die Firewall nicht selbst umbauen

`/etc/docker/daemon.json` auf einem Server, der nur Quellwerk fährt:

```json
{
  "iptables": false,
  "bridge": "none",
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

| Option | Wirkung |
|---|---|
| `"iptables": false` | Docker schreibt keine iptables-Regeln. UFW hat die volle Kontrolle. Veröffentlichte Ports laufen über den Userland-Proxy, der nur auf der angegebenen Adresse lauscht. |
| `"bridge": "none"` | Kein `docker0`. Nur die Netze, die Compose anlegt. |
| `log-opts` | Logrotation, die Platte läuft nicht voll. |

Nach `systemctl restart docker` prüfen: `docker network ls` zeigt nur `host`, `none` und
die Compose-Netze; `ip link show docker0` meldet "does not exist".

Auf einem geteilten Server, auf dem andere Stacks Dockers eigene iptables-Regeln
brauchen, bleibt `iptables` an. Dann gilt Abschnitt 4.3 in der zweiten Fassung: Docker
macht NAT selbst, und die DOCKER-USER-Kette entscheidet, was von außen an Container
darf. Welche Fassung auf dem Server gilt, steht in `docs/DEPLOY.md`.

### 4.2 Compose-Regeln

So sind `docker-compose.yml` und `deployment/prod/` gebaut, und so bleiben sie:

- Datenbanken haben in Produktion kein `ports:`; sie sind nur im Netz `internal`
  erreichbar. Lokal binden sie ausschließlich `127.0.0.1`.
- Backend und Frontend binden nur `127.0.0.1:PORT:PORT`; davor steht der Host-Nginx.
  Der Nginx-Container aus der Vorlage (`ports: 80:80, 443:443`) fliegt in M8 raus;
  nur ein Prozess auf dem Host hat Ports nach außen, und die Zertifikate liegen außerhalb
  von Docker.
- Passwörter kommen aus der `.env` neben der Compose-Datei und haben keine Defaults
  (`${POSTGRES_PASSWORD:?POSTGRES_PASSWORD fehlt}`): ohne Wert startet Compose nicht.
- Redis mit `--requirepass`, `--appendonly yes`, `--maxmemory-policy noeviction`
  (die Zähler der Rate-Limits und die BullMQ-Jobs dürfen nicht verdrängt werden).
- Jeder Container `security_opt: [no-new-privileges:true]`; Datenbanken `cap_drop: ALL`
  plus die wenigen Capabilities, die das Image braucht; Speicher- und CPU-Limits gesetzt.
- Kein `/var/run/docker.sock`, in keinem Dienst, auch nicht read-only.
- Keine Secrets in der Compose-Datei, keine im Image: `.env`-Dateien stehen im
  `.dockerignore`, `NEXT_PUBLIC_*` ist das einzige Build-Argument.
- Prozesse im Container laufen ohne Root (`nodejs`, `nextjs`).

```yaml
# verboten                                    # richtig
ports:                                        ports:
  - "5432:5432"                                 - "127.0.0.1:5432:5432"   # oder gar kein ports:
  - "0.0.0.0:6379:6379"
redis:                                        redis:
  image: redis:8-alpine                         command: ["redis-server", "--requirepass", "${REDIS_PASSWORD:?}", "--appendonly", "yes"]
volumes:                                      volumes:
  - /var/run/docker.sock:/var/run/docker.sock   # weglassen
```

### 4.3 Firewall und Container-Netz

Das Container-Netz bekommt in `deployment/prod/` einen festen Bridge-Namen und ein festes
Subnetz, damit Firewall-Regeln nicht an einem zufälligen `br-1a2b3c` hängen:

```yaml
networks:
  internal:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: br-quellwerk
    ipam:
      config:
        - subnet: 172.30.0.0/24
```

Zwei Wege müssen offen sein, sonst gibt es 502 vom Nginx und "fetch failed" zur
Anthropic-API aus dem Backend: Host nach Container (der Userland-Proxy von Docker
erreicht die Container-IPs; UFW `default deny outgoing` blockt das, bis das
Bridge-Interface freigegeben ist) und Container nach Internet (Backend und Worker rufen
`api.anthropic.com`).

**So läuft `intern`: Docker mit `"iptables": false`.** Der Daemon fasst die Firewall
nicht an, also legt jeder Stack seine eigenen Regeln an, und zwar in einem eigenen
Skript mit eigener systemd-Unit. Vorbild ist `nexom-firewall`, das dort schon so läuft.
Die Regel für den Weg vom Host ins Netz gehört zu UFW und übersteht damit einen Reboot
von selbst:

```bash
ufw allow out to 172.30.0.0/24
```

Alles andere steht in `/usr/local/bin/quellwerk-firewall.sh`, ausgeführt von
`quellwerk-firewall.service` (`Type=oneshot`, `After=docker.service`,
`Wants=docker.service`, `RemainAfterExit=yes`). Das Skript tut vier Dinge, jedes davon
erst nach einer Prüfung mit `iptables -C`, damit ein zweiter Lauf nichts verdoppelt:

1. warten, bis das Docker-Netz da ist (die Bridge `br-quellwerk` existiert), denn die
   Unit startet nach `docker.service`, aber das Netz entsteht erst mit dem ersten
   `compose up`
2. das Subnetz aus dem Netz auslesen statt es im Skript zu wiederholen, damit Compose
   und Firewall nie auseinanderlaufen
3. `MASQUERADE` für dieses Subnetz nach draußen, weil Docker das mit abgeschalteten
   iptables nicht selbst anlegt
4. zwei Regeln in `DOCKER-USER`, beide mit `-I DOCKER-USER 1` an den ANFANG der Kette:
   Egress vom Subnetz nach draußen und die Antworten mit `ESTABLISHED,RELATED` zurück.
   Niemals mit `-A`: am Ende von `DOCKER-USER` steht auf `intern` eine DROP-Regel von
   orbynt für eingehendes TCP auf `ens192`, angehängte Regeln stünden dahinter und wären
   wirkungslos. Kette und der Sprung aus `FORWARD` existieren dort bereits; das Skript
   legt beides nur an, falls es fehlt.

Von Hand gesetzte iptables-Regeln verschwinden beim Reboot; deshalb die Unit und nicht
die Kommandozeile. Das Skript liegt unter `deployment/prod/firewall/` im Repository und
wird auf den Server kopiert, damit die Regeln versioniert sind und nicht nur auf der
Platte des Servers existieren.

**Die Alternative, Docker verwaltet iptables selbst.** Dann legt der Daemon NAT und
Forwarding an, und zu tun bleibt der Weg vom Host in das Netz und die Regel, dass von
außen nichts an Container geht, was nicht über 127.0.0.1 veröffentlicht ist:

```bash
ufw allow out on br-quellwerk to 172.30.0.0/24
iptables -I DOCKER-USER -i ens192 ! -s 127.0.0.0/8 -o br-quellwerk -m conntrack --ctstate NEW -j DROP
```

Diese Fassung gilt für `intern` NICHT. Sie steht hier, weil sie auf einem Server
gebraucht wird, der Docker die Firewall überlassen darf, und damit der Unterschied
sichtbar bleibt.

`ens192` ist auf `intern` das Interface mit der Default-Route (`ip route show default`).
DNS aus Containern läuft über Dockers eingebauten Resolver im Host-Kontext, darum reicht
die Host-Regel für 53/udp. Prüfen, bevor die App live geht:

```bash
C="docker compose -f deployment/prod/docker/docker-compose.yml"
$C exec backend node -e "fetch('https://api.anthropic.com/v1/models').then(r=>console.log('reachable', r.status)).catch(e=>console.log('blocked', e.cause?.code ?? e.message))"
# erwartet: reachable und ein Statuscode (401 ohne Schlüssel ist richtig), nie "blocked"
curl -sI http://127.0.0.1:3021/health | head -1
# erwartet: HTTP/1.1 200
```

## 5. Nginx und TLS

Nginx läuft auf dem Host, nicht im Container. Er ist der einzige Dienst mit Ports nach
außen. Die vollständige Vhost-Datei liegt nach M8 unter
`deployment/prod/nginx/quellwerk.conf`; das sind die Stellen, die für die Sicherheit
zählen:

```nginx
upstream qw_backend  { server 127.0.0.1:3021; }     # nie eine Container-IP, nie 0.0.0.0
upstream qw_frontend { server 127.0.0.1:3020; }
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {                                            # :80 nur für ACME und den Redirect
    listen 80; listen [::]:80;
    server_name quellwerk.7style.net;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$server_name$request_uri; }
}

server {
    listen 443 ssl; listen [::]:443 ssl; http2 on;
    server_name quellwerk.7style.net;
    ssl_certificate     /etc/letsencrypt/live/quellwerk.7style.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/quellwerk.7style.net/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_tickets off;
    server_tokens off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Robots-Tag "noindex" always;       # Bewerbungsdemo, nicht indexieren
    client_max_body_size 25m;                       # 20 MB Upload-Limit der App plus Reserve

    location /api/ {                                # SSE: kein Buffering, lange Timeouts
        limit_req zone=api burst=30 nodelay;
        proxy_pass http://qw_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
    }
    location = /health { proxy_pass http://qw_backend; }
    location / { proxy_pass http://qw_frontend; proxy_set_header Host $host;
                 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                 proxy_set_header X-Forwarded-Proto $scheme; }
}
```

`X-Forwarded-For` ist die einzige Quelle für die Client-IP; das Backend vertraut mit
`TRUST_PROXY=1` genau diesem einen Hop. CSP, Referrer-Policy und die Frame-Regeln setzt
die App selbst (Helmet für die API, Next.js-Header für die Seiten), damit sie mit dem Code
versioniert sind; Nginx wiederholt sie nicht.

Zertifikat, sobald der A-Record auf den Server zeigt (`dig +short quellwerk.7style.net A`):

```bash
apt-get install -y nginx certbot
mkdir -p /var/www/certbot
cp deployment/prod/nginx/quellwerk.conf /etc/nginx/sites-available/quellwerk
ln -sf /etc/nginx/sites-available/quellwerk /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx                 # zuerst nur der HTTP-Block
certbot certonly --webroot -w /var/www/certbot -d quellwerk.7style.net \
  --non-interactive --agree-tos -m <mail>
nginx -t && systemctl reload nginx                 # jetzt mit dem HTTPS-Block
systemctl list-timers | grep certbot               # Auto-Renewal aktiv
certbot renew --dry-run
```

---

## 6. Neuinstallation eines Servers (Runbook)

Reihenfolge für einen frischen Ubuntu-Server, Ziel `/apps/quellwerk`. Jeder Schritt
verweist auf den Abschnitt mit den Details; `docs/DEPLOY.md` (M8) hat die konkreten
Befehle für den aktuellen Server.

1. `apt update && apt upgrade -y`, Neustart bei Kernel-Update, Zeitzone, Grundwerkzeuge
   (`curl git htop ca-certificates gnupg`), Abschnitt 3.4.
2. Eigenen Schlüssel hinterlegen (`ssh-copy-id -i ~/.ssh/id_ed25519.pub root@SERVER`),
   SSH härten, in einer zweiten Session testen (3.1).
3. UFW (3.2), fail2ban (3.3), unattended-upgrades und sysctl (3.4).
4. Docker (`curl -fsSL https://get.docker.com | sh`, `systemctl enable --now docker`),
   `daemon.json` je nach Fassung (4.1), Docker neu starten, prüfen.
5. Deploy-Konto und Schlüssel für GitHub Actions: eigener Nutzer in der Gruppe `docker`
   oder root mit eigenem Schlüssel; der private Schlüssel geht als `DEPLOY_SSH_KEY` in die
   Repository-Secrets und nirgendwo sonst hin. Für private GHCR-Images ein PAT mit nur
   `read:packages` für `docker login ghcr.io`; entfällt, sobald die Images public sind.
6. `mkdir -p /apps && cd /apps && git clone git@github.com:7Style/quellwerk.git && cd quellwerk`.
7. `.env` für Compose und `backend/.env` anlegen: alle Secrets neu erzeugen
   (`openssl rand -hex 24` für Datenbank und Redis, `-hex 32` für `SESSION_SECRET`,
   `-hex 16` für `ADMIN_TOKEN`), nie Werte aus der Entwicklung, nie Werte von alten
   Servern. `chmod 600` auf beide. `NODE_ENV=production`, `TRUST_PROXY=1`,
   `PUBLIC_URL` und `CORS_ORIGIN` auf `https://quellwerk.7style.net`, `SEED_ON_START`
   nur für den ersten Start.
8. Firewall-Regeln für das Container-Netz (4.3): UFW-Regel plus das Stack-Skript mit
   seiner systemd-Unit.
9. Nginx mit dem HTTP-Block, Zertifikat holen, HTTPS-Block aktivieren (5).
10. Compose gegen die Checkliste prüfen (8), `bash scripts/security-check.sh`, dann
    `docker compose -f deployment/prod/docker/docker-compose.yml up -d`, `ps`,
    `logs -f backend` (Migrationen angewendet, Seed gelaufen, keine Fehler).
11. Backup einspielen, falls vorhanden:
    `docker compose ... exec -T db psql -U qw_user -d quellwerk < backup.sql`;
    sonst ist der Seed der Startzustand.
12. Abschluss-Checks von außen und innen (8), Backup-Cron (`deployment/prod/backup.sh`)
    eintragen, DNS-TTL wieder hochsetzen.

Bei einem Serverwechsel mit neuer IP: TTL vorher auf 300 senken, A-Record umstellen,
dann `certbot renew --force-renewal`.

---

## 7. Kontrollen in der Anwendung

Das ist der Sollzustand, gegen den der Code gebaut wird: Session und Quota-Gerüst in M0,
Ingestion in M2, Zitatprüfung in M3, Härtung und Datenschutz in M7. Die Zahlen stehen in
`docs/SPEC.md`; dieser Abschnitt nennt sie, damit die Checkliste ohne Suchen auskommt.

### 7.1 Secrets und Konfiguration

- `backend/app/config/env.config.ts` ist die einzige Stelle, die `process.env` liest
  (zod 4). Pflicht und ohne Fallback: `SESSION_SECRET` (32+ Zeichen),
  `ANTHROPIC_API_KEY`, `ADMIN_TOKEN` (16+), `DATABASE_URL`, `REDIS_URL`. Leere Werte
  gelten als fehlend; ohne sie startet das Backend nicht.
- Compose-Passwörter ohne Default (`${VAR:?}`); `.env`-Dateien nie im Git-Index
  (`scripts/security-check.sh` im Pre-Commit und in CI, gitleaks über die ganze Historie
  in CI und mit `--pre-commit --staged` lokal).
- Der Coding-Agent liest keine `.env`: Read-Deny in `.claude/settings.json`, Hook gegen
  Edit/Write (`block-protected.sh`) und gegen Bash-Befehle, die eine Env-Datei nennen
  (`block-env-read.sh`); Ausnahmen nur `example.env` und `.env.example`. Die Env-Dateien
  schreibe ich von Hand.
- Modellinferenz bei Anthropic ist der einzige externe Aufruf, hinter
  `AnthropicLlmAdapter` mit `maxRetries 4`. Modell-IDs nur aus `MODEL_CHAT`,
  `MODEL_FAST`, `MODEL_JUDGE`, nie im Code.

### 7.2 Sessions ohne Benutzerkonten

- Anonyme Session per `express-session` mit Redis-Store: signiertes Cookie, `httpOnly`,
  `sameSite=lax`, `secure` hinter dem Proxy (`TRUST_PROXY=1`), 30 Tage.
- Jede Notizbuch-Abfrage ist auf die Session begrenzt; fremde Notizbücher sind unsichtbar
  (404, kein 403, damit keine IDs bestätigt werden).
- Das Demo-Notizbuch ist für alle lesbar. Beim ersten Schreibzugriff wird es in die eigene
  Session kopiert (Copy-on-first-write); das Original wird nie beschrieben.
- CSRF auf allen POST-, PATCH- und DELETE-Routen: ein `Origin`-Header, der nicht zu
  `CORS_ORIGIN` passt, oder `Sec-Fetch-Site: cross-site` ergibt 403. Requests ohne beide
  Header (curl, Smoke-Test) passieren, weil sie kein fremdes Cookie mitschicken können.

### 7.3 Quota und Missbrauch

- `express-rate-limit` mit Redis-Store, je Limiter ein eigener Prefix; IP nur aus `req.ip`
  hinter `trust proxy`, nie aus einem Header, den der Client setzt.
- Limits: 30 Chat-Requests pro Stunde und Session, 60 pro Stunde und IP, 10 Artefakte und
  20 Quellen pro Stunde und Session; 429 mit lesbarer Meldung, die die UI zeigt.
- Tagesbudget aus `usage_log`: ab `DAILY_SPEND_CAP_CENTS` antworten alle Modellrouten mit
  503 und dem Banner "Tagesbudget erreicht". Die Spend-Limit-Fehler von Anthropic landen
  auf demselben Banner.
- Kappungen: 50 Quellen und 150.000 Token je Notizbuch (gemessen am echten Request),
  20 MB je Upload, 4.000 Zeichen je Frage.
- Nginx `limit_req` als äußere Schranke (Abschnitt 5).
- Aufräumjob täglich: anonyme Notizbücher ohne Nutzung seit 7 Tagen werden samt Dateien
  gelöscht.

### 7.4 Quellen, Uploads und URLs

- Upload-Allowlist: PDF (nur mit Textebene), `.txt`, `.md`, `.docx`; Prüfung am Inhalt,
  nicht nur am Content-Type; Dateinamen per `randomUUID()`, Ablage im Volume
  `UPLOAD_DIR` mit `safePath`-Prüfung, Zugriff nur über die eigene Session.
- Multer-Limits für `fileSize`, `files`, `fields`, `parts`, `fieldNameSize`.
- URL-Quellen: nur `http` und `https`; private und Link-Local-Bereiche gesperrt
  (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254), auch nach
  Redirects; Timeout und Größenlimit.
- Quelltext wird einmal normalisiert und danach nie verändert. Jedes Zitat wird vor dem
  Rendern gegen den gespeicherten Text geprüft (`slice === cited_text`); ein Treffer ohne
  Übereinstimmung wird verworfen und gezählt, nie angezeigt.
- Quellen sind Daten, keine Anweisungen: der Systemprompt sagt das ausdrücklich, der
  Source Guide markiert Texte, die einen Assistenten adressieren, mit einer Warnung, und
  jeder in einen Prompt eingesetzte Wert kommt mit escapten spitzen Klammern an
  (`prompts/README.md`).

### 7.5 HTTP und Logging

- Helmet auf der API: HSTS, Referrer-Policy, `X-Powered-By` entfernt. CSP ohne Nonce in
  den Next.js-Headern (`default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `connect-src` nur der eigene Origin), dazu `X-Robots-Tag: noindex`.
- CORS: Allowlist aus `CORS_ORIGIN` (kommagetrennt) plus localhost-Ports in der
  Entwicklung; unbekannte Origins bekommen die Antwort ohne CORS-Header, nie einen 500.
- Compression lässt `text/event-stream` aus, sonst puffert sie den Chat-Stream.
- Fehlerantworten ohne Stack-Traces in Produktion; zod-Fehler als 400 mit Feldliste.
- Logs enthalten Request-Id, IDs und Längen: nie Quelltext, Fragen, Antworten oder
  Secrets. Der Logger maskiert `authorization`, `cookie`, `password`, `token`, `secret`
  in allen Transports; morgan loggt keine Query-Strings; der Container-Entrypoint gibt
  Verbindungs-URLs nur maskiert aus.
- `/health` ohne Auth (Postgres, Redis); `/api/admin/stats` nur mit `ADMIN_TOKEN`.

### 7.6 Datenschutz

- Seite `/datenschutz`: Zweck (Bewerbungsdemo), was wo gespeichert wird (eigener Server
  in Deutschland: Postgres, Redis, Dateien), Auftragsverarbeiter (Anthropic unter seiner
  DPA mit EU-Standardvertragsklauseln, kein Training auf API-Daten, Löschung innerhalb
  von 30 Tagen; Google nur, falls die Audio Overview gebaut wird, und dann nur mit dem
  erzeugten Skript, nie mit Quelltext), das technisch notwendige Session-Cookie (kein
  Banner), Löschung nach 7 Tagen, Kontaktadresse.
- "Notizbuch löschen" löscht Zeilen und Dateien sofort und endgültig.
- `robots.txt` mit `Disallow: /` und `X-Robots-Tag: noindex`.

---

## 8. Checkliste vor jedem Deploy und Prüfbefehle

Compose und Umgebung

- [ ] Kein `ports:` ohne `127.0.0.1`; Datenbanken in Produktion ganz ohne Ports
- [ ] Redis mit `--requirepass`, `--appendonly yes`, `noeviction`
- [ ] `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `SESSION_SECRET`, `ADMIN_TOKEN`,
      `ANTHROPIC_API_KEY` gesetzt, keine Platzhalter, `chmod 600` auf beiden Env-Dateien
- [ ] Kein Docker-Socket-Mount; `no-new-privileges` überall; `cap_drop: ALL` bei den Datenbanken
- [ ] `NODE_ENV=production`, `TRUST_PROXY=1`, `PUBLIC_URL` und `CORS_ORIGIN` auf die
      Domain, `SEED_ON_START` nach dem ersten Start wieder aus
- [ ] `bash scripts/security-check.sh` ohne FAIL

Server

- [ ] SSH nur mit Schlüssel, fail2ban aktiv
- [ ] `ufw status verbose`: deny incoming, deny outgoing, deny routed, herein nur 22/80/443
- [ ] `daemon.json` passend zu 4.1 (`"iptables": false` auf `intern`);
      `quellwerk-firewall.service` aktiv und `systemctl status` grün
- [ ] Anthropic aus dem Backend-Container erreichbar (4.3)
- [ ] Zertifikat gültig, Renewal-Timer aktiv, Backup-Cron eingetragen

```bash
bash scripts/security-check.sh

# nichts auf 0.0.0.0 außer sshd und nginx
ss -tlnp | grep "0.0.0.0" | grep -v "sshd\|nginx"
docker ps --format "{{.Names}}: {{.Ports}}" | grep "0.0.0.0"            # erwartet: nichts

# Redis verlangt ein Passwort
docker compose -f deployment/prod/docker/docker-compose.yml exec redis redis-cli ping
# erwartet: NOAUTH Authentication required

# kein Socket in irgendeinem Container
docker inspect $(docker ps -q) | grep -i "docker.sock"                  # erwartet: nichts

# UFW ohne Docker-Reste
grep "docker0\|172.16" /etc/ufw/before.rules                            # erwartet: nichts

# von einem ANDEREN Rechner aus
nmap -p 3020,3021,5432,6379 SERVER_IP                                   # erwartet: filtered oder closed
curl -sI https://quellwerk.7style.net/health | head -1                 # erwartet: 200

# Brute-Force-Lage
fail2ban-client status sshd
grep "Failed password" /var/log/auth.log | tail -5
```

`scripts/security-check.sh` prüft Compose-Ports ohne 127.0.0.1, Docker-Socket-Mounts,
Redis ohne Passwort, schwache oder fail-open Passwort-Variablen, CORS-Wildcards,
Secret-Fallbacks im Backend-Code, getrackte `.env`-Dateien, Inline-Interpolation von
PR-Daten in Workflows und leere oder Platzhalter-Secrets in lokalen `.env`-Dateien.
Exit 1 bei jedem Befund; `--staged` prüft nur den Git-Index (Pre-Commit).

---

## 9. Cheatsheet

```bash
# Secrets erzeugen
openssl rand -hex 24        # Datenbank, Redis
openssl rand -hex 32        # SESSION_SECRET
openssl rand -hex 16        # ADMIN_TOKEN

# Stack auf dem Server
cd /apps/quellwerk
C="docker compose -f deployment/prod/docker/docker-compose.yml"
$C pull && $C up -d; $C ps; $C logs -f backend; $C restart backend; $C down

# Datenbank
$C exec db pg_dump -U qw_user quellwerk > backups/quellwerk_$(date +%Y%m%d).sql
$C exec -T db psql -U qw_user -d quellwerk < backups/quellwerk_20260901.sql

# Nginx und TLS
nginx -t && systemctl reload nginx
tail -f /var/log/nginx/error.log
certbot certificates; certbot renew --dry-run

# Sicherheit auf einen Blick
ufw status | head -5; docker network ls; ss -tlnp | grep "0.0.0.0" | grep -v "sshd\|nginx"; \
docker ps --format "{{.Names}}: {{.Ports}}"

# Ressourcen
docker stats; df -h; docker system df; htop
```

---

## 10. Historie

Die Vorlage dieses Repos (mein BP Monolith) enthielt in Commit `326febbb` vom
2025-11-29 eine `backend/.env` mit echten Werten für `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `SESSION_SECRET` und `SMTP_PASS`. Diese Werte gelten als
kompromittiert und werden nirgends wiederverwendet. Quellwerk startet mit einer sauberen
Historie; alle Secrets sind neu erzeugt, und gitleaks läuft in CI über jeden Commit.
