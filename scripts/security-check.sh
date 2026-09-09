#!/usr/bin/env bash
# ==============================================================================
# Security Check -- bp-monolith
# ==============================================================================
# Prüft Compose-Dateien, Code, Workflows und Umgebungsdateien auf bekannte
# Sicherheitsfehler. Exit 1 bei mindestens einem Befund (FAIL).
#
# Aufruf:
#   bash scripts/security-check.sh            # gesamter Arbeitsbaum
#   bash scripts/security-check.sh --staged   # nur Dateien aus dem Git-Index
#
# Wird von .husky/pre-commit (--staged) und .github/workflows/ci.yml aufgerufen.
# ==============================================================================

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

MODE="tree"
if [ "${1:-}" = "--staged" ]; then
  MODE="staged"
fi

if [ -t 1 ]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; NC=""
fi

ERRORS=0
WARNINGS=0

fail() { printf '  %sFAIL: %s%s\n' "$RED" "$1" "$NC"; ERRORS=$((ERRORS + 1)); }
warn() { printf '  %sWARN: %s%s\n' "$YELLOW" "$1" "$NC"; WARNINGS=$((WARNINGS + 1)); }
ok()   { printf '  %sOK: %s%s\n' "$GREEN" "$1" "$NC"; }
detail() { printf '%s\n' "$1" | sed 's/^/       /'; }

# ------------------------------------------------------------------------------
# Dateiliste: Arbeitsbaum oder Index
# ------------------------------------------------------------------------------
if [ "$MODE" = "staged" ]; then
  ALL_FILES=$(git diff --cached --name-only --diff-filter=ACMR)
else
  ALL_FILES=$(git ls-files --cached --others --exclude-standard)
fi

# content FILE: Inhalt aus dem Index (--staged) oder aus dem Arbeitsbaum
content() {
  if [ "$MODE" = "staged" ]; then
    git show ":$1" 2>/dev/null || true
  else
    cat "$1" 2>/dev/null || true
  fi
}

list_matching() { printf '%s\n' "$ALL_FILES" | grep -E "$1" || true; }

COMPOSE_FILES=$(list_matching '(^|/)docker-compose[^/]*\.ya?ml$')
CODE_FILES=$(list_matching '^backend/app/.*\.ts$' | grep -v -E '\.(test|spec)\.ts$' || true)
WORKFLOW_FILES=$(list_matching '^\.github/workflows/.*\.ya?ml$')

echo "=============================================="
echo " Security Check -- bp-monolith ($MODE)"
echo "=============================================="
echo ""

# ------------------------------------------------------------------------------
# 1. Compose: Ports ohne 127.0.0.1 (80/443 für Nginx erlaubt)
# ------------------------------------------------------------------------------
echo "--- Compose: Port-Bindings ---"
if [ -z "$COMPOSE_FILES" ]; then
  ok "keine Compose-Dateien im Umfang"
fi
for f in $COMPOSE_FILES; do
  UNSAFE=$(content "$f" | grep -n -E '^[[:space:]]*-[[:space:]]*"?(0\.0\.0\.0:)?[0-9]+:[0-9]+"?[[:space:]]*$' \
    | grep -v -E '^[0-9]+:[[:space:]]*-[[:space:]]*"?(80:80|443:443)"?[[:space:]]*$' || true)
  if [ -n "$UNSAFE" ]; then
    fail "$f bindet Ports auf 0.0.0.0 (offen ins Internet):"
    detail "$UNSAFE"
  else
    ok "$f: alle Ports auf 127.0.0.1 (oder 80/443)"
  fi
done

# ------------------------------------------------------------------------------
# 2. Compose: Docker-Socket-Mounts (Kommentare ignoriert)
# ------------------------------------------------------------------------------
echo ""
echo "--- Compose: Docker-Socket ---"
ERRORS_BEFORE=$ERRORS
for f in $COMPOSE_FILES; do
  SOCK=$(content "$f" | grep -n 'docker\.sock' | grep -v -E '^[0-9]+:[[:space:]]*#' || true)
  if [ -n "$SOCK" ]; then
    fail "$f mountet den Docker-Socket (= root auf dem Host):"
    detail "$SOCK"
  fi
