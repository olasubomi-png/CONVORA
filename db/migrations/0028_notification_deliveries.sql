-- Durable per-channel notification delivery outbox (PUSH / EMAIL)
CREATE TYPE "public"."notification_delivery_channel" AS ENUM('PUSH', 'EMAIL');
CREATE TYPE "public"."notification_delivery_status" AS ENUM(
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "membership_id" uuid NOT NULL REFERENCES "memberships"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "notification_id" uuid REFERENCES "agent_notifications"("id") ON DELETE set null,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE set null,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "channel" "notification_delivery_channel" NOT NULL,
  "status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
  "dedupe_key" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_dedupe_unique"
  ON "notification_deliveries" ("membership_id", "channel", "dedupe_key");

CREATE INDEX IF NOT EXISTS "notification_deliveries_pending_idx"
  ON "notification_deliveries" ("status", "available_at", "created_at");

CREATE INDEX IF NOT EXISTS "notification_deliveries_org_idx"
  ON "notification_deliveries" ("organization_id", "status");
