CREATE TYPE "public"."web_chat_installation_status" AS ENUM('ACTIVE', 'DISABLED');
--> statement-breakpoint
CREATE TABLE "web_chat_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"name" text NOT NULL,
	"status" "web_chat_installation_status" DEFAULT 'ACTIVE' NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_chat_visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"customer_id" uuid,
	"conversation_id" uuid,
	"display_name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_chat_installations" ADD CONSTRAINT "web_chat_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "web_chat_installations_public_key_unique" ON "web_chat_installations" USING btree ("public_key");
--> statement-breakpoint
CREATE INDEX "web_chat_installations_organization_id_idx" ON "web_chat_installations" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "web_chat_installations_org_id_unique" ON "web_chat_installations" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "web_chat_visitors_session_token_hash_unique" ON "web_chat_visitors" USING btree ("session_token_hash");
--> statement-breakpoint
CREATE INDEX "web_chat_visitors_organization_id_idx" ON "web_chat_visitors" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "web_chat_visitors_installation_id_idx" ON "web_chat_visitors" USING btree ("installation_id");
--> statement-breakpoint
ALTER TABLE "web_chat_visitors" ADD CONSTRAINT "web_chat_visitors_installation_org_fk" FOREIGN KEY ("organization_id","installation_id") REFERENCES "public"."web_chat_installations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "web_chat_visitors" ADD CONSTRAINT "web_chat_visitors_customer_org_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "web_chat_visitors" ADD CONSTRAINT "web_chat_visitors_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE set null ON UPDATE no action;
