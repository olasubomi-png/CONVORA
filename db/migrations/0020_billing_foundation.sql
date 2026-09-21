CREATE TYPE "public"."plan_code" AS ENUM('STARTER', 'PREMIUM');
CREATE TYPE "public"."billing_interval" AS ENUM('MONTHLY', 'YEARLY');
CREATE TYPE "public"."subscription_status" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

CREATE TABLE IF NOT EXISTS "billing_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" "plan_code" NOT NULL,
  "name" text NOT NULL,
  "currency" text DEFAULT 'NGN' NOT NULL,
  "monthly_amount_minor" integer NOT NULL,
  "yearly_discount_bps" integer DEFAULT 2000 NOT NULL,
  "yearly_amount_minor" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_plans_code_unique" ON "billing_plans" ("code");

CREATE TABLE IF NOT EXISTS "billing_plan_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "billing_plans"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "value_bool" boolean,
  "value_int" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_plan_entitlements_plan_key_unique" ON "billing_plan_entitlements" ("plan_id","key");
CREATE INDEX IF NOT EXISTS "billing_plan_entitlements_plan_id_idx" ON "billing_plan_entitlements" ("plan_id");

CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "billing_plans"("id"),
  "status" "subscription_status" NOT NULL,
  "billing_interval" "billing_interval",
  "trial_starts_at" timestamp with time zone,
  "trial_ends_at" timestamp with time zone,
  "current_period_starts_at" timestamp with time zone,
  "current_period_ends_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "provider" text,
  "provider_customer_ref" text,
  "provider_subscription_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_subscriptions_org_unique" ON "organization_subscriptions" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_subscriptions_status_idx" ON "organization_subscriptions" ("status");
DO $$ BEGIN
  ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "subscription_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL REFERENCES "organization_subscriptions"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "from_status" "subscription_status",
  "to_status" "subscription_status",
  "actor_user_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "subscription_events_org_idx" ON "subscription_events" ("organization_id");
CREATE INDEX IF NOT EXISTS "subscription_events_subscription_idx" ON "subscription_events" ("subscription_id");

CREATE TABLE IF NOT EXISTS "usage_meters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "meter_key" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "quantity" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "usage_meters_org_key_period_unique" ON "usage_meters" ("organization_id","meter_key","period_start");
CREATE INDEX IF NOT EXISTS "usage_meters_org_idx" ON "usage_meters" ("organization_id");
DO $$ BEGIN
  ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
