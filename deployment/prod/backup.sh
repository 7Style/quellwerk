#!/usr/bin/env bash
# ==============================================================================
# Quellwerk, taegliche Sicherung der Datenbank auf "intern".
#
# Ablage:  /usr/local/bin/quellwerk-backup.sh
# Cron:    /etc/cron.d/quellwerk-backup
# Ziel:    /var/backups/quellwerk
#
# Das Ziel liegt bewusst NICHT unter /apps/quellwerk: dort raeumt `rsync
# --delete` beim naechsten Deploy alles weg, was im Repository nicht existiert.
#
# Gesichert wird die Datenbank, nicht das Upload-Volume. Der Text jeder Quelle
# liegt in Postgres (Source.text) und ist das, worauf jedes Zitat zeigt; die
# hochgeladene Originaldatei wird nur zum erneuten Herunterladen gebraucht und
# ist im Zweifel wieder hochladbar. Das ist eine Entscheidung, keine
# Nachlaessigkeit, und sie steht so auch in docs/KNOWN-LIMITS.md.
# ==============================================================================
set -euo pipefail

APP_DIR="${QW_APP_DIR:-/apps/quellwerk}"
BACKUP_DIR="${QW_BACKUP_DIR:-/var/backups/quellwerk}"
KEEP_DAYS="${QW_KEEP_DAYS:-7}"
COMPOSE_FILE="${APP_DIR}/deployment/prod/docker/docker-compose.yml"

log() { printf '%s quellwerk-backup: %s\n' "$(date -Is)" "$*"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
target="${BACKUP_DIR}/quellwerk-${stamp}.sql.gz"

cd "$APP_DIR"

# pg_dump laeuft IM Container: dort sind Benutzer und Passwort ohnehin gesetzt,
# also steht kein Passwort in der Cron-Zeile oder in der Prozessliste.
if ! docker compose -f "$COMPOSE_FILE" --env-file "${APP_DIR}/.env" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  | gzip -9 > "$target"; then
  log "pg_dump fehlgeschlagen, unvollstaendige Datei wird entfernt"
  rm -f "$target"
  exit 1
fi

# Eine leere oder winzige Datei ist ein stiller Fehlschlag: lieber laut scheitern
# als sieben Tage lang Luft sichern.
size=$(stat -c %s "$target")
if [ "$size" -lt 1024 ]; then
  log "Sicherung ist nur ${size} Byte gross, das kann nicht stimmen"
  rm -f "$target"
  exit 1
fi

chmod 600 "$target"
log "geschrieben: ${target} (${size} Byte)"

deleted=$(find "$BACKUP_DIR" -name 'quellwerk-*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
log "aelter als ${KEEP_DAYS} Tage geloescht: ${deleted}"
log "vorhanden: $(find "$BACKUP_DIR" -name 'quellwerk-*.sql.gz' | wc -l) Sicherungen"
