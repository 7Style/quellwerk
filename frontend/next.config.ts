import type { NextConfig } from 'next';
import path from 'path';

// The frontend is a package of the pnpm workspace at the repo root (pnpm-lock.yaml lives there and
// `next` itself resolves through the root node_modules/.pnpm store), so both Turbopack and the
// standalone file tracing must use the workspace root, not the package directory.
const workspaceRoot = path.resolve(__dirname, '..');

const nextConfig: NextConfig = {
  // The Dockerfile copies .next/standalone, .next/static and public/ into the runner stage.
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  experimental: {
    // Next 16.3 writes .next/cache/turbopack during `next build` by default; in Docker/CI
    // nothing restores that cache, so it is dead weight in the builder stage.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
