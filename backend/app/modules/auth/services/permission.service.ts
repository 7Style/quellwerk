/**
 * Permission Service
 * Verwaltet Benutzer-Berechtigungen und Rollen-basierte Zugriffskontrolle
 * Implementiert das Backend-driven Authorization Konzept
 */

import { 
  BaseException,
  UserRoleEnum,
  ROLE_PRIORITY,
  ROLE_MODULE_LOOKUP_ORDER,
} from "../internal/index.js";
import { BaseAuthService } from "./base.service.js";

export class UnauthorizedException extends BaseException {
  constructor(message: string = "Unauthorized", path?: string) {
    super(message, 401, "AUTH_ERROR", path);
  }
}

/**
 * Permission Types
 */
export interface FieldPermission {
  resource: string;
  show: boolean;
  read: boolean;
  write: boolean;
}

export interface UserPermissions {
  role: string;
  modules: string[];
  actions: string[];
  dataScopes: Record<string, string[]>;
  fieldPermissions?: Map<string, FieldPermission>;
}

export interface NavigationItem {
  path: string;
  label: string;
  icon?: string;
  badge?: string;
  children?: NavigationItem[];
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole?: string;
  requiredPermission?: string;
}

export interface SessionWithPermissions {
  user: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    lastLogin?: Date;
  };
  permissions: UserPermissions;
  navigation: NavigationItem[];
}

export interface FieldPermissionUpdate {
  roleId?: number;
  userId?: number;
  permissions: {
    resource: string;
    actions: ("show" | "read" | "write")[];
  }[];
}

/**
 * Permission Service Implementation
 */
export class PermissionService extends BaseAuthService {
  /**
   * Route-Permission Mapping
   * Definiert welche Rollen auf welche Module zugreifen können
   * 
   * ROLLEN-LOGIK:
   * - SUPER_ADMIN: ALLE Rechte (sieht alles)
   * - PLATFORM_MANAGER: Dashboard, Companies, Access Rights (NICHT Consultants!)
   * - CONSULTANT: Dashboard, Companies, Consultants, Access Rights
   */
  private readonly roleModuleMapping: Record<UserRoleEnum, string[]> = {
    // ============================================
    // SUPER_ADMIN: ALLE RECHTE
    // ============================================
    [UserRoleEnum.SUPER_ADMIN]: [
      "dashboard",
      "companies",
      "consultants",
      "access-rights",
      "system-settings",
      "holidays",
      "logs",
      "projects",
      "employees",
      "documents",
      "costs",
      "help",
    ],
    
    // ============================================
    // PLATFORM_MANAGER: Dashboard, Companies, Access Rights
    // NICHT: Consultants, System Settings, Holidays, Logs
    // ============================================
    [UserRoleEnum.PLATFORM_MANAGER]: [
      "dashboard",
      "companies",
      "access-rights",
      "projects",
      "employees",
      "documents",
      "costs",
      "help",
    ],
    
    // ============================================
    // CONSULTANT: Dashboard, Companies, Consultants, Access Rights
    // NICHT: System Settings, Holidays, Logs
    // ============================================
    [UserRoleEnum.CONSULTANT]: [
      "dashboard",
      "companies",
      "consultants",
      "access-rights",
      "projects",
      "employees",
      "documents",
      "costs",
      "help",
    ],
    
    // ============================================
    // CLIENT-ROLLEN: Dashboard + Client-bezogene Seiten
    // ============================================
    [UserRoleEnum.COMPANY_ADMIN]: [
      "dashboard",
      "projects",
      "employees",
      "documents",
      "help",
    ],
    [UserRoleEnum.TECHNICAL_MANAGER]: [
      "dashboard",
      "projects",
      "employees",
      "documents",
      "help",
    ],
    [UserRoleEnum.FINANCE_MANAGER]: [
      "dashboard",
      "projects",
      "employees",
      "documents",
      "costs",
      "help",
    ],
    [UserRoleEnum.HR_MANAGER]: [
      "dashboard",
      "employees",
      "documents",
      "help",
    ],
    [UserRoleEnum.CONTROLLER]: [
      "dashboard",
      "projects",
      "employees",
      "documents",
      "costs",
      "help",
    ],
    [UserRoleEnum.EMPLOYEE]: [
      "dashboard",
      "employees",
      "documents",
      "help",
    ],
    [UserRoleEnum.BSFZ_REVIEWER]: [
      "dashboard",
      "documents",
      "help",
    ],
  };

