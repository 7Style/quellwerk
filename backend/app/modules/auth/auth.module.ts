import { Router, type Express, type NextFunction, type Request, type Response } from 'express';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { PrismaClient as AppPrismaClient } from '../../lib/prisma.js';
import { sensitiveColumns } from '../../lib/prisma-omit.js';
import { AuthService } from './services/auth.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { PermissionService } from './services/permission.service.js';
import { PermissionController } from './controllers/permission.controller.js';
import { TokenService } from './services/token.service.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createPermissionRoutes } from './routes/permission.routes.js';
import type { IAuthModule, IAuthModuleConfig } from './interfaces/module.interface.js';
import type { IAuthEmailSender } from './interfaces/email-sender.interface.js';
import { EventEmitter } from 'node:events';
import { AuthEvents } from './events/auth.events.js';
import { initAuthServices, resetAuthDependencies } from './services/base.service.js';
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER, TokenUtil } from './internal/utils/token.util.js';
import { CryptoUtil } from './internal/utils/crypto.util.js';
import { setLogger } from './internal/utils/logger.util.js';
import { configureAuthEmailNotifications } from './configs/email-notifications.config.js';

export class AuthModule implements IAuthModule {
  private authService: AuthService;
  private authController: AuthController;
  private permissionService: PermissionService;
  private permissionController: PermissionController;
  private tokenService: TokenService;
  private router: Router;
  private events: EventEmitter;
  private prisma: AppPrismaClient;

  constructor(private config: IAuthModuleConfig, private emailSender?: IAuthEmailSender) {
    // Initialize internal event system
    this.events = new EventEmitter();

    // Route the module's internal logging through the injected logger
    setLogger(config.logger);

    // Initialize database
    if (config.prismaClient) {
      // Use external PrismaClient if provided
      this.prisma = config.prismaClient;
    } else if (config.databaseUrl) {
      // Standalone use without a host client (Prisma 7 requires a driver
      // adapter). Same sensitive-column omit as the application client; the
      // cast only bridges the log-option generics of the two constructors.
      this.prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: config.databaseUrl }),
        omit: sensitiveColumns,
      }) as unknown as AppPrismaClient;
    } else {
      throw new Error('Either prismaClient or databaseUrl must be provided');
    }

    // Zentrale Initialisierung aller Service-Dependencies
    initAuthServices({
      prisma: this.prisma,
      config: config,
      events: this.events,
      emailSender: this.emailSender,
      logger: config.logger,
    });

    // Configure TokenUtil with the same issuer/audience as token generation
    TokenUtil.configure({
      jwtSecret: config.jwtSecret,
      jwtExpiresIn: config.jwtExpiresIn || '15m',
      refreshSecret: config.refreshSecret,
      refreshExpiresIn: config.refreshExpiresIn || '7d',
      issuer: config.jwtIssuer || DEFAULT_JWT_ISSUER,
      audience: config.jwtAudience || DEFAULT_JWT_AUDIENCE,
    });

    // Key for 2FA secrets at rest and email template settings
    CryptoUtil.configure({ encryptionKey: config.twoFactorSecret });
    configureAuthEmailNotifications({
      frontendUrl: config.frontendUrl,
      ...config.emailNotifications,
    });

    // Initialize services - jetzt ohne Parameter!
    // (Services holen sich ihre Dependencies automatisch aus der globalen Initialisierung)
    this.authService = new AuthService();
    this.permissionService = new PermissionService();
    this.tokenService = new TokenService();

    // Initialize controllers
    this.authController = new AuthController(this.authService);
    this.permissionController = new PermissionController(this.permissionService);

    // Initialize routes - combine auth and permission routes
    const authRouter = createAuthRoutes(this.authController, config);
    const permissionRouter = createPermissionRoutes(
      this.permissionController,
      this.getAuthMiddleware()
    );

    // Combine routers
    this.router = Router();
    this.router.use(authRouter);
    this.router.use(permissionRouter);

    this.config.logger.info('[Auth] Module initialized', {
      version: '2.0.0',
      features: [
        'jwt',
        'refresh-tokens',
        '2fa',
        'otp-login',
        'password-reset',
        'permission-system',
        'backend-driven-auth',
      ],
    });
  }

  /**
   * Mount the module routes on Express app
   */
  public mount(app: Express, basePath: string = '/api/auth'): void {
    app.use(basePath, this.router);
    this.config.logger.info(`[Auth] Module mounted at ${basePath}`);
  }

  /**
   * Get the Express router for manual mounting
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Subscribe to auth events
   */
  public on(event: keyof typeof AuthEvents, handler: (...args: unknown[]) => void): void {
    this.events.on(AuthEvents[event], handler);
  }

  /**
   * Get service instances (for testing or direct access)
   */
  public getServices() {
    return {
      auth: this.authService,
      session: this.authService.getSessionService(),
      twoFactor: this.authService.getTwoFactorService(),
      oneTimePassword: this.authService.getOneTimePasswordService(),
      permission: this.permissionService,
    };
  }

  /**
   * Get permission service for other modules
   */
  public getPermissionService(): PermissionService {
    return this.permissionService;
  }

  /**
   * Get authenticate middleware for other modules.
   * Verifies the access token (with roles/permissions) and attaches the user.
   */
  public getAuthMiddleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          res.status(401).json({ error: 'No token provided' });
          return;
        }

        const token = authHeader.substring(7);

        // Use tokenService instead of secureTokenService to verify tokens with roles/permissions
        const payload = await this.tokenService.verifyAccessToken(token);

        // Attach user info to request
        req.user = {
          id: Number.parseInt(payload.sub ?? '0', 10),
          email: payload.email ?? '',
          sessionId: payload.sessionId,
          roles: (payload.roles ?? []).map((role: string) => ({ id: 0, code: role })),
          permissions: payload.permissions ?? [],
        };
        req.token = token;

        next();
      } catch {
        res.status(401).json({ error: 'Invalid token' });
      }
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.config.logger.info('[Auth] Shutting down module...');

    // Close database connections only if we created the client
    if (!this.config.prismaClient && this.config.databaseUrl) {
      await this.prisma.$disconnect();
    }

    // Remove all event listeners
    this.events.removeAllListeners();

    // Reset global dependencies
    resetAuthDependencies();
    setLogger(null);

    this.config.logger.info('[Auth] Module shutdown complete');
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; details: Record<string, unknown> }> {
    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'healthy',
        details: {
          database: 'connected',
          services: 'operational',
          version: '1.0.0',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          database: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
