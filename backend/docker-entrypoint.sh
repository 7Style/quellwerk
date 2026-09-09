#!/bin/bash
# ==============================================================================
# Backend container entrypoint
#
# 1. prisma migrate deploy   (never `db push --accept-data-loss`)
# 2. optional seed           (only SEED_ON_START=true and NODE_ENV != production)
# 3. exec the CMD            (node dist/app/server.js or pnpm run dev)
#
# Runs from the package directory (production image: /usr/src/app with
# prisma.config.ts, prisma/ and dist/; development image: /usr/src/app/backend).
# The prisma CLI is a regular dependency: the development image calls it via
# `pnpm exec prisma`, the production image (no pnpm) via its node entry.
# ==============================================================================
set -euo pipefail

APP_LABEL="${APP_NAME:-bp-monolith}"

# Connection URLs are only ever printed through this mask: the credential part
# (user:password@) becomes user:***@ before anything reaches the container log.
mask_url() {
  printf '%s' "$1" | sed -E 's#(//[^:/@]+):[^@]*@#\1:***@#'
}

echo "Starting ${APP_LABEL} backend"
echo "   Environment: ${NODE_ENV:-development}"
echo "   Database:    $(mask_url "${DATABASE_URL:-<unset>}")"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

# Wait for the database (compose `depends_on: service_healthy` covers the
# normal case; this loop covers restarts and plain `docker run`).
if command -v pnpm >/dev/null 2>&1; then
  PRISMA="pnpm exec prisma"
else
  PRISMA="node node_modules/prisma/build/index.js"
fi

echo "Applying database migrations (prisma migrate deploy)..."
attempt=1
until $PRISMA migrate deploy; do
  if [ "$attempt" -ge 10 ]; then
    echo "Migrations failed after ${attempt} attempts" >&2
    exit 1
  fi
  echo "   Database not ready yet (attempt ${attempt}/10), retrying in 3s..."
  attempt=$((attempt + 1))
  sleep 3
done
echo "Migrations applied"

# In development the generated client lives in app/generated and app/ is a
# bind mount, so regenerate it before starting tsx watch.
if [ "${NODE_ENV:-development}" != "production" ] && [ -n "${GENERATE_ON_START:-}" ]; then
  echo "Generating Prisma client..."
  $PRISMA generate
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  if [ "${NODE_ENV:-development}" = "production" ]; then
    echo "SEED_ON_START ignored: seeding is disabled in production" >&2
  elif [ -f dist/prisma/seed.js ]; then
    # Production image: tsx (the `prisma db seed` runner) is a dev dependency
    # and not installed, so run the compiled seed directly.
    echo "Seeding database (SEED_ON_START=true, dist/prisma/seed.js)..."
    node dist/prisma/seed.js
  else
    echo "Seeding database (SEED_ON_START=true)..."
    $PRISMA db seed
  fi
fi

echo "Starting application: $*"
exec "$@"