  /**
   * Navigation Configuration
   * Definiert die Menüstruktur basierend auf Rollen
   * 
   * ROLLEN-LOGIK:
   * - SUPER_ADMIN: ALLE Navigation Items
   * - PLATFORM_MANAGER: Dashboard, Companies, Access Rights
   * - CONSULTANT: Dashboard, Companies, Consultants, Access Rights
   */
  private readonly navigationConfig: Record<UserRoleEnum, NavigationItem[]> = {
    // ============================================
    // SUPER_ADMIN: ALLE NAVIGATION ITEMS
    // ============================================
    [UserRoleEnum.SUPER_ADMIN]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/companies", label: "Companies", icon: "building" },
      { path: "/consultants", label: "Consultants", icon: "briefcase" },
      { path: "/access-rights", label: "Access Rights", icon: "shield" },
      { path: "/system-settings", label: "System Settings", icon: "settings" },
      { path: "/holidays", label: "Holidays", icon: "calendar" },
      { path: "/logs", label: "Logs", icon: "list" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/costs", label: "Costs", icon: "dollar-sign" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    
    // ============================================
    // PLATFORM_MANAGER: Dashboard, Companies, Access Rights
    // ============================================
    [UserRoleEnum.PLATFORM_MANAGER]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/companies", label: "Companies", icon: "building" },
      { path: "/access-rights", label: "Access Rights", icon: "shield" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/costs", label: "Costs", icon: "dollar-sign" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    
    // ============================================
    // CONSULTANT: Dashboard, Companies, Consultants, Access Rights
    // ============================================
    [UserRoleEnum.CONSULTANT]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/companies", label: "Companies", icon: "building" },
      { path: "/consultants", label: "Consultants", icon: "briefcase" },
      { path: "/access-rights", label: "Access Rights", icon: "shield" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/costs", label: "Costs", icon: "dollar-sign" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    
    // ============================================
    // CLIENT-ROLLEN
    // ============================================
    [UserRoleEnum.COMPANY_ADMIN]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    [UserRoleEnum.TECHNICAL_MANAGER]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    [UserRoleEnum.FINANCE_MANAGER]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/costs", label: "Costs", icon: "dollar-sign" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    [UserRoleEnum.HR_MANAGER]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    [UserRoleEnum.CONTROLLER]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/projects", label: "Projects", icon: "folder" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/costs", label: "Costs", icon: "dollar-sign" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    [UserRoleEnum.EMPLOYEE]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/employees", label: "Employees", icon: "user-check" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
    [UserRoleEnum.BSFZ_REVIEWER]: [
      { path: "/dashboard", label: "Dashboard", icon: "home" },
      { path: "/documents", label: "Documents", icon: "file-text" },
      { path: "/help", label: "Help", icon: "help-circle" },
    ],
  };

  /**
   * Holt die komplette Session mit Permissions für einen User
   */
  async getSessionWithPermissions(
    userId: number
  ): Promise<SessionWithPermissions> {
    try {
      // User mit Rollen laden
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Primäre Rolle bestimmen (höchste Berechtigung)
      const primaryRole = this.determinePrimaryRole(user.userRoles);

      // Permissions sammeln
      const permissions = this.collectPermissions(user.userRoles);

      // Navigation basierend auf Rolle
      const navigation = this.getNavigationForRole(primaryRole);

      this.logger.info("[Permission] Session with permissions loaded", {
        userId,
        role: primaryRole,
        moduleCount: permissions.modules.length,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName || undefined,
          lastName: user.lastName || undefined,
          lastLogin: user.lastLogin || undefined,
        },
        permissions: {
          role: primaryRole,
          modules: permissions.modules,
          actions: permissions.actions,
          dataScopes: permissions.dataScopes,
        },
        navigation,
      };
    } catch (error) {
      this.logger.error(
        "[Permission] Failed to get session with permissions",
        error,
        { userId }
      );
      throw error;
    }
  }

  /**
   * Verifiziert Zugriff auf eine Resource
   */
  async verifyAccess(
    userId: number,
    resource: string,
    action: string = "view"
  ): Promise<PermissionCheckResult> {
    try {
      // User Rolle holen
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: {
          role: true,
        },
      });

      if (!userRoles.length) {
        return {
          allowed: false,
          reason: "No roles assigned to user",
        };
      }

      const primaryRole = this.determinePrimaryRole(userRoles);

      // Modul aus Resource extrahieren (z.B. /clients -> clients)
      const module = resource.replace(/^\//, "").split("/")[0];

      // Prüfen ob Rolle Zugriff auf Modul hat
      const allowedModules = this.roleModuleMapping[primaryRole] || [];
      const hasAccess = allowedModules.includes(module);

      this.logger.debug("[Permission] Access check", {
        userId,
        role: primaryRole,
        resource,
        module,
        action,
        allowed: hasAccess,
      });

      if (!hasAccess) {
        return {
          allowed: false,
          reason: `Role '${primaryRole}' does not have access to module '${module}'`,
          requiredRole: this.getRequiredRoleForModule(module),
        };
      }

      return { allowed: true };
    } catch (error) {
      this.logger.error("[Permission] Failed to verify access", error, {
        userId,
        resource,
        action,
      });
      throw error;
    }
  }

  /**
   * Holt die Navigation für einen User
   */
  async getNavigationForUser(userId: number): Promise<NavigationItem[]> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true },
      });

      const primaryRole = this.determinePrimaryRole(userRoles);
      return this.getNavigationForRole(primaryRole);
    } catch (error) {
      this.logger.error("[Permission] Failed to get navigation", error, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Bestimmt die primäre Rolle (höchste Berechtigung)
   * Verwendet ROLE_PRIORITY aus dem Enum-Modul
   */
  private determinePrimaryRole(userRoles: any[]): UserRoleEnum {
    // Nutze die zentrale ROLE_PRIORITY aus dem Enum
    for (const priority of ROLE_PRIORITY) {
      if (userRoles.some((ur) => ur.role.code === priority)) {
        return priority;
      }
    }

    // Fallback: return first role code or EMPLOYEE
    if (userRoles.length > 0) {
      const firstRole = userRoles[0].role;
      const code = firstRole.code || firstRole.name;
      // Prüfe ob gültiger Enum-Wert
      if (Object.values(UserRoleEnum).includes(code as UserRoleEnum)) {
        return code as UserRoleEnum;
      }
    }

    return UserRoleEnum.EMPLOYEE;
  }

  /**
   * Sammelt alle Permissions aus den Rollen
   */
  private collectPermissions(userRoles: any[]): {
    modules: string[];
    actions: string[];
    dataScopes: Record<string, string[]>;
  } {
    const modules = new Set<string>();
    const actions = new Set<string>();
    const dataScopes: Record<string, string[]> = {};

    for (const userRole of userRoles) {
      const role = userRole.role;
      const roleCode = (role.code || '') as UserRoleEnum;
      const roleModules = this.roleModuleMapping[roleCode] || [];

      roleModules.forEach((m) => modules.add(m));

      // Permissions aus der Datenbank
      if (role.rolePermissions) {
        for (const rp of role.rolePermissions) {
          const permission = rp.permission;

          // Aktion aus Permission extrahieren
          if (permission.name.includes(":")) {
            const [_, action] = permission.name.split(":");
            actions.add(action);
          }
        }
      }

      // Data Scopes basierend auf Rolle (Enum-Werte)
      if (roleCode === UserRoleEnum.CONSULTANT) {
        dataScopes.projects = ["own", "team"];
        dataScopes.clients = ["assigned"];
      } else if (roleCode === UserRoleEnum.PLATFORM_MANAGER || roleCode === UserRoleEnum.SUPER_ADMIN) {
        dataScopes.projects = ["all"];
        dataScopes.clients = ["all"];
        if (roleCode === UserRoleEnum.SUPER_ADMIN) {
          dataScopes.system = ["all"];
        }
      } else if (
        roleCode === UserRoleEnum.COMPANY_ADMIN || 
        roleCode === UserRoleEnum.TECHNICAL_MANAGER || 
        roleCode === UserRoleEnum.FINANCE_MANAGER || 
        roleCode === UserRoleEnum.CONTROLLER
      ) {
        // Company-level roles: only their own company
        dataScopes.projects = ["company"];
        dataScopes.clients = ["company"];
      } else if (roleCode === UserRoleEnum.EMPLOYEE) {
        dataScopes.projects = ["assigned"];
        dataScopes.clients = ["assigned"];
      }
    }

    return {
      modules: Array.from(modules),
      actions: Array.from(actions),
      dataScopes,
    };
  }

  /**
   * Holt Navigation für eine Rolle
   */
  private getNavigationForRole(role: UserRoleEnum): NavigationItem[] {
    return this.navigationConfig[role] || [];
  }

  /**
   * Ermittelt die erforderliche Rolle für ein Modul
   * Verwendet ROLE_MODULE_LOOKUP_ORDER aus dem Enum-Modul
   */
  private getRequiredRoleForModule(module: string): UserRoleEnum {
    // Nutze die zentrale ROLE_MODULE_LOOKUP_ORDER
    for (const role of ROLE_MODULE_LOOKUP_ORDER) {
      const modules = this.roleModuleMapping[role] || [];
      if (modules.includes(module)) {
        return role;
      }
    }

    return UserRoleEnum.SUPER_ADMIN; // Fallback
  }

  /**
   * Prüft ob ein User eine bestimmte Permission hat
   */
  async hasPermission(userId: number, permission: string): Promise<boolean> {
    try {
      const userPermissions = await this.prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      return userPermissions.some((up: any) =>
        up.role.rolePermissions.some((rp: any) => {
          const perm = rp.permission;
          // Check if permission matches the format "module:action" or just the action
          return (
            perm.action === permission ||
            `${perm.module}:${perm.action}` === permission
          );
        })
      );
    } catch (error) {
      this.logger.error("[Permission] Failed to check permission", error, {
        userId,
        permission,
      });
      return false;
    }
  }

  /**
   * Get field permissions for multiple resources
   * Optimiert für Performance durch Batch-Abfrage
   */
  async getFieldPermissions(
    userId: number,
    resources: string[]
  ): Promise<Map<string, FieldPermission>> {
    try {
      // Hole User mit Rollen
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      const roleIds = user.userRoles.map((ur: any) => ur.roleId);

      // Hole alle relevanten Field Permissions
      const permissions = await this.prisma.fieldPermission.findMany({
        where: {
          OR: [
            // User-spezifische Permissions
            { userId, resource: { in: resources } },
            // Rollen-basierte Permissions
            { roleId: { in: roleIds }, resource: { in: resources } },
            // Wildcard Permissions für User
            { userId, resource: "*" },
            // Wildcard Permissions für Rollen
            { roleId: { in: roleIds }, resource: "*" },
          ],
        },
      });

      // Erstelle Permission Map
      const permissionMap = new Map<string, FieldPermission>();

      // Initialisiere alle angeforderten Resources
      for (const resource of resources) {
        permissionMap.set(resource, {
          resource,
          show: false,
          read: false,
          write: false,
        });
      }

      // Verarbeite Permissions (Wildcard zuerst, dann spezifische)
      const sortedPermissions = permissions.sort((a: any, b: any) => {
        if (a.resource === "*" && b.resource !== "*") return -1;
        if (a.resource !== "*" && b.resource === "*") return 1;
        return 0;
      });

      for (const perm of sortedPermissions) {
        const targetResources =
          perm.resource === "*" ? resources : [perm.resource];

        for (const targetResource of targetResources) {
          const current = permissionMap.get(targetResource);
          if (!current) continue;

          // User-spezifische Permissions überschreiben Rollen-Permissions
          const isUserSpecific = perm.userId === userId;
          const shouldUpdate =
            isUserSpecific || !current[perm.action as keyof FieldPermission];

          if (shouldUpdate) {
            const action = perm.action as keyof FieldPermission;
            if (action === 'show' || action === 'read' || action === 'write') {
              current[action] = true;
            }
          }
        }
      }

      return permissionMap;
    } catch (error) {
      this.logger.error("[Permission] Failed to get field permissions", error, {
        userId,
        resources,
      });
      return new Map();
    }
  }

  /**
   * Check single field permission
   */
  async checkFieldPermission(
    userId: number,
    resource: string,
    action: "show" | "read" | "write"
  ): Promise<boolean> {
    try {
      const permissions = await this.getFieldPermissions(userId, [resource]);
      const fieldPerm = permissions.get(resource);

      if (!fieldPerm) return false;

      return fieldPerm[action];
    } catch (error) {
      this.logger.error(
        "[Permission] Failed to check field permission",
        error,
        { userId, resource, action }
      );
      return false;
    }
  }

  /**
   * Get all permissions for a resource pattern
   * z.B. "client:elster_form:*" gibt alle Feld-Permissions für das Elster-Formular
   */
  async getResourcePermissions(
    userId: number,
    resourcePattern: string
  ): Promise<FieldPermission[]> {
    try {
      // Hole User mit Rollen
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      const roleIds = user.userRoles.map((ur: any) => ur.roleId);

      // Erstelle SQL Pattern für LIKE Query
      const sqlPattern = resourcePattern.replace("*", "%");

      // Hole alle passenden Permissions
      const permissions = await this.prisma.fieldPermission.findMany({
        where: {
          OR: [
            { userId, resource: { contains: sqlPattern } },
            { roleId: { in: roleIds }, resource: { contains: sqlPattern } },
            { userId, resource: "*" },
            { roleId: { in: roleIds }, resource: "*" },
          ],
        },
        distinct: ["resource"],
      });

      // Gruppiere nach Resource
      const resourceMap = new Map<string, FieldPermission>();

      for (const perm of permissions) {
        let fieldPerm = resourceMap.get(perm.resource);
        if (!fieldPerm) {
          fieldPerm = {
            resource: perm.resource,
            show: false,
            read: false,
            write: false,
          };
          resourceMap.set(perm.resource, fieldPerm);
        }

        const action = perm.action as keyof FieldPermission;
        if (action === 'show' || action === 'read' || action === 'write') {
          fieldPerm[action] = true;
        }
      }

      return Array.from(resourceMap.values());
    } catch (error) {
      this.logger.error(
        "[Permission] Failed to get resource permissions",
        error,
        { userId, resourcePattern }
      );
      return [];
    }
  }

  /**
   * Bulk permission updates
   */
  async updateFieldPermissions(update: FieldPermissionUpdate): Promise<void> {
    try {
      // Audit log
      const auditEntries = [];

      for (const perm of update.permissions) {
        // Lösche existierende Permissions für diese Resource
        const deleted = await this.prisma.fieldPermission.deleteMany({
          where: {
            resource: perm.resource,
            ...(update.roleId && { roleId: update.roleId }),
            ...(update.userId && { userId: update.userId }),
          },
        });

        // Erstelle neue Permissions
        const creates = perm.actions.map((action) => ({
          resource: perm.resource,
          action,
          ...(update.roleId && { roleId: update.roleId }),
          ...(update.userId && { userId: update.userId }),
        }));

        await this.prisma.fieldPermission.createMany({
          data: creates,
        });

        // Audit Log Entry
        auditEntries.push({
          userId: update.userId || 0, // System user for role updates
          action: "modify",
          resource: perm.resource,
          oldPermissions: { deleted: deleted.count },
          newPermissions: { actions: perm.actions },
          reason: `Bulk update for ${update.roleId ? "role" : "user"}`,
        });
      }

      // Speichere Audit Log
      if (auditEntries.length > 0) {
        await this.prisma.permissionAuditLog.createMany({
          data: auditEntries,
        });
      }

      this.logger.info("[Permission] Field permissions updated", {
        roleId: update.roleId,
        userId: update.userId,
        permissionCount: update.permissions.length,
      });
    } catch (error) {
      this.logger.error(
        "[Permission] Failed to update field permissions",
        error,
        update
      );
      throw error;
    }
  }

  /**
   * Get permissions including field-level for session
   */
  async getSessionWithFieldPermissions(
    userId: number
  ): Promise<SessionWithPermissions> {
    const session = await this.getSessionWithPermissions(userId);

    // Lade häufig verwendete Field Permissions
    const commonResources = [
      "dashboard:*",
      "client:list:*",
      "employee:list:*",
      "project:list:*",
    ];

    const fieldPermissions = new Map<string, FieldPermission>();

    for (const pattern of commonResources) {
      const perms = await this.getResourcePermissions(userId, pattern);
      perms.forEach((p) => fieldPermissions.set(p.resource, p));
    }

    session.permissions.fieldPermissions = fieldPermissions;

    return session;
  }
}
