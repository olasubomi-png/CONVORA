CREATE INDEX IF NOT EXISTS "conversations_org_created_idx" ON "conversations" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_closed_idx" ON "conversations" USING btree ("organization_id","closed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_channel_created_idx" ON "conversations" USING btree ("organization_id","channel","created_at");
