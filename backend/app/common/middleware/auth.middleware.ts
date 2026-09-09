import type { Request } from 'express';

/**
 * Application-wide authentication middleware.
 *
 * There is exactly one JWT implementation in the backend: the auth module's
 * TokenUtil (HS256, shared secret, issuer and audience configured once by
 * AuthModule). The users, audit-logs and upload modules therefore reuse the
 * auth module's middleware instead of verifying tokens a second time.
 */
export {
  authMiddleware,
  optionalAuthMiddleware,
} from '../../modules/auth/internal/middleware/auth.middleware.js';

/**
 * Request with the authenticated user attached. `Request.user` is declared
 * globally in app/types/express.d.ts; the alias is kept for compatibility.
 */
export type AuthRequest = Request;
