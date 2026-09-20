CREATE TYPE "public"."ai_generation_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ai_generation_type" AS ENUM('CONVERSATION_SUMMARY', 'CUSTOMER_SUMMARY', 'SUGGESTED_REPLY', 'INTENT_CLASSIFICATION', 'SENTIMENT_ANALYSIS', 'PRIORITY_SIGNAL', 'FACT_EXTRACTION', 'INTERNAL_NOTE_SUGGESTION');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_membership_id" uuid,
	"conversation_id" uuid,
	"customer_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"generation_type" "ai_generation_type" NOT NULL,
	"status" "ai_generation_status" DEFAULT 'PENDING' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer,
	"error_code" text,
	"error_message" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"generation_id" uuid NOT NULL,
	"conversation_id" uuid,
	"customer_id" uuid,
	"suggestion_type" "ai_generation_type" NOT NULL,
	"status" "ai_suggestion_status" DEFAULT 'PENDING' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_membership_id" uuid
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_actor_membership_id_memberships_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_resolved_by_membership_id_memberships_id_fk" FOREIGN KEY ("resolved_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_organization_id_idx" ON "ai_generations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_generations_conversation_id_idx" ON "ai_generations" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_generations_customer_id_idx" ON "ai_generations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ai_generations_type_idx" ON "ai_generations" USING btree ("generation_type");--> statement-breakpoint
CREATE INDEX "ai_generations_created_at_idx" ON "ai_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_suggestions_organization_id_idx" ON "ai_suggestions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_conversation_id_idx" ON "ai_suggestions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_status_idx" ON "ai_suggestions" USING btree ("status");