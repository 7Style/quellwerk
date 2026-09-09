-- CreateEnum
CREATE TYPE "AuthSecurityMode" AS ENUM ('none', 'two_factor', 'one_time_password');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "department" TEXT,
    "position" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" TEXT,
    "email_verification_expires" TIMESTAMP(3),
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_token_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_verified" BOOLEAN NOT NULL DEFAULT false,
    "login_security_mode" "AuthSecurityMode" NOT NULL DEFAULT 'none',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_password_logins" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "challenge_token" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "deep_link_hash" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_password_logins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_german" TEXT NOT NULL,
    "description" TEXT,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" INTEGER,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_auth" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'totp',
    "secret" TEXT,
    "temp_secret" TEXT,
    "temp_secret_expires" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "last_used" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_backup_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "id" SERIAL NOT NULL,
    "token_id" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temp_tokens" (
    "id" SERIAL NOT NULL,
    "token_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_permissions" (
    "id" SERIAL NOT NULL,
    "resource" VARCHAR(255) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "role_id" INTEGER,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(255) NOT NULL,
    "old_permissions" JSON,
    "new_permissions" JSON,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_verification_token_key" ON "users"("email_verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "one_time_password_logins_challenge_token_key" ON "one_time_password_logins"("challenge_token");

-- CreateIndex
CREATE INDEX "idx_one_time_password_user_id" ON "one_time_password_logins"("user_id");

-- CreateIndex
CREATE INDEX "idx_one_time_password_expires_at" ON "one_time_password_logins"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_code_idx" ON "roles"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_resource_action_key" ON "permissions"("module", "resource", "action");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_active_idx" ON "sessions"("active");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_auth_user_id_key" ON "two_factor_auth"("user_id");

-- CreateIndex
CREATE INDEX "two_factor_auth_type_idx" ON "two_factor_auth"("type");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_backup_codes_code_key" ON "two_factor_backup_codes"("code");

-- CreateIndex
CREATE INDEX "two_factor_backup_codes_user_id_idx" ON "two_factor_backup_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "revoked_tokens_token_id_key" ON "revoked_tokens"("token_id");

-- CreateIndex
CREATE INDEX "revoked_tokens_token_id_idx" ON "revoked_tokens"("token_id");

-- CreateIndex
CREATE INDEX "revoked_tokens_revoked_at_idx" ON "revoked_tokens"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "temp_tokens_token_id_key" ON "temp_tokens"("token_id");

-- CreateIndex
CREATE INDEX "temp_tokens_user_id_idx" ON "temp_tokens"("user_id");

-- CreateIndex
CREATE INDEX "temp_tokens_token_id_idx" ON "temp_tokens"("token_id");

-- CreateIndex
CREATE INDEX "temp_tokens_purpose_idx" ON "temp_tokens"("purpose");

-- CreateIndex
CREATE INDEX "temp_tokens_expires_at_idx" ON "temp_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_field_permissions_resource" ON "field_permissions"("resource");

-- CreateIndex
CREATE INDEX "idx_field_permissions_role" ON "field_permissions"("role_id");

-- CreateIndex
CREATE INDEX "idx_field_permissions_user" ON "field_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_permissions_resource_action_role_id_user_id_key" ON "field_permissions"("resource", "action", "role_id", "user_id");

-- CreateIndex
CREATE INDEX "permission_audit_log_user_id_idx" ON "permission_audit_log"("user_id");

-- CreateIndex
CREATE INDEX "permission_audit_log_resource_idx" ON "permission_audit_log"("resource");

-- CreateIndex
CREATE INDEX "permission_audit_log_created_at_idx" ON "permission_audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_password_logins" ADD CONSTRAINT "one_time_password_logins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_auth" ADD CONSTRAINT "two_factor_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temp_tokens" ADD CONSTRAINT "temp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_permissions" ADD CONSTRAINT "field_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_permissions" ADD CONSTRAINT "field_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_audit_log" ADD CONSTRAINT "permission_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
