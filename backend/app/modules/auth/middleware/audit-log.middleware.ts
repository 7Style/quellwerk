import { Request, Response, NextFunction } from "express";
import { AuthAuditLogService } from "../services/audit-log.service.js";

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
 * Middleware to automatically log auth actions
 */
export function auditLog(action: string, entityType: string = "auth") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auditService = new AuthAuditLogService();
    // For public endpoints like login, userId might be null initially
    let userId = (req as any).user?.id ? Number((req as any).user.id) : null;

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

    // Capture original end method
    const originalEnd = res.end.bind(res);
    const originalJson = res.json.bind(res);

    // Override json method to capture response
    res.json = function (data: any) {
      // Determine if request was successful (mostly 200-299)
      // Note: 401/403 are failures we often want to log for Auth!
      const statusCode = res.statusCode;
      const isSuccess = statusCode >= 200 && statusCode < 300 && (data?.success !== false);
      
      // Update effective userId if login was successful and returned a user/token
      if (!userId) {
          if (data?.user?.id) userId = Number(data.user.id);
          else if (data?.data?.user?.id) userId = Number(data.data.user.id);
          else if (data?.data?.id) userId = Number(data.data.id); // e.g. Register response
      }

      const { oldData: _, requestData: __, ...cleanMetadata } = req.auditLog?.metadata || {};
      const ip = req.ip;
      const userAgent = req.get("user-agent");
      const email = req.body?.email;

      // Always log Login/Logout/Register attempts? Or only success?
      // Requirement usually: Log Login success and Login failure.
      
      if (action === "login") {
          if (isSuccess) {
              void auditService.logLogin(
                  userId || 0, 
                  email || data?.user?.email || "unknown", 
                  ip, 
                  userAgent, 
                  cleanMetadata
              );
          } else {
              // Login failed
              const reason = data?.message || data?.error || "Login failed";
              void auditService.logLoginFailed(
                  email || "unknown", 
                  reason, 
                  ip, 
                  userAgent, 
                  cleanMetadata
              );
          }
      } else if (action === "logout") {
          if (isSuccess) {
              void auditService.logLogout(
                  userId || 0,
                  ip,
                  userAgent,
                  cleanMetadata
              );
          }
      } else if (action === "register") {
          if (isSuccess) {
              void auditService.logAction({
                  userId: userId || 0,
                  entityType: 'auth',
                  action: 'REGISTER',
                  metadata: { ...cleanMetadata, email: email },
                  ipAddress: ip,
                  userAgent: userAgent
              });
          }
      } else if (action === "password_reset_request") {
          // Log attempt regardless of success (security event)
          void auditService.logPasswordResetRequest(
              email,
              ip,
              userAgent,
              { ...cleanMetadata, success: isSuccess }
          );
      } else if (action === "password_reset") {
          if (isSuccess) {
              void auditService.logPasswordResetComplete(
                  userId || 0,
                  ip,
                  userAgent,
                  cleanMetadata
              );
          }
      } else if (action.startsWith("2fa_")) {
          if (isSuccess) {
              const actionType = action.replace("2fa_", "").toUpperCase() as any;
              void auditService.log2FAAction(
                  userId || 0,
                  actionType,
                  ip,
                  userAgent,
                  cleanMetadata
              );
          }
      } else {
          // Generic fallback
          if (isSuccess) {
              void auditService.logAction({
                  userId: userId || 0,
                  entityType,
                  action: action.toUpperCase(),
                  metadata: cleanMetadata,
                  ipAddress: ip,
                  userAgent: userAgent
              });
          }
      }

      return originalJson.call(this, data);
    };

    // Handle non-JSON responses if any
    res.end = function (...args: any[]) {
      // ...
      return originalEnd.apply(this, args as any);
    };

    next();
  };
}




