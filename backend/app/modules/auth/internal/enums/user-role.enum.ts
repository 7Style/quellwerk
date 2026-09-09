/**
 * User Role Enum
 * SINGLE SOURCE OF TRUTH für alle Benutzerrollen im Auth-Modul
 * 
 * WICHTIG: Diese Enum muss mit den DB Role.code Werten übereinstimmen!
 * Keine hardcodierten Strings - IMMER dieses Enum verwenden!
 */
export enum UserRoleEnum {
  SUPER_ADMIN = "SUPER_ADMIN",
  PLATFORM_MANAGER = "PLATFORM_MANAGER",
  CONSULTANT = "CONSULTANT",
  COMPANY_ADMIN = "COMPANY_ADMIN",
  TECHNICAL_MANAGER = "TECHNICAL_MANAGER",
  FINANCE_MANAGER = "FINANCE_MANAGER",
  HR_MANAGER = "HR_MANAGER",
  CONTROLLER = "CONTROLLER",
  EMPLOYEE = "EMPLOYEE",
  BSFZ_REVIEWER = "BSFZ_REVIEWER",
}

/**
 * Rollen-Priorität (von höchster zu niedrigster Berechtigung)
 * Verwendet für determinePrimaryRole()
 */
export const ROLE_PRIORITY: UserRoleEnum[] = [
  UserRoleEnum.SUPER_ADMIN,
  UserRoleEnum.PLATFORM_MANAGER,
  UserRoleEnum.CONSULTANT,
  UserRoleEnum.COMPANY_ADMIN,
  UserRoleEnum.TECHNICAL_MANAGER,
  UserRoleEnum.FINANCE_MANAGER,
  UserRoleEnum.CONTROLLER,
  UserRoleEnum.EMPLOYEE,
  UserRoleEnum.BSFZ_REVIEWER,
];

/**
 * Rollen für Modul-Lookup (niedrigste zu höchste)
 * Verwendet für getRequiredRoleForModule()
 */
export const ROLE_MODULE_LOOKUP_ORDER: UserRoleEnum[] = [
  UserRoleEnum.EMPLOYEE,
  UserRoleEnum.CONSULTANT,
  UserRoleEnum.PLATFORM_MANAGER,
  UserRoleEnum.SUPER_ADMIN,
];

/**
 * Helper: Prüft ob ein String ein gültiger Role-Code ist
 */
export function isValidRoleCode(code: string): code is UserRoleEnum {
  return Object.values(UserRoleEnum).includes(code as UserRoleEnum);
}