done
[ -n "$COMPOSE_FILES" ] && [ "$ERRORS" -eq "$ERRORS_BEFORE" ] && ok "kein Docker-Socket-Mount"

# ------------------------------------------------------------------------------
# 3. Compose: Redis ohne Passwort, Default-Passwörter, fail-open Variablen
# ------------------------------------------------------------------------------
echo ""
echo "--- Compose: Passwörter ---"
ERRORS_BEFORE=$ERRORS
for f in $COMPOSE_FILES; do
  BODY=$(content "$f")
  if printf '%s\n' "$BODY" | grep -q -E 'image:[[:space:]]*redis'; then
    if ! printf '%s\n' "$BODY" | grep -q -- '--requirepass'; then
      fail "$f: Redis ohne --requirepass"
    fi
  fi
  WEAK=$(printf '%s\n' "$BODY" | grep -n -E 'bp_password|bp_redis_dev_password|:-(password|secret|changeme|change-me|admin|redis|postgres)\b' || true)
  if [ -n "$WEAK" ]; then
    fail "$f enthält schwache Default-Passwörter:"
    detail "$WEAK"
  fi
  # Passwort-Variablen müssen fail-closed sein: mindestens einmal ${VAR:?...}
  # in der Datei, nirgends ${VAR:-default}
  for var in POSTGRES_PASSWORD REDIS_PASSWORD; do
    if printf '%s\n' "$BODY" | grep -q -E "\\$\\{${var}([:}]|$)"; then
      if ! printf '%s\n' "$BODY" | grep -q -E "\\$\\{${var}:\\?"; then
        fail "$f: ${var} wird benutzt, aber nirgends mit \${${var}:?...} erzwungen (fail-open)"
      fi
      DEF=$(printf '%s\n' "$BODY" | grep -n -E "\\$\\{${var}:-" || true)
      if [ -n "$DEF" ]; then
        fail "$f: ${var} mit Default-Wert:"
        detail "$DEF"
      fi
    fi
  done
done
[ -n "$COMPOSE_FILES" ] && [ "$ERRORS" -eq "$ERRORS_BEFORE" ] && ok "Redis mit Passwort, keine Default-Passwörter, Passwörter fail-closed"

# ------------------------------------------------------------------------------
# 4. Code: CORS-Wildcard
# ------------------------------------------------------------------------------
echo ""
echo "--- Code: CORS ---"
CORS_HITS=""
for f in $CODE_FILES; do
  H=$(content "$f" | grep -n -E "origin:[[:space:]]*[\"']\*[\"']" | grep -v -E '^[0-9]+:[[:space:]]*//' || true)
  [ -n "$H" ] && CORS_HITS="${CORS_HITS}${f}: ${H}"$'\n'
done
if [ -n "$CORS_HITS" ]; then
  fail "CORS origin: '*' im Code:"
  detail "$CORS_HITS"
else
  ok "keine CORS-Wildcard"
fi

# ------------------------------------------------------------------------------
# 5. Code: hart kodierte Secrets und Fallbacks
# ------------------------------------------------------------------------------
echo ""
echo "--- Code: hart kodierte Secrets ---"
# Trifft bekannte Platzhalter und jeden Fallback der Form
# process.env.<...SECRET|KEY|PASSWORD> || '<literal>' (Variablenname endet auf SECRET/KEY/PASSWORD).
SECRET_RE="(dev-secret|dev-refresh-secret|change-in-production|change-me|changeme|your-secret-key|your-[a-z-]*secret|default-[a-z-]*(key|secret)|TempPassword|super-secret|(SECRET|_KEY|PASSWORD)[[:space:]]*(\|\||\?\?)[[:space:]]*['\"][^'\"]{6,}['\"])"
SECRET_HITS=""
for f in $CODE_FILES; do
  H=$(content "$f" | grep -n -E "$SECRET_RE" | grep -v -E '^[0-9]+:[[:space:]]*(//|\*)' || true)
  [ -n "$H" ] && SECRET_HITS="${SECRET_HITS}${f}:"$'\n'"${H}"$'\n'
