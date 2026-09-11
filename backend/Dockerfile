# syntax=docker/dockerfile:1
# ==============================================================================
# Backend production image (multi-stage, pnpm workspace)
#
# Build context is the REPOSITORY ROOT:
#   docker build -f backend/Dockerfile -t quellwerk-backend .
#
# Only the files needed for the build are copied (never node_modules, .env,
# dist or logs), so the image cannot pick up local secrets or artefacts.
# Ignore rules live in the root .dockerignore (the only ignore file).
# ==============================================================================

FROM node:24-bookworm-slim AS base
ENV HUSKY=0 \
    CI=true \
    PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Corepack is no longer shipped with Node >= 25, so pnpm is installed with npm
RUN npm i -g pnpm@11.26.0
WORKDIR /repo

# ------------------------------------------------------------------------------
# Dependencies: only the manifests first for a cacheable install layer
# ------------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
# The backend's postinstall runs `prisma generate`, so the schema and the CLI
# config have to be present before the install (no database needed for it,
# see prisma.config.ts).
COPY backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
# The demo notebook is seeded from these four files (M2-T5), so the seed needs
# them inside the image. It is the same tree the golden set quotes; a second
# copy of the text would let the demo and the evals drift apart.
COPY backend/evals/corpus backend/evals/corpus
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @quellwerk/backend...

# ------------------------------------------------------------------------------
# Build: prisma generate + tsc, then a pruned production deployment
# ------------------------------------------------------------------------------
FROM deps AS build
# Both configs: tsconfig.build.json extends tsconfig.json and is what `build`
# compiles with. Copying only the first one fails here and nowhere else, because
# neither `pnpm verify` nor CI builds this image.
COPY backend/tsconfig.json backend/tsconfig.build.json backend/
COPY backend/app backend/app
# Explicit generate as well: the client must match the schema in this layer
RUN pnpm --filter @quellwerk/backend exec prisma generate \
    && pnpm --filter @quellwerk/backend run build \
    && pnpm --filter @quellwerk/backend deploy --prod /out

# ------------------------------------------------------------------------------
# Runtime: no build toolchain, no dev dependencies, non-root user
# ------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
# UPLOAD_DIR is the path every compose file mounts the backend_uploads volume
# on; keep the two in sync (docker-compose.yml, deployment/*/docker/).
ENV NODE_ENV=production \
    HUSKY=0 \
    PORT=3011 \
    HOST=0.0.0.0 \
    UPLOAD_DIR=/usr/src/app/uploads
WORKDIR /usr/src/app

# curl for container health checks
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r nodejs -g 1001 \
    && useradd -r -g nodejs -u 1001 -d /usr/src/app -s /sbin/nologin nodejs

# Deployed package: package.json, node_modules (prod only), dist/, prisma/
COPY --from=build --chown=nodejs:nodejs /out/package.json ./package.json
COPY --from=build --chown=nodejs:nodejs /out/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /out/dist ./dist
COPY --from=build --chown=nodejs:nodejs /out/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /out/prisma.config.ts ./prisma.config.ts
# Prompts are application data, not documentation: the loader reads them at
# runtime. They sit one level above the package root, so `../prompts` resolves
# the same way in the image as it does from backend/ in a checkout.
COPY --chown=nodejs:nodejs prompts /usr/src/prompts
# The four corpus files the demo notebook is seeded from (M2-T5). Application
# data like the prompts, not documentation: the seed reads them at runtime and
# they are the same tree the golden set quotes.
COPY --chown=nodejs:nodejs backend/evals/corpus ./evals/corpus
COPY --chown=nodejs:nodejs backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# logs/ and uploads/ (= UPLOAD_DIR) must be writable by the non-root user; a
# named volume mounted on uploads/ inherits this ownership on first creation.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /usr/src/app/logs /usr/src/app/uploads \
    && chown -R nodejs:nodejs /usr/src/app/logs /usr/src/app/uploads

USER nodejs

EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/app/server.js"]
