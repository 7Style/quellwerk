# BP Monolith Frontend - Production Dockerfile
#
# Build context is the REPO ROOT (the frontend is a package of the pnpm workspace):
#   docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3011 .
# Ignore rules live in the root .dockerignore (the only ignore file; a
# <Dockerfile>.dockerignore would silently take precedence over it).
#
# NEXT_PUBLIC_* values are inlined at build time: pass them as build args
# (compose: build.args), a runtime `environment:` value changes nothing.

# ---------------------------------------------------------------------------
# Builder: install the workspace subset for the frontend and run `next build`
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder

ENV HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

# Corepack is no longer bundled from Node 25 on; pin pnpm explicitly (must match packageManager).
RUN npm install -g pnpm@11.26.0

WORKDIR /app

# Workspace manifests first so the dependency layer is cached independently of the sources.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile --filter bp-monolith-frontend...

COPY frontend ./frontend

# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_DESCRIPTION
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_DESCRIPTION=$NEXT_PUBLIC_APP_DESCRIPTION

RUN pnpm --filter bp-monolith-frontend run build

# ---------------------------------------------------------------------------
# Runner: only the standalone output, static assets and public/
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

WORKDIR /app

# With outputFileTracingRoot = workspace root the standalone tree keeps the workspace layout:
#   .next/standalone/node_modules          (hoisted pnpm store subset)
#   .next/standalone/frontend/server.js    (+ frontend/node_modules, frontend/.next)
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./frontend/public

USER nextjs

WORKDIR /app/frontend

EXPOSE 3000

CMD ["node", "server.js"]
