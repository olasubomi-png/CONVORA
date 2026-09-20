ALTER TABLE "conversation_assignment_history" DROP CONSTRAINT IF EXISTS "cah_actor_membership_org_fk";
--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" DROP CONSTRAINT IF EXISTS "cah_previous_membership_org_fk";
--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" DROP CONSTRAINT IF EXISTS "cah_new_membership_org_fk";
--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "cah_actor_membership_org_fk" FOREIGN KEY ("organization_id","actor_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "cah_previous_membership_org_fk" FOREIGN KEY ("organization_id","previous_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "cah_new_membership_org_fk" FOREIGN KEY ("organization_id","new_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;
