import { Router, type RequestHandler } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { AuthController } from '../controllers/auth.controller.js';
import {
  authMiddleware,
  optionalAuthMiddleware,
  twoFactorStatusAuthMiddleware,
} from '../internal/index.js';
import type { IAuthModuleConfig } from '../interfaces/module.interface.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export function createAuthRoutes(authController: AuthController, config: IAuthModuleConfig): Router {
  const router = Router();

  // Every limiter gets its own store/prefix (Redis when the host app provides
  // a store factory, in-memory otherwise). The general limiter of the host
  // application already covers these routes, so nothing is counted twice.
  const limiter = (name: string, options: Partial<Options>): RequestHandler =>
    rateLimit({
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...options,
      store: config.rateLimitStore?.(`auth-${name}`),
    });

  const loginLimiter = limiter('login', {
    windowMs: config.rateLimitWindowMs ?? FIFTEEN_MINUTES,
    limit: config.rateLimitMax ?? 5,
    message: 'Too many login attempts, please try again later',
    skipSuccessfulRequests: true,
  });

  const refreshLimiter = limiter('refresh', {
    windowMs: FIFTEEN_MINUTES,
    limit: config.rateLimitRefreshMax ?? 30,
    message: 'Too many token refresh attempts, please try again later',
  });

  const passwordResetLimiter = limiter('password-reset', {
    windowMs: ONE_HOUR,
    limit: config.rateLimitPasswordResetMax ?? 3,
    message: 'Too many password reset requests, please try again later',
  });

  const twoFactorLimiter = limiter('2fa', {
    windowMs: FIVE_MINUTES,
    limit: config.rateLimitTwoFactorMax ?? 5,
    message: 'Too many 2FA verification attempts, please try again later',
    skipSuccessfulRequests: true,
  });

  // Registration, the e-mail lookup and OTP requests answer 2xx on success,
  // so they must not share the login limiter (skipSuccessfulRequests would
  // never count them): counted per request, per IP.
  const registrationLimiter = limiter('register', {
    windowMs: ONE_HOUR,
    limit: config.rateLimitRegistrationMax ?? 5,
    message: 'Too many registration attempts, please try again later',
  });

  const lookupLimiter = limiter('lookup', {
    windowMs: FIFTEEN_MINUTES,
    limit: config.rateLimitLookupMax ?? 20,
    message: 'Too many requests, please try again later',
  });

  // Controller methods are `(req, res, next) => Promise<void>`; Express 5
  // forwards rejected promises to the error middleware.
  type HandlerName = {
    [K in keyof AuthController]: AuthController[K] extends (
      req: Parameters<RequestHandler>[0],
      res: Parameters<RequestHandler>[1],
      next: Parameters<RequestHandler>[2]
    ) => Promise<void>
      ? K
      : never;
  }[keyof AuthController];
  const bind =
    (name: HandlerName): RequestHandler =>
    (req, res, next) =>
      authController[name](req, res, next);

  // --- Public Routes ---

  // Authentication
  router.post('/login', loginLimiter, bind('login'));
  router.post('/register', registrationLimiter, bind('register'));
  router.post('/check-email', lookupLimiter, bind('checkEmail'));
  router.post('/refresh', refreshLimiter, bind('refreshToken'));

  // Password Reset
  router.post('/password/reset-request', passwordResetLimiter, bind('requestPasswordReset'));
  router.post('/password/reset', passwordResetLimiter, bind('resetPassword'));
  router.post('/password/setup', optionalAuthMiddleware, loginLimiter, bind('setupPassword'));

  // Email Verification
  router.post('/email/verify', loginLimiter, bind('verifyEmail'));
  router.post('/email/resend', passwordResetLimiter, bind('resendVerificationEmail'));

  // One-Time Password Authentication
  router.post('/otp/request', lookupLimiter, bind('requestOneTimePassword'));
  router.post('/otp/verify', loginLimiter, bind('verifyOneTimePassword'));
  router.post('/otp/token', loginLimiter, bind('verifyOneTimePasswordToken'));

  // --- Protected Routes ---

  // Logout
  router.post('/logout', authMiddleware, bind('logout'));

  // Current User
  router.get('/me', authMiddleware, bind('getCurrentUser'));

  // Password Change
  router.post('/password/change', authMiddleware, bind('changePassword'));

  // Two-Factor Authentication Management
  // /2fa/verify completes a login: the temporary token from /login travels in the body.
  router.post('/2fa/verify', twoFactorLimiter, bind('verify2FA'));

  // Setup and re-setup need a full access token, i.e. a session that already
  // passed 2FA (or an account without 2FA). The temporary token from /login
  // must never reach these handlers: with the password alone an attacker could
  // otherwise replace the second factor and log in with the fresh backup codes.
  router.post('/2fa/setup', authMiddleware, bind('setup2FA'));
  router.post('/2fa/verify-setup', authMiddleware, twoFactorLimiter, bind('verify2FASetup'));
  // Status only: readable with a normal access token or the temporary 2FA token
  router.get('/2fa/status', twoFactorStatusAuthMiddleware, bind('get2FAStatus'));
  router.delete('/2fa/disable', authMiddleware, bind('disable2FA'));
  router.post('/2fa/backup-codes', authMiddleware, bind('generateBackupCodes'));
  router.post('/2fa/admin-reset/:userId', authMiddleware, bind('adminResetTwoFactor'));

  // Session Management
  router.get('/sessions', authMiddleware, bind('getSessions'));
  router.delete('/sessions', authMiddleware, bind('terminateOtherSessions'));

  // Alias routes for backwards compatibility
  router.post('/forgot-password', passwordResetLimiter, bind('forgotPassword'));
  router.post('/change-password', authMiddleware, bind('changePassword'));
  router.post('/resend-verification', passwordResetLimiter, bind('resendVerification'));

  // Handle verify-email with token in URL param (backwards compatibility)
  router.post('/verify-email/:token', loginLimiter, (req, res, next) => {
    // Move token from URL param to body
    req.body = { ...((req.body ?? {}) as Record<string, unknown>), token: req.params.token };
    return authController.verifyEmail(req, res, next);
  });

  return router;
}
