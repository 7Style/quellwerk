import { createApp } from './app.js';
import { logger } from './common/utils/logger.util.js';
import { startupStatus } from './common/utils/startup-status.util.js';
import { prisma } from './lib/prisma.js';
import { closeRedis, connectRedis } from './lib/redis.js';
import { config } from './config/index.js';

const PORT = config.port;
// HOST (env, default 0.0.0.0): 127.0.0.1 in deployment/prod-native, where the
// container shares the host network and only the host Nginx may be public.
const HOST = config.host;

async function startServer() {
  // Redis backs the rate limiters, so it must be reachable before routes exist
  try {
    await connectRedis();
    startupStatus.serviceOk('Redis');
  } catch (error) {
    startupStatus.serviceFail('Redis', error);
    throw error;
  }

  const app = await createApp();

  const server = app.listen(PORT, HOST, (error?: Error) => {
    if (error) {
      logger.error('Failed to bind HTTP server', error);
      process.exit(1);
    }

    // Collect runtime info in unified startup summary format
    startupStatus.serviceOk(`Server (${HOST}:${PORT})`);
    startupStatus.serviceOk(`Environment (${config.env})`);
    startupStatus.serviceOk(`API (http://localhost:${PORT}/api)`);
    startupStatus.serviceOk(`Health (http://localhost:${PORT}/health)`);
    // Print startup status summary once server is up
    startupStatus.logSummary();
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Force exit after timeout
    setTimeout(() => {
      logger.error('Force exit after timeout');
      process.exit(1);
    }, 10_000).unref();

    await new Promise<void>((resolve) => {
      server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    try {
      await prisma.$disconnect();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection:', error);
    }

    try {
      await closeRedis();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing redis connection:', error);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', reason);
  });
}

// Start the server
startServer().catch((error: unknown) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
