
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "title" TEXT NOT NULL,
    "emoji" TEXT,
    "user_set_title" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "themes" JSONB,
    "suggested_questions" JSONB,
    "suggested_report_formats" JSONB,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "token_model" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "cloned_from" TEXT,
    "thread_reset_at" TIMESTAMP(3),
    "overview_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "original_name" TEXT,
    "mime" TEXT,
    "text" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "pages" JSONB,
    "guide" JSONB,
    "warnings" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "step" TEXT,
    "heartbeat_at" TIMESTAMP(3),
    "error" TEXT,
    "storage_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "segments" JSONB,
    "raw_content" JSONB,
    "selected_source_ids" JSONB,
    "usage" JSONB,
    "dropped_citations" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "segments" JSONB,
    "from_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "params" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "heartbeat_at" TIMESTAMP(3),
    "segments" JSONB,
    "data" JSONB,
    "prompt_used" TEXT,
    "audio_path" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_log" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "notebook_id" TEXT,
    "route" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read" INTEGER NOT NULL DEFAULT 0,
    "cache_write_5m" INTEGER NOT NULL DEFAULT 0,
    "cache_write_1h" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micro_cents" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "stop_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebooks_session_id_idx" ON "notebooks"("session_id");

-- CreateIndex
CREATE INDEX "sources_notebook_id_position_idx" ON "sources"("notebook_id", "position");

-- CreateIndex
CREATE INDEX "sources_status_heartbeat_at_idx" ON "sources"("status", "heartbeat_at");

-- CreateIndex
CREATE INDEX "messages_notebook_id_created_at_idx" ON "messages"("notebook_id", "created_at");

-- CreateIndex
CREATE INDEX "notes_notebook_id_created_at_idx" ON "notes"("notebook_id", "created_at");

-- CreateIndex
CREATE INDEX "artifacts_notebook_id_created_at_idx" ON "artifacts"("notebook_id", "created_at");

-- CreateIndex
CREATE INDEX "artifacts_status_heartbeat_at_idx" ON "artifacts"("status", "heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_notebook_id_idempotency_key_key" ON "artifacts"("notebook_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "usage_log_session_id_idx" ON "usage_log"("session_id");

-- CreateIndex
CREATE INDEX "usage_log_notebook_id_created_at_idx" ON "usage_log"("notebook_id", "created_at");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

