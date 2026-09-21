CREATE TYPE "public"."domain_event_outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD COLUMN IF NOT EXISTS "status" "domain_event_outbox_status" DEFAULT 'PENDING' NOT NULL;
--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_event_outbox_status_idx" ON "domain_event_outbox" USING btree ("status","created_at");
