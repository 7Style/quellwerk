import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { registerModules, registerSessionMiddleware } from './modules/index.js';
import { errorMiddleware, notFoundMiddleware } from './common/middleware/error.middleware.js';
import { createRateLimiter } from './common/middleware/rate-limit.middleware.js';
import { logger } from './common/utils/logger.util.js';
import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';
import { isRedisReady, redis } from './lib/redis.js';

// Request line without the query string, so tokens in URLs never reach the logs
morgan.token('path', (req) => {
  const url = req.url ?? '';
  const end = url.indexOf('?');
  return end === -1 ? url : url.slice(0, end);
});
const LOG_FORMAT =
  ':remote-addr - :remote-user [:date[clf]] ":method :path HTTP/:http-version" :status :res[content-length] ":user-agent"';

export async function createApp(): Promise<Express> {
  const app = express();

  // Proxy hops whose X-Forwarded-For is trusted (TRUST_PROXY, default 1 = nginx)
  app.set('trust proxy', config.trustProxy);
  // Express 5 defaults to the "simple" parser; filters use nested query objects
  app.set('query parser', 'extended');

  // Security headers (helmet 8, explicit configuration)
  app.use(
    helmet({
      contentSecurityPolicy: config.security.helmetCspEnabled
        ? {
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'base-uri': ["'self'"],
              'font-src': ["'self'", 'https:', 'data:'],
              'form-action': ["'self'"],
              'frame-ancestors': ["'none'"],
              'img-src': ["'self'", 'data:'],
              'object-src': ["'none'"],
              'script-src': ["'self'"],
              'script-src-attr': ["'none'"],
              'style-src': ["'self'", "'unsafe-inline'"],
              // Only meaningful behind TLS; would break plain http in development
              'upgrade-insecure-requests': config.isProduction ? [] : null,
            },
          }
        : false,
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // The frontend runs on its own origin and loads uploads/images from the API
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Compression
  if (config.security.compressionEnabled) {
    app.use(compression());
  }

  // CORS -- allowlist only, never a wildcard origin; credentials only with a listed Origin
  app.use(cors(config.corsDelegate));

  // Anonymous session (ADR-0005). Before the rate limiter, because the limiter
  // keys on the session id and would otherwise see none; after `trust proxy`
  // above, because the secure cookie depends on the forwarded protocol.
  registerSessionMiddleware(app);

  // General rate limiting (Redis store, fails open when Redis is unavailable)
  app.use(createRateLimiter('general', config.rateLimit.default));

  // Body parsing (2mb: JSON payloads for bulk operations)
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Request logging
  app.use(
    morgan(LOG_FORMAT, {
      stream: logger.stream,
      skip: (req) => req.path === '/' || req.path === '/health',
    })
  );

  // Health endpoints
  app.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: config.app.name,
      version: config.app.version,
    });
  });

  // Two paths, one handler. `/health` is what the container healthcheck calls
  // inside the network; `/api/health` is what reaches the backend through the
  // host nginx, which proxies `/api/` and keeps the prefix. Without the second
  // one the documented smoke check in docs/DEPLOY.md would hit the frontend.
  app.get(['/health', '/api/health'], async (_req, res) => {
    const checks = { database: 'disconnected', redis: 'disconnected' };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'connected';
    } catch (error) {
      logger.warn('Health check: database unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      if (isRedisReady() && (await redis.ping()) === 'PONG') {
        checks.redis = 'connected';
      }
    } catch (error) {
      logger.warn('Health check: redis unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const healthy = checks.database === 'connected' && checks.redis === 'connected';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      ...checks,
    });
  });

  // Register feature modules (each mounts its own router)
  await registerModules(app);

  // Error handling
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
