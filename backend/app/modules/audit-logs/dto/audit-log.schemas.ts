/**
 * Audit-Logs module - query validation schemas (zod 4).
 */
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
const dateFromString = z.coerce.date();

/**
 * GET /api/audit-logs query filters
 */
export const auditLogFilterSchema = z.object({
  userId: positiveInt.optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: positiveInt.optional(),
  action: z.string().trim().max(100).optional(),
  startDate: dateFromString.optional(),
  endDate: dateFromString.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuditLogFilterDto = z.infer<typeof auditLogFilterSchema>;

/**
 * GET /api/audit-logs/export query (format + filters)
 */
export const auditLogExportFormatSchema = z.enum(['csv', 'json', 'excel']);

export const auditLogExportSchema = auditLogFilterSchema
  .omit({ limit: true, offset: true })
  .extend({
    format: auditLogExportFormatSchema,
  });
export type AuditLogExportDto = z.infer<typeof auditLogExportSchema>;
