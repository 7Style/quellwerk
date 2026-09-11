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

## Auf dem Server

Der Server `intern` trägt weitere Seiten, Quellwerk ist ein Gast darauf. Daraus
folgen drei Regeln, die den ganzen Abschnitt bestimmen: kein Container
veröffentlicht auf `0.0.0.0`, der Nginx läuft auf dem Host und nicht im
Container, und Docker verwaltet seine iptables-Regeln selbst (SECURITY.md 4.3,
Fassung 2).

Der Ablauf steht in M8-T2 und M8-T3 in `docs/PLAN.md` und wird beim ersten Deploy
hier mit den echten Ausgaben festgehalten:

1. Code nach `/apps/quellwerk` spiegeln (`rsync`, ohne `node_modules`, ohne
   Konfigurationsdateien)
2. Konfiguration auf dem Server von Hand schreiben, mit eigenen Werten
3. Images auf dem Server bauen und starten
4. Nginx-Vhost auf dem Host, dann das Zertifikat über certbot
5. Firewall nach SECURITY.md 4.3, Fassung 2, inklusive der systemd-Unit, damit
   die Regel einen Reboot überlebt
6. Die Prüfbefehle aus SECURITY.md 4.3 und Abschnitt 8

Solange es kein GitHub-Repository gibt, läuft der Deploy von Hand. Der Workflow
mit GHCR und SSH aus GitHub Actions kommt nach, sobald das Repository steht; die
Aufgabe dafür steht als M8-T5 im Plan.

## Was beim Deploy schiefgehen kann

Zwei Wege müssen offen sein, sonst sieht man einen 502 vom Nginx oder
`fetch failed` im Backend: Host nach Container und Container nach Internet.
SECURITY.md 4.3 nennt für beide die Regel und den Prüfbefehl.

Die Konfigurationsdatei wird beim Erzeugen eines Containers gelesen, nicht beim
Start. Wer einen Wert ändert, braucht `docker compose up -d --force-recreate`;
ein `restart` liest die Datei nicht neu.
