#!/usr/bin/env bash
# ==============================================================================
# Quellwerk, Deploy von Hand auf "intern".
#
# Solange es kein GitHub-Repository gibt, wird der Code gespiegelt und auf dem
# Server gebaut. Das Skript laeuft auf dem ARBEITSRECHNER, nicht auf dem Server.
#
#   bash deployment/prod/deploy.sh              # spiegeln, bauen, starten
#   bash deployment/prod/deploy.sh --dry-run    # nur zeigen, was rsync taete
#
# Was es bewusst NICHT tut:
#   - Konfigurationsdateien uebertragen. .env und backend/.env werden auf dem
#     Server von Hand geschrieben und haben dort eigene Werte. rsync schliesst
#     sie aus, damit ein Deploy sie nie ueberschreibt.
#   - Migrationen ausfuehren. Das macht der Entrypoint des Backend-Containers.
#   - Die Firewall anfassen. Die haengt an ihrer systemd-Unit.
#   - Backups beruehren. Die liegen unter /var/backups/quellwerk, ausserhalb
#     dieses Verzeichnisses; laegen sie darin, raeumte --delete sie beim
#     naechsten Deploy weg.
#
# Ebenfalls ausgeschlossen, weil der Server sie nicht braucht: .claude, .github,
# .husky und design.
#
# --chown=root:root ist kein Schoenheitsfehler: rsync -a bewahrt Besitzer
# numerisch, und die uid des Arbeitsrechners (501 auf macOS) gehoert auf dem
# Server entweder niemandem oder, schlimmer, spaeter einem Deploy-Benutzer, der
# dann ungefragt an docker-compose.yml schreiben darf.
# ==============================================================================
set -euo pipefail

SERVER="${QW_SERVER:-root@217.160.14.35}"
SSH_KEY="${QW_SSH_KEY:-$HOME/.ssh/strato_migration}"
SSH_CMD="ssh -i ${SSH_KEY}"
REMOTE_DIR="${QW_REMOTE_DIR:-/apps/quellwerk}"
COMPOSE="deployment/prod/docker/docker-compose.yml"

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "Trockenlauf: es wird nichts uebertragen."
fi

if [ ! -f "$COMPOSE" ]; then
  echo "Vom Repository-Wurzelverzeichnis aus starten." >&2
  exit 1
fi

echo "==> Code nach ${SERVER}:${REMOTE_DIR} spiegeln"
rsync -az --delete --stats ${DRY_RUN} \
  -e "${SSH_CMD}" \
  --chown=root:root \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude 'logs/' \
  --exclude 'uploads/' \
  --exclude 'app/generated/' \
  --exclude '.lh/' \
  --exclude '.claude/' \
  --exclude '.husky/' \
  --exclude '.github/' \
  --exclude 'design/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'docker-compose.override.yml' \
  ./ "${SERVER}:${REMOTE_DIR}/"

if [ -n "$DRY_RUN" ]; then
  echo "Trockenlauf beendet."
  exit 0
fi

echo "==> Images auf dem Server bauen und starten"
${SSH_CMD} "$SERVER" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE} --env-file .env up -d --build"

echo "==> Zustand"
${SSH_CMD} "$SERVER" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE} ps --format '{{.Service}} {{.Status}}'"

echo "==> Healthcheck ueber den Host"
${SSH_CMD} "$SERVER" "curl -sI http://127.0.0.1:3021/health | head -1"
