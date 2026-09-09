/**
 * Global Express request augmentation (Express 5 / @types/express 5).
 * Must be a module (see the `export {}` at the end) so that the
 * `declare global` block merges with the ambient Express namespace.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        sessionId?: string;
        permissions: string[];
        roles: Array<{
          id: number;
          code: string;
        }>;
      };
      token?: string;
    }
  }
}

export {};
