ALTER TABLE "customer_attribute_values" DROP CONSTRAINT IF EXISTS "customer_attribute_values_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" DROP CONSTRAINT IF EXISTS "customer_attribute_values_definition_id_customer_attribute_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_tag_links" DROP CONSTRAINT IF EXISTS "customer_tag_links_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_tag_links" DROP CONSTRAINT IF EXISTS "customer_tag_links_tag_id_conversation_tags_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_org_id_unique" ON "customers" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_tags_org_id_unique" ON "conversation_tags" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_attr_defs_org_id_unique" ON "customer_attribute_definitions" USING btree ("organization_id","id");
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "customer_tag_links" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
UPDATE "customer_attribute_values" v
SET "organization_id" = c."organization_id"
FROM "customers" c
WHERE v."customer_id" = c."id" AND v."organization_id" IS NULL;
--> statement-breakpoint
UPDATE "customer_tag_links" l
SET "organization_id" = c."organization_id"
FROM "customers" c
WHERE l."customer_id" = c."id" AND l."organization_id" IS NULL;
--> statement-breakpoint
DELETE FROM "customer_attribute_values" WHERE "organization_id" IS NULL;
--> statement-breakpoint
DELETE FROM "customer_tag_links" WHERE "organization_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customer_tag_links" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" DROP CONSTRAINT IF EXISTS "customer_attr_values_customer_org_fk";
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" ADD CONSTRAINT "customer_attr_values_customer_org_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" DROP CONSTRAINT IF EXISTS "customer_attr_values_definition_org_fk";
--> statement-breakpoint
ALTER TABLE "customer_attribute_values" ADD CONSTRAINT "customer_attr_values_definition_org_fk" FOREIGN KEY ("organization_id","definition_id") REFERENCES "public"."customer_attribute_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_tag_links" DROP CONSTRAINT IF EXISTS "customer_tag_links_customer_org_fk";
--> statement-breakpoint
ALTER TABLE "customer_tag_links" ADD CONSTRAINT "customer_tag_links_customer_org_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_tag_links" DROP CONSTRAINT IF EXISTS "customer_tag_links_tag_org_fk";
--> statement-breakpoint
ALTER TABLE "customer_tag_links" ADD CONSTRAINT "customer_tag_links_tag_org_fk" FOREIGN KEY ("organization_id","tag_id") REFERENCES "public"."conversation_tags"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_merged_into_customer_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_customer_id_fk" FOREIGN KEY ("merged_into_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_attr_values_organization_id_idx" ON "customer_attribute_values" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_tag_links_organization_id_idx" ON "customer_tag_links" USING btree ("organization_id");
