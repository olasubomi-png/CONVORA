CREATE TYPE "public"."channel_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED');
--> statement-breakpoint
CREATE TYPE "public"."channel_inbound_event_status" AS ENUM('PROCESSING', 'PROCESSED', 'FAILED');
--> statement-breakpoint
CREATE TYPE "public"."channel_installation_status" AS ENUM('ACTIVE', 'DISABLED', 'ERROR');
--> statement-breakpoint
CREATE TABLE "channel_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "channel_installation_status" DEFAULT 'ACTIVE' NOT NULL,
	"public_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_channel_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"external_username" text,
	"external_address" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "channel_inbound_event_status" DEFAULT 'PROCESSING' NOT NULL,
	"error_message" text,
	"conversation_id" uuid,
	"message_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"external_message_id" text,
	"status" "channel_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "channel_installations" ADD CONSTRAINT "channel_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "channel_installations_organization_id_idx" ON "channel_installations" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_installations_org_id_unique" ON "channel_installations" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_installations_org_channel_provider_name_unique" ON "channel_installations" USING btree ("organization_id","channel","provider","display_name");
--> statement-breakpoint
CREATE INDEX "customer_channel_identities_organization_id_idx" ON "customer_channel_identities" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "customer_channel_identities_customer_id_idx" ON "customer_channel_identities" USING btree ("customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_channel_identities_org_provider_ext_unique" ON "customer_channel_identities" USING btree ("organization_id","provider","external_user_id");
--> statement-breakpoint
ALTER TABLE "customer_channel_identities" ADD CONSTRAINT "customer_channel_identities_customer_org_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_inbound_events_org_provider_event_unique" ON "channel_inbound_events" USING btree ("organization_id","provider","external_event_id");
--> statement-breakpoint
CREATE INDEX "channel_inbound_events_installation_id_idx" ON "channel_inbound_events" USING btree ("installation_id");
--> statement-breakpoint
ALTER TABLE "channel_inbound_events" ADD CONSTRAINT "channel_inbound_events_installation_org_fk" FOREIGN KEY ("organization_id","installation_id") REFERENCES "public"."channel_installations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_message_deliveries_message_id_unique" ON "channel_message_deliveries" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "channel_message_deliveries_organization_id_idx" ON "channel_message_deliveries" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "channel_message_deliveries_status_idx" ON "channel_message_deliveries" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "channel_message_deliveries" ADD CONSTRAINT "channel_message_deliveries_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_message_deliveries" ADD CONSTRAINT "channel_message_deliveries_message_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_message_deliveries" ADD CONSTRAINT "channel_message_deliveries_installation_org_fk" FOREIGN KEY ("organization_id","installation_id") REFERENCES "public"."channel_installations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
