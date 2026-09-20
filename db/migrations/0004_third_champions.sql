CREATE TYPE "public"."customer_attribute_type" AS ENUM('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT');--> statement-breakpoint
CREATE TABLE "customer_attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "customer_attribute_type" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_attribute_values" (
	"customer_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"value_text" text,
	"value_number" text,
	"value_boolean" text,
	"value_date" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_attribute_values_customer_id_definition_id_pk" PRIMARY KEY("customer_id","definition_id")
);
--> statement-breakpoint
CREATE TABLE "customer_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tag_links" (
	"customer_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tag_links_customer_id_tag_id_pk" PRIMARY KEY("customer_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "internal_summary" text;--> statement-breakpoint
ALTER TABLE "customer_attribute_definitions" ADD CONSTRAINT "customer_attribute_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_attribute_values" ADD CONSTRAINT "customer_attribute_values_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_attribute_values" ADD CONSTRAINT "customer_attribute_values_definition_id_customer_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."customer_attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_links" ADD CONSTRAINT "customer_tag_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_links" ADD CONSTRAINT "customer_tag_links_tag_id_conversation_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."conversation_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_attr_defs_org_key_unique" ON "customer_attribute_definitions" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "customer_attr_defs_organization_id_idx" ON "customer_attribute_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_attr_values_definition_id_idx" ON "customer_attribute_values" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "customer_notes_customer_id_idx" ON "customer_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_tag_links_tag_id_idx" ON "customer_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "customers_org_phone_idx" ON "customers" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE INDEX "customers_org_name_idx" ON "customers" USING btree ("organization_id","display_name");--> statement-breakpoint
CREATE INDEX "customers_org_company_idx" ON "customers" USING btree ("organization_id","company_name");--> statement-breakpoint
CREATE INDEX "customers_org_created_idx" ON "customers" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_email_unique" ON "customers" USING btree ("organization_id","email") WHERE "customers"."email" IS NOT NULL;