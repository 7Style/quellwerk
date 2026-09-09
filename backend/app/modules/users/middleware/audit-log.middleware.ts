import { Request, Response, NextFunction } from "express";
import { UserAuditLogService } from "../services/audit-log.service.js";
import { calculateChanges } from "../utils/audit-diff.util.js";
import { prisma } from "../../../lib/prisma.js";
import { logger } from "../../../common/utils/logger.util.js";

// Extend Request type to include audit info
declare global {
  namespace Express {
    interface Request {
      auditLog?: {
        userId?: number;
        entityType?: string;
        entityId?: number;
        action?: string;
        metadata?: any;
      };
    }
  }
}

/**
 * Middleware to automatically log user actions
 */
export function auditLog(action: string, entityType: string = "user") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auditService = new UserAuditLogService();
    // For public endpoints like register, userId might be null initially
    const userId = (req as any).user?.id ? Number((req as any).user.id) : null;

    // Store audit info on request
    req.auditLog = {
      userId: userId || undefined,
      entityType,
      action,
      metadata: {
        ...req.auditLog?.metadata,
        url: req.originalUrl,
        method: req.method,
        query: req.query,
      },
    };

    // Pre-fetch old data for updates and deletes
    // We only do this if we have an ID param and it's a relevant action
    if ((action === "update" || action === "delete" || action === "password_change") && req.params.id) {
      try {
        let oldData: any = null;
        const targetId = Number(req.params.id);

        if (!isNaN(targetId)) {
            // Logic depends on entityType
            if (entityType === "user") {
                oldData = await prisma.user.findUnique({
                    where: { id: targetId },
                });
            }
            
            if (oldData) {
                // Remove sensitive data from oldData log
                if (oldData.password) delete oldData.password;
                
                req.auditLog.metadata = {
                    ...req.auditLog.metadata,
                    oldData,
                };
            }
        }
      } catch (error) {
        logger.debug('[UserAuditLog] Failed to fetch old data', error);
      }
    }
    
    // Special handling for "me" routes
    if ((action === "update" || action === "password_change") && req.path.includes('/me') && userId) {
         try {
            const oldData: any = await prisma.user.findUnique({
                where: { id: userId },
            });
            if (oldData) {
                if (oldData.password) delete oldData.password;
                req.auditLog.metadata = {
                    ...req.auditLog.metadata,
                    oldData,
                };
                req.auditLog.entityId = userId; // Ensure entityId is set
            }
         } catch (error) {
             logger.debug('[UserAuditLog] Failed to fetch old data for /me', error);
         }
    }

    // Capture original end method
    const originalEnd = res.end.bind(res);
    const originalJson = res.json.bind(res);

    // Override json method to capture response
    res.json = function (data: any) {
      const isSuccessful = res.statusCode >= 200 && 
                           res.statusCode < 300 && 
                           (data?.success !== false);

      if (isSuccessful) {
        // Determine the effective User ID (actor)
        // If userId was null (public endpoint), check if we have a user now (e.g. login/register)
        // But for registration, the actor is "System" or "Anonymous", but we link to the Created User ID?
        // The UserAuditLogService handles userId=null by using createdUserId.
        const effectiveUserId = userId || (data?.data?.id ? Number(data.data.id) : 0); 
        // Note: 0 acts as system/anonymous if no user is logged in

        // Extract entity ID
        let entityId = req.params.id ? Number(req.params.id) : undefined;
        if (!entityId && data?.data?.id) {
          entityId = data.data.id;
        }
        if (!entityId && req.auditLog?.entityId) {
            entityId = req.auditLog.entityId;
        }

        const { oldData: _, requestData: __, ...cleanMetadata } = req.auditLog?.metadata || {};

        switch (action) {
          case "view":
            if (entityId) {
              void auditService.logUserView(
                effectiveUserId,
                entityId,
                req.ip,
                req.get("user-agent"),
                cleanMetadata
              );
            }
            break;
            
          case "list":
             void auditService.logAction({
                userId: effectiveUserId,
                entityType,
                action: 'LIST',
                metadata: cleanMetadata,
                ipAddress: req.ip,
                userAgent: req.get("user-agent"),
             });
             break;

          case "create":
            if (entityId) {
              // For user creation, remove password from log data if present (should be handled by controller but safety first)
              const safeData = { ...data.data };
              if (safeData.password) delete safeData.password;

              void auditService.logUserCreate(
                userId, // Pass original userId (null if public)
                entityId,
                safeData,
                req.ip,
                req.get("user-agent"),
                cleanMetadata
              );
            }
            break;

          case "update":
            if (entityId) {
              const newData = data.data || null;
              const oldData = req.auditLog?.metadata?.oldData || null;
              
              const diff = calculateChanges(oldData, newData);
              
              if (newData) {
                void auditService.logUserUpdate(
                  effectiveUserId,
                  entityId,
                  diff.old,
                  diff.new,
                  req.ip,
                  req.get("user-agent"),
                  cleanMetadata
                );
              }
            }
            break;
            
          case "password_change":
             void auditService.logAction({
                 userId: effectiveUserId,
                 entityType: 'user',
                 entityId,
                 action: 'PASSWORD_CHANGE',
                 metadata: cleanMetadata,
                 ipAddress: req.ip,
                 userAgent: req.get("user-agent")
             });
             break;

          case "delete":
            // Handled in res.end usually for 204, but if json returned:
             const deletedData = data?.data || req.auditLog?.metadata?.oldData || { id: entityId };
             void auditService.logUserDelete(
                effectiveUserId,
                entityId || 0,
                deletedData,
                req.ip,
                req.get("user-agent"),
                cleanMetadata
             );
            break;
            
          case "bulk_deactivate":
             void auditService.logBulkAction(
                 effectiveUserId,
                 'BULK_DEACTIVATE',
                 req.body, // Log what was sent
                 req.ip,
                 req.get("user-agent"),
                 cleanMetadata
             );
             break;
             
          case "assign_role":
             void auditService.logRoleChange(
                 effectiveUserId,
                 entityId || 0,
                 'ASSIGN_ROLE',
                 { roleIds: req.body?.roleIds },
                 req.ip,
                 req.get("user-agent"),
                 cleanMetadata
             );
             break;
             
          case "remove_role":
             // Role ID is in params usually
             const roleId = Number(req.params.roleId);
             void auditService.logRoleChange(
                 effectiveUserId,
                 entityId || 0,
                 'REMOVE_ROLE',
                 { roleId },
                 req.ip,
                 req.get("user-agent"),
                 cleanMetadata
             );
             break;

          default:
            void auditService.logAction({
              userId: effectiveUserId,
              entityType,
              entityId,
              action,
              metadata: cleanMetadata,
              ipAddress: req.ip,
              userAgent: req.get("user-agent"),
            });
        }
      }

      return originalJson.call(this, data);
    };

    // Handle 204 No Content responses (Delete usually)
    res.end = function (...args: any[]) {
      if (
        res.statusCode >= 200 &&
        res.statusCode < 300 &&
        action === "delete"
      ) {
        const effectiveUserId = userId || 0;
        const entityId = req.params.id ? Number(req.params.id) : undefined;
        const { oldData: _, requestData: __, ...cleanMetadata } = req.auditLog?.metadata || {};
        
        if (entityId) {
          const deletedData = req.auditLog?.metadata?.oldData || { id: entityId };
          void auditService.logUserDelete(
            effectiveUserId,
            entityId,
            deletedData,
            req.ip,
            req.get("user-agent"),
            cleanMetadata
          );
        }
      }
      
      // Handle remove role (DELETE request)
      if (
        res.statusCode >= 200 &&
        res.statusCode < 300 &&
        action === "remove_role"
      ) {
          const effectiveUserId = userId || 0;
          const entityId = req.params.id ? Number(req.params.id) : 0;
          const roleId = Number(req.params.roleId);
          const { oldData: _, requestData: __, ...cleanMetadata } = req.auditLog?.metadata || {};
          
          void auditService.logRoleChange(
             effectiveUserId,
             entityId,
             'REMOVE_ROLE',
             { roleId },
             req.ip,
             req.get("user-agent"),
             cleanMetadata
         );
      }

      return originalEnd.apply(this, args as any);
    };

    next();
  };
}

