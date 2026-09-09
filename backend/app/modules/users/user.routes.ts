import { Router } from 'express';
import type { PrismaClient } from '../../lib/prisma.js';
import { UserController } from './user.controller.js';
import { UserService } from './services/index.js';
import { authMiddleware as authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorize.middleware.js';
import { createRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { rateLimitConfig } from '../../config/rate-limit.config.js';
import type { IUserEmailSender } from './interfaces/user-email-sender.interface.js';
import { auditLog } from './middleware/audit-log.middleware.js';

export function createUserRoutes(prisma: PrismaClient, emailSender: IUserEmailSender): Router {
  const router = Router();
  const userService = new UserService(prisma, emailSender);
  const c = new UserController(userService);

  // Strict limiter for account creation endpoints, per-user limiter for the API
  const registrationLimiter = createRateLimiter('users-registration', rateLimitConfig.registration);
  const apiLimiter = createRateLimiter('users-api', rateLimitConfig.api);

  // Public self-registration (no roles/flags accepted, see registerUserSchema)
  router.post('/register', registrationLimiter, auditLog('create'), (req, res) => c.register(req, res));

  // All other routes require authentication
  router.use(authenticate);
  router.use(apiLimiter);

  // OTP user creation assigns roles, so it is an admin action
  router.post(
    '/otp',
    registrationLimiter,
    authorize('users:users:create'),
    auditLog('create'),
    (req, res) => c.createOtpUser(req, res)
  );

  // Current user routes (no special permissions required)
  router.get('/me', auditLog('view'), (req, res) => c.getMe(req, res));
  router.put('/me', auditLog('update'), (req, res) => c.updateMe(req, res));
  router.put('/me/password', auditLog('password_change'), (req, res) => c.updateMyPassword(req, res));

  // Utility routes
  router.get('/roles', auditLog('list', 'role'), (req, res) => c.getRoles(req, res));
  router.get('/metadata', auditLog('list', 'metadata'), (req, res) => c.getMetadata(req, res));

  // Statistics route (requires users:users:read permission)
  router.get(
    '/statistics',
    authorize('users:users:read'),
    auditLog('view', 'statistics'),
    (req, res) => c.getStatistics(req, res)
  );

  // CRUD routes (require specific permissions)
  router.post('/', authorize('users:users:create'), auditLog('create'), (req, res) => c.create(req, res));
  router.get('/', authorize('users:users:read'), auditLog('list'), (req, res) => c.findAll(req, res));
  router.get('/:id', authorize('users:users:read'), auditLog('view'), (req, res) => c.findById(req, res));
  router.put('/:id', authorize('users:users:update'), auditLog('update'), (req, res) => c.update(req, res));
  router.delete('/:id', authorize('users:users:delete'), auditLog('delete'), (req, res) => c.delete(req, res));

  // Bulk operations
  router.post(
    '/bulk-deactivate',
    authorize('users:users:update'),
    auditLog('bulk_deactivate'),
    (req, res) => c.bulkDeactivate(req, res)
  );

  // Password management (admin only)
  router.put(
    '/:id/password',
    authorize('users:users:update'),
    auditLog('password_change'),
    (req, res) => c.updateUserPassword(req, res)
  );

  // Role management
  router.post('/:id/roles', authorize('users:roles:assign'), auditLog('assign_role'), (req, res) =>
    c.assignRoles(req, res)
  );
  router.delete(
    '/:id/roles/:roleId',
    authorize('users:roles:assign'),
    auditLog('remove_role'),
    (req, res) => c.removeRole(req, res)
  );

  return router;
}
