/**
 * Test user credentials for E2E tests
 *
 * Mirrors what backend/prisma/seeds/users.seed.ts creates and reads the same
 * variables (e2e/.env is loaded by playwright.config.ts, see e2e/.env.example):
 *
 *   - admin:            always seeded. E-mail from SEED_ADMIN_EMAIL (seed default
 *                       admin@quellwerk.local), password TEST_ADMIN_PASSWORD,
 *                       falling back to SEED_ADMIN_PASSWORD.
 *   - moderator / user: demo accounts, only seeded with SEED_DEMO_USERS=true.
 *                       E-mails moderator@<domain> and user@<domain>, where <domain>
 *                       is the domain of SEED_ADMIN_EMAIL; password
 *                       TEST_MODERATOR_PASSWORD / TEST_USER_PASSWORD, falling back
 *                       to SEED_DEMO_PASSWORD.
 *
 * There are no hard-coded passwords: a missing variable throws when the password
 * is first read (lazily, so specs that never touch a user need no secret), and
 * specs that need the demo accounts skip unless SEED_DEMO_USERS is true.
 */

export interface TestUser {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
}

/** Default of SEED_ADMIN_EMAIL in backend/app/config/env.config.ts */
const SEED_DEFAULT_ADMIN_EMAIL = 'admin@quellwerk.local';

const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || SEED_DEFAULT_ADMIN_EMAIL;
/** The seed derives the demo accounts from the admin's domain (users.seed.ts) */
const seedDomain = seedAdminEmail.split('@')[1] || SEED_DEFAULT_ADMIN_EMAIL.split('@')[1];

/** Same truthy spellings as the backend's z.stringbool() for SEED_DEMO_USERS */
export const demoUsersSeeded = ['true', '1', 'yes', 'on'].includes(
  (process.env.SEED_DEMO_USERS ?? '').trim().toLowerCase()
);

export const DEMO_USERS_SKIP_REASON =
  'Needs the demo accounts moderator@/user@<domain>, which the backend seed only creates with ' +
  'SEED_DEMO_USERS=true and SEED_DEMO_PASSWORD. Seed them, then set SEED_DEMO_USERS=true and ' +
  'SEED_DEMO_PASSWORD for the e2e run (see e2e/.env.example).';

/**
 * Read the first non-empty environment variable of the list, or throw a clear error.
 * Evaluated lazily (via getters below) so specs that never touch a user do not need its secret.
 */
function passwordFromEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    `E2E: no password configured. Set one of ${names.join(', ')} (see e2e/.env.example).`
  );
}

/**
 * Regular user (demo account of the seed, role USER)
 */
export const validUser: TestUser = {
  email: process.env.TEST_USER_EMAIL || `user@${seedDomain}`,
  get password() {
    return passwordFromEnv(['TEST_USER_PASSWORD', 'SEED_DEMO_PASSWORD']);
  },
  firstName: 'John',
  lastName: 'Doe',
  roles: ['USER'],
};

/**
 * Admin test user with elevated permissions (always seeded)
 */
export const adminUser: TestUser = {
  email: process.env.TEST_ADMIN_EMAIL || seedAdminEmail,
  get password() {
    return passwordFromEnv(['TEST_ADMIN_PASSWORD', 'SEED_ADMIN_PASSWORD']);
  },
  firstName: 'Super',
  lastName: 'Admin',
  roles: ['SUPER_ADMIN'],
};

/**
 * Moderator test user (demo account of the seed, role MODERATOR)
 */
export const moderatorUser: TestUser = {
  email: process.env.TEST_MODERATOR_EMAIL || `moderator@${seedDomain}`,
  get password() {
    return passwordFromEnv(['TEST_MODERATOR_PASSWORD', 'SEED_DEMO_PASSWORD']);
  },
  firstName: 'Max',
  lastName: 'Moderator',
  roles: ['MODERATOR'],
};

/**
 * Invalid credentials for negative testing
 */
export const invalidUser: TestUser = {
  email: 'invalid@example.com',
  password: 'wrongpassword',
};

/**
 * User with non-existent email
 */
export const nonExistentUser: TestUser = {
  email: 'nonexistent@example.com',
  password: 'anypassword123',
};

/**
 * All test users collection
 */
export const testUsers = {
  valid: validUser,
  admin: adminUser,
  moderator: moderatorUser,
  invalid: invalidUser,
  nonExistent: nonExistentUser,
} as const;

export default testUsers;
