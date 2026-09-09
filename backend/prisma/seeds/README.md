# Database Seeds

Seed files for the initial data of the boilerplate. Entry point: `../seed.ts`
(`prisma db seed`, configured in `backend/prisma.config.ts`).

## Seed Files

| File | Description |
|------|-------------|
| `roles.seed.ts` | Core roles: SUPER_ADMIN, ADMIN, MODERATOR, USER, GUEST |
| `permissions.seed.ts` | Permissions for the boilerplate modules (system, users, auth, audit, upload) |
| `role-permissions.seed.ts` | Maps permissions to roles (RBAC) |
| `users.seed.ts` | SUPER_ADMIN account and optional demo accounts |

## Running Seeds

```bash
# On the host (reads backend/.env; NODE_ENV must not be production)
SEED_ADMIN_PASSWORD='...' pnpm --filter bp-monolith-backend run prisma:seed

# In docker compose: SEED_ON_START=true plus the SEED_* variables in the root .env
```

Seeding is refused with `NODE_ENV=production`. All seeds are idempotent
(`upsert`), so they can run repeatedly.

## Accounts

There are no built-in passwords. Every password comes from the environment
(`backend/example.env` on the host, root `example.env` for compose):

| Role | E-mail | Password | Created |
|------|--------|----------|---------|
| SUPER_ADMIN | `SEED_ADMIN_EMAIL` (default `admin@bp-monolith.local`) | `SEED_ADMIN_PASSWORD` (required, min 12 characters) | always |
| MODERATOR | `moderator@<domain>` | `SEED_DEMO_PASSWORD` | only with `SEED_DEMO_USERS=true` |
| USER | `user@<domain>` | `SEED_DEMO_PASSWORD` | only with `SEED_DEMO_USERS=true` |
| USER (inactive) | `inactive@<domain>` | `SEED_DEMO_PASSWORD` | only with `SEED_DEMO_USERS=true` |

`<domain>` is the domain part of `SEED_ADMIN_EMAIL`. `SEED_DEMO_USERS=true`
without `SEED_DEMO_PASSWORD` fails. The bcrypt cost comes from
`BCRYPT_SALT_ROUNDS` (default 12), like everywhere else.

The e2e fixtures (`e2e/fixtures/test-users.ts`) read the same variables and
derive the same addresses; see `e2e/.env.example`.

## Roles and Permissions

- **SUPER_ADMIN**: everything, including system settings and deleting audit logs
- **ADMIN**: user management (create, read, update, list), role assignment, sessions, audit logs (read/export), files
- **MODERATOR**: read-only user access, own profile, 2FA, audit logs (read), file upload/read/list
- **USER**: own profile, 2FA, file upload/read/list
- **GUEST**: read-only profile access

The exact mapping is in `role-permissions.seed.ts`.

## Adding New Seeds

1. Create `your-module.seed.ts`
2. Export `async function seedYourModule(prisma: PrismaClient): Promise<void>`
3. Import and call it in `../seed.ts` (dependencies first)

```typescript
import type { PrismaClient } from '../../app/generated/prisma/client.js';

export async function seedYourModule(prisma: PrismaClient): Promise<void> {
  console.log('Seeding your module...');
  // upsert your data here
}
```

## Resetting the Database

```bash
# Drop, migrate and re-seed (development only, deletes all data). The reset
# runs the seed (prisma.config.ts migrations.seed), so the admin password is required:
SEED_ADMIN_PASSWORD='...' pnpm --filter bp-monolith-backend run db:reset

# Or step by step
pnpm --filter bp-monolith-backend exec prisma migrate reset --force
SEED_ADMIN_PASSWORD='...' pnpm --filter bp-monolith-backend run prisma:seed
```
