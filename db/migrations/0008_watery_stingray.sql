ALTER TABLE "ai_generations" DROP CONSTRAINT IF EXISTS "ai_generations_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_generations" DROP CONSTRAINT IF EXISTS "ai_generations_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_suggestions" DROP CONSTRAINT IF EXISTS "ai_suggestions_generation_id_ai_generations_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_suggestions" DROP CONSTRAINT IF EXISTS "ai_suggestions_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_suggestions" DROP CONSTRAINT IF EXISTS "ai_suggestions_customer_id_customers_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_org_id_unique" ON "conversations" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_generations_org_id_unique" ON "ai_generations" USING btree ("organization_id","id");
--> statement-breakpoint
-- customers_org_id_unique already exists from Phase 4
ALTER TABLE "ai_generations" DROP CONSTRAINT IF EXISTS "ai_generations_conversation_org_fk";
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_generations" DROP CONSTRAINT IF EXISTS "ai_generations_customer_org_fk";
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_customer_org_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_suggestions" DROP CONSTRAINT IF EXISTS "ai_suggestions_generation_org_fk";
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_generation_org_fk" FOREIGN KEY ("organization_id","generation_id") REFERENCES "public"."ai_generations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_suggestions" DROP CONSTRAINT IF EXISTS "ai_suggestions_conversation_org_fk";
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_suggestions" DROP CONSTRAINT IF EXISTS "ai_suggestions_customer_org_fk";
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_customer_org_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE cascade ON UPDATE no action;
