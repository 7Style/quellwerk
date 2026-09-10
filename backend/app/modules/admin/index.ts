/**
 * Admin statistics behind ADMIN_TOKEN (SECURITY.md 7.5). The payload carries
 * counts and costs, never source text. Implementation arrives in M7; the module
 * exists here so modules/index.ts has the shape it will keep.
 */
import type { Express } from 'express';

export interface AdminModuleDeps {
  adminToken: string;
}

export function initAdminModule(_app: Express, _deps: AdminModuleDeps): void {
  // M7: GET /api/admin/stats, 401 without the token.
}