done
if [ -n "$SECRET_HITS" ]; then
  fail "hart kodierte Secrets oder Fallbacks im Code:"
  detail "$SECRET_HITS"
else
  ok "keine hart kodierten Secrets"
fi

# ------------------------------------------------------------------------------
# 6. Git: keine .env-Datei getrackt
# ------------------------------------------------------------------------------
echo ""
echo "--- Git: getrackte .env-Dateien ---"
if [ "$MODE" = "staged" ]; then
  TRACKED_ENV=$(printf '%s\n' "$ALL_FILES" | grep -E '(^|/)\.env(\.[^/]+)?$' | grep -v -E '\.env\.example$|example\.env$' || true)
else
  TRACKED_ENV=$(git ls-files | grep -E '(^|/)\.env(\.[^/]+)?$' | grep -v -E '\.env\.example$|example\.env$' || true)
fi
if [ -n "$TRACKED_ENV" ]; then
  fail ".env-Dateien im Git-Index:"
  detail "$TRACKED_ENV"
else
  ok "keine .env-Datei getrackt"
fi

# ------------------------------------------------------------------------------
# 7. Workflows: Inline-Interpolation von PR-Daten in run:-Blöcken
# ------------------------------------------------------------------------------
echo ""
echo "--- Workflows: Script-Injection ---"
WF_HITS=""
for f in $WORKFLOW_FILES; do
  H=$(content "$f" | grep -n -E '\$\{\{[[:space:]]*github\.(event\.(pull_request|issue|comment|review)\.(title|body)|head_ref)' \
    | grep -v -E '^[0-9]+:[[:space:]]*[A-Z_]+:[[:space:]]*\$\{\{' || true)
  [ -n "$H" ] && WF_HITS="${WF_HITS}${f}:"$'\n'"${H}"$'\n'
done
if [ -n "$WF_HITS" ]; then
  fail "PR-Titel/Branch direkt interpoliert (nur über env: erlaubt):"
  detail "$WF_HITS"
else
  ok "keine Inline-Interpolation von PR-Daten"
fi

# ------------------------------------------------------------------------------
# 8. Lokale .env: leere oder Platzhalter-Werte (nur Arbeitsbaum)
# ------------------------------------------------------------------------------
if [ "$MODE" = "tree" ]; then
  echo ""
  echo "--- .env: leere Passwörter und Platzhalter ---"
  for envf in .env backend/.env; do
    [ -f "$envf" ] || continue
    EMPTY=$(grep -n -E '^(.*(PASSWORD|SECRET|KEY))=[[:space:]]*("")?$' "$envf" || true)
    PLACEHOLDER=$(grep -n -E '^(.*(PASSWORD|SECRET|KEY))=.*(CHANGE_ME|change-this|your-|changeme|example)' "$envf" || true)
    if [ -n "$EMPTY" ]; then
      fail "$envf: leere Secrets:"; detail "$EMPTY"
    fi
    if [ -n "$PLACEHOLDER" ]; then
      fail "$envf: Platzhalter statt Secret:"; detail "$PLACEHOLDER"
    fi
    if [ -z "$EMPTY" ] && [ -z "$PLACEHOLDER" ]; then
      ok "$envf: Secrets gesetzt"
    fi
  done
fi

# ------------------------------------------------------------------------------
# Ergebnis
# ------------------------------------------------------------------------------
echo ""
echo "=============================================="
if [ "$ERRORS" -gt 0 ]; then
  printf '%s %d FAIL, %d WARN -- Security check FAILED%s\n' "$RED" "$ERRORS" "$WARNINGS" "$NC"
  exit 1
fi
printf '%s 0 FAIL, %d WARN -- Security check PASSED%s\n' "$GREEN" "$WARNINGS" "$NC"
exit 0
