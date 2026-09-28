-- Message delivery / seen (recipient-side timestamps; channel-agnostic)
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "seen_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "messages_conversation_seen_idx"
  ON "messages" ("conversation_id", "seen_at");

-- In-app agent notifications
CREATE TABLE IF NOT EXISTS "agent_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "membership_id" uuid NOT NULL REFERENCES "memberships"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE set null,
  "message_id" uuid REFERENCES "messages"("id") ON DELETE set null,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "channel" text,
  "dedupe_key" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_notifications_dedupe_unique"
  ON "agent_notifications" ("membership_id", "dedupe_key");
CREATE INDEX IF NOT EXISTS "agent_notifications_membership_created_idx"
  ON "agent_notifications" ("membership_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_notifications_membership_unread_idx"
  ON "agent_notifications" ("membership_id", "read_at");

-- Notification preferences (per membership)
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "membership_id" uuid PRIMARY KEY REFERENCES "memberships"("id") ON DELETE cascade,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "in_app_enabled" boolean DEFAULT true NOT NULL,
  "email_enabled" boolean DEFAULT true NOT NULL,
  "push_enabled" boolean DEFAULT true NOT NULL,
  "sound_enabled" boolean DEFAULT true NOT NULL,
  "email_digest_seconds" integer DEFAULT 120 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Web Push subscriptions
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "membership_id" uuid REFERENCES "memberships"("id") ON DELETE cascade,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_unique"
  ON "push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx"
  ON "push_subscriptions" ("user_id");
