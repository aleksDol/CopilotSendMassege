-- Internal system logs for the admin panel (observability only, no relations).

CREATE TYPE "SystemLogLevel" AS ENUM ('info', 'warn', 'error');

CREATE TABLE "system_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "level" "SystemLogLevel" NOT NULL DEFAULT 'info',
  "module" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "trace_id" TEXT,
  "user_id" TEXT,
  "company_id" TEXT,
  "metadata" JSONB,

  CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_logs_created_at_idx" ON "system_logs"("created_at" DESC);

CREATE INDEX "system_logs_trace_id_idx" ON "system_logs"("trace_id");

CREATE INDEX "system_logs_module_created_idx" ON "system_logs"("module", "created_at" DESC);

CREATE INDEX "system_logs_level_created_idx" ON "system_logs"("level", "created_at" DESC);
