ALTER TABLE "agent_notifications" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp with time zone;
ALTER TABLE "agent_notifications" ADD COLUMN IF NOT EXISTS "push_sent_at" timestamp with time zone;
