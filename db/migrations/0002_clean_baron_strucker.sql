CREATE TYPE "public"."conversation_channel" AS ENUM('WEB', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'SMS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."conversation_priority" AS ENUM('NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('OPEN', 'PENDING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."message_sender_type" AS ENUM('MEMBERSHIP', 'CUSTOMER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('CUSTOMER', 'AGENT');--> statement-breakpoint
CREATE TABLE "conversation_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"membership_id" uuid,
	"customer_id" uuid,
	"role" "participant_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "conversation_participants_identity_check" CHECK (("conversation_participants"."membership_id" IS NOT NULL AND "conversation_participants"."customer_id" IS NULL) OR ("conversation_participants"."membership_id" IS NULL AND "conversation_participants"."customer_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "conversation_read_state" (
	"conversation_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_read_state_conversation_id_membership_id_pk" PRIMARY KEY("conversation_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_tag_links" (
	"conversation_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_tag_links_conversation_id_tag_id_pk" PRIMARY KEY("conversation_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"subject" text,
	"status" "conversation_status" DEFAULT 'OPEN' NOT NULL,
	"priority" "conversation_priority" DEFAULT 'NORMAL' NOT NULL,
	"channel" "conversation_channel" DEFAULT 'WEB' NOT NULL,
	"assigned_to_membership_id" uuid,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"phone" text,
	"avatar_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" "message_sender_type" NOT NULL,
	"sender_membership_id" uuid,
	"sender_customer_id" uuid,
	"body" text NOT NULL,
	"message_type" "message_type" DEFAULT 'TEXT' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "messages_sender_identity_check" CHECK ((
        ("messages"."sender_type" = 'MEMBERSHIP' AND "messages"."sender_membership_id" IS NOT NULL) OR
        ("messages"."sender_type" = 'CUSTOMER' AND "messages"."sender_customer_id" IS NOT NULL) OR
        ("messages"."sender_type" = 'SYSTEM' AND "messages"."sender_membership_id" IS NULL AND "messages"."sender_customer_id" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_assigned_by_membership_id_memberships_id_fk" FOREIGN KEY ("assigned_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_tag_id_conversation_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."conversation_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_membership_id_memberships_id_fk" FOREIGN KEY ("assigned_to_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_membership_id_memberships_id_fk" FOREIGN KEY ("sender_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_customer_id_customers_id_fk" FOREIGN KEY ("sender_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_assignments_conversation_id_idx" ON "conversation_assignments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_assignments_membership_id_idx" ON "conversation_assignments" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "conversation_notes_conversation_id_idx" ON "conversation_notes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_id_idx" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_membership_unique" ON "conversation_participants" USING btree ("conversation_id","membership_id") WHERE "conversation_participants"."membership_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_customer_unique" ON "conversation_participants" USING btree ("conversation_id","customer_id") WHERE "conversation_participants"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_tag_links_tag_id_idx" ON "conversation_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_tags_org_slug_unique" ON "conversation_tags" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "conversation_tags_organization_id_idx" ON "conversation_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversations_organization_id_idx" ON "conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversations_org_status_idx" ON "conversations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "conversations_org_last_message_idx" ON "conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_customer_id_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conversations_assigned_membership_idx" ON "conversations" USING btree ("assigned_to_membership_id");--> statement-breakpoint
CREATE INDEX "customers_organization_id_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customers_org_email_idx" ON "customers" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");