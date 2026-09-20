CREATE TYPE "public"."customer_status" AS ENUM('ACTIVE', 'MERGED');--> statement-breakpoint
DROP INDEX "customers_org_email_unique";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "status" "customer_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "merged_into_customer_id" uuid;--> statement-breakpoint
CREATE INDEX "customers_org_status_idx" ON "customers" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_email_unique" ON "customers" USING btree ("organization_id","email") WHERE "customers"."email" IS NOT NULL AND "customers"."status" = 'ACTIVE';