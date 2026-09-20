ALTER TABLE "conversation_assignment_history" DROP CONSTRAINT IF EXISTS "cah_conversation_org_fk";
--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "cah_conversation_org_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;
