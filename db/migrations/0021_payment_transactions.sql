CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'ABANDONED', 'REVERSED');

CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "subscription_id" uuid,
  "provider" text DEFAULT 'paystack' NOT NULL,
  "reference" text NOT NULL,
  "provider_transaction_id" text,
  "plan_code" "plan_code" NOT NULL,
  "billing_interval" "billing_interval" NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'NGN' NOT NULL,
  "status" "payment_status" DEFAULT 'PENDING' NOT NULL,
  "customer_email" text,
  "authorization_url" text,
  "verified_at" timestamp with time zone,
  "failure_code" text,
  "failure_message" text,
  "provider_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_reference_unique" ON "payment_transactions" ("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_provider_tx_unique" ON "payment_transactions" ("provider", "provider_transaction_id") WHERE "provider_transaction_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "payment_transactions_org_idx" ON "payment_transactions" ("organization_id");

DO $$ BEGIN
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
